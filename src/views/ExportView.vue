<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { strToU8, zipSync } from 'fflate'

import { useAuthStore } from '@/stores/authStore'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'

import type { EnmExport, EnmLeistungsdaten } from '@/types/enm'
import type { LeistungsChange } from '@/types/changes'

const router = useRouter()
const authStore = useAuthStore()
const changeStore = useChangeStore()
const enmStore = useENMStore()
const changeCount = computed<number>(() => changeStore.changeCount)
const isConfigured = computed<boolean>(() => authStore.isConfigured)
const enmDaten = computed(() => enmStore.enmDaten)
const isLoaded = computed<boolean>(() => enmStore.isLoaded)
const dataSource = computed<DataSource>(() => enmStore.dataSource)
const sourceFileName = computed<string>(() => enmStore.sourceFileName ?? '')
const encryptedSourceFileName = computed<string>(() => enmStore.encryptedSourceFileName ?? '')
const encryptedOriginalFileName = computed<string>(() => enmStore.encryptedOriginalFileName ?? '')
const encryptedSourcePassword = computed<string>(() => enmStore.encryptedSourcePassword ?? '')

const isSaving = ref<boolean>(false)
const statusMessage = ref<string>('')
const errorMessage = ref<string>('')

type DataSource = 'api' | 'file' | null

type EncryptedZipPayload = {
  format: 'gradehub-encrypted-zip'
  version: number
  originalFileName: string
  salt: string
  iv: string
  ciphertext: string
}

const effectiveDataSource = computed<DataSource>(() => {
  if (dataSource.value === 'api' || dataSource.value === 'file') {
    return dataSource.value
  }

  if (sourceFileName.value.trim() !== '') {
    return 'file'
  }

  if (isConfigured.value) {
    return 'api'
  }

  return null
})

const dataSourceLabel = computed<string>(() => {
  if (effectiveDataSource.value === 'api') return 'SVWS-API'
  if (isEncryptedFileSource.value) return 'Datei (verschluesselt)'
  if (effectiveDataSource.value === 'file') return 'Datei'
  return 'unbekannt'
})

const canSaveToServer = computed<boolean>(() => {
  return effectiveDataSource.value === 'api'
})

const isFileSource = computed<boolean>(() => effectiveDataSource.value === 'file')
const isEncryptedFileSource = computed<boolean>(() => {
  return effectiveDataSource.value === 'file'
    && encryptedSourcePassword.value.trim() !== ''
    && encryptedOriginalFileName.value.trim() !== ''
})
const sourceDisplayName = computed<string>(() => {
  if (isEncryptedFileSource.value && encryptedSourceFileName.value.trim() !== '') {
    return encryptedSourceFileName.value
  }
  return sourceFileName.value
})

function clearMessages(): void {
  statusMessage.value = ''
  errorMessage.value = ''
}

function formatSaveError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Speichern wurde abgebrochen.'
  }

  if (error instanceof DOMException && error.name === 'OperationError') {
    return 'Verschluesseltes Speichern fehlgeschlagen. Kennwort oder Dateiformat sind ungueltig.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Speichern fehlgeschlagen.'
}

function cloneENM(data: unknown): EnmExport {
  return JSON.parse(JSON.stringify(data)) as EnmExport
}

function normalizeLehrerInitialPassword(next: EnmExport): void {
  for (const lehrer of next.lehrer) {
    if (typeof lehrer.isInitialPassword === 'boolean') {
      continue
    }

    lehrer.isInitialPassword = typeof lehrer.istErstanmeldung === 'boolean'
      ? lehrer.istErstanmeldung
      : true
  }
}

