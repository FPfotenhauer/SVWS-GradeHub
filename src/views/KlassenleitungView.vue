<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FloskelPickerDialog from '@/components/FloskelPickerDialog.vue'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'
import type { EnmSchueler } from '@/types/enm'

import type { LeistungsFeld } from '@/types/changes'

type KlassenleitungsFeld =
  | 'fehlstundenGesamt'
  | 'fehlstundenUnentschuldigt'
  | 'lernbereichArbeitslehre'
  | 'lernbereichNaturwissenschaft'
  | 'asv'
  | 'aue'
  | 'zeugnisbemerkung'

type TextFeld = 'asv' | 'aue' | 'zeugnisbemerkung'

const VALID_NOTES = new Set<string>([
  '1+', '1', '1-',
  '2+', '2', '2-',
  '3+', '3', '3-',
  '4+', '4', '4-',
  '5+', '5', '5-',
  '6',
  'AT', 'E1', 'E2', 'E3', 'NT', 'NB', 'NE', 'LM', 'AM',
])

const NOTES_AUTO_ADVANCE = new Set<string>([
  '1+', '1-', '2+', '2-', '3+', '3-', '4+', '4-', '5+', '5-',
  'AT', 'E1', 'E2', 'E3', 'NT', 'NB', 'NE', 'LM', 'AM',
  '6',
])

const route = useRoute()
const router = useRouter()
const enmStore = useENMStore()
const changeStore = useChangeStore()

const klasseId = computed<number>(() => {
  const raw = route.params.klasseId
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(parsed) ? parsed : -1
})

const changeKeyContext = computed<number>(() => -klasseId.value)

const klasse = computed(() => {
  return enmStore.enmDaten?.klassen.find((entry) => entry.id === klasseId.value) ?? null
})

const floskelgruppen = computed(() => enmStore.enmDaten?.floskelgruppen ?? [])
const faecher = computed(() => enmStore.enmDaten?.faecher ?? [])
const jahrgaenge = computed(() => enmStore.enmDaten?.jahrgaenge ?? [])

const schuelerListe = computed(() => {
  return (enmStore.enmDaten?.schueler ?? [])
    .filter((entry) => entry.klasseID === klasseId.value)
    .sort((a, b) => {
      const cmp = a.nachname.localeCompare(b.nachname, 'de')
      return cmp !== 0 ? cmp : a.vorname.localeCompare(b.vorname, 'de')
    })
})

type KlassenSchueler = (typeof schuelerListe.value)[number]

const lehrerKuerzel = computed<string>(() => {
  const enmDaten = enmStore.enmDaten
  if (!enmDaten) return ''

  const raw = enmDaten.lehrerID
  let lehrerId: number | null = null

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    lehrerId = raw
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isNaN(parsed)) {
      lehrerId = parsed
    }
  } else if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const maybeId = (raw as Record<string, unknown>).id
    if (typeof maybeId === 'number') {
      lehrerId = maybeId
    }
  }

  if (lehrerId === null) return ''
  return enmDaten.lehrer.find((entry) => entry.id === lehrerId)?.kuerzel ?? ''
})

const editValues = reactive(new Map<string, string>())
const invalidIds = reactive(new Set<string>())

const fehlstundenGesamtInputs = ref<(HTMLInputElement | null)[]>([])
const fehlstundenUnentschuldigtInputs = ref<(HTMLInputElement | null)[]>([])
const lernbereichArbeitslehreInputs = ref<(HTMLInputElement | null)[]>([])
const lernbereichNaturwissenschaftInputs = ref<(HTMLInputElement | null)[]>([])
const asvInputs = ref<(HTMLInputElement | null)[]>([])
const aueInputs = ref<(HTMLInputElement | null)[]>([])
const zeugnisbemerkungInputs = ref<(HTMLInputElement | null)[]>([])

function valueKey(schuelerId: number, feld: KlassenleitungsFeld): string {
  return `${schuelerId}:${feld}`
}

function invalidKey(schuelerId: number, feld: KlassenleitungsFeld): string {
  return valueKey(schuelerId, feld)
}

