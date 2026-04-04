# Datenschutzhinweise

## 1. Keine Daten ohne Nutzeraktion

SVWS-GradeHub sendet Daten nur dann an einen Server, wenn Sie dies ausdrücklich auslösen.

- Im Offline-Modus bleiben Ihre Daten lokal im Browser.
- Im Online-Modus wird nur beim Import von Änderungen eine Anfrage an den SVWS-Server gesendet.

## 2. Keine dauerhafte Speicherung von Zugangsdaten

Die Zugangsdaten (Benutzername, Passwort) werden nur temporär im Browser gehalten.

- Sie werden nicht in `localStorage`, `sessionStorage` oder Cookies gespeichert.
- Nach einem Seiten-Reload muss die Verbindung neu eingerichtet werden.

## 3. Schutz der Originaldaten

- Die original geladenen ENM-Daten werden nicht verändert.
- Änderungen werden separat als Puffer verwaltet.
- Nur ausdrücklich bestätigte Änderungen werden in den Export oder Import aufgenommen.

## 4. Verschlüsselung und sichere Übertragung

- Bei Nutzung von `https://` kann die App die Web Crypto API für Verschlüsselung nutzen.
- Im `file://`-Modus ist die Verschlüsselung eingeschränkt und die App weist darauf hin.
- Die Datenübertragung zum SVWS-Server erfolgt nur über Ihre eigene Netzwerkverbindung.

## 5. Empfehlung für Lehrkräfte

- Arbeiten Sie nach Möglichkeit im `https://`-Modus.
- Bewahren Sie ENM-Dateien sicher auf und geben Sie sie nicht unbefugt weiter.
- Schließen Sie die Browser-Registerkarte nach Abschluss der Sitzungsarbeit.