function parseNumberValue(value: string | null): number {
  if (value === null || value.trim() === '') {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function toSVWSTimestamp(value: string): string {
  // SVWS erwartet LocalDateTime-Format wie "2024-01-10 09:32:44.0".
  if (!value.includes('T')) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value.replace('T', ' ').replace('Z', '')
  }

  const yyyy = parsed.getUTCFullYear()
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getUTCDate()).padStart(2, '0')
  const hh = String(parsed.getUTCHours()).padStart(2, '0')
  const mi = String(parsed.getUTCMinutes()).padStart(2, '0')
  const ss = String(parsed.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.0`
}

function setLeistungsfeld(
  ld: EnmLeistungsdaten,
  feld: string,
  neuerWert: string | null,
  geaendertAm: string,
): void {
  const ts = toSVWSTimestamp(geaendertAm)

  if (feld === 'note') {
    ld.note = neuerWert as EnmLeistungsdaten['note']
    ld.tsNote = ts
    return
  }

  if (feld === 'noteQuartal') {
    ld.noteQuartal = neuerWert as EnmLeistungsdaten['noteQuartal']
    ld.tsNoteQuartal = ts
    return
  }

  if (feld === 'fehlstundenFach') {
    ld.fehlstundenFach = parseNumberValue(neuerWert)
    ld.tsFehlstundenFach = ts
    return
  }

  if (feld === 'fehlstundenUnentschuldigtFach') {
    ld.fehlstundenUnentschuldigtFach = parseNumberValue(neuerWert)
    ld.tsFehlstundenUnentschuldigtFach = ts
    return
  }

  if (feld === 'fachbezogeneBemerkungen') {
    ld.fachbezogeneBemerkungen = neuerWert
    ld.tsFachbezogeneBemerkungen = ts
    return
  }

  if (feld === 'istGemahnt') {
    ld.istGemahnt = neuerWert === 'true'
    ld.tsIstGemahnt = ts
    return
  }

  if (feld === 'mahndatum') {
    ld.mahndatum = neuerWert
  }
}

function setSchuelerfeld(
  change: LeistungsChange,
  schueler: EnmExport['schueler'][number],
): void {
  const ts = toSVWSTimestamp(change.geaendertAm)

  if (change.feld === 'fehlstundenGesamt') {
    schueler.lernabschnitt.fehlstundenGesamt = parseNumberValue(change.neuerWert)
    schueler.lernabschnitt.tsFehlstundenGesamt = ts
    return
  }

  if (change.feld === 'fehlstundenUnentschuldigt') {
    schueler.lernabschnitt.fehlstundenGesamtUnentschuldigt = parseNumberValue(change.neuerWert)
    schueler.lernabschnitt.tsFehlstundenGesamtUnentschuldigt = ts
    return
  }

  if (change.feld === 'lernbereichArbeitslehre') {
    schueler.lernabschnitt.lernbereich1note = change.neuerWert as EnmLeistungsdaten['note']
    return
  }

  if (change.feld === 'lernbereichNaturwissenschaft') {
    schueler.lernabschnitt.lernbereich2note = change.neuerWert as EnmLeistungsdaten['note']
    return
  }

  if (change.feld === 'asv') {
    schueler.bemerkungen.ASV = change.neuerWert
    schueler.bemerkungen.tsASV = ts
    return
  }

  if (change.feld === 'aue') {
    schueler.bemerkungen.AUE = change.neuerWert
    schueler.bemerkungen.tsAUE = ts
    return
  }

  if (change.feld === 'zeugnisbemerkung') {
    schueler.bemerkungen.ZB = change.neuerWert
    schueler.bemerkungen.tsZB = ts
  }
}

function buildRueckschreibeENM(): EnmExport {
  const source = enmDaten.value
  if (!source) {
    throw new Error('Es sind keine ENM-Daten geladen.')
  }

  const next = cloneENM(source)
  normalizeLehrerInitialPassword(next)
  const leistungByKey = new Map<string, EnmLeistungsdaten>()
  const schuelerById = new Map<number, EnmExport['schueler'][number]>()

  for (const schueler of next.schueler) {
    schuelerById.set(schueler.id, schueler)
    for (const ld of schueler.leistungsdaten) {
      leistungByKey.set(`${schueler.id}:${ld.lerngruppenID}`, ld)
    }
  }

  for (const change of changeStore.changes.values()) {
    const targetSchueler = schuelerById.get(change.schuelerId)

    if (
      targetSchueler
      && (
        change.feld === 'fehlstundenGesamt'
        || change.feld === 'fehlstundenUnentschuldigt'
        || change.feld === 'lernbereichArbeitslehre'
        || change.feld === 'lernbereichNaturwissenschaft'
        || change.feld === 'asv'
        || change.feld === 'aue'
        || change.feld === 'zeugnisbemerkung'
      )
    ) {
      setSchuelerfeld(change, targetSchueler)
      continue
    }

    const key = `${change.schuelerId}:${change.lerngruppenId}`
    const ld = leistungByKey.get(key)
    if (!ld) {
      continue
    }
    setLeistungsfeld(ld, change.feld, change.neuerWert, change.geaendertAm)
  }

  return next
}

async function saveAsFile(content: EnmExport): Promise<void> {
  const json = `${JSON.stringify(content, null, 2)}\n`
  const filenameBase = (sourceFileName.value || 'enm.export.json').replace(/\.(gz|json)$/i, '')
  const suggestedName = `${filenameBase}.json`

  await saveContentAsFile(json, suggestedName, 'ENM JSON', ['.json'])
}

function arrayBufferNachBase64(buffer: ArrayBuffer): string {
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function arrayBufferAusUint8Array(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

async function leitenSchluesselAbFuerEncrypt(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
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
    ['encrypt'],
  )
}

async function baueEncryptedPayload(content: EnmExport): Promise<string> {
  const normalizedPassword = encryptedSourcePassword.value.trim()

  if (normalizedPassword === '') {
    throw new Error('Verschluesselung fehlgeschlagen: Kennwort ist nicht verfuegbar.')
  }

  const enmJson = `${JSON.stringify(content, null, 2)}\n`
  const zipBytes = zipSync({
    'enm.json': strToU8(enmJson),
  })

  const plainZip = arrayBufferAusUint8Array(zipBytes)
  const salt = window.crypto.getRandomValues(new Uint8Array(16)).buffer.slice(0) as ArrayBuffer
  const iv = window.crypto.getRandomValues(new Uint8Array(12)).buffer.slice(0) as ArrayBuffer
  const key = await leitenSchluesselAbFuerEncrypt(normalizedPassword, salt)
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainZip)

  const payload: EncryptedZipPayload = {
    format: 'gradehub-encrypted-zip',
    version: 1,
    originalFileName: encryptedOriginalFileName.value,
    salt: arrayBufferNachBase64(salt),
    iv: arrayBufferNachBase64(iv),
    ciphertext: arrayBufferNachBase64(ciphertext),
  }

  return `${JSON.stringify(payload, null, 2)}\n`
}

async function saveAsEncryptedFile(content: EnmExport): Promise<void> {
  const encryptedJson = await baueEncryptedPayload(content)
  const filenameBase = (sourceFileName.value || 'enm.export').replace(/\.(zip\.enc\.json|enc\.json|zip|gz|json)$/i, '')
  const suggestedName = encryptedSourceFileName.value.trim() !== ''
    ? encryptedSourceFileName.value
    : `${filenameBase}.zip.enc.json`

  await saveContentAsFile(encryptedJson, suggestedName, 'Verschluesselte ENM ZIP JSON', ['.enc.json'])
}

async function saveContentAsFile(
  content: string,
  suggestedName: string,
  description: string,
  extensions: string[],
): Promise<void> {
  const blob = new Blob([content], { type: 'application/json' })

  const picker = window as typeof window & {
    showSaveFilePicker?: (options: {
      suggestedName: string
      types: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }

  if (typeof picker.showSaveFilePicker === 'function') {
    const handle = await picker.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description,
          accept: { 'application/json': extensions },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function saveToServer(content: EnmExport): Promise<void> {
  const endpoint = `${authStore.baseUrl.replace(/\/$/, '')}/db/${authStore.schema}/enm/v2/import`
  const body = JSON.stringify(content)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${window.btoa(`${authStore.username}:${authStore.password}`)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    })
  } catch {
    throw new Error('Rückschreiben fehlgeschlagen: Netzwerkfehler beim Serverzugriff.')
  }

  if (!response.ok) {
    throw new Error(`Rückschreiben fehlgeschlagen (${response.status}).`)
  }
}

async function onSave(): Promise<void> {
  clearMessages()

  if (!enmDaten.value) {
    errorMessage.value = 'Es sind keine ENM-Daten geladen.'
    return
  }

  if (changeCount.value === 0) {
    statusMessage.value = 'Keine Änderungen zum Speichern vorhanden.'
    return
  }

  const confirmation = window.confirm(
    effectiveDataSource.value === 'api'
      ? 'Änderungen jetzt an den SVWS-Server zurückschreiben?'
      : isEncryptedFileSource.value
        ? 'Aenderungen jetzt als verschluesselte ENM-Datei speichern?'
        : 'Änderungen jetzt als ENM-Datei speichern?',
  )

  if (!confirmation) {
    return
  }

  isSaving.value = true
  try {
    const exportData = buildRueckschreibeENM()

    if (effectiveDataSource.value === 'api') {
      if (!canSaveToServer.value) {
        throw new Error('Rückschreiben ist nicht möglich: Server-Verbindungsdaten fehlen.')
      }
      await saveToServer(exportData)
      statusMessage.value = 'Änderungen wurden erfolgreich an den SVWS-Server übertragen.'
    } else if (isEncryptedFileSource.value) {
      await saveAsEncryptedFile(exportData)
      statusMessage.value = 'Aenderungen wurden als verschluesselte ENM-Datei gespeichert.'
    } else {
      await saveAsFile(exportData)
      statusMessage.value = 'Änderungen wurden als ENM-Datei gespeichert.'
    }

    enmStore.ersetzeENMDaten(exportData)
    changeStore.reset()
  } catch (error) {
    errorMessage.value = formatSaveError(error)
  } finally {
    isSaving.value = false
  }
}

function goBack(): void {
  router.push({ name: 'lerngruppen' })
}
</script>

<template>
  <main class="export-view">
    <h1>Speichern</h1>

    <section class="card" v-if="isLoaded && enmDaten">
      <p>
        Datenquelle:
        <strong>{{ dataSourceLabel }}</strong>
      </p>
      <p>
        Offene Änderungen:
        <strong>{{ changeCount }}</strong>
      </p>

      <p v-if="isFileSource && sourceDisplayName" class="source-hint">
        Quelle: {{ sourceDisplayName }}
      </p>

      <p class="hint" v-if="effectiveDataSource === 'api'">
        Es wird ein Rückschreibe-Dialog für den SVWS-Server angeboten.
      </p>
      <p class="hint" v-else-if="isEncryptedFileSource">
        Es wird eine verschluesselte ENM-Datei gespeichert.
      </p>
      <p class="hint" v-else-if="effectiveDataSource === 'file'">
        Es wird ein Dateispeicher-Dialog angeboten.
      </p>
      <p class="hint" v-else>
        Es wird ein Rückschreibe-Dialog für den SVWS-Server angeboten.
      </p>

      <div class="actions">
        <button class="secondary" type="button" @click="goBack">Zurück</button>
        <button
          class="primary"
          type="button"
          :disabled="isSaving || changeCount === 0"
          @click="onSave"
        >
          {{ effectiveDataSource === 'api'
            ? 'Zum Server speichern'
            : isEncryptedFileSource
              ? 'Verschluesselte Datei speichern'
              : 'Datei speichern' }}
        </button>
      </div>
    </section>

    <section v-else class="card">
      <p>Es sind keine ENM-Daten geladen.</p>
      <button class="secondary" type="button" @click="goBack">Zurück</button>
    </section>

    <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>

<style scoped>
.export-view {
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 1rem;
}

h1 {
  margin: 0;
}

.card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.6rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

p {
  margin: 0;
}

.source-hint,
.hint {
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

button {
  font: inherit;
  border-radius: 0.4rem;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary {
  background: var(--color-primary);
  color: #fff;
  border: 1px solid var(--color-primary);
}

.secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
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
</style>