function originalFieldValue(schueler: KlassenSchueler, feld: KlassenleitungsFeld): string {
  if (feld === 'fehlstundenGesamt') {
    return String(schueler.lernabschnitt.fehlstundenGesamt ?? 0)
  }

  if (feld === 'fehlstundenUnentschuldigt') {
    return String(schueler.lernabschnitt.fehlstundenGesamtUnentschuldigt ?? 0)
  }

  if (feld === 'lernbereichArbeitslehre') {
    return schueler.lernabschnitt.lernbereich1note ?? ''
  }

  if (feld === 'lernbereichNaturwissenschaft') {
    return schueler.lernabschnitt.lernbereich2note ?? ''
  }

  if (feld === 'asv') {
    return schueler.bemerkungen.ASV ?? ''
  }

  if (feld === 'aue') {
    return schueler.bemerkungen.AUE ?? ''
  }

  return schueler.bemerkungen.ZB ?? ''
}

function resolveTimestamp(schueler: KlassenSchueler, feld: KlassenleitungsFeld): string {
  if (feld === 'fehlstundenGesamt') {
    return schueler.lernabschnitt.tsFehlstundenGesamt ?? ''
  }

  if (feld === 'fehlstundenUnentschuldigt') {
    return schueler.lernabschnitt.tsFehlstundenGesamtUnentschuldigt ?? ''
  }

  if (feld === 'asv') {
    return schueler.bemerkungen.tsASV ?? ''
  }

  if (feld === 'aue') {
    return schueler.bemerkungen.tsAUE ?? ''
  }

  if (feld === 'zeugnisbemerkung') {
    return schueler.bemerkungen.tsZB ?? ''
  }

  return ''
}

function normalizeValue(feld: KlassenleitungsFeld, raw: string): string {
  if (feld === 'fehlstundenGesamt' || feld === 'fehlstundenUnentschuldigt') {
    return raw.replace(/\D/g, '')
  }

  if (feld === 'lernbereichArbeitslehre' || feld === 'lernbereichNaturwissenschaft') {
    return raw.trim().toUpperCase()
  }

  return raw
}

function isValidValue(feld: KlassenleitungsFeld, value: string): boolean {
  if (value === '') return true

  if (feld === 'fehlstundenGesamt' || feld === 'fehlstundenUnentschuldigt') {
    return /^\d+$/.test(value)
  }

  if (feld === 'lernbereichArbeitslehre' || feld === 'lernbereichNaturwissenschaft') {
    return VALID_NOTES.has(value)
  }

  return true
}

