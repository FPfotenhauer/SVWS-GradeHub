export type LeistungsFeld =
  | 'note'
  | 'noteQuartal'
  | 'fehlstundenFach'
  | 'fehlstundenUnentschuldigtFach'
  | 'fehlstundenGesamt'
  | 'fehlstundenUnentschuldigt'
  | 'lernbereichArbeitslehre'
  | 'lernbereichNaturwissenschaft'
  | 'asv'
  | 'aue'
  | 'zeugnisbemerkung'
  | 'fachbezogeneBemerkungen'
  | 'istGemahnt'
  | 'mahndatum'

export interface LeistungsChange {
  schuelerId:        number
  lerngruppenId:     number
  feld:              LeistungsFeld
  alterWert:         string | null
  neuerWert:         string | null
  geaendertAm:       string          // ISO 8601 UTC
  geaendertVon:      string          // Lehrkraft-Kuerzel
  enmBasisTimestamp: string
}

export type ChangeKey = `${number}:${number}:${LeistungsFeld}`

// Naechster Schritt: Validierungslogik fuer erlaubte Feldwerte zentralisieren.
