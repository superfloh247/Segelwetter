// Segelwetter - Wettervorhersage für Segler

const weatherData = {
    location: 'Standort unbekannt',
    wind: {
        speed: 0,
        direction: '--',
        gusts: 0
    },
    temperature: '--'
};

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
    weatherData.location = `Lat ${coords.lat.toFixed(6)}, Lon ${coords.lng.toFixed(6)}`;
    weatherData.temperature = 18;
    weatherData.wind.speed = 14;
    weatherData.wind.gusts = 20;
    weatherData.wind.direction = 'NW';
    displayWeather(weatherData);
    updateMap(coords.lat, coords.lng);
    closeModal(elements.searchModal);
}

let mapInstance = null;
let mapMarker = null;

function setupMap() {
    if (typeof L === 'undefined') {
        console.error('Leaflet ist nicht geladen.');
        return;
    }
    mapInstance = L.map('map').setView([52.444476, 13.675989], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
    mapMarker = L.marker([52.444476, 13.675989]).addTo(mapInstance);
    setTimeout(() => {
        if (mapInstance) {
            mapInstance.invalidateSize();
        }
    }, 0);
}

function updateMap(lat, lng) {
    if (!mapInstance) return;
    mapInstance.setView([lat, lng], 12);
    if (!mapMarker) {
        mapMarker = L.marker([lat, lng]).addTo(mapInstance);
    } else {
        mapMarker.setLatLng([lat, lng]);
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
    displayWeather(weatherData);
    setupMap();
    setupModalHandlers();
}

document.addEventListener('DOMContentLoaded', initApp);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { weatherData, parseCoordinates };
}
