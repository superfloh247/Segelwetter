// Segelwetter - Wettervorhersage für Segler

const STORAGE_KEY_LAST_LOCATION = 'segelwetter:lastLocation';
const FORECAST_HOURS = 7 * 24;

const STORAGE_KEY_FAVORITES = 'segelwetter:favorites';

let isLoadingBookmark = false;
let mapInstance = null;
let mapMarker = null;
let selectedForecastColumn = -1; // -1 means no column selected yet; auto-select on first data load

const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = window.matchMedia("(display-mode: standalone)").matches
                  || window.navigator.standalone === true;

const weatherData = {
    location: 'Standort unbekannt',
    coords: {
        lat: 52.44318115023351,
        lng: 13.675055360861572
    },
    wind: {
        speed: 0,
        direction: '--',
        directionDegrees: 0,
        gusts: 0
    },
    temperature: '--',
    waveHeight: null,
    seaSurfaceTemperature: null,
    hourlyForecast: []
};

function saveLastLocation(coords, location) {
    try {
        localStorage.setItem(STORAGE_KEY_LAST_LOCATION, JSON.stringify({ lat: coords.lat, lng: coords.lng, location }));
    } catch (error) {
        console.warn('Kann letzte Position nicht speichern.', error);
    }
}

function loadFavorites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_FAVORITES);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('Kann Favoriten nicht laden.', error);
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
    } catch (error) {
        console.warn('Kann Favoriten nicht speichern.', error);
    }
}

function deleteFavorite(name) {
    const favorites = loadFavorites().filter(item => item.name !== name);
    saveFavorites(favorites);
    renderBookmarks();
}

// Einmaliger Event-Listener auf Container-Ebene (Event-Delegation) – verhindert Memory-Leak durch pro-Button Listener
let bookmarksClickHandler = null;

function setupBookmarkDelegation() {
    if (!elements.bookmarksList || bookmarksClickHandler) return;

    bookmarksClickHandler = async event => {
        const button = event.target.closest('.bookmark-item');
        if (!button) return;

        const removeBtn = event.target.closest('[data-action="remove"]');
        const name = button.dataset.name;

        if (removeBtn) {
            event.stopPropagation();
            const confirmed = window.confirm(`Favorit "${name}" wirklich löschen?`);
            if (confirmed) {
                deleteFavorite(name);
            }
            return;
        }

        // Verhindere parallele Ladevorgänge – Race Condition fix
        if (isLoadingBookmark) return;
        const favorites = loadFavorites();
        const favorite = favorites.find(item => item.name === name);
        if (!favorite) return;

        isLoadingBookmark = true;
        renderBookmarks(name);
        try {
            await loadWeatherForCoords(favorite.lat, favorite.lng, false);
            weatherData.location = favorite.name;
            displayWeather(weatherData);
            updateSailingAdvice();
        } finally {
            isLoadingBookmark = false;
            renderBookmarks(null);
        }
    };

    elements.bookmarksList.addEventListener('click', bookmarksClickHandler);
}

function renderBookmarks(loadingName = null) {
    if (!elements.bookmarksList) return;
    const favorites = loadFavorites();

    // Container leeren (entfernt auch alte DOM-Nodes → alte Listener werden GC-fähig)
    elements.bookmarksList.innerHTML = '';

    favorites.forEach(fav => {
        const isDisabled = isLoadingBookmark || fav.name === loadingName;

        // <button> per DOM-API erstellen – kein innerHTML mit Benutzereingaben
        const button = document.createElement('button');
        button.className = 'bookmark-item' + (isDisabled ? ' bookmark-item-disabled' : '');
        button.type = 'button';
        button.dataset.name = fav.name;
        if (isDisabled) {
            button.disabled = true;
        }

        // Label als Text-Node (XSS-sicher – wird nicht als HTML geparst)
        const label = document.createElement('span');
        label.className = 'bookmark-label';
        label.textContent = fav.name;
        button.appendChild(label);

        // Optionaler Spinner (nur SVG, keine Benutzereingaben → sicher)
        if (fav.name === loadingName) {
            const spinner = document.createElement('span');
            spinner.className = 'bookmark-spinner';
            spinner.innerHTML = '<svg class="spinner-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="3" fill="none"/></svg>';
            button.appendChild(spinner);
        }

        // Remove-Button (statischer Text, keine Benutzereingaben → sicher)
        const removeBtn = document.createElement('span');
        removeBtn.className = 'bookmark-remove';
        removeBtn.dataset.action = 'remove';
        removeBtn.textContent = '×';
        button.appendChild(removeBtn);

        elements.bookmarksList.appendChild(button);
    });
}

