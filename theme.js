// Segelwetter – Theme-Handling (Dark Mode)
//
// Light Mode ist der CSS-Default (:root in style.css). Dark Mode aktiviert
// :root[data-theme="dark"] über das data-theme-Attribut auf <html>:
//   - Vor dem ersten Paint setzt der Bootstrap-Snippet in index.html das
//     Attribut (keine Light-Mode-Blitz).
//   - initTheme() hält das Attribut laufend synchron, wenn der
//     prefers-color-scheme des Betriebssystems zur Laufzeit wechselt.
// map.js hört bewusst NICHT auf Theme-Events: Die OSM-Kacheln bleiben
// in beiden Themes hell (CARTO-Dark-Tiles brauchen einen API-Key).

const THEME_CHANGE_EVENT = 'segelwetter:theme-changed';

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: currentTheme() } }));
}

function initTheme() {
    if (!('matchMedia' in window)) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setTheme(media.matches ? 'dark' : 'light');
    // onChange (alt) und addEventListener (moderne Browser) – beides guarded,
    // damit der Bootstrap-Snippet in index.html denselben Code ausführen kann.
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', apply);
    } else if (typeof media.addListener === 'function') {
        media.addListener(apply);
    }
    apply();
}