'use strict';
// EOT20-Loader-Tests (tides.js)
// Läuft unter Node ohne externe Abhängigkeiten:
//  - IndexedDB wird durch eine In-Memory-Instanz emuliert (persistiert pro Test-Umgebung,
//    simuliert dadurch "neue Browser-Sitzung mit gleichem Cache")
//  - fetch liefert Dateien aus data/eot20/ von der Platte und zählt Requests/Bytes
//  - tides.js läuft in einer vm-Isolierung (klassische Skript-Semantik wie im Browser)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'data/eot20/eot20-index.json';

// ---------- Emulationen ----------

function createIDBEnvironment() {
    const databases = new Map(); // name -> { version, stores: Map<store, Map<key,value>> }
    function makeRequest(run) {
        const req = { result: undefined, error: undefined, onsuccess: null, onerror: null, oncomplete: null };
        queueMicrotask(() => {
            try {
                req.result = run();
                if (req.onsuccess) req.onsuccess({ target: req });
                if (req.oncomplete) req.oncomplete({ target: req });
            } catch (err) {
                req.error = err;
                if (req.onerror) req.onerror({ target: req });
            }
        });
        return req;
    }
    function makeDB(entry) {
        return {
            objectStoreNames: { contains: (s) => entry.stores.has(s) },
            createObjectStore: (s, opts) => { if (!entry.stores.has(s)) entry.stores.set(s, { keyPath: opts && opts.keyPath, data: new Map() }); },
            transaction: () => ({
                objectStore: (s) => {
                    let st = entry.stores.get(s);
                    if (!st) { st = { keyPath: null, data: new Map() }; entry.stores.set(s, st); }
                    const get = (k) => makeRequest(() => st.data.get(k));
                    const put = (v) => makeRequest(() => { st.data.set(st.keyPath ? v[st.keyPath] : v.key, v); });
                    return {
                        get,
                        put,
                        delete: (k) => makeRequest(() => { st.data.delete(k); }),
                        clear: () => makeRequest(() => { st.data.clear(); })
                    };
                }
            })
        };
    }
    const indexedDB = {
        open(name, version) {
            let entry = databases.get(name);
            const oldVersion = entry ? entry.version : 0;
            if (!entry) { entry = { version: 0, stores: new Map() }; databases.set(name, entry); }
            entry.version = version;
            const req = { result: undefined, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
            const db = makeDB(entry);
            queueMicrotask(() => {
                req.result = db;
                if (oldVersion < version && req.onupgradeneeded) {
                    req.onupgradeneeded({ target: { result: db, transaction: db.transaction() }, oldVersion });
                }
                if (req.onsuccess) req.onsuccess({ target: { result: db } });
            });
            return req;
        }
    };
    return { indexedDB, databases };
}

function makeFetchEnvironment() {
    const log = { urls: [], tileUrls: new Set(), bytes: 0 };
    const opts = { corruptNetwork: new Set(), fail: new Set() };
    async function fetchImpl(url) {
        log.urls.push(url);
        if (!url.startsWith('data/eot20/')) throw new Error('Unerwarteter Fetch: ' + url);
        const file = path.join(ROOT, url);
        if (opts.fail.has(url)) return { ok: false, status: 503 };
        if (!fs.existsSync(file)) return { ok: false, status: 404 };
        let buf = fs.readFileSync(file);
        if (opts.corruptNetwork.has(url)) { buf = Buffer.from(buf); buf[buf.length - 1] ^= 0xFF; }
        log.bytes += buf.length;
        if (!url.endsWith('.json')) log.tileUrls.add(url);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
        return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(buf.toString('utf8')),
            arrayBuffer: async () => ab
        };
    }
    return { fetch: fetchImpl, log, opts };
}

const EXPORTED_FUNCTIONS = [
    'ensureIndex', 'loadTile', 'loadTilesForLocation', 'discoverTileRecords',
    'constituentsAt', 'preloadTideTiles', 'decodeTile', 'normalizeEotLon', 'resetEOT',
    'eotElevationMs', 'predictTideExtremes',
    'surroundingGridPoints', 'averagedConstituentsInNeighborhood'
];

function loadModule(env) {
    const sandbox = {
        console,
        crypto,
        AbortController,
        setTimeout,
        clearTimeout,
        Map,
        Promise,
        Error,
        fetch: env.fetch
    };
    if (env.indexedDB) sandbox.indexedDB = env.indexedDB;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'tides.js'), 'utf8'), sandbox, { filename: 'tides.js' });
    const mod = { sandbox };
    mod.EOT = () => vm.runInContext('EOT', sandbox);
    for (const fn of EXPORTED_FUNCTIONS) {
        mod[fn] = (...args) => vm.runInContext(fn, sandbox)(...args);
    }
    return mod;
}

// ---------- Test-Harness ----------

let passed = 0;
const failures = [];
async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log('ok    ' + name);
    } catch (err) {
        failures.push(name);
        console.error('FAIL  ' + name);
        console.error(err && err.stack ? err.stack : String(err));
    }
}

