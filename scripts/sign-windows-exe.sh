#!/usr/bin/env bash
# Signs a Windows EXE using an OV Code Signing certificate on a USB token (PKCS#11).
#
# Supported tokens:
#   --token safenet    SafeNet eToken  (needs SafeNet Authentication Client)
#   --token digicert   DigiCert KeyLocker (needs KeyLocker Client)
#
# Install base dependencies:
#   sudo apt install osslsigncode opensc libengine-pkcs11-openssl
#
# SafeNet Authentication Client (SAC) for Linux:
#   Download from: https://cpl.thalesgroup.com/access-management/safenet-authentication-client
#   After install the PKCS#11 module will be at /usr/lib/libeToken.so
#
# DigiCert KeyLocker Client for Linux:
#   Download from: https://www.digicert.com/tools/software-trust-manager/code-signing
#   After install the PKCS#11 module will be at /usr/local/lib/libdigiCryptToken.so
#
# Usage:
#   ./sign-windows-exe.sh --token safenet  <input.exe> [output.exe]
#   ./sign-windows-exe.sh --token digicert <input.exe> [output.exe]
#   ./sign-windows-exe.sh --token safenet  --list-certs
#   ./sign-windows-exe.sh --token digicert --list-certs

set -euo pipefail

# ─── Token-Definitionen ───────────────────────────────────────────────────────

# SafeNet eToken (nach Installation von SafeNet Authentication Client)
SAFENET_MODULE="/usr/lib/libeToken.so"
SAFENET_TIMESTAMP="http://timestamp.digicert.com"

# DigiCert KeyLocker Client
DIGICERT_MODULE="/usr/local/lib/libdigiCryptToken.so"
DIGICERT_TIMESTAMP="http://timestamp.digicert.com"

# OpenSSL PKCS#11 engine
PKCS11_ENGINE="${PKCS11_ENGINE:-/usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so}"

# SHA-2 digest
DIGEST="sha256"

# ─── Helpers ──────────────────────────────────────────────────────────────────

die()  { echo ""; echo "ERROR: $*" >&2; exit 1; }
info() { echo "  $*"; }

usage() {
    echo ""
    echo "Usage:"
    echo "  $0 --token safenet|digicert <input.exe> [output.exe]"
    echo "  $0 --token safenet|digicert --list-certs"
    echo ""
    echo "Environment variables:"
    echo "  TOKEN_PIN       Token-PIN (sonst interaktiv abgefragt)"
    echo "  CERT_SUBJECT    Zertifikats-Label, falls mehrere Certs auf dem Token"
    echo "  PKCS11_ENGINE   Pfad zur pkcs11.so Engine (wird selten geändert)"
    echo ""
    exit 1
}

check_deps() {
    local missing=()
    command -v osslsigncode &>/dev/null || missing+=("osslsigncode")
    command -v pkcs11-tool  &>/dev/null || missing+=("opensc")

    if [[ ${#missing[@]} -gt 0 ]]; then
        die "Fehlende Pakete: ${missing[*]}\n  sudo apt install osslsigncode opensc libengine-pkcs11-openssl"
    fi

    [[ -f "$PKCS11_ENGINE" ]] || die "PKCS11 Engine nicht gefunden: $PKCS11_ENGINE\n  sudo apt install libengine-pkcs11-openssl"
}

select_token() {
    case "$1" in
        safenet)
            PKCS11_MODULE="$SAFENET_MODULE"
            TIMESTAMP_URL="$SAFENET_TIMESTAMP"
            TOKEN_LABEL="SafeNet eToken"
            ;;
        digicert)
            PKCS11_MODULE="$DIGICERT_MODULE"
            TIMESTAMP_URL="$DIGICERT_TIMESTAMP"
            TOKEN_LABEL="DigiCert KeyLocker"
            ;;
        *)
            die "Unbekannter Token-Typ: '$1'. Erlaubt: safenet, digicert"
            ;;
    esac

    [[ -f "$PKCS11_MODULE" ]] || die "PKCS#11 Modul für '$TOKEN_LABEL' nicht gefunden: $PKCS11_MODULE\n  Bitte den passenden Treiber installieren (siehe Kommentar im Skript)."
}

list_certs() {
    echo ""
    echo "Zertifikate auf dem Token ($TOKEN_LABEL):"
    echo "Module: $PKCS11_MODULE"
    echo ""
    pkcs11-tool --module "$PKCS11_MODULE" --list-objects --type cert 2>/dev/null \
        || die "Token nicht lesbar — ist er eingesteckt?"
}

prompt_pin() {
    if [[ -z "${TOKEN_PIN:-}" ]]; then
        read -rsp "  PIN für $TOKEN_LABEL: " TOKEN_PIN
        echo ""
    fi
}

# ─── Argument-Parsing ─────────────────────────────────────────────────────────

TOKEN_TYPE=""
INPUT=""
OUTPUT=""
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --token|-t)
            [[ -n "${2:-}" ]] || die "--token braucht einen Wert: safenet oder digicert"
            TOKEN_TYPE="$2"; shift 2 ;;
        --list-certs|-l)
            LIST_ONLY=true; shift ;;
        --help|-h)
            usage ;;
        -*)
            die "Unbekannte Option: $1" ;;
        *)
            if [[ -z "$INPUT" ]]; then
                INPUT="$1"
            elif [[ -z "$OUTPUT" ]]; then
                OUTPUT="$1"
            else
                die "Zu viele Argumente"
            fi
            shift ;;
    esac
done

[[ -n "$TOKEN_TYPE" ]] || die "--token ist erforderlich. Beispiel: --token safenet"

# ─── Main ─────────────────────────────────────────────────────────────────────

echo ""
echo "Windows EXE Code Signing"
echo "========================"

check_deps
select_token "$TOKEN_TYPE"

if $LIST_ONLY; then
    list_certs
    exit 0
fi

[[ -n "$INPUT" ]] || die "Keine Eingabedatei angegeben.\n  Beispiel: $0 --token safenet dist/App.exe"
[[ -f "$INPUT" ]] || die "Eingabedatei nicht gefunden: $INPUT"

OUTPUT="${OUTPUT:-${INPUT%.exe}_signed.exe}"

echo ""
info "Token:     $TOKEN_LABEL"
info "Input:     $INPUT"
info "Output:    $OUTPUT"
info "Timestamp: $TIMESTAMP_URL"
echo ""

prompt_pin

# PKCS#11 URI — mit CERT_SUBJECT gezielt ein Zertifikat wählen (optional)
if [[ -n "${CERT_SUBJECT:-}" ]]; then
    KEY_URI="pkcs11:object=${CERT_SUBJECT};type=private"
    info "Zertifikat: $CERT_SUBJECT"
else
    KEY_URI="pkcs11:type=private"
fi

echo ""
echo "Signiere..."

osslsigncode sign \
    -pkcs11engine  "$PKCS11_ENGINE" \
    -pkcs11module  "$PKCS11_MODULE" \
    -key           "$KEY_URI" \
    -readpass      <(printf '%s' "$TOKEN_PIN") \
    -ts            "$TIMESTAMP_URL" \
    -h             "$DIGEST" \
    -in            "$INPUT" \
    -out           "$OUTPUT"

echo ""
echo "Verifiziere Signatur..."
osslsigncode verify -in "$OUTPUT" && echo "  Signatur OK" || die "Signaturprüfung fehlgeschlagen"

echo ""
echo "Fertig: $OUTPUT"
echo ""
