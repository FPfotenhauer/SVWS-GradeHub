<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FloskelPickerDialog from '@/components/FloskelPickerDialog.vue'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'

import type { LeistungsFeld } from '@/types/changes'
import type { EnmLeistungsdaten, EnmSchueler, EnmTeilleistungsart } from '@/types/enm'

const route = useRoute()
const router = useRouter()
const enmStore = useENMStore()
const changeStore = useChangeStore()
const globalChangeCount = computed<number>(() => changeStore.changeCount)

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
const floskelgruppen = computed(() => enmStore.enmDaten?.floskelgruppen ?? [])
const faecher = computed(() => enmStore.enmDaten?.faecher ?? [])
const jahrgaenge = computed(() => enmStore.enmDaten?.jahrgaenge ?? [])

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

const SCHLECHTE_NOTEN = new Set<string>(['4-', '5+', '5', '5-', '6'])

function isSchlechteNote(note: string): boolean {
  return SCHLECHTE_NOTEN.has(note)
}

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

const editValues = reactive(new Map<string, string>())
const invalidIds = reactive(new Set<string>())

// ── Input-Refs & Navigation ────────────────────────────────────────────────

const noteInputs = ref<(HTMLInputElement | null)[]>([])
const quartalInputs = ref<(HTMLInputElement | null)[]>([])
const fehlstundenFachInputs = ref<(HTMLInputElement | null)[]>([])
const fehlstundenUnentschuldigtFachInputs = ref<(HTMLInputElement | null)[]>([])
const bemerkungInputs = ref<(HTMLInputElement | null)[]>([])
const focusedRow = ref<number>(-1)
const floskelDialog = reactive<{
  open: boolean
  schuelerId: number | null
  index: number
  value: string
}>({
  open: false,
  schuelerId: null,
  index: -1,
  value: '',
})

type EditField =
  | 'note'
  | 'noteQuartal'
  | 'fehlstundenFach'
  | 'fehlstundenUnentschuldigtFach'
  | 'fachbezogeneBemerkungen'
  | `teilleistung:${number}`
type ColumnKey = 'nr' | 'name' | 'klasse' | 'fsf' | 'fsu' | 'quartal' | 'note'

const columnWidths = reactive<Record<ColumnKey, number>>({
  nr: 56,
  name: 320,
  klasse: 96,
  fsf: 84,
  fsu: 84,
  quartal: 110,
  note: 110,
})

const minColumnWidths: Record<ColumnKey, number> = {
  nr: 44,
  name: 180,
  klasse: 72,
  fsf: 64,
  fsu: 64,
  quartal: 88,
  note: 88,
}

const resizing = ref<{
  key: ColumnKey
  startX: number
  startWidth: number
} | null>(null)

function onResizeMove(event: PointerEvent): void {
  if (!resizing.value) return
  const delta = event.clientX - resizing.value.startX
  const nextWidth = Math.max(minColumnWidths[resizing.value.key], resizing.value.startWidth + delta)
  columnWidths[resizing.value.key] = nextWidth
}

function stopResize(): void {
  if (!resizing.value) return
  resizing.value = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
}

function startResize(key: ColumnKey, event: PointerEvent): void {
  event.preventDefault()
  resizing.value = {
    key,
    startX: event.clientX,
    startWidth: columnWidths[key],
  }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', stopResize)
}

// ── Teilleistungs-Spalten-Resize ───────────────────────────────────────────

const TL_DEFAULT_WIDTH = 110
const TL_MIN_WIDTH = 64
const tlColumnWidths = reactive(new Map<number, number>())

function getTlColumnWidth(artId: number): number {
  return tlColumnWidths.get(artId) ?? TL_DEFAULT_WIDTH
}

const resizingTl = ref<{
  artId: number
  startX: number
  startWidth: number
} | null>(null)

function onResizeMoveTl(event: PointerEvent): void {
  if (!resizingTl.value) return
  const delta = event.clientX - resizingTl.value.startX
  const nextWidth = Math.max(TL_MIN_WIDTH, resizingTl.value.startWidth + delta)
  tlColumnWidths.set(resizingTl.value.artId, nextWidth)
}

function stopResizeTl(): void {
  if (!resizingTl.value) return
  resizingTl.value = null
  window.removeEventListener('pointermove', onResizeMoveTl)
  window.removeEventListener('pointerup', stopResizeTl)
}

function startResizeTl(artId: number, event: PointerEvent): void {
  event.preventDefault()
  resizingTl.value = {
    artId,
    startX: event.clientX,
    startWidth: getTlColumnWidth(artId),
  }
  window.addEventListener('pointermove', onResizeMoveTl)
  window.addEventListener('pointerup', stopResizeTl)
}

onBeforeUnmount(() => {
  stopResize()
  stopResizeTl()
})

const teilleistungsartenById = computed(() => {
  const map = new Map<number, EnmTeilleistungsart>()
  for (const art of enmStore.enmDaten?.teilleistungsarten ?? []) {
    map.set(art.id, art)
  }
  return map
})

const teilleistungsartenInLerngruppe = computed<EnmTeilleistungsart[]>(() => {
  const artIdSet = new Set<number>()
  for (const s of schuelerListe.value) {
    const ld = getLeistungsdaten(s)
    for (const tl of ld?.teilleistungen ?? []) {
      artIdSet.add(tl.artID)
    }
  }
  return [...artIdSet]
    .map((id) => teilleistungsartenById.value.get(id))
    .filter((art): art is EnmTeilleistungsart => art !== undefined)
    .sort((a, b) => a.sortierung - b.sortierung)
})

const showFehlstunden = ref(false)
const showTeilleistungen = ref(false)
const teilleistungInputEls = new Map<string, HTMLInputElement | null>()

