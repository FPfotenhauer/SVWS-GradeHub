<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'

import type { EnmKlasse, EnmLerngruppe } from '@/types/enm'

const router = useRouter()
const enmStore = useENMStore()
const changeStore = useChangeStore()
const { changeCount } = storeToRefs(changeStore)

function parseLehrerId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const maybeId = (value as Record<string, unknown>).id
    return typeof maybeId === 'number' ? maybeId : null
  }

  return null
}

const lerngruppen = computed(() => enmStore.enmDaten?.lerngruppen ?? [])

const faecherById = computed(() => {
  const map = new Map<number, { kuerzel: string; bezeichnung: string }>()
  for (const fach of enmStore.enmDaten?.faecher ?? []) {
    map.set(fach.id, {
      kuerzel: fach.kuerzelAnzeige || fach.kuerzel,
      bezeichnung: fach.bezeichnung ?? fach.kuerzel,
    })
  }
  return map
})

const jahrgaengeById = computed(() => {
  const map = new Map<number, string>()
  for (const jahrgang of enmStore.enmDaten?.jahrgaenge ?? []) {
    map.set(jahrgang.id, jahrgang.kuerzelAnzeige || jahrgang.kuerzel)
  }
  return map
})

const klassenById = computed(() => {
  const map = new Map<number, string>()
  for (const klasse of enmStore.enmDaten?.klassen ?? []) {
    map.set(klasse.id, klasse.kuerzelAnzeige || klasse.kuerzel)
  }
  return map
})

const gruppenMeta = computed(() => {
  const klassenSetByLerngruppe = new Map<number, Set<number>>()
  const jahrgaengeSetByLerngruppe = new Map<number, Set<number>>()

  for (const schueler of enmStore.enmDaten?.schueler ?? []) {
    for (const leistung of schueler.leistungsdaten ?? []) {
      const klassenSet = klassenSetByLerngruppe.get(leistung.lerngruppenID) ?? new Set<number>()
      klassenSet.add(schueler.klasseID)
      klassenSetByLerngruppe.set(leistung.lerngruppenID, klassenSet)

      const jahrgaengeSet = jahrgaengeSetByLerngruppe.get(leistung.lerngruppenID) ?? new Set<number>()
      jahrgaengeSet.add(schueler.jahrgangID)
      jahrgaengeSetByLerngruppe.set(leistung.lerngruppenID, jahrgaengeSet)
    }
  }

  const result = new Map<number, { klassen: string; jahrgaenge: string }>()

  for (const gruppe of enmStore.enmDaten?.lerngruppen ?? []) {
    const klassen = [...(klassenSetByLerngruppe.get(gruppe.id) ?? new Set<number>())]
      .map((id) => klassenById.value.get(id) ?? `Klasse ${id}`)
      .sort((a, b) => a.localeCompare(b, 'de'))
      .join(', ')

    const jahrgaenge = [...(jahrgaengeSetByLerngruppe.get(gruppe.id) ?? new Set<number>())]
      .map((id) => jahrgaengeById.value.get(id) ?? `Jg. ${id}`)
      .sort((a, b) => a.localeCompare(b, 'de'))
      .join(', ')

    result.set(gruppe.id, {
      klassen,
      jahrgaenge,
    })
  }

  return result
})

const schuelerCountByKlasseId = computed(() => {
  const map = new Map<number, number>()
  for (const schueler of enmStore.enmDaten?.schueler ?? []) {
    const current = map.get(schueler.klasseID) ?? 0
    map.set(schueler.klasseID, current + 1)
  }
  return map
})

const ownLehrerId = computed<number | null>(() => parseLehrerId(enmStore.enmDaten?.lehrerID))

const ownLehrerKuerzel = computed<string>(() => {
  const id = ownLehrerId.value
  if (id === null) {
    return ''
  }
  const lehrer = enmStore.enmDaten?.lehrer.find((entry) => entry.id === id)
  return lehrer?.kuerzel ?? ''
})

const ownLehrerAnzeige = computed<string>(() => {
  const id = ownLehrerId.value
  if (id === null) {
    return ''
  }

  const lehrer = enmStore.enmDaten?.lehrer.find((entry) => entry.id === id)
  if (!lehrer) {
    return ''
  }

  return `${lehrer.vorname} ${lehrer.nachname} (${lehrer.kuerzel})`
})

const lerngruppenCards = computed(() => {
  return [...lerngruppen.value].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de'))
})

