// Segelwetter – EOT20 Tide-Daten-Loader (EOT-006)
// Lädt die EOT20-Fliesen (data/eot20/) gezielt für die aktuelle Position,
// verifiziert SHA-256-Prüfsummen und legt Fliesen in IndexedDB als
// versionsbasierten Cache ab. Die Vorhersage-Logik (EOT-007) baut auf
// diesem Loader auf.

const EOT = {
    index: null,              // geladener eot20-index.json
    dataVersion: null,
    formatVersion: null,
    constituents: null,       // Konstituenten-Namen (Position = Slot in den Fliesen)
    tileRecords: null,        // Map id -> Index-Record
    db: null,                 // geöffnetes IndexedDB (null = Cache nicht verfügbar)
    dbPromise: null,
    rawCache: new Map(),      // cacheKey -> ArrayBuffer (LRU)
    decodedCache: new Map(),  // cacheKey -> dekodiertes Fliesen-Objekt (LRU)
    tilePromises: new Map(),  // cacheKey -> laufender loadTile-Request (Dedup)
    indexPromise: null,
    MAX_RAW_CACHE: 16,
    MAX_DECODED_CACHE: 8,
    INDEX_URL: 'data/eot20/eot20-index.json',
    TILE_URL_PREFIX: 'data/eot20/'
};

const EOT_DB_NAME = 'eot20';
const EOT_DB_VERSION = 2;      // v1 = unversendetes Draft-Layout -> beim Upgrade leeren
const EOT_META_KEY = 'meta';
const EOT_FETCH_TIMEOUT_MS = 20000;
const EOT_HEADER_SIZE = 47;    // magic(4) fmt(u16) data(u32) const(u8) nlat(u16) nlon(u16) 4x f64
const EOT_SUPPORTED_FORMAT_VERSION = 1;

// ---------- IndexedDB-Helper (fehlerisolierend: Cache-Defekte brechen die App nicht) ----------

function idbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbWrite(db, storeName, op, arg) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName)[op](arg);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function openEotDB() {
    if (EOT.dbPromise) return EOT.dbPromise;
    EOT.dbPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') { resolve(null); return; }
        let req;
        try {
            req = indexedDB.open(EOT_DB_NAME, EOT_DB_VERSION);
        } catch (err) {
            console.warn('EOT20: IndexedDB-Öffnen fehlgeschlagen, ohne Tile-Cache weiter', err);
            resolve(null);
            return;
        }
        req.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles', { keyPath: 'key' });
            if (event.oldVersion < EOT_DB_VERSION) {
                // Legacy-Layout (Draft ohne vollständige Verifikation): flächenleeren
                event.target.transaction.objectStore('tiles').clear();
            }
        };
        req.onsuccess = (event) => { EOT.db = event.target.result; resolve(EOT.db); };
        req.onerror = () => { console.warn('EOT20: IndexedDB-Fehler, ohne Tile-Cache weiter', req.error); resolve(null); };
        req.onblocked = () => { console.warn('EOT20: IndexedDB-Open blockiert, ohne Tile-Cache weiter'); resolve(null); };
    });
    return EOT.dbPromise;
}

// Bei Dataset-Wechsel (dataVersion/formatVersion) alte Fliesen entsorgen,
// damit der Cache nur jemals eine Dataset-Version enthält.
async function cleanStaleCache() {
    if (!EOT.db) return;
    try {
        const meta = await idbGet(EOT.db, 'meta', EOT_META_KEY);
        if (!meta || meta.dataVersion !== EOT.dataVersion || meta.formatVersion !== EOT.formatVersion) {
            await idbWrite(EOT.db, 'tiles', 'clear');
            await idbWrite(EOT.db, 'meta', 'put', {
                key: EOT_META_KEY,
                dataVersion: EOT.dataVersion,
                formatVersion: EOT.formatVersion,
                updatedAt: Date.now()
            });
        }
    } catch (err) {
        console.warn('EOT20: Cache-Aufräumen fehlgeschlagen', err);
    }
}

// ---------- Fetch & Prüfsummen ----------