const editableFields = computed<EditField[]>(() => {
  if (showTeilleistungen.value) {
    return [
      'noteQuartal',
      'note',
      ...teilleistungsartenInLerngruppe.value.map((art) => `teilleistung:${art.id}` as EditField),
    ]
  }
  const fields: EditField[] = []
  if (showFehlstunden.value) fields.push('fehlstundenFach', 'fehlstundenUnentschuldigtFach')
  fields.push('noteQuartal', 'note', 'fachbezogeneBemerkungen')
  return fields
})

function initEditValues(): void {
  editValues.clear()
  invalidIds.clear()
  for (const s of schuelerListe.value) {
    const noteChange = changeStore.getChange(s.id, lerngruppenId.value, 'note')
    const quartalChange = changeStore.getChange(s.id, lerngruppenId.value, 'noteQuartal')
    const fsfChange = changeStore.getChange(s.id, lerngruppenId.value, 'fehlstundenFach')
    const fsuChange = changeStore.getChange(s.id, lerngruppenId.value, 'fehlstundenUnentschuldigtFach')
    const bemerkungChange = changeStore.getChange(s.id, lerngruppenId.value, 'fachbezogeneBemerkungen')
    const ld = getLeistungsdaten(s)
    editValues.set(editKey(s.id, 'note'), noteChange?.neuerWert ?? ld?.note ?? '')
    editValues.set(editKey(s.id, 'noteQuartal'), quartalChange?.neuerWert ?? ld?.noteQuartal ?? '')
    editValues.set(
      editKey(s.id, 'fehlstundenFach'),
      fsfChange?.neuerWert ?? (ld ? String(ld.fehlstundenFach) : ''),
    )
    editValues.set(
      editKey(s.id, 'fehlstundenUnentschuldigtFach'),
      fsuChange?.neuerWert ?? (ld ? String(ld.fehlstundenUnentschuldigtFach) : ''),
    )
    editValues.set(
      editKey(s.id, 'fachbezogeneBemerkungen'),
      bemerkungChange?.neuerWert ?? (ld?.fachbezogeneBemerkungen ?? ''),
    )
    for (const art of teilleistungsartenInLerngruppe.value) {
      const tlFeld: EditField = `teilleistung:${art.id}`
      const tlChange = changeStore.getChange(s.id, lerngruppenId.value, tlFeld)
      const tl = ld?.teilleistungen.find((t) => t.artID === art.id)
      editValues.set(editKey(s.id, tlFeld), tlChange?.neuerWert ?? tl?.note ?? '')
    }
  }
}

// Beim Wechsel der Lerngruppe oder beim ersten Laden initialisieren
watch(() => lerngruppenId.value, () => {
  noteInputs.value = []
  quartalInputs.value = []
  fehlstundenFachInputs.value = []
  fehlstundenUnentschuldigtFachInputs.value = []
  bemerkungInputs.value = []
  teilleistungInputEls.clear()
  if (teilleistungsartenInLerngruppe.value.length === 0) {
    showTeilleistungen.value = false
  }
  initEditValues()
}, { immediate: true })

function editKey(schuelerId: number, feld: EditField): string {
  return `${schuelerId}:${feld}`
}

function invalidKey(schuelerId: number, feld: EditField): string {
  return editKey(schuelerId, feld)
}

// Uncontrolled inputs: Initialwert wird imperativ per Ref-Callback gesetzt.
// Kein :value-Binding – verhindert Überschreiben des DOM-Werts beim Re-Render.
function setNoteInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    noteInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(editKey(schueler.id, 'note')) ?? ''
    }
  } else {
    noteInputs.value[index] = null
  }
}

function setQuartalInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    quartalInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(editKey(schueler.id, 'noteQuartal')) ?? ''
    }
  } else {
    quartalInputs.value[index] = null
  }
}

function setFehlstundenFachInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    fehlstundenFachInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(editKey(schueler.id, 'fehlstundenFach')) ?? ''
    }
  } else {
    fehlstundenFachInputs.value[index] = null
  }
}

function setFehlstundenUnentschuldigtFachInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    fehlstundenUnentschuldigtFachInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(editKey(schueler.id, 'fehlstundenUnentschuldigtFach')) ?? ''
    }
  } else {
    fehlstundenUnentschuldigtFachInputs.value[index] = null
  }
}

function setBemerkungInputRef(el: unknown, index: number): void {
  if (el instanceof HTMLInputElement) {
    bemerkungInputs.value[index] = el
    const schueler = schuelerListe.value[index]
    if (schueler) {
      el.value = editValues.get(editKey(schueler.id, 'fachbezogeneBemerkungen')) ?? ''
    }
  } else {
    bemerkungInputs.value[index] = null
  }
}

function focusNoteAt(index: number): void {
  const input = noteInputs.value[index]
  if (input) {
    input.focus()
    input.select()
  }
}

function onRowClick(event: MouseEvent, index: number): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, button')) {
    return
  }
  focusNoteAt(index)
}

function focusFieldAt(index: number, feld: EditField): void {
  if (feld.startsWith('teilleistung:')) {
    const artId = parseInt(feld.split(':')[1] ?? '', 10)
    const ai = teilleistungsartenInLerngruppe.value.findIndex((a) => a.id === artId)
    if (ai >= 0) focusTeilleistungAt(index, ai)
    return
  }
  const input = (
    feld === 'note'
      ? noteInputs.value[index]
      : feld === 'noteQuartal'
        ? quartalInputs.value[index]
        : feld === 'fehlstundenFach'
          ? fehlstundenFachInputs.value[index]
          : feld === 'fehlstundenUnentschuldigtFach'
            ? fehlstundenUnentschuldigtFachInputs.value[index]
            : bemerkungInputs.value[index]
  )
  if (input) {
    input.focus()
    input.select()
  }
}

