<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { unzipSync, strFromU8 } from 'fflate'

import { useAuthStore } from '@/stores/authStore'
import { useENMStore } from '@/stores/enmStore'
import type { LehrerKurzinfo } from '@/stores/enmStore'

const router = useRouter()
const authStore = useAuthStore()
const enmStore = useENMStore()

const env = import.meta.env as ImportMetaEnv & Record<string, string | boolean | undefined>

function envString(key: string): string {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

function baueBaseUrlAusEnv(): string {
  const explicitBaseUrl = envString('VITE_SVWS_BASE_URL')
  if (explicitBaseUrl !== '') {
    return explicitBaseUrl
  }

  const host = envString('SVWSSERVER_HOST')
  const port = envString('SVWSSERVER_PORT')
  const protocolFromEnv = envString('VITE_SVWS_PROTOCOL') || envString('SVWSSERVER_PROTOCOL')
  if (host === '') {
    return ''
  }

  const isLocalHost = host === 'localhost' || host === '127.0.0.1'
  const defaultProtocol = isLocalHost
    ? (port === '8443' ? 'https' : 'http')
    : 'https'
  const protocol = protocolFromEnv !== '' ? protocolFromEnv : defaultProtocol

  return port !== '' ? `${protocol}://${host}:${port}` : `${protocol}://${host}`
}

function initialValue(storeValue: string, ...fallbacks: string[]): string {
  if (storeValue.trim() !== '') {
    return storeValue
  }
  return fallbacks.find((value) => value !== '') ?? ''
}

const baseUrl = ref<string>(initialValue(authStore.baseUrl, baueBaseUrlAusEnv()))
const schema = ref<string>(initialValue(authStore.schema, envString('VITE_SVWS_SCHEMA'), envString('SVWSSERVER_SCHEMA')))
const username = ref<string>(initialValue(authStore.username, envString('VITE_SVWS_USERNAME'), envString('SVWSSERVER_USER')))
const password = ref<string>(initialValue(authStore.password, envString('VITE_SVWS_PASSWORD'), envString('SVWSSERVER_PASSWORD')))

const isLoading = ref<boolean>(false)
const statusMessage = ref<string>('')
const errorMessage = ref<string>('')
const ausgewaehlteDatei = ref<File | null>(null)
const lehrerListe = ref<LehrerKurzinfo[]>([])
const selectedLehrerId = ref<number | null>(null)
const serverCardOpen = ref<boolean>(true)
const fileCardOpen = ref<boolean>(true)

type EncryptedZipPayload = {
  format: 'gradehub-encrypted-zip'
  version: number
  originalFileName: string
  salt: string
  iv: string
  ciphertext: string
}

const entschluesselnModalOffen = ref<boolean>(false)
const entschluesselnKennwort = ref<string>('')
const entschluesselnFehler = ref<string>('')
const entschluesselnLaeuft = ref<boolean>(false)
const ausstehendeVerschluesselteDatei = ref<{ name: string; content: string } | null>(null)

type ENMStoreEncryptedCompat = typeof enmStore & {
  setEncryptedSource?: (nextSourceFileName: string, nextOriginalFileName: string, nextPassword: string) => void
  encryptedSourceFileName?: string
  encryptedOriginalFileName?: string
  encryptedSourcePassword?: string
}

function encodeBasicAuth(user: string, pass: string): string {
  return `Basic ${window.btoa(`${user}:${pass}`)}`
}

function base64NachArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(window.atob(value), (c) => c.charCodeAt(0)).buffer.slice(0) as ArrayBuffer
}

async function leitenSchluesselAb(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

function istEncryptedZipPayload(value: unknown): value is EncryptedZipPayload {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return rec.format === 'gradehub-encrypted-zip'
    && typeof rec.version === 'number'
    && typeof rec.originalFileName === 'string'
    && typeof rec.salt === 'string'
    && typeof rec.iv === 'string'
    && typeof rec.ciphertext === 'string'
}

function schliesseEntschluesselnModal(): void {
  entschluesselnModalOffen.value = false
  entschluesselnKennwort.value = ''
  entschluesselnFehler.value = ''
  ausstehendeVerschluesselteDatei.value = null
}

function formatCryptoError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'OperationError') {
    return 'Entschluesselung fehlgeschlagen. Kennwort ist ungueltig oder die Datei ist beschaedigt.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Entschlüsselung fehlgeschlagen. Bitte Kennwort und Datei prüfen.'
}

