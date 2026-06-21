# ADR-0009: Windows Code Signing mit OV-Zertifikat

| Feld        | Wert                                     |
|-------------|------------------------------------------|
| **ID**      | ADR-0009                                 |
| **Titel**   | Windows Code Signing mit OV-Zertifikat   |
| **Status**  | Akzeptiert                               |
| **Datum**   | 2026-06-21                               |
| **Autor**   | FPfotenhauer                             |
| **Projekt** | SVWS-GradeHub                            |

---

## Kontext

SVWS-GradeHub wird als Electron-App für Windows ausgeliefert (ADR-0008). Windows-Nutzer erhalten beim Starten nicht signierter Executables eine SmartScreen-Warnung, die den Download blockiert oder Vertrauen untergräbt. Um diese Warnung zu eliminieren, muss die `.exe` mit einem OV-Codesigning-Zertifikat signiert werden.

Der Signiervorgang wird auf **Ubuntu 24.04** (Entwicklungsmaschine) durchgeführt — nicht auf Windows. Es stehen zwei grundlegend unterschiedliche Signing-Backends zur Verfügung:

| Backend               | Typ        | Schlüsselspeicher       | Authentifizierung    |
|-----------------------|------------|-------------------------|----------------------|
| **SafeNet eToken**    | USB-HSM    | Physischer Token        | PIN                  |
| **DigiCert KeyLocker**| Cloud-HSM  | DigiCert-Rechenzentrum  | API-Credentials      |

Der Schlüssel verlässt bei beiden Backends **niemals** die HSM-Umgebung — beim eToken nicht den Chip, beim KeyLocker nicht das DigiCert-Rechenzentrum.

---

## Entscheidung

### Backend 1: SafeNet eToken (USB-HSM)

**Werkzeug:** `osslsigncode` + PKCS#11

Auf Linux gibt es keine native Portierung von `signtool.exe`. `osslsigncode` ist das einzige quelloffene Tool, das PE-Dateien (`.exe`, `.dll`) auf Linux signieren kann und dabei PKCS#11-Token direkt unterstützt.

```bash
sudo apt install osslsigncode opensc libengine-pkcs11-openssl
# + SafeNet Authentication Client (SAC) von Thales installieren
```

Der eToken meldet sich über das PKCS#11-Modul `/usr/lib/libeToken.so` am System an. Die PIN wird interaktiv abgefragt oder über `$TOKEN_PIN` übergeben.

```bash
osslsigncode sign \
    -pkcs11engine  /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so \
    -pkcs11module  /usr/lib/libeToken.so \
    -key           "pkcs11:type=private" \
    -readpass      <(printf '%s' "$TOKEN_PIN") \
    -ts            http://timestamp.digicert.com \
    -h             sha256 \
    -in            dist/App.exe \
    -out           dist/App-signed.exe
```

---

### Backend 2: DigiCert KeyLocker (Cloud-HSM)

**Werkzeug:** `smctl` (DigiCert Software Trust Manager CLI)

DigiCert KeyLocker ist ein **Cloud-HSM** — der private Schlüssel liegt in DigiCerts Rechenzentrum und verlässt es nie. Das Signing geschieht serverseitig; lokal wird nur das Signing-Request mit API-Credentials authentifiziert. Ein PKCS#11-Modul oder USB-Stecker ist nicht erforderlich.

```bash
# smctl installieren:
# https://docs.digicert.com/de/software-trust-manager/getting-started/client-tool-installation.html
```

Erforderliche Umgebungsvariablen:

| Variable                   | Bedeutung                                     |
|----------------------------|-----------------------------------------------|
| `SM_API_KEY`               | API-Key aus DigiCert ONE                      |
| `SM_CLIENT_CERT_FILE`      | Pfad zur Client-Zertifikatsdatei (`.p12`)     |
| `SM_CLIENT_CERT_PASSWORD`  | Passwort der `.p12`-Datei                     |
| `SM_HOST`                  | DigiCert ONE Host (z.B. `https://clientauth.one.digicert.com`) |
| `SM_KEYPAIR_ALIAS`         | Alias des Schlüsselpaars aus DigiCert ONE     |

```bash
smctl sign \
    --keypair-alias "$SM_KEYPAIR_ALIAS" \
    --input         dist/App.exe \
    --ts            http://timestamp.digicert.com \
    --alg           sha256
```

---

