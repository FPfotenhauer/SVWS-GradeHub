<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useENMStore } from '@/stores/enmStore'
import type { LehrerKurzinfo } from '@/stores/enmStore'

const router = useRouter()
const authStore = useAuthStore()
const enmStore = useENMStore()

const env = import.meta.env as ImportMetaEnv & Record<string, string | boolean | undefined>

function envString(key: string): string {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

function baueBaseUrlAusEnv(): string {
  const explicitBaseUrl = envString('VITE_SVWS_BASE_URL')
  if (explicitBaseUrl !== '') {
    return explicitBaseUrl
  }

  const host = envString('SVWSSERVER_HOST')
  const port = envString('SVWSSERVER_PORT')
  const protocolFromEnv = envString('VITE_SVWS_PROTOCOL') || envString('SVWSSERVER_PROTOCOL')
  if (host === '') {
    return ''
  }

  const isLocalHost = host === 'localhost' || host === '127.0.0.1'
  const defaultProtocol = isLocalHost
    ? (port === '8443' ? 'https' : 'http')
    : 'https'
  const protocol = protocolFromEnv !== '' ? protocolFromEnv : defaultProtocol

  return port !== '' ? `${protocol}://${host}:${port}` : `${protocol}://${host}`
}

function initialValue(storeValue: string, ...fallbacks: string[]): string {
  if (storeValue.trim() !== '') {
    return storeValue
  }
  return fallbacks.find((value) => value !== '') ?? ''
}

const baseUrl = ref<string>(initialValue(authStore.baseUrl, baueBaseUrlAusEnv()))
const schema = ref<string>(initialValue(authStore.schema, envString('VITE_SVWS_SCHEMA'), envString('SVWSSERVER_SCHEMA')))
const username = ref<string>(initialValue(authStore.username, envString('VITE_SVWS_USERNAME'), envString('SVWSSERVER_USER')))
const password = ref<string>(initialValue(authStore.password, envString('VITE_SVWS_PASSWORD'), envString('SVWSSERVER_PASSWORD')))

const isLoading = ref<boolean>(false)
const statusMessage = ref<string>('')
const errorMessage = ref<string>('')
const lehrerListe = ref<LehrerKurzinfo[]>([])
const selectedLehrerId = ref<number | null>(null)
const serverCardOpen = ref<boolean>(true)
const fileCardOpen = ref<boolean>(true)

function encodeBasicAuth(user: string, pass: string): string {
  return `Basic ${window.btoa(`${user}:${pass}`)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mapLehrerKurzinfo(value: unknown): LehrerKurzinfo | null {
  if (!isRecord(value)) {
    return null
  }

  const idRaw = value.id
  const kuerzelRaw = value.kuerzel
  if (typeof idRaw !== 'number' || typeof kuerzelRaw !== 'string') {
    return null
  }

  const istAktivRaw = value.istAktiv ?? value.aktiv ?? value.istSichtbar
  return {
    id: idRaw,
    kuerzel: kuerzelRaw,
    istAktiv: typeof istAktivRaw === 'boolean' ? istAktivRaw : true,
  }
}

async function ladeLehrerListeDirekt(baseUrlValue: string, schemaValue: string, usernameValue: string, passwordValue: string): Promise<LehrerKurzinfo[]> {
  const cleanedBaseUrl = baseUrlValue.replace(/\/$/, '')
  const endpoint = `${cleanedBaseUrl}/db/${schemaValue}/lehrer`
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: encodeBasicAuth(usernameValue, passwordValue),
        Accept: 'application/json',
      },
    })
  } catch {
    throw new Error(`Netzwerkfehler beim Zugriff auf ${endpoint}. Bitte URL, Protokoll (http/https), Zertifikat und CORS pruefen.`)
  }

  if (!response.ok) {
    throw new Error(`Lehrerliste konnte nicht geladen werden (${response.status}).`)
  }

  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Lehrerliste hat ein ungueltiges Format.')
  }

  return data
    .map(mapLehrerKurzinfo)
    .filter((lehrer): lehrer is LehrerKurzinfo => lehrer !== null)
    .sort((a, b) => a.kuerzel.localeCompare(b.kuerzel, 'de'))
}

function clearMessages(): void {
  statusMessage.value = ''
  errorMessage.value = ''
}

async function ladeVomServer(): Promise<void> {
  clearMessages()
  isLoading.value = true

  try {
    authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)

    if (selectedLehrerId.value === null) {
      throw new Error('Bitte zuerst eine Lehrkraft aus der Liste waehlen.')
    }

    await enmStore.ladeENMVonServer(
      baseUrl.value,
      schema.value,
      username.value,
      password.value,
      selectedLehrerId.value,
    )
    statusMessage.value = 'ENM-Daten erfolgreich vom SVWS-Server geladen.'
    await router.push('/lerngruppen')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'ENM-Daten konnten nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

async function ladeLehrerListe(): Promise<void> {
  clearMessages()
  isLoading.value = true

  try {
    authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)

    const storeWithMaybeAction = enmStore as typeof enmStore & {
      ladeLehrerListeVomServer?: (
        baseUrlValue: string,
        schemaValue: string,
        usernameValue: string,
        passwordValue: string,
      ) => Promise<LehrerKurzinfo[]>
    }

    const liste = typeof storeWithMaybeAction.ladeLehrerListeVomServer === 'function'
      ? await storeWithMaybeAction.ladeLehrerListeVomServer(baseUrl.value, schema.value, username.value, password.value)
      : await ladeLehrerListeDirekt(baseUrl.value, schema.value, username.value, password.value)

    lehrerListe.value = liste
    selectedLehrerId.value = liste.find((lehrer) => lehrer.istAktiv)?.id ?? liste[0]?.id ?? null
    statusMessage.value = `${liste.length} Lehrkraefte geladen.`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Lehrerliste konnte nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

async function ladeVonDatei(event: Event): Promise<void> {
  clearMessages()
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  isLoading.value = true

  try {
    await enmStore.ladeENMVonDatei(file)
    statusMessage.value = `ENM-Datei geladen: ${file.name}`
    await router.push('/lerngruppen')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Datei konnte nicht verarbeitet werden.'
  } finally {
    isLoading.value = false
    input.value = ''
  }
}

async function ladeLehrerdateiAusData(): Promise<void> {
  clearMessages()
  isLoading.value = true

  try {
    const response = await fetch('/data/enm.teacher.json')
    if (!response.ok) {
      throw new Error(`Lehrerdatei nicht gefunden (${response.status}).`)
    }

    const blob = await response.blob()
    const file = new File([blob], 'enm.teacher.json', { type: 'application/json' })
    await enmStore.ladeENMVonDatei(file)
    statusMessage.value = 'Lehrerdatei aus data/enm.teacher.json wurde geladen.'
    await router.push('/lerngruppen')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Lehrerdatei konnte nicht geladen werden.'
  } finally {
    isLoading.value = false
  }
}

function oeffneAdmin(): void {
  authStore.setCredentials(baseUrl.value, schema.value, username.value, password.value)
  router.push('/admin')
}

// Naechster Schritt: Versionspruefung fuer ENM-v2/v1 bereits beim Verbindungsdialog anzeigen.
</script>

<template>
  <main class="start-view">
    <h1>SVWS-GradeHub</h1>

    <section class="card">
      <button class="card-toggle" type="button" @click="serverCardOpen = !serverCardOpen">
        <h2>Vom SVWS-Server laden</h2>
        <span>{{ serverCardOpen ? 'Einklappen' : 'Ausklappen' }}</span>
      </button>

      <div v-if="serverCardOpen" class="card-content">
        <label>
          Basis-URL
          <input v-model="baseUrl" type="url" placeholder="https://svws.schule.de" />
        </label>
        <label>
          Schema
          <input v-model="schema" type="text" placeholder="svwsdb" />
        </label>
        <label>
          Benutzername
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          Passwort
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <div class="button-row">
          <button :disabled="isLoading" type="button" @click="ladeLehrerListe">Lehrerliste laden</button>
          <button class="secondary" type="button" @click="oeffneAdmin">Adminbereich</button>
        </div>

        <label v-if="lehrerListe.length > 0">
          Lehrerkuerzel
          <select v-model.number="selectedLehrerId">
            <option :value="null" disabled>Bitte waehlen</option>
            <option v-for="lehrer in lehrerListe" :key="lehrer.id" :value="lehrer.id">
              {{ lehrer.kuerzel }}
            </option>
          </select>
        </label>

        <button
          v-if="lehrerListe.length > 0"
          :disabled="isLoading || selectedLehrerId === null"
          type="button"
          @click="ladeVomServer"
        >
          Vom Server laden
        </button>
      </div>
    </section>

    <section class="card">
      <button class="card-toggle" type="button" @click="fileCardOpen = !fileCardOpen">
        <h2>Aus Datei laden</h2>
        <span>{{ fileCardOpen ? 'Einklappen' : 'Ausklappen' }}</span>
      </button>

      <div v-if="fileCardOpen" class="card-content">
        <input :disabled="isLoading" type="file" accept=".json,.gz,.json.gz" @change="ladeVonDatei" />
        <button :disabled="isLoading" type="button" @click="ladeLehrerdateiAusData">
          Lehrerdatei laden
        </button>
        <p class="help">Unterstuetzt werden ENM-JSON sowie gzip-komprimierte ENM-Dateien.</p>
      </div>
    </section>

    <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>

<style scoped>
.start-view {
  display: grid;
  gap: 1rem;
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  background-color: var(--color-bg);
}

.card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.card-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.card-toggle h2 {
  margin: 0;
  text-align: left;
}

.card-toggle span {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.card-content {
  display: grid;
  gap: 0.75rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--color-text);
}

input,
select,
button {
  font: inherit;
  padding: 0.5rem 0.625rem;
}

input,
select {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
}

.button-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

button {
  width: fit-content;
  cursor: pointer;
  color: #ffffff;
  background: var(--color-primary);
  border: 0;
  border-radius: 0.4rem;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.secondary {
  color: #dc2626;
  background: transparent;
  border: 1px solid #dc2626;
}

.help {
  margin: 0;
  color: var(--color-text-muted);
}

.status,
.error {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
}

.status {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
}

.error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
}
</style>
