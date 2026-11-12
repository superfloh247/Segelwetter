// Segelwetter – Land/Wasser-Klassifikation (land.js) + marine-Unterdrückung
//
// Teste das Land-Flag (LAND/SEA/UNKNOWN) für eine Reihe von Geopunkten und
// die daraus folgende Unterdrückung von Wellen-, Wasser­temperatur- und
// Gezeiten-Zeilen.
// Läuft komplett offline: fetch wird durch eine Stub ersetzt, die die
// per Hand gegen is-on-water.balbona.me abgefragten Referenzwerte repliziert.

const assert = require('node:assert');
const { fetchLandInfo, LAND_API_URL, landCacheKey } = require('../land.js');

// ---------- Referenzen aus tmp/probe-land-water.js (echte API-Antworten) ----------
// Punkt: [name, lat, lng, erwartetes Feature]
const REFERENCE = [
    // Land-Punkte (Wellen sollen unterdrückt werden)
    ['RERIK (inland)', 54.4333, 13.9, 'LAND'],
    ['KIEL', 54.32, 10.13, 'LAND'],
    ['HAMBURG', 53.55, 9.99, 'LAND'],
    ['ROSTOCK', 54.08, 12.14, 'LAND'],
    ['MUEGGELSEE (tiefes Binnenland)', 52.49, 13.61, 'LAND'],
    // Marine-Punkte (Wellen dürfen behalten werden)
    ['CUHAVEN HAFEN', 53.667, 8.65, 'OCEAN'],
    ['ELBE-MUNDBUNG', 53.5, 8.0, 'OCEAN'],
    ['OZEANISCHE SEE', 50.0, 5.0, 'OCEAN'],
    // Unklar -> Fail-open (Werte behalten, keine Unterdrückung)
    ['NORDSEE OFFSHORE', 55.0, 3.0, 'UNKNOWN']
];

