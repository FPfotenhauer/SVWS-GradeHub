# SVWS-GradeHub starten

## 1. Betriebsmodi

SVWS-GradeHub steht in vier Varianten zur Verfügung:

| | Offline (Browser) | Statischer Webserver | Node.js-Server | Electron (Desktop) |
|---|---|---|---|---|
| Paket | `gradehub-*-offline.zip` | `gradehub-*-webserver.zip` | `gradehub-*-node-server.zip` | `.AppImage` / `.exe` |
| Zugang | `index.html` lokal öffnen | URL im Browser | URL im Browser | App starten |
| Verschlüsselung | eingeschränkt | vollständig | vollständig | vollständig |
| E-Mail-Versand | nicht verfügbar | nicht verfügbar¹ | verfügbar | verfügbar |
| Einrichtung | keine | Webserver (z. B. Jetty) | Node.js auf dem Server | Installation |

¹ Optional per separatem Node.js-Mail-Server nachrüstbar — siehe Abschnitt [Optionale Mail-Funktion neben Jetty](#optionale-mail-funktion-neben-jetty).

Welchen Modus Sie verwenden, richtet sich nach der Einrichtung an Ihrer Schule. Fragen Sie ggf. Ihre Schulverwaltung.

---

## 2. Vorbereitungen

Bevor Sie starten, stellen Sie sicher, dass Sie eine der folgenden Möglichkeiten haben:

- Eine **ENM-Datei** oder verschlüsselte **Lehrerdatei** (`.enc.json`), die Sie vom Administrator erhalten haben.
- Oder: Die URL des SVWS-Servers sowie Ihren Benutzernamen und Ihr Passwort für den Direktzugriff.

Verwenden Sie einen modernen Browser (Chrome, Firefox, Edge).

---

## 3. Anwendung starten

### Option A: Offline im Browser

1. Entpacken Sie `gradehub-*-offline.zip`.
2. Öffnen Sie `index.html` im Browser.
3. Die Anwendung läuft vollständig lokal — keine Serververbindung nötig.

> Im `file://`-Modus ist die Verschlüsselung aus technischen Gründen (kein Secure Context) eingeschränkt. Die App weist darauf hin.

### Option B: Statischer Webserver (z. B. Jetty)

1. Entpacken Sie `gradehub-*-webserver.zip` in das Webroot-Verzeichnis des Servers.
2. Rufen Sie die URL im Browser auf (z. B. `https://svws-server.schule.de/gradehub/`).
3. Bei `https://` steht die vollständige Verschlüsselung zur Verfügung.

### Option C: Node.js-Server (mit E-Mail-Funktion)

1. Entpacken Sie `gradehub-*-node-server.zip` auf einem Server mit Node.js.
2. Installieren Sie die Abhängigkeiten:
   ```bash
   npm install --omit=dev
   ```
3. Starten Sie den Server:
   ```bash
   node server.js               # Port 3000 (Standard)
   PORT=8080 node server.js     # oder ein anderer Port
   ```
4. Rufen Sie die URL im Browser auf (z. B. `http://server:3000`).

Für den Dauerbetrieb empfiehlt sich ein Prozessmanager:
```bash
npm install -g pm2
pm2 start server.js --name gradehub
pm2 save
```

### Option D: Electron-Desktop-App

1. **Linux:** `SVWS-GradeHub-*.AppImage` ausführbar machen und starten.
2. **Windows:** `SVWS-GradeHub-Setup-*.exe` installieren und starten.

Die Desktop-App enthält den Node.js-Server bereits eingebettet — E-Mail-Versand ist ohne separate Serverinstallation verfügbar.

---

## 4. Optionale Mail-Funktion neben Jetty

Wenn GradeHub über einen statischen Webserver (z. B. den SVWS-Jetty-Server) ausgeliefert wird und der E-Mail-Versand trotzdem genutzt werden soll, kann `server.js` parallel auf einem anderen Port betrieben werden.

### Voraussetzung

Node.js ist auf dem Server verfügbar und `gradehub-*-node-server.zip` wurde entpackt und gestartet (z. B. auf Port 3001, s. Option C).

### Konfiguration

Öffnen Sie die Datei `config.js` im Webroot-Verzeichnis der statischen Auslieferung und tragen Sie die URL des Node.js-Servers ein:

```javascript
window.GRADEHUB_CONFIG = {
  mailServerUrl: 'https://svws-server.schule.de:3001',
}
```

Speichern Sie die Datei — kein Neustart und kein Neubau nötig. Beim nächsten Seitenaufruf erkennt GradeHub den Mail-Server automatisch, und der Button **Dateien versenden** erscheint im Adminbereich.

> **Hinweis:** Port 3001 muss in der Firewall des Servers nach außen freigegeben sein.

---

## 5. Laufzeit-Konfiguration (`config.js`)

Die Datei `config.js` im Webroot kann nach dem Build jederzeit angepasst werden, ohne die Anwendung neu zu bauen:

| Option | Werte | Beschreibung |
|---|---|---|
| `admintoolVisible` | `true` / `false` | Adminbereich ein- oder ausblenden |
| `mailServerUrl` | URL-String oder leer | URL des Node.js-Mail-Servers (nur bei separatem Betrieb nötig) |

Beispiel für eine vollständige Konfiguration:

```javascript
window.GRADEHUB_CONFIG = {
  admintoolVisible: true,
  mailServerUrl: 'https://svws-server.schule.de:3001',
}
```

Ist `mailServerUrl` nicht gesetzt, verwendet die App relative Pfade — das ist der Standardfall, wenn `server.js` die App selbst ausliefert.

---

## 6. Erste Schritte auf der Startseite

Auf der Startseite wählen Sie den Arbeitsmodus aus:

- **ENM-Datei öffnen** — lädt eine unverschlüsselte ENM-Datei oder eine verschlüsselte Lehrerdatei (`.enc.json`) vom Gerät.
- **SVWS-Verbindung** — stellt eine direkte Verbindung zum SVWS-Server her (erfordert Zugangsdaten).

### Hinweise

- Die Anwendung speichert keine Zugangsdaten dauerhaft.
- Passwörter und Verbindungsdaten verbleiben im Arbeitsspeicher des Browsers und werden nach dem Schließen der Seite nicht aufbewahrt.
- Bei offenen Änderungen erhalten Sie einen Hinweis, bevor Sie die Seite verlassen.
