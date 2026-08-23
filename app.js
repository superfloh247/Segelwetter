// Segelwetter – app bootstrap (split from script.js)

async function initApp() {
    // Apply translations to all static HTML elements based on detected language
    applyTranslations();

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
    await loadWeatherForCoords(weatherData.coords.lat, weatherData.coords.lng, weatherData.location);
    showIOSInstallPrompt();
}

// i18n.js übersetzt statische HTML-Elemente und dispatcht dieses Event danach;
// dynamischer Inhalt (Vorhersagetabelle, Segelberatung, Windanzeige) wird hier
// neu gerendert, damit i18n.js keinen Zugriff auf IIFE-interne Variablen braucht.
window.addEventListener('segelwetter:translations-applied', () => {
    updateSailingAdvice();
    displayHourlyForecast();
    if (elements.windDirection && weatherData.wind.direction) {
        elements.windDirection.textContent = formatWindDirection(weatherData.wind.direction, weatherData.wind.directionDegrees);
    }
});

document.addEventListener('DOMContentLoaded', initApp);