function addOrUpdateFavorite() {
    const name = weatherData.location || `Lat ${weatherData.coords.lat.toFixed(6)}, Lon ${weatherData.coords.lng.toFixed(6)}`;
    const favorites = loadFavorites();
    const index = favorites.findIndex(item => item.name === name);
    const entry = { name, lat: weatherData.coords.lat, lng: weatherData.coords.lng };
    if (index >= 0) {
        favorites[index] = entry;
    } else {
        favorites.push(entry);
    }
    saveFavorites(favorites);
    renderBookmarks();
}

function promptLocationName() {
    const currentLabel = weatherData.location || `Lat ${weatherData.coords.lat.toFixed(6)}, Lon ${weatherData.coords.lng.toFixed(6)}`;
    const newName = window.prompt('Gib einen Namen für diese Koordinate ein:', currentLabel);
    if (newName && newName.trim()) {
        weatherData.location = newName.trim();
        displayWeather(weatherData);
    }
}

function loadLastLocation() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_LAST_LOCATION);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
            return parsed;
        }
    } catch (error) {
        console.warn('Kann letzte Position nicht laden.', error);
    }
    return null;
}

const elements = {
    locationName: document.getElementById('locationName'),
    windSpeed: document.getElementById('windSpeed'),
    windDirection: document.getElementById('windDirection'),
    temperature: document.getElementById('temperature'),
    windGusts: document.getElementById('windGusts'),
    favoriteBtn: document.getElementById('favoriteBtn'),
    bookmarksList: document.getElementById('bookmarksList'),
    searchModal: document.getElementById('searchModal'),
    searchInput: document.getElementById('searchInput'),
    searchSubmit: document.getElementById('searchSubmit')
};

function formatWindDirection(direction, directionDegrees) {
    const directionMap = {
        N: 'Norden',
        NE: 'Nord-Osten',
        E: 'Osten',
        SE: 'Süd-Osten',
        S: 'Süden',
        SW: 'Süd-West',
        W: 'Westen',
        NW: 'Nord-West'
    };
    const label = directionMap[direction] || direction;
    if (typeof directionDegrees === 'number') {
        return `${label} (${Math.round(directionDegrees)}°)`;
    }
    return label;
}

function speedToKnots(speedMps) {
    return Number((speedMps * 1.943844).toFixed(1));
}

function degreesToDirection(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    if (normalized >= 337.5 || normalized < 22.5) return 'N';
    if (normalized < 67.5) return 'NE';
    if (normalized < 112.5) return 'E';
    if (normalized < 157.5) return 'SE';
    if (normalized < 202.5) return 'S';
    if (normalized < 247.5) return 'SW';
    if (normalized < 292.5) return 'W';
    return 'NW';
}

function interpolateColor(start, end, t) {
    return [
        Math.round(start[0] + (end[0] - start[0]) * t),
        Math.round(start[1] + (end[1] - start[1]) * t),
        Math.round(start[2] + (end[2] - start[2]) * t)
    ];
}

