// Segelwetter i18n - English translations (default fallback)
const enTranslations = {
    // HTML page
    pageTitle: 'Segelwetter',
    pageLang: 'en',
    headerTitle: 'Segelwetter',

    // Sailing advice
    sailingAdviceCat: 'Cat',
    sailingAdviceJolle: 'Hobie',
    sailingAdviceLoading: 'Calculating next suitable time slot...',
    noSlotFound: 'No good slot found 😢',
    slotFormat: '{date}, {time} — Base wind {wind} kt, Gusts {gusts} kt',

    // Bookmarks
    favoritesTitle: 'Favorites',
    deleteFavoriteConfirm: 'Really delete favorite "{name}"?',

    // Weather panel
    locationDefault: 'Location',
    kt: 'kt',
    celsius: '°C',

    // Map
    mapLocateLabel: 'Jump to my location',

    // Forecast table rows
    forecastBaseWind: 'Base wind',
    forecastGusts: 'Gusts',
    forecastTemperature: 'Temp.',
    forecastWindDirection: 'Wind dir.',
    forecastWaterTemp: 'Water temp.',
    forecastStorm: 'Storm',
    forecastWaveHeight: 'Wave height',
    noForecastData: 'No forecast data available',

    // Error banner
    errorWeatherLoadFailed: 'Weather data could not be loaded. Please try again later.',
    errorBannerClose: 'Close',

    // Wind directions
    directionN: 'N',
    directionNE: 'NE',
    directionE: 'E',
    directionSE: 'SE',
    directionS: 'S',
    directionSW: 'SW',
    directionW: 'W',
    directionNW: 'NW',

    // Modals
    searchClose: 'Close',

    // Dialogs (M13 – replaces window.confirm / window.prompt)
    dialogOk: 'OK',
    dialogCancel: 'Cancel',
    dialogDelete: 'Delete',
    dialogDeleteFavoriteTitle: 'Delete favorite',
    dialogRenameTitle: 'Rename location',
    dialogRenameLabel: 'New name',
    dialogSave: 'Save',

    // Loading
    loadingWeather: 'Loading weather data…',

    // iOS install prompt
    iosInstallTitle: '📱 Add to Home Screen',
    iosInstallStep1: 'Tap the share button <span class="share-icon">⬆️</span>',
    iosInstallStep2: 'Choose <strong>"Add to Home Screen"</strong>',
    iosInstallStep3: 'Tap <strong>"Add"</strong>',
    iosInstallDismiss: 'Got it',

    // Footer
    footerLicense: 'License: Beerware — If you like this app, buy me a coffee: <a href="https://ko-fi.com/florian500" target="_blank" rel="noopener">https://ko-fi.com/florian500</a>',
    footerMap: 'Map tiles & data: OpenStreetMap contributors — <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">ODbL</a>. Map display with <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a> (BSD-2-Clause).',
    footerWeather: 'Weather data: Open-Meteo.com – <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>; <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener">Terms of use</a>',

    // Console warnings
    consoleCannotSaveLocation: 'Cannot save last location.',
    consoleCannotLoadFavorites: 'Cannot load favorites.',
    consoleCannotSaveFavorites: 'Cannot save favorites.',
    consoleCannotLoadLocation: 'Cannot load last location.',
    consoleMarineWaveFailed: 'Marine wave height could not be loaded:',
    consoleWeatherFailed: 'Open-Meteo data could not be loaded:',
    consoleLeafletNotLoaded: 'Leaflet is not loaded.',
    consoleGeolocationNotSupported: 'Geolocation is not supported by this browser.',
    consoleGeolocationFailed: 'Current position could not be determined:',

    // Date/time locale
    dateLocale: 'en-GB'
};