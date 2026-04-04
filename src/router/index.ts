import { createRouter, createWebHashHistory } from 'vue-router'

import StartView from '@/views/StartView.vue'
import LerngruppenView from '@/views/LerngruppenView.vue'
import NotenEingabeView from '@/views/NotenEingabeView.vue'
import ExportView from '@/views/ExportView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'start', component: StartView },
    { path: '/lerngruppen', name: 'lerngruppen', component: LerngruppenView },
    { path: '/lerngruppen/:id', name: 'noten-eingabe', component: NotenEingabeView },
    { path: '/export', name: 'export', component: ExportView },
  ],
})

export default router

// Naechster Schritt: Routen-Guards fuer ungespeicherte Aenderungen ergaenzen.
