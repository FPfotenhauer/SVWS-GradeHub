# Adminbereich für Notendateien

## Übersicht

Der Adminbereich dient zur Vorbereitung verschlüsselter Lehrerdaten für den Einsatz von SVWS-GradeHub.
Hier werden Lehrerpasswörter erzeugt, ein schulisches Schlüsselpaar generiert und für jede Lehrkraft eine verschlüsselte Exportdatei erstellt.

## Funktionen im Adminbereich

- Erstellung und Verwaltung von Lehrerpasswörtern
- Generierung eines RSA-Schlüsselpaares für die Schule
- Erzeugung von verschlüsselten Lehrerdateien im ZIP-Container
- Sicheres Speichern und Laden der Konfiguration als verschlüsselte GradeHub-Datei

## So arbeiten Sie im Adminbereich

### 1. Lehrkräfte laden

Nach dem Einloggen lädt die Anwendung die verfügbare Lehrerliste vom SVWS-Server.
Aktive Lehrkräfte können gefiltert und einzelne Einträge ausgewählt werden.

### 2. Notenpasswörter erzeugen

Für ausgewählte Lehrkräfte können automatisch sichere Notenpasswörter generiert werden.
Über den Button `Passwörter generieren` entstehen für jede Auswahlrichtige Lehrkraft neue Kennwörter.

### 3. Schlüssel für die Schule generieren

Bevor verschlüsselte Lehrerdateien erzeugt werden, muss ein Schlüsselpaar für die Schule erstellt werden.
Der Adminbereich verwendet dafür RSA-OAEP mit 4096 Bit und SHA-256.

### 4. Verschlüsselte Lehrerdateien erstellen

Nach dem Schlüsselpaar und den Notenpasswörtern können Sie für ausgewählte Lehrkräfte verschlüsselte Exportdateien erzeugen.
Dabei wird für jede Lehrkraft ein ZIP-Archiv mit `enm.json` und dem öffentlichen Schlüssel erstellt und anschließend mit AES-256-GCM verschlüsselt.

### 5. Konfiguration speichern und wieder laden

- `Speichern` erstellt eine verschlüsselte Konfigurationsdatei (`gradehub-config.ghb`), die alle Lehrerpasswörter und Schlüssel enthält.
- `Laden` erlaubt das Wiederherstellen der Konfiguration über das gewählte Kennwort.

## Sicherheitshinweise

- Bewahren Sie den privaten Schlüssel geheim auf.
- Geben Sie die verschlüsselte Konfigurationsdatei nur autorisiert weiter.
- Verwenden Sie für das Speichern ein starkes Kennwort mit mindestens 8 Zeichen.
- Stellen Sie sicher, dass die Lehrkraft-Dateien nur mit den jeweils zugehörigen Notenpasswörtern geöffnet werden können.
