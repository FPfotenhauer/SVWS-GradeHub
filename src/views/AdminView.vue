<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { strToU8, zipSync } from 'fflate'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

interface LehrerEintrag {
  id: number
  kuerzel: string
  nachname: string
  vorname: string
  notenpasswort: string
  istAktiv: boolean
}

const authStore = useAuthStore()
const uiStore = useUIStore()
const router = useRouter()
const { themePreference } = storeToRefs(uiStore)

function logout(): void {
  authStore.clear()
  router.push('/')
}

function onThemeChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value === 'light' || select.value === 'dark' || select.value === 'system') {
    uiStore.setThemePreference(select.value)
  }
}

const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const lehrer = ref<LehrerEintrag[]>([])
const ausgewaehlt = ref<Set<number>>(new Set())
const nurAktive = ref<boolean>(true)

type SpaltenKey = 'kuerzel' | 'name' | 'passwort'

const spaltenBreiten = ref<Record<SpaltenKey, number>>({
  kuerzel: 96,
  name: 240,
  passwort: 260,
})

const minBreiten: Record<SpaltenKey, number> = {
  kuerzel: 32,
  name: 72,
  passwort: 60,
}

let resizing: {
  key: SpaltenKey
  startX: number
  startWidth: number
} | null = null

const sichtbareLehrer = computed<LehrerEintrag[]>(() => {
  const liste = nurAktive.value ? lehrer.value.filter((l) => l.istAktiv) : lehrer.value
  return [...liste].sort((a, b) => a.kuerzel.localeCompare(b.kuerzel, 'de'))
})

const alleAusgewaehlt = computed<boolean>(() => {
  return sichtbareLehrer.value.length > 0 && sichtbareLehrer.value.every((l) => ausgewaehlt.value.has(l.id))
})

