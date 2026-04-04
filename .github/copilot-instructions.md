# SVWS-GradeHub — GitHub Copilot Workspace Instructions

Diese Datei steuert das Verhalten von GitHub Copilot in diesem Repository.
Sie wird bei jedem Chat und jeder Inline-Suggestion automatisch als Kontext geladen.

---

## Projektübersicht

**SVWS-GradeHub** ist ein browserbasiertes Notenmodul für Lehrkräfte an deutschen Schulen (NRW).
Es hilft Lehrkräften bei der Noteneingabe und Zeugnisvorbereitung ihrer Lerngruppen und Klassen.

- Läuft **vollständig im Browser** — kein eigener Applikationsserver
- Liest Leistungsdaten vom **SVWS-Server** (REST-API) oder per **ENM-Datei-Upload**
- Schreibt geänderte Noten über `POST /db/{schema}/enm/v2/import` zurück
- Kann als statische Dateien auf einem Webserver betrieben werden **oder** per `file://` offline genutzt werden
- Schwester-Projekt: [SVWS-Conference](https://github.com/FPfotenhauer/SVWS-Conference) — Code-Sharing erwünscht

---

## Tech-Stack (nicht verhandelbar)

| Technologie | Version | Zweck |
|-------------|---------|-------|
| Vue 3 | ^3.5 | UI-Framework, Composition API |
| TypeScript | ^5.8, strict mode | Typsprache |
| Vite | ^5.4 | Build-Tool |
| Pinia | ^2.1 | State Management |
| Vue Router | ^4, **Hash Mode** | Client-seitiges Routing |
| fflate | ^0.8 | gzip für ENM-Parsing und Export |
| Web Crypto API | nativ | AES-256-GCM Verschlüsselung (kein npm-Paket) |
| Vitest | ^2.1 | Unit-Tests |
| ESLint | ^9 | Linting |

**Keine weiteren State-Management-Bibliotheken. Kein axios — natives `fetch` verwenden.**

---

## Architekturprinzipien (aus den ADRs)

### ADR-0001 — Browser-First
- Alle Verarbeitung findet im Browser statt — keine Daten an externe Server
- Kein Backend, kein eigener Server-Prozess
- Build-Output muss per `file://` und per `https://` funktionieren

### ADR-0002 — Rückschreiben
- Geänderte Noten werden über `POST /db/{schema}/enm/v2/import` zurückgeschrieben
- **Keine Echtzeit-Synchronisation** — Import nur explizit am Sitzungsende
- Transportformat ist die ENM-Struktur selbst (gzip-komprimiert), kein proprietäres Delta-Format
- Jede Änderung trägt einen ISO-8601-UTC-Timestamp (`geaendertAm`)

### ADR-0003 — Routing
- **Ausschließlich Hash Mode**: `createWebHashHistory()`
- Kein History Mode — der `file://`-Offline-Betrieb erfordert es

### ADR-0005 — Verschlüsselung
- Verschlüsselung ausschließlich über die native **Web Crypto API** (`window.crypto.subtle`)
- Algorithmen: PBKDF2-SHA-256 (310.000 Iterationen) + AES-256-GCM
- Verschlüsselung nur im Secure Context verfügbar (`https://` oder `localhost`)
- Im `file://`-Modus: Verschlüsselung deaktiviert, Hinweis im UI

---

## Datenmodell

Das ENM-Datenmodell folgt dem SVWS-Standard. Die Struktur ist **indirekt**:

```
ENMDaten
  └── lehrer[]           → authentifizierte Lehrkraft
  └── lerngruppen[]      → Lerngruppe (Klasse oder Kurs)
        └── fach         → Unterrichtsfach
  └── schueler[]         → Schülerstammdaten
  └── leistungsdaten[]   → Verbindung: Schüler ↔ Lerngruppe ↔ Note
        └── schuelerID
        └── lerngruppenID
        └── note          (String: "1", "2+", "3-", "NT", "NE", …)
        └── noteTimestamp (ISO 8601 UTC)
```

Notenwerte sind **immer Strings** — niemals als Zahl behandeln.
Gültige Werte: `"1"`, `"2+"`, `"2"`, `"2-"`, … `"6"`, `"NT"`, `"NE"`, `"E1"`–`"E4"` (Grundschule).

---

## Change-Buffer — kritisches Architekturmuster

**Original-ENM-Daten werden niemals mutiert.**
Alle Änderungen leben in einem separaten Pinia-Store:

```typescript
// Schlüssel: `${schuelerId}:${lerngruppenId}`
interface LeistungsChange {
  schuelerId:        number
  lerngruppenId:     number
  feld:              'note' | 'noteQuartal' | 'fehlstundenGesamt' |
                     'fehlstundenUnentschuldigt' | 'fachbezogeneBemerkungen' |
                     'istGemahnt' | 'mahndatum'
  alterWert:         string | null
  neuerWert:         string | null
  geaendertAm:       string   // new Date().toISOString()
  geaendertVon:      string   // Lehrkraft-Kürzel
  enmBasisTimestamp: string   // Timestamp des ENM-Exports
}

// Im Store:
const changes = new Map<string, LeistungsChange>()
```

---

## Store-Struktur (Pinia)

```
stores/
  enmStore.ts       → Original-ENM-Daten (readonly nach dem Laden)
  changeStore.ts    → Change-Buffer (Map + Timestamps)
  authStore.ts      → SVWS-Verbindungsdaten (URL, Schema, Credentials)
  uiStore.ts        → UI-State (aktive Lerngruppe, Ladestate, Fehler)
```

---

## Projektstruktur

```
src/
  assets/           → Statische Assets, CSS-Variablen
  components/       → Wiederverwendbare Vue-Komponenten
    NoteCell.vue    → Einzelne Note-Eingabezelle mit Change-Buffer-Integration
    NoteGrid.vue    → Noten-Tabelle für eine Lerngruppe
  composables/
    useDeploymentMode.ts  → Erkennt file:// vs. https://, schaltet Features
    useENMApi.ts          → SVWS-REST-Client (fetch, BasicAuth, gzip)
    useCrypto.ts          → Web Crypto API (encrypt/decrypt ENM-Dateien)
  router/
    index.ts        → Vue Router, Hash Mode
  stores/
    enmStore.ts
    changeStore.ts
    authStore.ts
    uiStore.ts
  types/
    enm.ts          → ENM-Typdefinitionen (aus SVWS-Conference übernehmen)
    changes.ts      → LeistungsChange, LeistungsFeld
  views/
    StartView.vue         → Verbindung / Datei-Upload
    LerngruppenView.vue   → Übersicht aller Lerngruppen
    NotenEingabeView.vue  → Noteneingabe für eine Lerngruppe
    ExportView.vue        → Sitzungsabschluss, Import/Export
```

---

## SVWS-API-Endpunkte

```typescript
// Export (Lesen)
GET  {baseUrl}/db/{schema}/enm/v2/alle/gzip
GET  {baseUrl}/db/{schema}/enm/v1/alle/gzip   // Fallback

// Import (Schreiben)
POST {baseUrl}/db/{schema}/enm/v2/import

// Authentifizierung: immer BasicAuth
Authorization: Basic base64(`${username}:${password}`)
Accept: application/octet-stream   // für gzip-Endpunkte
```

Versionserkennung beim Verbindungsaufbau:
```typescript
// HEAD-Request: 401 = Endpunkt existiert → v2 verfügbar
const v2ok = (await fetch(`${baseUrl}/db/${schema}/enm/v2/alle/gzip`,
  { method: 'HEAD' })).status !== 404
```

---

## Coding-Standards

### TypeScript
- `strict: true` — keine `any`, keine non-null assertions ohne Kommentar
- Alle öffentlichen Funktionen haben explizite Return-Typen
- ENM-Typen aus `src/types/enm.ts` verwenden — niemals eigene parallele Typen erfinden

### Vue 3
- Ausschließlich **Composition API** mit `<script setup lang="ts">`
- Keine Options API
- Props immer mit `defineProps<{...}>()` typisiert
- Emits immer mit `defineEmits<{...}>()` typisiert
- Keine direkten DOM-Manipulationen — Vue-Reaktivität nutzen

### Pinia Stores
- `defineStore` mit Setup-Syntax (nicht Options-Syntax)
- Original-ENM-Daten im `enmStore` sind nach dem Laden als `readonly` zu behandeln
- Getter für abgeleitete Daten (gefilterte Lerngruppen, Änderungsanzahl etc.)

### Fetch / API-Calls
- Kein axios — ausschließlich natives `fetch`
- Alle API-Calls in `useENMApi.ts` kapseln
- Fehlerbehandlung immer mit try/catch, niemals `.catch()` ignorieren
- Timeouts setzen: `AbortController` mit sinnvollem Timeout (30s für gzip-Download)

### Datenschutz / Sicherheit
- Credentials **niemals** in localStorage, sessionStorage oder Cookies
- Credentials nur im Pinia `authStore` (In-Memory)
- ENM-Daten verlassen den Browser nur über explizite Nutzeraktion (Import-Button)
- `beforeunload`-Guard wenn `changeStore.hasChanges === true`

### Tests (Vitest)
- Unit-Tests für: alle Stores, `useDeploymentMode`, `useENMApi` (mit Mock-Fetch), `buildRueckschreibeENM`
- Keine Tests für reine UI-Komponenten ohne Logik
- Testdaten: anonymisierte ENM-Beispieldatei aus `data/enm_json.gz` (wie in SVWS-Conference)

---

## Was Copilot vermeiden soll

- **Keine Options API** in Vue-Komponenten vorschlagen
- **Kein axios** — immer `fetch`
- **Kein History Mode** im Router
- **Kein localStorage** für Credentials oder ENM-Daten
- **Keine Mutation** der Original-ENM-Daten aus dem `enmStore`
- **Keine externen Krypto-Bibliotheken** (libsodium, crypto-js etc.) — Web Crypto API nutzen
- **Kein `any`** in TypeScript ohne expliziten Kommentar mit Begründung
- **Keine separaten CSS-Dateien** pro Komponente ohne triftigen Grund — CSS-Variablen aus `assets/` nutzen
- **Keine eigenen Backend-Endpunkte** erfinden — ausschließlich die dokumentierten SVWS-Endpunkte

---

## Verwandtes Projekt zur Orientierung

SVWS-Conference hat identischen Tech-Stack und löst das ENM-Lesen bereits vollständig.
Folgende Module können direkt übernommen oder als Vorlage genutzt werden:

- `src/types/enm.ts` — ENM-Typdefinitionen (1:1 übernehmen)
- gzip-Parsing mit `fflate` — Muster aus Conference übernehmen
- BasicAuth-Fetch-Wrapper — Muster aus Conference übernehmen
- Offline-Build-Skript (`scripts/build-offline.mjs`) — übernehmen
