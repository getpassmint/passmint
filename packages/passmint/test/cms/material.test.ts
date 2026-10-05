import { AsnConvert } from '@peculiar/asn1-schema'
import { Certificate } from '@peculiar/asn1-x509'
import { beforeAll, describe, expect, it } from 'vitest'
import { toArrayBuffer } from '../../src/cms/der'
import { SigningMaterial } from '../../src/cms/material'
import { pemToDer } from '../../src/cms/pem'
import { signManifest } from '../../src/cms/sign'
import { PassmintSigningError } from '../../src/errors'
import {
  type ChainFixtures,
  type CmsFixtures,
  generateChainFixtures,
  generateCmsFixtures,
} from './fixtures'

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

describe('SigningMaterial WWDR chain check', () => {
  let chain: ChainFixtures

  beforeAll(() => {
    chain = generateChainFixtures()
  })

  async function expectMismatch(promise: Promise<unknown>): Promise<PassmintSigningError> {
    try {
      await promise
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintSigningError)
      expect((err as PassmintSigningError).code).toBe('E_WWDR_MISMATCH')
      return err as PassmintSigningError
    }
    return expect.fail('should have thrown E_WWDR_MISMATCH')
  }

  it('accepts the WWDR that issued the signer', async () => {
    const material = await SigningMaterial.fromPem({
      signerCertPem: chain.leafCertPem,
      wwdrPem: chain.g4Pem,
      privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
    })
    expect(material.wwdrCert).toBeDefined()
    await expect(signManifest(new Uint8Array([1, 2, 3]), material)).resolves.toBeInstanceOf(
      Uint8Array,
    )
  })

  it('accepts an ECDSA (P-384) issuer', async () => {
    await expect(
      SigningMaterial.fromPem({
        signerCertPem: chain.ecLeafCertPem,
        wwdrPem: chain.ecCaPem,
        privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
      }),
    ).resolves.toBeInstanceOf(SigningMaterial)
  })

  it('rejects a WWDR from the wrong generation, naming both', async () => {
    const err = await expectMismatch(
      SigningMaterial.fromPem({
        signerCertPem: chain.leafCertPem,
        wwdrPem: chain.g3Pem,
        privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
      }),
    )
    expect(err.message).toContain(
      "issued by 'CN=Apple Worldwide Developer Relations Certification Authority, OU=G4, O=Apple Inc., C=US'",
    )
    expect(err.message).toContain(
      "wwdrPem is 'CN=Apple Worldwide Developer Relations Certification Authority, OU=G3, O=Apple Inc., C=US'",
    )
    expect(err.message).toContain('https://www.apple.com/certificateauthority/')
  })

  it('rejects a WWDR with the right DN but a different key', async () => {
    const err = await expectMismatch(
      SigningMaterial.fromPem({
        signerCertPem: chain.leafCertPem,
        wwdrPem: chain.forgedG4Pem,
        privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
      }),
    )
    expect(err.message).toContain('does not verify against the public key in wwdrPem')
  })

  it('rejects an EC-issued signer paired with an RSA WWDR', async () => {
    // Different DN too, so this is caught by the name check.
    await expectMismatch(
      SigningMaterial.fromPem({
        signerCertPem: chain.ecLeafCertPem,
        wwdrPem: chain.g4Pem,
        privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
      }),
    )
  })

  it('fromParsed rejects a DN mismatch synchronously', async () => {
    const good = await SigningMaterial.fromPem({
      signerCertPem: chain.leafCertPem,
      wwdrPem: chain.g4Pem,
      privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
    })
    const g3 = AsnConvert.parse(toArrayBuffer(pemToDer(chain.g3Pem)), Certificate)
    expect(() =>
      SigningMaterial.fromParsed({
        signerCert: good.signerCert,
        wwdrCert: g3,
        privateKey: good.privateKey,
      }),
    ).toThrow(/OU=G3/)
  })

  it('fromParsed rejects a forged WWDR on first sign', async () => {
    const good = await SigningMaterial.fromPem({
      signerCertPem: chain.leafCertPem,
      wwdrPem: chain.g4Pem,
      privateKeyPkcs8Pem: chain.leafKeyPkcs8Pem,
    })
    const forged = AsnConvert.parse(toArrayBuffer(pemToDer(chain.forgedG4Pem)), Certificate)
    const material = SigningMaterial.fromParsed({
      signerCert: good.signerCert,
      wwdrCert: forged,
      privateKey: good.privateKey,
    })
    await expectMismatch(signManifest(new Uint8Array([1, 2, 3]), material))
    // Memoized: still rejects on the next call.
    await expectMismatch(signManifest(new Uint8Array([4, 5, 6]), material))
  })
})