### Skript: `scripts/sign-windows-exe.sh`

Beide Backends sind in [`scripts/sign-windows-exe.sh`](../../scripts/sign-windows-exe.sh) gekapselt. Das Skript:

- wählt per `--token safenet` / `--token digicert` das Backend
- prüft alle Abhängigkeiten und Umgebungsvariablen vorab mit sprechenden Fehlermeldungen
- verifiziert die Signatur nach dem Signing automatisch mit `osslsigncode verify`

---

## Verwendung

### SafeNet eToken

**Einmalige Einrichtung:**
```bash
sudo apt install osslsigncode opensc libengine-pkcs11-openssl
# SAC-Paket von Thales herunterladen und installieren:
# https://cpl.thalesgroup.com/access-management/safenet-authentication-client
sudo dpkg -i SafeNetAuthenticationClient-<version>.deb
```

**Signieren:**
```bash
# Zertifikate auf dem Token anzeigen
./scripts/sign-windows-exe.sh --token safenet --list-certs

# EXE signieren (PIN wird interaktiv abgefragt)
./scripts/sign-windows-exe.sh --token safenet dist/App.exe

# Für CI/CD: PIN aus Secret
export TOKEN_PIN="${{ secrets.SAFENET_PIN }}"
./scripts/sign-windows-exe.sh --token safenet dist/App.exe
```

### DigiCert KeyLocker

**Einmalige Einrichtung:**
```bash
# smctl installieren (Anleitung siehe DigiCert-Dokumentation)
# Client-Zertifikat (.p12) aus DigiCert ONE herunterladen
```

**Signieren:**
```bash
# Schlüsselpaare in DigiCert ONE auflisten
./scripts/sign-windows-exe.sh --token digicert --list-certs

# EXE signieren
export SM_API_KEY="..."
export SM_CLIENT_CERT_FILE="/pfad/zur/cert.p12"
export SM_CLIENT_CERT_PASSWORD="..."
export SM_HOST="https://clientauth.one.digicert.com"
export SM_KEYPAIR_ALIAS="mein-codesigning-key"

./scripts/sign-windows-exe.sh --token digicert dist/App.exe

# Für CI/CD: alle Variablen als Secrets hinterlegen
```

---

## Verworfene Alternativen

| Alternative                  | Grund für Ablehnung                                                       |
|------------------------------|---------------------------------------------------------------------------|
| Signing auf Windows-VM       | Zusätzliche Infrastruktur; USB-Passthrough in VM fehleranfällig           |
| `signtool.exe` via Wine      | Wine hat keine stabile PKCS#11-/Smart-Card-Unterstützung                  |
| Selbstsigniertes Zertifikat  | Löst SmartScreen-Warnung nicht; nur für lokale Entwicklung geeignet       |
| osslsigncode für KeyLocker   | KeyLocker stellt einen virtuellen PKCS#11-Provider bereit, der aber deutlich komplexer einzurichten ist als der native `smctl`-Weg |

---

## Konsequenzen

**Positiv:**
- SmartScreen-Warnung entfällt für Endnutzer
- Signing läuft vollständig auf der bestehenden Linux-Entwicklungsmaschine
- Beide Backends werden unterstützt — kein Lock-in auf einen Anbieter
- Signatur wird nach jedem Signing automatisch verifiziert

**Negativ / Risiken:**

| Backend    | Risiko                                                                 |
|------------|------------------------------------------------------------------------|
| SafeNet    | Physischer Token muss eingesteckt sein — blockiert vollautomatische CI |
| DigiCert   | Internetverbindung zu DigiCert ONE erforderlich; Signing schlägt bei Ausfall fehl |
| Beide      | Credentials/PIN müssen als verschlüsselte CI-Secrets hinterlegt werden |

---

## Referenzen

- [`scripts/sign-windows-exe.sh`](../../scripts/sign-windows-exe.sh)
- [osslsigncode GitHub](https://github.com/mtrojnar/osslsigncode)
- [SafeNet Authentication Client — Thales](https://cpl.thalesgroup.com/access-management/safenet-authentication-client)
- [DigiCert Software Trust Manager CLI (smctl)](https://docs.digicert.com/de/software-trust-manager/getting-started/client-tool-installation.html)
- [DigiCert KeyLocker — Übersicht](https://www.digicert.com/signing/code-signing-certificates)
- [ADR-0008: Electron-Konfiguration](adr-0008-electron)
