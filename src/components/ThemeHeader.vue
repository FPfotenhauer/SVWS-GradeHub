<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
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
const showLogoutWarning = ref<boolean>(false)

const showLogout = computed<boolean>(() => authStore.isConfigured || enmStore.isLoaded)

function onThemeChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value === 'light' || select.value === 'dark' || select.value === 'system') {
    uiStore.setThemePreference(select.value)
  }
}

async function performLogout(): Promise<void> {
  changeStore.reset()
  enmStore.reset()
  authStore.clear()
  await router.push('/')
}

async function logout(): Promise<void> {
  if (changeStore.hasChanges) {
    showLogoutWarning.value = true
    return
  }

  await performLogout()
}

function closeLogoutWarning(): void {
  showLogoutWarning.value = false
}

async function confirmLogout(): Promise<void> {
  showLogoutWarning.value = false
  await performLogout()
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

    <div v-if="showLogoutWarning" class="modal-backdrop" @click.self="closeLogoutWarning">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
        <h2 id="logout-modal-title">Ungespeicherte Änderungen</h2>
        <p>Es gibt ungespeicherte Änderungen. Wirklich ausloggen und Änderungen verwerfen?</p>
        <div class="modal-actions">
          <button class="modal-btn secondary" type="button" @click="closeLogoutWarning">Abbrechen</button>
          <button class="modal-btn danger" type="button" @click="confirmLogout">Logout</button>
        </div>
      </section>
    </div>
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
  width: min(30rem, calc(100vw - 2rem));
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 0.6rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.modal h2,
.modal p {
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.modal-btn {
  font: inherit;
  padding: 0.4rem 0.8rem;
  border-radius: 0.35rem;
  cursor: pointer;
}

.modal-btn.secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.modal-btn.danger {
  border: 1px solid var(--color-error-border);
  background: var(--color-error-bg);
  color: var(--color-text);
}
</style>