function windSpeedBackground(speedKnots) {
    const stops = [
        { threshold: 0, color: [93, 153, 255] },
        { threshold: 6, color: [173, 216, 230] },
        { threshold: 10, color: [175, 221, 150] },
        { threshold: 12, color: [255, 229, 153] },
        { threshold: 15, color: [255, 170, 130] },
        { threshold: 30, color: [255, 115, 115] }
    ];
    let prev = stops[0];

    for (let i = 1; i < stops.length; i += 1) {
        const current = stops[i];
        if (speedKnots <= current.threshold) {
            const range = current.threshold - prev.threshold;
            const t = range === 0 ? 0 : Math.min(1, Math.max(0, (speedKnots - prev.threshold) / range));
            const [r, g, b] = interpolateColor(prev.color, current.color, t);
            return `rgb(${r}, ${g}, ${b})`;
        }
        prev = current;
    }
    const last = stops[stops.length - 1].color;
    return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

function windSpeedTextColor(speedKnots) {
    return speedKnots > 11 ? '#222' : '#111';
}

function gustSpeedBackground(speedKnots) {
    const stops = [
        { threshold: 0, color: [175, 221, 150] },
        { threshold: 14, color: [175, 221, 150] },
        { threshold: 18, color: [255, 229, 153] },
        { threshold: 30, color: [255, 115, 115] }
    ];
    let prev = stops[0];

    for (let i = 1; i < stops.length; i += 1) {
        const current = stops[i];
        if (speedKnots <= current.threshold) {
            const range = current.threshold - prev.threshold;
            const t = range === 0 ? 0 : Math.min(1, Math.max(0, (speedKnots - prev.threshold) / range));
            const [r, g, b] = interpolateColor(prev.color, current.color, t);
            return `rgb(${r}, ${g}, ${b})`;
        }
        prev = current;
    }
    const last = stops[stops.length - 1].color;
    return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

function buildHourlyForecastFromOpenMeteo(data, marineData) {
    const timeStrings = data.hourly?.time || [];
    const temperatures = data.hourly?.temperature_2m || [];
    const windSpeeds = data.hourly?.windspeed_10m || [];
    const windDirections = data.hourly?.winddirection_10m || [];
    const windGusts = data.hourly?.windgusts_10m || [];
    const capes = data.hourly?.cape || [];
    const waveHeights = marineData?.hourly?.wave_height;
    const seaSurfaceTemps = data.hourly?.sea_surface_temperature;

    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);

    const forecast = [];
    for (let i = 0; i < timeStrings.length && forecast.length < FORECAST_HOURS; i += 1) {
        const time = new Date(timeStrings[i]);
        if (time < start) continue;
        const hour = time.toLocaleTimeString('de-DE', { hour: '2-digit', hour12: false });
        const dateLabel = time.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const directionDegrees = Number(windDirections[i] ?? 0);
        const capeVal = (capes && i < capes.length && capes[i] != null) ? Number(capes[i]) : null;
        const waveHeightVal = (waveHeights && i < waveHeights.length && waveHeights[i] != null) ? Number(waveHeights[i]) : null;
        const seaSurfaceVal = (seaSurfaceTemps && i < seaSurfaceTemps.length && seaSurfaceTemps[i] != null) ? Number(seaSurfaceTemps[i]) : null;
        forecast.push({
            hour,
            dateLabel,
            speed: Number(windSpeeds[i] ?? 0),
            gusts: Number(windGusts[i] ?? windSpeeds[i] ?? 0),
            temp: Math.round(Number(temperatures[i] ?? 0)),
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

async function fetchWeatherForCoords(lat, lng) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + FORECAST_HOURS * 3600 * 1000);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', 'temperature_2m,windspeed_10m,winddirection_10m,windgusts_10m,sea_surface_temperature,cape');
    url.searchParams.set('current_weather', 'true');
    url.searchParams.set('windspeed_unit', 'kmh');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', start.toISOString().slice(0, 10));
    url.searchParams.set('end_date', end.toISOString().slice(0, 10));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) {
        throw new Error(`Open-Meteo-Antwort fehlerhaft: ${response.status}`);
     }
    return response.json();
}

async function fetchMarineWaveHeight(lat, lng) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + FORECAST_HOURS * 3600 * 1000);
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', 'wave_height');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', start.toISOString().slice(0, 10));
    url.searchParams.set('end_date', end.toISOString().slice(0, 10));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) {
        throw new Error(`Marine Open-Meteo-Antwort fehlerhaft: ${response.status}`);
     }
    return response.json();
}