const klassenleiterKlassen = computed(() => {
  const id = ownLehrerId.value
  if (id === null) {
    return []
  }

  return (enmStore.enmDaten?.klassen ?? [])
    .filter((klasse) => klasse.klassenlehrer.includes(id))
    .sort((a, b) => a.sortierung - b.sortierung)
})

function goSave(): void {
  router.push({ name: 'export' })
}

// Naechster Schritt: Lerngruppen nach Klasse/Fach filterbar machen und Sortierung speichern.
</script>

<template>
  <main class="lerngruppen-view">
    <div class="kopfzeile">
      <h1>Lerngruppen</h1>
      <div class="aenderungsbox">
        <span class="aenderungs-label">Änderungen:</span>
        <strong class="aenderungs-wert">{{ changeCount }}</strong>
        <button
          class="btn-save"
          type="button"
          :disabled="changeCount === 0"
          @click="goSave"
        >
          Speichern
        </button>
      </div>
    </div>
    <p v-if="ownLehrerAnzeige" class="lehrer-info">Lehrkraft: {{ ownLehrerAnzeige }}</p>

    <p v-if="!enmStore.isLoaded">Es sind noch keine ENM-Daten geladen.</p>

    <template v-else>
      <section class="bereich">
        <h2>Alle Lerngruppen</h2>
        <div class="karten-grid">
          <RouterLink
            v-for="gruppe in lerngruppenCards"
            :key="gruppe.id"
            :to="`/lerngruppen/${gruppe.id}`"
            class="karte link-karte"
          >
            <header class="karte-kopf">
              <strong>{{ gruppe.bezeichnung }}</strong>
              <span class="badge">{{ faecherById.get(gruppe.fachID)?.kuerzel ?? 'Fach' }}</span>
            </header>
            <p class="meta">{{ faecherById.get(gruppe.fachID)?.bezeichnung ?? 'Fach unbekannt' }}</p>
            <p class="meta">
              Klasse: {{ gruppenMeta.get(gruppe.id)?.klassen || 'nicht zugeordnet' }}
            </p>
            <p class="meta">
              Jahrgang: {{ gruppenMeta.get(gruppe.id)?.jahrgaenge || 'nicht zugeordnet' }}
            </p>
            <p class="meta">Wochenstunden: {{ gruppe.wochenstunden }}</p>
          </RouterLink>
        </div>
      </section>

      <section v-if="klassenleiterKlassen.length > 0" class="bereich">
        <h2>Klassenleitung</h2>
        <p class="hinweis">
          {{ ownLehrerKuerzel || 'Lehrkraft' }} ist Klassenleitung in folgenden Klassen.
          Hier werden spaeter spezielle Aufgaben fuer Klassenleitungen ergaenzt.
        </p>
        <div class="karten-grid">
          <article v-for="klasse in klassenleiterKlassen" :key="klasse.id" class="karte">
            <header class="karte-kopf">
              <strong>{{ klasse.kuerzelAnzeige || klasse.kuerzel }}</strong>
              <span class="badge">
                {{ jahrgaengeById.get(klasse.idJahrgang) ?? 'Jahrgang' }}
              </span>
            </header>
            <p class="meta">Schueler: {{ schuelerCountByKlasseId.get(klasse.id) ?? 0 }}</p>
            <p class="meta">Klasse-ID: {{ klasse.id }}</p>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.lerngruppen-view {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.kopfzeile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.kopfzeile h1 {
  margin: 0;
}

.aenderungsbox {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-surface);
}

.aenderungs-label {
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.aenderungs-wert {
  min-width: 1.5rem;
  text-align: right;
}

.btn-save {
  background-color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  color: #fff;
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

.bereich + .bereich {
  margin-top: 2rem;
}

.lehrer-info {
  margin: 0 0 1rem;
  color: var(--color-text-muted);
}

.bereich h2 {
  margin: 0 0 0.9rem;
}

.karten-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.9rem;
}

.karte {
  display: grid;
  gap: 0.45rem;
  padding: 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 0.65rem;
  background: var(--color-surface);
  box-shadow: 0 8px 22px rgba(11, 20, 30, 0.08);
}

.link-karte {
  color: inherit;
  text-decoration: none;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.link-karte:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(11, 20, 30, 0.14);
}

.karte-kopf {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
}

.badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}

.meta {
  margin: 0;
  color: var(--color-text-muted);
}

.hinweis {
  margin: 0 0 0.8rem;
  color: var(--color-text-muted);
}
</style>