// ── Noteneingabe-Logik ─────────────────────────────────────────────────────

function originalNote(schueler: EnmSchueler): string {
  return getLeistungsdaten(schueler)?.note ?? ''
}

function originalFieldValue(schueler: EnmSchueler, feld: EditField): string {
  const ld = getLeistungsdaten(schueler)
  if (!ld) return ''
  if (feld === 'note') return ld.note ?? ''
  if (feld === 'noteQuartal') return ld.noteQuartal ?? ''
  if (feld === 'fehlstundenFach') return String(ld.fehlstundenFach)
  if (feld === 'fehlstundenUnentschuldigtFach') return String(ld.fehlstundenUnentschuldigtFach)
  if (feld.startsWith('teilleistung:')) {
    const artId = parseInt(feld.split(':')[1] ?? '', 10)
    return ld.teilleistungen.find((t) => t.artID === artId)?.note ?? ''
  }
  return ld.fachbezogeneBemerkungen ?? ''
}

function normalizeFieldValue(feld: EditField, rawValue: string): string {
  if (feld === 'note' || feld === 'noteQuartal' || feld.startsWith('teilleistung:')) {
    return rawValue.trim().toUpperCase()
  }
  if (feld === 'fachbezogeneBemerkungen') {
    return rawValue
  }
  const digitsOnly = rawValue.replace(/\D/g, '')
  return digitsOnly
}

function isValidFieldValue(feld: EditField, normalized: string): boolean {
  if (normalized === '') return true
  if (feld === 'note' || feld === 'noteQuartal' || feld.startsWith('teilleistung:')) {
    return VALID_NOTES.has(normalized)
  }
  if (feld === 'fachbezogeneBemerkungen') {
    return true
  }
  return /^\d+$/.test(normalized)
}

function hasChange(schueler: EnmSchueler, feld: EditField = 'note'): boolean {
  const change = changeStore.getChange(schueler.id, lerngruppenId.value, feld)
  if (!change) return false
  const original = originalFieldValue(schueler, feld) || null
  return change.neuerWert !== original
}

function commitField(
  schueler: EnmSchueler,
  feld: EditField,
  rawValue: string,
  index: number,
  advance: boolean,
): void {
  const normalized = normalizeFieldValue(feld, rawValue)
  const invalidId = invalidKey(schueler.id, feld)

  if (!isValidFieldValue(feld, normalized)) {
    invalidIds.add(invalidId)
    return
  }

  invalidIds.delete(invalidId)

  const ld = getLeistungsdaten(schueler)
  const neuerWert = normalized === '' ? null : normalized
  const isTl = feld.startsWith('teilleistung:')
  const tlArtId = isTl ? parseInt(feld.split(':')[1] ?? '', 10) : NaN
  const tl = isTl ? (ld?.teilleistungen.find((t) => t.artID === tlArtId) ?? null) : null

  changeStore.setChange({
    schuelerId:        schueler.id,
    lerngruppenId:     lerngruppenId.value,
    feld:              feld as LeistungsFeld,
    alterWert: (
      feld === 'note'
        ? (ld?.note ?? null)
        : feld === 'noteQuartal'
          ? (ld?.noteQuartal ?? null)
          : feld === 'fehlstundenFach'
            ? (ld ? String(ld.fehlstundenFach) : null)
            : feld === 'fehlstundenUnentschuldigtFach'
              ? (ld ? String(ld.fehlstundenUnentschuldigtFach) : null)
              : isTl
                ? (tl?.note ?? null)
                : (ld?.fachbezogeneBemerkungen ?? null)
    ),
    neuerWert,
    geaendertAm:       new Date().toISOString(),
    geaendertVon:      lehrerKuerzel.value,
    enmBasisTimestamp: (
      feld === 'note'
        ? (ld?.tsNote ?? '')
        : feld === 'noteQuartal'
          ? (ld?.tsNoteQuartal ?? '')
          : feld === 'fehlstundenFach'
            ? (ld?.tsFehlstundenFach ?? '')
            : feld === 'fehlstundenUnentschuldigtFach'
              ? (ld?.tsFehlstundenUnentschuldigtFach ?? '')
              : isTl
                ? (tl?.tsNote ?? '')
                : (ld?.tsFachbezogeneBemerkungen ?? '')
    ),
  })

  editValues.set(editKey(schueler.id, feld), neuerWert ?? '')

  if (advance) {
    nextTick(() => {
      if (index + 1 < schuelerListe.value.length) {
        focusFieldAt(index + 1, feld)
      }
    })
  }
}

// ── Event-Handler ──────────────────────────────────────────────────────────

function onNoteInput(event: Event, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  const upper = input.value.toUpperCase()

  invalidIds.delete(invalidKey(schueler.id, 'note'))

  if (NOTES_AUTO_ADVANCE.has(upper)) {
    input.value = upper
    commitField(schueler, 'note', upper, index, true)
  }
}

function onQuartalInput(event: Event, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  const upper = input.value.toUpperCase()

  invalidIds.delete(invalidKey(schueler.id, 'noteQuartal'))

  if (NOTES_AUTO_ADVANCE.has(upper)) {
    input.value = upper
    commitField(schueler, 'noteQuartal', upper, index, true)
  }
}

function onBemerkungInput(event: Event, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  invalidIds.delete(invalidKey(schueler.id, 'fachbezogeneBemerkungen'))
  commitField(schueler, 'fachbezogeneBemerkungen', input.value, index, false)
}