async function eotFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EOT_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function sha256Supported() {
    return typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function';
}

async function sha256Hex(buf) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Index ----------

function validateIndex(idx) {
    if (!idx || typeof idx !== 'object') throw new Error('EOT20: Index ungültig');
    if (idx.formatVersion !== EOT_SUPPORTED_FORMAT_VERSION) {
        throw new Error('EOT20: unbekanntes Format ' + idx.formatVersion);
    }
    if (typeof idx.dataVersion !== 'number') throw new Error('EOT20: Index ohne dataVersion');
    if (!Array.isArray(idx.constituents) || idx.constituents.length === 0) throw new Error('EOT20: Index ohne Konstituenten');
    if (!Array.isArray(idx.tiles) || idx.tiles.length === 0) throw new Error('EOT20: Index ohne Fliesen');
    for (const rec of idx.tiles) {
        if (!rec.id || !rec.file || !rec.sha256 || typeof rec.size !== 'number') {
            throw new Error('EOT20: kaputter Index-Record ' + (rec.id || '?'));
        }
    }
}

async function ensureIndex() {
    if (EOT.index) return EOT.index;
    if (!EOT.indexPromise) {
        EOT.indexPromise = (async () => {
            const res = await eotFetch(EOT.INDEX_URL);
            if (!res.ok) throw new Error('EOT20: Index-Request fehlgeschlagen (HTTP ' + res.status + ')');
            const idx = await res.json();
            validateIndex(idx);
            EOT.index = idx;
            EOT.dataVersion = idx.dataVersion;
            EOT.formatVersion = idx.formatVersion;
            EOT.constituents = idx.constituents;
            EOT.tileRecords = new Map(idx.tiles.map(rec => [rec.id, rec]));
            await openEotDB();
            await cleanStaleCache();
            return idx;
        })().catch((err) => {
            EOT.indexPromise = null; // Fehler klebt nicht permanent -> Retry möglich
            throw err;
        });
    }
    return EOT.indexPromise;
}

// ---------- LRU-In-Memory-Cache ----------

function lruSet(map, max, key, value) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > max) map.delete(map.keys().next().value);
}

function lruGet(map, key) {
    if (!map.has(key)) return undefined;
    const value = map.get(key);
    map.delete(key);
    map.set(key, value); // Zugriffsreihenfolge aktualisieren
    return value;
}

// ---------- Fliesen-Beschaffung ----------

async function fetchTileBuffer(rec) {
    const key = EOT.dataVersion + ':' + rec.id;
    const raw = lruGet(EOT.rawCache, key);
    if (raw) return raw;

    // 1) IndexedDB – nur Einträge übernehmen, die verifiziert zum Index passen
    if (EOT.db) {
        try {
            const cached = await idbGet(EOT.db, 'tiles', key);
            if (cached && cached.buffer && cached.buffer.byteLength === rec.size) {
                let usable = false;
                if (sha256Supported()) {
                    // Tatsächliche Prüfsumme des gecachten Buffers (erkennt defekten Speicher)
                    usable = (await sha256Hex(cached.buffer)) === rec.sha256;
                } else if (cached.sha256 === rec.sha256) {
                    usable = true; // SubtleCrypto fehlt: nur gespeichertes Hash-Feld vergleichen
                }
                if (usable) {
                    lruSet(EOT.rawCache, EOT.MAX_RAW_CACHE, key, cached.buffer);
                    return cached.buffer;
                }
                await idbWrite(EOT.db, 'tiles', 'delete', key); // beschädigt -> neu laden
            } else if (cached) {
                await idbWrite(EOT.db, 'tiles', 'delete', key);
            }
        } catch (err) {
            console.warn('EOT20: Cache-Lesezugriff fehlgeschlagen für ' + rec.id, err);
        }
    }

    // 2) Netzwerk
    const res = await eotFetch(EOT.TILE_URL_PREFIX + rec.file);
    if (!res.ok) throw new Error('EOT20: Fliesen-Request fehlgeschlagen ' + rec.id + ' (HTTP ' + res.status + ')');
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== rec.size) throw new Error('EOT20: Größen-Mismatch bei ' + rec.id);

    let verified = false;
    if (sha256Supported()) {
        const sha = await sha256Hex(buf);
        if (sha !== rec.sha256) throw new Error('EOT20: Prüfsummen-Mismatch bei ' + rec.id);
        verified = true;
    }

    if (EOT.db) {
        try {
            // Nur verifizierte Daten in den Cache legen; ungeprüfte Einträge
            // (z. B. lokal ohne SubtleCrypto) werden beim nächsten Start neu geladen.
            await idbWrite(EOT.db, 'tiles', 'put', {
                key,
                sha256: verified ? rec.sha256 : null,
                buffer: buf,
                cachedAt: Date.now()
            });
        } catch (err) {
            console.warn('EOT20: Cache-Schreibzugriff fehlgeschlagen für ' + rec.id, err);
        }
    }
    lruSet(EOT.rawCache, EOT.MAX_RAW_CACHE, key, buf);
    return buf;
}

