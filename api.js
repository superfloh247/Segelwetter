// Segelwetter – Open-Meteo API, response cache & data loading (split from script.js)

function buildHourlyForecastFromOpenMeteo(data, marineData) {
    const timeStrings = data.hourly?.time || [];
    const temperatures = data.hourly?.temperature_2m || [];
    const windSpeeds = data.hourly?.windspeed_10m || [];
    const windDirections = data.hourly?.winddirection_10m || [];
    const windGusts = data.hourly?.windgusts_10m || [];
    const capes = data.hourly?.cape || [];
    const waveHeights = marineData?.hourly?.wave_height;
    const seaSurfaceTemps = marineData?.hourly?.sea_surface_temperature;

    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);

    const forecast = [];
    for (let i = 0; i < timeStrings.length && forecast.length < FORECAST_HOURS; i += 1) {
        const time = new Date(timeStrings[i]);
        if (time < start) continue;
        const hour = time.toLocaleTimeString(t('dateLocale'), { hour: '2-digit', hour12: false });
        const dateLabel = time.toLocaleDateString(t('dateLocale'), { weekday: 'short', day: '2-digit', month: '2-digit' });
        const directionDegrees = Number(windDirections[i] ?? 0);
        const capeVal = (capes && i < capes.length && capes[i] != null) ? Number(capes[i]) : null;
        const waveHeightVal = (waveHeights && i < waveHeights.length && waveHeights[i] != null) ? Number(waveHeights[i]) : null;
        const seaSurfaceVal = (seaSurfaceTemps && i < seaSurfaceTemps.length && seaSurfaceTemps[i] != null) ? Number(seaSurfaceTemps[i]) : null;
        forecast.push({
            hour,
            dateLabel,
            speed: Number(windSpeeds[i] ?? 0),
            gusts: Number(windGusts[i] ?? windSpeeds[i] ?? 0),
            temp: Math.round(Number(temperatures[i] ?? 0) * 10) / 10,
            cape: capeVal,
            waveHeight: waveHeightVal,
            seaSurfaceTemp: seaSurfaceVal,
            direction: degreesToDirection(directionDegrees),
            directionDegrees,
            timestamp: time.getTime()
        });
    }
    return forecast;
}

// API response cache – protects against Open-Meteo rate limits and speeds up re-loads
const STORAGE_KEY_API_CACHE = 'segelwetter:apiCache';
const API_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const API_CACHE_MAX_ENTRIES = 20;

function readApiCache() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_API_CACHE);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        return {};
    }
}

function writeApiCache(cache) {
    try {
        localStorage.setItem(STORAGE_KEY_API_CACHE, JSON.stringify(cache));
    } catch (error) {
        // localStorage not available – ignore
    }
}

function getCachedResponse(key) {
    const cache = readApiCache();
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > API_CACHE_TTL) {
        delete cache[key];
        writeApiCache(cache);
        return null;
    }
    return entry.data;
}

function setCachedResponse(key, data) {
    const cache = readApiCache();
    cache[key] = { ts: Date.now(), data };
    const keys = Object.keys(cache);
    if (keys.length > API_CACHE_MAX_ENTRIES) {
        keys.sort((a, b) => cache[a].ts - cache[b].ts);
        while (keys.length > API_CACHE_MAX_ENTRIES) {
            delete cache[keys.shift()];
        }
    }
    writeApiCache(cache);
}

async function fetchWeatherForCoords(lat, lng) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + FORECAST_HOURS * 3600 * 1000);
    const cacheKey = `weather:${lat.toFixed(4)}:${lng.toFixed(4)}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', 'temperature_2m,windspeed_10m,winddirection_10m,windgusts_10m,cape');
    url.searchParams.set('current_weather', 'true');
    url.searchParams.set('windspeed_unit', 'kmh');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', start.toISOString().slice(0, 10));
    url.searchParams.set('end_date', end.toISOString().slice(0, 10));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) {
        throw new Error(`Open-Meteo response error: ${response.status}`);
     }
    const data = await response.json();
    setCachedResponse(cacheKey, data);
    return data;
}

async function fetchMarineData(lat, lng) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + FORECAST_HOURS * 3600 * 1000);
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', 'wave_height,sea_surface_temperature');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', start.toISOString().slice(0, 10));
    url.searchParams.set('end_date', end.toISOString().slice(0, 10));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) {
        throw new Error(`Marine Open-Meteo response error: ${response.status}`);
     }
    return response.json();
}

// Open Waters Tides API (https://openwaters.io) – Tideextreme der nächstgelegenen Station,
// kein API-Key erforderlich. Die API ordnet JEDER Koordinate die nächste Station zu,
// daher auch Binnenorten (z. B. München -> Venedig, ~309 km). Nur Stationen innerhalb
// von MAX_TIDE_STATION_DISTANCE_KM werden akzeptiert, sonst bleibt die Tide-Zeile verborgen.
const MAX_TIDE_STATION_DISTANCE_KM = 100;

async function fetchTideData(lat, lng) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + FORECAST_HOURS * 3600 * 1000);
    const cacheKey = `tide:${lat.toFixed(2)}:${lng.toFixed(2)}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;
    const url = new URL('https://api.openwaters.io/tides/extremes');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start', `${start.toISOString().slice(0, 19)}Z`);
    url.searchParams.set('end', `${end.toISOString().slice(0, 19)}Z`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) {
        throw new Error(`Open Waters Tides response error: ${response.status}`);
    }
    const data = await response.json();
    setCachedResponse(cacheKey, data);
    return data;
}