function encodeBasicAuth(user: string, pass: string): string {
  return `Basic ${window.btoa(`${user}:${pass}`)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mapLehrer(value: unknown): LehrerEintrag | null {
  if (!isRecord(value)) return null
  const id = value.id
  const kuerzel = value.kuerzel
  const nachname = value.nachname
  const vorname = value.vorname
  const notenpasswortRaw = value.notenpasswort ?? value.passwort ?? value.password ?? value.tsNotenpasswort
  if (typeof id !== 'number' || typeof kuerzel !== 'string') return null
  const istAktivRaw = value.istAktiv ?? value.aktiv ?? value.istSichtbar
  return {
    id,
    kuerzel,
    nachname: typeof nachname === 'string' ? nachname : '',
    vorname: typeof vorname === 'string' ? vorname : '',
    notenpasswort: typeof notenpasswortRaw === 'string' ? notenpasswortRaw : '',
    istAktiv: typeof istAktivRaw === 'boolean' ? istAktivRaw : true,
  }
}

async function ladeLehrerListe(): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  ausgewaehlt.value = new Set()
  lehrer.value = []

  try {
    const cleanedBaseUrl = authStore.baseUrl.replace(/\/$/, '')
    const endpoint = `${cleanedBaseUrl}/db/${authStore.schema}/lehrer`
    let response: Response

    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: encodeBasicAuth(authStore.username, authStore.password),
          Accept: 'application/json',
        },
      })
    } catch {
      throw new Error(`Netzwerkfehler beim Zugriff auf ${endpoint}. Bitte URL, Protokoll und CORS pruefen.`)
    }

    if (!response.ok) {
      throw new Error(`Lehrerliste konnte nicht geladen werden (${response.status}).`)
    }

    const data: unknown = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Lehrerliste hat ein ungueltiges Format.')
    }

    lehrer.value = data.map(mapLehrer).filter((l): l is LehrerEintrag => l !== null)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Lehrerliste konnte nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

function toggleAuswahl(id: number): void {
  if (ausgewaehlt.value.has(id)) {
    ausgewaehlt.value.delete(id)
  } else {
    ausgewaehlt.value.add(id)
  }
}

async function kopiereNotenpasswort(passwort: string): Promise<void> {
  if (passwort.trim() === '') return
  errorMessage.value = ''

  try {
    await window.navigator.clipboard.writeText(passwort)
  } catch {
    const fallbackInput = document.createElement('textarea')
    fallbackInput.value = passwort
    fallbackInput.setAttribute('readonly', '')
    fallbackInput.style.position = 'fixed'
    fallbackInput.style.left = '-9999px'
    document.body.appendChild(fallbackInput)
    fallbackInput.select()

    const ok = document.execCommand('copy')
    document.body.removeChild(fallbackInput)

    if (!ok) {
      errorMessage.value = 'Notenpasswort konnte nicht in die Zwischenablage kopiert werden.'
    }
  }
}

onMounted(() => {
  ladeLehrerListe()
})

function toggleAlle(): void {
  if (alleAusgewaehlt.value) {
    for (const l of sichtbareLehrer.value) {
      ausgewaehlt.value.delete(l.id)
    }
  } else {
    for (const l of sichtbareLehrer.value) {
      ausgewaehlt.value.add(l.id)
    }
  }
}

function randomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const values = window.crypto.getRandomValues(new Uint8Array(length))
  for (let i = 0; i < length; i++) {
    const randomByte = values.at(i) ?? 0
    result += chars.charAt(randomByte % chars.length)
  }
  return result
}

function generiereNotenpasswort(): string {
  return [
    randomAlphanumeric(4),
    randomAlphanumeric(4),
    randomAlphanumeric(4),
    randomAlphanumeric(4),
    randomAlphanumeric(4),
    randomAlphanumeric(4),
  ].join('-')
}

function generierePasswoerterFuerAuswahl(): void {
  if (ausgewaehlt.value.size === 0) return

  lehrer.value = lehrer.value.map((eintrag) => {
    if (!ausgewaehlt.value.has(eintrag.id)) return eintrag
    return {
      ...eintrag,
      notenpasswort: generiereNotenpasswort(),
    }
  })
}

// --- Schlüssel-Modal ---
const schluesselModalOffen = ref<boolean>(false)
const schluesselGeneriert = ref<boolean>(false)
const schluesselGenerierenLaeuft = ref<boolean>(false)
const schluesselFehler = ref<string>('')
const oeffentlicherSchluesselPem = ref<string>('')
const privaterSchluesselPem = ref<string>('')
const privaterSchluessel = ref<CryptoKey | null>(null)
const oeffentlicherSchluessel = ref<CryptoKey | null>(null)

function generiereSchluessel(): void {
  schluesselFehler.value = ''
  schluesselModalOffen.value = true
}

function schliesseSchluesselModal(): void {
  schluesselModalOffen.value = false
}

async function fuehreSchluesselGenerierungDurch(): Promise<void> {
  schluesselFehler.value = ''
  schluesselGenerierenLaeuft.value = true
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )
    oeffentlicherSchluessel.value = keyPair.publicKey
    privaterSchluessel.value = keyPair.privateKey
    const spki = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
    const pubB64 = window.btoa(String.fromCharCode(...new Uint8Array(spki)))
    const pubLines = pubB64.match(/.{1,64}/g)?.join('\n') ?? pubB64
    oeffentlicherSchluesselPem.value = `-----BEGIN PUBLIC KEY-----\n${pubLines}\n-----END PUBLIC KEY-----`

    const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const privB64 = window.btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
    const privLines = privB64.match(/.{1,64}/g)?.join('\n') ?? privB64
    privaterSchluesselPem.value = `-----BEGIN PRIVATE KEY-----\n${privLines}\n-----END PRIVATE KEY-----`

    schluesselGeneriert.value = true
  } catch (error) {
    schluesselFehler.value = error instanceof Error ? error.message : 'Schlüsselerzeugung fehlgeschlagen.'
  } finally {
    schluesselGenerierenLaeuft.value = false
  }
}

function erzeugeeDateien(): void {
  void erzeugeDateienFuerAuswahl()
}

// --- AES-256-GCM Crypto-Hilfsfunktionen (ADR-0005) ---

async function leitenSchluesselAb(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function aesVerschluesseln(plaintext: string, password: string): Promise<string> {
  const enc = new TextEncoder()
  const saltBuf = window.crypto.getRandomValues(new Uint8Array(16)).buffer.slice(0) as ArrayBuffer
  const ivBuf = window.crypto.getRandomValues(new Uint8Array(12)).buffer.slice(0) as ArrayBuffer
  const key = await leitenSchluesselAb(password, saltBuf)
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, enc.encode(plaintext))
  const toB64 = (buf: ArrayBuffer): string => window.btoa(String.fromCharCode(...new Uint8Array(buf)))
  return JSON.stringify({ version: 1, salt: toB64(saltBuf), iv: toB64(ivBuf), ciphertext: toB64(cipherBuf) })
}

async function aesEntschluesseln(encryptedJson: string, password: string): Promise<string> {
  const parsed = JSON.parse(encryptedJson) as { version: number; salt: string; iv: string; ciphertext: string }
  const fromB64 = (s: string): ArrayBuffer =>
    Uint8Array.from(window.atob(s), (c) => c.charCodeAt(0)).buffer.slice(0) as ArrayBuffer
  const saltBuf = fromB64(parsed.salt)
  const ivBuf = fromB64(parsed.iv)
  const cipherBuf = fromB64(parsed.ciphertext)
  const key = await leitenSchluesselAb(password, saltBuf)
  const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, cipherBuf)
  return new TextDecoder().decode(plainBuf)
}

function arrayBufferNachBase64(buffer: ArrayBuffer): string {
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64NachArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(window.atob(value), (c) => c.charCodeAt(0)).buffer.slice(0) as ArrayBuffer
}

async function aesVerschluesselnBytes(plaintext: ArrayBuffer, password: string, originalDateiname: string): Promise<string> {
  const saltBuf = window.crypto.getRandomValues(new Uint8Array(16)).buffer.slice(0) as ArrayBuffer
  const ivBuf = window.crypto.getRandomValues(new Uint8Array(12)).buffer.slice(0) as ArrayBuffer
  const key = await leitenSchluesselAb(password, saltBuf)
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, plaintext)
  return JSON.stringify({
    format: 'gradehub-encrypted-zip',
    version: 1,
    originalFileName: originalDateiname,
    salt: arrayBufferNachBase64(saltBuf),
    iv: arrayBufferNachBase64(ivBuf),
    ciphertext: arrayBufferNachBase64(cipherBuf),
  })
}

function arrayBufferAusUint8Array(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

async function ladeENMJsonFuerLehrer(lehrerId: number): Promise<string> {
  const cleanedBaseUrl = authStore.baseUrl.replace(/\/$/, '')
  const endpoint = `${cleanedBaseUrl}/db/${authStore.schema}/enm/v2/lehrer/${lehrerId}`
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: encodeBasicAuth(authStore.username, authStore.password),
        Accept: 'application/json',
      },
    })
  } catch {
    throw new Error(`Netzwerkfehler beim Zugriff auf ${endpoint}. Bitte URL, Protokoll und CORS pruefen.`)
  }

  if (!response.ok) {
    throw new Error(`ENM für Lehrkraft ${lehrerId} konnte nicht geladen werden (${response.status}).`)
  }

  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    throw new Error(`Antwort fuer Lehrkraft ${lehrerId} ist kein gueltiges JSON.`)
  }
}

type DirectoryPickerResult = {
  directoryHandle: FileSystemDirectoryHandle | null
  cancelled: boolean
}

async function waehleAusgabeOrdner(): Promise<DirectoryPickerResult> {
  const pickerWindow = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }

  if (typeof pickerWindow.showDirectoryPicker !== 'function') {
    return { directoryHandle: null, cancelled: false }
  }

  try {
    const directoryHandle = await pickerWindow.showDirectoryPicker()
    return { directoryHandle, cancelled: false }
  } catch {
    return { directoryHandle: null, cancelled: true }
  }
}

async function speichereDatei(dateiname: string, inhalt: string, directoryHandle: FileSystemDirectoryHandle | null): Promise<void> {
  if (directoryHandle) {
    const fileHandle = await directoryHandle.getFileHandle(dateiname, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(inhalt)
    await writable.close()
    return
  }

  const blob = new Blob([inhalt], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  a.click()
  URL.revokeObjectURL(url)
}

async function erzeugeDateienFuerAuswahl(): Promise<void> {
  errorMessage.value = ''

  if (ausgewaehlt.value.size === 0) {
    errorMessage.value = 'Bitte mindestens eine Lehrkraft auswählen.'
    return
  }

  if (!oeffentlicherSchluesselPem.value) {
    errorMessage.value = 'Bitte zuerst ein Schlüsselpaar erzeugen (öffentlicher Schlüssel fehlt).'
    return
  }

  const ausgewaehlteLehrer = lehrer.value.filter((eintrag) => ausgewaehlt.value.has(eintrag.id))
  const ohneNotenpasswort = ausgewaehlteLehrer.filter((eintrag) => eintrag.notenpasswort.trim() === '')
  if (ohneNotenpasswort.length > 0) {
    errorMessage.value = `Für folgende Lehrkräfte fehlt ein Notenpasswort: ${ohneNotenpasswort.map((l) => l.kuerzel).join(', ')}`
    return
  }

  isLoading.value = true
  try {
    const { directoryHandle, cancelled } = await waehleAusgabeOrdner()
    if (cancelled) {
      return
    }

    for (const eintrag of ausgewaehlteLehrer) {
      const enmJson = await ladeENMJsonFuerLehrer(eintrag.id)
      const zipBytes = zipSync({
        'enm.json': strToU8(enmJson),
        'public_key.pem': strToU8(oeffentlicherSchluesselPem.value),
      })

      const zipFileName = `${eintrag.kuerzel || `lehrer-${eintrag.id}`}-enm.zip`
      const verschluesselt = await aesVerschluesselnBytes(
        arrayBufferAusUint8Array(zipBytes),
        eintrag.notenpasswort,
        zipFileName,
      )
      await speichereDatei(`${zipFileName}.enc.json`, verschluesselt, directoryHandle)
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Dateien konnten nicht erzeugt werden.'
  } finally {
    isLoading.value = false
  }
}

// --- Speichern-Modal ---
const speichernModalOffen = ref<boolean>(false)
const speichernKennwort = ref<string>('')
const speichernKennwortBestaetigung = ref<string>('')
const speichernFehler = ref<string>('')
const speichernLaeuft = ref<boolean>(false)

function speichern(): void {
  speichernKennwort.value = ''
  speichernKennwortBestaetigung.value = ''
  speichernFehler.value = ''
  speichernModalOffen.value = true
}

function schliesseSpeichernModal(): void {
  speichernModalOffen.value = false
}

async function fuehreSpeichernDurch(): Promise<void> {
  if (speichernKennwort.value.length < 8) {
    speichernFehler.value = 'Das Kennwort muss mindestens 8 Zeichen lang sein.'
    return
  }
  if (speichernKennwort.value !== speichernKennwortBestaetigung.value) {
    speichernFehler.value = 'Die Kennwörter stimmen nicht überein.'
    return
  }
  speichernFehler.value = ''
  speichernLaeuft.value = true
  try {
    const daten = {
      schluessel: {
        oeffentlich: oeffentlicherSchluesselPem.value || null,
        privat: privaterSchluesselPem.value || null,
      },
      lehrer: lehrer.value.map((l) => ({ id: l.id, kuerzel: l.kuerzel, notenpasswort: l.notenpasswort })),
    }
    const encrypted = await aesVerschluesseln(JSON.stringify(daten, null, 2), speichernKennwort.value)
    const blob = new Blob([encrypted], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gradehub-config.ghb'
    a.click()
    URL.revokeObjectURL(url)
    speichernModalOffen.value = false
  } catch (error) {
    speichernFehler.value = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
  } finally {
    speichernLaeuft.value = false
  }
}

// --- Laden-Modal ---
const ladenModalOffen = ref<boolean>(false)
const ladenKennwort = ref<string>('')
const ladenFehler = ref<string>('')
const ladenLaeuft = ref<boolean>(false)
const ladenDateiName = ref<string>('')
const ladenDateiText = ref<string>('')

function laden(): void {
  ladenKennwort.value = ''
  ladenFehler.value = ''
  ladenDateiName.value = ''
  ladenDateiText.value = ''
  ladenModalOffen.value = true
}

function schliesseLabenModal(): void {
  ladenModalOffen.value = false
}

function onLadenDateiGewaehlt(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  ladenDateiName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    if (typeof e.target?.result === 'string') {
      ladenDateiText.value = e.target.result
    }
  }
  reader.readAsText(file)
}

async function fuehreLabenDurch(): Promise<void> {
  if (!ladenDateiText.value) {
    ladenFehler.value = 'Bitte eine Datei auswählen.'
    return
  }
  if (!ladenKennwort.value) {
    ladenFehler.value = 'Bitte das Kennwort eingeben.'
    return
  }
  ladenFehler.value = ''
  ladenLaeuft.value = true
  try {
    const plaintext = await aesEntschluesseln(ladenDateiText.value, ladenKennwort.value)
    const daten = JSON.parse(plaintext) as {
      schluessel: { oeffentlich: string | null; privat: string | null }
      lehrer: { id: number; kuerzel: string; notenpasswort: string }[]
    }
    oeffentlicherSchluesselPem.value = daten.schluessel.oeffentlich ?? ''
    privaterSchluesselPem.value = daten.schluessel.privat ?? ''
    schluesselGeneriert.value = !!(daten.schluessel.oeffentlich && daten.schluessel.privat)
    const passwortMap = new Map(daten.lehrer.map((l) => [l.id, l.notenpasswort]))
    lehrer.value = lehrer.value.map((l) => ({
      ...l,
      notenpasswort: passwortMap.get(l.id) ?? l.notenpasswort,
    }))
    ladenModalOffen.value = false
  } catch {
    ladenFehler.value = 'Entschlüsselung fehlgeschlagen. Falsches Kennwort oder beschädigte Datei.'
  } finally {
    ladenLaeuft.value = false
  }
}

function spaltenStil(key: SpaltenKey): { width: string; minWidth: string } {
  const breite = spaltenBreiten.value[key]
  if (key === 'passwort') {
    return {
      width: 'auto',
      minWidth: `${breite}px`,
    }
  }

  return {
    width: `${breite}px`,
    minWidth: `${breite}px`,
  }
}

function onResizeMove(event: MouseEvent): void {
  if (!resizing) return
  const delta = event.clientX - resizing.startX
  const nextWidth = Math.max(minBreiten[resizing.key], resizing.startWidth + delta)
  spaltenBreiten.value[resizing.key] = nextWidth
}

function onResizeEnd(): void {
  if (!resizing) return
  resizing = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
}

function starteResize(key: SpaltenKey, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  resizing = {
    key,
    startX: event.clientX,
    startWidth: spaltenBreiten.value[key],
  }

  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

onUnmounted(() => {
  onResizeEnd()
})
</script>

<template>
  <main class="admin-view">
    <div class="page-header">
      <h1>Notendatei Adminbereich</h1>
      <div class="theme-row">
        <label class="theme-control" for="admin-theme-select">Theme</label>
        <select id="admin-theme-select" :value="themePreference" @change="onThemeChange">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>

    <p v-if="isLoading" class="status">Lehrkräfte werden geladen…</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <section v-if="lehrer.length > 0" class="card">
      <div class="table-header">
        <div class="table-header-left">
          <h2>Lehrkräfte ({{ sichtbareLehrer.length }})</h2>
          <button
            class="btn-generate"
            type="button"
            :disabled="ausgewaehlt.size === 0"
            @click="generierePasswoerterFuerAuswahl"
          >
            Passwörter generieren
          </button>
          <button
            class="btn-generate"
            :class="{ 'btn-generate--aktiv': schluesselGeneriert }"
            type="button"
            @click="generiereSchluessel"
          >
            Schlüssel generieren
          </button>
          <button
            class="btn-generate"
            type="button"
            @click="erzeugeeDateien"
          >
            Dateien erzeugen
          </button>
          <button
            class="btn-generate"
            type="button"
            @click="speichern"
          >
            Speichern
          </button>
          <button
            class="btn-generate"
            type="button"
            @click="laden"
          >
            Laden
          </button>
        </div>
        <div class="table-header-actions">
          <label class="toggle-label">
            <input v-model="nurAktive" type="checkbox" />
            Nur aktive anzeigen
          </label>
          <button class="btn-logout" type="button" @click="logout">Abmelden</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <colgroup>
            <col class="col-check" />
            <col :style="spaltenStil('kuerzel')" />
            <col :style="spaltenStil('name')" />
            <col :style="spaltenStil('passwort')" />
          </colgroup>
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  :checked="alleAusgewaehlt"
                  aria-label="Alle auswählen"
                  @change="toggleAlle"
                />
              </th>
              <th class="col-kuerzel">
                Kürzel
                <span class="resize-handle" @mousedown="starteResize('kuerzel', $event)" />
              </th>
              <th class="col-name">
                Name, Vorname
                <span class="resize-handle" @mousedown="starteResize('name', $event)" />
              </th>
              <th class="col-passwort">
                Notenpasswort
                <span class="resize-handle" @mousedown="starteResize('passwort', $event)" />
              </th>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <td colspan="4" class="tfoot-cell">
                <span v-if="ausgewaehlt.size > 0">
                  {{ ausgewaehlt.size }} Lehrkraft{{ ausgewaehlt.size !== 1 ? 'kräfte' : '' }} ausgewählt
                </span>
                <span v-else class="tfoot-empty">Keine Auswahl</span>
              </td>
            </tr>
          </tfoot>
          <tbody>
            <tr
              v-for="l in sichtbareLehrer"
              :key="l.id"
              :class="{ 'is-selected': ausgewaehlt.has(l.id) }"
              @click="toggleAuswahl(l.id)"
            >
              <td class="col-check">
                <input
                  type="checkbox"
                  :checked="ausgewaehlt.has(l.id)"
                  @click.stop
                  @change="toggleAuswahl(l.id)"
                />
              </td>
              <td class="col-kuerzel">{{ l.kuerzel }}</td>
              <td class="col-name">{{ l.nachname }}, {{ l.vorname }}</td>
              <td class="col-passwort">
                <div class="col-passwort-inhalt">
                  <span class="passwort-text">{{ l.notenpasswort || '-' }}</span>
                  <button
                    v-if="l.notenpasswort"
                    class="copy-passwort-btn"
                    type="button"
                    title="Notenpasswort kopieren"
                    aria-label="Notenpasswort kopieren"
                    @click.stop="kopiereNotenpasswort(l.notenpasswort)"
                  >
                    ⎘
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Schlüssel-Modal -->
    <div v-if="schluesselModalOffen" class="modal-backdrop" @click.self="schliesseSchluesselModal">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="schluessel-modal-title">
        <div class="modal-header">
          <h2 id="schluessel-modal-title">Schlüsselpaar generieren</h2>
          <button class="modal-close" type="button" aria-label="Schließen" @click="schliesseSchluesselModal">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-meta">Algorithmus: RSA-OAEP · SHA-256 · 4096 Bit</p>

          <p v-if="schluesselFehler" class="error">{{ schluesselFehler }}</p>

          <div v-if="!schluesselGeneriert" class="modal-action-row">
            <button
              class="btn-generate"
              type="button"
              :disabled="schluesselGenerierenLaeuft"
              @click="fuehreSchluesselGenerierungDurch"
            >
              {{ schluesselGenerierenLaeuft ? 'Wird erzeugt…' : 'Schlüsselpaar erzeugen' }}
            </button>
          </div>

          <div v-else class="modal-success">
            <span class="modal-success-icon">✓</span>
            Schlüsselpaar wurde erfolgreich erzeugt.
          </div>

          <div v-if="oeffentlicherSchluesselPem" class="modal-key-block">
            <label for="schluessel-pem-output" class="modal-key-label">Öffentlicher Schlüssel</label>
            <textarea
              id="schluessel-pem-output"
              class="modal-key-textarea"
              readonly
              :value="oeffentlicherSchluesselPem"
            />
          </div>

          <div v-if="privaterSchluesselPem" class="modal-key-block">
            <label for="schluessel-priv-output" class="modal-key-label modal-key-label--privat">Privater Schlüssel <span class="modal-key-warn">(geheim halten!)</span></label>
            <textarea
              id="schluessel-priv-output"
              class="modal-key-textarea"
              readonly
              :value="privaterSchluesselPem"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-generate" type="button" @click="schliesseSchluesselModal">Schließen</button>
        </div>
      </div>
    </div>

    <!-- Speichern-Modal -->
    <div v-if="speichernModalOffen" class="modal-backdrop" @click.self="schliesseSpeichernModal">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="speichern-modal-title">
        <div class="modal-header">
          <h2 id="speichern-modal-title">Konfiguration speichern</h2>
          <button class="modal-close" type="button" aria-label="Schließen" @click="schliesseSpeichernModal">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-meta">Die Daten werden mit AES-256-GCM verschlüsselt gespeichert.</p>
          <p v-if="speichernFehler" class="error">{{ speichernFehler }}</p>
          <label class="modal-form-label" for="speichern-pw">Kennwort</label>
          <input
            id="speichern-pw"
            v-model="speichernKennwort"
            class="modal-input"
            type="password"
            autocomplete="new-password"
            placeholder="Mindestens 8 Zeichen"
          />
          <label class="modal-form-label" for="speichern-pw2">Kennwort bestätigen</label>
          <input
            id="speichern-pw2"
            v-model="speichernKennwortBestaetigung"
            class="modal-input"
            type="password"
            autocomplete="new-password"
            placeholder="Kennwort wiederholen"
          />
        </div>
        <div class="modal-footer">
          <button class="btn-generate" type="button" @click="schliesseSpeichernModal">Abbrechen</button>
          <button
            class="btn-generate btn-generate--aktiv"
            type="button"
            :disabled="speichernLaeuft"
            @click="fuehreSpeichernDurch"
          >
            {{ speichernLaeuft ? 'Wird gespeichert…' : 'Speichern & herunterladen' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Laden-Modal -->
    <div v-if="ladenModalOffen" class="modal-backdrop" @click.self="schliesseLabenModal">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="laden-modal-title">
        <div class="modal-header">
          <h2 id="laden-modal-title">Konfiguration laden</h2>
          <button class="modal-close" type="button" aria-label="Schließen" @click="schliesseLabenModal">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-meta">Verschlüsselte GradeHub-Konfigurationsdatei (.ghb) auswählen.</p>
          <p v-if="ladenFehler" class="error">{{ ladenFehler }}</p>
          <label class="modal-form-label" for="laden-datei">Datei</label>
          <div class="modal-file-row">
            <label class="btn-generate modal-file-label" for="laden-datei">Datei wählen…</label>
            <span class="modal-file-name">{{ ladenDateiName || 'Keine Datei ausgewählt' }}</span>
          </div>
          <input
            id="laden-datei"
            class="modal-file-input"
            type="file"
            accept=".ghb,application/json"
            @change="onLadenDateiGewaehlt"
          />
          <label class="modal-form-label" for="laden-pw">Kennwort</label>
          <input
            id="laden-pw"
            v-model="ladenKennwort"
            class="modal-input"
            type="password"
            autocomplete="current-password"
            placeholder="Kennwort eingeben"
          />
        </div>
        <div class="modal-footer">
          <button class="btn-generate" type="button" @click="schliesseLabenModal">Abbrechen</button>
          <button
            class="btn-generate btn-generate--aktiv"
            type="button"
            :disabled="ladenLaeuft"
            @click="fuehreLabenDurch"
          >
            {{ ladenLaeuft ? 'Wird geladen…' : 'Laden' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.admin-view {
  display: grid;
  gap: 1rem;
  max-width: 100%;
  margin: 0 auto;
  padding: 1.5rem 3rem 3rem;
  min-height: 100dvh;
  background-color: var(--color-bg);
}

.card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1rem;
  max-height: calc(100dvh - 9rem);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.card h2 {
  margin: 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-header h1 {
  margin: 0;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-control {
  color: var(--color-text-muted);
}

.theme-row select {
  font: inherit;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  background: var(--color-surface);
  color: var(--color-text);
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

input[type='text'],
input[type='url'],
input[type='password'] {
  font: inherit;
  padding: 0.5rem 0.625rem;
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
  font: inherit;
  padding: 0.5rem 0.625rem;
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

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.table-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.table-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-left: auto;
}

.btn-logout {
  font: inherit;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: #dc2626;
  background: transparent;
  border: 1px solid #dc2626;
  border-radius: 0.4rem;
}

.btn-generate {
  font: inherit;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
}

.btn-generate:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface));
}

.btn-generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-logout:hover {
  background: color-mix(in srgb, #dc2626 10%, transparent);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  cursor: pointer;
}

.toggle-label input[type='checkbox'] {
  cursor: pointer;
}

.table-wrap {
  overflow: auto;
  min-height: 0;
  max-height: none;
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
}

table {
  width: 100%;
  min-width: max-content;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.9rem;
}

thead tr {
  background: color-mix(in srgb, var(--color-surface) 80%, var(--color-bg));
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  box-shadow: 0 1px 0 var(--color-border);
}

th {
  position: relative;
  padding: 0.35rem 0.45rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid var(--color-border);
  white-space: nowrap;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
}

.resize-handle::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 3px;
  width: 1px;
  background: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
}

td {
  padding: 0.32rem 0.45rem;
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

tbody tr {
  cursor: pointer;
  transition: background 0.1s;
}

tbody tr:hover {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
}

tbody tr.is-selected {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

tfoot {
  position: sticky;
  bottom: 0;
  z-index: 2;
}

tfoot tr {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.tfoot-cell {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 0.35rem 0.45rem;
  font-size: 0.88rem;
  color: var(--color-text);
  font-weight: 600;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  box-shadow: 0 -1px 0 var(--color-border);
}

.tfoot-empty {
  color: var(--color-text-muted);
  font-weight: 400;
}

.col-check {
  width: 2.1rem;
  text-align: left;
}

.col-kuerzel {
  text-align: left;
}

th.col-check,
td.col-check {
  padding-left: 0.45rem;
  padding-right: 0.5rem;
}

th.col-kuerzel,
td.col-kuerzel {
  padding-left: 0.28rem;
}

th.col-check input[type='checkbox'],
td.col-check input[type='checkbox'] {
  margin: 0;
}

.col-passwort {
  text-align: left;
  font-family: 'Noto Sans Mono', 'Courier New', monospace;
}

.col-passwort-inhalt {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.passwort-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-passwort-btn {
  flex: 0 0 auto;
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 0.92rem;
  line-height: 1;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.25rem;
}

.copy-passwort-btn:hover {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 9%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
}

.error {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  color: var(--color-error, #dc2626);
  background: color-mix(in srgb, var(--color-error, #dc2626) 10%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-error, #dc2626) 30%, transparent);
}

.selection-info {
  display: none;
}

/* Schlüssel-Button aktiv (grün) */
.btn-generate--aktiv {
  color: #166534;
  background: color-mix(in srgb, #16a34a 12%, var(--color-surface));
  border-color: color-mix(in srgb, #16a34a 45%, var(--color-border));
}

.btn-generate--aktiv:hover:not(:disabled) {
  background: color-mix(in srgb, #16a34a 20%, var(--color-surface));
}

/* Modal */
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
  gap: 0;
  width: min(560px, calc(100vw - 2rem));
  max-height: calc(100dvh - 4rem);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.05rem;
}

.modal-close {
  padding: 0.25rem 0.5rem;
  font-size: 1rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 0.35rem;
  cursor: pointer;
  line-height: 1;
}

.modal-close:hover {
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  color: var(--color-text);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem;
  overflow-y: auto;
}

.modal-meta {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

.modal-action-row {
  display: flex;
  gap: 0.5rem;
}

.modal-success {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.4rem;
  font-size: 0.9rem;
  color: #166534;
  background: color-mix(in srgb, #16a34a 10%, var(--color-surface));
  border: 1px solid color-mix(in srgb, #16a34a 30%, transparent);
}

.modal-success-icon {
  font-weight: 700;
  font-size: 1rem;
}

.modal-key-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.modal-key-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted);
  display: block;
}

.modal-key-label--privat {
  color: #b45309;
}

.modal-key-warn {
  font-weight: 400;
  font-size: 0.8rem;
  color: #b45309;
}

.modal-key-textarea {
  font: 0.78rem/1.5 'Noto Sans Mono', 'Courier New', monospace;
  width: 100%;
  height: 8rem;
  resize: vertical;
  padding: 0.5rem 0.6rem;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  box-sizing: border-box;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

.modal-form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 0.25rem;
}

.modal-input {
  font: inherit;
  padding: 0.5rem 0.625rem;
  width: 100%;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  box-sizing: border-box;
  margin-bottom: 0.75rem;
}

.modal-input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.modal-file-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.modal-file-label {
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.modal-file-name {
  font-size: 0.88rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-file-input {
  display: none;
}
</style>
