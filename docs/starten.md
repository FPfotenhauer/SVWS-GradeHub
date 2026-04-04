# SVWS-GradeHub starten

## 1. Vorbereitungen

Bevor Sie starten, stellen Sie sicher, dass Sie eine gültige ENM-Datei oder Zugangsdaten zur SVWS-API haben.

- Bei der Offline-Nutzung benötigen Sie eine ENM-Datei vom SVWS-Server.
- Bei der Online-Nutzung benötigen Sie die URL des SVWS-Servers, Ihr Schema sowie Ihren Benutzernamen und Ihr Passwort.
- Verwenden Sie einen modernen Browser (z. B. Chrome, Firefox, Edge).

## 2. Anwendung starten

### Option A: Offline im Browser mit `file://`

1. Öffnen Sie die Datei `index.html` aus dem Projektordner im Browser.
2. Der Browser lädt die Anwendung lokal.
3. Im `file://`-Modus ist die Verschlüsselung aus technischen Gründen eingeschränkt.

### Option B: Über einen Webserver

1. Starten Sie die Anwendung über einen Webserver oder die lokale Entwicklungsumgebung.
2. Öffnen Sie die URL im Browser, z. B. `http://localhost:5173`.
3. Bei `https://` ist die vollständige Verschlüsselung verfügbar.

## 3. Erste Schritte auf der Startseite

Auf der Startseite wählen Sie den Arbeitsmodus aus:

- `ENM-Datei öffnen` für Offline-Arbeit
- `SVWS-Verbindung` für direkte Verbindung zum SVWS-Server

### Hinweise

- Die Anwendung speichert keine Zugangsdaten dauerhaft.
- Personal- und Passwörter verbleiben im Browser und werden nur im Arbeitsspeicher gehalten.
- Bei offenen Änderungen erhalten Sie einen Hinweis, bevor Sie die Seite verlassen.