// Liefert die Tideextreme für die aktuelle Koordinate – leer, wenn keine gültigen
// Daten vorliegen oder die nächstgelegene Station zu weit entfernt ist (Binnenlage).
function getTideExtremes(tideData) {
    if (!tideData || !Array.isArray(tideData.extremes) || tideData.extremes.length === 0) return [];
    if (typeof tideData.distance === 'number' && tideData.distance > MAX_TIDE_STATION_DISTANCE_KM) return [];
    return tideData.extremes
        .filter(item => item && item.time && typeof item.level === 'number' && !isNaN(item.level))
        .map(item => {
            const time = new Date(item.time);
            return {
                timestamp: time.getTime(),
                level: item.level,
                high: !!item.high,
                timeText: time.toLocaleTimeString(t('dateLocale'), { hour: '2-digit', minute: '2-digit', hour12: false }),
                timeTextDate: time.toLocaleDateString(t('dateLocale'), { weekday: 'short', day: '2-digit', month: '2-digit' })
            };
        })
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function loadWeatherForCoords(lat, lng, locationName = null) {
    showLoadingOverlay(true);
    hideErrorBanner();
    weatherData.coords = { lat, lng };
    weatherData.location = locationName || `Lat ${lat.toFixed(6)}, Lon ${lng.toFixed(6)}`;
    // Die zuletzt angezeigte Position immer speichern – auch wenn der Wetter-Request fehlschlägt
    saveLastLocation(weatherData.coords, weatherData.location);
    try {
        const [data, marineData, tideData] = await Promise.all([
            fetchWeatherForCoords(lat, lng),
            fetchMarineData(lat, lng).catch(error => {
                console.warn(t('consoleMarineFailed'), error);
                return null;
            }),
            fetchTideData(lat, lng).catch(error => {
                console.warn(t('consoleTideFailed'), error);
                return null;
            })
        ]);
        const current = data.current_weather || {};
        weatherData.temperature = Number(current.temperature ?? (data.hourly?.temperature_2m?.[0] ?? 0));
        weatherData.wind.speed = Number(current.windspeed ?? (data.hourly?.windspeed_10m?.[0] ?? 0));
        weatherData.wind.directionDegrees = Number(current.winddirection ?? (data.hourly?.winddirection_10m?.[0] ?? 0));
        weatherData.wind.direction = degreesToDirection(weatherData.wind.directionDegrees);
        weatherData.wind.gusts = Number(current.windgust ?? (data.hourly?.windgusts_10m?.[0] ?? weatherData.wind.speed));
        weatherData.hourlyForecast = buildHourlyForecastFromOpenMeteo(data, marineData);
        weatherData.tideExtremes = getTideExtremes(tideData);
        weatherData.tideStation = tideData?.station?.name || null;
        displayWeather(weatherData);
        displayHourlyForecast();
        updateSailingAdvice();
        refreshCoordsText();
        if (mapInstance) {
            updateMap(lat, lng);
        }
    } catch (error) {
        console.warn(t('consoleWeatherFailed'), error);
        showErrorBanner(t('errorWeatherLoadFailed'));
        weatherData.temperature = null;
        weatherData.wind.speed = null;
        weatherData.wind.directionDegrees = null;
        weatherData.wind.direction = null;
        weatherData.wind.gusts = null;
        weatherData.hourlyForecast = [];
        weatherData.tideExtremes = [];
        weatherData.tideStation = null;
        displayWeather(weatherData);
        displayHourlyForecast();
        updateSailingAdvice();
        refreshCoordsText();
        if (mapInstance) {
            updateMap(lat, lng);
        }
    } finally {
        showLoadingOverlay(false);
    }
}