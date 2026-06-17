export function encodeBasicAuth(user: string, pass: string): string {
  return `Basic ${window.btoa(`${user}:${pass}`)}`
}

export function arrayBufferNachBase64(buffer: ArrayBuffer): string {
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export function base64NachArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(window.atob(value), (c) => c.charCodeAt(0)).buffer.slice(0) as ArrayBuffer
}

export function arrayBufferAusUint8Array(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

export async function leitenSchluesselAb(
  password: string,
  salt: ArrayBuffer,
  usages: KeyUsage[] = ['encrypt', 'decrypt'],
): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

export async function aesVerschluesseln(plaintext: string, password: string): Promise<string> {
  const saltBuf = window.crypto.getRandomValues(new Uint8Array(16)).buffer.slice(0) as ArrayBuffer
  const ivBuf = window.crypto.getRandomValues(new Uint8Array(12)).buffer.slice(0) as ArrayBuffer
  const key = await leitenSchluesselAb(password, saltBuf)
  const cipherBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuf },
    key,
    new TextEncoder().encode(plaintext),
  )
  const toB64 = (buf: ArrayBuffer): string => window.btoa(String.fromCharCode(...new Uint8Array(buf)))
  return JSON.stringify({ version: 1, salt: toB64(saltBuf), iv: toB64(ivBuf), ciphertext: toB64(cipherBuf) })
}

export async function aesEntschluesseln(encryptedJson: string, password: string): Promise<string> {
  const parsed = JSON.parse(encryptedJson) as { version: number; salt: string; iv: string; ciphertext: string }
  const key = await leitenSchluesselAb(password, base64NachArrayBuffer(parsed.salt))
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64NachArrayBuffer(parsed.iv) },
    key,
    base64NachArrayBuffer(parsed.ciphertext),
  )
  return new TextDecoder().decode(plainBuf)
}

export async function aesVerschluesselnBytes(
  plaintext: ArrayBuffer,
  password: string,
  originalDateiname: string,
): Promise<string> {
  const saltBuf = window.crypto.getRandomValues(new Uint8Array(16)).buffer.slice(0) as ArrayBuffer
  const ivBuf = window.crypto.getRandomValues(new Uint8Array(12)).buffer.slice(0) as ArrayBuffer
  const key = await leitenSchluesselAb(password, saltBuf)
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, plaintext)
  return JSON.stringify({
    format: 'gradehub-encrypted-zip',
    version: 1,
    originalFileName: originalDateiname,
    salt: arrayBufferNachBase64(saltBuf),
    iv: arrayBufferNachBase64(ivBuf),
    ciphertext: arrayBufferNachBase64(cipherBuf),
  })
}