function onFehlstundenInput(
  event: Event,
  schueler: EnmSchueler,
  index: number,
  feld: 'fehlstundenFach' | 'fehlstundenUnentschuldigtFach',
): void {
  const input = event.target as HTMLInputElement
  const digitsOnly = input.value.replace(/\D/g, '')

  if (input.value !== digitsOnly) {
    input.value = digitsOnly
  }

  invalidIds.delete(invalidKey(schueler.id, feld))
  commitField(schueler, feld, digitsOnly, index, false)
}

function onFieldKeydown(
  event: KeyboardEvent,
  schueler: EnmSchueler,
  index: number,
  feld: EditField,
): void {
  const input = event.target as HTMLInputElement

  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    commitField(schueler, feld, input.value, index, true)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    commitField(schueler, feld, input.value, index, false)
    nextTick(() => focusFieldAt(index - 1, feld))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    commitField(schueler, feld, input.value, index, false)
    const fields = editableFields.value
    const i = fields.indexOf(feld)
    const next = fields[i + 1]
    if (i >= 0 && next !== undefined) nextTick(() => focusFieldAt(index, next))
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    commitField(schueler, feld, input.value, index, false)
    const fields = editableFields.value
    const i = fields.indexOf(feld)
    const prev = fields[i - 1]
    if (i > 0 && prev !== undefined) nextTick(() => focusFieldAt(index, prev))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    // Zurück auf letzten committeten Wert
    const reverted = editValues.get(editKey(schueler.id, feld)) ?? ''
    input.value = reverted
    invalidIds.delete(invalidKey(schueler.id, feld))
  }
}

function onNoteBlur(event: FocusEvent, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  // Normalisierung: Kleinbuchstaben → Großbuchstaben
  const normalized = input.value.toUpperCase()
  if (input.value !== normalized) {
    input.value = normalized
  }
  commitField(schueler, 'note', normalized, index, false)
}

function onQuartalBlur(event: FocusEvent, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  const normalized = input.value.toUpperCase()
  if (input.value !== normalized) {
    input.value = normalized
  }
  commitField(schueler, 'noteQuartal', normalized, index, false)
}

function onFehlstundenBlur(
  event: FocusEvent,
  schueler: EnmSchueler,
  index: number,
  feld: 'fehlstundenFach' | 'fehlstundenUnentschuldigtFach',
): void {
  const input = event.target as HTMLInputElement
  const digitsOnly = input.value.replace(/\D/g, '')
  if (input.value !== digitsOnly) {
    input.value = digitsOnly
  }
  commitField(schueler, feld, digitsOnly, index, false)
}

function onBemerkungBlur(event: FocusEvent, schueler: EnmSchueler, index: number): void {
  const input = event.target as HTMLInputElement
  commitField(schueler, 'fachbezogeneBemerkungen', input.value, index, false)
}

const aktiverFloskelSchueler = computed(() => {
  if (floskelDialog.schuelerId === null) return null
  return schuelerListe.value.find((schueler) => schueler.id === floskelDialog.schuelerId) ?? null
})

function openFloskelDialog(schueler: EnmSchueler, index: number): void {
  floskelDialog.open = true
  floskelDialog.schuelerId = schueler.id
  floskelDialog.index = index
  floskelDialog.value = editValues.get(editKey(schueler.id, 'fachbezogeneBemerkungen'))
    ?? originalFieldValue(schueler, 'fachbezogeneBemerkungen')
}

function closeFloskelDialog(): void {
  floskelDialog.open = false
  floskelDialog.schuelerId = null
  floskelDialog.index = -1
  floskelDialog.value = ''
}

function commitFloskelValue(value: string): void {
  const schueler = aktiverFloskelSchueler.value
  const index = floskelDialog.index
  if (!schueler || index < 0) return

  const input = bemerkungInputs.value[index]
  if (input) input.value = value

  invalidIds.delete(invalidKey(schueler.id, 'fachbezogeneBemerkungen'))
  commitField(schueler, 'fachbezogeneBemerkungen', value, index, false)
}

function applyFloskelDialog(value: string): void {
  if (!aktiverFloskelSchueler.value || floskelDialog.index < 0) return
  commitFloskelValue(value)
  floskelDialog.value = value
}

function navigateFloskelDialog(direction: 'prev' | 'next', entwurf: string): void {
  const schueler = aktiverFloskelSchueler.value
  if (schueler) {
    const saved = editValues.get(editKey(schueler.id, 'fachbezogeneBemerkungen'))
      ?? originalFieldValue(schueler, 'fachbezogeneBemerkungen')
    if (entwurf !== saved) commitFloskelValue(entwurf)
  }

  const newIndex = direction === 'prev' ? floskelDialog.index - 1 : floskelDialog.index + 1
  const newSchueler = schuelerListe.value[newIndex]
  if (!newSchueler) return

  floskelDialog.schuelerId = newSchueler.id
  floskelDialog.index = newIndex
  floskelDialog.value = editValues.get(editKey(newSchueler.id, 'fachbezogeneBemerkungen'))
    ?? originalFieldValue(newSchueler, 'fachbezogeneBemerkungen')
}

function hasAnyRowChange(schueler: EnmSchueler): boolean {
  if (
    hasChange(schueler, 'note')
    || hasChange(schueler, 'noteQuartal')
    || hasChange(schueler, 'fehlstundenFach')
    || hasChange(schueler, 'fehlstundenUnentschuldigtFach')
    || hasChange(schueler, 'fachbezogeneBemerkungen')
  ) return true
  for (const art of teilleistungsartenInLerngruppe.value) {
    if (hasChange(schueler, `teilleistung:${art.id}`)) return true
  }
  return false
}

