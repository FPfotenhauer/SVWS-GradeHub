// Laufzeit-Konfiguration fuer SVWS-GradeHub.
// Diese Datei kann nach dem Build editiert werden, ohne neu zu bauen.
//
// admintoolVisible: true  → Adminbereich wird angezeigt
// admintoolVisible: false → Adminbereich wird ausgeblendet (Lehrkraft-Modus)
//
// mailServerUrl           → URL des Node.js-Mail-Servers, wenn server.js separat
//                           neben einem anderen Webserver (z.B. Jetty) läuft.
//                           Beispiel: 'https://svws-server.schule.de:3001'
//                           Leer lassen, wenn server.js die App selbst ausliefert.
window.GRADEHUB_CONFIG = {
  // admintoolVisible: true,
  // mailServerUrl: 'https://svws-server.schule.de:3001',
}
