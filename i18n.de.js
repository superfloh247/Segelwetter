// Segelwetter i18n - Deutsche Übersetzungen (German translations)
const deTranslations = {
    // HTML page
    pageTitle: 'Segelwetter',
    pageLang: 'de',
    headerTitle: 'Segelwetter',

    // Sailing advice
    sailingAdviceCat: 'Cat',
    sailingAdviceJolle: 'Jolle',
    noSlotFound: 'Kein guter Termin gefunden 😢',
    slotFormat: '{date}, {time} Uhr — Grundwind {wind} kt, Böen {gusts} kt',

    // Bookmarks
    favoritesTitle: 'Favoriten',
    deleteFavoriteConfirm: 'Favorit "{name}" wirklich löschen?',

    // Weather panel
    locationDefault: 'Standort',
    celsius: '°C',

    // Map
    mapLocateLabel: 'Zu meiner Position springen',

    // Forecast table rows
    forecastBaseWind: 'Grundwind',
    forecastGusts: 'Böen',
    forecastTemperature: 'Temperatur',
    forecastWindDirection: 'Windrichtung',
    forecastWaterTemp: 'Wassertemp.',
    forecastStorm: 'Gewitter',
    forecastWaveHeight: 'Wellenhöhe',
    forecastTide: 'Tide',
    tideHigh: 'Hochwasser',
    tideLow: 'Niedrigwasser',
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
    footerWeather: 'Wetterdaten: Open-Meteo.com – <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>; <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener">Nutzungsbedingungen</a>',
    footerTide: 'Gezeiten: <a href="https://www.dgfi.tum.de/en/science-data-products/eot/" target="_blank" rel="noopener">EOT20</a> (DGFI/TUM, <a href="https://doi.org/10.17882/79489" target="_blank" rel="noopener">10.17882/79489</a>). Zitation: Hart-Davis M., Piccioni G., Dettmering D., Schwatke C., Passaro M., Seitz F.: EOT20: a global ocean tide model from multi-mission satellite altimetry. <em>Earth System Science Data</em>, 13, 3869–3884, <a href="https://doi.org/10.5194/essd-13-3869-2021" target="_blank" rel="noopener">doi:10.5194/essd-13-3869-2021</a>, 2021.',

    // Console warnings
    consoleCannotSaveLocation: 'Kann letzte Position nicht speichern.',
    consoleCannotLoadFavorites: 'Kann Favoriten nicht laden.',
    consoleCannotSaveFavorites: 'Kann Favoriten nicht speichern.',
    consoleCannotLoadLocation: 'Kann letzte Position nicht laden.',
    consoleMarineFailed: 'Marine-Daten konnten nicht geladen werden:',
    consoleWeatherFailed: 'Open-Meteo-Daten konnten nicht geladen werden:',
    consoleLeafletNotLoaded: 'Leaflet ist nicht geladen.',
    consoleGeolocationNotSupported: 'Geolokalisierung wird von diesem Browser nicht unterstützt.',
    consoleGeolocationFailed: 'Aktuelle Position konnte nicht ermittelt werden:',

    // Date/time locale
    dateLocale: 'de-DE'
};