async function loadWeatherForCoords(lat, lng, saveLocation = false) {
    showLoadingOverlay(true);
    try {
        const [data, marineData] = await Promise.all([
            fetchWeatherForCoords(lat, lng),
            fetchMarineWaveHeight(lat, lng).catch(error => {
                console.warn('Marine-Wellenhöhe konnte nicht geladen werden:', error);
                return null;
            })
        ]);
        const current = data.current_weather || {};
        weatherData.coords = { lat, lng };
        weatherData.location = `Lat ${lat.toFixed(6)}, Lon ${lng.toFixed(6)}`;
        weatherData.temperature = Number(current.temperature ?? (data.hourly?.temperature_2m?.[0] ?? 0));
        const firstWave = marineData?.hourly?.wave_height?.[0];
        weatherData.waveHeight = firstWave != null ? Number(firstWave) : null;
        weatherData.seaSurfaceTemperature = data.hourly?.sea_surface_temperature?.[0] != null ? Number(data.hourly?.sea_surface_temperature?.[0]) : null;
        weatherData.wind.speed = Number(current.windspeed ?? (data.hourly?.windspeed_10m?.[0] ?? 0));
        weatherData.wind.directionDegrees = Number(current.winddirection ?? (data.hourly?.winddirection_10m?.[0] ?? 0));
        weatherData.wind.direction = degreesToDirection(weatherData.wind.directionDegrees);
        weatherData.wind.gusts = Number(current.windgust ?? (data.hourly?.windgusts_10m?.[0] ?? weatherData.wind.speed));
        weatherData.hourlyForecast = buildHourlyForecastFromOpenMeteo(data, marineData);
        displayWeather(weatherData);
        displayHourlyForecast();
        updateSailingAdvice();
        refreshCoordsText();
        if (mapInstance) {
            updateMap(lat, lng);
        }
        if (saveLocation) {
            saveLastLocation({ lat, lng }, weatherData.location);
        }
    } catch (error) {
        console.warn('Open-Meteo-Daten konnten nicht geladen werden:', error);
        weatherData.coords = { lat, lng };
        weatherData.location = `Lat ${lat.toFixed(6)}, Lon ${lng.toFixed(6)}`;
        weatherData.temperature = null;
        weatherData.waveHeight = null;
        weatherData.seaSurfaceTemperature = null;
        weatherData.wind.speed = null;
        weatherData.wind.directionDegrees = null;
        weatherData.wind.direction = null;
        weatherData.wind.gusts = null;
        weatherData.hourlyForecast = [];
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

function kmhToKnots(kmh) {
    return speedToKnots(kmh / 3.6);
}

function displayWeather(data) {
    if (elements.locationName) {
        elements.locationName.textContent = data.location || '-';
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = data.wind.speed != null ? `${kmhToKnots(data.wind.speed)}` : '-';
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = data.wind.direction ? formatWindDirection(data.wind.direction, data.wind.directionDegrees) : '-';
    }
    if (elements.temperature) {
        elements.temperature.textContent = data.temperature != null ? `${data.temperature}` : '-';
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = data.wind.gusts != null ? `${kmhToKnots(data.wind.gusts)}` : '-';
    }
}

function findNextGoodSailingSlot(criteria) {
    const now = Date.now();
    const nextSlot = weatherData.hourlyForecast.find(item => {
        if (!item.timestamp || item.timestamp <= now) return false;
        const date = new Date(item.timestamp);
        const hour = date.getHours();
        const baseWind = kmhToKnots(item.speed);
        const gustWind = kmhToKnots(item.gusts);
        return baseWind >= criteria.baseWindMin && baseWind <= criteria.baseWindMax && gustWind <= criteria.gustMax && hour >= criteria.hourMin && hour < criteria.hourMax;
    });

    if (!nextSlot) {
        return 'Kein guter Termin gefunden 😢';
    }

    const date = new Date(nextSlot.timestamp);
    const formattedDate = date.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
    });
    const formattedTime = date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return `${formattedDate}, ${formattedTime} Uhr — Grundwind ${kmhToKnots(nextSlot.speed).toFixed(1)} kt, Böen ${kmhToKnots(nextSlot.gusts).toFixed(1)} kt`;
}

function updateSailingAdvice() {
    const catElement = document.getElementById('sailingAdviceCat');
    const jolleElement = document.getElementById('sailingAdviceJolle');
    if (catElement) {
        catElement.textContent = findNextGoodSailingSlot({
            baseWindMin: 8,
            baseWindMax: 14,
            gustMax: 18,
            hourMin: 10,
            hourMax: 18
        });
    }
    if (jolleElement) {
        jolleElement.textContent = findNextGoodSailingSlot({
            baseWindMin: 3,
            baseWindMax: 6,
            gustMax: 10,
            hourMin: 10,
            hourMax: 18
        });
    }
}

