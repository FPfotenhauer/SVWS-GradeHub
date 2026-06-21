#!/usr/bin/env bash
# Signs a Windows EXE with an OV Code Signing certificate.
#
# Supported signing backends:
#   --token safenet    SafeNet eToken (USB-HSM, PKCS#11 + PIN)
#   --token digicert   DigiCert KeyLocker (Cloud-HSM, smctl + API-Credentials)
#
# ── SafeNet eToken ────────────────────────────────────────────────────────────
# Dependencies:
#   sudo apt install osslsigncode opensc libengine-pkcs11-openssl
#   + SafeNet Authentication Client (SAC) von Thales:
#     https://cpl.thalesgroup.com/access-management/safenet-authentication-client
#
# Environment variables (optional):
#   TOKEN_PIN        eToken-PIN (sonst interaktiv abgefragt)
#   CERT_SUBJECT     Zertifikats-Label, falls mehrere Certs auf dem Token
#
# ── DigiCert KeyLocker (Cloud-HSM) ───────────────────────────────────────────
# Dependencies:
#   smctl (DigiCert Software Trust Manager CLI):
#     https://docs.digicert.com/de/software-trust-manager/getting-started/client-tool-installation.html
#
# Required environment variables:
#   SM_API_KEY               API-Key aus DigiCert ONE
#   SM_CLIENT_CERT_FILE      Pfad zur Client-Zertifikatsdatei (.p12)
#   SM_CLIENT_CERT_PASSWORD  Passwort der .p12-Datei
#   SM_HOST                  DigiCert ONE Host (z.B. https://clientauth.one.digicert.com)
#   SM_KEYPAIR_ALIAS         Alias des Schlüsselpaars (aus DigiCert ONE)
#
# Usage:
#   ./sign-windows-exe.sh --token safenet  <input.exe> [output.exe]
#   ./sign-windows-exe.sh --token digicert <input.exe> [output.exe]
#   ./sign-windows-exe.sh --token safenet  --list-certs
#   ./sign-windows-exe.sh --token digicert --list-certs

set -euo pipefail

# ─── Konfiguration ────────────────────────────────────────────────────────────

# SafeNet eToken
SAFENET_MODULE="${SAFENET_MODULE:-/usr/lib/libeToken.so}"
SAFENET_TIMESTAMP="http://timestamp.digicert.com"
PKCS11_ENGINE="${PKCS11_ENGINE:-/usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so}"

# DigiCert KeyLocker
DIGICERT_TIMESTAMP="http://timestamp.digicert.com"

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
    echo "SafeNet env vars (optional):"
    echo "  TOKEN_PIN, CERT_SUBJECT"
    echo ""
    echo "DigiCert env vars (required):"
    echo "  SM_API_KEY, SM_CLIENT_CERT_FILE, SM_CLIENT_CERT_PASSWORD"
    echo "  SM_HOST, SM_KEYPAIR_ALIAS"
    echo ""
    exit 1
}

# ─── SafeNet-Funktionen (PKCS#11) ─────────────────────────────────────────────

