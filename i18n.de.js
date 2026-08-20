// Segelwetter i18n - Deutsche Übersetzungen (German translations)
const deTranslations = {
    // HTML page
    pageTitle: 'Segelwetter',
    pageLang: 'de',
    headerTitle: 'Segelwetter',

    // Sailing advice
    sailingAdviceCat: 'Cat',
    sailingAdviceJolle: 'Jolle',
    sailingAdviceLoading: 'Berechne den nächsten geeigneten Zeitraum...',
    noSlotFound: 'Kein guter Termin gefunden 😢',
    slotFormat: '{date}, {time} Uhr — Grundwind {wind} kt, Böen {gusts} kt',

    // Bookmarks
    favoritesTitle: 'Favoriten',
    deleteFavoriteConfirm: 'Favorit "{name}" wirklich löschen?',

    // Weather panel
    locationDefault: 'Standort',
    kt: 'kt',
    celsius: '°C',

    // Forecast table rows
    forecastBaseWind: 'Grundwind',
    forecastGusts: 'Böen',
    forecastTemperature: 'Temperatur',
    forecastWindDirection: 'Windrichtung',
    forecastWaterTemp: 'Wassertemp.',
    forecastStorm: 'Gewitter',
    forecastWaveHeight: 'Wellenhöhe',
    noForecastData: 'Keine Vorhersagedaten verfügbar',

    // Error banner
    errorWeatherLoadFailed: 'Wetterdaten konnten nicht geladen werden. Bitte versuche es später erneut.',
    errorBannerClose: 'Schließen',

    // Wind directions
    directionN: 'Norden',
    directionNE: 'Nord-Osten',
    directionE: 'Osten',
    directionSE: 'Süd-Osten',
    directionS: 'Süden',
    directionSW: 'Süd-West',
    directionW: 'Westen',
    directionNW: 'Nord-West',

    // Modals
    searchClose: 'Schließen',

    // Dialoge (M13 – ersetzt window.confirm / window.prompt)
    dialogOk: 'OK',
    dialogCancel: 'Abbrechen',
    dialogDelete: 'Löschen',
    dialogDeleteFavoriteTitle: 'Favorit löschen',
    dialogRenameTitle: 'Ortsname ändern',
    dialogRenameLabel: 'Neuer Name',
    dialogSave: 'Speichern',

    // Loading
    loadingWeather: 'Lädt Wetterdaten…',

    // iOS install prompt
    iosInstallTitle: '📱 Zum Home-Bildschirm hinzufügen',
    iosInstallStep1: 'Tippe auf das Teilen-Symbol <span class="share-icon">⬆️</span>',
    iosInstallStep2: 'Wähle <strong>"Zum Home-Bildschirm"</strong>',
    iosInstallStep3: 'Tippe auf <strong>"Hinzufügen"</strong>',
    iosInstallDismiss: 'Verstanden',

    // Footer
    footerLicense: 'Lizenz: Beerware — Wenn dir diese App gefällt, spendiere mir einen Kaffee: <a href="https://ko-fi.com/florian500" target="_blank" rel="noopener">https://ko-fi.com/florian500</a>',
    footerMap: 'Kartenkacheln & Daten: OpenStreetMap contributors — <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">ODbL</a>. Kartenanzeige mit <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a> (BSD-2-Clause).',
    footerWeather: 'Wetterdaten: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> — siehe Nutzungsbedingungen und Lizenz auf deren Webseite.',

    // Console warnings
    consoleCannotSaveLocation: 'Kann letzte Position nicht speichern.',
    consoleCannotLoadFavorites: 'Kann Favoriten nicht laden.',
    consoleCannotSaveFavorites: 'Kann Favoriten nicht speichern.',
    consoleCannotLoadLocation: 'Kann letzte Position nicht laden.',
    consoleMarineWaveFailed: 'Marine-Wellenhöhe konnte nicht geladen werden:',
    consoleWeatherFailed: 'Open-Meteo-Daten konnten nicht geladen werden:',
    consoleLeafletNotLoaded: 'Leaflet ist nicht geladen.',

    // Date/time locale
    dateLocale: 'de-DE'
};