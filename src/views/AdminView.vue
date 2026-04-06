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
  // TODO: Dateien erzeugen
}

function speichern(): void {
  // TODO: Konfiguration speichern
}

function laden(): void {
  // TODO: Konfiguration laden
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
              <td class="col-passwort">{{ l.notenpasswort || '-' }}</td>
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
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border);
}
</style>
