# Adminbereich für Notendateien

## Übersicht

Der Adminbereich (`/admin`) dient zur Vorbereitung und Verteilung verschlüsselter Notendateien sowie zum Import ausgefüllter Dateien zurück in den SVWS-Server.
Er richtet sich an Schulleitungen und Notenkoordinatoren.

Eine kompakte Schritt-fuer-Schritt-Version mit Screenshots finden Sie hier: [Admin-Tutorial](./admin-tutorial.md).

> **Hinweis zum Betriebsmodus:** Der Adminbereich steht in beiden Betriebsmodi zur Verfügung. Der Button **Dateien versenden** (E-Mail-Versand) erscheint jedoch nur, wenn SVWS-GradeHub über einen Webserver betrieben wird (Server-Modus). Im reinen Offline-Modus (`file://`) können Dateien nur heruntergeladen und manuell verteilt werden.

## Funktionen im Adminbereich

- Erstellung und Verwaltung von Notenpasswörtern je Lehrkraft
- Generierung eines RSA-Schlüsselpaares für die Schule
- Erzeugung verschlüsselter Lehrerdateien (`.enc.json`)
- **Versand der Lehrerdateien per E-Mail** (nur Server-Modus)
- Import zurückgegebener Notendateien und Rückschreiben an den SVWS-Server
- Sicheres Speichern und Laden der Konfiguration als verschlüsselte GradeHub-Datei (`.ghb`)

---

## So arbeiten Sie im Adminbereich

### 1. Lehrkräfte laden

Nach dem Einloggen lädt die Anwendung automatisch die Lehrerliste vom SVWS-Server.
Aktive Lehrkräfte können über den Schalter „Nur aktive Lehrkräfte" gefiltert werden.
Über die Kontrollkästchen wählen Sie einzelne Lehrkräfte oder alle gleichzeitig aus.

### 2. Notenpasswörter erzeugen

Für ausgewählte Lehrkräfte können automatisch sichere Notenpasswörter generiert werden.
Klicken Sie auf **Passwörter generieren**, um für alle ausgewählten Lehrkräfte neue Kennwörter zu erstellen.

Über **Passwortstreifen drucken** erzeugen Sie eine druckfertige PDF mit den Notenpasswörtern je Lehrkraft.

### 3. Schlüssel für die Schule generieren

Bevor verschlüsselte Lehrerdateien erzeugt werden, muss ein Schlüsselpaar für die Schule erstellt werden.
Klicken Sie auf **Schlüssel generieren** und bestätigen Sie den Dialog.
Es wird ein RSA-OAEP-Schlüsselpaar mit 4096 Bit und SHA-256 erzeugt.

### 4. Verschlüsselte Lehrerdateien erstellen

Nach Schlüsselpaar und Notenpasswörtern können Sie für ausgewählte Lehrkräfte verschlüsselte Exportdateien erzeugen.
Klicken Sie auf **Dateien erstellen**:

- Die App lädt die ENM-Daten jeder ausgewählten Lehrkraft vom SVWS-Server.
- Für jede Lehrkraft entsteht ein ZIP-Archiv (`<Kürzel>-enm.zip`) mit `enm.json` und dem öffentlichen Schlüssel.
- Das ZIP wird mit AES-256-GCM und dem jeweiligen Notenpasswort verschlüsselt.
- Die verschlüsselte Datei (`<Kürzel>-enm.zip.enc.json`) wird zum Download angeboten.

### 5. Lehrerdateien per E-Mail versenden (nur Server-Modus)

Wenn SVWS-GradeHub über einen Webserver betrieben wird, erscheint der Button **Dateien versenden**.

#### E-Mail-Server einrichten

1. Klicken Sie auf **E-Mail-Server konfigurieren**.
2. Tragen Sie die SMTP-Zugangsdaten ein (Host, Port, Benutzername, Passwort, Absenderadresse).
3. Aktivieren Sie **TLS verwenden**, wenn Ihr SMTP-Server eine verschlüsselte Verbindung erfordert.
4. Klicken Sie auf **Verbindung testen**, um die Erreichbarkeit des Mail-Servers zu prüfen.
5. Klicken Sie auf **Übernehmen**, um die Konfiguration zu speichern.

