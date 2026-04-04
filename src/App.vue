<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RouterView } from 'vue-router'

import ThemeHeader from '@/components/ThemeHeader.vue'
import { useChangeStore } from '@/stores/changeStore'

const changeStore = useChangeStore()
const { changeCount } = storeToRefs(changeStore)

// Naechster Schritt: Banner um direkte Aktionen (Export/Senden) erweitern.
</script>

<template>
  <div>
    <ThemeHeader />

    <aside v-if="changeCount > 0" class="change-banner">
      <strong>{{ changeCount }}</strong>
      <span>nicht uebertragene Aenderungen</span>
    </aside>

    <RouterView />
  </div>
</template>

<style scoped>
.change-banner {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-banner-bg);
  border-bottom: 1px solid var(--color-banner-border);
}
</style>
