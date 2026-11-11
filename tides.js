// Segelwetter – EOT20 Tide-Daten-Loader
// Lädt die EOT20-Fliesen (data/eot20/) gezielt für die aktuelle Position,
// verifiziert SHA-256-Prüfsummen und legt Fliesen in IndexedDB als
// versionsbasierten Cache ab. Die Gezeiten-Vorhersage baut auf
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
// Der Längengrad-Puffer deckt den 3x3-Fallback-Rand ab (max. 0.125° vom
// Center-Punkt). Der Breitengrad-Puffer zusätzlich: an einer 5°-Fliesen-Ecke
// (Breitengrad = k·5°) ragen die Nachbarpunkte bis 0.25° über die eigene
// Blockkante hinaus und liegen in den benachbarten 5°-Blöcken.
function discoverTileRecords(lat, lon) {
    if (!EOT.index) return [];
    const clat = Math.max(-90, Math.min(90, Number(lat)));
    const clon = normalizeEotLon(lon);
    const pad = 0.25;
    const latPad = 0.25; // 0.25° = 2·0.125°, Fallback-Rand über Fliesen-Ecken
    const lo = clon - pad;
    const hi = clon + pad;
    const seen = new Set();
    const recs = [];
    for (const cl of [clat, clat - latPad, clat + latPad]) {
        for (const t of EOT.index.tiles) {
            if (seen.has(t.id)) continue;
            if (cl < t.latMin - 1e-9 || cl > t.latMax + 1e-9) continue;
            for (let k = -1; k <= 1; k++) {
                if (lo + 360 * k <= t.lonMax && hi + 360 * k >= t.lonMin) {
                    seen.add(t.id);
                    recs.push(t);
                    break;
                }
            }
        }
    }
    return recs;
}

async function loadTilesForLocation(lat, lon) {
    await ensureIndex();
    const recs = discoverTileRecords(lat, lon);
    return Promise.all(recs.map(rec => loadTile(rec)));
}

// Nächster Gitterpunkt einer dekodierten Fliese zu (lat, lon). Randwerte werden
// geclampt, damit Punkte knapp außerhalb der Fliese (Nähe-Prinzip bei Fliesen-
// grenzen) trotzdem auf den nächsten Gitterpunkt zeigen.
function gridPointInTile(t, lat, lon) {
    const clat = Math.max(-90, Math.min(90, lat));
    const clon = normalizeEotLon(lon);
    const latMax = t.lat0 + t.latStep * (t.nLat - 1);
    const lonMax = t.lon0 + t.lonStep * (t.nLon - 1);
    const i = Math.max(0, Math.min(t.nLat - 1, Math.round((clat - t.lat0) / t.latStep)));
    const j = Math.max(0, Math.min(t.nLon - 1, Math.round((clon - t.lon0) / t.lonStep)));
    return { i, j, idx: i * t.nLon + j, lat: t.lat0 + t.latStep * i, lon: t.lon0 + t.lonStep * j };
}

// Konstituenten-Amplituden/-Phasen am exakten Gitterpunkt.
// Gibt null zurück, wenn der Punkt Land (Maske 0) oder ohne Fliesen ist.
function constituentsAt(lat, lon, tiles) {
    if (!tiles || tiles.length === 0) return null;
    let tile = null;
    const clat = Math.max(-90, Math.min(90, lat));
    const clon = normalizeEotLon(lon);
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
    const { idx } = gridPointInTile(tile, lat, lon);
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

// ---------- Nachbarschafts-Fallback (Workaround für fehlende Gezeiten-Daten) ----------
// Ohne Gezeiten-Daten am exakten Gitterpunkt, aber mit See im Umkreis (Wave-
// Height vorhanden): die 8 umliegenden Gitterboxen (3x3-Kern um den
// Center-Punkt) liefern ihre Werte; über alle gefundenen Wasser-Punkte werden
// Amplitude und Phase (Winkel-Mittel über die Sinus-Komponente) gemittelt.

// Die 8 Gitterpunkte im 3x3-Umfeld des nächsten Gitterpunkts zu (lat, lon).
// Der Längengrad-Ring schließt um (Datumsrand: 359.9° → 359.75°, 0° → 359.875°),
// der Breitengrad nicht (Pole). Die Fliesen-Auflösung der Punkte übernimmt
// averagedConstituentsInNeighborhood (die Fliesen müssen geladen sein, s.
// loadTilesForLocation mit 0.25°-Puffer).
function surroundingGridPoints(lat, lon) {
    const step = 0.125; // EOT20-Gitterabstand
    const clat = Math.max(-90, Math.min(90, lat));
    const clon = normalizeEotLon(lon);
    const i = Math.max(0, Math.min(1440, Math.round((clat + 90) / step)));
    const j = Math.max(0, Math.min(2880, Math.round(clon / step)));
    const pts = [];
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            if (ni < 0 || ni > 1440) continue; // Polrand: kein Nachbar
            const nj = ((j + dj) % 2880 + 2880) % 2880; // Ring schließt um
            pts.push({ lat: -90 + step * ni, lon: (step * nj) % 360 });
        }
    }
    return pts;
}

