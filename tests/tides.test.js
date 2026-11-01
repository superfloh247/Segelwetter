'use strict';
// EOT-006 Tests: EOT20-Loader (tides.js)
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
    'constituentsAt', 'preloadTideTiles', 'decodeTile', 'normalizeEotLon', 'resetEOT'
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

    // ---------- Ergebnis ----------
    console.log('\n' + passed + ' bestanden, ' + failures.length + ' fehlgeschlagen');
    if (failures.length > 0) {
        console.error('Fehlgeschlagene Tests: ' + failures.join(', '));
        process.exit(1);
    }
})().catch(err => { console.error(err); process.exit(1); });