// ---------- Dekodierung ----------

// Kopiert die Bytefolge in einen neu ausgerichteten Puffer: Der Datenstart
// (47 + Maskenlänge) ist nicht immer 4-Byte-aligned (z. B. 40x41-Kanten-
// fliesen), direkte TypedArray-Views würden hier eine RangeError werfen.
function eotFloat32At(u8, offset, count) {
    const copy = u8.slice(offset, offset + 4 * count);
    return new Float32Array(copy.buffer, copy.byteOffset, count);
}

function decodeTile(buffer) {
    const u8 = new Uint8Array(buffer);
    if (u8.length < EOT_HEADER_SIZE) throw new Error('EOT20: Fliese zu klein');
    const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (magic !== 'EOT2') throw new Error('EOT20: ungültiges Magic-Header ' + magic);
    const dv = new DataView(buffer);
    const formatVersion = dv.getUint16(4, true);
    const dataVersion = dv.getUint32(6, true);
    const nConst = dv.getUint8(10);
    const nLat = dv.getUint16(11, true);
    const nLon = dv.getUint16(13, true);
    const lat0 = dv.getFloat64(15, true);
    const latStep = dv.getFloat64(23, true);
    const lon0 = dv.getFloat64(31, true);
    const lonStep = dv.getFloat64(39, true);
    if (formatVersion !== EOT_SUPPORTED_FORMAT_VERSION) {
        throw new Error('EOT20: Fliese mit unbekanntem Format ' + formatVersion);
    }
    const n = nLat * nLon;
    const expectedSize = EOT_HEADER_SIZE + n + 8 * n * nConst;
    if (u8.length !== expectedSize) {
        throw new Error('EOT20: Fliesengröße ' + u8.length + ' != erwartet ' + expectedSize);
    }
    const mask = u8.subarray(EOT_HEADER_SIZE, EOT_HEADER_SIZE + n);
    const amps = {};
    const phases = {};
    let off = EOT_HEADER_SIZE + n;
    for (let c = 0; c < nConst; c++) {
        const name = (EOT.constituents && c < EOT.constituents.length) ? EOT.constituents[c] : 'c' + c;
        amps[name] = eotFloat32At(u8, off, n);
        off += 4 * n;
        phases[name] = eotFloat32At(u8, off, n);
        off += 4 * n;
    }
    return { formatVersion, dataVersion, nConst, nLat, nLon, lat0, latStep, lon0, lonStep, mask, amps, phases };
}

// ---------- Öffentliche API ----------

function eotRecordById(id) {
    const rec = EOT.tileRecords && EOT.tileRecords.get(id);
    if (!rec) throw new Error('EOT20: unbekannte Fliese ' + id);
    return rec;
}

