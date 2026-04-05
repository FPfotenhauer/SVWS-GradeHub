<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { EnmFach, EnmFloskel, EnmFloskelgruppe, EnmSchueler } from '@/types/enm'

interface Props {
  open: boolean
  title: string
  modelValue: string
  gruppen: readonly EnmFloskelgruppe[]
  erlaubteGruppen: readonly string[]
  faecher: readonly EnmFach[]
  schueler: EnmSchueler | null
  fach: EnmFach | null
}

interface FloskelListItem {
  id: string
  gruppeKuerzel: string
  gruppeBezeichnung: string
  floskel: EnmFloskel
  textGerendert: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  apply: [value: string]
}>()

const searchInput = ref<HTMLInputElement | null>(null)
const suchbegriff = ref('')
const entwurf = ref('')
const aktiveGruppe = ref<string>('alle')
const aktivesFach = ref<string>('alle')
const ausgewaehlteFloskelId = ref<string>('')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveGenderSuffix(schueler: EnmSchueler | null): string {
  return schueler?.geschlecht === 'w' ? 'in' : ''
}

function resolveEinSuffix(schueler: EnmSchueler | null): string {
  return schueler?.geschlecht === 'w' ? 'in' : 'e'
}

function resolvePronoun(schueler: EnmSchueler | null): string {
  return schueler?.geschlecht === 'w' ? 'ihr' : 'sein'
}

function resolvePossessivePronoun(schueler: EnmSchueler | null): string {
  return schueler?.geschlecht === 'w' ? 'ihre' : 'seine'
}

function renderFloskelText(text: string): string {
  const vorname = props.schueler?.vorname ?? ''
  const nachname = props.schueler?.nachname ?? ''
  const replacements: Array<[string, string]> = [
    ['$Vorname$', vorname],
    ['$VORNAME$', vorname.toUpperCase()],
    ['$Nachname$', nachname],
    ['$NACHNAME$', nachname.toUpperCase()],
    ['$WEIBL$', resolveGenderSuffix(props.schueler)],
    ['$SEINIHR$', resolvePronoun(props.schueler)],
    ['$ANREDE$', resolvePossessivePronoun(props.schueler)],
    ['$Ein$', resolveEinSuffix(props.schueler)],
    ['$EIN$', resolveEinSuffix(props.schueler)],
  ]

  return replacements.reduce((current, [token, replacement]) => {
    return current.replace(new RegExp(escapeRegExp(token), 'g'), replacement)
  }, text)
}

function concatText(base: string, addition: string): string {
  const trimmedBase = base.trim()
  const trimmedAddition = addition.trim()

  if (!trimmedBase) return trimmedAddition
  if (!trimmedAddition) return trimmedBase
  if (/[\s\n]$/.test(base)) return `${base}${trimmedAddition}`
  return `${trimmedBase} ${trimmedAddition}`
}

const erlaubteGruppenSet = computed(() => {
  const werte = new Set<string>(['ALLG'])
  for (const gruppe of props.erlaubteGruppen) {
    werte.add(gruppe)
  }
  return werte
})

const gruppenBasis = computed(() => {
  return props.gruppen.filter((gruppe) => {
    return erlaubteGruppenSet.value.has(gruppe.kuerzel) || erlaubteGruppenSet.value.has(gruppe.hauptgruppe)
  })
})

const fachOptionen = computed(() => {
  const ids = new Set<number>()

  for (const gruppe of gruppenBasis.value) {
    for (const floskel of gruppe.floskeln) {
      if (floskel.fachID !== null) {
        ids.add(floskel.fachID)
      }
    }
  }

  return props.faecher
    .filter((fach) => ids.has(fach.id))
    .sort((a, b) => a.sortierung - b.sortierung)
    .map((fach) => ({
      id: String(fach.id),
      label: fach.kuerzelAnzeige || fach.kuerzel,
      beschreibung: fach.bezeichnung ?? '',
    }))
})