function displayHourlyForecast() {
    const table = document.getElementById('hourlyForecastTable');
    if (!table) return;

    if (weatherData.hourlyForecast.length === 0) {
        table.innerHTML = '<tr><td colspan="100" style="text-align:center;padding:2rem;color:#666;">Keine Vorhersagedaten verfügbar</td></tr>';
        return;
     }

    const headerRow = weatherData.hourlyForecast.map(item => item.hour);
    const dateGroups = [];
    weatherData.hourlyForecast.forEach(item => {
        if (!dateGroups.length || dateGroups[dateGroups.length - 1].dateLabel !== item.dateLabel) {
            dateGroups.push({ dateLabel: item.dateLabel, count: 1 });
        } else {
            dateGroups[dateGroups.length - 1].count += 1;
        }
    });

    const rows = [
        {
            label: 'Grundwind',
            values: weatherData.hourlyForecast.map(item => `${kmhToKnots(item.speed)}`)
        },
        {
            label: 'Böen',
            values: weatherData.hourlyForecast.map(item => `${kmhToKnots(item.gusts)}`)
        },
        {
            label: 'Temperatur',
            values: weatherData.hourlyForecast.map(item => `${item.temp}°C`)
        },
        {
            label: 'Windrichtung',
            values: weatherData.hourlyForecast.map(item => item.direction)
        }
    ];

    const hasCape = weatherData.hourlyForecast.some(item => typeof item.cape === 'number' && item.cape > 500);
    const hasSeaTemp = weatherData.hourlyForecast.some(item => typeof item.seaSurfaceTemp === 'number' && !isNaN(item.seaSurfaceTemp));
    const hasWaveHeight = weatherData.hourlyForecast.some(item => typeof item.waveHeight === 'number' && !isNaN(item.waveHeight));

    if (hasSeaTemp) {
        rows.push({
            label: 'Wassertemp.',
            values: weatherData.hourlyForecast.map(item => item.seaSurfaceTemp != null && !isNaN(item.seaSurfaceTemp) ? `${(Math.round(item.seaSurfaceTemp * 10) / 10)}°C` : '—')
        });
    }

    if (hasCape) {
        rows.push({
            label: 'Gewitter',
            values: weatherData.hourlyForecast.map(item => {
                if (typeof item.cape !== 'number' || isNaN(item.cape) || item.cape <= 500) {
                    return '';
                }
                if (item.cape > 1500) {
                    return '<span class="cape-danger">!!</span>';
                }
                return '!';
            })
        });
    }

    if (hasWaveHeight) {
        rows.push({
            label: 'Wellenhöhe',
            values: weatherData.hourlyForecast.map(item => item.waveHeight != null && !isNaN(item.waveHeight) ? `${(Math.round(item.waveHeight * 10) / 10)} m` : '—')
        });
    }

    let html = '<thead>';
    html += '<tr class="date-row"><th class="label-cell empty-cell"></th>' + dateGroups.map(group => {
        return `<th colspan="${group.count}">${group.dateLabel}</th>`;
    }).join('') + '</tr>';
    html += '<tr class="time-row"><th class="label-cell empty-cell"></th>' + headerRow.map(cell => `<th>${cell}</th>`).join('') + '</tr>';
    html += '</thead><tbody>';

    rows.forEach((row, rowIndex) => {
        html += '<tr>';
        html += `<th class="label-cell">${row.label}</th>`;
        html += row.values.map((value, colIndex) => {
            const numericValue = Number(value);
            if (rowIndex === 0) {
                const background = windSpeedBackground(numericValue);
                const color = windSpeedTextColor(numericValue);
                return `<td style="background:${background};color:${color}">${value}</td>`;
            }
            if (rowIndex === 1) {
                const background = gustSpeedBackground(numericValue);
                const color = windSpeedTextColor(numericValue);
                return `<td style="background:${background};color:${color}">${value}</td>`;
            }
            return `<td>${value}</td>`;
        }).join('');
        html += '</tr>';
    });
    html += '</tbody>';

    table.innerHTML = html;
    
    // Auto-select first data column (index 1) if no column is selected yet
    // Column 0 is the label cell, so first weather data starts at column 1
    if (selectedForecastColumn < 0) {
        highlightForecastColumn(1);
    } else {
        highlightForecastColumn(selectedForecastColumn);
    }
}

function parseCoordinates(input) {
    const parts = input.split(',').map(part => part.trim());
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
}

function showLoadingOverlay(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
}

function showIOSInstallPrompt() {
    if (!isIOS || isStandalone) return;
    try {
        const dismissed = localStorage.getItem('segelwetter:iosInstallDismissed');
        if (dismissed) return;
    } catch (error) {
        // localStorage not available
    }
    const overlay = document.getElementById('iosInstallOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const dismissBtn = document.getElementById('iosInstallDismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            try {
                localStorage.setItem('segelwetter:iosInstallDismissed', '1');
            } catch (error) {
                // localStorage not available
            }
        });
    }
    // Auch schließbar per Backdrop-Klick
    const backdrop = overlay.querySelector('.ios-install-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            dismissBtn?.click();
        });
    }
}

