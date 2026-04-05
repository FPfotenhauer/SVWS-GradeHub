<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
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
  kuerzel: 72,
  name: 190,
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

function spaltenStil(key: SpaltenKey): { width: string; minWidth: string } {
  const breite = spaltenBreiten.value[key]
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
              <td class="col-passwort">{{ l.notenpasswort || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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
  width: max-content;
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
</style>