const verfuegbareGruppen = computed(() => {
  const jahrgangId = props.schueler?.jahrgangID ?? null
  const fachFilterId = aktivesFach.value === 'alle' ? null : Number(aktivesFach.value)

  return gruppenBasis.value
    .map((gruppe) => {
      const floskeln = gruppe.floskeln.filter((floskel) => {
        const fachPassend = fachFilterId === null
          ? true
          : floskel.fachID === fachFilterId
        const jahrgangPassend = floskel.jahrgangID === null || jahrgangId === null || floskel.jahrgangID === jahrgangId
        return fachPassend && jahrgangPassend
      })
      return {
        ...gruppe,
        floskeln,
      }
    })
    .filter((gruppe) => gruppe.floskeln.length > 0)
})

const gruppenMitZaehlern = computed(() => {
  return verfuegbareGruppen.value.map((gruppe) => ({
    kuerzel: gruppe.kuerzel,
    bezeichnung: gruppe.bezeichnung,
    anzahl: gruppe.floskeln.length,
  }))
})

const gefilterteFloskeln = computed<FloskelListItem[]>(() => {
  const needle = suchbegriff.value.trim().toLocaleLowerCase('de')

  return verfuegbareGruppen.value.flatMap((gruppe) => {
    if (aktiveGruppe.value !== 'alle' && aktiveGruppe.value !== gruppe.kuerzel) {
      return []
    }

    return gruppe.floskeln
      .map((floskel) => {
        const textGerendert = renderFloskelText(floskel.text)
        return {
          id: `${gruppe.kuerzel}:${floskel.kuerzel}`,
          gruppeKuerzel: gruppe.kuerzel,
          gruppeBezeichnung: gruppe.bezeichnung,
          floskel,
          textGerendert,
        }
      })
      .filter((item) => {
        if (!needle) return true
        const haystack = `${item.floskel.kuerzel} ${item.floskel.text} ${item.textGerendert}`.toLocaleLowerCase('de')
        return haystack.includes(needle)
      })
  })
})

const ausgewaehlteFloskel = computed(() => {
  return gefilterteFloskeln.value.find((item) => item.id === ausgewaehlteFloskelId.value)
    ?? gefilterteFloskeln.value[0]
    ?? null
})

const initialeGruppe = computed<string>(() => {
  return props.erlaubteGruppen[0] ?? 'alle'
})

const initialesFach = computed<string>(() => {
  const aktuellesFachId = props.fach ? String(props.fach.id) : 'alle'
  if (fachOptionen.value.some((fach) => fach.id === aktuellesFachId)) {
    return aktuellesFachId
  }
  return 'alle'
})

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return

  suchbegriff.value = ''
  aktiveGruppe.value = initialeGruppe.value
  aktivesFach.value = initialesFach.value
  entwurf.value = props.modelValue
  ausgewaehlteFloskelId.value = gefilterteFloskeln.value[0]?.id ?? ''

  await nextTick()
  searchInput.value?.focus()
})

watch(() => props.modelValue, (value) => {
  if (props.open) {
    entwurf.value = value
  }
})

watch(gefilterteFloskeln, (items) => {
  if (!items.some((item) => item.id === ausgewaehlteFloskelId.value)) {
    ausgewaehlteFloskelId.value = items[0]?.id ?? ''
  }
})

function waehleFloskel(id: string): void {
  ausgewaehlteFloskelId.value = id
}

function fuegeFloskelEin(item: FloskelListItem): void {
  entwurf.value = concatText(entwurf.value, item.textGerendert)
  ausgewaehlteFloskelId.value = item.id
}

function uebernehmen(): void {
  emit('apply', entwurf.value)
}

