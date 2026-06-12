# ADR 007: Einheitliches Design-System für SVWS-Apps

## Status
Akzeptiert

## Kontext
SVWS-Conference und SVWS-Import sind eigenständige SPAs, die aber als zusammengehörige
Produktfamilie wahrgenommen werden sollen. Um ein einheitliches Erscheinungsbild zu
schaffen, wurde SVWS-Conference auf das visuelle System von SVWS-Import angeglichen.
Dabei wurden mehrere Fehlannahmen über PrimeVue 4 / Aura aufgedeckt, die für künftige
Apps relevant sind.

## Entscheidung
Das Design-System basiert auf der **Emerald-Farbpalette** als Primärfarbe und verwendet
ausschließlich explizit definierte CSS Custom Properties — keine Abhängigkeit von
PrimeVue-internen Tokens.

## Kritische Erkenntnisse zu PrimeVue 4 (Aura-Theme)

### Primärfarbe ist Emerald, nicht Blau
PrimeVue Aura verwendet standardmäßig **Emerald** als Primary-Farbe — nicht Blau.
Ermittelbar über:
```
node_modules/@primeuix/themes/dist/aura/base/index.mjs
```
- Light: `#059669` (Emerald-600)
- Dark: `#34d399` (Emerald-400)

### `--p-surface-ground` existiert nicht
PrimeVue 4 generiert **keine** Legacy-Variablen wie `--p-surface-ground` oder
`--p-surface-card`. Nur numerische Stufen (`--p-surface-50` bis `--p-surface-950`)
werden erzeugt. Wer diese Variablen nutzt, erhält transparent/undefined.

Der dunkle Teal-Hintergrund in SVWS-Import kommt vom **System-GTK-Theme des Nutzers**
(Linux), nicht von PrimeVue. Die App selbst setzt keinen expliziten Hintergrund.

**Konsequenz:** Hintergrundfarben immer selbst explizit definieren.

## Farbpalette

### Light Mode
| Token | Wert | Verwendung |
|---|---|---|
| `--accent` | `#059669` | Primäre Akzentfarbe (Emerald-600) |
| `--accent-hover` | `#047857` | Hover-Zustand |
| `--bg-a` / `--bg-b` | `#edfbf4` / `#f0fdf9` | Hintergrund-Gradient (Landing) |
| `--surface` | `#ffffff` | Karten, Modals |
| `--conf-bg` | `#f8fafc` | Konferenz-Hintergrund (Slate-50) |
| `--conf-accent` | `#059669` | Akzent in Konferenz-Komponenten |
| `--conf-ink` | `#1e293b` | Primärer Text |
| `--conf-border` | `#cbd5e1` | Rahmen |

### Dark Mode
| Token | Wert | Verwendung |
|---|---|---|
| `--accent` | `#34d399` | Primäre Akzentfarbe (Emerald-400) |
| `--bg-a` / `--bg-b` | `#091c19` / `#0c1a14` | Hintergrund-Gradient (Landing) |
| `--surface` | `#142b25` | Karten, Modals (Emerald-getönt) |
| `--conf-bg` | `#0d201c` | Konferenz-Hintergrund |
| `--conf-accent` | `#34d399` | Akzent in Konferenz-Komponenten |
| `--conf-ink` | `#f1f5f9` | Primärer Text |
| `--conf-border` | `#2a4040` | Rahmen |

### Hintergrund-Gradient (Body)
```css
body {
  background:
    radial-gradient(circle at 10% 20%, rgba(5, 150, 105, 0.10), transparent 38%),
    radial-gradient(circle at 90% 15%, rgba(15, 143, 143, 0.10), transparent 30%),
    linear-gradient(140deg, var(--bg-a), var(--bg-b));
}
```

## Dark-Mode-Implementierung

Dark Mode wird über die CSS-Klasse `dark` auf `<html>` gesteuert:
```css
:root { /* Light-Variablen */ }
:root.dark { /* Dark-Variablen */ }
```

