#!/usr/bin/env node
/**
 * Generate a sample .pkpass file using `passmint` and write it to disk.
 *
 * Usage:
 *   node generate.mjs
 *
 * Required environment variables:
 *   PASSMINT_SIGNER_CERT   Path to Pass Type ID cert PEM
 *   PASSMINT_WWDR_CERT     Path to Apple WWDR intermediate PEM
 *   PASSMINT_PRIVATE_KEY   Path to PKCS#8 private key PEM
 *   PASSMINT_TEAM_ID       10-character Apple Team ID
 *   PASSMINT_PASS_TYPE     pass.* reverse-DNS identifier
 *
 * Optional:
 *   PASSMINT_OUT           Output path (default: ./sample.pkpass)
 *   PASSMINT_ICON          Path to a PNG for icon@2x (29x29 pt / 58x58 px)
 *                          Falls back to a tiny transparent PNG if unset.
 *
 * After generating: AirDrop sample.pkpass to your iPhone (or email it
 * to yourself). iOS Wallet will offer an "Add" button if the signature
 * + cert chain verify against Apple's trust store.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Pass, SigningMaterial } from 'passmint'

function need(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

// Minimal 1x1 transparent PNG — fallback so the example runs without an icon file.
const TRANSPARENT_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

const iconBytes = process.env.PASSMINT_ICON
  ? new Uint8Array(readFileSync(process.env.PASSMINT_ICON))
  : TRANSPARENT_PNG

const material = await SigningMaterial.fromPem({
  signerCertPem: readFileSync(need('PASSMINT_SIGNER_CERT'), 'utf8'),
  wwdrPem: readFileSync(need('PASSMINT_WWDR_CERT'), 'utf8'),
  privateKeyPkcs8Pem: readFileSync(need('PASSMINT_PRIVATE_KEY'), 'utf8'),
})

const signed = await Pass.eventTicket({
  passTypeIdentifier: need('PASSMINT_PASS_TYPE'),
  serialNumber: randomUUID(),
  teamIdentifier: need('PASSMINT_TEAM_ID'),
  organizationName: 'passmint',
  description: 'passmint sample event ticket',
  logoText: 'passmint',
  colors: {
    background: '#1a1a2e',
    foreground: '#ffffff',
    label: '#e94560',
  },
  images: {
    icon: { x2: { bytes: iconBytes } },
  },
  barcodes: [{ format: 'qr', message: 'sample-ticket-1' }],
})
  .primaryField({
    key: 'event',
    label: 'Event',
    value: 'passmint Test Event',
  })
  .secondaryField({ key: 'location', label: 'Location', value: 'San Francisco' })
  .auxiliaryField({
    key: 'date',
    label: 'Date',
    value: new Date().toISOString(),
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  .sign(material)

const outPath = process.env.PASSMINT_OUT ?? './sample.pkpass'
writeFileSync(outPath, signed.toUint8Array())
console.log(`Wrote ${outPath} (${signed.toUint8Array().length} bytes)`)
console.log('')
console.log('Next steps:')
console.log(`  1. AirDrop ${outPath} to your iPhone, or email it to yourself.`)
console.log('  2. Tap the file. iOS Wallet should prompt "Add".')
console.log('  3. If Wallet rejects it, check that the cert chain and pass')
console.log("     type identifier match your Pass Type ID cert's Common Name.")
