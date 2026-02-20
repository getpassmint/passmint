import { execSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { SigningMaterial } from '../../src/cms/material'
import { signManifest } from '../../src/cms/sign'
import { type CmsFixtures, generateCmsFixtures, writeFixtureFile } from './fixtures'

/**
 * The gate test: sign a manifest with passmint's CMS pipeline, verify
 * the output with `openssl cms -verify -binary -noverify`, which will
 * fail loudly if anything in the DER encoding, attribute sorting, or
 * RSA signature math is wrong. `-noverify` skips certificate chain
 * trust validation (our test CA is self-signed); signature correctness
 * is still fully checked.
 *
 * `-binary` is REQUIRED for non-text manifests — without it, openssl
 * applies S/MIME LF→CRLF canonicalization to the content before
 * recomputing the digest, silently breaking verification.
 */
describe('signManifest — openssl round-trip', () => {
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

  it('produces a CMS SignedData that openssl cms -verify accepts', async () => {
    const manifestBytes = new TextEncoder().encode('hello world manifest\n')
    const signatureBytes = await signManifest(manifestBytes, material)

    const manifestPath = writeFixtureFile('signtest-manifest.bin', manifestBytes)
    const signaturePath = writeFixtureFile('signtest-signature.bin', signatureBytes)

    // Should not throw — any verification failure causes openssl to exit
    // non-zero and execSync to raise.
    execSync(
      `openssl cms -verify -in "${signaturePath}" -inform DER -content "${manifestPath}" -noverify -binary -out /dev/null`,
      { stdio: 'pipe' },
    )
  })

  it('handles a realistic multi-line pass.json manifest', async () => {
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify(
        {
          'pass.json': '8d5f4e3f2b1c0a9d8e7f6c5b4a3f2e1d0c9b8a7f',
          'icon.png': '36213fe35e1559e94c577c32e5fcc93c37e1f335',
          'icon@2x.png': '4b20f4b1b0f91d5e3c8c7f7e7e7e7e7e7e7e7e7e',
        },
        null,
        2,
      ),
    )
    const signatureBytes = await signManifest(manifestBytes, material)

    const manifestPath = writeFixtureFile('manifest2.bin', manifestBytes)
    const signaturePath = writeFixtureFile('signature2.bin', signatureBytes)

    execSync(
      `openssl cms -verify -in "${signaturePath}" -inform DER -content "${manifestPath}" -noverify -binary -out /dev/null`,
      { stdio: 'pipe' },
    )
  })

  it('signs an empty manifest (edge case)', async () => {
    const manifestBytes = new Uint8Array(0)
    const signatureBytes = await signManifest(manifestBytes, material)

    const manifestPath = writeFixtureFile('empty-manifest.bin', manifestBytes)
    const signaturePath = writeFixtureFile('empty-signature.bin', signatureBytes)

    execSync(
      `openssl cms -verify -in "${signaturePath}" -inform DER -content "${manifestPath}" -noverify -binary -out /dev/null`,
      { stdio: 'pipe' },
    )
  })

  it('produces DER starting with the ContentInfo SEQUENCE tag', async () => {
    const manifestBytes = new TextEncoder().encode('x')
    const signatureBytes = await signManifest(manifestBytes, material)
    // ContentInfo ::= SEQUENCE → tag 0x30 (universal, constructed)
    expect(signatureBytes[0]).toBe(0x30)
  })

  it('produces different signatures for the same manifest (signingTime differs)', async () => {
    const manifestBytes = new TextEncoder().encode('x')
    const first = await signManifest(manifestBytes, material)
    // Wait just enough to ensure signingTime second rolls over on slower machines
    await new Promise((r) => setTimeout(r, 1100))
    const second = await signManifest(manifestBytes, material)
    // Will differ because of signingTime and the resulting RSA signature
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false)
  })
})