function stubFetch(featureByLatLng) {
    const calls = [];
    return {
        calls,
        fn: async (url) => {
            calls.push(url);
            const match = String(url).match(/obf\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
            const key = `${match ? match[1] : '?'},${match ? match[2] : '?'}`;
            const feature = featureByLatLng[key] || 'UNKNOWN';
            return {
                ok: true,
                status: 200,
                json: async () => ({ isWater: feature !== 'LAND', feature })
            };
        }
    };
}

function suppressLikeApi(landInfo, apiValue) {
    // Exakt die Logik aus api.js buildHourlyForecastFromOpenMeteo():
    //   !suppressMarine && value != null ? Number(value) : null
    const suppressMarine = !!(landInfo && landInfo.isLand);
    return !suppressMarine && apiValue != null ? Number(apiValue) : null;
}

function tideGateLikeApi(landInfo, extremes) {
    // Exakt die Logik aus api.js loadWeatherForCoords():
    //   tideSuppressed -> [] (UI versteckt die Zeile), sonst Extrema
    const tideSuppressed = !!(landInfo && landInfo.isLand);
    return tideSuppressed ? [] : (extremes || []);
}

// ---------- Tests ----------
const failures = [];
let passed = 0;
function check(label, fn) {
    try {
        fn();
        passed += 1;
        console.log('ok    ' + label);
    } catch (error) {
        failures.push(label + ': ' + error.message);
        console.error('FAIL  ' + label + ' – ' + error.message);
    }
}

function buildFeatureMap() {
    const map = {};
    for (const [, lat, lng, feature] of REFERENCE) {
        map[`${lat},${lng}`] = feature;
    }
    return map;
}

(async function main() {
    const featureMap = buildFeatureMap();
    const NOW = 1700000000000;

    // ---------- A) API-URL und Cache-Key ----------
    check('LAND-001 URL-Format', () => {
        assert.strictEqual(LAND_API_URL(54.4333, 13.9), 'https://is-on-water.balbona.me/obf/54.4333/13.9');
    });
    check('LAND-002 Cache-Key rundet auf ~1,1 km ab', () => {
        assert.strictEqual(landCacheKey(54.4333, 13.9), landCacheKey(54.4334, 13.9001));
        assert.notStrictEqual(landCacheKey(54.4333, 13.9), landCacheKey(54.5, 14.0));
    });

    // ---------- B) Feature-Klassifikation + Fail-open ----------
    const results = {};
    for (const [name, lat, lng, expectedFeature] of REFERENCE) {
        const { fn } = stubFetch(featureMap);
        const info = await fetchLandInfo(lat, lng, { fetchImpl: fn, now: NOW });
        results[lat + ',' + lng] = info;
        check(`LAND-1xx ${name} liefert Feature=${expectedFeature}`, () => {
            assert.strictEqual(info.feature, expectedFeature,
                `hatte ${info && info.feature}`);
            assert.strictEqual(info.isLand, expectedFeature === 'LAND');
            assert.strictEqual(info.cached, false);
        });
    }

    // ---------- B2) Fail-open ----------
    const netErr = await fetchLandInfo(54.4333, 13.9, {
        fetchImpl: async () => { throw new Error('offline'); },
        now: NOW
    });
    check('LAND-200 Netzwerkfehler -> null (fail-open)', () => {
        assert.strictEqual(netErr, null);
    });
    const httpErr = await fetchLandInfo(54.4333, 13.9, {
        fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
        now: NOW
    });
    check('LAND-201 HTTP 500 -> null (fail-open)', () => {
        assert.strictEqual(httpErr, null);
    });
    const noNet = stubFetch(featureMap);
    const badCoords = await fetchLandInfo(NaN, 13.9, { fetchImpl: noNet.fn, now: NOW });
    check('LAND-202 ungültige Koordinaten -> null ohne Fetch', () => {
        assert.strictEqual(badCoords, null);
        assert.strictEqual(noNet.calls.length, 0);
    });
    // ---------- C) Wellen-Unterdrückung (Kern des Bugs) ----------
    check('SUP-001 RERIK: LAND unterdrückt Wellenhöhe', () => {
        const info = results['54.4333,13.9'];
        assert.strictEqual(suppressLikeApi(info, 0.42), null);
    });
    check('SUP-002 RERIK: LAND unterdrückt Wasser­temperatur', () => {
        const info = results['54.4333,13.9'];
        assert.strictEqual(suppressLikeApi(info, 9.5), null);
    });
    // Hafen/Stadt-Land-Punkte: LAND -> Wellen unterdrückt
    check('SUP-003 KIEL (Land-Küstenstadt): Wellen unterdrückt', () => {
        const info = results['54.32,10.13'];
        assert.strictEqual(suppressLikeApi(info, 1.2), null);
    });
    // Gezeiten-Unterdrückung (gleiche Land-Logik, api.js tideSuppressed)
    check('SUP-101 RERIK: LAND unterdrückt Gezeiten', () => {
        const info = results['54.4333,13.9'];
        assert.deepStrictEqual(tideGateLikeApi(info, [{ high: true }]), []);
    });
    check('SUP-102 CUHAVEN HAFEN (OCEAN): Gezeiten bleiben', () => {
        const info = results['53.667,8.65'];
        const fake = [{ high: true, level: 3.1 }];
        assert.deepStrictEqual(tideGateLikeApi(info, fake), fake);
    });
    check('SUP-103 API-Fehler (null/UNKNOWN): Gezeiten bleiben (fail-open)', () => {
        const fake = [{ high: true, level: 3.1 }];
        assert.deepStrictEqual(tideGateLikeApi(null, fake), fake);
        assert.deepStrictEqual(tideGateLikeApi({ feature: 'UNKNOWN', isLand: false }, fake), fake);
    });
    check('SUP-004 CUHAVEN HAFEN (OCEAN): Wellen bleiben', () => {
        const info = results['53.667,8.65'];
        assert.strictEqual(suppressLikeApi(info, 0.8), 0.8);
    });
    check('SUP-005 OZEANISCHE SEE (OCEAN): Wasser­temperatur bleibt', () => {
        const info = results['50.0,5.0'];
        assert.strictEqual(suppressLikeApi(info, 12.3), 12.3);
    });
    check('SUP-006 NORDSEE (UNKNOWN): Wellen bleiben (kein falscher Suppress)', () => {
        const info = results['55.0,3.0'];
        assert.strictEqual(suppressLikeApi(info, 2.5), 2.5);
    });
    check('SUP-007 API-Fehler (null): Wellen bleiben', () => {
        assert.strictEqual(suppressLikeApi(null, 1.7), 1.7);
        assert.strictEqual(suppressLikeApi({ feature: 'UNKNOWN', isLand: false }, 1.7), 1.7);
    });

    // ---------- D) Cache (stub Storage) ----------
    const store = {};
    store.getItem = (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null);
    store.setItem = (k, v) => { store[k] = String(v); };
    const { fn: cacheFn, calls } = stubFetch(featureMap);
    const firstHit = await fetchLandInfo(53.667, 8.65, { fetchImpl: cacheFn, now: NOW, storage: store });
    const secondHit = await fetchLandInfo(53.667, 8.65, { fetchImpl: cacheFn, now: NOW + 1000, storage: store });
    check('LAND-300 Cache-Treffer: zweiter Aufruf ohne Fetch', () => {
        assert.strictEqual(firstHit.cached, false);
        assert.strictEqual(secondHit.cached, true);
        assert.strictEqual(secondHit.feature, firstHit.feature);
        assert.strictEqual(calls.length, 1, 'Cache sollte zweiten Fetch verhindern');
    });
    const staleHit = await fetchLandInfo(53.667, 8.65, {
        fetchImpl: cacheFn,
        now: NOW + 31 * 24 * 60 * 60 * 1000,
        storage: store
    });
    check('LAND-301 Veralteter Cache (>30 Tage) wird neu geholt', () => {
        assert.strictEqual(staleHit.cached, false);
        assert.strictEqual(calls.length, 2);
    });

    // ---------- Ergebnis ----------
    console.log('\n' + passed + ' bestanden, ' + failures.length + ' fehlgeschlagen');
    if (failures.length > 0) {
        console.error('Fehlgeschlagene Tests: ' + failures.join(', '));
        process.exit(1);
    }
})().catch(err => { console.error(err); process.exit(1); });