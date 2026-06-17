import { ref } from 'vue'

export function useSmtp(mailServerUrl: string) {
  const smtpModalOffen = ref<boolean>(false)
  const smtpFehler = ref<string>('')
  const smtpHost = ref<string>('')
  const smtpPort = ref<string>('587')
  const smtpUser = ref<string>('')
  const smtpPassword = ref<string>('')
  const smtpFrom = ref<string>('')
  const smtpTls = ref<boolean>(true)
  const smtpTestLaeuft = ref<boolean>(false)
  const smtpTestErfolg = ref<boolean | null>(null)
  const smtpTestMeldung = ref<string>('')

  function oeffneSmtpModal(): void {
    smtpFehler.value = ''
    smtpModalOffen.value = true
  }

  function schliesseSmtpModal(): void {
    smtpModalOffen.value = false
  }

  function speichereSmtpKonfiguration(): void {
    if (!smtpHost.value.trim()) {
      smtpFehler.value = 'Bitte einen SMTP-Server angeben.'
      return
    }
    smtpFehler.value = ''
    smtpModalOffen.value = false
  }

  async function testeSmtpVerbindung(): Promise<void> {
    if (!smtpHost.value.trim()) {
      smtpFehler.value = 'Bitte einen SMTP-Server angeben.'
      return
    }
    smtpFehler.value = ''
    smtpTestLaeuft.value = true
    smtpTestErfolg.value = null
    smtpTestMeldung.value = ''
    try {
      const response = await fetch(`${mailServerUrl}/api/mail/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smtpHost.value.trim(),
          port: parseInt(smtpPort.value, 10) || 587,
          user: smtpUser.value,
          password: smtpPassword.value,
          from: smtpFrom.value,
          tls: smtpTls.value,
        }),
      })
      if (response.ok) {
        smtpTestErfolg.value = true
        smtpTestMeldung.value = 'Verbindung erfolgreich.'
      } else {
        const text = await response.text()
        smtpTestErfolg.value = false
        smtpTestMeldung.value = text || `Verbindung fehlgeschlagen (${response.status}).`
      }
    } catch {
      smtpTestErfolg.value = false
      smtpTestMeldung.value = 'Server nicht erreichbar. Ist das Backend gestartet?'
    } finally {
      smtpTestLaeuft.value = false
    }
  }

  return {
    smtpModalOffen,
    smtpFehler,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpFrom,
    smtpTls,
    smtpTestLaeuft,
    smtpTestErfolg,
    smtpTestMeldung,
    oeffneSmtpModal,
    schliesseSmtpModal,
    speichereSmtpKonfiguration,
    testeSmtpVerbindung,
  }
}
