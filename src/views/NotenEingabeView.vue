<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'

import type { EnmLeistungsdaten, EnmSchueler } from '@/types/enm'

const route = useRoute()
const router = useRouter()
const enmStore = useENMStore()
const changeStore = useChangeStore()

// ── Route ──────────────────────────────────────────────────────────────────

const lerngruppenId = computed<number>(() => {
  const raw = route.params.id
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(n) ? n : -1
})

// ── ENM-Daten ──────────────────────────────────────────────────────────────

const lerngruppe = computed(() =>
  enmStore.enmDaten?.lerngruppen.find((lg) => lg.id === lerngruppenId.value) ?? null,
)

const fach = computed(() => {
  if (!lerngruppe.value) return null
  return enmStore.enmDaten?.faecher.find((f) => f.id === lerngruppe.value!.fachID) ?? null
})

const fachKuerzel = computed(() => fach.value?.kuerzelAnzeige || fach.value?.kuerzel || '?')
const fachBezeichnung = computed(() => fach.value?.bezeichnung ?? fach.value?.kuerzel ?? '')

// Lehrerkürzel aus ENM-Daten für geaendertVon
const lehrerKuerzel = computed<string>(() => {
  const enmDaten = enmStore.enmDaten
  if (!enmDaten) return ''
  const raw = enmDaten.lehrerID
  let lehrerId: number | null = null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    lehrerId = raw
  } else if (typeof raw === 'string') {
    const n = Number.parseInt(raw, 10)
    if (!Number.isNaN(n)) lehrerId = n
  } else if (typeof raw === 'object' && raw !== null && 'id' in (raw as object)) {
    const maybeId = (raw as Record<string, unknown>).id
    if (typeof maybeId === 'number') lehrerId = maybeId
  }
  if (lehrerId === null) return ''
  return enmDaten.lehrer.find((l) => l.id === lehrerId)?.kuerzel ?? ''
})

const klassenById = computed(() => {
  const map = new Map<number, string>()
  for (const klasse of enmStore.enmDaten?.klassen ?? []) {
    map.set(klasse.id, klasse.kuerzelAnzeige || klasse.kuerzel)
  }
  return map
})

const schuelerListe = computed<EnmSchueler[]>(() => {
  const lgId = lerngruppenId.value
  return (enmStore.enmDaten?.schueler ?? [])
    .filter((s) => s.leistungsdaten.some((ld) => ld.lerngruppenID === lgId))
    .sort((a, b) => {
      const cmp = a.nachname.localeCompare(b.nachname, 'de')
      return cmp !== 0 ? cmp : a.vorname.localeCompare(b.vorname, 'de')
    }) as EnmSchueler[]
})

function getLeistungsdaten(schueler: EnmSchueler): EnmLeistungsdaten | null {
  return schueler.leistungsdaten.find((ld) => ld.lerngruppenID === lerngruppenId.value) ?? null
}

// ── Gültige Noten ──────────────────────────────────────────────────────────

const VALID_NOTES = new Set<string>([
  '1+', '1', '1-',
  '2+', '2', '2-',
  '3+', '3', '3-',
  '4+', '4', '4-',
  '5+', '5', '5-',
  '6',
  'AT', 'E1', 'E2', 'E3', 'NT', 'NB', 'NE', 'LM', 'AM',
])

// Noten, die nach Eingabe des letzten Zeichens sofort vollständig sind → auto-advance
const NOTES_AUTO_ADVANCE = new Set<string>([
  '1+', '1-', '2+', '2-', '3+', '3-', '4+', '4-', '5+', '5-',
  'AT', 'E1', 'E2', 'E3', 'NT', 'NB', 'NE', 'LM', 'AM',
  '6',
])

// ── Shadow-State (letzte committete Werte, für Escape-Revert) ──────────────

const editValues = reactive(new Map<number, string>())
const invalidIds = reactive(new Set<number>())

// ── Input-Refs & Navigation ────────────────────────────────────────────────

const noteInputs = ref<(HTMLInputElement | null)[]>([])
const focusedRow = ref<number>(-1)

function initEditValues(): void {
  editValues.clear()
  invalidIds.clear()
  for (const s of schuelerListe.value) {
    const change = changeStore.getChange(s.id, lerngruppenId.value)
    const ld = getLeistungsdaten(s)
    editValues.set(s.id, change?.neuerWert ?? ld?.note ?? '')
  }
}

// Beim Wechsel der Lerngruppe oder beim ersten Laden initialisieren
watch(() => lerngruppenId.value, () => {
  noteInputs.value = []
  initEditValues()
}, { immediate: true })

// Uncontrolled inputs: Initialwert wird imperativ per Ref-Callback gesetzt.
// Kein :value-Binding – verhindert Überschreiben des DOM-Werts beim Re-Render.
function setNoteInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    noteInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(schueler.id) ?? ''
    }
  } else {
    noteInputs.value[index] = null
  }
}