const SOMA_BAY = { lat: 27.677, lon: 33.875 };   // offizielles EOT20-Beispiel
const CUXHAVEN = { lat: 53.375, lon: 8.5 };       // nächster Wasser-Gitterpunkt (Ort liegt an der Küste)
const FLEESENSEE = { lat: 53.9037, lon: 13.3585 }; // Inlandssee (Mecklenburgische Seenplatte) ohne Ozeangezeiten (Maske: Land)
const SOMA_GRID = { lat: 27.625, lon: 33.875 };   // nächster Gitterpunkt zu Soma Bay (pyTMD-Referenzpunkt)
// Offener Gitterpunkt in der äußeren Nordsee vor Cuxhaven (~55 km nördlich des Hafens) –
// der offene Wasserteil, der dem Hafen-Gezeitenpegel am nächsten kommt; zugleich
// pyTMD-Referenzpunkt von Test 15. (CUXHAVEN selbst = 53.375N 8.5E liegt an der
// Elbe-Mündung, wo Estuar-Verzerrungen die Zeiten verschieben.)
const CUX_GRID = { lat: 53.875, lon: 8.75 };

// GEO-001: Realwelt-Referenzpunkte mit erwartetem Wasser-Klass (LAND / MARINE)
// und EOT20-Masken-Zustand am nächsten 0.125°-Gitterpunkt (Recon 2026-11-07,
// data/eot20 Snapshot v1). mask 1 = direkter Wasser-Gitterpunkt; mask 0 mit
// Wasser in der 3x3-Umgebung -> 8er-Nachbarschafts-Fallback (Esquinzo, Salzhaff);
// mask 0 ohne Wasser in 3x3 -> reine Landklasse (beiden Seen).
const GEO_POINTS = [
    { id: 'MUEGGELSEE', lat: 52.443354, lon: 13.675345, klass: 'LAND',
      desc: 'Müggelsee, Berlin – Binnensee, keine Wellenhöhe, keine Gezeiten',
      mask: 0, waterIn3x3: 0 },
    { id: 'FLEESENSEE', lat: 53.495414, lon: 12.494845, klass: 'LAND',
      desc: 'Fleesensee, Mecklenburg – Binnensee, keine Wellenhöhe, keine Gezeiten',
      mask: 0, waterIn3x3: 0 },
    { id: 'SOMABAY', lat: 26.846495, lon: 33.984253, klass: 'MARINE',
      desc: 'Soma Bay, Ägypten – Rotes Meer, Wellenhöhe und Gezeiten',
      mask: 1, waterIn3x3: 6 },
    { id: 'LAPARED', lat: 28.210940, lon: -14.228325, klass: 'MARINE',
      desc: 'La Pared, Fuerteventura – Atlantik Küste, Wellenhöhe und Gezeiten',
      mask: 1, waterIn3x3: 6 },
    { id: 'ESQUINZO', lat: 28.073934, lon: -14.299414, klass: 'MARINE',
      desc: 'Esquinzo Playa, Fuerteventura – ~140 m vor der Atlantik-Küste (Land, Küstenzone): Gezeiten per 8er-Fallback',
      mask: 0, waterIn3x3: 7 },
    { id: 'SALZHAFF', lat: 54.036086, lon: 11.574569, klass: 'MARINE',
      desc: 'Salzhaff bei San Pepelone, Vorpommern – Ostsee-Bucht, Wellenhöhe und Gezeiten (per 8er-Fallback)',
      mask: 0, waterIn3x3: 2 }
];

// ---------- Tests ----------

