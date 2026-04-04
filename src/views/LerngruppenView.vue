<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useENMStore } from '@/stores/enmStore'

const enmStore = useENMStore()

const lerngruppen = computed(() => enmStore.enmDaten?.lerngruppen ?? [])
const faecherById = computed(() => {
  const map = new Map<number, string>()
  for (const fach of enmStore.enmDaten?.faecher ?? []) {
    map.set(fach.id, fach.kuerzelAnzeige || fach.kuerzel)
  }
  return map
})

// Naechster Schritt: Lerngruppen nach Klasse/Fach filterbar machen und Sortierung speichern.
</script>

<template>
  <main class="lerngruppen-view">
    <h1>Lerngruppen</h1>

    <p v-if="!enmStore.isLoaded">Es sind noch keine ENM-Daten geladen.</p>

    <ul v-else class="liste">
      <li v-for="gruppe in lerngruppen" :key="gruppe.id">
        <RouterLink :to="`/lerngruppen/${gruppe.id}`">
          {{ gruppe.bezeichnung }}
          <small>({{ faecherById.get(gruppe.fachID) ?? 'Fach unbekannt' }})</small>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.lerngruppen-view {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.liste {
  padding-left: 1rem;
}

a {
  color: #0b3a8f;
}

small {
  color: #525252;
}
</style>
