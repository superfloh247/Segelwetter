// Segelwetter – state, storage, favorites & formatting (split from script.js)

const STORAGE_KEY_LAST_LOCATION = 'segelwetter:lastLocation';
const FORECAST_HOURS = 7 * 24;

const STORAGE_KEY_FAVORITES = 'segelwetter:favorites';

let isLoadingBookmark = false;

const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = window.matchMedia("(display-mode: standalone)").matches
                  || window.navigator.standalone === true;

const weatherData = {
    location: null, // Set in loadWeatherForCoords(); shown as '-' until then
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
        console.warn(t('consoleCannotSaveLocation'), error);
    }
}

function loadFavorites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_FAVORITES);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn(t('consoleCannotLoadFavorites'), error);
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
    } catch (error) {
        console.warn(t('consoleCannotSaveFavorites'), error);
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
            requestDeleteFavorite(name);
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
            await loadWeatherForCoords(favorite.lat, favorite.lng, favorite.name);
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

// Eigene Dialog-Modals statt window.confirm / window.prompt (bessere UX auf Mobilgeräten)

function requestDeleteFavorite(name) {
    if (elements.deleteFavoriteModal) {
        elements.deleteFavoriteModal.dataset.favoriteName = name;
    }
    if (elements.deleteFavoriteMessage) {
        elements.deleteFavoriteMessage.textContent = t('deleteFavoriteConfirm').replace('{name}', name);
    }
    openModal(elements.deleteFavoriteModal);
}

function confirmDeleteFavorite() {
    const name = elements.deleteFavoriteModal?.dataset.favoriteName;
    closeModal(elements.deleteFavoriteModal);
    if (name) {
        deleteFavorite(name);
    }
}

function requestRenameLocation() {
    const currentLabel = weatherData.location || `Lat ${weatherData.coords.lat.toFixed(6)}, Lon ${weatherData.coords.lng.toFixed(6)}`;
    if (elements.renameLocationInput) {
        elements.renameLocationInput.value = currentLabel;
    }
    openModal(elements.renameLocationModal);
}

function confirmRenameLocation() {
    const newName = elements.renameLocationInput?.value.trim();
    closeModal(elements.renameLocationModal);
    if (newName) {
        weatherData.location = newName;
        saveLastLocation(weatherData.coords, newName);
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
        console.warn(t('consoleCannotLoadLocation'), error);
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
    errorBanner: document.getElementById('errorBanner'),
    errorBannerText: document.getElementById('errorBannerText'),
    errorBannerClose: document.getElementById('errorBannerClose'),
    deleteFavoriteModal: document.getElementById('deleteFavoriteModal'),
    deleteFavoriteMessage: document.getElementById('deleteFavoriteMessage'),
    deleteFavoriteCancel: document.getElementById('deleteFavoriteCancel'),
    deleteFavoriteConfirm: document.getElementById('deleteFavoriteConfirm'),
    renameLocationModal: document.getElementById('renameLocationModal'),
    renameLocationInput: document.getElementById('renameLocationInput'),
    renameLocationCancel: document.getElementById('renameLocationCancel'),
    renameLocationSave: document.getElementById('renameLocationSave')
};

function formatWindDirection(direction, directionDegrees) {
    const directionMap = {
        N: t('directionN'),
        NE: t('directionNE'),
        E: t('directionE'),
        SE: t('directionSE'),
        S: t('directionS'),
        SW: t('directionSW'),
        W: t('directionW'),
        NW: t('directionNW')
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

// Wind speed color scale (kt) – maps to CSS classes (see style.css)
function windSpeedClass(speedKnots) {
    if (speedKnots <= 6) return 'forecast-cell-wind-0-6';
    if (speedKnots <= 10) return 'forecast-cell-wind-6-10';
    if (speedKnots <= 12) return 'forecast-cell-wind-10-12';
    if (speedKnots <= 15) return 'forecast-cell-wind-12-15';
    if (speedKnots <= 30) return 'forecast-cell-wind-15-30';
    return 'forecast-cell-wind-30';
}

// Gust color scale (kt) – maps to CSS classes (see style.css)
function gustSpeedClass(speedKnots) {
    if (speedKnots <= 14) return 'forecast-cell-gust-0-14';
    if (speedKnots <= 18) return 'forecast-cell-gust-14-18';
    if (speedKnots <= 30) return 'forecast-cell-gust-18-30';
    return 'forecast-cell-gust-30';
}

function kmhToKnots(kmh) {
    return speedToKnots(kmh / 3.6);
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