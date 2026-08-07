# Segelwetter – Code Audit Report (2026-08-07)

## Übersicht
Single-page Wetter-App für Segler mit Leaflet-Karte, Open-Meteo API, Favoriten und Stundenvorhersage.  
Stack: HTML/CSS/vanilla JS, keine Build-Pipeline, direkt lauffähig.

---

## Findings nach Priorität

### 🔴 Kritisch
**Keine gefunden.** Die App ist funktional stabil.

### 🟠 Hoch
1. **API-Rate-Limit nicht berücksichtigt** – `loadWeatherForCoords` kann jederzeit aufgerufen werden; Open-Meteo hat ein faires Limit (ca. 200–500 req/Tag). Keine Caching-Strategie → Gefahr von throttled Requests bei schnellem Klick-Feuern.
2. **Kein Error-Banner im DOM** – Fehler werden nur in die Console gewandelt; `displayWeather()` zeigt `-` ohne sichtbare Meldung für den User.
3. ~~**Marine API timeout fehlt**~~ — **GEFIXT:** Beide `fetch*`-Funktionen verwenden nun `AbortController` mit 8s Timeout. ✅

### 🟡 Mittel
4. **Inline-Styles im Forecast-Table** (`script.js:546-555`) – Farben werden per `style="background:..."` gesetzt statt über CSS-Klassen → schlechte Wartbarkeit, kein Dark-Mode möglich.
5. ~~**`selectedForecastColumn` global und nicht initialisiert**~~ — **GEFIXT:** Initialisierung von `0` auf `-1` geändert; erste Datanummer wird automatisch ausgewählt nach dem Laden des Wetters. ✅
6. ~~**Redundant: `@keyframes spin` doppelt definiert**~~ — **GEFIXT:** Duplikat entfernt, nur eine Definition übrig. ✅
7. ~~**Footer doppeltes Kapitel**~~ — **GEFIXT:** Zweiter `/* Footer */`-Block ersetzt durch korrekten `/* Responsives Design */`-Kopf. ✅
8. **`alt` für `apple-touch-icon.png`** – accessibility irrelevant (Icon), aber `<link>` fehlt ein `sizes` Attribut.
9. **`parseCoordinates` akzeptiert nur `lat,lon` Format** – keine geografischen Namen (OpenStreetMap Nominim API verfügbar).

### 🟢 Niedrig / Kosmetisch
10. **`if (typeof module !== 'undefined')` am Ende** (`script.js:818`) – Node.js-Export wird nie benötigt; tote Code-Zeile.
11. **Kein `.gitignore`** – kein Build-Artifact, aber auch keine zu ignorierende Datei existiert. Optional.
12. **ETag/Cache-Control für statische Dateien nicht konfiguriert** – betrifft nur Self-Hosting; GitHub Pages nutzt bereits Cache.

---

## Positiv
- ✅ Clean separation: HTML / CSS / JS klar getrennt
- ✅ Robust gegenüber fehlenden Marine-Daten (`.catch(() => null)`)
- ✅ Race-Condition fix bei Bookmark-Laden (`isLoadingBookmark` guard)
- ✅ `localStorage` Fehler werden try/catch abgesichert
- ✅ Responsive Design mit Media Queries
- ✅ Open-Meteo ist kostenlos, keine API-Key-Pflicht

---

## Empfohlene nächste Schritte
1. [P1] Caching der API-Antworten (z.B. `localStorage` mit 30min TTL)
2. [P1] `AbortController` + 8s timeout für fetch-Calls
3. [P1] Sichtbares Error-Banner statt nur Console.warn
4. [P2] Inline-Styles durch CSS utility classes ersetzen
5. [P2] Nominatim Geocoding für Ortsname-Suche
6. [P3] `module.exports` entfernen
