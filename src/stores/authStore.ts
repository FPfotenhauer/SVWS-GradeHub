import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const baseUrl = ref<string>('')
  const schema = ref<string>('')
  const username = ref<string>('')
  const password = ref<string>('')

  const isConfigured = computed<boolean>(() => {
    return baseUrl.value !== '' && schema.value !== '' && username.value !== '' && password.value !== ''
  })

  function setCredentials(nextBaseUrl: string, nextSchema: string, nextUsername: string, nextPassword: string): void {
    baseUrl.value = nextBaseUrl
    schema.value = nextSchema
    username.value = nextUsername
    password.value = nextPassword
  }

  function clear(): void {
    baseUrl.value = ''
    schema.value = ''
    username.value = ''
    password.value = ''
  }

  return {
    baseUrl,
    schema,
    username,
    password,
    isConfigured,
    setCredentials,
    clear,
  }
})

// Naechster Schritt: Eingaben fuer URL/Schema im UI normieren und validieren.
