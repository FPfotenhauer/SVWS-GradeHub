import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import router from '@/router'
import { useChangeStore } from '@/stores/changeStore'
import '@/style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const changeStore = useChangeStore(pinia)

window.addEventListener('beforeunload', (e) => {
  if (changeStore.hasChanges) {
    e.preventDefault()
  }
})

app.mount('#app')

// Naechster Schritt: Globale Fehlerbehandlung und Start-Initialisierung ergaenzen.
