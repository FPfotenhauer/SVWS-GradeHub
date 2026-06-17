import express from 'express'
import nodemailer from 'nodemailer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())
app.use(express.static(join(__dirname, 'dist')))

// CORS für den Fall, dass server.js separat neben einem anderen Webserver läuft
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const PRIVATE_HOST_RE = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|0\.0\.0\.0$)/i

app.get('/api/health', (_req, res) => {
  res.status(200).send('ok')
})

app.post('/api/mail/test', async (req, res) => {
  const { host, port, user, password } = req.body

  if (!host) {
    return res.status(400).send('SMTP-Host fehlt.')
  }

  if (PRIVATE_HOST_RE.test(host.trim())) {
    return res.status(400).send('Interner Host nicht erlaubt.')
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

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = app.listen(Number(port), () => {
      console.log(`GradeHub-Server läuft auf http://localhost:${port}`)
      resolve(server)
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void startServer()
}