(async () => {
    // 1) Index-Laden + Dekodierung an echten Fliesen
    {
        const env = { indexedDB: createIDBEnvironment().indexedDB, fetch: makeFetchEnvironment().fetch };
        const mod = loadModule(env);
        await test('Index lädt und validiert (2048 Fliesen, 17 Konstituenten)', async () => {
            const idx = await mod.ensureIndex();
            assert.strictEqual(idx.formatVersion, 1);
            assert.strictEqual(idx.dataVersion, 1);
            assert.strictEqual(idx.tiles.length, 2048);
            assert.strictEqual(idx.constituents.length, 17);
        });
        await test('Soma Bay: Fliesen werden entnommen, dekodiert und verifiziert', async () => {
            const tiles = await mod.loadTilesForLocation(SOMA_BAY.lat, SOMA_BAY.lon);
            assert.strictEqual(tiles.length, 1, 'Punkt liegt zentral in einer 5°-Fliese');
            for (const t of tiles) {
                assert.strictEqual(t.formatVersion, 1);
                assert.strictEqual(t.nLat, 40);
                assert.strictEqual(t.nLon, 40);
                assert.strictEqual(t.mask.length, 1600);
            }
            const cons = mod.constituentsAt(SOMA_BAY.lat, SOMA_BAY.lon, tiles);
            assert.ok(cons, 'Punkt muss über Wasser sein');
            const m2 = cons.amps.M2;
            assert.ok(Number.isFinite(m2) && m2 > 0, 'M2-Amplitude plausibel');
            assert.ok(Number.isFinite(cons.phases.M2), 'M2-Phase plausibel');
        });
        await test('Cuxhaven (Küste): Wasser-Punkt geladen, Küstenpunkt liefert null', async () => {
            const tiles = await mod.loadTilesForLocation(CUXHAVEN.lat, CUXHAVEN.lon);
            assert.strictEqual(tiles.length, 1);
            const cons = mod.constituentsAt(CUXHAVEN.lat, CUXHAVEN.lon, tiles);
            assert.ok(cons && Number.isFinite(cons.amps.M2));
            // Der exakte Stadt-Gridpunkt liegt an der Landkante (Maske 0)
            const shore = mod.constituentsAt(53.34, 8.63, tiles);
            assert.strictEqual(shore, null, 'Küstenpunkt (Maske 0) -> null');
        });
    }

    // 2) Cache-Roundtrip: Sitzung 1 füllt, Sitzung 2 (gleiche IDB, frisches In-Memory)
    {
        const idbEnv = createIDBEnvironment();
        const fetch1 = makeFetchEnvironment();
        const session1 = loadModule({ indexedDB: idbEnv.indexedDB, fetch: fetch1.fetch });
        await test('Sitzung 1: Netzladepfad verifiziert und cachebt Fliese', async () => {
            await session1.ensureIndex();
            const rec = session1.EOT().tileRecords.get('tile_0001_0031');
            const before = fetch1.log.tileUrls.size;
            await session1.loadTile(rec);
            const after = fetch1.log.tileUrls.size;
            assert.strictEqual(after - before, 1, 'genau 1 Tile-Request');
            const store = idbEnv.databases.get('eot20').stores.get('tiles');
            assert.ok(store.data.has('1:tile_0001_0031'), 'Cache-Eintrag vorhanden');
            assert.strictEqual(store.data.get('1:tile_0001_0031').sha256, rec.sha256, 'Prüfsumme gespeichert');
            const meta = idbEnv.databases.get('eot20').stores.get('meta').data.get('meta');
            assert.strictEqual(meta.dataVersion, 1);
        });
        await test('Sitzung 2: Cacheschlag ohne Netz-Tile-Request', async () => {
            const fetch2 = makeFetchEnvironment();
            const session2 = loadModule({ indexedDB: idbEnv.indexedDB, fetch: fetch2.fetch });
            await session2.ensureIndex();
            const rec = session2.EOT().tileRecords.get('tile_0001_0031');
            await session2.loadTile(rec);
            assert.strictEqual(fetch2.log.tileUrls.size, 0, 'kein Tile über das Netz');
            const tile = await session2.loadTile(rec);
            assert.ok(tile.mask.length > 0);
        });
    }
    // 3) Beschädigter Cachesatz -> Regeneration
    await test('Korrupter Cache-Eintrag wird verworfen und neu geladen', async () => {
        const idbEnv = createIDBEnvironment();
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: idbEnv.indexedDB, fetch: fetchEnv.fetch });
        const rec = (await mod.ensureIndex()).tiles[0];
        const url = 'data/eot20/' + rec.file;
        const store = idbEnv.databases.get('eot20').stores.get('tiles');
        const real = fs.readFileSync(path.join(ROOT, url));
        const corrupted = Buffer.from(real); corrupted[100] ^= 0xFF;
        store.data.set('1:' + rec.id, { key: '1:' + rec.id, sha256: rec.sha256, buffer: corrupted.buffer.slice(corrupted.byteOffset, corrupted.byteOffset + corrupted.length), cachedAt: 0 });
        const tile = await mod.loadTile(rec);
        assert.ok(tile && tile.nLat === 40, 'Tile wurde korrekt neu geladen');
        assert.strictEqual(fetchEnv.log.tileUrls.has(url), true, 'Neu-Download stattfand');
        const reloaded = store.data.get('1:' + rec.id);
        assert.strictEqual(Buffer.compare(Buffer.from(reloaded.buffer), real), 0, 'Cache enthält wieder exakte Originaldaten');
    });

    // 4) Prüfsummen-Mismatch im Netz (beschädigte Übertragung) -> Fehler, kein Cache
    await test('Netz-Prüfsummen-Mismatch wirft Fehler und cachebt nichts', async () => {
        const idbEnv = createIDBEnvironment();
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: idbEnv.indexedDB, fetch: fetchEnv.fetch });
        const rec = (await mod.ensureIndex()).tiles[1];
        fetchEnv.opts.corruptNetwork.add('data/eot20/' + rec.file);
        let threw = false;
        try { await mod.loadTile(rec); } catch (err) { threw = true; assert.ok(/Prüfsummen-Mismatch/.test(err.message)); }
        assert.ok(threw, 'Fehler erwartet');
        const store = idbEnv.databases.get('eot20').stores.get('tiles');
        assert.strictEqual(store.data.has('1:' + rec.id), false, 'beschädigte Daten nicht gecacht');
    });

    // 5) Version-Invalidation: Dataset-Wechsel leert alte Fliesen
    await test('Dataset-Wechsel (dataVersion 1->2) räumt alten Cache auf', async () => {
        const idbEnv = createIDBEnvironment();
        const mod = loadModule({ indexedDB: idbEnv.indexedDB, fetch: makeFetchEnvironment().fetch });
        const rec = (await mod.ensureIndex()).tiles[0];
        await mod.loadTile(rec);
        const store = idbEnv.databases.get('eot20').stores.get('tiles');
        assert.ok(store.data.has('1:' + rec.id));
        const fakeFetch = async (url) => {
            if (url.endsWith('.json')) {
                const idx = JSON.parse(fs.readFileSync(path.join(ROOT, INDEX_URL), 'utf8'));
                idx.dataVersion = 2;
                return { ok: true, status: 200, json: async () => idx, arrayBuffer: async () => { throw new Error('n/a'); } };
            }
            return makeFetchEnvironment().fetch(url);
        };
        const mod2 = loadModule({ indexedDB: idbEnv.indexedDB, fetch: fakeFetch });
        await mod2.ensureIndex();
        const meta = idbEnv.databases.get('eot20').stores.get('meta').data.get('meta');
        assert.strictEqual(meta.dataVersion, 2, 'Meta aktualisiert');
        assert.strictEqual(store.data.has('1:' + rec.id), false, 'alter Eintrag geleert');
    });

    // 6) Deduplizierung paralleler Ladeanfragen
    await test('Parallele loadTile-Anfragen werden dedupliziert', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const rec = (await mod.ensureIndex()).tiles[2];
        const [a, b] = await Promise.all([mod.loadTile(rec), mod.loadTile(rec)]);
        assert.strictEqual(fetchEnv.log.tileUrls.size, 1, 'nur 1 Netzwerk-Request');
        assert.strictEqual(a, b, 'identisches Dekodierobjekt');
    });
    // 7) Fliesensuche: Datumslinie, Rand, negativer Längengrad
    await test('tilesForLocation behandelt Datumslinie und −180..180', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const a = mod.discoverTileRecords(10, 179.9).map(t => t.id).sort();
        const b = mod.discoverTileRecords(10, -179.9).map(t => t.id).sort();
        assert.deepStrictEqual(a, b, 'Symmetrie um 180°');
        assert.ok(a.length > 0, 'Antipoden liefert Fliesen');
        assert.ok(mod.discoverTileRecords(0, -180).length > 0, '−180 == 180');
        assert.strictEqual(mod.discoverTileRecords(89.9, 10).length, 2, '89.9°N liegt in der letzten Reihe (85..90)');
        assert.strictEqual(mod.discoverTileRecords(CUXHAVEN.lat, CUXHAVEN.lon).length, 1);
    });

    // 8) Land-Maske: Punkt über Land liefert null
    await test('constituentsAt über Land liefert null (Maske 0)', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const idx = await mod.ensureIndex();
        // Landpunkt finden: Fliese über Mitteleuropa mit >40% Landanteil
        let found = null;
        for (const rec of idx.tiles) {
            if (rec.latMin < 45 || rec.latMin > 55) continue;
            if (rec.lonMin < 10 || rec.lonMin > 15) continue;
            const tile = await mod.loadTile(rec);
            let land = 0;
            for (let i = 0; i < tile.mask.length; i++) if (tile.mask[i] === 0) land++;
            if (land / tile.mask.length > 0.4) {
                // Landzelle mit allen 4 Nachbarzellen auch Land finden (kein NaN-Randeffekt)
                outer:
                for (let ii = 1; ii < tile.nLat - 1; ii++) {
                    for (let jj = 1; jj < tile.nLon - 1; jj++) {
                        const m = ii * tile.nLon + jj;
                        if (tile.mask[m] === 0 &&
                            tile.mask[m - 1] === 0 && tile.mask[m + 1] === 0 &&
                            tile.mask[m - tile.nLon] === 0 && tile.mask[m + tile.nLon] === 0) {
                            found = { lat: tile.lat0 + tile.latStep * ii, lon: tile.lon0 + tile.lonStep * jj };
                            break outer;
                        }
                    }
                }
                if (found) break;
            }
        }
        assert.ok(found, 'Landpunkt gefunden');
        const tiles = await mod.loadTilesForLocation(found.lat, found.lon);
        assert.strictEqual(mod.constituentsAt(found.lat, found.lon, tiles), null);
    });

    // 9) Dekodier-Korrektheit vs. Quell-NetCDF (unabhängige Referenz)
    await test('Dekodierung entspricht EOT20-Quelldaten (27.625N 33.875E)', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const idx = await mod.ensureIndex();
        const rec = idx.tiles.find(t => t.latMin <= 27.625 && t.latMax >= 27.625 && t.lonMin <= 33.875 && t.lonMax >= 33.875);
        assert.ok(rec, 'Referenzfliese gefunden: ' + (rec && rec.id));
        const tile = await mod.loadTile(rec);
        const i = Math.round((27.625 - tile.lat0) / tile.latStep);
        const j = Math.round((33.875 - tile.lon0) / tile.lonStep);
        const pos = i * tile.nLon + j;
        assert.strictEqual(tile.mask[pos], 1, 'Referenzpunkt ist Wasser');
        // Exakte float32-Referenzwerte aus den EOT20-Quell-NetCDFs (global idx 941,271)
        const ref = {
            M2: [23.799579620361328, 116.79852294921875],
            S2: [6.06976842880249, 148.3187713623047],
            K1: [0.8899093270301819, -148.79336547851562],
            '2N2': [1.4808483123779297, 35.199981689453125]
        };
        for (const name of Object.keys(ref)) {
            assert.strictEqual(tile.amps[name][pos], ref[name][0], name + ' Amplitude');
            assert.strictEqual(tile.phases[name][pos], ref[name][1], name + ' Phase');
        }
        assert.strictEqual(Object.keys(tile.amps).length, 17);
    });

    // 10) Ausrichtungs-Regression: Fliesen mit ungerader Punktzahl (47+N nicht 4-aligned)
    await test('Dekodierung ungerader Fliesen (40x41) wirft keine RangeError', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const idx = await mod.ensureIndex();
        const edge = idx.tiles.find(t => t.size === 224727);
        assert.ok(edge, 'Kantenfliese gefunden');
        const tile = await mod.loadTile(edge);
        assert.strictEqual(tile.nLat * tile.nLon, 40 * 41);
        assert.strictEqual(tile.mask.length, 1640);
    });
    // 11) Vollständige Integritätsprüfung aller 2048 Fliesen
    await test('Integritäts-Scan: alle 2048 Fliesen SHA-256 + Dekodierung', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const idx = await mod.ensureIndex();
        let ok = 0;
        for (const rec of idx.tiles) {
            const tile = await mod.loadTile(rec);
            assert.strictEqual(tile.nConst, 17);
            ok++;
        }
        assert.strictEqual(ok, 2048);
        assert.strictEqual(fetchEnv.log.tileUrls.size, 2048, 'jede Fliese genau 1x geladen');
        console.log('      (alle 2048 Fliesen dekodiert, Prüfsummen ok)');
    });

    // 12) Nicht-blockierendes Vorladen
    await test('preloadTideTiles blockiert nicht und isoliert Fehler', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        // Fire-and-forget: Während des Ladens bleibt der Event-Loop reaktionsfähig
        const p = mod.preloadTideTiles(SOMA_BAY.lat, SOMA_BAY.lon);
        let tick = 0;
        await new Promise(resolve => {
            const iv = setInterval(() => { tick++; if (tick >= 10) { clearInterval(iv); resolve(); } }, 1);
        });
        assert.ok(tick >= 10, 'Event-Loop lief weiter (10 Ticks während des Ladens)');
        await p;
        assert.strictEqual(fetchEnv.log.tileUrls.size, 1, '1 Fliese geladen');
        const p2 = mod.preloadTideTiles(123, 456); // außerhalb der Daten: keine Exception
        await p2;
    });

    // 13) Fehlender Index -> saubere Fehlermeldung, Retry möglich
    await test('Fehlender Index (404) wird als Fehler gemeldet, Retry möglich', async () => {
        const fetchEnv = makeFetchEnvironment();
        fetchEnv.opts.fail.add(INDEX_URL);
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        let threw = false;
        try { await mod.ensureIndex(); } catch (err) { threw = true; assert.ok(/Index-Request/.test(err.message)); }
        assert.ok(threw);
        fetchEnv.opts.fail.delete(INDEX_URL);
        const idx = await mod.ensureIndex(); // Retry nach Fehler
        assert.strictEqual(idx.tiles.length, 2048);
    });

    // 14) Keine IndexedDB -> Loader läuft weiter (nur Netz)
    await test('Ohne IndexedDB lädt der Loader ausschließlich aus dem Netz', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        const rec = (await mod.ensureIndex()).tiles[3];
        const tile = await mod.loadTile(rec);
        assert.ok(tile.nLat > 0);
        assert.strictEqual(fetchEnv.log.tileUrls.size, 1);
    });

    // Helper: validiert die lokale Konstituenten-Summe an einem Gridpunkt gegen eine
    // pyTMD-Referenz-Datei (corrections='FES'). Liefert {hMax,gMax,uMax,fMax} oder
    // {skipped:true}, wenn die Referenz fehlt, bzw. {error}, wenn kein Wasserpunkt.
    async function validateAgainstPytmd(mod, refPath, refPoint) {
        if (!fs.existsSync(refPath)) return { skipped: true };
        const tiles = await mod.loadTilesForLocation(refPoint.lat, refPoint.lon);
        const cons = mod.constituentsAt(refPoint.lat, refPoint.lon, tiles);
        if (!cons || !Number.isFinite(cons.amps.M2)) return { error: 'Kein Wasserpunkt verfügbar' };
        const amps = {};
        for (const name in cons.amps) amps[name] = cons.amps[name] / 100; // cm -> m
        const phases = cons.phases;
        const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
        const mjd0 = ref.mjd0, dmjd = ref.dmjd, N = ref.n;
        const consNames = (await mod.ensureIndex()).constituents; // Referenz-Ordnung = Index-Ordnung
        const wrapDeg = d => ((d % 360) + 540) % 360 - 180;
        let hMax = 0;
        for (let it = 0; it < N; it++) {
            const ms = (mjd0 + it * dmjd - 40587) * 86400000;
            hMax = Math.max(hMax, Math.abs(mod.eotElevationMs(ms, amps, phases) - ref.h[it]));
        }
        const times = [0, 10, 100, 200, 400, 719];
        let gMax = 0, uMax = 0, fMax = 0;
        for (const it of times) {
            const ms = (mjd0 + it * dmjd - 40587) * 86400000;
            const args = vm.runInContext('eotArgsMs', mod.sandbox)(ms);
            for (let c = 0; c < ref.G[it].length; c++) {
                const a = args[consNames[c]];
                gMax = Math.max(gMax, Math.abs(wrapDeg(a.G) - wrapDeg(ref.G[it][c])));
                uMax = Math.max(uMax, Math.abs(wrapDeg(a.u * 180 / Math.PI) - wrapDeg(ref.u[it][c])));
                fMax = Math.max(fMax, Math.abs(a.f - ref.f[it][c]));
            }
        }
        return { hMax, gMax, uMax, fMax };
    }

    // 15) EOT-007: Vorhersage gegen pyTMD-Referenz (FES-Korrekturen) validiert.
    //     Referenz tmp/eot007-ref.json wurde mit pyTMD (corrections='FES') erzeugt.
    //     h = Gesamthöhe (m), G/u in Grad, f dimensionslos. G/u auf [-180,180] gewickelt.
    await test('EOT-007: Höhe + G/u/f matchen pyTMD-Referenz (h<1mm, G/u<1°, f<1e-4)', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        // Referenz-Fliesenpunkt (53.875, 8.75) – identisch zur pyTMD-Erzeugung
        const r = await validateAgainstPytmd(mod, path.join(ROOT, 'tmp', 'eot007-ref.json'), CUX_GRID);
        if (r.skipped) { console.log('      (Referenz fehlt – Test übersprungen)'); return; }
        assert.ok(r.hMax < 0.001, `h max err ${r.hMax.toExponential(3)} m < 1 mm`);
        assert.ok(r.gMax < 1, `G max err ${r.gMax.toFixed(5)}° < 1°`);
        assert.ok(r.uMax < 1, `u max err ${r.uMax.toFixed(5)}° < 1°`);
        assert.ok(r.fMax < 1e-4, `f max err ${r.fMax.toExponential(3)} < 1e-4`);
        console.log(`      (h err ${r.hMax.toExponential(2)} m, G ${r.gMax.toFixed(5)}°, u ${r.uMax.toFixed(5)}°, f ${r.fMax.toExponential(2)})`);
    });

    // 16) predictTideExtremes: liefert geordnete HW/NW-Liste mit Plausibilität.
    await test('predictTideExtremes: HW/NW-Extreme mit plausiblen Werten', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const startMs = Date.now();
        const endMs = startMs + 24 * 3600000;
        const extremes = await mod.predictTideExtremes(CUXHAVEN.lat, CUXHAVEN.lon, startMs, endMs,
            { formatTime: ts => '12:00', formatDate: ts => 'Mo 01.11.' });
        assert.ok(Array.isArray(extremes) && extremes.length >= 3, `min. 3 Extreme in 24 h (hatte ${extremes && extremes.length})`);
        for (const e of extremes) {
            assert.ok(Number.isFinite(e.timestamp) && e.timestamp >= startMs && e.timestamp <= endMs, 'Timestamp im Fenster');
            assert.ok(typeof e.high === 'boolean', 'high ist boolean');
            assert.ok(Number.isFinite(e.level), 'level ist Zahl');
            assert.strictEqual(e.timeText, '12:00', 'timeText gerendert');
            assert.strictEqual(e.timeTextDate, 'Mo 01.11.', 'timeTextDate gerendert');
        }
        for (let k = 1; k < extremes.length; k++) {
            assert.notStrictEqual(extremes[k].high, extremes[k - 1].high, 'HW/NW wechseln sich ab');
        }
        const levels = extremes.map(e => e.level);
        const spread = Math.max(...levels) - Math.min(...levels);
        assert.ok(spread > 0.5, `Gezeitenhub > 0,5 m (hatte ${spread.toFixed(2)} m)`);
    });

    // 17) EOT-008: Zweiter Referenzort – Soma Bay (Rotes Meer). pyTMD-Referenz
    //     tmp/eot008-ref-soma.json (Gitterpunkt 27.625N 33.875E, corrections='FES').
    //     Bestätigt, dass der exakte pyTMD-Match aus Test 15 kein Cuxhaven-Artefakt ist.
    await test('EOT-008: Soma Bay matcht pyTMD-Referenz (h<1mm, G/u<1°, f<1e-4)', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const r = await validateAgainstPytmd(mod, path.join(ROOT, 'tmp', 'eot008-ref-soma.json'), SOMA_GRID);
        if (r.skipped) { console.log('      (Referenz fehlt – Test übersprungen)'); return; }
        assert.ok(!r.error, r.error);
        assert.ok(r.hMax < 0.001, `h max err ${r.hMax.toExponential(3)} m < 1 mm`);
        assert.ok(r.gMax < 1, `G max err ${r.gMax.toFixed(5)}° < 1°`);
        assert.ok(r.uMax < 1, `u max err ${r.uMax.toFixed(5)}° < 1°`);
        assert.ok(r.fMax < 1e-4, `f max err ${r.fMax.toExponential(3)} < 1e-4`);
        console.log(`      (h err ${r.hMax.toExponential(2)} m, G ${r.gMax.toFixed(5)}°, u ${r.uMax.toFixed(5)}°, f ${r.fMax.toExponential(2)})`);
    });

    // 18) EOT-008: No-Data – Fleesensee (Inlandssee) hat keinen Gezeiten-Datensatz
    //     am Gitterpunkt, und auch die 8 umliegenden Gitterboxen sind Land
    //     (3x3-Kern ohne Wasser) -> Nachbar-Mittel liefert null, kein Crash.
    await test('EOT-008: Fleesensee (Inlandssee) liefert null statt Gezeiten', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const tiles = await mod.loadTilesForLocation(FLEESENSEE.lat, FLEESENSEE.lon);
        const cons = mod.constituentsAt(FLEESENSEE.lat, FLEESENSEE.lon, tiles);
        assert.strictEqual(cons, null, 'Maske: Fleesensee-Gitterpunkt ist Land/invalid');
        const avg = mod.averagedConstituentsInNeighborhood(FLEESENSEE.lat, FLEESENSEE.lon, tiles);
        assert.strictEqual(avg, null, 'Nachbar-Mittel: 3x3-Umfeld komplett Land -> null');
        const ext = await mod.predictTideExtremes(FLEESENSEE.lat, FLEESENSEE.lon, Date.now(), Date.now() + 86400000);
        assert.strictEqual(ext, null, 'predictTideExtremes: kein Muster -> null');
    });
    // 18b) Nachbar-Mittel: Land-Gitterpunkt mit Wasser-Nachbarn (Küste) – das
    //      Mittel über die 8 umliegenden Gitterboxen liefert Gezeiten-Daten.
    //      Referenz: Küsten-Gitterpunkt 52.375N 5.25E (Land, 3 Wasser-Nachbarn,
    //      im Tile 50..55N 5..10E). Binnenland 51.0N 10.5E bleibt null.
    await test('Nachbar-Mittel: Küsten-Landpunkt mit Wasser-Nachbarn liefert Extreme, Binnenland null', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const coast = { lat: 52.375, lon: 5.25 };
        const tiles = await mod.loadTilesForLocation(coast.lat, coast.lon);
        assert.strictEqual(mod.constituentsAt(coast.lat, coast.lon, tiles), null, 'Center-Punkt ist Land (Maske 0)');
        const avg = mod.averagedConstituentsInNeighborhood(coast.lat, coast.lon, tiles);
        assert.ok(avg, 'Nachbar-Mittel liefert Daten');
        assert.ok(avg.count >= 1 && avg.count <= 8, `Wasser-Punkte im 3x3-Umfeld (hatte ${avg && avg.count})`);
        assert.ok(Number.isFinite(avg.amps.M2) && avg.amps.M2 > 0, 'M2-Amplitude plausibel');
        assert.ok(Object.keys(avg.amps).length === 17, 'alle 17 Konstituenten gemittelt');
        const ext = await mod.predictTideExtremes(coast.lat, coast.lon, Date.now(), Date.now() + 86400000);
        assert.ok(Array.isArray(ext) && ext.length >= 3, `Nachbar-Mittel liefert Extreme (hatte ${ext && ext.length})`);
        // Offener Ozean (Wasser am Center) nutzt keine Nachbarschaft; Binnenland -> null.
        const ocean = await mod.predictTideExtremes(54.5, 1.0, Date.now(), Date.now() + 86400000);
        assert.ok(Array.isArray(ocean) && ocean.length >= 3, 'Offener Ozean liefert Extreme');
        const inland = await mod.predictTideExtremes(51.0, 10.5, Date.now(), Date.now() + 86400000);
        assert.strictEqual(inland, null, 'Binnenland -> null');
    });
    // 18c) surroundingGridPoints: 8 Punkte, Center ausgeschlossen, Ränder sauber.
    await test('surroundingGridPoints liefert 8 Punkte ohne Center und respektiert Ränder', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const pts = mod.surroundingGridPoints(53.9, 13.35);
        assert.strictEqual(pts.length, 8, 'genau 8 Umgebungs-Punkte');
        const step = 0.125;
        const ic = Math.round((53.9 + 90) / step);
        const jc = Math.round(13.35 / step);
        let centerSeen = false;
        for (const p of pts) {
            const pi = Math.round((p.lat + 90) / step);
            const pj = Math.round(p.lon / step);
            if (pi === ic && pj === jc) centerSeen = true;
            assert.ok(Math.abs(pi - ic) <= 1 && Math.abs(pj - jc) <= 1, 'Punkt liegt im 3x3-Umfeld');
        }
        assert.ok(!centerSeen, 'Center-Punkt ist ausgeschlossen');
        // Polrand: bei 90°N gibt es keine Zeile darüber – weniger als 8 Punkte.
        const polar = mod.surroundingGridPoints(89.99, 10);
        assert.ok(polar.length < 8, 'Polrand liefert weniger Punkte');
    });
    await test('EOT-008: Küsten-/Land-Punkt ohne Fliese liefert null (kein Crash)', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        // Offener Ozean mitten im Nordmeer (Wasser) liefert Extreme; ein Land-Punkt im
        // deutschen Binnenland (ohne abgedeckte Fliese) liefert sauber null.
        const ocean = await mod.predictTideExtremes(54.5, 1.0, Date.now(), Date.now() + 86400000);
        assert.ok(Array.isArray(ocean) && ocean.length >= 3, 'Offener Ozean liefert Extreme');
        const inland = await mod.predictTideExtremes(51.0, 10.5, Date.now(), Date.now() + 86400000);
        assert.strictEqual(inland, null, 'Land-Punkt -> null');
    });

    // 19) EOT-008: Realworld-Zeitvergleich Cuxhaven gegen tide-table.org (Station Cuxhaven).
    //     Referenz vom 02.11.2026 (CET): HW 04:14 UTC (3.35 m), NW 11:33 UTC (0.27 m), HW 17:25 UTC (2.97 m).
    //     Verglichen werden die UHRZEITEN am offenen Nordsee-Gitterpunkt CUX_GRID (53.875N 8.75E,
    //     ~55 km nördlich des Hafens, zugleich pyTMD-Referenzpunkt aus Test 15). Höhen sind nicht
    //     vergleichbar (EOT20-Geoid/Hartbahn-Datum vs. Stationsdatum). Geprüfte Abweichungen
    //     (Probe 2026-11-05): HW0 +1.4 min, NW0 -48.9 min, HW1 -28.9 min – das Modell liefert
    //     die äußere Nordsee-Phase; Hafen- und Elbe-Estuar-Verzerrung bleiben als Limitierung.
    await test('EOT-008: Cuxhaven HW-Zeiten liegen ±45 min um tide-table-Referenz', async () => {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const startMs = Date.UTC(2026, 10, 2, 0, 0, 0);
        const endMs = Date.UTC(2026, 10, 2, 23, 59, 59);
        const ext = await mod.predictTideExtremes(CUX_GRID.lat, CUX_GRID.lon, startMs, endMs);
        assert.ok(Array.isArray(ext) && ext.length >= 4, `mind. 4 Extreme in 24 h (hatte ${ext && ext.length})`);
        const highs = ext.filter(e => e.high);
        const lows = ext.filter(e => !e.high);
        assert.ok(highs.length >= 2 && lows.length >= 2, 'mind. 2 HW + 2 NW');
        const hw0 = highs[0], hw1 = highs[1], lw0 = lows[0];
        const refHW0 = Date.UTC(2026, 10, 2, 4, 14);
        const refNW0 = Date.UTC(2026, 10, 2, 11, 33);
        const refHW1 = Date.UTC(2026, 10, 2, 17, 25);
        const dHW0 = (hw0.timestamp - refHW0) / 60000;
        const dNW0 = (lw0.timestamp - refNW0) / 60000;
        const dHW1 = (hw1.timestamp - refHW1) / 60000;
        console.log(`      (HW0 ${dHW0 >= 0 ? '+' : ''}${dHW0.toFixed(1)} min, NW0 ${dNW0 >= 0 ? '+' : ''}${dNW0.toFixed(1)} min, HW1 ${dHW1 >= 0 ? '+' : ''}${dHW1.toFixed(1)} min)`);
        assert.ok(Math.abs(dHW0) <= 45, `HW0-Abweichung ${dHW0.toFixed(1)} min <= 45`);
        assert.ok(Math.abs(dHW1) <= 45, `HW1-Abweichung ${dHW1.toFixed(1)} min <= 45`);
        // NW-Abweichung größer als HW, da die Elbe-Flutwelle den NW im Estuar zeitlich
        // verschiebt; weicher Grenzwert für die offene-See-Nachbildung
        assert.ok(Math.abs(dNW0) <= 90, `NW0-Abweichung ${dNW0.toFixed(1)} min <= 90`);
        // Reihenfolge und halbtaglicher Rhythmus (HW -> NW -> HW)
        assert.ok(hw1.timestamp > hw0.timestamp && lw0.timestamp > hw0.timestamp, 'Reihenfolge HW<NW<HW');
    });

    // GEO-001: Realwelt-Referenzpunkte – Wasser-Klasse (LAND/MARINE) über die
    //     Gezeiten-Pipeline verifiziert. LAND-Punkte (Seen, ohne Ozean-Nachbarschaft
    //     im 3x3-Umfeld) müssen null liefern; MARINE-Punkte müssen Extreme mit
    //     plausibler Spreading liefern. Feste Referenz-Umfrage (kein Date.now()) →
    //     deterministisch. Die Masken-Wasser-Werte (waterIn3x3) werden aus der
    //     dekodierten Fliese erneut berechnet und mit dem in GEO_POINTS festgehaltenen
    //     Recon-Wert abgeglichen – so wird die 8er-Fallback-Logik für Esquinzo/Salzhaff
    //     (mask 0, aber Wasser in der Nachbarschaft) explizit abgesichert.
    {
        const fetchEnv = makeFetchEnvironment();
        const mod = loadModule({ indexedDB: null, fetch: fetchEnv.fetch });
        await mod.ensureIndex();
        const startMs = Date.UTC(2026, 10, 2, 0, 0, 0);
        const endMs = Date.UTC(2026, 10, 2, 23, 59, 59);
        for (const p of GEO_POINTS) {
            const label = p.id + ' (' + p.desc.split('–')[0].trim() + ')';
            await test(`GEO-001 ${p.id}: ${p.klass} → ${p.klass === 'LAND' ? 'null' : 'Gezeiten'}`, async () => {
                // 3x3-Masken-Wasserzählung aus der echten Fliese rekonstruieren
                const tiles = await mod.loadTilesForLocation(p.lat, p.lon);
                const step = 0.125;
                const clat = Math.max(-90, Math.min(90, p.lat));
                const clon = mod.normalizeEotLon(p.lon);
                let water = 0;
                let centerMask = null;
                for (const t of tiles) {
                    const latMax = t.lat0 + t.latStep * (t.nLat - 1);
                    const lonMax = t.lon0 + t.lonStep * (t.nLon - 1);
                    if (!(clat >= t.lat0 - 1e-9 && clat <= latMax + 1e-9 && clon >= t.lon0 - 1e-9 && clon <= lonMax + 1e-9)) continue;
                    const ci = Math.max(0, Math.min(t.nLat - 1, Math.round((clat - t.lat0) / t.latStep)));
                    const cj = Math.max(0, Math.min(t.nLon - 1, Math.round((clon - t.lon0) / t.lonStep)));
                    centerMask = t.mask[ci * t.nLon + cj];
                    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                        const ri = ci + di, col = cj + dj;
                        if (ri < 0 || ri >= t.nLat || col < 0 || col >= t.nLon) continue;
                        if (t.mask[ri * t.nLon + col] === 1) water += 1;
                    }
                }
                assert.strictEqual(centerMask, p.mask, `${label}: Zentrums-Maske ${centerMask} != erwartet ${p.mask}`);
                assert.strictEqual(water, p.waterIn3x3, `${label}: Wasser in 3x3 ${water} != erwartet ${p.waterIn3x3}`);
                // Gezeiten-Verhalten: LAND → null; MARINE → Extreme mit Spreading
                const ext = await mod.predictTideExtremes(p.lat, p.lon, startMs, endMs);
                if (p.klass === 'LAND') {
                    assert.strictEqual(ext, null, `${label}: LAND-Punkt muss null liefern, hatte ${ext && ext.length} Extreme`);
                } else {
                    assert.ok(Array.isArray(ext) && ext.length >= 3, `${label}: MARINE-Punkt liefert Extreme, hatte ${ext && ext.length}`);
                    let lo = Infinity, hi = -Infinity;
                    for (const e of ext) { if (e.level < lo) lo = e.level; if (e.level > hi) hi = e.level; }
                    assert.ok(hi - lo >= 0.03, `${label}: Gezeiten-Spreizung ${ (hi - lo).toFixed(3) } m >= 0.03 m`);
                }
            });
        }
    }

    // ---------- Ergebnis ----------
    console.log('\n' + passed + ' bestanden, ' + failures.length + ' fehlgeschlagen');
    if (failures.length > 0) {
        console.error('Fehlgeschlagene Tests: ' + failures.join(', '));
        process.exit(1);
    }
})().catch(err => { console.error(err); process.exit(1); });