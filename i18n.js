// Internationalization (i18n) for Segelwetter
// Supports: de (German), en (English - default fallback)
// Dictionary data lives in i18n.en.js and i18n.de.js (loaded before this file).

const translations = {
    en: enTranslations,
    de: deTranslations
};

/**
 * Detect the user's preferred language from navigator settings.
 * Returns 'de' for German, 'en' for everything else (English fallback).
 */
function detectLanguage() {
    const locales = [];

    // navigator.language gives the browser's preferred language
    if (navigator.language) {
        locales.push(navigator.language.toLowerCase());
    }

    // navigator.languages gives an array of preferred languages (Chrome/Firefox)
    if (navigator.languages && navigator.languages.length > 0) {
        for (let i = 0; i < navigator.languages.length; i++) {
            const lang = navigator.languages[i].toLowerCase();
            if (!locales.includes(lang)) {
                locales.push(lang);
            }
        }
    }

    for (let i = 0; i < locales.length; i++) {
        const locale = locales[i];
        // Check for German: 'de', 'de-DE', 'de-AT', 'de-CH', etc.
        if (locale.startsWith('de')) {
            return 'de';
        }
    }

    // Default fallback is English
    return 'en';
}

/**
 * Get the current active language.
 */
function getCurrentLanguage() {
    return window.__segelwetterLang || detectLanguage();
}

/**
 * Translate a key. Returns the translated string, or the key itself if not found.
 * @param {string} key - The translation key
 * @returns {string} The translated string
 */
function t(key) {
    const lang = getCurrentLanguage();
    const dict = translations[lang] || translations.en;
    return dict[key] !== undefined ? dict[key] : (translations.en[key] !== undefined ? translations.en[key] : key);
}

/**
 * Apply translations to all static HTML elements.
 */
function applyTranslations() {
    // Update html lang attribute
    document.documentElement.lang = t('pageLang');

    // Update page title
    document.title = t('pageTitle');

    // Update header
    const headerH1 = document.querySelector('.header h1');
    if (headerH1) headerH1.textContent = t('headerTitle');

    // Update location name (initial default, before weather loads)
    const locationNameEl = document.getElementById('locationName');
    if (locationNameEl) locationNameEl.textContent = t('locationDefault');

    // Update sailing advice labels
    const catLabel = document.querySelector('#sailingAdviceCat').parentElement.querySelector('strong');
    if (catLabel) catLabel.textContent = t('sailingAdviceCat');

    const jolleLabel = document.querySelector('#sailingAdviceJolle').parentElement.querySelector('strong');
    if (jolleLabel) jolleLabel.textContent = t('sailingAdviceJolle');

    // Update favorites heading
    const favHeading = document.querySelector('.bookmarks-section h3');
    if (favHeading) favHeading.textContent = t('favoritesTitle');

    // Update search modal
    const searchTitleEl = document.querySelector('#searchModal .modal-content h2');
    if (searchTitleEl) searchTitleEl.textContent = t('searchTitle');

    const closeBtn = document.querySelector('.modal .close');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('searchClose'));

    const searchLabelEl = document.querySelector('#searchModal label.visually-hidden');
    if (searchLabelEl) searchLabelEl.textContent = t('searchLabel');

    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) searchInputEl.placeholder = t('searchPlaceholder');

    const searchSubmitEl = document.getElementById('searchSubmit');
    if (searchSubmitEl) searchSubmitEl.textContent = t('searchButton');

    // Update loading overlay
    const loadingText = document.querySelector('#loadingOverlay p');
    if (loadingText) loadingText.textContent = t('loadingWeather');

    // Update iOS install prompt
    const iosTitle = document.querySelector('#iosInstallOverlay .ios-install-content h2');
    if (iosTitle) iosTitle.innerHTML = t('iosInstallTitle');

    const iosSteps = document.querySelectorAll('.ios-install-steps li');
    if (iosSteps.length >= 3) {
        iosSteps[0].innerHTML = t('iosInstallStep1');
        iosSteps[1].innerHTML = t('iosInstallStep2');
        iosSteps[2].innerHTML = t('iosInstallStep3');
    }

    const iosDismiss = document.getElementById('iosInstallDismiss');
    if (iosDismiss) iosDismiss.textContent = t('iosInstallDismiss');

    // Update footer
    const footerPs = document.querySelectorAll('.app-footer p');
    if (footerPs.length >= 3) {
        footerPs[0].innerHTML = t('footerLicense');
        footerPs[1].innerHTML = t('footerMap');
        footerPs[2].innerHTML = t('footerWeather');
    }

    // Re-render dynamic content with new language
    if (typeof updateSailingAdvice === 'function') {
        updateSailingAdvice();
    }
    if (typeof displayHourlyForecast === 'function') {
        displayHourlyForecast();
    }
    if (elements.windDirection && weatherData.wind.direction) {
        elements.windDirection.textContent = formatWindDirection(weatherData.wind.direction, weatherData.wind.directionDegrees);
    }
}

// Initialize language on load
window.__segelwetterLang = detectLanguage();