async function loadTile(rec) {
    await ensureIndex();
    if (typeof rec === 'string') rec = eotRecordById(rec);
    const key = EOT.dataVersion + ':' + rec.id;
    const decoded = lruGet(EOT.decodedCache, key);
    if (decoded) return decoded;
    if (!EOT.tilePromises.has(key)) {
        const p = (async () => {
            const buf = await fetchTileBuffer(rec);
            return decodeTile(buf);
        })();
        EOT.tilePromises.set(key, p.finally(() => EOT.tilePromises.delete(key)));
    }
    const tile = await EOT.tilePromises.get(key);
    lruSet(EOT.decodedCache, EOT.MAX_DECODED_CACHE, key, tile);
    return tile;
}

function normalizeEotLon(lon) {
    return ((Number(lon) % 360) + 360) % 360;
}

// Index-Records, die den Punkt (mit 0.25° Puffer) abdecken – datengrenzen-korrekt
// (App-Längengrade −180..180, Index 0..360, Antipoden-Umlauf bei 180°).
// Liefert Index-Records, keine dekodierten Fliesen (siehe loadTilesForLocation).
function discoverTileRecords(lat, lon) {
    if (!EOT.index) return [];
    const clat = Math.max(-90, Math.min(90, Number(lat)));
    const clon = normalizeEotLon(lon);
    const pad = 0.25;
    const lo = clon - pad;
    const hi = clon + pad;
    return EOT.index.tiles.filter(t => {
        if (clat < t.latMin - 1e-9 || clat > t.latMax + 1e-9) return false;
        for (let k = -1; k <= 1; k++) {
            if (lo + 360 * k <= t.lonMax && hi + 360 * k >= t.lonMin) return true;
        }
        return false;
    });
}

async function loadTilesForLocation(lat, lon) {
    await ensureIndex();
    const recs = discoverTileRecords(lat, lon);
    return Promise.all(recs.map(rec => loadTile(rec)));
}

// Konstituenten-Amplituden/-Phasen am exakten Gitterpunkt (für EOT-007).
// Gibt null zurück, wenn der Punkt Land (Maske 0) oder ohne Fliesen ist.
function constituentsAt(lat, lon, tiles) {
    if (!tiles || tiles.length === 0) return null;
    const clat = Math.max(-90, Math.min(90, Number(lat)));
    const clon = normalizeEotLon(lon);
    let tile = null;
    for (const t of tiles) {
        const latMax = t.lat0 + t.latStep * (t.nLat - 1);
        const lonMax = t.lon0 + t.lonStep * (t.nLon - 1);
        if (clat >= t.lat0 - 1e-9 && clat <= latMax + 1e-9 &&
            clon >= t.lon0 - 1e-9 && clon <= lonMax + 1e-9) {
            tile = t;
            break;
        }
    }
    if (!tile) tile = tiles[0];
    const i = Math.max(0, Math.min(tile.nLat - 1, Math.round((clat - tile.lat0) / tile.latStep)));
    const j = Math.max(0, Math.min(tile.nLon - 1, Math.round((clon - tile.lon0) / tile.lonStep)));
    const idx = i * tile.nLon + j;
    if (tile.mask[idx] === 0) return null;
    const amps = {};
    const phases = {};
    const names = tile.amps ? Object.keys(tile.amps) : [];
    for (const name of names) {
        amps[name] = tile.amps[name][idx];
        phases[name] = tile.phases[name][idx];
    }
    return { amps, phases, tile };
}

// Fire-and-forget-Vorladen für die aktuelle Position. Verschluckt eigene
// Fehler (nur Warnlog), damit die App-Interaktivität nie blockiert wird.
function preloadTideTiles(lat, lon) {
    return loadTilesForLocation(lat, lon).catch(err => {
        console.warn('EOT20: Vorladen der Gezeiten-Fliesen fehlgeschlagen für', lat, lon, err);
    });
}

// Test-/Dev-Hilfe: gesamten In-Memory-Zustand zurücksetzen (DB bleibt).
function resetEOT() {
    EOT.index = null;
    EOT.dataVersion = null;
    EOT.formatVersion = null;
    EOT.constituents = null;
    EOT.tileRecords = null;
    EOT.rawCache.clear();
    EOT.decodedCache.clear();
    EOT.tilePromises.clear();
    EOT.indexPromise = null;
    EOT.dbPromise = null;
    EOT.db = null;
}
