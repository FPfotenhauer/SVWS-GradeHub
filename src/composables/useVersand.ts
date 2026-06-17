import { ref } from 'vue'
import type { Ref } from 'vue'
import { strToU8, zipSync } from 'fflate'
import type { LehrerEintrag } from '@/types/admin'
import { aesVerschluesselnBytes, arrayBufferAusUint8Array } from '@/utils/crypto'

type VersandErgebnis = { kuerzel: string; email: string; erfolg: boolean; meldung: string }

type VersandDeps = {
  lehrer: Ref<LehrerEintrag[]>
  ausgewaehlt: Ref<Set<number>>
  oeffentlicherSchluesselPem: Ref<string>
  smtpHost: Ref<string>
  smtpPort: Ref<string>
  smtpUser: Ref<string>
  smtpPassword: Ref<string>
  smtpFrom: Ref<string>
  smtpTls: Ref<boolean>
  isLoading: Ref<boolean>
  errorMessage: Ref<string>
  ladeENMJsonFuerLehrer: (lehrerId: number) => Promise<string>
  mailServerUrl: string
}

export function useVersand(deps: VersandDeps) {
  const versandModalOffen = ref<boolean>(false)
  const versandErgebnisse = ref<VersandErgebnis[]>([])
  const versandLaeuft = ref<boolean>(false)
  const versandFortschritt = ref<number>(0)
  const versandGesamt = ref<number>(0)

  function schliesseVersandModal(): void {
    if (!versandLaeuft.value) versandModalOffen.value = false
  }

  async function versendeDateienFuerAuswahl(): Promise<void> {
    deps.errorMessage.value = ''
    if (deps.ausgewaehlt.value.size === 0) {
      deps.errorMessage.value = 'Bitte mindestens eine Lehrkraft auswählen.'
      return
    }
    if (!deps.smtpHost.value.trim()) {
      deps.errorMessage.value = 'Bitte zuerst einen E-Mail-Server konfigurieren.'
      return
    }
    if (!deps.oeffentlicherSchluesselPem.value) {
      deps.errorMessage.value = 'Bitte zuerst ein Schlüsselpaar erzeugen (öffentlicher Schlüssel fehlt).'
      return
    }
    const ausgewaehlteLehrer = deps.lehrer.value.filter((e) => deps.ausgewaehlt.value.has(e.id))
    const ohneNotenpasswort = ausgewaehlteLehrer.filter((e) => e.notenpasswort.trim() === '')
    if (ohneNotenpasswort.length > 0) {
      deps.errorMessage.value = `Für folgende Lehrkräfte fehlt ein Notenpasswort: ${ohneNotenpasswort.map((l) => l.kuerzel).join(', ')}`
      return
    }
    const ohneEmail = ausgewaehlteLehrer.filter((e) => e.emailDienstlich.trim() === '')
    if (ohneEmail.length > 0) {
      deps.errorMessage.value = `Für folgende Lehrkräfte fehlt eine E-Mail-Adresse: ${ohneEmail.map((l) => l.kuerzel).join(', ')}`
      return
    }

    versandErgebnisse.value = []
    versandFortschritt.value = 0
    versandGesamt.value = ausgewaehlteLehrer.length
    versandLaeuft.value = true
    versandModalOffen.value = true
    deps.isLoading.value = true

    const smtpKonfig = {
      host: deps.smtpHost.value.trim(),
      port: parseInt(deps.smtpPort.value, 10) || 587,
      user: deps.smtpUser.value,
      password: deps.smtpPassword.value,
      from: deps.smtpFrom.value,
      tls: deps.smtpTls.value,
    }

    for (const eintrag of ausgewaehlteLehrer) {
      try {
        const enmJson = await deps.ladeENMJsonFuerLehrer(eintrag.id)
        const zipBytes = zipSync({
          'enm.json': strToU8(enmJson),
          'public_key.pem': strToU8(deps.oeffentlicherSchluesselPem.value),
        })
        const zipFileName = `${eintrag.kuerzel || `lehrer-${eintrag.id}`}-enm.zip`
        const verschluesselt = await aesVerschluesselnBytes(
          arrayBufferAusUint8Array(zipBytes),
          eintrag.notenpasswort,
          zipFileName,
        )
        const dateiname = `${zipFileName}.enc.json`
        const response = await fetch(`${deps.mailServerUrl}/api/mail/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: eintrag.emailDienstlich, filename: dateiname, content: verschluesselt, smtp: smtpKonfig }),
        })
        const text = await response.text()
        versandErgebnisse.value.push({
          kuerzel: eintrag.kuerzel,
          email: eintrag.emailDienstlich,
          erfolg: response.ok,
          meldung: response.ok ? 'Gesendet.' : (text || `Fehler ${response.status}`),
        })
      } catch (error) {
        versandErgebnisse.value.push({
          kuerzel: eintrag.kuerzel,
          email: eintrag.emailDienstlich,
          erfolg: false,
          meldung: error instanceof Error ? error.message : 'Unbekannter Fehler.',
        })
      }
      versandFortschritt.value += 1
    }

    versandLaeuft.value = false
    deps.isLoading.value = false
  }

  return {
    versandModalOffen,
    versandErgebnisse,
    versandLaeuft,
    versandFortschritt,
    versandGesamt,
    schliesseVersandModal,
    versendeDateienFuerAuswahl,
  }
}
