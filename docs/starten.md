# SVWS-GradeHub starten

## 1. Betriebsmodi

SVWS-GradeHub gibt es in zwei Betriebsvarianten:

| | Offline-Modus | Server-Modus |
|---|---|---|
| Zugang | `index.html` direkt im Browser öffnen | URL im Browser aufrufen (z. B. `https://gradehub.schule.de`) |
| E-Mail-Versand | nicht verfügbar | verfügbar (Button **Dateien versenden** im Adminbereich) |
| Verschlüsselung | eingeschränkt (kein Secure Context) | vollständig verfügbar |
| Einrichtung | keine — Datei einfach öffnen | Webserver mit Node.js erforderlich (Anleitung in `docs/admin.md`) |

Welchen Modus Sie verwenden, richtet sich nach der Einrichtung an Ihrer Schule. Fragen Sie ggf. Ihre Schulverwaltung.

## 2. Vorbereitungen

Bevor Sie starten, stellen Sie sicher, dass Sie eine der folgenden Möglichkeiten haben:

- Eine **ENM-Datei** oder verschlüsselte **Lehrerdatei** (`.enc.json`), die Sie vom Administrator erhalten haben.
- Oder: Die URL des SVWS-Servers sowie Ihr Benutzernamen und Ihr Passwort für den Direktzugriff.

Verwenden Sie einen modernen Browser (z. B. Chrome, Firefox, Edge).

## 3. Anwendung starten

### Option A: Offline im Browser mit `file://`

1. Öffnen Sie die Datei `index.html` aus dem bereitgestellten Programmordner im Browser.
2. Der Browser lädt die Anwendung vollständig lokal.
3. Im `file://`-Modus ist die Verschlüsselung aus technischen Gründen eingeschränkt — die App weist darauf hin.

### Option B: Über einen Webserver (Server-Modus)

1. Rufen Sie die bereitgestellte URL im Browser auf (z. B. `https://gradehub.schule.de`).
2. Bei `https://` steht die vollständige Verschlüsselung zur Verfügung.
3. Im Server-Modus ist im Adminbereich zusätzlich der E-Mail-Versand von Notendateien möglich.

## 4. Erste Schritte auf der Startseite

Auf der Startseite wählen Sie den Arbeitsmodus aus:

- **ENM-Datei öffnen** — lädt eine unverschlüsselte ENM-Datei oder eine verschlüsselte Lehrerdatei (`.enc.json`) vom Gerät.
- **SVWS-Verbindung** — stellt eine direkte Verbindung zum SVWS-Server her (erfordert Zugangsdaten).

### Hinweise

- Die Anwendung speichert keine Zugangsdaten dauerhaft.
- Passwörter und Verbindungsdaten verbleiben im Arbeitsspeicher des Browsers und werden nach dem Schließen der Seite nicht aufbewahrt.
- Bei offenen Änderungen erhalten Sie einen Hinweis, bevor Sie die Seite verlassen.
