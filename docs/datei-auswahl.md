# Dateien auswählen und Daten laden

## 1. ENM-Datei auswählen

Wenn Sie mit einer ENM-Datei arbeiten, geht das so:

1. Klicken Sie auf der Startseite auf `ENM-Datei öffnen`.
2. Wählen Sie die Datei aus dem Dateisystem aus.
3. Die Anwendung lädt und entpackt die ENM-Daten automatisch.

### Was erwartet die App?

- Eine gültige ENM-Datei im SVWS-Format
- Ggf. eine gzip-komprimierte Datei
- Schüler-, Lerngruppen- und Leistungsdaten

## 2. SVWS-Verbindung nutzen

Bei direkter Verbindung zum SVWS-Server:

1. Geben Sie die Server-URL ein.
2. Tragen Sie das Schema ein.
3. Geben Sie Ihren Benutzernamen und Ihr Passwort ein.
4. Klicken Sie auf `Daten laden`.

> Die Anwendung prüft, ob der `enm/v2`-Endpunkt verfügbar ist. Falls nicht, kann sie auf ältere API-Versionen zurückgreifen.

## 3. Prüfen nach dem Laden

Nach dem Laden sehen Sie:

- verfügbare Lerngruppen und Kurse
- Anzahl der Schüler
- Vorhandene Leistungsdaten

### Wenn ein Fehler auftritt

- Prüfen Sie die Datei auf Beschädigungen.
- Kontrollieren Sie URL, Schema, Benutzername und Passwort.
- Verwenden Sie bei Bedarf den Offline-Modus mit ENM-Export.
