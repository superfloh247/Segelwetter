'use strict';
// Dark Mode (Theme)-Tests (theme.js + index.html-Bootstrap + style.css-Tokens)
// Läuft unter Node ohne externe Abhängigkeiten:
//  - theme.js und der Bootstrap-Snippet laufen in vm-Isolierung (klassische
//    Skript-Semantik wie im Browser) mit emuliertem document/window/matchMedia
//  - style.css wird statisch geprüft: Token-Abdeckung Light↔Dark und
//    dass außerhalb der Token-Blöcke keine festen Farben übrig sind

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const THEME_CHANGE_EVENT = 'segelwetter:theme-changed';

// Tokens, die bewusst in Light und Dark gleich bleiben (siehe docs/theme.md):
// Wind-/Böen-Farbskalen, Gezeiten-Flächen, Radien und der weiße Text-Glow.
// Alles andere, was in :root definiert ist, MUSS in Dark überschrieben sein.
const BOTH_SIDES_TOKENS = new Set([
    '--forecast-wind-0-6', '--forecast-wind-6-10', '--forecast-wind-10-12',
    '--forecast-wind-12-15', '--forecast-wind-15-30', '--forecast-wind-30',
    '--forecast-gust-0-14', '--forecast-gust-14-18', '--forecast-gust-18-30', '--forecast-gust-30',
    '--forecast-tide-high', '--forecast-tide-low',
    '--radius-lg', '--radius-md', '--radius-sm',
    '--text-shadow-light-sm', '--text-shadow-light-md'
]);

// Feste Farben, die ausnahmsweise außerhalb der Token-Blöcke erlaubt sind
// (normalisiert ohne Leerzeichen). Beide sind bewusst Dark-only.
const RAW_COLOR_EXCEPTIONS = new Set([
    '#fdf2ec',                 // heller Text auf den dunklen Wind-/Böen-Bands
    'rgba(24,30,45,0.85)'      // Leaflet-Attribution-Hintergrund (Dark)
]);

let passed = 0;
const failures = [];
function test(name, fn) {
    return Promise.resolve().then(() => {
        try { fn(); passed++; console.log('ok - ' + name); }
        catch (err) { failures.push(name); console.error('FAIL - ' + name + '\n      ' + (err && err.message)); }
    });
}

// ---------- Emulation: matchMedia ----------

// Liefert ein Media-Query-Object. modern=true → addEventListener,
// modern=false → Legacy addListener (Safari < 14.1).
function makeMatchMedia(initialMatches, modern = true) {
    const listeners = [];
    const media = { matches: initialMatches };
    if (modern) {
        media.addEventListener = (type, fn) => { listeners.push(fn); };
    } else {
        media.addListener = (fn) => { listeners.push(fn); };
    }
    media.__fireChange = () => { for (const fn of listeners) fn({ matches: media.matches }); };
    return media;
}

// ---------- Emulation: theme.js-Umgebung ----------

function loadThemeModule({ matchMedia } = {}) {
    const attrs = {};
    const dispatched = [];
    const sandbox = {
        document: {
            documentElement: {
                getAttribute: (n) => (n in attrs ? attrs[n] : null),
                setAttribute: (n, v) => { attrs[n] = v; }
            }
        },
        CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
        window: null,
        dispatchEvent: (ev) => { dispatched.push(ev); return true; }
    };
    if (matchMedia) sandbox.matchMedia = matchMedia;
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(ROOT, 'theme.js'), 'utf8');
    vm.runInContext(source, context);
    return { context, attrs, dispatched };
}

// ---------- Statik: style.css ----------

// Liefert [startIdx, endIdx] (0-basiert, inklusiv) des Regelblocks, dessen
// Selektor-Zeile mit `selectorPrefix` beginnt bzw. exakt gleich ist.
function lineRangeOfBlock(css, selectorPrefix, exactLine) {
    const lines = css.split('\n');
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        // Kommentar-Zeilen (z. B. ":root[data-theme=…] weiter unten") dürfen
        // nicht matchen: eine Selektor-Zeile endet immer mit "{".
        const ok = (exactLine ? t === selectorPrefix : t.startsWith(selectorPrefix)) && t.includes('{');
        if (ok) { startIdx = i; break; }
    }
    if (startIdx < 0) return null;
    let braceCount = 0, opened = false, endIdx = lines.length - 1;
    for (let i = startIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { braceCount++; opened = true; }
            else if (ch === '}') braceCount--;
        }
        if (opened && braceCount === 0) { endIdx = i; break; }
    }
    return [startIdx, endIdx];
}

