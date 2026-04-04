export function useDeploymentMode() {
  const isFileProtocol = window.location.protocol === 'file:'
  const isSecureContext = window.isSecureContext
  return {
    isFileProtocol,
    isSecureContext,
    encryptionAvailable: isSecureContext && !isFileProtocol,
    onlineAvailable: !isFileProtocol,
  }
}

// Naechster Schritt: UI-Hinweise fuer file:// und fehlenden Secure Context anbinden.