// Konstituenten-Mittel über alle Wasser-Punkte (Maske 1) der Umgebungspunkte.
// Komplexe (Zirkular-)Mittelung der Konstituenten ẑ = A·e^{iφ}:
// Amplitude = |Σ A·e^{iφ}|/n, Phase = arg(Σ A·e^{iφ}) – korrekt bei
// Phasen um 0°/360° UND bei Phasenstreusung (180°-Auslöschung → Amplitude 0,
// wie bei einer echten resultantiven Konstituenten-Summe).
// Gibt null zurück, wenn in der Nachbarschaft kein einziger Wasser-Punkt liegt
// (dann bleibt die Vorhersage null – echtes Binnenland).
function averagedConstituentsInNeighborhood(lat, lon, tiles) {
    const sums = {};   // name -> { s, c, n } (Sinus-/Cosinus-Zusammenfassung von A·e^{iφ})
    let count = 0;
    for (const p of surroundingGridPoints(lat, lon)) {
        let tile = null;
        for (const t of tiles) {
            if (p.lat >= t.lat0 - 1e-9 && p.lat <= t.lat0 + t.latStep * (t.nLat - 1) + 1e-9 &&
                p.lon >= t.lon0 - 1e-9 && p.lon <= t.lon0 + t.lonStep * (t.nLon - 1) + 1e-9) {
                tile = t;
                break;
            }
        }
        if (!tile) continue;
        const { idx } = gridPointInTile(tile, p.lat, p.lon);
        if (tile.mask[idx] === 0) continue; // kein Gezeiten-Datensatz in dieser Box
        count += 1;
        const names = tile.amps ? Object.keys(tile.amps) : [];
        for (const name of names) {
            const a = tile.amps[name][idx];
            const phi = tile.phases[name][idx] * EOT_D2R;
            let s = sums[name];
            if (!s) { s = { s: 0, c: 0, n: 0 }; sums[name] = s; }
            s.s += a * Math.sin(phi);
            s.c += a * Math.cos(phi);
            s.n += 1;
        }
    }
    if (count === 0) return null;
    const amps = {};
    const phases = {};
    for (const name in sums) {
        const s = sums[name];
        // Resultierende Amplitude (Betrag der komplexen Summe), nicht arithmetisches Mittel:
        // zwei gleichstarke, 180° gegenphasige Konstituenten löschen sich auf 0.
        amps[name] = Math.hypot(s.s, s.c) / s.n;
        // Winkel-Mittel: arctan(Σ a·sinφ, Σ a·cosφ) – korrekt bei Phasen um 0°/360°
        phases[name] = Math.atan2(s.s, s.c) / EOT_D2R;
    }
    return { amps, phases, count };
}

// Fire-and-forget-Vorladen für die aktuelle Position. Verschluckt eigene
// Fehler (nur Warnlog), damit die App-Interaktivität nie blockiert wird.
function preloadTideTiles(lat, lon) {
    return loadTilesForLocation(lat, lon).catch(err => {
        console.warn('EOT20: Vorladen der Gezeiten-Fliesen fehlgeschlagen für', lat, lon, err);
    });
}

// ---------- Vorhersage (EOT-007) ----------
// Gezeiten-Höhen aus den dekodierten Konstituenten. Reproduziert die FES/EOT20-
// Konvention exakt (nach pyTMD `arguments` + `nodal_modulation`, corrections='FES'):
//   elevation(t) = Σ_c  f_c(t) · A_c · cos( G_c(t) + u_c(t) − φ_c )
// G_c ist das vollständige Doodson-Argument (Greenwich-Anteil + lokale Zeit),
// f_c/u_c die nodalen Korrekturen, φ_c die in der Fliese gespeicherte Phase (Grad).
// Amplituden A_c in m (Fliese speichert cm → /100).

