import { beforeAll, describe, expect, it } from 'vitest'
import { PassmintGoogleError } from '../../src/errors'
import { GoogleSigningMaterial } from '../../src/google/material'
import { type GoogleTestKeys, generateGoogleTestKeys } from './fixtures'

describe('GoogleSigningMaterial.fromServiceAccount', () => {
  let keys: GoogleTestKeys

  beforeAll(async () => {
    keys = await generateGoogleTestKeys()
  })

  it('imports a valid service account key', async () => {
    const material = await GoogleSigningMaterial.fromServiceAccount({
      clientEmail: keys.clientEmail,
      privateKeyPkcs8Pem: keys.privateKeyPkcs8Pem,
      issuerId: keys.issuerId,
    })
    expect(material.clientEmail).toBe(keys.clientEmail)
    expect(material.issuerId).toBe(keys.issuerId)
    expect(material.privateKey.type).toBe('private')
  })

  it('rejects a non-email clientEmail', async () => {
    await expect(
      GoogleSigningMaterial.fromServiceAccount({
        clientEmail: 'not-an-email',
        privateKeyPkcs8Pem: keys.privateKeyPkcs8Pem,
        issuerId: keys.issuerId,
      }),
    ).rejects.toThrow(PassmintGoogleError)
  })

  it('rejects a non-numeric issuerId', async () => {
    await expect(
      GoogleSigningMaterial.fromServiceAccount({
        clientEmail: keys.clientEmail,
        privateKeyPkcs8Pem: keys.privateKeyPkcs8Pem,
        issuerId: 'not-a-number',
      }),
    ).rejects.toThrow(PassmintGoogleError)
  })

  it('rejects a PKCS#1 key with an actionable conversion command', async () => {
    const pkcs1Key = '-----BEGIN RSA PRIVATE KEY-----\nABCD\n-----END RSA PRIVATE KEY-----'
    try {
      await GoogleSigningMaterial.fromServiceAccount({
        clientEmail: keys.clientEmail,
        privateKeyPkcs8Pem: pkcs1Key,
        issuerId: keys.issuerId,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintGoogleError)
      if (err instanceof PassmintGoogleError) {
        expect(err.code).toBe('E_SERVICE_ACCOUNT_KEY')
        expect(err.message).toContain('openssl pkcs8 -topk8')
      }
    }
  })

  it('rejects malformed PEM', async () => {
    await expect(
      GoogleSigningMaterial.fromServiceAccount({
        clientEmail: keys.clientEmail,
        privateKeyPkcs8Pem: 'not a pem',
        issuerId: keys.issuerId,
      }),
    ).rejects.toThrow(PassmintGoogleError)
  })

  it('fromParsed skips PEM parsing and returns material directly', async () => {
    const first = await GoogleSigningMaterial.fromServiceAccount({
      clientEmail: keys.clientEmail,
      privateKeyPkcs8Pem: keys.privateKeyPkcs8Pem,
      issuerId: keys.issuerId,
    })
    const second = GoogleSigningMaterial.fromParsed({
      clientEmail: first.clientEmail,
      issuerId: first.issuerId,
      privateKey: first.privateKey,
    })
    expect(second.privateKey).toBe(first.privateKey)
  })
})
