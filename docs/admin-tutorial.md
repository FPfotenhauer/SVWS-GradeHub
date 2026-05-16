# Admin-Tutorial (Kurzfassung)

Diese kurze Schritt-für-Schritt-Anleitung zeigt den typischen Ablauf im Adminbereich: vorbereiten, versenden und Rückläufe importieren.

## 1. Als Admin anmelden

Melden Sie sich mit den bekannten SVWS-Zugangsdaten an und öffnen Sie den Adminbereich.

![Admin-Login](./assets/01-LoginAdmin.png)

## 2. Adminbereich öffnen

Prüfen Sie die Lehrerliste und wählen Sie die relevanten Lehrkräfte aus.

![Adminbereich](./assets/02-Adminbereich.png)

## 3. Schulschlüssel erzeugen

Klicken Sie auf Schlüssel erzeugen und erstellen Sie das RSA-Schlüsselpaar.

![Schluessel erzeugen](./assets/03-SchlüsselErzeugen.png)

Nach erfolgreicher Erstellung sehen Sie die Bestätigung im Dialog.

![Schluessel erzeugt](./assets/04-SchlüsselErzeugt.png)

## 4. Notenpasswörter generieren

Generieren Sie für die ausgewählten Lehrkräfte neue Notenpasswörter.
Der Ausdruck der Kennwörter dient dazu, den Lehrkräften das jeweilige Kennwort auf sicherem Weg zu übergeben.

![Passwoerter generieren](./assets/05-PasswörterGenerieren.png)

Kontrollieren Sie, dass jede Lehrkraft ein Passwort hat.

![Passwoerter in Lehrerliste](./assets/06-PasswörterLehrkräfte.png)

## 5. E-Mail-Server eintragen (nur Server-Version)

Öffnen Sie E-Mail-Server konfigurieren, tragen Sie SMTP-Daten ein und testen Sie die Verbindung.

![Mail-Server eintragen](./assets/07-MailServerEintragen.png)

## 6. Konfiguration speichern

Speichern Sie die Admin-Konfiguration als verschlüsselte GradeHub-Datei (`.ghb`).
Es werden keinerlei Daten dauerhaft im Browser oder an anderer Stelle gespeichert.
Bewahren Sie deshalb die Konfigurationsdatei und das zugehörige Passwort sicher und gut auf, damit Notendateien später wieder entschlüsselt werden können.

![Konfiguration speichern](./assets/08-KonfigurationSpeichern.png)

## 7. Rückläufe importieren

Nach der Noteneingabe durch Lehrkräfte öffnen Sie Dateien importieren und laden die Rücklaufdateien.

![Notenimport Schritt 1](./assets/09-NotenImport1.png)

Prüfen Sie die erkannten Dateien und den Status.

![Notenimport Schritt 2](./assets/10-NotenImport2.png)

Senden Sie die bereiten Einträge an den SVWS-Server (einzeln oder gesammelt).

![Notenimport Schritt 3](./assets/11-NotenImport3.png)

## Abschluss

Wenn alle Einträge den Status Gesendet haben, ist der Import abgeschlossen.