// Segelwetter - Wettervorhersage für Segler

const STORAGE_KEY_LAST_LOCATION = 'segelwetter:lastLocation';
const FORECAST_HOURS = 7 * 24;

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
    hourlyForecast: []
};

function saveLastLocation(coords, location) {
    try {
        localStorage.setItem(STORAGE_KEY_LAST_LOCATION, JSON.stringify({ lat: coords.lat, lng: coords.lng, location }));
    } catch (error) {
        console.warn('Kann letzte Position nicht speichern.', error);
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
    searchBtn: document.getElementById('searchBtn'),
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

function buildHourlyForecastFromOpenMeteo(data) {
    const timeStrings = data.hourly?.time || [];
    const temperatures = data.hourly?.temperature_2m || [];
    const windSpeeds = data.hourly?.windspeed_10m || [];
    const windDirections = data.hourly?.winddirection_10m || [];
    const windGusts = data.hourly?.windgusts_10m || [];

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
        forecast.push({
            hour,
            dateLabel,
            speed: Number(windSpeeds[i] ?? 0),
            gusts: Number(windGusts[i] ?? windSpeeds[i] ?? 0),
            temp: Math.round(Number(temperatures[i] ?? 0)),
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
    url.searchParams.set('hourly', 'temperature_2m,windspeed_10m,winddirection_10m,windgusts_10m');
    url.searchParams.set('current_weather', 'true');
    url.searchParams.set('windspeed_unit', 'kmh');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', start.toISOString().slice(0, 10));
    url.searchParams.set('end_date', end.toISOString().slice(0, 10));

    const response = await fetch(url.href);
    if (!response.ok) {
        throw new Error(`Open-Meteo-Antwort fehlerhaft: ${response.status}`);
    }
    return response.json();
}

async function loadWeatherForCoords(lat, lng, saveLocation = false) {
    try {
        const data = await fetchWeatherForCoords(lat, lng);
        const current = data.current_weather || {};
        weatherData.coords = { lat, lng };
        weatherData.location = `Lat ${lat.toFixed(6)}, Lon ${lng.toFixed(6)}`;
        weatherData.temperature = Number(current.temperature ?? (data.hourly?.temperature_2m?.[0] ?? 0));
        weatherData.wind.speed = Number(current.windspeed ?? (data.hourly?.windspeed_10m?.[0] ?? 0));
        weatherData.wind.directionDegrees = Number(current.winddirection ?? (data.hourly?.winddirection_10m?.[0] ?? 0));
        weatherData.wind.direction = degreesToDirection(weatherData.wind.directionDegrees);
        weatherData.wind.gusts = Number(current.windgust ?? (data.hourly?.windgusts_10m?.[0] ?? weatherData.wind.speed));
        weatherData.hourlyForecast = buildHourlyForecastFromOpenMeteo(data);
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
        generateHourlyForecast();
        displayWeather(weatherData);
        displayHourlyForecast();
        updateSailingAdvice();
        refreshCoordsText();
        if (mapInstance) {
            updateMap(lat, lng);
        }
    }
}

function kmhToKnots(kmh) {
    return speedToKnots(kmh / 3.6);
}

function displayWeather(data) {
    if (elements.locationName) {
        elements.locationName.textContent = data.location;
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = `${kmhToKnots(data.wind.speed)}`;
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = formatWindDirection(data.wind.direction, data.wind.directionDegrees);
    }
    if (elements.temperature) {
        elements.temperature.textContent = `${data.temperature}`;
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = `${kmhToKnots(data.wind.gusts)}`;
    }
}

function generateHourlyForecast() {
    const now = new Date();
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    weatherData.hourlyForecast = Array.from({ length: FORECAST_HOURS }, (_, index) => {
        const time = new Date(now.getTime() + index * 3600 * 1000);
        const hour = time.toLocaleTimeString('de-DE', { hour: '2-digit', hour12: false });
        const dateLabel = time.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const speed = Number((2 + Math.random() * 6).toFixed(1));
        const gusts = Number((speed + 1 + Math.random() * 2).toFixed(1));
        const temp = 14 + Math.round(4 * Math.cos(index / 12) + Math.random() * 2);
        const direction = directions[index % directions.length];
        return { hour, dateLabel, speed, gusts, temp, direction, timestamp: time.getTime() };
    });
}

function findNextGoodSailingSlot() {
    const now = Date.now();
    const nextSlot = weatherData.hourlyForecast.find(item => {
        if (!item.timestamp || item.timestamp <= now) return false;
        const date = new Date(item.timestamp);
        const hour = date.getHours();
        const baseWind = kmhToKnots(item.speed);
        const gustWind = kmhToKnots(item.gusts);
        return baseWind >= 8 && baseWind <= 14 && gustWind <= 18 && hour >= 10 && hour < 18;
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
    const adviceElement = document.getElementById('sailingAdviceText');
    if (!adviceElement) return;
    adviceElement.textContent = findNextGoodSailingSlot();
}

function displayHourlyForecast() {
    const table = document.getElementById('hourlyForecastTable');
    if (!table) return;

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
    attachHourlyForecastClickHandlers(table);
    highlightForecastColumn(selectedForecastColumn);
}

function parseCoordinates(input) {
    const parts = input.split(',').map(part => part.trim());
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
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

let mapInstance = null;
let mapMarker = null;
let selectedForecastColumn = 1;

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
}

function attachHourlyForecastClickHandlers(table) {
    table.addEventListener('click', event => {
        const cell = event.target.closest('td, th');
        if (!cell || cell.cellIndex === 0) return;
        highlightForecastColumn(cell.cellIndex);
    });
}

function setupMap() {
    if (typeof L === 'undefined') {
        console.error('Leaflet ist nicht geladen.');
        return;
    }
    const { lat, lng } = weatherData.coords;
    mapInstance = L.map('map').setView([lat, lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
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

function setupModalHandlers() {
    if (elements.searchBtn) {
        elements.searchBtn.addEventListener('click', () => openModal(elements.searchModal));
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
    setupMap();
    setupModalHandlers();
    await loadWeatherForCoords(weatherData.coords.lat, weatherData.coords.lng, false);
}

document.addEventListener('DOMContentLoaded', initApp);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { weatherData, parseCoordinates };
}
