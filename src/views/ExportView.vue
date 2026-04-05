<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { gzipSync, strToU8 } from 'fflate'

import { useAuthStore } from '@/stores/authStore'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'

import type { EnmExport, EnmLeistungsdaten } from '@/types/enm'

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

const isSaving = ref<boolean>(false)
const statusMessage = ref<string>('')
const errorMessage = ref<string>('')

type DataSource = 'api' | 'file' | null

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
  if (effectiveDataSource.value === 'file') return 'Datei'
  return 'unbekannt'
})

const canSaveToServer = computed<boolean>(() => {
  return effectiveDataSource.value === 'api' && isConfigured.value
})

const isFileSource = computed<boolean>(() => effectiveDataSource.value === 'file')

function clearMessages(): void {
  statusMessage.value = ''
  errorMessage.value = ''
}

function cloneENM(data: unknown): EnmExport {
  return JSON.parse(JSON.stringify(data)) as EnmExport
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

function buildRueckschreibeENM(): EnmExport {
  const source = enmDaten.value
  if (!source) {
    throw new Error('Es sind keine ENM-Daten geladen.')
  }

  const next = cloneENM(source)
  const leistungByKey = new Map<string, EnmLeistungsdaten>()

  for (const schueler of next.schueler) {
    for (const ld of schueler.leistungsdaten) {
      leistungByKey.set(`${schueler.id}:${ld.lerngruppenID}`, ld)
    }
  }

  for (const change of changeStore.changes.values()) {
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
          description: 'ENM JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(new Blob([json], { type: 'application/json' }))
    await writable.close()
    return
  }

  const blob = new Blob([json], { type: 'application/json' })
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
  const payload = gzipSync(strToU8(JSON.stringify(content)))
  const body = new Uint8Array(Array.from(payload)).buffer

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${window.btoa(`${authStore.username}:${authStore.password}`)}`,
        Accept: 'application/json, application/octet-stream',
        'Content-Type': 'application/octet-stream',
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
    } else {
      await saveAsFile(exportData)
      statusMessage.value = 'Änderungen wurden als ENM-Datei gespeichert.'
    }

    enmStore.ersetzeENMDaten(exportData)
    changeStore.reset()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
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

      <p v-if="isFileSource && sourceFileName" class="source-hint">
        Quelle: {{ sourceFileName }}
      </p>

      <p class="hint" v-if="effectiveDataSource === 'api'">
        Es wird ein Rückschreibe-Dialog für den SVWS-Server angeboten.
      </p>
      <p class="hint" v-else-if="effectiveDataSource === 'file'">
        Es wird ein Dateispeicher-Dialog angeboten.
      </p>
      <p class="hint" v-else>
        Es wird ein Rückschreibe-Dialog für den SVWS-Server angeboten.
      </p>
      <p class="hint" v-if="effectiveDataSource === 'api' && !canSaveToServer">
        Rückschreiben ist erst möglich, wenn gültige Server-Zugangsdaten vorliegen.
      </p>

      <div class="actions">
        <button class="secondary" type="button" @click="goBack">Zurück</button>
        <button
          class="primary"
          type="button"
          :disabled="isSaving || changeCount === 0 || (effectiveDataSource === 'api' && !canSaveToServer)"
          @click="onSave"
        >
          {{ effectiveDataSource === 'api' ? 'Zum Server speichern' : 'Datei speichern' }}
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