function setTeilleistungInputRef(el: unknown, si: number, ai: number): void {
  const mapKey = `${si}:${ai}`
  if (el instanceof HTMLInputElement) {
    teilleistungInputEls.set(mapKey, el)
    const schueler = schuelerListe.value[si]
    const art = teilleistungsartenInLerngruppe.value[ai]
    if (schueler && art) {
      const tlFeld: EditField = `teilleistung:${art.id}`
      el.value = editValues.get(editKey(schueler.id, tlFeld)) ?? ''
    }
  } else {
    teilleistungInputEls.set(mapKey, null)
  }
}

function focusTeilleistungAt(si: number, ai: number): void {
  const input = teilleistungInputEls.get(`${si}:${ai}`)
  if (input) {
    input.focus()
    input.select()
  }
}

function onTeilleistungInput(event: Event, schueler: EnmSchueler, si: number, ai: number, artId: number): void {
  const input = event.target as HTMLInputElement
  const upper = input.value.toUpperCase()
  const tlFeld: EditField = `teilleistung:${artId}`
  invalidIds.delete(invalidKey(schueler.id, tlFeld))
  if (NOTES_AUTO_ADVANCE.has(upper)) {
    input.value = upper
    commitField(schueler, tlFeld, upper, si, false)
    nextTick(() => focusTeilleistungAt(si + 1, ai))
  }
}

function onTeilleistungBlur(event: FocusEvent, schueler: EnmSchueler, si: number, artId: number): void {
  const input = event.target as HTMLInputElement
  const normalized = input.value.toUpperCase()
  if (input.value !== normalized) input.value = normalized
  commitField(schueler, `teilleistung:${artId}`, normalized, si, false)
}

function onTeilleistungKeydown(
  event: KeyboardEvent,
  schueler: EnmSchueler,
  si: number,
  ai: number,
  artId: number,
): void {
  const input = event.target as HTMLInputElement
  const tlFeld: EditField = `teilleistung:${artId}`
  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    commitField(schueler, tlFeld, input.value, si, false)
    nextTick(() => focusTeilleistungAt(si + 1, ai))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    commitField(schueler, tlFeld, input.value, si, false)
    nextTick(() => focusTeilleistungAt(si - 1, ai))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    commitField(schueler, tlFeld, input.value, si, false)
    const fields = editableFields.value
    const i = fields.indexOf(tlFeld)
    const next = fields[i + 1]
    if (i >= 0 && next !== undefined) nextTick(() => focusFieldAt(si, next))
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    commitField(schueler, tlFeld, input.value, si, false)
    const fields = editableFields.value
    const i = fields.indexOf(tlFeld)
    const prev = fields[i - 1]
    if (i > 0 && prev !== undefined) nextTick(() => focusFieldAt(si, prev))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    const reverted = editValues.get(editKey(schueler.id, tlFeld)) ?? ''
    input.value = reverted
    invalidIds.delete(invalidKey(schueler.id, tlFeld))
  }
}

// ── Statistiken ────────────────────────────────────────────────────────────

const aenderungsCount = computed(() =>
  schuelerListe.value.filter((s) => hasAnyRowChange(s)).length,
)

// ── Navigation ─────────────────────────────────────────────────────────────

function goBack(): void {
  router.push({ name: 'lerngruppen' })
}

function goSave(): void {
  router.push({ name: 'export' })
}
</script>

