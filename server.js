import express from 'express'
import nodemailer from 'nodemailer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())
app.use(express.static(join(__dirname, 'dist')))

app.post('/api/mail/test', async (req, res) => {
  const { host, port, user, password, tls } = req.body

  if (!host) {
    return res.status(400).send('SMTP-Host fehlt.')
  }

  const numPort = Number(port ?? 587)
  const transporter = nodemailer.createTransport({
    host,
    port: numPort,
    secure: numPort === 465,
    auth: user ? { user, pass: password } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  })

  try {
    await transporter.verify()
    res.status(200).send('Verbindung erfolgreich.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler.'
    res.status(502).send(message)
  }
})

app.post('/api/mail/send', async (req, res) => {
  const { to, filename, content, smtp } = req.body

  if (!smtp?.host) return res.status(400).send('SMTP-Konfiguration fehlt.')
  if (!to) return res.status(400).send('Empfängeradresse fehlt.')
  if (!content) return res.status(400).send('Dateiinhalt fehlt.')

  const numPort = Number(smtp.port ?? 587)
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: numPort,
    secure: numPort === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  })

  try {
    await transporter.sendMail({
      from: smtp.from || smtp.user,
      to,
      subject: 'Ihre verschlüsselte Notendatei',
      text: `Im Anhang finden Sie Ihre persönliche verschlüsselte Notendatei (${filename}).\n\nBitte öffnen Sie die Datei mit SVWS-GradeHub und geben Sie Ihr Notenpasswort ein.`,
      attachments: [{ filename, content, contentType: 'application/json' }],
    })
    res.status(200).send('Gesendet.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler.'
    res.status(502).send(message)
  }
})

app.get('/{*path}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`GradeHub-Server läuft auf http://localhost:${PORT}`)
})