> Die SMTP-Konfiguration wird verschlüsselt in der GradeHub-Konfigurationsdatei (`.ghb`) gespeichert, wenn Sie die Konfiguration sichern.

#### Dateien versenden

1. Wählen Sie die gewünschten Lehrkräfte aus.
2. Klicken Sie auf **Dateien versenden**.
3. Die App erzeugt für jede Lehrkraft die verschlüsselte Notendatei und sendet sie an die im SVWS-Server hinterlegte dienstliche E-Mail-Adresse.
4. Ein Fortschrittsdialog zeigt an, welche Versendungen erfolgreich waren und bei welchen ein Fehler aufgetreten ist.

> **Voraussetzungen für den Versand:**
> - Alle ausgewählten Lehrkräfte müssen ein Notenpasswort haben.
> - Alle ausgewählten Lehrkräfte müssen eine dienstliche E-Mail-Adresse im SVWS-Server hinterlegt haben.
> - Der E-Mail-Server muss konfiguriert und erreichbar sein.

### 6. Ausgefüllte Notendateien importieren

Nachdem Lehrkräfte ihre Noten eingetragen und die Notendatei exportiert haben, können Sie diese Dateien im Adminbereich wieder einsammeln und an den SVWS-Server übermitteln.

Klicken Sie auf **Dateien importieren**:

#### Dateien hinzufügen

- **Dateien auswählen** — Wählen Sie eine oder mehrere Dateien aus (`.enc.json`, `.json`, `.gz`).
- **Ordner auswählen** — Wählen Sie einen Ordner; alle darin enthaltenen Notendateien werden automatisch eingelesen (nur in Browsern mit Ordner-Auswahl-Unterstützung).

#### Dateien entschlüsseln

- Verschlüsselte Dateien (`.enc.json`) werden automatisch anhand des Lehrerkürzels und des gespeicherten Notenpassworts entschlüsselt.
- Wird kein Passwort gefunden (Status **Kennwort fehlt**), können Sie das Kürzel korrigieren oder das Kennwort manuell eingeben und auf **Erneut verarbeiten** klicken.

#### Noten an SVWS-Server senden

- Klicken Sie bei einem einzelnen Eintrag (Status **Bereit**) auf **An SVWS senden**.
- Klicken Sie auf **Alle senden**, um alle erfolgreich entschlüsselten Dateien auf einmal zu übertragen.
- Die App überträgt die ENM-Daten über den Endpunkt `POST /db/{schema}/enm/v2/import` an den SVWS-Server.
- Der Status wechselt auf **Gesendet** bei Erfolg bzw. **Sendefehler** bei einem Problem.

### 7. Konfiguration speichern und wieder laden

- **Speichern** erstellt eine verschlüsselte Konfigurationsdatei (`gradehub-config.ghb`), die Notenpasswörter, Schlüssel und SMTP-Einstellungen enthält.
- **Laden** stellt die gespeicherte Konfiguration über das eingegebene Kennwort wieder her.

> Speichern Sie die Konfiguration nach jeder Änderung (neue Passwörter, neues Schlüsselpaar, geänderte SMTP-Daten), damit Sie beim nächsten Sitzungsstart nahtlos weitermachen können.

---

## Sicherheitshinweise

- Bewahren Sie den privaten Schlüssel geheim auf — er wird nur im Adminbereich benötigt.
- Geben Sie die Konfigurationsdatei (`.ghb`) und den privaten Schlüssel nicht unbefugt weiter.
- Verwenden Sie für die Konfigurationsdatei ein starkes Kennwort mit mindestens 8 Zeichen.
- Die SMTP-Zugangsdaten werden nur verschlüsselt in der `.ghb`-Datei gespeichert; im Arbeitsspeicher existieren sie nur während der aktuellen Sitzung.
- Stellen Sie sicher, dass die Lehrerdateien nur mit dem jeweils zugehörigen Notenpasswort geöffnet werden können.
