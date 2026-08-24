// Segelwetter – Leaflet map & wind marker (split from script.js)

let mapInstance = null;
let mapMarker = null;

function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

function handleMapCoordinateSelection(latlng) {
    if (!latlng) return;
    loadWeatherForCoords(latlng.lat, latlng.lng);
}

// Wechselt zu den Koordinaten der aktuellen Position des Clients (Geolocation API)
function locateCurrentPosition() {
    if (!('geolocation' in navigator)) {
        console.warn(t('consoleGeolocationNotSupported'));
        return;
    }
    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            loadWeatherForCoords(latitude, longitude);
        },
        error => {
            console.warn(t('consoleGeolocationFailed'), error);
        },
        { timeout: 10000, maximumAge: 60000 }
    );
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

function setupMap() {
    if (typeof L === 'undefined') {
        console.error(t('consoleLeafletNotLoaded'));
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

    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) {
        locateBtn.addEventListener('click', locateCurrentPosition);
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