import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { SigningMaterial } from '../src/cms/material'
import { Pass } from '../src/pass'
import { type CmsFixtures, generateCmsFixtures, writeFixtureFile } from './cms/fixtures'

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FAKE_LOGO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00])
const FAKE_STRIP = new Uint8Array(256)

function sha1Hex(bytes: Uint8Array): string {
  return createHash('sha1').update(Buffer.from(bytes)).digest('hex')
}

/**
 * End-to-end: build a realistic pass with the fluent builder, sign it,
 * unzip the result in the test, verify every manifest hash matches its
 * file bytes, parse pass.json, and run openssl cms -verify on the
 * signature against the real manifest bytes.
 *
 * This is the single most important test in the library — it exercises
 * every module wired together.
 */
describe('end-to-end .pkpass assembly', () => {
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

  it('builds, signs, and openssl verifies a full event ticket pass', async () => {
    const signed = await Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.event',
      serialNumber: 'e2e-ticket-42',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint',
      description: 'End-to-end test event ticket',
      logoText: 'passmint',
      colors: {
        background: '#1a1a2e',
        foreground: '#ffffff',
        label: '#e94560',
      },
      expirationDate: '2026-12-31T23:59:59Z',
      images: {
        icon: {
          x2: { bytes: FAKE_ICON },
          x3: { bytes: FAKE_ICON },
        },
        logo: { x2: { bytes: FAKE_LOGO } },
        strip: { x2: { bytes: FAKE_STRIP } },
      },
      barcodes: [{ format: 'qr', message: 'E2E-TICKET-42' }],
      semantics: { eventName: 'passmint DevCon 2026', eventType: 'conference' },
    })
      .headerField({ key: 'gate', label: 'Gate', value: 'A12' })
      .primaryField({
        key: 'event',
        label: { default: 'Event', translations: { es: 'Evento', fr: 'Événement' } },
        value: 'DevCon 2026',
      })
      .secondaryField({ key: 'section', label: 'Section', value: 'VIP' })
      .secondaryField({ key: 'seat', label: 'Seat', value: '12A' })
      .auxiliaryField({
        key: 'date',
        label: 'Date',
        value: '2026-06-15T14:30:00Z',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      .backField({ key: 'terms', label: 'Terms', value: 'Non-refundable.' })
      .localize('es', { Section: 'Sección', Seat: 'Asiento', Date: 'Fecha' })
      .sign(material)

    const bytes = signed.toUint8Array()
    expect(bytes.length).toBeGreaterThan(0)

    // --- Unzip and inspect ---
    const entries = unzipSync(bytes)

    // Required files
    expect(entries['pass.json']).toBeDefined()
    expect(entries['manifest.json']).toBeDefined()
    expect(entries.signature).toBeDefined()

    // pass.json is well-formed and has Apple shape
    const passJson = JSON.parse(new TextDecoder().decode(entries['pass.json']!))
    expect(passJson.formatVersion).toBe(1)
    expect(passJson.passTypeIdentifier).toBe('pass.com.example.event')
    expect(passJson.backgroundColor).toBe('rgb(26, 26, 46)')
    expect(passJson.foregroundColor).toBe('rgb(255, 255, 255)')
    expect(passJson.labelColor).toBe('rgb(233, 69, 96)')
    expect(passJson.eventTicket).toBeDefined()
    expect(passJson.eventTicket.primaryFields[0].label).toBe('Event')
    expect(passJson.eventTicket.auxiliaryFields[0].dateStyle).toBe('PKDateStyleMedium')
    expect(passJson.barcodes[0].format).toBe('PKBarcodeFormatQR')
    expect(passJson.semanticTags.eventName).toBe('passmint DevCon 2026')

    // Images are present at the expected paths
    expect(entries['icon@2x.png']).toBeDefined()
    expect(entries['icon@3x.png']).toBeDefined()
    expect(entries['logo@2x.png']).toBeDefined()
    expect(entries['strip@2x.png']).toBeDefined()

    // Localizations are emitted as UTF-16 BE .strings files with BOM
    expect(entries['es.lproj/pass.strings']).toBeDefined()
    expect(entries['fr.lproj/pass.strings']).toBeDefined()
    const esStrings = entries['es.lproj/pass.strings']!
    expect(esStrings[0]).toBe(0xfe)
    expect(esStrings[1]).toBe(0xff)

    // --- Manifest integrity: every listed file hash must match its bytes ---
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']!))
    for (const [path, expectedHex] of Object.entries(manifest)) {
      expect(entries[path], `manifest references missing file: ${path}`).toBeDefined()
      expect(expectedHex).toMatch(/^[0-9a-f]{40}$/)
      expect(sha1Hex(entries[path]!)).toBe(expectedHex)
    }

    // manifest.json and signature must NOT be listed in the manifest
    expect(manifest['manifest.json']).toBeUndefined()
    expect(manifest.signature).toBeUndefined()

    // --- Signature verification via openssl ---
    const manifestPath = writeFixtureFile('e2e-manifest.bin', entries['manifest.json']!)
    const signaturePath = writeFixtureFile('e2e-signature.bin', entries.signature!)
    execSync(
      `openssl cms -verify -in "${signaturePath}" -inform DER -content "${manifestPath}" -noverify -binary -out /dev/null`,
      { stdio: 'pipe' },
    )
  })

  it('Pass.from() validates a raw input and produces the same output as the builder', async () => {
    const raw = {
      style: 'generic' as const,
      passTypeIdentifier: 'pass.com.example.generic',
      serialNumber: 'g-1',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Test generic pass',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    }
    const signed = await Pass.from(raw).sign(material)
    expect(signed.toUint8Array().length).toBeGreaterThan(0)
  })

  it('SignedPass.toResponse returns the correct headers and body', async () => {
    const signed = await Pass.generic({
      passTypeIdentifier: 'pass.com.example.generic',
      serialNumber: 'response-test',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Response test',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    }).sign(material)

    const response = signed.toResponse()
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.pkpass')
    expect(response.headers.get('content-disposition')).toContain('response-test.pkpass')
    const bodyBytes = new Uint8Array(await response.arrayBuffer())
    expect(bodyBytes.length).toBe(signed.toUint8Array().length)
  })

  it('SignedPass.toStream yields the full body in one chunk', async () => {
    const signed = await Pass.generic({
      passTypeIdentifier: 'pass.com.example.generic',
      serialNumber: 'stream-test',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Stream test',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    }).sign(material)

    const reader = signed.toStream().getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((n, c) => n + c.length, 0)
    expect(total).toBe(signed.toUint8Array().length)
  })
})
