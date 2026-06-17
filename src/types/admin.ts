export interface LehrerEintrag {
  id: number
  kuerzel: string
  nachname: string
  vorname: string
  emailDienstlich: string
  notenpasswort: string
  istAktiv: boolean
}

export type SpaltenKey = 'kuerzel' | 'name' | 'email' | 'passwort'

export type EncryptedZipPayload = {
  format: 'gradehub-encrypted-zip'
  version: number
  originalFileName: string
  salt: string
  iv: string
  ciphertext: string
}