<template>
  <main class="noteneingabe">
    <!-- ── Sticky Header ───────────────────────────────────────────────── -->
    <header class="noten-header">
      <button
        class="btn-save"
        type="button"
        @click="goBack"
      >
        Lerngruppen
      </button>

      <div class="noten-header-info">
        <span class="fach-badge">{{ fachKuerzel }}</span>
        <h1 class="noten-titel">
          {{ lerngruppe?.bezeichnung ?? 'Unbekannte Lerngruppe' }}
        </h1>
        <span
          v-if="fachBezeichnung"
          class="fach-bezeichnung"
        >{{ fachBezeichnung }}</span>
        <button
          class="btn-toggle"
          :class="{ 'btn-toggle-active': showFehlstunden }"
          type="button"
          :title="showFehlstunden ? 'Fehlstunden ausblenden' : 'Fehlstunden einblenden'"
          @click="showFehlstunden = !showFehlstunden"
        >
          <svg
            class="toggle-icon"
            viewBox="0 0 36 20"
            width="28"
            height="16"
            aria-hidden="true"
          >
            <rect
              x="0.75"
              y="0.75"
              width="34.5"
              height="18.5"
              rx="9.25"
            />
            <circle
              class="toggle-knob"
              cx="10"
              cy="10"
              r="7"
            />
          </svg>
          Fehlstunden
        </button>
        <button
          v-if="teilleistungsartenInLerngruppe.length > 0"
          class="btn-toggle"
          :class="{ 'btn-toggle-active': showTeilleistungen }"
          type="button"
          :title="showTeilleistungen ? 'Teilleistungen ausblenden' : 'Teilleistungen einblenden'"
          @click="showTeilleistungen = !showTeilleistungen"
        >
          <svg
            class="toggle-icon"
            viewBox="0 0 36 20"
            width="28"
            height="16"
            aria-hidden="true"
          >
            <rect
              x="0.75"
              y="0.75"
              width="34.5"
              height="18.5"
              rx="9.25"
            />
            <circle
              class="toggle-knob"
              cx="10"
              cy="10"
              r="7"
            />
          </svg>
          Teilleistungen
        </button>
      </div>

      <div class="noten-stats">
        <span class="stat">{{ schuelerListe.length }} SuS</span>
        <span
          v-if="aenderungsCount > 0"
          class="stat stat-geaendert"
        >
          {{ aenderungsCount }} geändert
        </span>
        <button
          class="btn-save"
          type="button"
          :disabled="globalChangeCount === 0"
          @click="goSave"
        >
          Speichern
        </button>
      </div>
    </header>

    <!-- ── Fallback: Lerngruppe nicht gefunden ─────────────────────────── -->
    <div
      v-if="!lerngruppe"
      class="kein-inhalt"
    >
      <p>Lerngruppe nicht gefunden.</p>
      <button
        type="button"
        @click="goBack"
      >
        Zurück zur Übersicht
      </button>
    </div>

    <!-- ── Notentabelle ────────────────────────────────────────────────── -->
    <div
      v-else
      class="tabelle-section"
    >
      <div
        class="tabelle-gap"
        aria-hidden="true"
      />

      <div class="tabelle-wrapper">
        <table class="notentabelle">
          <colgroup v-if="!showTeilleistungen">
            <col :style="{ width: `${columnWidths.nr}px` }">
            <col :style="{ width: `${columnWidths.name}px` }">
            <col :style="{ width: `${columnWidths.klasse}px` }">
            <col
              v-if="showFehlstunden"
              :style="{ width: `${columnWidths.fsf}px` }"
            >
            <col
              v-if="showFehlstunden"
              :style="{ width: `${columnWidths.fsu}px` }"
            >
            <col :style="{ width: `${columnWidths.quartal}px` }">
            <col :style="{ width: `${columnWidths.note}px` }">
            <col>
          </colgroup>
          <colgroup v-else>
            <col :style="{ width: `${columnWidths.nr}px` }">
            <col :style="{ width: `${columnWidths.name}px` }">
            <col :style="{ width: `${columnWidths.klasse}px` }">
            <col :style="{ width: `${columnWidths.quartal}px` }">
            <col :style="{ width: `${columnWidths.note}px` }">
            <col
              v-for="art in teilleistungsartenInLerngruppe"
              :key="art.id"
              :style="{ width: `${getTlColumnWidth(art.id)}px` }"
            >
          </colgroup>
          <thead>
            <tr>
              <th class="col-nr is-resizable">
                <span>#</span>
                <button
                  class="col-resizer"
                  type="button"
                  aria-label="Spalte Nummer verbreitern oder verschmälern"
                  @pointerdown="startResize('nr', $event)"
                />
              </th>
              <th class="col-name is-resizable">
                <span>Name</span>
                <button
                  class="col-resizer"
                  type="button"
                  aria-label="Spalte Name verbreitern oder verschmälern"
                  @pointerdown="startResize('name', $event)"
                />
              </th>
              <th class="col-klasse is-resizable">
                <span>Klasse</span>
                <button
                  class="col-resizer"
                  type="button"
                  aria-label="Spalte Klasse verbreitern oder verschmälern"
                  @pointerdown="startResize('klasse', $event)"
                />
              </th>
              <template v-if="!showTeilleistungen">
                <th
                  v-if="showFehlstunden"
                  class="col-fsf is-resizable"
                >
                  <span>FSF</span>
                  <button
                    class="col-resizer"
                    type="button"
                    aria-label="Spalte FSF verbreitern oder verschmälern"
                    @pointerdown="startResize('fsf', $event)"
                  />
                </th>
                <th
                  v-if="showFehlstunden"
                  class="col-fsu is-resizable"
                >
                  <span>FSU</span>
                  <button
                    class="col-resizer"
                    type="button"
                    aria-label="Spalte FSU verbreitern oder verschmälern"
                    @pointerdown="startResize('fsu', $event)"
                  />
                </th>
              </template>
              <th class="col-quartal is-resizable">
                <span>Quartal</span>
                <button
                  class="col-resizer"
                  type="button"
                  aria-label="Spalte Quartal verbreitern oder verschmälern"
                  @pointerdown="startResize('quartal', $event)"
                />
              </th>
              <th class="col-note is-resizable">
                <span>Note</span>
                <button
                  class="col-resizer"
                  type="button"
                  aria-label="Spalte Note verbreitern oder verschmälern"
                  @pointerdown="startResize('note', $event)"
                />
              </th>
              <th
                v-if="!showTeilleistungen"
                class="col-bemerkung"
              >
                <span>Fachbezogene Bemerkung</span>
              </th>
              <template v-if="showTeilleistungen">
                <th
                  v-for="art in teilleistungsartenInLerngruppe"
                  :key="art.id"
                  class="col-teilleistung is-resizable"
                >
                  <span>{{ art.bezeichnung }}</span>
                  <button
                    class="col-resizer"
                    type="button"
                    :aria-label="`Spalte ${art.bezeichnung} verbreitern oder verschmälern`"
                    @pointerdown="startResizeTl(art.id, $event)"
                  />
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(schueler, idx) in schuelerListe"
              :key="schueler.id"
              :class="{
                'zeile-geaendert': hasAnyRowChange(schueler),
                'zeile-focus': focusedRow === idx,
              }"
              @click="onRowClick($event, idx)"
            >
              <td class="col-nr">
                {{ idx + 1 }}
              </td>
              <td class="col-name">
                <span class="name-nachname">{{ schueler.nachname }}</span>,&nbsp;<span
                  class="name-vorname"
                >{{ schueler.vorname }}</span>
              </td>
              <td class="col-klasse">
                {{ klassenById.get(schueler.klasseID) ?? '' }}
              </td>
              <template v-if="!showTeilleistungen">
                <td
                  v-if="showFehlstunden"
                  class="col-fsf"
                >
                  <input
                    :ref="(el) => setFehlstundenFachInputRef(el, idx)"
                    class="absence-input"
                    :class="{
                      'note-invalid': invalidIds.has(invalidKey(schueler.id, 'fehlstundenFach')),
                      'note-geaendert': hasChange(schueler, 'fehlstundenFach'),
                    }"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    :placeholder="originalFieldValue(schueler, 'fehlstundenFach')"
                    @input="onFehlstundenInput($event, schueler, idx, 'fehlstundenFach')"
                    @keydown="onFieldKeydown($event, schueler, idx, 'fehlstundenFach')"
                    @blur="onFehlstundenBlur($event, schueler, idx, 'fehlstundenFach')"
                    @focus="focusedRow = idx"
                  >
                </td>
                <td
                  v-if="showFehlstunden"
                  class="col-fsu"
                >
                  <input
                    :ref="(el) => setFehlstundenUnentschuldigtFachInputRef(el, idx)"
                    class="absence-input"
                    :class="{
                      'note-invalid': invalidIds.has(invalidKey(schueler.id, 'fehlstundenUnentschuldigtFach')),
                      'note-geaendert': hasChange(schueler, 'fehlstundenUnentschuldigtFach'),
                    }"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    :placeholder="originalFieldValue(schueler, 'fehlstundenUnentschuldigtFach')"
                    @input="onFehlstundenInput($event, schueler, idx, 'fehlstundenUnentschuldigtFach')"
                    @keydown="onFieldKeydown($event, schueler, idx, 'fehlstundenUnentschuldigtFach')"
                    @blur="onFehlstundenBlur($event, schueler, idx, 'fehlstundenUnentschuldigtFach')"
                    @focus="focusedRow = idx"
                  >
                </td>
              </template>
              <td class="col-quartal">
                <input
                  :ref="(el) => setQuartalInputRef(el, idx)"
                  class="note-input"
                  :class="{
                    'note-invalid': invalidIds.has(invalidKey(schueler.id, 'noteQuartal')),
                    'note-geaendert': hasChange(schueler, 'noteQuartal'),
                    'note-schlecht': isSchlechteNote(editValues.get(editKey(schueler.id, 'noteQuartal')) ?? ''),
                  }"
                  type="text"
                  maxlength="2"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                  :placeholder="originalFieldValue(schueler, 'noteQuartal')"
                  @input="onQuartalInput($event, schueler, idx)"
                  @keydown="onFieldKeydown($event, schueler, idx, 'noteQuartal')"
                  @blur="onQuartalBlur($event, schueler, idx)"
                  @focus="focusedRow = idx"
                >
              </td>
              <td class="col-note">
                <input
                  :ref="(el) => setNoteInputRef(el, idx)"
                  class="note-input"
                  :class="{
                    'note-invalid': invalidIds.has(invalidKey(schueler.id, 'note')),
                    'note-geaendert': hasChange(schueler, 'note'),
                    'note-schlecht': isSchlechteNote(editValues.get(editKey(schueler.id, 'note')) ?? ''),
                  }"
                  type="text"
                  maxlength="2"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                  :placeholder="originalNote(schueler)"
                  @input="onNoteInput($event, schueler, idx)"
                  @keydown="onFieldKeydown($event, schueler, idx, 'note')"
                  @blur="onNoteBlur($event, schueler, idx)"
                  @focus="focusedRow = idx"
                >
              </td>
              <template v-if="showTeilleistungen">
                <td
                  v-for="(art, ai) in teilleistungsartenInLerngruppe"
                  :key="art.id"
                  class="col-teilleistung"
                >
                  <input
                    :ref="(el) => setTeilleistungInputRef(el, idx, ai)"
                    class="note-input"
                    :class="{
                      'note-invalid': invalidIds.has(invalidKey(schueler.id, `teilleistung:${art.id}`)),
                      'note-geaendert': hasChange(schueler, `teilleistung:${art.id}`),
                      'note-schlecht': isSchlechteNote(editValues.get(editKey(schueler.id, `teilleistung:${art.id}`)) ?? ''),
                    }"
                    type="text"
                    maxlength="2"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    :placeholder="originalFieldValue(schueler, `teilleistung:${art.id}`)"
                    @input="onTeilleistungInput($event, schueler, idx, ai, art.id)"
                    @keydown="onTeilleistungKeydown($event, schueler, idx, ai, art.id)"
                    @blur="onTeilleistungBlur($event, schueler, idx, art.id)"
                    @focus="focusedRow = idx"
                  >
                </td>
              </template>
              <td
                v-if="!showTeilleistungen"
                class="col-bemerkung"
              >
                <div class="bemerkung-field">
                  <input
                    :ref="(el) => setBemerkungInputRef(el, idx)"
                    class="bemerkung-input"
                    :class="{
                      'note-geaendert': hasChange(schueler, 'fachbezogeneBemerkungen'),
                    }"
                    type="text"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    :placeholder="originalFieldValue(schueler, 'fachbezogeneBemerkungen')"
                    @input="onBemerkungInput($event, schueler, idx)"
                    @keydown="onFieldKeydown($event, schueler, idx, 'fachbezogeneBemerkungen')"
                    @blur="onBemerkungBlur($event, schueler, idx)"
                    @focus="focusedRow = idx"
                    @dblclick="openFloskelDialog(schueler, idx)"
                  >
                  <button
                    class="bemerkung-picker-button"
                    type="button"
                    @click="openFloskelDialog(schueler, idx)"
                  >
                    Floskeln
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

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
      </div>
    </div>

    <FloskelPickerDialog
      :open="floskelDialog.open"
      title="Fachbezogene Bemerkung auswählen"
      :model-value="floskelDialog.value"
      :gruppen="floskelgruppen"
      :erlaubte-gruppen="['FACH']"
      :faecher="faecher"
      :jahrgaenge="jahrgaenge"
      :schueler="aktiverFloskelSchueler"
      :fach="fach"
      :klasse-kuerzel="aktiverFloskelSchueler ? klassenById.get(aktiverFloskelSchueler.klasseID) : undefined"
      :has-prev="floskelDialog.index > 0"
      :has-next="floskelDialog.index < schuelerListe.length - 1"
      @close="closeFloskelDialog"
      @apply="applyFloskelDialog"
      @navigate-prev="navigateFloskelDialog('prev', $event)"
      @navigate-next="navigateFloskelDialog('next', $event)"
    />
  </main>
