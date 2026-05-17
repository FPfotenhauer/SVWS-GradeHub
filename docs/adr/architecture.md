# SVWS-GradeHub — Architekturüberblick für Agenten

Dieses Dokument gibt einem KI-Agenten einen vollständigen Schnelleinstieg in das Projekt. Es ersetzt nicht die detaillierten ADRs (adr-0001 bis adr-0005), sondern dient als erster Orientierungspunkt.

---

## Was ist SVWS-GradeHub?

Eine **Vue 3 / TypeScript / Vite Single-Page-Applikation** für Lehrkräfte an deutschen Schulen. Lehrkräfte geben Noten ein und bereiten Zeugnisse vor — vollständig im Browser, ohne eigenes Backend.

Die Datenquelle ist das **SVWS-ENM-Format** (Elektronisches Notenmanagement): eine JSON-Struktur, die vom SVWS-Schulverwaltungsserver exportiert oder als Datei bereitgestellt wird. GradeHub liest diese Daten, ermöglicht Änderungen und schreibt sie zurück (direkt per API oder als Exportdatei für den Admin).

---

## Tech-Stack

| Schicht | Technologie |
|---|---|
| UI-Framework | Vue 3 (Composition API, `<script setup>`) |
| Sprache | TypeScript (strict, noUncheckedIndexedAccess) |
| Build | Vite — zwei Configs (Web + Offline/IIFE) |
| State | Pinia (4 Stores) |
| Routing | Vue Router 4, **Hash-Modus** (file:// + https://) |
| Kryptographie | Web Crypto API (PBKDF2 + AES-256-GCM) — kein npm-Paket |
| Kompression | fflate (ZIP/gzip) |
| Backend (optional) | Node.js + Express 5 (`server.js`) für E-Mail-Versand |
| Tests | Vitest |

---

## Verzeichnisstruktur

```
SVWS-GradeHub/
├── src/
│   ├── main.ts                  # App-Einstieg, Pinia-Setup, beforeunload-Guard
│   ├── App.vue                  # Root-Komponente (ThemeHeader + RouterView)
│   ├── style.css                # Globale CSS-Variablen (Light/Dark-Theme)
│   ├── components/
│   │   ├── ThemeHeader.vue      # Header: Theme-Selector, Logout
│   │   └── FloskelPickerDialog.vue # Modal zum Auswählen von Zeugnisfloskeln
│   ├── composables/
│   │   └── useDeploymentMode.ts # Erkennt file:// vs https://, Secure-Context-Check
│   ├── router/
│   │   └── index.ts             # 6 Routen (siehe unten)
│   ├── stores/
│   │   ├── authStore.ts         # Zugangsdaten (URL, Schema, User, Passwort)
│   │   ├── changeStore.ts       # Änderungs-Buffer (Map<ChangeKey, LeistungsChange>)
│   │   ├── enmStore.ts          # ENM-Daten laden (API oder Datei), Gzip, Verschlüsselung
│   │   └── uiStore.ts           # Theme-Präferenz (localStorage)
│   ├── types/
│   │   ├── enm.ts               # Alle ENM-Typen (~650 Zeilen)
│   │   └── changes.ts           # LeistungsFeld-Enum, LeistungsChange, ChangeKey
│   └── views/
│       ├── StartView.vue        # Login + Datei-Upload (795 Zeilen, Haupteinstieg)
│       ├── LerngruppenView.vue  # Kursübersicht mit Änderungszähler
│       ├── NotenEingabeView.vue # Noteingabe für eine Lerngruppe
│       ├── KlassenleitungView.vue # Klassendaten, Fehlzeiten, Bemerkungen
│       ├── ExportView.vue       # Ergebnisse exportieren / an Server senden
│       └── AdminView.vue        # Admin: Lehrerliste, Verschlüsselung, E-Mail
├── docs/
│   ├── adr/                     # Architecture Decision Records (ADR-0001–0005) + diese Datei
│   └── *.md                     # Benutzerhandbuch, Datenschutz, Admin-Docs
├── data/
│   └── enm.teacher.json         # Beispiel-ENM-Datei
├── public/
│   └── config.js                # Laufzeit-Config (ADMINTOOL_VISIBLE-Flag)
├── server.js                    # Optionaler Express-Server (E-Mail, Admin-Proxy)
├── vite.config.ts               # Web-Build (ES-Module, SplitCode)
├── vite.offline.config.ts       # Offline-Build (IIFE, für file://)
└── .env / .env.example          # Umgebungsvariablen (SVWSSERVER_*, ADMINTOOL_*)
```

---

## Routing (Hash-Modus)

| Pfad | View | Zweck |
|---|---|---|
| `/#/` | StartView | Login / Datei-Upload |
| `/#/lerngruppen` | LerngruppenView | Kursübersicht |
| `/#/lerngruppen/:id` | NotenEingabeView | Noteingabe für einen Kurs |
| `/#/klassenleitung/:klasseId` | KlassenleitungView | Klassenleitungsdaten |
| `/#/export` | ExportView | Download / Server-Upload |
| `/#/admin` | AdminView | Admin-Werkzeuge |

Hash-Modus ist Pflicht — die App muss sowohl unter `file://` als auch unter `https://` funktionieren (ADR-0003).

---

## Die vier Pinia-Stores

### `authStore`
Hält Zugangsdaten für den SVWS-Server (baseUrl, schema, username, password). Nur im RAM — keine Persistenz. `isConfigured` (computed) prüft ob alle Felder gesetzt sind.

### `enmStore`
Kernstore. Lädt ENM-Daten entweder:
- **API-Modus**: `GET /db/{schema}/enm/v1/teacher` mit BasicAuth, Gzip-Dekomprimierung via fflate, Fallback v2→v1
- **Datei-Modus**: Nutzer lädt JSON- oder `.enm.enc.json`-Datei hoch

Hält `enmData` (readonly, nie direkt mutieren), Lehrerliste und Metadaten zur verschlüsselten Quelle.

### `changeStore`
Puffer für alle Änderungen durch den Nutzer. Kernstruktur:

```typescript
type ChangeKey = `${number}:${number}:${LeistungsFeld}`
// schuelerId : lerngruppenId : feld

interface LeistungsChange {
  schuelerId: number
  lerngruppenId: number
  feld: LeistungsFeld
  alterWert: string | null
  neuerWert: string | null
  timestamp: number
}
```

`LeistungsFeld` hat 14 Felder: `note`, `noteQuartal`, `fehlstundenGesamt`, `fehlstundenUnentschuldigt`, `istGemahnt`, `istVorwarnung`, `kursart`, `fachkuerzel`, `lernentwicklung`, `lernentwicklungFachbezogen`, `mahnungText`, `bemerkung`, `teilleistungen`, `sonderPaedagoge`.

Wenn alter Wert == neuer Wert → Eintrag wird aus der Map gelöscht (Deduplizierung). `changeCount` und `hasChanges` sind computed.

### `uiStore`
Theme-Präferenz (`light` | `dark` | `system`), persistiert in localStorage, reagiert auf `prefers-color-scheme`.

---

## ENM-Datenmodell (Überblick)

Das ENM-Format hat zwei Ebenen:

**Lookup-Tabellen** (Top-Level in `EnmExport`):
- `noten[]` — Notenkürzel mit Text und Notenpunkten
- `faecher[]` — Fächer (ID, Kürzel, Sortierung)
- `jahrgaenge[]` — Jahrgangsstufen
- `klassen[]` — Klassen mit Jahrgangsreferenz
- `lehrer[]` — Lehrerliste
- `lerngruppen[]` — Kurse/Lerngruppen mit Fach, Jahrgang, Lehrer
- `floskeln[]` / `floskelgruppen[]` — Zeugnisfloskeln

**Schülerdaten** (`schueler[]`):
```
EnmSchueler → lernabschnitt → leistungsdaten[] → EnmLeistungsdaten
                            → bemerkungen
                            → sprachenfolge[]
```

`EnmLeistungsdaten` enthält alle Noten, Fehlzeiten, Bemerkungen für eine Lerngruppe.

**Noten-Kürzel**: `'1+'` bis `'6'` (Zensuren) + Sondernoten `'AT' | 'E1' | 'E2' | 'E3' | 'NT' | 'NB' | 'NE' | 'LM' | 'AM'`.

Views bauen computed `Map<id, Objekt>` aus den Arrays für O(1)-Lookup.

---

## Verschlüsselungs-Workflow (ADR-0005)

Nur im `https://`-Modus verfügbar (Secure Context erforderlich — `useDeploymentMode.ts`).

### Dateiformat: `.enm.enc.json` (neues Format)
```json
{
  "format": "gradehub-encrypted-zip",
  "originalFileName": "{kuerzel}-enm.zip",
  "salt": "<base64>",
  "iv": "<base64>",
  "ciphertext": "<base64>"
}
```
Die entschlüsselte ZIP enthält `enm.json` (ENM-Daten) + `public_key.pem`.

### Algorithmus
`PBKDF2-SHA-256` (310.000 Iterationen) → Key → `AES-256-GCM` (Encrypt/Decrypt)

### Admin-Export-Weg
`AdminView` → `ladeENMJsonFuerLehrer()` → `zipSync()` (fflate) → `aesVerschluesselnBytes()` → Download als `{kuerzel}-enm.zip.enc.json`

### Import-Weg (Admin)
`AdminView` "Dateien importieren" → Ordner/Mehrfach-Dateien → automatische Entschlüsselung per Lehrer-Passwortliste → "An SVWS-Server senden" (`POST /db/{schema}/enm/v2/import`)

**Kürzel-Erkennung**: Erst `originalFileName` im Payload prüfen (`^([A-Za-z0-9]+)-enm[.\-_]`), dann erst Dateiname. Lehrkräfte können Dateinamen umbenennen.

### Admin-Konfigurationsdatei
`gradehub-config.ghb` — AES-256-GCM-verschlüsselt — enthält: Lehrer-IDs + Kürzel + Notenpasswörter + optionale SMTP-Konfig + RSA-Schlüsselpaar.

---

## Zwei Build-Modi

| | Web-Modus | Offline-Modus |
|---|---|---|
| Config | `vite.config.ts` | `vite.offline.config.ts` |
| Output-Format | ES-Module (splitCode) | IIFE (inline bundle) |
| Protokoll | `https://` | `file://` |
| Verschlüsselung | Verfügbar | Nicht verfügbar |
| Script-Tag | `type="module"` | `defer` (via writeBundle-Hook) |
| Proxy | `/api` → `localhost:3000` | — |

---

## Wichtige Architekturregeln

1. **ENM-Daten nie direkt mutieren** — `enmStore.enmData` ist readonly. Alle Änderungen laufen durch `changeStore`.
2. **Kein Passwort persistieren** — `authStore` ist reines RAM-State. Bei Reload muss neu eingeloggt werden.
3. **Kein npm-Paket für Kryptographie** — ausschließlich `window.crypto.subtle` (Web Crypto API).
4. **Hash-Routing ist Pflicht** — nie auf History-Mode wechseln (bricht `file://`-Betrieb).
5. **Lookup-Maps per computed bauen** — nie direkt über Arrays iterieren, wenn ID-Zugriff nötig.
6. **Deduplizierung im changeStore** — alter Wert == neuer Wert → Eintrag löschen, nicht speichern.
7. **Kürzel-Erkennung bei Import** — immer erst `originalFileName`, dann Dateiname.

---

## Datenfluss (Normalfall)

```
SVWS-Server (API)
    └─ GET /db/{schema}/enm/v1/teacher  (BasicAuth, Gzip)
         │
         ▼
    enmStore.enmData           ◄── StartView (Datei-Upload)
         │
         ├─ LerngruppenView (Kursübersicht, computed Maps)
         │
         ├─ NotenEingabeView
         │       │
         │       └─ changeStore.setChange()  ◄── Nutzer-Input
         │
         └─ ExportView
                 │
                 ├─ POST /db/{schema}/enm/v2/import  (Online)
                 └─ Download als .json / .enm.enc.json  (Offline)
```

---

## Externe Abhängigkeiten (Laufzeit)

| Paket | Zweck |
|---|---|
| `fflate` | ZIP-Erstellung und Gzip-Dekomprimierung |
| `jsPDF` | PDF-Generierung (Notenlisten) |
| `marked` | Markdown-Rendering (Datenschutz-Modal, Hilfe) |
| `nodemailer` | E-Mail-Versand (nur `server.js`) |

---

## Bestehende ADRs

| ADR | Thema |
|---|---|
| [ADR-0001](adr-0001.md) | Grundlegende Architekturentscheidungen (Stack, Dateneingabe, Change-Buffer) |
| [ADR-0002](adr-0002.md) | Change-Export und Rückschreibe-Strategie (ENM-Format, Timestamps, LWW) |
| [ADR-0003](adr-0003.md) | Routing-Strategie (Hash-Modus, file:// Kompatibilität) |
| [ADR-0004](adr-0004.md) | Grundschulzeugnis-Architektur (geplant, Text-Zeugnisse) |
| [ADR-0005](adr-0005.md) | Sicherer Datenaustausch und Verschlüsselung (PBKDF2 + AES-GCM) |

---

## Schnelleinstieg: Welche Dateien zuerst lesen?

Für einen neuen Agenten empfohlen in dieser Reihenfolge:

1. `src/types/enm.ts` — Alle Datenstrukturen
2. `src/types/changes.ts` — Change-Tracking-Typen
3. `src/stores/enmStore.ts` — Datenladen und ENM-State
4. `src/stores/changeStore.ts` — Änderungs-Buffer
5. `src/router/index.ts` — Routen
6. Die betroffene View in `src/views/`
