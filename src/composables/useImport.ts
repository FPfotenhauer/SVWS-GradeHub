import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { strFromU8, decompressSync, unzipSync } from 'fflate'
import type { useAuthStore } from '@/stores/authStore'
import type { EncryptedZipPayload, LehrerEintrag } from '@/types/admin'
import { encodeBasicAuth, leitenSchluesselAb, base64NachArrayBuffer } from '@/utils/crypto'

type AuthStore = ReturnType<typeof useAuthStore>

type ImportEintrag = {
  id: number
  file: File
  dateiname: string
  kuerzelErmittelt: string
  status: 'ausstehend' | 'ok' | 'fehler' | 'passwortFehlt' | 'gesendet' | 'sendefehler'
  fehlerText: string
  enmJson: string
  manuellKennwort: string
  manuellKuerzel: string
  istVerschluesselt: boolean
  verarbeiteLaeuft: boolean
  sendeLaeuft: boolean
  sendeFehler: string
}

type ImportDeps = {
  lehrer: Ref<LehrerEintrag[]>
  sichtbareLehrer: ComputedRef<LehrerEintrag[]>
  kannAnSVWSServerSenden: ComputedRef<boolean>
  errorMessage: Ref<string>
  authStore: AuthStore
}

const IMPORT_GZIP_MAGIC_1 = 0x1f
const IMPORT_GZIP_MAGIC_2 = 0x8b

let importIdCounter = 0

function istEncryptedZipPayload(value: unknown): value is EncryptedZipPayload {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return rec.format === 'gradehub-encrypted-zip'
    && typeof rec.version === 'number'
    && typeof rec.originalFileName === 'string'
    && typeof rec.salt === 'string'
    && typeof rec.iv === 'string'
    && typeof rec.ciphertext === 'string'
}

function extrahiereKuerzelAusDateiname(name: string): string {
  const match = /^([A-Za-z0-9ÄÖÜäöüß]+)-enm[.\-_]/i.exec(name)
  return match?.[1]?.toUpperCase() ?? ''
}