function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

function handleMapCoordinateSelection(latlng) {
    if (!latlng) return;
    loadWeatherForCoords(latlng.lat, latlng.lng, true);
}

function openModal(modal) {
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal(modal) {
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handleSearch(event) {
    event.preventDefault();
    const query = elements.searchInput?.value.trim();
    if (!query) return;
    const coords = parseCoordinates(query);
    if (!coords) {
        alert('Bitte gültige Koordinaten im Format "lat, lon" eingeben.');
        return;
    }
    await loadWeatherForCoords(coords.lat, coords.lng, true);
    closeModal(elements.searchModal);
}

function directionToDegrees(direction) {
    const mapping = {
        N: 0,
        NE: 45,
        E: 90,
        SE: 135,
        S: 180,
        SW: 225,
        W: 270,
        NW: 315
    };
    return mapping[direction] ?? 0;
}

function createWindMarkerIcon(directionDegrees, speedKnots) {
    const normalized = ((directionDegrees % 360) + 360) % 360;
    const rotation = (normalized + 90) % 360; // Windpfeil zeigt in die tatsächliche Windrichtung
    const html = `
        <div class="wind-arrow-marker">
            <div class="arrow" style="transform: rotate(${rotation}deg);">➤</div>
            <span>${Math.round(normalized)}°</span>
            <span>${speedKnots} kt</span>
        </div>
    `;
    return L.divIcon({
        className: 'wind-arrow-div-icon',
        html,
        iconSize: [64, 80],
        iconAnchor: [32, 68]
    });
}

function getForecastByColumn(columnIndex) {
    if (!weatherData.hourlyForecast || columnIndex <= 0) return null;
    return weatherData.hourlyForecast[columnIndex - 1] || null;
}

function updateMarkerFromSelectedColumn() {
    if (!mapInstance) return;
    const forecast = getForecastByColumn(selectedForecastColumn);
    const directionDegrees = forecast ? forecast.directionDegrees : weatherData.wind.directionDegrees ?? 0;
    const speed = forecast ? kmhToKnots(forecast.speed) : kmhToKnots(weatherData.wind.speed);
    const icon = createWindMarkerIcon(directionDegrees, speed);
    if (!mapMarker) {
        mapMarker = L.marker([weatherData.coords.lat, weatherData.coords.lng], { icon }).addTo(mapInstance);
    } else {
        mapMarker.setIcon(icon);
    }
}

function updateWeatherPanelFromSelectedForecast() {
    const forecast = getForecastByColumn(selectedForecastColumn);
    if (!forecast) {
        displayWeather(weatherData);
        return;
    }

    if (elements.temperature) {
        elements.temperature.textContent = `${forecast.temp}`;
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = `${kmhToKnots(forecast.speed)}`;
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = `${kmhToKnots(forecast.gusts)}`;
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = formatWindDirection(forecast.direction, forecast.directionDegrees);
    }
}

function highlightForecastColumn(columnIndex) {
    selectedForecastColumn = columnIndex;
    const table = document.getElementById('hourlyForecastTable');
    if (!table) return;

    const cells = table.querySelectorAll('th, td');
    cells.forEach(cell => cell.classList.remove('selected-column'));

    Array.from(table.rows).forEach(row => {
        const cell = row.cells[columnIndex];
        if (cell) {
            cell.classList.add('selected-column');
        }
    });

    updateMarkerFromSelectedColumn();
    updateWeatherPanelFromSelectedForecast();
}

function setupMap() {
    if (typeof L === 'undefined') {
        console.error('Leaflet ist nicht geladen.');
        return;
    }
    const { lat, lng } = weatherData.coords;
    mapInstance = L.map('map', {
        doubleClickZoom: false
    }).setView([lat, lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);

    mapInstance.on('dblclick', event => {
        if (event.latlng) {
            handleMapCoordinateSelection(event.latlng);
        }
    });

    if (isTouchDevice()) {
        mapInstance.on('click', event => {
            if (event.latlng) {
                handleMapCoordinateSelection(event.latlng);
            }
        });
    }

    const forecast = getForecastByColumn(selectedForecastColumn);
    const directionDegrees = forecast ? forecast.directionDegrees : weatherData.wind.directionDegrees ?? 0;
    const speedKnots = forecast ? kmhToKnots(forecast.speed) : kmhToKnots(weatherData.wind.speed);
    mapMarker = L.marker([lat, lng], {
        icon: createWindMarkerIcon(directionDegrees, speedKnots)
    }).addTo(mapInstance);
    setTimeout(() => {
        if (mapInstance) {
            mapInstance.invalidateSize();
        }
    }, 0);
}

function updateMap(lat, lng) {
    if (!mapInstance) return;
    mapInstance.setView([lat, lng], 12);
    weatherData.coords.lat = lat;
    weatherData.coords.lng = lng;
    if (mapMarker) {
        mapMarker.setLatLng([lat, lng]);
    } else {
        const icon = createWindMarkerIcon(weatherData.wind.directionDegrees, kmhToKnots(weatherData.wind.speed));
        mapMarker = L.marker([lat, lng], { icon }).addTo(mapInstance);
    }
    updateMarkerFromSelectedColumn();
}

function refreshCoordsText() {
    const coordsText = document.getElementById('coordsText');
    if (coordsText && weatherData.coords) {
        coordsText.textContent = `${weatherData.coords.lat.toFixed(6)}, ${weatherData.coords.lng.toFixed(6)}`;
    }
}

function setupPullToRefresh() {
    if (!isStandalone && !isIOS) return;
    const indicator = document.getElementById('pullToRefreshIndicator');
    if (!indicator) return;

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    let refreshing = false;
    const THRESHOLD = 80;

    document.addEventListener('touchstart', event => {
        if (window.scrollY !== 0 || refreshing) return;
        dragging = true;
        startY = event.touches[0].pageY;
    }, { passive: true });

    document.addEventListener('touchmove', event => {
        if (!dragging || refreshing) return;
        currentY = event.touches[0].pageY - startY;
        if (currentY < 0) return;
        const widthPercent = Math.min(100, (currentY / THRESHOLD) * 100);
        indicator.style.width = widthPercent + '%';
        indicator.classList.add('active');
    }, { passive: true });

    document.addEventListener('touchend', async () => {
        if (!dragging) {
            dragging = false;
            return;
        }
        dragging = false;
        if (currentY >= THRESHOLD && !refreshing) {
            refreshing = true;
            indicator.style.width = '100%';
            await loadWeatherForCoords(weatherData.coords.lat, weatherData.coords.lng, false);
            setTimeout(() => {
                indicator.classList.add('reset');
                indicator.style.width = '0';
                setTimeout(() => {
                    indicator.classList.remove('active', 'reset');
                    refreshing = false;
                }, 300);
            }, 500);
        } else {
            indicator.classList.add('reset');
            indicator.style.width = '0';
            setTimeout(() => {
                indicator.classList.remove('active', 'reset');
            }, 300);
        }
        currentY = 0;
    });
}

function setupModalHandlers() {
    if (elements.locationName) {
        elements.locationName.addEventListener('click', promptLocationName);
    }
    if (elements.favoriteBtn) {
        elements.favoriteBtn.addEventListener('click', addOrUpdateFavorite);
    }
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            closeModal(modal);
        });
    });
    if (elements.searchModal) {
        elements.searchModal.addEventListener('click', event => {
            if (event.target === elements.searchModal) {
                closeModal(elements.searchModal);
            }
        });
    }
    if (elements.searchSubmit) {
        elements.searchSubmit.addEventListener('click', handleSearch);
    }
}

async function initApp() {
    const saved = loadLastLocation();
    if (saved) {
        weatherData.coords = { lat: saved.lat, lng: saved.lng };
        weatherData.location = saved.location || weatherData.location;
    }
    renderBookmarks();
    setupBookmarkDelegation();
    setupMap();
    setupModalHandlers();
    setupPullToRefresh();
    const forecastTable = document.getElementById('hourlyForecastTable');
    if (forecastTable) {
        forecastTable.addEventListener('click', event => {
            const cell = event.target.closest('td, th');
            if (!cell || cell.cellIndex === 0) return;
            highlightForecastColumn(cell.cellIndex);
         });
     }
    await loadWeatherForCoords(weatherData.coords.lat, weatherData.coords.lng, false);
    showIOSInstallPrompt();
}

document.addEventListener('DOMContentLoaded', initApp);