</template>

<style scoped>
.noteneingabe {
  min-height: 100vh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--color-bg);
}

/* ── Header ──────────────────────────────────────────────────────────────── */

.noten-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.5rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-border) 35%, transparent);
  flex-wrap: wrap;
}

.btn-save {
  background-color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  color: var(--color-on-primary);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.btn-save:hover {
  filter: brightness(0.95);
}

.btn-save:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: none;
}

.btn-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: 0.15rem 0.3rem;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  transition: color 0.15s;
}

.btn-toggle:hover {
  color: var(--color-text);
}

.btn-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
  border-radius: 4px;
}

.btn-toggle-active {
  color: var(--color-primary);
}

.toggle-icon rect {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  transition: fill 0.15s, stroke 0.15s;
}

.toggle-icon .toggle-knob {
  fill: currentColor;
  transform: translateX(0);
  transition: transform 0.15s ease, fill 0.15s;
}

.btn-toggle-active .toggle-icon rect {
  fill: currentColor;
}

.btn-toggle-active .toggle-icon .toggle-knob {
  fill: white;
  transform: translateX(16px);
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
  color: var(--color-on-primary);
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
  color: var(--color-success-text);
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

/* ── Tabelle ─────────────────────────────────────────────────────────────── */

.tabelle-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: auto;
  padding: 0 1.5rem;
  background-color: var(--color-bg);
}