async function ladeVerschluesselteDateiMitKennwort(): Promise<void> {
  if (!ausstehendeVerschluesselteDatei.value) {
    entschluesselnFehler.value = 'Es wurde keine Datei ausgewählt.'
    return
  }

  const normalizedPassword = entschluesselnKennwort.value.trim()

  if (normalizedPassword === '') {
    entschluesselnFehler.value = 'Bitte ein Kennwort eingeben.'
    return
  }

  entschluesselnFehler.value = ''
  entschluesselnLaeuft.value = true
  isLoading.value = true

  try {
    const parsed = JSON.parse(ausstehendeVerschluesselteDatei.value.content) as unknown
    if (!istEncryptedZipPayload(parsed)) {
      throw new Error('Dateiformat wird nicht unterstützt.')
    }

    const salt = base64NachArrayBuffer(parsed.salt)
    const iv = base64NachArrayBuffer(parsed.iv)
    const ciphertext = base64NachArrayBuffer(parsed.ciphertext)
    const key = await leitenSchluesselAb(normalizedPassword, salt)
    const plainZip = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)

    const zipEntries = unzipSync(new Uint8Array(plainZip))
    const enmBytes = zipEntries['enm.json']
    if (!enmBytes) {
      throw new Error('Die entschlüsselte ZIP enthält keine enm.json.')
    }

    const enmText = strFromU8(enmBytes)
    const enmBlob = new Blob([enmText], { type: 'application/json' })
    const enmFile = new File([enmBlob], 'enm.json', { type: 'application/json' })
    await enmStore.ladeENMVonDatei(enmFile)

    const enmStoreCompat = enmStore as ENMStoreEncryptedCompat
    if (typeof enmStoreCompat.setEncryptedSource === 'function') {
      enmStoreCompat.setEncryptedSource(
        ausstehendeVerschluesselteDatei.value.name,
        parsed.originalFileName,
        normalizedPassword,
      )
    } else {
      // Fallback fuer veraltete Client-Bundles ohne neue Store-Action.
      enmStoreCompat.encryptedSourceFileName = ausstehendeVerschluesselteDatei.value.name
      enmStoreCompat.encryptedOriginalFileName = parsed.originalFileName
      enmStoreCompat.encryptedSourcePassword = normalizedPassword
      console.warn('ENM-Store without setEncryptedSource detected. Please reload the app to update cached assets.')
    }

    statusMessage.value = `Verschlüsselte Datei geladen: ${ausstehendeVerschluesselteDatei.value.name}`
    schliesseEntschluesselnModal()
    await router.push('/lerngruppen')
  } catch (error) {
    entschluesselnFehler.value = formatCryptoError(error)
  } finally {
    entschluesselnLaeuft.value = false
    isLoading.value = false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mapLehrerKurzinfo(value: unknown): LehrerKurzinfo | null {
  if (!isRecord(value)) {
    return null
  }

  const idRaw = value.id
  const kuerzelRaw = value.kuerzel
  if (typeof idRaw !== 'number' || typeof kuerzelRaw !== 'string') {
    return null
  }

  const istAktivRaw = value.istAktiv ?? value.aktiv ?? value.istSichtbar
  return {
    id: idRaw,
    kuerzel: kuerzelRaw,
    istAktiv: typeof istAktivRaw === 'boolean' ? istAktivRaw : true,
  }
}

async function ladeLehrerListeDirekt(baseUrlValue: string, schemaValue: string, usernameValue: string, passwordValue: string): Promise<LehrerKurzinfo[]> {
  const cleanedBaseUrl = baseUrlValue.replace(/\/$/, '')
  const endpoint = `${cleanedBaseUrl}/db/${schemaValue}/lehrer`
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: encodeBasicAuth(usernameValue, passwordValue),
        Accept: 'application/json',
      },
    })
  } catch {
    throw new Error(`Netzwerkfehler beim Zugriff auf ${endpoint}. Bitte URL, Protokoll (http/https), Zertifikat und CORS pruefen.`)
  }

  if (!response.ok) {
    throw new Error(`Lehrerliste konnte nicht geladen werden (${response.status}).`)
  }

  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Lehrerliste hat ein ungueltiges Format.')
  }

  return data
    .map(mapLehrerKurzinfo)
    .filter((lehrer): lehrer is LehrerKurzinfo => lehrer !== null)
    .sort((a, b) => a.kuerzel.localeCompare(b.kuerzel, 'de'))
}

