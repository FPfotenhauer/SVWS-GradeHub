# SVWS-GradeHub

SVWS-GradeHub ist ein leichtgewichtiges, browserbasiertes Notenmodul für Lehrkräfte, das sowohl online als auch offline im Browser funktioniert. Das Projekt unterstützt den Dateiimport von ENM-Daten, die Anzeige und Bearbeitung von Noten sowie den Rückschreibevorgang über die SVWS-API.

## 🚀 Hauptmerkmale

- Vollständig client-seitig: Läuft direkt im Browser ohne eigenes Backend
- Offline-fähig per `file://` oder statischem Webserver
- ENM-Dateiimport und SVWS-REST-Anbindung
- Noten- und Leistungsdatenverwaltung mit Änderungs-Puffer
- Verschlüsselung per Web Crypto API im Secure Context
- Zustandstrennung: Originaldaten unverändert, alle Änderungen im Pinia-Change-Store
- Vue 3 + TypeScript + Vite + Pinia + Vue Router + `fflate`

## 📁 Projektstruktur

- `src/`
  - `components/` — wiederverwendbare Vue-Komponenten
  - `composables/` — Logik für Deployment-Modus, API-Zugriff, Krypto
  - `router/` — Hash-basiertes Routing
  - `stores/` — Pinia-Stores für ENM-Daten, Änderungen, Authentifizierung und UI
  - `types/` — TypeScript-Typen für ENM und Änderungsmodelle
  - `views/` — Seiten: Start, Lerngruppen, Noten-Eingabe, Export
- `data/` — Beispiel- / Testdaten
- `docs/` — Projekt-Dokumentation und ADRs

## 🧩 Architekturprinzipien

- Browser-first: Keine Daten werden ohne explizite Nutzeraktion an externe Server gesendet
- Original-ENM-Daten bleiben unverändert
- Änderungen werden als separate Change-Objekte gespeichert
- Router arbeitet ausschließlich im Hash-Modus für Offline-Kompatibilität
- Verschlüsselung nutzt nur die native Web Crypto API

## ⚙️ Technologie-Stack

- Vue 3 (Composition API)
- TypeScript (strict)
- Vite
- Pinia
- Vue Router (Hash Mode)
- fflate (gzip)
- Web Crypto API für AES-256-GCM
- Vitest für Unit-Tests
- ESLint für statische Analyse

## 🧪 Entwickeln & Testen

### Abhängigkeiten installieren

```bash
npm install
```

### Lokale Entwicklung starten

```bash
npm run dev
```

### Build erzeugen (Standard)

```bash
npm run build
```

Dieser Build erzeugt in `dist/` eine `index.html` sowie den Ordner `assets/` mit:

- `assets/app.js`
- `assets/app.css`

Geeignet fuer Deployment auf statischem Webserver und fuer den direkten Start von `dist/index.html` im Browser.

### Offline-Singlefile-Build erzeugen

```bash
npm run build:offline
```

Dieser Build erzeugt eine einzelne `dist/index.html` mit inline eingebetteten Assets.

### Vorschau des Builds

```bash
npm run preview
```

### Type-Check

```bash
npm run typecheck
```

### Tests ausführen

```bash
npm run test
```

### Linting

```bash
npm run lint
```

## 🔐 SVWS-Integration

Die App unterstützt:

- `GET {baseUrl}/db/{schema}/enm/v2/lehrer/{id}`
- `POST {baseUrl}/db/{schema}/enm/v2/import`

Authentifizierung erfolgt per Basic Auth mit `Authorization: Basic <base64(username:password)>`.

## 📌 Betriebsmodus

Das Projekt unterscheidet zwischen:

- `https://` oder `http://` mit vollständigem Feature-Satz
- `file://`-Modus mit eingeschränkter Verschlüsselung, aber vollem Offline-Einsatz

## 🧠 Wichtiges Design-Muster

Die App verwendet einen Change-Buffer, der Änderungen als `LeistungsChange`-Objekte speichert. Das bedeutet:

- Originaldaten aus der ENM-Datei werden nicht mutiert
- Änderungen können gesammelt, angezeigt und gezielt zurückgeschrieben werden
- Jede Änderung erhält einen `geaendertAm`-Timestamp und `geaendertVon`

## 📝 Lizenz

Dieses Projekt ist unter der [BSD 3 License](LICENSE) lizenziert.

## 📚 Weitere Dokumentation

- `docs/index.md`
- `docs/adr/` für Architekturentscheidungen

## Kontakt

Bei Fragen oder Verbesserungsvorschlägen kannst du gerne Issues oder Pull Requests öffnen.
