/**
 * Generate a fresh RSA-2048 key pair in memory for Google JWT round-trip
 * tests. Exporting the PKCS#8 private key lets us feed it through the
 * normal `GoogleSigningMaterial.fromServiceAccount` path so the test
 * exercises the real import code, not a shortcut.
 *
 * We also keep the matching public key (as a separate `CryptoKey`) so
 * tests can verify signatures end to end without a third-party tool.
 */
export interface GoogleTestKeys {
  clientEmail: string
  issuerId: string
  privateKeyPkcs8Pem: string
  publicKey: CryptoKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0)
  return btoa(binary)
}

function toPkcs8Pem(der: Uint8Array): string {
  const b64 = toBase64(der)
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64))
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

let cached: GoogleTestKeys | undefined

export async function generateGoogleTestKeys(): Promise<GoogleTestKeys> {
  if (cached) return cached

  const keyPair = (await globalThis.crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  const pkcs8Der = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  )

  cached = {
    clientEmail: 'test-account@passmint-test.iam.gserviceaccount.com',
    issuerId: '3388000000000000',
    privateKeyPkcs8Pem: toPkcs8Pem(pkcs8Der),
    publicKey: keyPair.publicKey,
  }
  return cached
}
