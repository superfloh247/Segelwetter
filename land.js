// Segelwetter – Land/Wasser-Klassifikation
//
// Frage an https://is-on-water.balbona.me/obf/<lat>/<lng>, ob ein Punkt
// Land ist (Feature 'LAND'). Dient NUR als Unterdrückungsfilter für
// Wellenhöhe/Wellenperiode/Wasser­temperatur: Land-Punkte ohne Küste (z. B.
// Rerik) erhalten vom Open-Meteo-Marinemodell trotzdem Werte, die wir
// ausblenden. Gezeiten werden NICHT gefiltert – EOT20 löst Wasser nur mit
// ~14 km auf, und offene See (Baltikum/Caribik) liefert hier oft
// fälschlich 'LAND'; Gezeitengitter und marine Modelle bleiben daher
// unverändert nutzbar.
//
// Fail-open: Bei Netzwerk- oder API-Fehler liefert die Funktion null,
// d. h. die Werte werden weiterhin angezeigt.

const LAND_API_URL = (lat, lng) => `https://is-on-water.balbona.me/obf/${lat}/${lng}`;
const LAND_CACHE_KEY = 'segelwetter-land';
const LAND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

function readLandCache(store) {
    try {
        const raw = (store && typeof store.getItem === 'function') ? store.getItem(LAND_CACHE_KEY) : null;
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
        return {};
    }
}

function writeLandCache(cache, store) {
    try {
        if (store && typeof store.setItem === 'function') {
            store.setItem(LAND_CACHE_KEY, JSON.stringify(cache));
        }
    } catch (err) {
        // Cache ist optional (Storage voll/blokiert) – bewusst still
    }
}

function landCacheKey(lat, lng) {
    // ~1,1 km Raster, damit kleine Bewegungen derselben Position wiederverwendet werden
    return `${Math.round(lat * 90) / 90},${Math.round(lng * 90) / 90}`;
}

async function fetchLandInfo(lat, lng, { fetchImpl = null, now = null, storage = null } = {}) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const store = storage ||
        ((typeof localStorage !== 'undefined' && localStorage) ? localStorage : null);
    const key = landCacheKey(lat, lng);
    const cache = readLandCache(store);
    const cached = cache[key];
    const ts = now !== null ? Number(now) : Date.now();
    if (cached && typeof cached.feature === 'string' && ts - cached.t < LAND_CACHE_TTL_MS) {
        return { feature: cached.feature, isLand: cached.feature === 'LAND', cached: true };
    }

    const doFetch = fetchImpl || ((url) => fetch(url));
    let response;
    try {
        response = await doFetch(LAND_API_URL(lat, lng));
    } catch (err) {
        console.warn('[Land] Land/Wasser-Abfrage fehlgeschlagen (Werte werden trotzdem angezeigt):', err);
        return null;
    }
    if (!response || response.ok === false) {
        console.warn(`[Land] Land/Wasser-Abfrage nicht erfolgreich (HTTP ${response && response.status}, Werte werden trotzdem angezeigt)`);
        return null;
    }

    let body;
    try {
        body = await response.json();
    } catch (err) {
        console.warn('[Land] Land/Wasser-Antwort unlesbar (Werte werden trotzdem angezeigt):', err);
        return null;
    }
    const feature = (body && typeof body.feature === 'string') ? body.feature : '';
    if (!feature) {
        console.warn('[Land] Land/Wasser-Antwort ohne Feature (Werte werden trotzdem angezeigt)');
        return null;
    }

    cache[key] = { feature, t: ts };
    writeLandCache(cache, store);
    return { feature, isLand: feature === 'LAND', cached: false };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fetchLandInfo, LAND_API_URL, landCacheKey };
}