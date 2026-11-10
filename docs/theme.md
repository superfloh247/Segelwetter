# Dark Mode (Theme-Architektur)

Segelwetter unterstützt Light und Dark Mode automatisch über die
Browser-Einstellung `prefers-color-scheme` – ohne Toggle-UI und ohne
`localStorage`. Der Wechsel wird zur Laufzeit erkannt und ohne Reload
umgesetzt.

## Wie es funktioniert

1. **Tokens**: `style.css` definiert alle Farben als CSS-Custom-Properties
   in `:root` (Light Mode = Default) und überschreibt dieselben Namen in
   `:root[data-theme="dark"]` (Dark Mode). Alle Regeln im restlichen
   Stylesheet referenzieren ausschließlich Tokens – keine festen Farben.
2. **Bootstrap ohne Flash**: Ein Inline-Skript in `index.html`
   (direkt nach `<meta name="description">`, **vor** dem
   `style.css`-Link) setzt bei `prefers-color-scheme: dark` sofort
   `data-theme="dark"` auf `<html>`. Dadurch ist das korrekte Theme
   schon beim ersten Paint aktiv (kein Light-Mode-Blitz).
3. **Laufzeit-Sync**: `theme.js` lädt `initTheme()` (aus `app.js` im
   `DOMContentLoaded`-Flow). `initTheme()` registriert einen
   `matchMedia('(prefers-color-scheme: dark)')`-Listener und schreibt bei
   jeder Änderung das `data-theme`-Attribut neu. Ältere Browser
   (Safari < 14.1) werden über `addListener` bedient.
4. **Karte bleibt hell**: Die OSM-Kacheln werden in beiden Themes
   identisch verwendet – kein Kachel-Wechsel. CARTO-Dark-Tiles
   (dark_all) wären die natürliche Dark-Variante, benötigen aber einen
   API-Key und sind daher bewusst nicht eingebunden. Stattdessen werden
   die Leaflet-UI-Elemente (Zoom-Buttons, Attribution) in style.css
   im Dark Mode dunkel umgestylt, damit sie zum App-UI passen.

## Token-Regeln (neue Farben)

- **Niemals** Hex/`rgb()`/`rgba()` außerhalb der zwei Token-Blöcke in
  `style.css` (Ausnahme: Dark-spezifische Einzelregeln, z. B. der
  helle Text auf den dunklen Wind-/Böen-Bands und die Leaflet-Attribution
  – beide bewusst Dark-only).
- Neue semantische Namen nach Schema: `--color-*` (Text/Akzente),
  `--bg-*` (Flächen), `--border-*`, `--shadow-*`, `--forecast-*`
  (Farbskalen der Vorhersagetabelle).
- Dark Mode = **Override desselben Namens**, nie neue Token nur für
  Dark. So muss jeder themenrelevante Token in beiden Blöcken vorkommen
  (in `tests/theme.test.js` abgesichert).
- `--color-white` bleibt bewusst weiß in beiden Themes: Es steht für
  „weiß auf dunklem Grund" (Buttons, Footer, Spinner). Flächen, die in
  Dark dunkel werden müssen, nutzen `--bg-surface` / `--bg-input`.

## Bekannte Grenzen

- **Wind-/Böen-Bands**: Die Farbbänder (blau → rot) sind in beiden
  Themes gleich. In Dark wird die Textfarbe pro Band gewechselt
  (helle Bänder → dunkler Text, dunkle Bänder → heller Text).
- **Gezeiten-Bands** (`--forecast-tide-high/low`) sind in beiden Themes
  gleich (helle Flächen, dunkler Text) – bleibt auch bei neuen Tokens so.
- **Kartenmarken** (`wind-arrow-marker`) bleiben in beiden Themes
  hell/weiß mit dunklem Text, damit sie auf den Kacheln lesbar sind;
  die weißen Textglow-Shadows (`--text-shadow-light-*`) sind bewusst
  nicht themenabhängig.

## Tests

`node tests/theme.test.js` prüft ohne Browser:

- `theme.js`-Verhalten (Attribut-Setzen, Event-Dispatch,
  `matchMedia`-Change, Legacy-`addListener`-Pfad, fehlendes `matchMedia`)
- dass der Bootstrap-Snippet in `index.html` vor dem Stylesheet-Link
  steht und bei Dark-Präferenz `data-theme="dark"` setzt
- dass jeder themenrelevante Token aus `:root` in
  `:root[data-theme="dark"]` überschrieben ist
- dass außerhalb der Token-Blöcke keine festen Farben übrig sind