function schliessen(): void {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="floskel-overlay" @click.self="schliessen">
      <section class="floskel-dialog" aria-modal="true" role="dialog">
        <header class="floskel-header">
          <div>
            <p class="floskel-kicker">Textbausteine</p>
            <h2 class="floskel-title">{{ title }}</h2>
            <p class="floskel-subtitle">
              Allgemeine Floskeln und passende Bereichs-Floskeln stehen gemeinsam zur Auswahl. Doppelklick fügt den Text ein.
            </p>
          </div>

          <button class="floskel-close" type="button" aria-label="Floskelauswahl schliessen" @click="schliessen">
            Schliessen
          </button>
        </header>

        <div class="floskel-toolbar">
          <label class="floskel-search">
            <span>Filtern</span>
            <input
              ref="searchInput"
              v-model="suchbegriff"
              type="search"
              placeholder="Nach Kürzel oder Text suchen"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <div class="floskel-groups" role="tablist" aria-label="Floskelgruppen">
            <button
              class="floskel-chip"
              :class="{ 'is-active': aktiveGruppe === 'alle' }"
              type="button"
              @click="aktiveGruppe = 'alle'"
            >
              Alle
            </button>
            <button
              v-for="gruppe in gruppenMitZaehlern"
              :key="gruppe.kuerzel"
              class="floskel-chip"
              :class="{ 'is-active': aktiveGruppe === gruppe.kuerzel }"
              type="button"
              @click="aktiveGruppe = gruppe.kuerzel"
            >
              {{ gruppe.bezeichnung }}
              <span>{{ gruppe.anzahl }}</span>
            </button>
          </div>

          <label v-if="fachOptionen.length > 0" class="floskel-fachfilter">
            <span>Fach</span>
            <select v-model="aktivesFach">
              <option value="alle">Alle Fächer</option>
              <option
                v-for="fachOption in fachOptionen"
                :key="fachOption.id"
                :value="fachOption.id"
              >
                {{ fachOption.label }}<template v-if="fachOption.beschreibung"> - {{ fachOption.beschreibung }}</template>
              </option>
            </select>
          </label>
        </div>

        <div class="floskel-layout">
          <div class="floskel-list-column">
            <p v-if="gefilterteFloskeln.length === 0" class="floskel-empty">
              Keine Floskeln passen zum aktuellen Filter.
            </p>

            <ul v-else class="floskel-list">
              <li v-for="item in gefilterteFloskeln" :key="item.id">
                <article
                  class="floskel-card"
                  :class="{ 'is-selected': ausgewaehlteFloskel?.id === item.id }"
                  @click="waehleFloskel(item.id)"
                  @dblclick="fuegeFloskelEin(item)"
                >
                  <div class="floskel-card-meta">
                    <span class="floskel-card-group">{{ item.gruppeBezeichnung }}</span>
                    <span class="floskel-card-code">{{ item.floskel.kuerzel }}</span>
                  </div>
                  <p class="floskel-card-text">{{ item.textGerendert }}</p>
                </article>
              </li>
            </ul>
          </div>

          <aside class="floskel-preview-column">
            <label class="floskel-editor">
              <span>Zieltext</span>
              <textarea
                v-model="entwurf"
                rows="10"
                placeholder="Text eingeben oder Floskeln übernehmen"
              />
            </label>

            <div v-if="ausgewaehlteFloskel" class="floskel-preview">
              <div class="floskel-preview-meta">
                <span>{{ ausgewaehlteFloskel.gruppeBezeichnung }}</span>
                <strong>{{ ausgewaehlteFloskel.floskel.kuerzel }}</strong>
              </div>
              <p>{{ ausgewaehlteFloskel.textGerendert }}</p>
            </div>
          </aside>
        </div>

        <footer class="floskel-footer">
          <button class="secondary" type="button" @click="schliessen">Abbrechen</button>
          <button type="button" @click="uebernehmen">Übernehmen</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.floskel-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--color-bg) 38%, rgba(8, 14, 28, 0.72));
  backdrop-filter: blur(8px);
}

.floskel-dialog {
  width: min(1520px, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, white 4%), var(--color-surface));
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.26);
}

.floskel-header,
.floskel-toolbar,
.floskel-footer {
  padding: 1.25rem 1.5rem;
}

