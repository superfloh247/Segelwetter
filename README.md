# Segelwetter

Wettervorhersage-App für Segler – zeigt Wind, Temperatur und Seebedingungen interaktiv auf einer Karte an.

## Features

- **Interaktive Karte** – OpenStreetMap mit Leaflet; Doppelklick (Desktop) oder Tap (Mobile) zum Auswählen eines Ortes
- **Stündliche Vorhersage** – 7-Tage-Prognose mit Grundwind, Böen, Temperatur und Windrichtung (farbkodierte Darstellung)
- **Segelberatung** – Empfohlene Segelzeiten für Catamaran (8–14 kt) und Jolle (3–6 kt)
- **Marinedaten** – Wellenhöhe und Wassertemperatur (falls verfügbar)
- **Gewitterwarnung** – CAPE-basierte Gewitteranzeige
- **Favoriten** – Orte speichern und schnell wechseln (localStorage)
- **iOS PWA** – Installierbar als Standalone-App mit Pull-to-Refresh

## Technologien

- HTML / CSS / Vanilla JavaScript (keine Build-Tools nötig)
- [Leaflet](https://leafletjs.com/) – interaktive Kartenanzeige
- [Open-Meteo API](https://open-meteo.com) – Wetter- und Marinedaten (kein API-Key erforderlich)
- [OpenStreetMap](https://www.openstreetmap.org/) – Kartentiles

## Nutzung

Öffne `index.html` im Browser oder hoste das Verzeichnis über einen lokalen Webserver:

```bash
npx serve .
# oder
python3 -m http.server 8080
```

### Bedienung

- **Ort auswählen:** Doppelklick auf die Karte (Desktop) bzw. Tap (Mobile)
- **Vorhersage-Stunde wählen:** Klick auf eine Zelle in der Vorhersagetabelle
- **Favorit speichern:** ⭐-Button klicken
- **Ortsnamen ändern:** Auf die Koordinate / den Ortsnamen tippen/klicken
- **Pull-to-Refresh:** Nur im PWA/Standalone-Modus auf iOS

## Lizenz

Beerware – wenn dir die App gefällt, spendiere dem Autor einen Kaffee: [ko-fi.com/florian500](https://ko-fi.com/florian500)

## Datenquellen & Drittlizenzen

- Kartenkacheln: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) – ODbL
- Kartenanzeige: [Leaflet](https://leafletjs.com/) – BSD-2-Clause
- Wetterdaten: [Open-Meteo](https://open-meteo.com) – siehe Nutzungsbedingungen auf der Webseite
- Gezeitendaten: [EOT20](https://www.dgfi.tum.de/en/science-data-products/eot/) – globales Gezeitenmodell von [DGFI/TUM](https://www.dgfi.tum.de/), Gittermodell [10.17882/79489](https://doi.org/10.17882/79489). Beim Verwenden der Daten wird die Zitation des Open-Access-Artikels verlangt:
  > Hart-Davis M., Piccioni G., Dettmering D., Schwatke C., Passaro M., Seitz F.: EOT20: a global ocean tide model from multi-mission satellite altimetry. *Earth System Science Data*, 13, 3869–3884, [doi:10.5194/essd-13-3869-2021](https://doi.org/10.5194/essd-13-3869-2021), 2021.