function tokenNamesInLineRange(css, range) {
    const names = new Set();
    const lines = css.split('\n');
    const re = /^\s*(--[a-zA-Z0-9-]+)\s*:/;
    for (let i = range[0]; i <= range[1]; i++) {
        const m = re.exec(lines[i]);
        if (m) names.add(m[1]);
    }
    return names;
}

(async () => {
    const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    // ---------- theme.js: currentTheme / setTheme ----------

    await test('currentTheme: Default light (kein Attribut), dark wenn Attribut gesetzt', () => {
        const { context } = loadThemeModule();
        assert.strictEqual(context.currentTheme(), 'light');
        context.setTheme('dark');
        assert.strictEqual(context.currentTheme(), 'dark');
    });

    await test('setTheme: schreibt Attribut und dispatcht segelwetter:theme-changed mit detail.theme', () => {
        const { context, dispatched, attrs } = loadThemeModule();
        context.setTheme('dark');
        assert.strictEqual(attrs['data-theme'], 'dark');
        assert.strictEqual(dispatched.length, 1);
        assert.strictEqual(dispatched[0].type, THEME_CHANGE_EVENT);
        // detail kommt aus dem vm-Realm → Feldvergleich statt deepStrictEqual
        assert.strictEqual(dispatched[0].detail.theme, 'dark');
        context.setTheme('light');
        assert.strictEqual(attrs['data-theme'], 'light');
        assert.strictEqual(dispatched[1].detail.theme, 'light');
    });

    await test('setTheme: normalisiert jeden anderen Wert auf light', () => {
        const { context, attrs } = loadThemeModule();
        context.setTheme('blau');
        assert.strictEqual(attrs['data-theme'], 'light');
        context.setTheme(null);
        assert.strictEqual(attrs['data-theme'], 'light');
    });

    // ---------- theme.js: initTheme ----------

    await test('initTheme: matchMedia dark → sofort data-theme=dark', () => {
        const { context, attrs } = loadThemeModule({ matchMedia: () => makeMatchMedia(true) });
        context.initTheme();
        assert.strictEqual(attrs['data-theme'], 'dark');
    });

    await test('initTheme: matchMedia light → bleibt light', () => {
        const { context, attrs } = loadThemeModule({ matchMedia: () => makeMatchMedia(false) });
        context.initTheme();
        assert.strictEqual(attrs['data-theme'], 'light');
    });

    await test('initTheme: Laufzeit-Wechsel (change-Event) aktualisiert Attribut', () => {
        const mm = makeMatchMedia(true); // startet dark
        const { context, attrs } = loadThemeModule({ matchMedia: () => mm });
        context.initTheme();
        assert.strictEqual(attrs['data-theme'], 'dark');
        mm.matches = false; mm.__fireChange();
        assert.strictEqual(attrs['data-theme'], 'light');
        mm.matches = true; mm.__fireChange();
        assert.strictEqual(attrs['data-theme'], 'dark');
    });

    await test('initTheme: Legacy addListener (Safari < 14.1) wird bedient', () => {
        const mm = makeMatchMedia(false, /* modern */ false);
        const { context, attrs } = loadThemeModule({ matchMedia: () => mm });
        context.initTheme();
        assert.strictEqual(attrs['data-theme'], 'light');
        mm.matches = true; mm.__fireChange();
        assert.strictEqual(attrs['data-theme'], 'dark');
    });

    await test('initTheme: fehlendes matchMedia → keine Fehler, kein Attribut', () => {
        const { context, attrs } = loadThemeModule(); // kein matchMedia
        assert.doesNotThrow(() => context.initTheme());
        assert.strictEqual(attrs['data-theme'], undefined);
    });

    // ---------- index.html: Bootstrap ----------

    await test('index.html: Theme-Bootstrap steht VOR dem style.css-Link (kein Light-Blitz)', () => {
        const bootIdx = html.indexOf('prefers-color-scheme');
        const cssIdx = html.indexOf('style.css');
        assert.ok(bootIdx > -1, 'Bootstrap mit prefers-color-scheme fehlt');
        assert.ok(cssIdx > -1, 'style.css-Link fehlt');
        assert.ok(bootIdx < cssIdx, 'Bootstrap muss vor dem Stylesheet ausgeführt werden');
    });

    await test('index.html: bindet theme.js ein', () => {
        assert.ok(/<script\s+src=["']theme\.js["']/.test(html), '<script src="theme.js"> fehlt');
    });

    await test('index.html: Bootstrap-Snippet setzt bei Dark-Präferenz data-theme=dark (und sonst nichts)', () => {
        const m = html.match(/<script>([\s\S]*?prefers-color-scheme[\s\S]*?)<\/script>/);
        assert.ok(m, 'Inline-Bootstrap-Skript (mit prefers-color-scheme) nicht gefunden');
        const snippet = m[1];
        function runSnippet(darkPref) {
            const attrs = {};
            const sandbox = {
                document: { documentElement: { setAttribute: (n, v) => { attrs[n] = v; } } },
                window: null,
                matchMedia: (q) => ({ matches: darkPref, media: q })
            };
            sandbox.window = sandbox;
            vm.runInContext(snippet, vm.createContext(sandbox));
            return attrs;
        }
        assert.strictEqual(runSnippet(true)['data-theme'], 'dark');
        assert.strictEqual(runSnippet(false)['data-theme'], undefined);
    });

    // ---------- style.css: Token-Abdeckung ----------

    await test('style.css: Light- und Dark-Block existieren', () => {
        const lightRange = lineRangeOfBlock(css, ':root {', true);
        const darkRange = lineRangeOfBlock(css, ':root[data-theme="dark"]', false);
        assert.ok(lightRange, 'Light-Block :root fehlt');
        assert.ok(darkRange, 'Dark-Block :root[data-theme="dark"] fehlt');
        assert.ok(tokenNamesInLineRange(css, lightRange).size > 0, 'Light-Block hat keine Tokens');
    });

    await test('style.css: jeder themenrelevante Light-Token wird in Dark überschrieben', () => {
        const lightRange = lineRangeOfBlock(css, ':root {', true);
        const darkRange = lineRangeOfBlock(css, ':root[data-theme="dark"]', false);
        const lightTokens = tokenNamesInLineRange(css, lightRange);
        const darkTokens = tokenNamesInLineRange(css, darkRange);
        const missing = [...lightTokens].filter(t => !BOTH_SIDES_TOKENS.has(t) && !darkTokens.has(t));
        assert.deepStrictEqual(missing, [],
            'Diese themenrelevanten Tokens fehlen im Dark-Block: ' + missing.join(', '));
    });

    // ---------- style.css: keine festen Farben außerhalb der Token-Blöcke ----------

    await test('style.css: außerhalb der Token-Blöcke nur dokumentierte Ausnahmen', () => {
        const lightRange = lineRangeOfBlock(css, ':root {', true);
        const darkRange = lineRangeOfBlock(css, ':root[data-theme="dark"]', false);
        const inBlock = (i) =>
            (lightRange && i >= lightRange[0] && i <= lightRange[1]) ||
            (darkRange && i >= darkRange[0] && i <= darkRange[1]);
        const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
        const found = new Set();
        css.split('\n').forEach((line, i) => {
            if (inBlock(i)) return;
            let m;
            while ((m = colorRe.exec(line)) !== null) found.add(m[0].replace(/\s+/g, ''));
        });
        const unexpected = [...found].filter(c => !RAW_COLOR_EXCEPTIONS.has(c));
        assert.deepStrictEqual(unexpected, [],
            'Unerwartete feste Farben außerhalb der Token-Blöcke: ' + unexpected.join(', '));
    });

    // ---------- Ergebnis ----------
    console.log('\n' + passed + ' bestanden, ' + failures.length + ' fehlgeschlagen');
    if (failures.length > 0) {
        console.error('Fehlgeschlagene Tests: ' + failures.join(', '));
        process.exit(1);
    }
})().catch(err => { console.error(err); process.exit(1); });