export function useImport(deps: ImportDeps) {
  const importModalOffen = ref<boolean>(false)
  const importEintraege = ref<ImportEintrag[]>([])
  const importLaeuft = ref<boolean>(false)
  const importAllesendenLaeuft = ref<boolean>(false)

  const importErfolgreicheAnzahl = computed<number>(() =>
    importEintraege.value.filter((e) => e.status === 'ok').length,
  )

  function oeffneImportModal(): void {
    importModalOffen.value = true
  }

  function schliesseImportModal(): void {
    importModalOffen.value = false
  }

  function resetImport(): void {
    importEintraege.value = []
  }

  function importStatusText(eintrag: ImportEintrag): string {
    if (eintrag.status === 'ok') return 'Bereit'
    if (eintrag.status === 'passwortFehlt') return 'Kennwort fehlt'
    if (eintrag.status === 'fehler') return 'Fehler'
    if (eintrag.status === 'gesendet') return 'Gesendet'
    if (eintrag.status === 'sendefehler') return 'Sendefehler'
    if (eintrag.status === 'ausstehend') return 'Wird verarbeitet…'
    return ''
  }

  function importEintragKlasse(eintrag: ImportEintrag): Record<string, boolean> {
    return {
      'import-ok': eintrag.status === 'ok' || eintrag.status === 'gesendet',
      'import-gesendet': eintrag.status === 'gesendet',
      'import-fehler': eintrag.status === 'fehler' || eintrag.status === 'sendefehler',
      'import-warnung': eintrag.status === 'passwortFehlt',
    }
  }

  function bauePasswortMap(): Map<string, string> {
    return new Map(
      deps.lehrer.value
        .filter((l) => l.notenpasswort.trim() !== '')
        .map((l) => [l.kuerzel.toUpperCase(), l.notenpasswort]),
    )
  }

  async function verarbeiteImportDateiInhalt(
    file: File,
    eintrag: ImportEintrag,
    passwortMapNachKuerzel: Map<string, string>,
  ): Promise<void> {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)

    if (bytes.length > 2 && bytes[0] === IMPORT_GZIP_MAGIC_1 && bytes[1] === IMPORT_GZIP_MAGIC_2) {
      eintrag.enmJson = strFromU8(decompressSync(bytes))
      eintrag.kuerzelErmittelt = extrahiereKuerzelAusDateiname(file.name)
      eintrag.istVerschluesselt = false
      return
    }

    const text = new TextDecoder().decode(bytes)
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch {
      throw new Error('Datei ist kein gültiges JSON und keine gzip-Datei.')
    }

    if (istEncryptedZipPayload(parsed)) {
      eintrag.istVerschluesselt = true
      const kuerzelAusOriginal = extrahiereKuerzelAusDateiname(parsed.originalFileName)
      if (!eintrag.kuerzelErmittelt) eintrag.kuerzelErmittelt = kuerzelAusOriginal

      const kuerzelSuche = (eintrag.manuellKuerzel.trim() || eintrag.kuerzelErmittelt).toUpperCase()
      const passwort = eintrag.manuellKennwort.trim() || passwortMapNachKuerzel.get(kuerzelSuche) || ''

      if (!passwort) {
        eintrag.status = 'passwortFehlt'
        eintrag.fehlerText = `Kein Notenpasswort für Kürzel "${eintrag.kuerzelErmittelt || '?'}" gefunden. Bitte Kürzel zuordnen oder Kennwort eingeben.`
        return
      }

      const salt = base64NachArrayBuffer(parsed.salt)
      const iv = base64NachArrayBuffer(parsed.iv)
      const ciphertext = base64NachArrayBuffer(parsed.ciphertext)
      const key = await leitenSchluesselAb(passwort, salt, ['decrypt'])

      let plainZip: ArrayBuffer
      try {
        plainZip = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
      } catch {
        throw new Error('Entschlüsselung fehlgeschlagen. Falsches Kennwort oder beschädigte Datei.')
      }

      const zipEntries = unzipSync(new Uint8Array(plainZip))
      const enmBytes = zipEntries['enm.json']
      if (!enmBytes) throw new Error('Die entschlüsselte ZIP enthält keine enm.json.')
      eintrag.enmJson = strFromU8(enmBytes)
    } else {
      eintrag.enmJson = text
      eintrag.kuerzelErmittelt = extrahiereKuerzelAusDateiname(file.name)
      eintrag.istVerschluesselt = false
    }
  }

  async function verarbeiteImportDatei(file: File, passwortMapNachKuerzel: Map<string, string>): Promise<void> {
    const eintrag: ImportEintrag = {
      id: ++importIdCounter,
      file,
      dateiname: file.name,
      kuerzelErmittelt: '',
      status: 'ausstehend',
      fehlerText: '',
      enmJson: '',
      manuellKennwort: '',
      manuellKuerzel: '',
      istVerschluesselt: false,
      verarbeiteLaeuft: false,
      sendeLaeuft: false,
      sendeFehler: '',
    }
    importEintraege.value.push(eintrag)
    const reaktivEintrag = importEintraege.value.at(-1) ?? eintrag
    try {
      await verarbeiteImportDateiInhalt(file, reaktivEintrag, passwortMapNachKuerzel)
      if (reaktivEintrag.status === 'ausstehend') reaktivEintrag.status = 'ok'
    } catch (error) {
      reaktivEintrag.status = 'fehler'
      reaktivEintrag.fehlerText = error instanceof Error ? error.message : 'Unbekannter Fehler.'
    }
  }

  async function starteImportVonDateien(files: FileList | File[]): Promise<void> {
    importLaeuft.value = true
    const passwortMap = bauePasswortMap()
    try {
      for (const file of files) {
        const lower = file.name.toLowerCase()
        if (!lower.endsWith('.json') && !lower.endsWith('.gz') && !lower.endsWith('.enc.json')) continue
        await verarbeiteImportDatei(file, passwortMap)
      }
    } finally {
      importLaeuft.value = false
    }
  }

  async function waehleImportOrdner(): Promise<void> {
    const pickerWindow = window as Window & {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle & {
        entries: () => AsyncIterable<[string, { kind: string; getFile: () => Promise<File> }]>
      }>
    }
    if (typeof pickerWindow.showDirectoryPicker !== 'function') {
      deps.errorMessage.value = 'Ordner-Auswahl wird von diesem Browser nicht unterstützt. Bitte Dateien einzeln auswählen.'
      return
    }
    let handle: Awaited<ReturnType<NonNullable<typeof pickerWindow.showDirectoryPicker>>>
    try {
      handle = await pickerWindow.showDirectoryPicker({ mode: 'read' })
    } catch {
      return
    }
    const files: File[] = []
    for await (const [, entry] of handle.entries()) {
      if (entry.kind === 'file') files.push(await entry.getFile())
    }
    await starteImportVonDateien(files)
  }

  async function onImportDateienGewaehlt(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return
    await starteImportVonDateien(input.files)
    input.value = ''
  }

  async function verarbeiteEintragNochmal(eintrag: ImportEintrag): Promise<void> {
    eintrag.verarbeiteLaeuft = true
    eintrag.fehlerText = ''
    eintrag.status = 'ausstehend'
    eintrag.enmJson = ''
    const passwortMap = bauePasswortMap()
    if (eintrag.manuellKuerzel.trim() && !eintrag.manuellKennwort.trim()) {
      const pw = passwortMap.get(eintrag.manuellKuerzel.toUpperCase())
      if (pw) eintrag.manuellKennwort = pw
    }
    try {
      await verarbeiteImportDateiInhalt(eintrag.file, eintrag, passwortMap)
      if (eintrag.status === 'ausstehend') eintrag.status = 'ok'
    } catch (error) {
      eintrag.status = 'fehler'
      eintrag.fehlerText = error instanceof Error ? error.message : 'Unbekannter Fehler.'
    } finally {
      eintrag.verarbeiteLaeuft = false
    }
  }

  async function sendeENMAnSVWSServer(enmJson: string): Promise<void> {
    const cleanedBaseUrl = deps.authStore.baseUrl.replace(/\/$/, '')
    const endpoint = `${cleanedBaseUrl}/db/${deps.authStore.schema}/enm/v2/import`
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: encodeBasicAuth(deps.authStore.username, deps.authStore.password),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: enmJson,
      })
    } catch {
      throw new Error('Netzwerkfehler beim Zugriff auf den SVWS-Server.')
    }
    if (!response.ok) throw new Error(`Import fehlgeschlagen (${response.status}).`)
  }

  async function sendeEintragAnServer(eintrag: ImportEintrag): Promise<void> {
    eintrag.sendeLaeuft = true
    eintrag.sendeFehler = ''
    try {
      await sendeENMAnSVWSServer(eintrag.enmJson)
      eintrag.status = 'gesendet'
    } catch (error) {
      eintrag.status = 'sendefehler'
      eintrag.sendeFehler = error instanceof Error ? error.message : 'Unbekannter Fehler.'
    } finally {
      eintrag.sendeLaeuft = false
    }
  }

  async function sendeAlleAnServer(): Promise<void> {
    importAllesendenLaeuft.value = true
    try {
      for (const eintrag of importEintraege.value) {
        if (eintrag.status !== 'ok') continue
        await sendeEintragAnServer(eintrag)
      }
    } finally {
      importAllesendenLaeuft.value = false
    }
  }

  return {
    importModalOffen,
    importEintraege,
    importLaeuft,
    importAllesendenLaeuft,
    importErfolgreicheAnzahl,
    oeffneImportModal,
    schliesseImportModal,
    resetImport,
    importStatusText,
    importEintragKlasse,
    waehleImportOrdner,
    onImportDateienGewaehlt,
    verarbeiteEintragNochmal,
    sendeEintragAnServer,
    sendeAlleAnServer,
  }
}
