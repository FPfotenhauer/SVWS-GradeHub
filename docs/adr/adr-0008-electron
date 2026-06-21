# ADR 008: Electron-Konfiguration für SVWS-Apps

## Status
Akzeptiert

## Kontext
SVWS-Apps (GradeHub, Conference, …) werden als Electron-Desktop-Anwendung ausgeliefert.
Der Windows-Installer wird über **electron-builder** mit dem NSIS-Target gebaut.
Jede App muss dabei ein eigenes Icon besitzen, einen Startmenüeintrag unter der Gruppe
**SVWS** anlegen und ein Desktop-Icon erstellen.

---

## Entscheidung

### 1. Icon-Erstellung (pro App)

Jede App bekommt ein eigenes Icon, das sich visuell von anderen SVWS-Apps unterscheidet.
Die Icons liegen im Verzeichnis `build/` des jeweiligen Projekts.

#### Benötigte Dateien

| Datei | Format | Verwendung |
|---|---|---|
| `build/icon.svg` | SVG 256×256 | Quelldesign (versionierbar, skalierbar) |
| `build/icon.png` | PNG 256×256, RGBA | Linux (AppImage), Mac (DMG) **und** Windows — electron-builder konvertiert intern zu ICO |

> **Wichtig:** Kein separates `.ico` anlegen. electron-builder erwartet für Windows
> entweder ein `.ico` mit mindestens 256×256 als primärer Größe **oder** direkt ein
> 256×256-PNG. Das PNG ist die robustere Wahl, da selbst erzeugte `.ico`-Dateien
> (z. B. via Python Pillow) manchmal die falsche Primärgröße setzen und den Build
> mit `Icon must be at least 256x256 pixels` abbrechen lassen.

#### SVG-Vorlage (Minimalstruktur)

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#HINTERGRUND_DUNKEL"/>
      <stop offset="100%" stop-color="#HINTERGRUND_HELL"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7B32B"/>
      <stop offset="100%" stop-color="#F28F3B"/>
    </linearGradient>
  </defs>

  <!-- Hintergrund mit abgerundeten Ecken -->
  <rect x="0" y="0" width="256" height="256" rx="38" fill="url(#bg)"/>

  <!-- App-spezifisches Motiv -->
  <!-- ... -->
</svg>
```

#### SVG → PNG konvertieren (Inkscape CLI)

```bash
inkscape build/icon.svg \
  --export-type=png \
  --export-filename=build/icon.png \
  --export-width=256 \
  --export-height=256
```

> Inkscape muss mit absolutem Pfad in `--export-filename` aufgerufen werden.
> Relative Pfade werden stillschweigend ignoriert, die Datei entsteht dann nicht.

#### Existierende Icons

| App | Hintergrundfarbe | Motiv |
|---|---|---|
| SVWS-Conference | Teal `#0F3D3E → #1E6F6B` | 4 Kacheln + goldener Haken |
| SVWS-GradeHub | Blau `#1A2E5A → #2D5FA6` | Notenbuch + goldene "1"-Plakette |

---

### 2. package.json – Build-Konfiguration

```json
"build": {
  "appId": "de.skinwalker.svws-<appname>",
  "productName": "SVWS-<AppName>",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "electron/**/*",
    "package.json"
  ],
  "linux": {
    "target": "AppImage",
    "icon": "build/icon.png"
  },
  "win": {
    "target": "nsis",
    "icon": "build/icon.png"
  },
  "nsis": {
    "artifactName": "${productName}-Setup-${version}.${ext}",
    "oneClick": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "SVWS-<AppName>",
    "menuCategory": "SVWS"
  },
  "mac": {
    "target": "dmg",
    "icon": "build/icon.png"
  }
}
```

#### NSIS-Optionen erklärt

| Option | Wert | Bedeutung |
|---|---|---|
| `oneClick` | `true` | Installer läuft ohne Dialoge durch (Silent-Install) |
| `createDesktopShortcut` | `true` | Legt nach der Installation ein Desktop-Icon an |
| `createStartMenuShortcut` | `true` | Legt einen Startmenüeintrag an |
| `shortcutName` | `"SVWS-<AppName>"` | Angezeigter Name der Verknüpfungen |
| `menuCategory` | `"SVWS"` | Alle SVWS-Apps erscheinen im Startmenü unter dem Ordner **SVWS** |

---

### 3. Electron-Einstiegspunkt

Der Electron-Hauptprozess liegt unter `electron/main.cjs`. `package.json` muss ihn
als `"main"` referenzieren:

```json
{
  "main": "electron/main.cjs"
}
```

### 4. Build-Skripte

```json
"scripts": {
  "electron:dev":   "npm run build && electron . --no-sandbox --ozone-platform=x11",
  "electron:build": "npm run build && electron-builder",
  "release":        "node scripts/release.mjs"
}
```

`release.mjs` ruft `electron-builder` für alle Zielplattformen auf und legt die
Artefakte in `release/` ab.

---

## Bekannte Fehlerquellen

### `Icon must be at least 256x256 pixels, provided: 16x16`
Ursache: Eine `.ico`-Datei wurde erzeugt, bei der die erste interne Eintragsgröße
16×16 ist. electron-builder liest die erste Eintragsgröße und bricht ab.

Lösung: `.ico` weglassen, `win.icon` direkt auf `build/icon.png` (256×256) zeigen
lassen.

### Inkscape erzeugt keine PNG-Datei
Ursache: `--export-filename` mit relativem Pfad wird von Inkscape (Snap-Version)
ignoriert.

Lösung: Immer absoluten Pfad verwenden, z. B.
`/home/user/project/build/icon.png`.

---

## Konsequenzen

Vorteile:
- Jede SVWS-App ist im Windows-Startmenü unter dem gemeinsamen Ordner **SVWS** gebündelt
- Desktop-Icon und Startmenü werden automatisch durch den Installer angelegt
- Eigene Icons pro App ermöglichen klare visuelle Unterscheidung im Taskmanager / Dock
- PNG als einzige Icon-Quelldatei vereinfacht die Pflege (kein `.ico` nötig)

Nachteile:
- `build/`-Verzeichnis mit Icon-Dateien muss für jede neue App manuell angelegt werden
- Inkscape (oder ein äquivalentes Tool) wird für die SVG→PNG-Konvertierung vorausgesetzt
