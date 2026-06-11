import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const CONFIG_ELECTRON = `\
// Laufzeit-Konfiguration fuer SVWS-GradeHub (Electron).
// In der Electron-App ist der Admin-Modus standardmäßig aktiv.
window.GRADEHUB_CONFIG = {
  admintoolVisible: true,
}
`

await writeFile(path.resolve('dist/config.js'), CONFIG_ELECTRON, 'utf8')
console.log('dist/config.js → Electron (admintoolVisible: true)')