Theme-Präferenz (`'light' | 'dark' | 'system'`) wird in `localStorage` unter dem
Schlüssel `dark-mode` gespeichert — identisch mit SVWS-Import, damit beide Apps
die Einstellung teilen.

```typescript
// useTheme.ts
const STORAGE_KEY = 'dark-mode'
```

## Zu bewahrende Elemente (app-spezifisch)

Folgende Tokens sind bewusst nicht in das einheitliche Emerald-System überführt worden,
da sie fachliche Bedeutung tragen:

- **Notenstufen-Farben** `--n1` bis `--n6` (+ Dark-Varianten): semantische Farben für
  Benotung — müssen erhalten bleiben
- **Fach-Randfarben** `--nf-gut/ok/warn/bad`: Ampel-Farben für Notenqualität
- **LK-Badge** (`--lk-bg/ink`): bewusst **blau** — unterscheidet sich visuell von
  Emerald-Akzent und den grünen Noten-1-Badges

## Übertragung auf eine neue App

### 1. CSS Custom Properties übernehmen
Die vollständige Tokenliste aus `src/style.css` (`:root` und `:root.dark`) in die neue
App kopieren. App-spezifische Tokens (z. B. `--conf-*`) mit eigenem Prefix anlegen.

### 2. Dark-Mode-Composable einbinden
`src/composables/useTheme.ts` übernehmen. Gleicher `localStorage`-Key `dark-mode`
sorgt für geteilte Einstellung über alle SVWS-Apps.

```typescript
// main.ts
import { initTheme } from './composables/useTheme'
initTheme()
```

### 3. Body-Gradient setzen
Den Emerald-Hintergrund-Gradient auf `body` anwenden (siehe oben). Im Dark Mode
wird derselbe Gradient über die `:root.dark`-Variablen automatisch angepasst.

### 4. PrimeVue-Buttons überschreiben
PrimeVue-Buttons nutzen die generierten `--p-primary-*`-Variablen. Um sie auf Emerald
umzustellen, reicht es, diese zu überschreiben:
```css
:root {
  --p-primary-color: #059669;
  --p-primary-hover-color: #047857;
}
:root.dark {
  --p-primary-color: #34d399;
  --p-primary-hover-color: #6ee7b7;
}
```

### 5. Eigene Buttons (Tile-Style)
Für nicht-PrimeVue-Buttons den Emerald-Gradient verwenden:
```css
.primary-button {
  background: linear-gradient(120deg, var(--accent), #047857);
  color: #fff;
}
```

### 6. Native Input-Spinbuttons vermeiden
`input[type=number]`-Spinbuttons lassen sich per `accent-color` nicht zuverlässig
färben (Browser-Inkonsistenzen). Stattdessen native Pfeile ausblenden und eigene
`+`/`−`-Buttons implementieren:
```css
input[type=number] {
  appearance: textfield;
  -moz-appearance: textfield;
}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
```

## WCAG-Kontrast

Alle Vordergrund-/Hintergrundkombinationen wurden auf WCAG AA geprüft:
- Normaler Text (< 18px): Kontrast ≥ 4.5:1
- Großer Text / UI-Elemente: Kontrast ≥ 3:1
- Akzentfarben auf weißem Hintergrund: Emerald-600 (`#059669`) erreicht 4.54:1

## Konsequenzen

Vorteile:
- Einheitliches Erscheinungsbild aller SVWS-Apps ohne gemeinsame Komponentenbibliothek
- Vollständige Kontrolle über alle Farben — kein Vertrauen auf undokumentierte
  PrimeVue-Interna
- Dark Mode und Light Mode durch eine einzige Variable (`dark`-Klasse) schaltbar
- Shared `localStorage`-Key synchronisiert Theme-Wahl über Apps hinweg

Nachteile:
- CSS-Tokenliste muss manuell zwischen Apps synchron gehalten werden
- Keine automatische Übernahme von PrimeVue-Theme-Updates