function focusNoteAt(index: number): void {
  const input = noteInputs.value[index]
  if (input) {
    input.focus()
    input.select()
  }
}

// ── Noteneingabe-Logik ─────────────────────────────────────────────────────

function originalNote(schueler: EnmSchueler): string {
  return getLeistungsdaten(schueler)?.note ?? ''
}

function hasChange(schueler: EnmSchueler): boolean {
  const change = changeStore.getChange(schueler.id, lerngruppenId.value)
  if (!change) return false
  const original = getLeistungsdaten(schueler)?.note ?? null
  return change.neuerWert !== original
}

function commitNote(schueler: EnmSchueler, rawValue: string, index: number, advance: boolean): void {
  const normalized = rawValue.trim().toUpperCase()

  if (normalized !== '' && !VALID_NOTES.has(normalized)) {
    invalidIds.add(schueler.id)
    return
  }

  invalidIds.delete(schueler.id)

  const ld = getLeistungsdaten(schueler)
  const neuerWert = normalized === '' ? null : normalized

  changeStore.setChange({
    schuelerId:        schueler.id,
    lerngruppenId:     lerngruppenId.value,
    feld:              'note',
    alterWert:         ld?.note ?? null,
    neuerWert,
    geaendertAm:       new Date().toISOString(),
    geaendertVon:      lehrerKuerzel.value,
    enmBasisTimestamp: ld?.tsNote ?? '',
  })

  editValues.set(schueler.id, neuerWert ?? '')

  if (advance) {
    nextTick(() => {
      if (index + 1 < schuelerListe.value.length) {
        focusNoteAt(index + 1)
      }
    })
  }
}

// ── Event-Handler ──────────────────────────────────────────────────────────

function onNoteInput(event: Event, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  const upper = input.value.toUpperCase()

  invalidIds.delete(schueler.id)

  if (NOTES_AUTO_ADVANCE.has(upper)) {
    input.value = upper
    commitNote(schueler, upper, index, true)
  }
}

function onNoteKeydown(event: KeyboardEvent, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement

  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    commitNote(schueler, input.value, index, true)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    commitNote(schueler, input.value, index, false)
    nextTick(() => focusNoteAt(index - 1))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    // Zurück auf letzten committeten Wert
    const reverted = editValues.get(schueler.id) ?? ''
    input.value = reverted
    invalidIds.delete(schueler.id)
  }
}

function onNoteBlur(event: FocusEvent, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  // Normalisierung: Kleinbuchstaben → Großbuchstaben
  const normalized = input.value.toUpperCase()
  if (input.value !== normalized) {
    input.value = normalized
  }
  commitNote(schueler, normalized, index, false)
}

// ── Statistiken ────────────────────────────────────────────────────────────

const aenderungsCount = computed(() =>
  schuelerListe.value.filter((s) => hasChange(s)).length,
)

// ── Navigation ─────────────────────────────────────────────────────────────

function goBack(): void {
  router.push({ name: 'lerngruppen' })
}
</script>

<template>
  <main class="noteneingabe">

    <!-- ── Sticky Header ───────────────────────────────────────────────── -->
    <header class="noten-header">
      <button class="btn-back" type="button" @click="goBack">&#8592; Lerngruppen</button>

      <div class="noten-header-info">
        <span class="fach-badge">{{ fachKuerzel }}</span>
        <h1 class="noten-titel">{{ lerngruppe?.bezeichnung ?? 'Unbekannte Lerngruppe' }}</h1>
        <span v-if="fachBezeichnung" class="fach-bezeichnung">{{ fachBezeichnung }}</span>
      </div>

      <div class="noten-stats">
        <span class="stat">{{ schuelerListe.length }} SuS</span>
        <span v-if="aenderungsCount > 0" class="stat stat-geaendert">
          {{ aenderungsCount }} geändert
        </span>
      </div>
    </header>

    <!-- ── Fallback: Lerngruppe nicht gefunden ─────────────────────────── -->
    <div v-if="!lerngruppe" class="kein-inhalt">
      <p>Lerngruppe nicht gefunden.</p>
      <button type="button" @click="goBack">Zurück zur Übersicht</button>
    </div>

    <!-- ── Notentabelle ────────────────────────────────────────────────── -->
    <div v-else class="tabelle-wrapper">
      <table class="notentabelle">
        <thead>
          <tr>
            <th class="col-nr">#</th>
            <th class="col-name">Name</th>
            <th class="col-klasse">Klasse</th>
            <th class="col-note">Note</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(schueler, idx) in schuelerListe"
            :key="schueler.id"
            :class="{
              'zeile-geaendert': hasChange(schueler),
              'zeile-focus': focusedRow === idx,
            }"
            @click="focusNoteAt(idx)"
          >
            <td class="col-nr">{{ idx + 1 }}</td>
            <td class="col-name">
              <span class="name-nachname">{{ schueler.nachname }}</span>,&nbsp;<span
                class="name-vorname"
              >{{ schueler.vorname }}</span>
            </td>
            <td class="col-klasse">{{ klassenById.get(schueler.klasseID) ?? '' }}</td>
            <td class="col-note">
              <input
                class="note-input"
                :class="{
                  'note-invalid':   invalidIds.has(schueler.id),
                  'note-geaendert': hasChange(schueler),
                }"
                type="text"
                maxlength="2"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                :placeholder="originalNote(schueler)"
                :ref="(el) => setNoteInputRef(el, idx)"
                @input="onNoteInput($event, schueler, idx)"
                @keydown="onNoteKeydown($event, schueler, idx)"
                @blur="onNoteBlur($event, schueler, idx)"
                @focus="focusedRow = idx"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Tastatur-Hinweise ────────────────────────────────────────────── -->
    <footer class="noteneingabe-footer">
      <p class="tastatur-hinweis">
        <kbd>↵</kbd> oder <kbd>↓</kbd>&ensp;nächste Zeile&emsp;
        <kbd>↑</kbd>&ensp;vorherige Zeile&emsp;
        <kbd>Tab</kbd>&ensp;nächstes Feld&emsp;
        <kbd>Esc</kbd>&ensp;Eingabe abbrechen&emsp;
        Gültig: <code>1</code>–<code>6</code>, <code>+</code>/<code>-</code>,
        <code>NT</code>, <code>NE</code>, <code>NB</code>, <code>AT</code>, …
      </p>
    </footer>

  </main>
