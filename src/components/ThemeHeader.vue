<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useChangeStore } from '@/stores/changeStore'
import { useENMStore } from '@/stores/enmStore'
import { useUIStore } from '@/stores/uiStore'
import type { ThemePreference } from '@/stores/uiStore'

const router = useRouter()
const authStore = useAuthStore()
const changeStore = useChangeStore()
const enmStore = useENMStore()
const uiStore = useUIStore()
const { themePreference } = storeToRefs(uiStore)
const showLogoutWarning = ref<boolean>(false)

const showLogout = computed<boolean>(() => authStore.isConfigured || enmStore.isLoaded)

const themeAriaLabel = computed<string>(() => {
  if (themePreference.value === 'light') return 'Theme: Hell – klicken zum Wechseln'
  if (themePreference.value === 'dark') return 'Theme: Dunkel – klicken zum Wechseln'
  return 'Theme: System – klicken zum Wechseln'
})

function toggleTheme(): void {
  const next: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }
  uiStore.setThemePreference(next[themePreference.value])
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

</script>

<template>
  <header class="app-header">
    <button
      class="theme-toggle"
      type="button"
      :aria-label="themeAriaLabel"
      :title="themeAriaLabel"
      @click="toggleTheme"
    >
      <svg
        v-if="themePreference === 'light'"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="5"
        />
        <line
          x1="12"
          y1="1"
          x2="12"
          y2="3"
        />
        <line
          x1="12"
          y1="21"
          x2="12"
          y2="23"
        />
        <line
          x1="4.22"
          y1="4.22"
          x2="5.64"
          y2="5.64"
        />
        <line
          x1="18.36"
          y1="18.36"
          x2="19.78"
          y2="19.78"
        />
        <line
          x1="1"
          y1="12"
          x2="3"
          y2="12"
        />
        <line
          x1="21"
          y1="12"
          x2="23"
          y2="12"
        />
        <line
          x1="4.22"
          y1="19.78"
          x2="5.64"
          y2="18.36"
        />
        <line
          x1="18.36"
          y1="5.64"
          x2="19.78"
          y2="4.22"
        />
      </svg>
      <svg
        v-else-if="themePreference === 'dark'"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="3"
          width="20"
          height="14"
          rx="2"
          ry="2"
        />
        <line
          x1="8"
          y1="21"
          x2="16"
          y2="21"
        />
        <line
          x1="12"
          y1="17"
          x2="12"
          y2="21"
        />
      </svg>
    </button>

    <button
      v-if="showLogout"
      class="logout-button"
      type="button"
      @click="logout"
    >
      Logout
    </button>

    <div
      v-if="showLogoutWarning"
      class="modal-backdrop"
      @click.self="closeLogoutWarning"
    >
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <h2 id="logout-modal-title">
          Ungespeicherte Änderungen
        </h2>
        <p>Es gibt ungespeicherte Änderungen. Wirklich ausloggen und Änderungen verwerfen?</p>
        <div class="modal-actions">
          <button
            class="modal-btn secondary"
            type="button"
            @click="closeLogoutWarning"
          >
            Abbrechen
          </button>
          <button
            class="modal-btn danger"
            type="button"
            @click="confirmLogout"
          >
            Logout
          </button>
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

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.theme-toggle:hover {
  background: var(--color-surface-hover, var(--color-border));
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
