import { execSync } from 'node:child_process'
import { unzipSync } from 'fflate'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { signManifest } from '../../src/cms'
import { SigningMaterial } from '../../src/cms/material'
import { PassmintSigningError } from '../../src/errors'
import { Pass } from '../../src/pass'
import { type CmsFixtures, generateCmsFixtures, writeFixtureFile } from '../cms/fixtures'

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function genericPass() {
  return Pass.generic({
    passTypeIdentifier: 'pass.com.example.signer',
    serialNumber: 'signer-seam-1',
    teamIdentifier: 'ABCD1234EF',
    organizationName: 'passmint',
    description: 'Manifest signer seam',
    images: { icon: { x2: { bytes: FAKE_ICON } } },
  }).build()
}

function entriesOf(pkpass: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(pkpass)
}

/**
 * `Pass.sign()` accepts a `ManifestSigner` so the private key can live in a
 * different process — a KMS, an HSM, or a separate signing service. These tests
 * pin the contract that makes that safe: the callback sees the manifest and
 * nothing else, and whatever it returns is what lands in the pass.
 *
 * `signManifest` embeds a `signingTime` attribute from `new Date()`, so two
 * signatures of the same manifest are not byte-identical. That rules out
 * comparing the material path and the signer path byte-for-byte; instead the
 * signer path is verified with openssl, exactly as the material path is.
 */
describe('ManifestSigner seam', () => {
  let fixtures: CmsFixtures
  let material: SigningMaterial

  beforeAll(async () => {
    fixtures = generateCmsFixtures()
    material = await SigningMaterial.fromPem({
      signerCertPem: fixtures.leafCertPem,
      wwdrPem: fixtures.wwdrCertPem,
      privateKeyPkcs8Pem: fixtures.leafKeyPkcs8Pem,
    })
  })

  it('hands the signer exactly the bytes written to manifest.json', async () => {
    const seen: Uint8Array[] = []
    const signed = await genericPass().sign(async (manifest) => {
      seen.push(manifest)
      return signManifest(manifest, material)
    })

    expect(seen).toHaveLength(1)

    const entries = entriesOf(await signed.toUint8Array())
    expect(seen[0]).toEqual(entries['manifest.json'])

    // And those bytes really are the manifest: a map of path → SHA-1 hex.
    const parsed = JSON.parse(new TextDecoder().decode(seen[0])) as Record<string, string>
    expect(Object.keys(parsed).sort()).toEqual(['icon@2x.png', 'pass.json'])
    for (const digest of Object.values(parsed)) {
      expect(digest).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('never hands the signer anything but the manifest', async () => {
    const signer = vi.fn(async (manifest: Uint8Array) => signManifest(manifest, material))
    await genericPass().sign(signer)

    expect(signer).toHaveBeenCalledTimes(1)
    expect(signer.mock.calls[0]).toHaveLength(1)
  })

  it('writes the signer’s bytes into the pass verbatim', async () => {
    const sentinel = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03])
    const signed = await genericPass().sign(async () => sentinel)

    const entries = entriesOf(await signed.toUint8Array())
    expect(entries.signature).toEqual(sentinel)
  })

  it('produces a pass openssl accepts when the signer delegates to signManifest', async () => {
    const signed = await genericPass().sign((manifest) => signManifest(manifest, material))
    const entries = entriesOf(await signed.toUint8Array())

    const manifestPath = writeFixtureFile('signer-manifest.bin', entries['manifest.json']!)
    const signaturePath = writeFixtureFile('signer-signature.bin', entries.signature!)

    execSync(
      `openssl cms -verify -in "${signaturePath}" -inform DER -content "${manifestPath}" -noverify -binary -out /dev/null`,
      { stdio: 'pipe' },
    )
  })

  it('is reachable from the fluent builder as well as a built Pass', async () => {
    const signed = await Pass.generic({
      passTypeIdentifier: 'pass.com.example.signer',
      serialNumber: 'signer-seam-builder',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint',
      description: 'Manifest signer seam via builder',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    }).sign((manifest) => signManifest(manifest, material))

    expect(entriesOf(await signed.toUint8Array())['manifest.json']).toBeDefined()
  })

  it('still accepts SigningMaterial directly', async () => {
    const signed = await genericPass().sign(material)
    const entries = entriesOf(await signed.toUint8Array())

    expect(entries.signature?.length).toBeGreaterThan(0)
  })

  describe('rejects a signer that misbehaves', () => {
    it('throws E_SIGN when the signer resolves to an empty signature', async () => {
      const promise = genericPass().sign(async () => new Uint8Array(0))

      await expect(promise).rejects.toThrow(PassmintSigningError)
      await expect(promise).rejects.toMatchObject({ code: 'E_SIGN' })
    })

    it('throws E_SIGN when the signer resolves to something that is not bytes', async () => {
      // Deliberately wrong at runtime — a plausible mistake when the signature
      // crosses a service boundary and arrives base64-encoded.
      const badSigner = (async () => 'not-bytes') as unknown as (
        manifest: Uint8Array,
      ) => Promise<Uint8Array>
      const promise = genericPass().sign(badSigner)

      await expect(promise).rejects.toThrow(PassmintSigningError)
      await expect(promise).rejects.toMatchObject({ code: 'E_SIGN' })
    })

    it('propagates an error thrown by the signer', async () => {
      const boom = new Error('key service unavailable')
      const promise = genericPass().sign(async () => {
        throw boom
      })

      await expect(promise).rejects.toBe(boom)
    })
  })
})