</template>

<style scoped>
.noteneingabe {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
}

/* ── Header ──────────────────────────────────────────────────────────────── */

.noten-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.5rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.btn-back {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.875rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-back:hover {
  background-color: var(--color-bg);
}

.noten-header-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.fach-badge {
  background-color: var(--color-primary);
  color: #fff;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}

.noten-titel {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fach-bezeichnung {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.noten-stats {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-shrink: 0;
}

.stat {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.stat-geaendert {
  background-color: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  color: #166534;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}
:root[data-theme='dark'] .stat-geaendert {
  color: #86efac;
}

/* ── Tabelle ─────────────────────────────────────────────────────────────── */

.tabelle-wrapper {
  flex: 1;
  overflow-x: auto;
  padding: 1.25rem 1.5rem;
}

.notentabelle {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.notentabelle thead th {
  background-color: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.55rem 0.75rem;
  text-align: left;
  border-bottom: 2px solid var(--color-border);
}

.notentabelle tbody tr {
  border-bottom: 1px solid var(--color-border);
  transition: background-color 0.1s ease;
  cursor: default;
}
.notentabelle tbody tr:last-child {
  border-bottom: none;
}
.notentabelle tbody tr:hover,
.notentabelle tbody tr.zeile-focus {
  background-color: var(--color-bg);
}

/* Blauer Balken links für geänderte Zeilen */
.notentabelle tbody tr.zeile-geaendert {
  position: relative;
}
.notentabelle tbody tr.zeile-geaendert td:first-child {
  position: relative;
}
.notentabelle tbody tr.zeile-geaendert td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--color-primary);
}

.notentabelle td {
  padding: 0.35rem 0.75rem;
  vertical-align: middle;
}

/* ── Spalten ─────────────────────────────────────────────────────────────── */

.col-nr {
  width: 3rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.col-name {
  min-width: 10rem;
}

.name-nachname {
  font-weight: 600;
}
.name-vorname {
  color: var(--color-text-muted);
}

.col-klasse {
  width: 5rem;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.col-note {
  width: 7rem;
}

/* ── Note-Input ──────────────────────────────────────────────────────────── */

.note-input {
  width: 4.5rem;
  padding: 0.3rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 1rem;
  font-family: 'Noto Sans Mono', 'Courier New', monospace;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.05em;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s, background-color 0.12s;
}

.note-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.note-input.note-geaendert {
  border-color: var(--color-success-border);
  background-color: var(--color-success-bg);
  color: #166534;
}
:root[data-theme='dark'] .note-input.note-geaendert {
  color: #86efac;
}
.note-input.note-geaendert:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.note-input.note-invalid {
  border-color: var(--color-error-border);
  background-color: var(--color-error-bg);
}
.note-input.note-invalid:focus {
  border-color: var(--color-error-border);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-error-border) 18%, transparent);
}

/* ── Fallback ────────────────────────────────────────────────────────────── */

.kein-inhalt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--color-text-muted);
  padding: 3rem;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

.noteneingabe-footer {
  padding: 0.6rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface);
}

.tastatur-hinweis {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.8;
}

kbd {
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-size: 0.75rem;
  font-family: inherit;
  color: var(--color-text);
}

code {
  background-color: var(--color-bg);
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  font-size: 0.78rem;
  color: var(--color-primary);
  font-family: monospace;
}
</style>
