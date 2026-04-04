import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'svws-gradehub.theme-preference'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export const useUIStore = defineStore('ui', () => {
  const themePreference = ref<ThemePreference>('system')
  const systemPrefersDark = ref<boolean>(false)

  const effectiveTheme = computed<EffectiveTheme>(() => {
    if (themePreference.value === 'system') {
      return systemPrefersDark.value ? 'dark' : 'light'
    }
    return themePreference.value
  })

  function applyThemeToDocument(): void {
    document.documentElement.dataset.theme = effectiveTheme.value
    document.documentElement.style.colorScheme = effectiveTheme.value
  }

  function setThemePreference(nextTheme: ThemePreference): void {
    themePreference.value = nextTheme
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    applyThemeToDocument()
  }

  function initializeTheme(): void {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(storedTheme)) {
      themePreference.value = storedTheme
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = media.matches

    media.addEventListener('change', (event) => {
      systemPrefersDark.value = event.matches
      if (themePreference.value === 'system') {
        applyThemeToDocument()
      }
    })

    applyThemeToDocument()
  }

  return {
    themePreference,
    effectiveTheme,
    setThemePreference,
    initializeTheme,
  }
})

// Naechster Schritt: Theme-Einstellung in den Nutzereinstellungen separat dokumentieren.
