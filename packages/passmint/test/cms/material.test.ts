import { beforeAll, describe, expect, it } from 'vitest'
import { SigningMaterial } from '../../src/cms/material'
import { PassmintSigningError } from '../../src/errors'
import { type CmsFixtures, generateCmsFixtures } from './fixtures'

describe('SigningMaterial.fromPem', () => {
  let fixtures: CmsFixtures

  beforeAll(() => {
    fixtures = generateCmsFixtures()
  })

  it('parses a valid cert chain + PKCS#8 key', async () => {
    const material = await SigningMaterial.fromPem({
      signerCertPem: fixtures.leafCertPem,
      wwdrPem: fixtures.wwdrCertPem,
      privateKeyPkcs8Pem: fixtures.leafKeyPkcs8Pem,
    })

    expect(material.signerCert).toBeDefined()
    expect(material.wwdrCert).toBeDefined()
    expect(material.privateKey).toBeDefined()
    expect(material.privateKey.type).toBe('private')
  })

  it('rejects a PKCS#1 private key with actionable error', async () => {
    const pkcs1Key = '-----BEGIN RSA PRIVATE KEY-----\nABCD\n-----END RSA PRIVATE KEY-----'
    try {
      await SigningMaterial.fromPem({
        signerCertPem: fixtures.leafCertPem,
        wwdrPem: fixtures.wwdrCertPem,
        privateKeyPkcs8Pem: pkcs1Key,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintSigningError)
      if (err instanceof PassmintSigningError) {
        expect(err.code).toBe('E_UNSUPPORTED_KEY_FORMAT')
        expect(err.message).toContain('openssl pkcs8 -topk8')
      }
    }
  })

  it('rejects malformed signer PEM with E_PEM_DECODE', async () => {
    try {
      await SigningMaterial.fromPem({
        signerCertPem: 'definitely not a PEM',
        wwdrPem: fixtures.wwdrCertPem,
        privateKeyPkcs8Pem: fixtures.leafKeyPkcs8Pem,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintSigningError)
      if (err instanceof PassmintSigningError) {
        expect(err.code).toBe('E_PEM_DECODE')
      }
    }
  })

  it('rejects cert-shaped but garbage DER with E_CERT_PARSE', async () => {
    // Valid PEM wrapping, garbage contents
    const fakeCert = '-----BEGIN CERTIFICATE-----\nAQIDBAUG\n-----END CERTIFICATE-----'
    try {
      await SigningMaterial.fromPem({
        signerCertPem: fakeCert,
        wwdrPem: fixtures.wwdrCertPem,
        privateKeyPkcs8Pem: fixtures.leafKeyPkcs8Pem,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintSigningError)
      if (err instanceof PassmintSigningError) {
        expect(err.code).toBe('E_CERT_PARSE')
      }
    }
  })

  it('fromParsed returns material directly without re-parsing', async () => {
    const first = await SigningMaterial.fromPem({
      signerCertPem: fixtures.leafCertPem,
      wwdrPem: fixtures.wwdrCertPem,
      privateKeyPkcs8Pem: fixtures.leafKeyPkcs8Pem,
    })
    const second = SigningMaterial.fromParsed({
      signerCert: first.signerCert,
      wwdrCert: first.wwdrCert,
      privateKey: first.privateKey,
    })
    expect(second.signerCert).toBe(first.signerCert)
    expect(second.privateKey).toBe(first.privateKey)
  })
})
