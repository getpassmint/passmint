import { beforeAll, describe, expect, it } from 'vitest'
import { base64url, signSaveJwt } from '../../src/google/jwt'
import { GoogleSigningMaterial } from '../../src/google/material'
import { type GoogleTestKeys, generateGoogleTestKeys } from './fixtures'

function b64urlToBytes(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeJwtPart<T>(b64url: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url))) as T
}

describe('base64url', () => {
  it('encodes bytes without padding and with URL-safe alphabet', () => {
    expect(base64url(new Uint8Array([0x3e, 0x3f, 0xff]))).toBe('Pj__')
    expect(base64url(new Uint8Array([0]))).toBe('AA')
    expect(base64url(new Uint8Array(0))).toBe('')
  })
})

describe('signSaveJwt', () => {
  let keys: GoogleTestKeys
  let material: GoogleSigningMaterial

  beforeAll(async () => {
    keys = await generateGoogleTestKeys()
    material = await GoogleSigningMaterial.fromServiceAccount({
      clientEmail: keys.clientEmail,
      privateKeyPkcs8Pem: keys.privateKeyPkcs8Pem,
      issuerId: keys.issuerId,
    })
  })

  it('produces a 3-segment compact JWT with RS256 header and provided claims', async () => {
    const iat = 1234567890
    const jwt = await signSaveJwt(
      {
        iss: material.clientEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat,
        origins: ['example.com'],
        payload: {
          genericObjects: [{ id: `${material.issuerId}.o1`, classId: `${material.issuerId}.c1` }],
        },
      },
      material,
    )

    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)

    const header = decodeJwtPart<{ alg: string; typ: string }>(parts[0]!)
    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')

    const claims = decodeJwtPart<Record<string, unknown>>(parts[1]!)
    expect(claims.iss).toBe(material.clientEmail)
    expect(claims.aud).toBe('google')
    expect(claims.typ).toBe('savetowallet')
    expect(claims.iat).toBe(iat)
    expect(claims.origins).toEqual(['example.com'])
  })

  it('signatures verify with the matching public key (round-trip)', async () => {
    const jwt = await signSaveJwt(
      {
        iss: material.clientEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        origins: ['example.com'],
        payload: { genericObjects: [{}] },
      },
      material,
    )

    const [headerB64, payloadB64, sigB64] = jwt.split('.')
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const signature = b64urlToBytes(sigB64!)

    const ok = await globalThis.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      signature.buffer.slice(
        signature.byteOffset,
        signature.byteOffset + signature.byteLength,
      ) as ArrayBuffer,
      signingInput.buffer.slice(
        signingInput.byteOffset,
        signingInput.byteOffset + signingInput.byteLength,
      ) as ArrayBuffer,
    )
    expect(ok).toBe(true)
  })

  it('a tampered signing input fails verification', async () => {
    const jwt = await signSaveJwt(
      {
        iss: material.clientEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        origins: ['example.com'],
        payload: { genericObjects: [{}] },
      },
      material,
    )
    const [, payloadB64, sigB64] = jwt.split('.')
    const signingInput = new TextEncoder().encode(`tamperedheader.${payloadB64}`)
    const signature = b64urlToBytes(sigB64!)
    const ok = await globalThis.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      signature.buffer.slice(
        signature.byteOffset,
        signature.byteOffset + signature.byteLength,
      ) as ArrayBuffer,
      signingInput.buffer.slice(
        signingInput.byteOffset,
        signingInput.byteOffset + signingInput.byteLength,
      ) as ArrayBuffer,
    )
    expect(ok).toBe(false)
  })
})
