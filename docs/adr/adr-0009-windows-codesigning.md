# ADR-0009: Windows Code Signing mit OV-Zertifikat via USB-Token

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

Der Signiervorgang wird auf **Ubuntu 24.04** (Entwicklungsmaschine) durchgeführt — nicht auf Windows. Das Zertifikat liegt auf einem physischen USB-Token (Hardware Security Module), was ein PKCS#11-basiertes Signing erfordert.

Es stehen zwei Token zur Verfügung:

- **SafeNet eToken** — physisches USB-HSM, Treiber über SafeNet Authentication Client (SAC)
- **DigiCert KeyLocker** — physisches USB-Token, Treiber über DigiCert KeyLocker Client

---

## Entscheidung

### Werkzeug: `osslsigncode` + PKCS#11

Auf Linux gibt es keine native Portierung von `signtool.exe`. Stattdessen wird **`osslsigncode`** verwendet — das einzige quelloffene Tool, das PE-Dateien (`.exe`, `.dll`) auf Linux signieren kann und dabei PKCS#11-Token (USB-HSM) direkt unterstützt.

```bash
sudo apt install osslsigncode opensc libengine-pkcs11-openssl
```

### Signiervorgang (vereinfacht)

```bash
osslsigncode sign \
    -pkcs11engine  /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so \
    -pkcs11module  <token-modul.so> \
    -key           "pkcs11:type=private" \
    -readpass      <(printf '%s' "$TOKEN_PIN") \
    -ts            http://timestamp.digicert.com \
    -h             sha256 \
    -in            dist/App.exe \
    -out           dist/App-signed.exe
```

### Skript: `scripts/sign-windows-exe.sh`

Der vollständige Signiervorgang ist in [`scripts/sign-windows-exe.sh`](../../scripts/sign-windows-exe.sh) gekapselt. Das Skript:

- unterstützt beide Token per `--token safenet` / `--token digicert`
- fragt die PIN interaktiv ab (oder liest sie aus `$TOKEN_PIN` für CI)
- prüft das Vorhandensein aller Abhängigkeiten mit sprechenden Fehlermeldungen
- verifiziert die Signatur nach dem Signing automatisch

---

## Token-Konfiguration

### SafeNet eToken

| Parameter         | Wert                                      |
|-------------------|-------------------------------------------|
| Treiber           | SafeNet Authentication Client (SAC)       |
| Download          | https://cpl.thalesgroup.com/access-management/safenet-authentication-client |
| PKCS#11 Modul     | `/usr/lib/libeToken.so`                   |
| Timestamp-Server  | `http://timestamp.digicert.com`           |

Installation unter Ubuntu:
```bash
# SAC-Paket von Thales herunterladen (DEB-Paket für Linux)
sudo dpkg -i SafeNetAuthenticationClient-<version>.deb
```

### DigiCert KeyLocker

| Parameter         | Wert                                           |
|-------------------|------------------------------------------------|
| Treiber           | DigiCert KeyLocker Client                      |
| Download          | https://www.digicert.com/tools/software-trust-manager/code-signing |
| PKCS#11 Modul     | `/usr/local/lib/libdigiCryptToken.so`          |
| Timestamp-Server  | `http://timestamp.digicert.com`                |

---

## Verwendung

**Abhängigkeiten installieren (einmalig):**
```bash
sudo apt install osslsigncode opensc libengine-pkcs11-openssl
# Anschließend den jeweiligen Token-Treiber installieren (siehe oben)
```

**Zertifikate auf dem Token anzeigen:**
```bash
./scripts/sign-windows-exe.sh --token safenet  --list-certs
./scripts/sign-windows-exe.sh --token digicert --list-certs
```

**EXE signieren:**
```bash
# SafeNet eToken
./scripts/sign-windows-exe.sh --token safenet dist/App.exe

# DigiCert KeyLocker
./scripts/sign-windows-exe.sh --token digicert dist/App.exe

# Mit explizitem Ausgabepfad
./scripts/sign-windows-exe.sh --token safenet dist/App.exe dist/App-signed.exe
```

**Mehrere Zertifikate auf einem Token — gezielt auswählen:**
```bash
export CERT_SUBJECT="My Company GmbH"
./scripts/sign-windows-exe.sh --token safenet dist/App.exe
```

**In CI/CD (PIN aus Secret):**
```bash
export TOKEN_PIN="${{ secrets.TOKEN_PIN }}"
./scripts/sign-windows-exe.sh --token digicert dist/App.exe
```

---

## Verworfene Alternativen

| Alternative                  | Grund für Ablehnung                                          |
|------------------------------|--------------------------------------------------------------|
| Signing auf Windows-VM       | Zusätzliche Infrastruktur, USB-Passthrough in VM fehleranfällig |
| Cloud-Signing (DigiCert ONE) | Kein physischer Token nötig, aber kostenpflichtiger Dienst; bestehende Token werden weitergenutzt |
| `signtool.exe` via Wine      | Wine hat keine stabile PKCS#11-Smart-Card-Unterstützung      |
| Selbstsigniertes Zertifikat  | Löst SmartScreen-Warnung nicht, nur für Entwicklung geeignet |

---

## Konsequenzen

**Positiv:**
- SmartScreen-Warnung entfällt für Endnutzer
- Signing läuft vollständig auf der bestehenden Linux-Entwicklungsmaschine
- Beide vorhandenen Token werden unterstützt — kein Lock-in auf einen Anbieter
- Signatur wird nach jedem Signing automatisch verifiziert

**Negativ / Risiken:**
- Physischer Token muss beim Signing eingesteckt sein — nicht vollständig automatisierbar ohne Hardware-Zugang
- PIN muss sicher aufbewahrt werden; bei CI/CD als verschlüsseltes Secret hinterlegen
- Token-Treiber (SAC, KeyLocker) sind proprietäre Software und nicht im Ubuntu-Repository

---

## Referenzen

- [`scripts/sign-windows-exe.sh`](../../scripts/sign-windows-exe.sh)
- [osslsigncode GitHub](https://github.com/mtrojnar/osslsigncode)
- [SafeNet Authentication Client — Thales](https://cpl.thalesgroup.com/access-management/safenet-authentication-client)
- [DigiCert KeyLocker Client](https://www.digicert.com/tools/software-trust-manager/code-signing)
- [ADR-0008: Electron-Konfiguration](adr-0008-electron)