.floskel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.floskel-kicker {
  margin: 0 0 0.2rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.floskel-title {
  margin: 0;
  font-size: 1.35rem;
}

.floskel-subtitle {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
}

.floskel-close,
.floskel-footer button,
.floskel-chip {
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background: color-mix(in srgb, var(--color-surface) 92%, white 8%);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.floskel-chip {
  border-radius: 999px;
}

.floskel-close,
.floskel-footer button {
  border-radius: 6px;
  align-self: flex-start;
  padding: 0.42rem 0.7rem;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.2;
}

.floskel-close:hover,
.floskel-footer button:hover,
.floskel-chip:hover {
  border-color: var(--color-primary);
}

.floskel-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  border-bottom: 1px solid var(--color-border);
}

.floskel-search {
  flex: 0 1 300px;
  min-width: 220px;
  display: grid;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.floskel-fachfilter {
  flex: 0 1 240px;
  min-width: 180px;
  margin-left: auto;
  display: grid;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.floskel-groups {
  flex: 1 1 auto;
  min-width: 240px;
}

.floskel-search input,
.floskel-fachfilter select,
.floskel-editor textarea {
  width: 100%;
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface) 96%, white 4%);
  color: var(--color-text);
  font: inherit;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.floskel-search input {
  padding: 0.8rem 0.95rem;
}

.floskel-fachfilter select {
  padding: 0.8rem 0.95rem;
}

.floskel-search input:focus,
.floskel-fachfilter select:focus,
.floskel-editor textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent);
}

.floskel-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.floskel-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.85rem;
}

.floskel-chip span {
  display: inline-grid;
  place-items: center;
  min-width: 1.5rem;
  min-height: 1.5rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 0.78rem;
}

.floskel-chip.is-active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 11%, var(--color-surface));
}

.floskel-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(360px, 1fr);
}

.floskel-list-column,
.floskel-preview-column {
  min-height: 0;
  padding: 1.25rem 1.5rem;
}

.floskel-list-column {
  border-right: 1px solid var(--color-border);
  overflow: auto;
}

.floskel-preview-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: auto;
}

.floskel-empty {
  margin: 0;
  color: var(--color-text-muted);
}

.floskel-list {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.floskel-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 55%, var(--color-surface));
  cursor: pointer;
  transition: border-color 0.12s, transform 0.12s, box-shadow 0.12s;
}

.floskel-card:hover,
.floskel-card.is-selected {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  box-shadow: 0 10px 26px color-mix(in srgb, var(--color-primary) 12%, transparent);
  transform: translateY(-1px);
}

.floskel-card-meta,
.floskel-preview-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  font-size: 0.78rem;
}

.floskel-card-group {
  color: var(--color-primary);
  font-weight: 700;
}

.floskel-card-code {
  color: var(--color-text-muted);
  font-family: 'Noto Sans Mono', 'Courier New', monospace;
}

.floskel-card-text,
.floskel-preview p {
  margin: 0;
  line-height: 1.4;
}

.secondary {
  background: transparent;
}

.floskel-editor {
  display: grid;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.floskel-editor textarea {
  min-height: 220px;
  padding: 0.95rem 1rem;
  resize: vertical;
  line-height: 1.55;
}

.floskel-preview {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-bg) 42%, var(--color-surface));
}

.floskel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  border-top: 1px solid var(--color-border);
}

@media (max-width: 980px) {
  .floskel-dialog {
    width: 100%;
    max-height: calc(100vh - 1.5rem);
    border-radius: 20px;
  }

  .floskel-layout {
    grid-template-columns: 1fr;
  }

  .floskel-fachfilter {
    margin-left: 0;
    flex-basis: 240px;
  }

  .floskel-list-column {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}

@media (max-width: 640px) {
  .floskel-overlay {
    padding: 0.5rem;
  }

  .floskel-header,
  .floskel-toolbar,
  .floskel-list-column,
  .floskel-preview-column,
  .floskel-footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .floskel-header {
    flex-direction: column;
  }

  .floskel-card-actions,
  .floskel-footer {
    flex-direction: column;
  }

  .floskel-footer button,
  .floskel-close {
    width: 100%;
    justify-content: center;
  }
}
</style>