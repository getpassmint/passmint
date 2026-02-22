import { beforeAll, describe, expect, it } from 'vitest'
import { GoogleSigningMaterial } from '../../src/google/material'
import { Pass } from '../../src/pass'
import { type GoogleTestKeys, generateGoogleTestKeys } from './fixtures'

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

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

describe('Pass.toGoogleSaveLink — end to end', () => {
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

  it('builds a save link whose JWT verifies with the matching public key', async () => {
    const pass = Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.event',
      serialNumber: 'g-e2e-1',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint',
      description: 'Google round-trip',
      logoText: 'passmint DevCon',
      colors: { background: '#1a1a2e', foreground: '#ffffff' },
      images: {
        icon: { x2: { bytes: FAKE_ICON } },
        heroImage: { url: 'https://example.com/hero.jpg' },
      },
      barcodes: [{ format: 'qr', message: 'G-TICKET-123' }],
    })
      .primaryField({ key: 'event', label: 'Event', value: 'DevCon 2026' })
      .secondaryField({ key: 'seat', label: 'Seat', value: '12A' })
      .build()

    const url = await pass.toGoogleSaveLink(material, { origins: ['example.com'] })
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true)

    const jwt = url.slice('https://pay.google.com/gp/v/save/'.length)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)

    // Decode header + claims
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]!)))
    expect(claims.iss).toBe(material.clientEmail)
    expect(claims.aud).toBe('google')
    expect(claims.typ).toBe('savetowallet')
    expect(claims.origins).toEqual(['example.com'])

    // The payload should contain eventTicketClasses + eventTicketObjects
    expect(claims.payload.eventTicketClasses).toHaveLength(1)
    expect(claims.payload.eventTicketObjects).toHaveLength(1)
    const obj = claims.payload.eventTicketObjects[0]
    expect(obj.id).toBe(`${keys.issuerId}.g-e2e-1`)
    expect(obj.barcode.type).toBe('QR_CODE')

    // Signature verifies with the matching public key
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = b64urlToBytes(parts[2]!)
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

  it('toGoogleJwt returns the JWT without the URL wrapper', async () => {
    const pass = Pass.generic({
      passTypeIdentifier: 'pass.com.example.generic',
      serialNumber: 'g-jwt-only',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint',
      description: 'raw JWT',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    }).build()

    const jwt = await pass.toGoogleJwt(material, { origins: ['example.com'] })
    expect(jwt.split('.')).toHaveLength(3)
    expect(jwt.startsWith('https://')).toBe(false)
  })
})