const EOT_D2R = Math.PI / 180;
const EOT_J2000_MJD = 51544.5;         // MJD von J2000.0 (2000-01-01T12:00, pyTMD _mjd_j2000)
const EOT_UNIX_MJD = 40587;            // MJD des Unix-Epochs (1970-01-01 00:00 UTC)
// MJD (absolute) aus Unix-ms-Zeitstempel.
function eotMjdFromMs(ms) {
    return EOT_UNIX_MJD + ms / 86400000;
}

// Doodson-/Cartwright-Zahlen (tau, s, h, p, n, ps, k=90) je Konstituent.
// Quelle: pyTMD `coefficients_table` (FES-Pfad). k=90 ist die feste Phasenkonstante.
const EOT_DOODSON = {
    '2N2': [2, -2, 0, 2, 0, 0, 0],
    'J1':  [1, 2, 0, -1, 0, 0, 1],
    'K1':  [1, 1, 0, 0, 0, 0, 1],
    'K2':  [2, 2, 0, 0, 0, 0, 0],
    'M2':  [2, 0, 0, 0, 0, 0, 0],
    'M4':  [4, 0, 0, 0, 0, 0, 0],
    'MF':  [0, 2, 0, 0, 0, 0, 0],
    'MM':  [0, 1, 0, -1, 0, 0, 0],
    'N2':  [2, -1, 0, 1, 0, 0, 0],
    'O1':  [1, -1, 0, 0, 0, 0, -1],
    'P1':  [1, 1, -2, 0, 0, 0, -1],
    'Q1':  [1, -2, 0, 1, 0, 0, -1],
    'S1':  [1, 1, -1, 0, 0, 0, 2],
    'S2':  [2, 2, -2, 0, 0, 0, 0],
    'SA':  [0, 0, 1, 0, 0, -1, 0],
    'SSA': [0, 0, 2, 0, 0, 0, 0],
    'T2':  [2, 2, -3, 0, 0, 1, 0]
};

// Mittere Längen (Mond s, Sonne h, Mondperigee p, aufsteigender Knot n,
// Sonnenperigee ps) in Grad. Nach pyTMD `mean_longitudes` method='ASTRO5'
// (Meeus/ASTRO5-Koeffizienten), was der FES-Pfad (corrections='FES') nutzt.
// mjd ist das absolute MJD des Zeitpunkts.
function eotPoly(c, T) {
    // Direkte Potenzreihe Σ c[i]·T^i (pyTMD `polynomial_sum`)
    let sum = 0;
    for (let i = 0; i < c.length; i++) sum += c[i] * Math.pow(T, i);
    return sum;
}
function eotMeanLongitudes(mjd) {
    const T = (mjd - EOT_J2000_MJD) / 36525.0;   // Jahrhunderte seit J2000
    const moon = [218.3164477, 481267.88123421, -1.5786e-3, 1.855835e-6, -1.53388e-8];
    const elong = [297.8501921, 445267.1114034, -1.8819e-3, 1.83195e-6, -8.8445e-9];
    const perigee = [83.3532465, 4069.0137287, -1.032e-2, -1.249172e-5];
    const node = [125.04452, -1934.136261, 2.0708e-3, 2.22222e-6];
    const s = eotPoly(moon, T);                              // Mond
    const h = eotPoly(moon, T) - eotPoly(elong, T);          // Sonne = Mond − Elongation
    const p = eotPoly(perigee, T);                           // Mondperigee
    const n = eotPoly(node, T);                              // Knot
    const ps = 282.94 + 1.7192 * T;                          // Sonnenperigee (Simon 1994)
    const mod360 = x => ((x % 360) + 360) % 360;
    return { s: mod360(s), h: mod360(h), p: mod360(p), n: mod360(n), ps: mod360(ps) };
}

// Schureman-Zusatzwinkel für die FES-nodalen Korrekturen (II, xi, nu, nu', nu'').
// pyTMD `astro.schureman_arguments`; p/n sind Radiant (Mondperigee, Knot).
function eotSchureman(p, n) {
    const ii = Math.acos(0.913694997 - 0.035692561 * Math.cos(n));
    const at1 = Math.atan(1.01883 * Math.tan(n / 2));
    const at2 = Math.atan(0.64412 * Math.tan(n / 2));
    let xi = -at1 - at2 + n;
    xi = Math.atan2(Math.sin(xi), Math.cos(xi));
    const nu = at1 - at2;
    const pPrime = Math.sin(2 * ii) * Math.sin(nu);
    const qPrime = Math.sin(2 * ii) * Math.cos(nu) + 0.3347;
    const nuP = Math.atan(pPrime / qPrime);          // nu' (k1)
    const pSec = (Math.sin(ii) ** 2) * Math.sin(2 * nu);
    const qSec = (Math.sin(ii) ** 2) * Math.cos(2 * nu) + 0.0727;
    const nuS = 0.5 * Math.atan(pSec / qSec);        // nu'' (k2)
    return { ii, xi, nu, nuP, nuS };
}