.tabelle-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
}

.tabelle-gap {
  height: 1rem;
  flex: 0 0 auto;
  background-color: var(--color-bg);
}

.notentabelle {
  width: 100%;
  min-width: 0;
  max-width: none;
  table-layout: fixed;
  border-collapse: collapse;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.notentabelle thead th {
  position: sticky;
  top: 0;
  z-index: 12;
  background-color: color-mix(in srgb, var(--color-primary) 85%, #000 15%);
  color: var(--color-on-primary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.55rem 1rem 0.55rem 0.75rem;
  text-align: left;
  border-bottom: 2px solid color-mix(in srgb, #000 35%, var(--color-primary));
  box-shadow: inset 0 -1px 0 color-mix(in srgb, #000 30%, transparent);
}

.notentabelle th,
.notentabelle td {
  border-right: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
}

.notentabelle th:last-child,
.notentabelle td:last-child {
  border-right: none;
}

.notentabelle th.is-resizable {
  position: sticky;
}

.col-resizer {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  border: none;
  margin: 0;
  padding: 0;
  cursor: col-resize;
  background: transparent;
  z-index: 20;
}

.col-resizer::before {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background-color: color-mix(in srgb, var(--color-border) 80%, transparent);
}

.col-resizer:hover::before,
.col-resizer:focus-visible::before {
  width: 2px;
  background-color: var(--color-primary);
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
  white-space: nowrap;
}

.name-nachname {
  font-weight: 600;
}
.name-vorname {
  color: var(--color-text-muted);
}

.col-klasse {
  width: 1%;
  white-space: nowrap;
  text-align: left;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.col-note {
  width: 1%;
  white-space: nowrap;
  text-align: left;
}

.col-quartal {
  width: 1%;
  white-space: nowrap;
  text-align: left;
}

.col-fsf,
.col-fsu {
  width: 1%;
  white-space: nowrap;
  text-align: left;
}

.col-teilleistung {
  white-space: nowrap;
  text-align: left;
  overflow: hidden;
}

.col-teilleistung span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-bemerkung {
  min-width: 0;
  width: auto;
  text-align: left;
}

.bemerkung-field {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

/* ── Note-Input ──────────────────────────────────────────────────────────── */

.note-input {
  width: 3.5rem;
  padding: 0.3rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 1rem;
  font-family: 'Noto Sans Mono', 'Courier New', monospace;
  font-weight: 700;
  text-align: left;
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
  color: var(--color-success-text);
}
.note-input.note-geaendert:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.note-input.note-schlecht,
.note-input.note-geaendert.note-schlecht {
  color: var(--color-error-text);
}

.note-input.note-invalid {
  border-color: var(--color-error-border);
  background-color: var(--color-error-bg);
}
.note-input.note-invalid:focus {
  border-color: var(--color-error-border);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-error-border) 18%, transparent);
}

.absence-input {
  width: 3.5rem;
  padding: 0.3rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s, background-color 0.12s;
}

.absence-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.absence-input.note-geaendert {
  border-color: var(--color-success-border);
  background-color: var(--color-success-bg);
  color: var(--color-success-text);
}

.absence-input.note-invalid {
  border-color: var(--color-error-border);
  background-color: var(--color-error-bg);
}

.bemerkung-input {
  flex: 1;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 0.95rem;
  text-align: left;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s, background-color 0.12s;
}

.bemerkung-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.bemerkung-input.note-geaendert {
  border-color: var(--color-success-border);
  background-color: var(--color-success-bg);
  color: var(--color-success-text);
}

.bemerkung-picker-button {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.bemerkung-picker-button:hover,
.bemerkung-picker-button:focus-visible {
  border-color: var(--color-primary);
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
  position: sticky;
  bottom: 0;
  z-index: 15;
  padding: 0.6rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface);
  box-shadow: 0 -2px 10px color-mix(in srgb, var(--color-border) 35%, transparent);
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

@media (max-width: 900px) {
  .bemerkung-field {
    flex-direction: column;
    align-items: stretch;
  }

  .bemerkung-picker-button {
    width: 100%;
  }
}
</style>
