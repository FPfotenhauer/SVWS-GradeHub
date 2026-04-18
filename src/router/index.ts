import { createRouter, createWebHashHistory } from 'vue-router'

import StartView from '@/views/StartView.vue'
import LerngruppenView from '@/views/LerngruppenView.vue'
import NotenEingabeView from '@/views/NotenEingabeView.vue'
import KlassenleitungView from '@/views/KlassenleitungView.vue'
import ExportView from '@/views/ExportView.vue'
import AdminView from '@/views/AdminView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'start', component: StartView },
    { path: '/lerngruppen', name: 'lerngruppen', component: LerngruppenView },
    { path: '/lerngruppen/:id', name: 'noten-eingabe', component: NotenEingabeView },
    { path: '/klassenleitung/:klasseId', name: 'klassenleitung', component: KlassenleitungView },
    { path: '/export', name: 'export', component: ExportView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
})

export default router

// Naechster Schritt: Routen-Guards fuer ungespeicherte Aenderungen ergaenzen.