// Nodale Faktoren f und Winkel u (Radiant) für die 17 EOT20-Konstituenten,
// FES-Konvention (pyTMD `nodal_modulation`, corrections='FES').
function eotNodalFes(name, sch) {
    const { ii, xi, nu, nuP, nuS } = sch;
    const sinII = Math.sin(ii), cosII2h = Math.cos(ii / 2);
    switch (name) {
        case 'M2': case '2N2': case 'N2':
            return { f: (cosII2h ** 4) / 0.9154, u: 2 * xi - 2 * nu };
        case 'M4':
            // Kompositwelle: aus M2 rekursiv (f_M2^2, 2·u_M2)
            return { f: ((cosII2h ** 4) / 0.9154) ** 2, u: 4 * xi - 4 * nu };
        case 'MF':
            return { f: (sinII ** 2) / 0.1578, u: -2 * xi };
        case 'MM':
            return { f: (2 / 3 - sinII * sinII) / 0.5021, u: 0 };
        case 'O1': case 'Q1':
            return { f: sinII * (cosII2h ** 2) / 0.38, u: 2 * xi - nu };
        case 'J1':
            return { f: Math.sin(2 * ii) / 0.7214, u: -nu };
        case 'K1': {
            const a = 0.8965 * (Math.sin(2 * ii) ** 2);
            const b = 0.6001 * Math.sin(2 * ii) * Math.cos(nu);
            return { f: Math.sqrt(a + b + 0.1006), u: -nuP };
        }
        case 'K2': {
            const a = 19.0444 * (sinII ** 4);
            const b = 2.7702 * (sinII ** 2) * Math.cos(2 * nu);
            return { f: Math.sqrt(a + b + 0.0981), u: -2 * nuS };
        }
        default:
            // P1, S1, S2, SA, SSA, T2 → f=1, u=0 (FES: keine nodale Korrektur)
            return { f: 1, u: 0 };
    }
}

// Gezeitenhöhe in Metern zum Zeitpunkt ms (Epoch) am Gitterpunkt {amps, phases}.
// Amps in Metern (cm/100 bereits vorab umgerechnet).
function eotElevationMs(ms, amps, phases) {
    const args = eotArgsMs(ms);
    let h = 0;
    for (const name in EOT_DOODSON) {
        const A = amps[name];
        if (!A) continue;
        const phi = (phases[name] || 0) * EOT_D2R;
        const a = args[name];
        h += a.f * A * Math.cos(a.G * EOT_D2R + a.u - phi);
    }
    return h;
}

// Pro Konstituent: G (Doodson-Argument, Grad), u (nodaler Winkel, Radiant),
// f (nodaler Faktor) zum Zeitpunkt ms. Nur die in EOT_DOODSON enthaltenen Wellen.
function eotArgsMs(ms) {
    const mjd = eotMjdFromMs(ms);
    const ml = eotMeanLongitudes(mjd);
    const hour = (((ms % 86400000) + 86400000) % 86400000) / 3600000;
    const tau = 15 * hour - ml.s + ml.h;                   // mittlere Mondzeit (Grad)
    const N = ml.n * EOT_D2R, P = ml.p * EOT_D2R;
    const sch = eotSchureman(P, N);
    const fargs = [tau, ml.s, ml.h, ml.p, ml.n, ml.ps, 90];
    const out = {};
    for (const name in EOT_DOODSON) {
        const coef = EOT_DOODSON[name];
        let G = 0;
        for (let i = 0; i < 7; i++) G += fargs[i] * coef[i];
        const nodal = eotNodalFes(name, sch);
        out[name] = { G, f: nodal.f, u: nodal.u };
    }
    return out;
}