check_deps_safenet() {
    local missing=()
    command -v osslsigncode &>/dev/null || missing+=("osslsigncode")
    command -v pkcs11-tool  &>/dev/null || missing+=("opensc")
    [[ ${#missing[@]} -eq 0 ]] || die "Fehlende Pakete: ${missing[*]}\n  sudo apt install osslsigncode opensc libengine-pkcs11-openssl"
    [[ -f "$PKCS11_ENGINE" ]]  || die "PKCS11 Engine nicht gefunden: $PKCS11_ENGINE\n  sudo apt install libengine-pkcs11-openssl"
    [[ -f "$SAFENET_MODULE" ]] || die "SafeNet Modul nicht gefunden: $SAFENET_MODULE\n  SafeNet Authentication Client (SAC) installieren."
}

list_certs_safenet() {
    echo ""
    echo "Zertifikate auf dem SafeNet eToken:"
    pkcs11-tool --module "$SAFENET_MODULE" --list-objects --type cert 2>/dev/null \
        || die "Token nicht lesbar — ist er eingesteckt?"
}

sign_safenet() {
    local input="$1" output="$2"

    if [[ -z "${TOKEN_PIN:-}" ]]; then
        read -rsp "  PIN für SafeNet eToken: " TOKEN_PIN
        echo ""
    fi

    local key_uri="pkcs11:type=private"
    if [[ -n "${CERT_SUBJECT:-}" ]]; then
        key_uri="pkcs11:object=${CERT_SUBJECT};type=private"
        info "Zertifikat: $CERT_SUBJECT"
    fi

    osslsigncode sign \
        -pkcs11engine  "$PKCS11_ENGINE" \
        -pkcs11module  "$SAFENET_MODULE" \
        -key           "$key_uri" \
        -readpass      <(printf '%s' "$TOKEN_PIN") \
        -ts            "$SAFENET_TIMESTAMP" \
        -h             "$DIGEST" \
        -in            "$input" \
        -out           "$output"
}

# ─── DigiCert KeyLocker-Funktionen (Cloud-HSM via smctl) ──────────────────────

check_deps_digicert() {
    command -v smctl &>/dev/null \
        || die "smctl nicht gefunden.\n  DigiCert Software Trust Manager CLI installieren:\n  https://docs.digicert.com/de/software-trust-manager/getting-started/client-tool-installation.html"

    local missing_vars=()
    [[ -n "${SM_API_KEY:-}"              ]] || missing_vars+=("SM_API_KEY")
    [[ -n "${SM_CLIENT_CERT_FILE:-}"     ]] || missing_vars+=("SM_CLIENT_CERT_FILE")
    [[ -n "${SM_CLIENT_CERT_PASSWORD:-}" ]] || missing_vars+=("SM_CLIENT_CERT_PASSWORD")
    [[ -n "${SM_HOST:-}"                 ]] || missing_vars+=("SM_HOST")
    [[ -n "${SM_KEYPAIR_ALIAS:-}"        ]] || missing_vars+=("SM_KEYPAIR_ALIAS")

    [[ ${#missing_vars[@]} -eq 0 ]] \
        || die "Fehlende Umgebungsvariablen für DigiCert KeyLocker: ${missing_vars[*]}"
}

list_certs_digicert() {
    echo ""
    echo "Schlüsselpaare in DigiCert KeyLocker:"
    smctl keypair ls
}

sign_digicert() {
    local input="$1" output="$2"

    # smctl signiert die Datei direkt; bei abweichendem Output-Pfad vorher kopieren
    if [[ "$input" != "$output" ]]; then
        cp "$input" "$output"
    fi

    smctl sign \
        --keypair-alias "$SM_KEYPAIR_ALIAS" \
        --input         "$output" \
        --ts            "$DIGICERT_TIMESTAMP" \
        --alg           "$DIGEST"
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

case "$TOKEN_TYPE" in
    safenet)
        check_deps_safenet
        if $LIST_ONLY; then list_certs_safenet; exit 0; fi

        [[ -n "$INPUT" ]] || die "Keine Eingabedatei.\n  Beispiel: $0 --token safenet dist/App.exe"
        [[ -f "$INPUT" ]] || die "Datei nicht gefunden: $INPUT"
        OUTPUT="${OUTPUT:-${INPUT%.exe}_signed.exe}"

        echo ""
        info "Token:     SafeNet eToken (USB-HSM)"
        info "Input:     $INPUT"
        info "Output:    $OUTPUT"
        info "Timestamp: $SAFENET_TIMESTAMP"
        echo ""

        sign_safenet "$INPUT" "$OUTPUT"
        ;;

    digicert)
        check_deps_digicert
        if $LIST_ONLY; then list_certs_digicert; exit 0; fi

        [[ -n "$INPUT" ]] || die "Keine Eingabedatei.\n  Beispiel: $0 --token digicert dist/App.exe"
        [[ -f "$INPUT" ]] || die "Datei nicht gefunden: $INPUT"
        OUTPUT="${OUTPUT:-${INPUT%.exe}_signed.exe}"

        echo ""
        info "Token:     DigiCert KeyLocker (Cloud-HSM)"
        info "Alias:     $SM_KEYPAIR_ALIAS"
        info "Input:     $INPUT"
        info "Output:    $OUTPUT"
        info "Timestamp: $DIGICERT_TIMESTAMP"
        echo ""

        sign_digicert "$INPUT" "$OUTPUT"
        ;;

    *)
        die "Unbekannter Token-Typ: '$TOKEN_TYPE'. Erlaubt: safenet, digicert"
        ;;
esac

echo ""
echo "Verifiziere Signatur..."
osslsigncode verify -in "$OUTPUT" && echo "  Signatur OK" || die "Signaturprüfung fehlgeschlagen"

echo ""
echo "Fertig: $OUTPUT"
echo ""