function parseNumericValue(value: string): number {
  if (value.trim() === '') {
    return 0
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function isLernbereichFeld(
  feld: KlassenleitungsFeld,
): feld is 'lernbereichArbeitslehre' | 'lernbereichNaturwissenschaft' {
  return feld === 'lernbereichArbeitslehre' || feld === 'lernbereichNaturwissenschaft'
}

function isValidNotePrefix(value: string): boolean {
  if (value === '') return true
  for (const note of VALID_NOTES) {
    if (note.startsWith(value)) {
      return true
    }
  }
  return false
}

function getCurrentValue(schueler: KlassenSchueler, feld: KlassenleitungsFeld): string {
  const current = editValues.get(valueKey(schueler.id, feld)) ?? originalFieldValue(schueler, feld)

  if ((feld === 'fehlstundenGesamt' || feld === 'fehlstundenUnentschuldigt') && current === 'null') {
    return '0'
  }

  return current
}

function getInputRefs(feld: KlassenleitungsFeld): (HTMLInputElement | null)[] {
  if (feld === 'fehlstundenGesamt') return fehlstundenGesamtInputs.value
  if (feld === 'fehlstundenUnentschuldigt') return fehlstundenUnentschuldigtInputs.value
  if (feld === 'lernbereichArbeitslehre') return lernbereichArbeitslehreInputs.value
  if (feld === 'lernbereichNaturwissenschaft') return lernbereichNaturwissenschaftInputs.value
  if (feld === 'asv') return asvInputs.value
  if (feld === 'aue') return aueInputs.value
  return zeugnisbemerkungInputs.value
}

function setInputRef(
  el: unknown,
  index: number,
  schueler: KlassenSchueler,
  feld: KlassenleitungsFeld,
): void {
  const refs = getInputRefs(feld)
  refs[index] = el instanceof HTMLInputElement ? el : null

  if (el instanceof HTMLInputElement) {
    const value = getCurrentValue(schueler, feld)
    if (el.value !== value) {
      el.value = value
    }
  }
}

function focusFieldAt(index: number, feld: KlassenleitungsFeld): void {
  if (index < 0 || index >= schuelerListe.value.length) {
    return
  }

  const input = getInputRefs(feld)[index]
  if (input) {
    input.focus()
    input.select()
  }
}

function hasChange(schueler: KlassenSchueler, feld: KlassenleitungsFeld): boolean {
  return changeStore.getChange(schueler.id, changeKeyContext.value, feld as LeistungsFeld) !== undefined
}

function commitField(schueler: KlassenSchueler, feld: KlassenleitungsFeld, rawValue: string): boolean {
  const normalized = normalizeValue(feld, rawValue)
  const key = valueKey(schueler.id, feld)
  const invalid = invalidKey(schueler.id, feld)

  if (!isValidValue(feld, normalized)) {
    invalidIds.add(invalid)
    return false
  }

  if (feld === 'fehlstundenUnentschuldigt') {
    const fsg = parseNumericValue(getCurrentValue(schueler, 'fehlstundenGesamt'))
    const fsu = parseNumericValue(normalized)
    if (fsu > fsg) {
      invalidIds.add(invalid)
      return false
    }
  }

  if (feld === 'fehlstundenGesamt') {
    const fsu = parseNumericValue(getCurrentValue(schueler, 'fehlstundenUnentschuldigt'))
    const fsg = parseNumericValue(normalized)
    if (fsu > fsg) {
      invalidIds.add(invalid)
      return false
    }
  }

  editValues.set(key, normalized)
  invalidIds.delete(invalid)

  changeStore.setChange({
    schuelerId: schueler.id,
    lerngruppenId: changeKeyContext.value,
    feld: feld as LeistungsFeld,
    alterWert: originalFieldValue(schueler, feld) || null,
    neuerWert: normalized === '' ? null : normalized,
    geaendertAm: new Date().toISOString(),
    geaendertVon: lehrerKuerzel.value,
    enmBasisTimestamp: resolveTimestamp(schueler, feld),
  })

  return true
}

function onInput(event: Event, schueler: KlassenSchueler, feld: KlassenleitungsFeld): void {
  const input = event.target as HTMLInputElement
  const normalized = normalizeValue(feld, input.value)
  if (input.value !== normalized) {
    input.value = normalized
  }
  if (!commitField(schueler, feld, normalized)) {
    input.value = getCurrentValue(schueler, feld)
  }
}

function onLernbereichInput(
  event: Event,
  schueler: KlassenSchueler,
  index: number,
  feld: 'lernbereichArbeitslehre' | 'lernbereichNaturwissenschaft',
): void {
  const input = event.target as HTMLInputElement
  const normalized = normalizeValue(feld, input.value)
  const current = getCurrentValue(schueler, feld)

  if (!isValidNotePrefix(normalized)) {
    input.value = current
    invalidIds.delete(invalidKey(schueler.id, feld))
    return
  }

  if (input.value !== normalized) {
    input.value = normalized
  }

  invalidIds.delete(invalidKey(schueler.id, feld))

  if (NOTES_AUTO_ADVANCE.has(normalized)) {
    if (commitField(schueler, feld, normalized)) {
      nextTick(() => focusFieldAt(index + 1, feld))
    } else {
      input.value = getCurrentValue(schueler, feld)
    }
  }
}

function onBlur(event: FocusEvent, schueler: KlassenSchueler, feld: KlassenleitungsFeld): void {
  const input = event.target as HTMLInputElement
  const normalized = normalizeValue(feld, input.value)

  if (isLernbereichFeld(feld) && normalized !== '' && !VALID_NOTES.has(normalized)) {
    input.value = getCurrentValue(schueler, feld)
    invalidIds.delete(invalidKey(schueler.id, feld))
    return
  }

  if (input.value !== normalized) {
    input.value = normalized
  }
  if (!commitField(schueler, feld, normalized)) {
    input.value = getCurrentValue(schueler, feld)
  }
}

function onFieldKeydown(
  event: KeyboardEvent,
  schueler: KlassenSchueler,
  index: number,
  feld: KlassenleitungsFeld,
): void {
  const input = event.target as HTMLInputElement

  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    const normalized = normalizeValue(feld, input.value)

    if (isLernbereichFeld(feld) && normalized !== '' && !VALID_NOTES.has(normalized)) {
      input.value = getCurrentValue(schueler, feld)
      invalidIds.delete(invalidKey(schueler.id, feld))
      return
    }

    if (input.value !== normalized) {
      input.value = normalized
    }
    if (commitField(schueler, feld, normalized)) {
      nextTick(() => focusFieldAt(index + 1, feld))
    } else {
      input.value = getCurrentValue(schueler, feld)
    }
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    const normalized = normalizeValue(feld, input.value)

    if (isLernbereichFeld(feld) && normalized !== '' && !VALID_NOTES.has(normalized)) {
      input.value = getCurrentValue(schueler, feld)
      invalidIds.delete(invalidKey(schueler.id, feld))
      return
    }

    if (input.value !== normalized) {
      input.value = normalized
    }
    if (commitField(schueler, feld, normalized)) {
      nextTick(() => focusFieldAt(index - 1, feld))
    } else {
      input.value = getCurrentValue(schueler, feld)
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    const reverted = getCurrentValue(schueler, feld)
    input.value = reverted
    invalidIds.delete(invalidKey(schueler.id, feld))
  }
}

const textDialog = reactive<{
  open: boolean
  schuelerId: number | null
  rowIndex: number
  feld: TextFeld
  value: string
}>({
  open: false,
  schuelerId: null,
  rowIndex: -1,
  feld: 'asv',
  value: '',
})

const aktiverDialogSchueler = computed(() => {
  if (textDialog.schuelerId === null) return null
  return schuelerListe.value.find((entry) => entry.id === textDialog.schuelerId) ?? null
})

const aktiverDialogSchuelerForDialog = computed<EnmSchueler | null>(() => {
  return aktiverDialogSchueler.value as unknown as EnmSchueler | null
})

const dialogTitel = computed<string>(() => {
  if (textDialog.feld === 'asv') return 'Arbeits- und Sozialverhalten'
  if (textDialog.feld === 'aue') return 'Außerunterrichtliches Engagement'
  return 'Zeugnisbemerkung'
})

const dialogErlaubteGruppen = computed<readonly string[]>(() => {
  if (textDialog.feld === 'asv') return ['ASV']
  if (textDialog.feld === 'aue') return ['AUE']
  return ['ZB']
})

function openTextDialog(schueler: KlassenSchueler, rowIndex: number, feld: TextFeld): void {
  textDialog.open = true
  textDialog.schuelerId = schueler.id
  textDialog.rowIndex = rowIndex
  textDialog.feld = feld
  textDialog.value = getCurrentValue(schueler, feld)
}

function closeTextDialog(): void {
  textDialog.open = false
  textDialog.schuelerId = null
  textDialog.rowIndex = -1
  textDialog.feld = 'asv'
  textDialog.value = ''
}

function applyTextDialog(value: string): void {
  const schueler = aktiverDialogSchueler.value
  if (!schueler) {
    closeTextDialog()
    return
  }

  commitField(schueler, textDialog.feld, value)
  closeTextDialog()
}

const rowChangeCount = computed<number>(() => {
  return schuelerListe.value.filter((schueler) => {
    return (
      hasChange(schueler, 'fehlstundenGesamt')
      || hasChange(schueler, 'fehlstundenUnentschuldigt')
      || hasChange(schueler, 'lernbereichArbeitslehre')
      || hasChange(schueler, 'lernbereichNaturwissenschaft')
      || hasChange(schueler, 'asv')
      || hasChange(schueler, 'aue')
      || hasChange(schueler, 'zeugnisbemerkung')
    )
  }).length
})

function goBack(): void {
  router.push({ name: 'lerngruppen' })
}

function goSave(): void {
  router.push({ name: 'export' })
}
</script>

<template>
  <main class="klassenleitung-view">
    <header class="page-header">
      <button class="btn secondary" type="button" @click="goBack">Lerngruppen</button>
      <div class="title-wrap">
        <h1>Klassenleitung {{ klasse?.kuerzelAnzeige || klasse?.kuerzel || '' }}</h1>
        <p class="subtitle">
          {{ schuelerListe.length }} SuS, {{ rowChangeCount }} Zeilen mit Änderungen
        </p>
      </div>
      <button class="btn primary" type="button" :disabled="rowChangeCount === 0" @click="goSave">
        Speichern
      </button>
    </header>

    <section v-if="!klasse" class="card">
      <p>Klasse nicht gefunden.</p>
      <button class="btn secondary" type="button" @click="goBack">Zurück</button>
    </section>

    <section v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th title="Fehlstunden gesamt">FSG</th>
            <th title="Fehlstunden unentschuldigt">FSU</th>
            <th title="Lernbereichsnote Arbeitslehre">AL</th>
            <th title="Lernbereichsnote Naturwissenschaft">NW</th>
            <th title="Arbeits- und Sozialverhalten">ASV</th>
            <th title="Außerunterrichtliches Engagement">AUE</th>
            <th title="Zeugnisbemerkungen">ZB</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(schueler, idx) in schuelerListe"
            :key="schueler.id"
            :class="{
              changed:
                hasChange(schueler, 'fehlstundenGesamt')
                || hasChange(schueler, 'fehlstundenUnentschuldigt')
                || hasChange(schueler, 'lernbereichArbeitslehre')
                || hasChange(schueler, 'lernbereichNaturwissenschaft')
                || hasChange(schueler, 'asv')
                || hasChange(schueler, 'aue')
                || hasChange(schueler, 'zeugnisbemerkung'),
            }"
          >
            <td class="nr">{{ idx + 1 }}</td>
            <td class="name">{{ schueler.nachname }}, {{ schueler.vorname }}</td>
            <td>
              <input
                class="input number"
                :class="{ invalid: invalidIds.has(invalidKey(schueler.id, 'fehlstundenGesamt')), edited: hasChange(schueler, 'fehlstundenGesamt') }"
                type="text"
                inputmode="numeric"
                :value="getCurrentValue(schueler, 'fehlstundenGesamt')"
                :ref="(el) => setInputRef(el, idx, schueler, 'fehlstundenGesamt')"
                @input="onInput($event, schueler, 'fehlstundenGesamt')"
                @keydown="onFieldKeydown($event, schueler, idx, 'fehlstundenGesamt')"
                @blur="onBlur($event, schueler, 'fehlstundenGesamt')"
              />
            </td>
            <td>
              <input
                class="input number"
                :class="{ invalid: invalidIds.has(invalidKey(schueler.id, 'fehlstundenUnentschuldigt')), edited: hasChange(schueler, 'fehlstundenUnentschuldigt') }"
                type="text"
                inputmode="numeric"
                :value="getCurrentValue(schueler, 'fehlstundenUnentschuldigt')"
                :ref="(el) => setInputRef(el, idx, schueler, 'fehlstundenUnentschuldigt')"
                @input="onInput($event, schueler, 'fehlstundenUnentschuldigt')"
                @keydown="onFieldKeydown($event, schueler, idx, 'fehlstundenUnentschuldigt')"
                @blur="onBlur($event, schueler, 'fehlstundenUnentschuldigt')"
              />
            </td>
            <td>
              <input
                class="input note"
                :class="{ invalid: invalidIds.has(invalidKey(schueler.id, 'lernbereichArbeitslehre')), edited: hasChange(schueler, 'lernbereichArbeitslehre') }"
                type="text"
                maxlength="2"
                :value="getCurrentValue(schueler, 'lernbereichArbeitslehre')"
                :ref="(el) => setInputRef(el, idx, schueler, 'lernbereichArbeitslehre')"
                @input="onLernbereichInput($event, schueler, idx, 'lernbereichArbeitslehre')"
                @keydown="onFieldKeydown($event, schueler, idx, 'lernbereichArbeitslehre')"
                @blur="onBlur($event, schueler, 'lernbereichArbeitslehre')"
              />
            </td>
            <td>
              <input
                class="input note"
                :class="{ invalid: invalidIds.has(invalidKey(schueler.id, 'lernbereichNaturwissenschaft')), edited: hasChange(schueler, 'lernbereichNaturwissenschaft') }"
                type="text"
                maxlength="2"
                :value="getCurrentValue(schueler, 'lernbereichNaturwissenschaft')"
                :ref="(el) => setInputRef(el, idx, schueler, 'lernbereichNaturwissenschaft')"
                @input="onLernbereichInput($event, schueler, idx, 'lernbereichNaturwissenschaft')"
                @keydown="onFieldKeydown($event, schueler, idx, 'lernbereichNaturwissenschaft')"
                @blur="onBlur($event, schueler, 'lernbereichNaturwissenschaft')"
              />
            </td>
            <td>
              <input
                class="input text"
                :class="{ edited: hasChange(schueler, 'asv') }"
                type="text"
                :value="getCurrentValue(schueler, 'asv')"
                :ref="(el) => setInputRef(el, idx, schueler, 'asv')"
                @dblclick="openTextDialog(schueler, idx, 'asv')"
                @input="onInput($event, schueler, 'asv')"
                @keydown="onFieldKeydown($event, schueler, idx, 'asv')"
                @blur="onBlur($event, schueler, 'asv')"
              />
            </td>
            <td>
              <input
                class="input text"
                :class="{ edited: hasChange(schueler, 'aue') }"
                type="text"
                :value="getCurrentValue(schueler, 'aue')"
                :ref="(el) => setInputRef(el, idx, schueler, 'aue')"
                @dblclick="openTextDialog(schueler, idx, 'aue')"
                @input="onInput($event, schueler, 'aue')"
                @keydown="onFieldKeydown($event, schueler, idx, 'aue')"
                @blur="onBlur($event, schueler, 'aue')"
              />
            </td>
            <td>
              <input
                class="input text"
                :class="{ edited: hasChange(schueler, 'zeugnisbemerkung') }"
                type="text"
                :value="getCurrentValue(schueler, 'zeugnisbemerkung')"
                :ref="(el) => setInputRef(el, idx, schueler, 'zeugnisbemerkung')"
                @dblclick="openTextDialog(schueler, idx, 'zeugnisbemerkung')"
                @input="onInput($event, schueler, 'zeugnisbemerkung')"
                @keydown="onFieldKeydown($event, schueler, idx, 'zeugnisbemerkung')"
                @blur="onBlur($event, schueler, 'zeugnisbemerkung')"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <FloskelPickerDialog
      :open="textDialog.open"
      :title="dialogTitel"
      :model-value="textDialog.value"
      :gruppen="floskelgruppen"
      :erlaubte-gruppen="dialogErlaubteGruppen"
      :faecher="faecher"
      :jahrgaenge="jahrgaenge"
      :schueler="aktiverDialogSchuelerForDialog"
      :fach="null"
      @close="closeTextDialog"
      @apply="applyTextDialog"
    />
  </main>
</template>

<style scoped>
.klassenleitung-view {
  max-width: 92rem;
  margin: 0 auto;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
  flex-wrap: wrap;
}

.title-wrap h1 {
  margin: 0;
  font-size: 1.15rem;
}

.subtitle {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.btn {
  font: inherit;
  padding: 0.4rem 0.8rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  cursor: pointer;
}

.btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.btn.secondary {
  background: var(--color-surface);
  color: var(--color-text);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card {
  padding: 1rem;
  border-radius: 0.6rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.table-wrap {
  max-height: calc(100vh - 10.5rem);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-surface);
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 70rem;
}

th,
td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.45rem 0.55rem;
  text-align: left;
  vertical-align: middle;
}

th {
  position: sticky;
  top: 0;
  z-index: 12;
  background-color: color-mix(in srgb, var(--color-primary) 85%, #000 15%);
  color: #ffffff;
  border-bottom: 2px solid color-mix(in srgb, #000 35%, var(--color-primary));
  font-size: 0.95rem;
}

.nr {
  width: 4rem;
}

.name {
  min-width: 14rem;
}

.input {
  width: 100%;
  font: inherit;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  padding: 0.25rem 0.35rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.input.number,
.input.note {
  text-align: center;
}

.input.invalid {
  border-color: var(--color-error-border);
  background: color-mix(in srgb, var(--color-error-bg) 65%, var(--color-bg));
}

.input.edited {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
}

tr.changed {
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}
</style>