// Extrema (Hoch-/Niedrigwasser) in [startMs, endMs] am Gitterpunkt.
// Gibt sortiertes Array von { timestamp, high, level } oder null zurück.
// Methodik: grobes Raster (5 min) → lokale Extremum-Erkennung → Feinverfeinerung
// (20 ms) um jedes grobe Extremum. Die Feinverfeinerung genügt, weil die
// Gezeitenkurve um das Extremum lokal annähernd parabolisch verläuft.
function eotFindExtremes(amps, phases, startMs, endMs) {
    const COARSE = 5 * 60000;      // 5 min
    const FINE = 20;               // 20 ms
    const pts = [];
    for (let ms = startMs; ms <= endMs; ms += COARSE) {
        pts.push({ ms, h: eotElevationMs(ms, amps, phases) });
    }
    if (pts.length < 3) return null;
    const ext = [];
    for (let k = 1; k < pts.length - 1; k++) {
        const a = pts[k - 1].h, b = pts[k].h, c = pts[k + 1].h;
        if (b > a && b > c) ext.push({ ms: pts[k].ms, high: true });
        else if (b < a && b < c) ext.push({ ms: pts[k].ms, high: false });
    }
    if (ext.length === 0) return null;
    for (const e of ext) {
        let best = e.ms, bestH = eotElevationMs(e.ms, amps, phases);
        const lo = e.ms - COARSE / 2, hi = e.ms + COARSE / 2;
        for (let ms = lo; ms <= hi; ms += FINE) {
            const h = eotElevationMs(ms, amps, phases);
            if (e.high ? h > bestH : h < bestH) { best = ms; bestH = h; }
        }
        e.timestamp = best;
        e.level = bestH;
    }
    return ext;
}

// Öffentliche Vorhersage: lädt Fliesen, liest die Konstituenten am exakten
// Gitterpunkt, berechnet Hoch-/Niedrigwasser im Fenster [startMs, endMs].
// Workaround: Fehlt Gezeiten-Daten am Gitterpunkt (Land-Maske), aber es liegt
// Wasser in der Nachbarschaft (z. B. Inlandssee), so werden die 8 umliegenden
// Gitterboxen gemittelt (s. averagedConstituentsInNeighborhood).
// Marine-Gate: Der Fallback (8er-Mittelung) greift nur, wenn opts.isMarine
// wahr ist – d. h. Open-Meteo meldet eine valide Wellenhöhe am Ort
// (marines Raster vs. Land). Ohne Gate würden Binnenwasser (Seen) mit
// Ozeangezeiten belegt. Direkte Wasser-Gitterpunkte (Maske 1) bleiben
// ungated – die Küsten-Maske ist grob, echte Küstenorte (z. B. Elbe-Mündung)
// dürfen ihre Gezeiten behalten.
// Gibt null bei echtem Land (kein Marine-Gate / keine Wasser-Nachbarschaft)
// oder ohne Daten (UI zeigt dann keine Gezeitenzeile).
// opts.sourceMetadata: wenn gesetzt, bekommt der Rückgabewert die Form
// [{ extremes, source }], damit der Aufrufer Herkunft kennt
// (source = 'EOT20' | 'EOT20_NEIGHBOR_AVERAGE').
async function predictTideExtremes(lat, lon, startMs, endMs, opts) {
    opts = opts || {};
    try {
        const tiles = await loadTilesForLocation(lat, lon);
        let c = constituentsAt(lat, lon, tiles);
        let source = 'EOT20';
        if (!c || !c.amps || Object.keys(c.amps).length === 0) {
            if (!opts.isMarine) return null; // Land ohne Wellenhöhe → kein Fallback
            c = averagedConstituentsInNeighborhood(lat, lon, tiles);
            if (!c) return null;
            source = 'EOT20_NEIGHBOR_AVERAGE';
        }
        const amps = {};
        for (const name in c.amps) amps[name] = c.amps[name] / 100;  // cm → m
        const phases = c.phases;
        const ext = eotFindExtremes(amps, phases, startMs, endMs);
        if (!ext) return null;
        // Sehr kleine Amplitude (Land/See ohne Gezeiten): alle Extreme fast
        // gleich → kein unterscheidbares Gezeitenmuster → null.
        let lo = Infinity, hi = -Infinity;
        for (const e of ext) { if (e.level < lo) lo = e.level; if (e.level > hi) hi = e.level; }
        if (hi - lo < (opts.minSpread ?? 0.03)) return null;
        // Anzeige-Formatierer liefert der Aufrufer (api.js) mit, damit Uhrzeit/
        // Datum in der lokalen Zeitzone des Ortes und der App-Sprache gerendert
        // werden. Standard: leer (nur Timestamp/level sind informativ).
        const fmtTime = opts.formatTime || (() => '');
        const fmtDate = opts.formatDate || (() => '');
        const mapped = ext.map(e => ({
            timestamp: e.timestamp,
            high: e.high,
            level: e.level,
            timeText: fmtTime(e.timestamp),
            timeTextDate: fmtDate(e.timestamp)
        }));
        if (opts.sourceMetadata) return { extremes: mapped, source };
        return mapped;
    } catch (err) {
        console.warn('EOT20: Gezeiten-Vorhersage fehlgeschlagen für', lat, lon, err);
        return null;
    }
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
