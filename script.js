// Segelwetter - Wettervorhersage für Segler

const STORAGE_KEY_LAST_LOCATION = 'segelwetter:lastLocation';

const weatherData = {
    location: 'Standort unbekannt',
    coords: {
        lat: 52.444476,
        lng: 13.675989
    },
    wind: {
        speed: 0,
        direction: '--',
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

function formatWindDirection(direction) {
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
    return directionMap[direction] || direction;
}

function kmhToKnots(kmh) {
    return Number((kmh * 0.539957).toFixed(1));
}

function displayWeather(data) {
    if (elements.locationName) {
        elements.locationName.textContent = data.location;
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = `${kmhToKnots(data.wind.speed)}`;
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = formatWindDirection(data.wind.direction);
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
    weatherData.hourlyForecast = Array.from({ length: 72 }, (_, index) => {
        const time = new Date(now.getTime() + index * 3600 * 1000);
        const hour = time.toLocaleTimeString('de-DE', { hour: '2-digit', hour12: false });
        const dateLabel = time.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const speed = 8 + Math.round(6 + 4 * Math.sin(index / 6) + Math.random() * 3);
        const gusts = Math.max(speed + 3, speed + Math.round(Math.random() * 5));
        const temp = 14 + Math.round(4 * Math.cos(index / 12) + Math.random() * 2);
        const direction = directions[index % directions.length];
        return { hour, dateLabel, speed, gusts, temp, direction };
    });
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
    html += '<tr class="date-row">' + dateGroups.map(group => {
        return `<th colspan="${group.count}">${group.dateLabel}</th>`;
    }).join('') + '</tr>';
    html += '<tr class="time-row">' + headerRow.map(cell => `<th>${cell}</th>`).join('') + '</tr>';
    html += '</thead><tbody>';

    rows.forEach(row => {
        html += '<tr>';
        html += `<th class="label-cell">${row.label}</th>`;
        html += row.values.map(value => `<td>${value}</td>`).join('');
        html += '</tr>';
    });
    html += '</tbody>';

    table.innerHTML = html;
    attachHourlyForecastClickHandlers(table);
    highlightForecastColumn(selectedForecastColumn);
}

function refreshCoordsText() {
    const coordsText = document.getElementById('coordsText');
    if (coordsText && weatherData.coords) {
        coordsText.textContent = `${weatherData.coords.lat.toFixed(6)}, ${weatherData.coords.lng.toFixed(6)}`;
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

function handleSearch(event) {
    event.preventDefault();
    const query = elements.searchInput?.value.trim();
    if (!query) return;
    const coords = parseCoordinates(query);
    if (!coords) {
        alert('Bitte gültige Koordinaten im Format "lat, lon" eingeben.');
        return;
    }
    weatherData.coords = coords;
    weatherData.location = `Lat ${coords.lat.toFixed(6)}, Lon ${coords.lng.toFixed(6)}`;
    weatherData.temperature = 18;
    weatherData.wind.speed = 14;
    weatherData.wind.gusts = 20;
    weatherData.wind.direction = 'NW';
    displayWeather(weatherData);
    updateMap(coords.lat, coords.lng);
    refreshCoordsText();
    saveLastLocation(coords, weatherData.location);
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

function createWindMarkerIcon(direction, speedKnots) {
    const deg = directionToDegrees(direction);
    const html = `
        <div class="wind-arrow-marker">
            <div class="arrow" style="transform: rotate(${deg}deg);">➤</div>
            <span>${speedKnots} kt</span>
        </div>
    `;
    return L.divIcon({
        className: 'wind-arrow-div-icon',
        html,
        iconSize: [64, 64],
        iconAnchor: [32, 58]
    });
}

function getForecastByColumn(columnIndex) {
    if (!weatherData.hourlyForecast || columnIndex <= 0) return null;
    return weatherData.hourlyForecast[columnIndex - 1] || null;
}

function updateMarkerFromSelectedColumn() {
    if (!mapInstance) return;
    const forecast = getForecastByColumn(selectedForecastColumn);
    const direction = forecast ? forecast.direction : weatherData.wind.direction;
    const speed = forecast ? kmhToKnots(forecast.speed) : kmhToKnots(weatherData.wind.speed);
    const icon = createWindMarkerIcon(direction, speed);
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
    const direction = forecast ? forecast.direction : weatherData.wind.direction;
    const speedKnots = forecast ? kmhToKnots(forecast.speed) : kmhToKnots(weatherData.wind.speed);
    mapMarker = L.marker([lat, lng], {
        icon: createWindMarkerIcon(direction, speedKnots)
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
        const icon = createWindMarkerIcon(weatherData.wind.direction, kmhToKnots(weatherData.wind.speed));
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

function initApp() {
    const saved = loadLastLocation();
    if (saved) {
        weatherData.coords = { lat: saved.lat, lng: saved.lng };
        weatherData.location = saved.location || weatherData.location;
    }
    generateHourlyForecast();
    displayWeather(weatherData);
    refreshCoordsText();
    displayHourlyForecast();
    setupMap();
    setupModalHandlers();
}

document.addEventListener('DOMContentLoaded', initApp);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { weatherData, parseCoordinates };
}
