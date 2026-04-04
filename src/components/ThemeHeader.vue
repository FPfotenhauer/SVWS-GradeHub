<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'
import { useUIStore } from '@/stores/uiStore'

const router = useRouter()
const authStore = useAuthStore()
const changeStore = useChangeStore()
const enmStore = useENMStore()
const uiStore = useUIStore()
const { themePreference } = storeToRefs(uiStore)

const showLogout = computed<boolean>(() => authStore.isConfigured || enmStore.isLoaded)

function onThemeChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value === 'light' || select.value === 'dark' || select.value === 'system') {
    uiStore.setThemePreference(select.value)
  }
}

async function logout(): Promise<void> {
  changeStore.reset()
  enmStore.reset()
  authStore.clear()
  await router.push('/')
}

// Naechster Schritt: Theme-Switch als Icon-Button-Variante optional anbieten.
</script>

<template>
  <header class="app-header">
    <div class="theme-row">
      <label class="theme-control" for="theme-select">
        Theme
      </label>
      <select id="theme-select" :value="themePreference" @change="onThemeChange">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>

    <button v-if="showLogout" class="logout-button" type="button" @click="logout">
      Logout
    </button>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-control {
  color: var(--color-text-muted);
}

select {
  font: inherit;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.logout-button {
  font: inherit;
  padding: 0.38rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}
</style>