function clearMessages(): void {
  statusMessage.value = ''
  errorMessage.value = ''
}

function isEncryptedFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.enc.json') || lower.endsWith('.zip.enc') || lower.endsWith('.enc')
}

async function leseVerschluesseltenPayloadWennVorhanden(file: File): Promise<string | null> {
  const looksLikeJson = isEncryptedFileName(file.name)
    || file.name.toLowerCase().endsWith('.json')
    || file.type.toLowerCase().includes('json')

  if (!looksLikeJson) {
    return null
  }

  const text = await file.text()

  try {
    const parsed = JSON.parse(text) as unknown
    return istEncryptedZipPayload(parsed) ? text : null
  } catch {
    return null
  }
}

async function ladeVomServer(): Promise<void> {
  clearMessages()
  isLoading.value = true

  try {
    authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)

    if (selectedLehrerId.value === null) {
      throw new Error('Bitte zuerst eine Lehrkraft aus der Liste waehlen.')
    }

    await enmStore.ladeENMVonServer(
      baseUrl.value,
      schema.value,
      username.value,
      password.value,
      selectedLehrerId.value,
    )
    statusMessage.value = 'ENM-Daten erfolgreich vom SVWS-Server geladen.'
    await router.push('/lerngruppen')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'ENM-Daten konnten nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

async function ladeLehrerListe(): Promise<void> {
  clearMessages()
  isLoading.value = true

  try {
    authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)

    const storeWithMaybeAction = enmStore as typeof enmStore & {
      ladeLehrerListeVomServer?: (
        baseUrlValue: string,
        schemaValue: string,
        usernameValue: string,
        passwordValue: string,
      ) => Promise<LehrerKurzinfo[]>
    }

    const liste = typeof storeWithMaybeAction.ladeLehrerListeVomServer === 'function'
      ? await storeWithMaybeAction.ladeLehrerListeVomServer(baseUrl.value, schema.value, username.value, password.value)
      : await ladeLehrerListeDirekt(baseUrl.value, schema.value, username.value, password.value)

    lehrerListe.value = liste
    selectedLehrerId.value = liste.find((lehrer) => lehrer.istAktiv)?.id ?? liste[0]?.id ?? null
    statusMessage.value = `${liste.length} Lehrkraefte geladen.`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Lehrerliste konnte nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

async function verarbeiteDatei(file: File): Promise<void> {
  clearMessages()

  try {
    const encryptedContent = await leseVerschluesseltenPayloadWennVorhanden(file)
    if (encryptedContent !== null) {
      ausstehendeVerschluesselteDatei.value = {
        name: file.name,
        content: encryptedContent,
      }
      entschluesselnKennwort.value = ''
      entschluesselnFehler.value = ''
      entschluesselnModalOffen.value = true
      return
    }

    await enmStore.ladeENMVonDatei(file)
    statusMessage.value = `ENM-Datei geladen: ${file.name}`
    await router.push('/lerngruppen')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Datei konnte nicht verarbeitet werden.'
  }
}

function onDateiAusgewaehlt(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  ausgewaehlteDatei.value = file

  if (!file) {
    clearMessages()
  }
}

async function ladeVonDatei(): Promise<void> {
  clearMessages()
  const file = ausgewaehlteDatei.value

  if (!file) {
    errorMessage.value = 'Bitte zuerst eine Datei auswählen.'
    return
  }

  isLoading.value = true

  try {
    await verarbeiteDatei(file)
  } finally {
    isLoading.value = false
  }
}

function oeffneAdmin(): void {
  authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)
  router.push('/admin')
}

// Naechster Schritt: Versionspruefung fuer ENM-v2/v1 bereits beim Verbindungsdialog anzeigen.
</script>

<template>
  <main class="start-view">
    <h1>SVWS-GradeHub</h1>

    <section class="card">
      <button class="card-toggle" type="button" @click="serverCardOpen = !serverCardOpen">
        <h2>Vom SVWS-Server laden</h2>
        <span>{{ serverCardOpen ? 'Einklappen' : 'Ausklappen' }}</span>
      </button>

      <div v-if="serverCardOpen" class="card-content">
        <label>
          Basis-URL
          <input v-model="baseUrl" type="url" placeholder="https://svws.schule.de" />
        </label>
        <label>
          Schema
          <input v-model="schema" type="text" placeholder="svwsdb" />
        </label>
        <label>
          Benutzername
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          Passwort
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <div class="button-row">
          <button :disabled="isLoading" type="button" @click="ladeLehrerListe">Lehrerliste laden</button>
          <button class="secondary" type="button" @click="oeffneAdmin">Adminbereich</button>
        </div>

        <label v-if="lehrerListe.length > 0">
          Lehrerkuerzel
          <select v-model.number="selectedLehrerId">
            <option :value="null" disabled>Bitte waehlen</option>
            <option v-for="lehrer in lehrerListe" :key="lehrer.id" :value="lehrer.id">
              {{ lehrer.kuerzel }}
            </option>
          </select>
        </label>

        <button
          v-if="lehrerListe.length > 0"
          :disabled="isLoading || selectedLehrerId === null"
          type="button"
          @click="ladeVomServer"
        >
          Vom Server laden
        </button>
      </div>
    </section>

    <section class="card">
      <button class="card-toggle" type="button" @click="fileCardOpen = !fileCardOpen">
        <h2>Aus Datei laden</h2>
        <span>{{ fileCardOpen ? 'Einklappen' : 'Ausklappen' }}</span>
      </button>

      <div v-if="fileCardOpen" class="card-content">
        <input :disabled="isLoading" type="file" accept=".json,.gz,.json.gz,.enc.json" @change="onDateiAusgewaehlt" />
        <button :disabled="isLoading || !ausgewaehlteDatei" type="button" @click="ladeVonDatei">
          Lehrerdatei laden
        </button>
        <p class="help">Unterstuetzt werden ENM-JSON, gzip-komprimierte ENM-Dateien sowie verschlüsselte Dateien (.enc.json).</p>
      </div>
    </section>

    <div v-if="entschluesselnModalOffen" class="modal-backdrop" @click.self="schliesseEntschluesselnModal">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="entschluesseln-modal-title">
        <div class="modal-header">
          <h2 id="entschluesseln-modal-title">Verschlüsselte Datei laden</h2>
          <button class="modal-close" type="button" aria-label="Schließen" @click="schliesseEntschluesselnModal">✕</button>
        </div>
        <div class="modal-body">
          <p class="help">Bitte Kennwort eingeben, um die ausgewählte Datei zu entschlüsseln.</p>
          <p v-if="entschluesselnFehler" class="error">{{ entschluesselnFehler }}</p>
          <label for="entschluesseln-passwort">Kennwort</label>
          <input
            id="entschluesseln-passwort"
            v-model="entschluesselnKennwort"
            type="password"
            autocomplete="current-password"
            placeholder="Notenpasswort"
          />
        </div>
        <div class="modal-footer">
          <button class="secondary" type="button" @click="schliesseEntschluesselnModal">Abbrechen</button>
          <button :disabled="entschluesselnLaeuft" type="button" @click="ladeVerschluesselteDateiMitKennwort">
            {{ entschluesselnLaeuft ? 'Entschlüsseln…' : 'Entschlüsseln & laden' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>

<style scoped>
.start-view {
  display: grid;
  gap: 1rem;
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  background-color: var(--color-bg);
}

.card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.card-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.card-toggle h2 {
  margin: 0;
  text-align: left;
}

.card-toggle span {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.card-content {
  display: grid;
  gap: 0.75rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--color-text);
}

input,
select,
button {
  font: inherit;
  padding: 0.5rem 0.625rem;
}

input,
select {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
}

.button-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

button {
  width: fit-content;
  cursor: pointer;
  color: #ffffff;
  background: var(--color-primary);
  border: 0;
  border-radius: 0.4rem;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.secondary {
  color: #dc2626;
  background: transparent;
  border: 1px solid #dc2626;
}

.help {
  margin: 0;
  color: var(--color-text-muted);
}

.status,
.error {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
}

.status {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
}

.error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.modal {
  display: flex;
  flex-direction: column;
  width: min(30rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 3rem);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  margin: 0;
}

.modal-close {
  font: inherit;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  padding: 0.2rem 0.4rem;
  border-radius: 0.3rem;
}

.modal-close:hover {
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
}

.modal-body {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
