#!/usr/bin/env node
/**
 * Generate a Google Wallet "Add to Google Wallet" save-link URL for a
 * sample event ticket, using `passmint` and a real Google Cloud service
 * account key.
 *
 * Usage:
 *   node google.mjs
 *
 * Required environment variables:
 *   PASSMINT_GOOGLE_CREDENTIALS  Path to a service account JSON file
 *                                downloaded from Google Cloud Console.
 *                                Must include `client_email`, `private_key`.
 *   PASSMINT_GOOGLE_ISSUER_ID    Numeric Google Wallet issuer ID from the
 *                                Google Pay & Wallet Console.
 *
 * Optional:
 *   PASSMINT_GOOGLE_ORIGIN       Origin domain for the JWT (default:
 *                                example.com). Google checks this against
 *                                the referring page that serves the link.
 *   PASSMINT_GOOGLE_CLASS_SUFFIX Stable suffix for the class ID. Useful
 *                                in production to reuse a class across
 *                                many objects (default: derived from the
 *                                serial number).
 *
 * The script prints the full save URL to stdout. Visit it in a browser
 * while signed into a Google account — if the cert material + issuer ID
 * are correct, Google Wallet will offer to add the pass. Any error from
 * Google's side (issuer not authorized for the pass type, malformed
 * JWT, etc.) shows up on the landing page.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { GoogleSigningMaterial, Pass } from 'passmint'

function need(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

const credentialsPath = need('PASSMINT_GOOGLE_CREDENTIALS')
const issuerId = need('PASSMINT_GOOGLE_ISSUER_ID')
const origin = process.env.PASSMINT_GOOGLE_ORIGIN ?? 'example.com'

let credentials
try {
  credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
} catch (err) {
  console.error(`Failed to read ${credentialsPath}: ${err.message}`)
  process.exit(1)
}

if (!credentials.client_email || !credentials.private_key) {
  console.error(
    'Credentials file missing client_email or private_key. Download a fresh service account key JSON from Google Cloud Console.',
  )
  process.exit(1)
}

const material = await GoogleSigningMaterial.fromServiceAccount({
  clientEmail: credentials.client_email,
  privateKeyPkcs8Pem: credentials.private_key,
  issuerId,
})

const serialNumber = randomUUID()

const pass = Pass.eventTicket({
  passTypeIdentifier: 'pass.com.example.google-demo',
  serialNumber,
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'passmint',
  description: 'passmint sample Google Wallet event ticket',
  logoText: 'passmint',
  colors: {
    background: '#1a1a2e',
    foreground: '#ffffff',
    label: '#e94560',
  },
  images: {
    // Google Wallet requires HTTPS-hosted images. We pass a single
    // placeholder icon here via URL — in production you'd host your
    // own at a stable CDN path.
    icon: { x2: { url: 'https://dummyimage.com/116x116/1a1a2e/ffffff.png&text=PM' } },
    heroImage: { url: 'https://dummyimage.com/1032x336/1a1a2e/ffffff.png&text=passmint' },
  },
  barcodes: [{ format: 'qr', message: `GOOGLE-${serialNumber}` }],
})
  .primaryField({ key: 'event', label: 'Event', value: 'passmint Test Event' })
  .secondaryField({ key: 'location', label: 'Location', value: 'San Francisco' })
  .auxiliaryField({
    key: 'date',
    label: 'Date',
    value: new Date().toISOString(),
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  .build()

const saveLinkOptions = { origins: [origin] }
if (process.env.PASSMINT_GOOGLE_CLASS_SUFFIX) {
  saveLinkOptions.classSuffix = process.env.PASSMINT_GOOGLE_CLASS_SUFFIX
}

const url = await pass.toGoogleSaveLink(material, saveLinkOptions)

console.log(url)
console.log('')
console.log('Next steps:')
console.log('  1. Open the URL above in a browser signed into a Google account.')
console.log('  2. If the issuer ID + service account are correctly wired up in')
console.log('     Google Pay & Wallet Console, Wallet will offer "Save to Google Wallet".')
console.log('  3. If Google shows an error page, common causes:')
console.log('       - Service account not added as "Developer" in the Wallet Console')
console.log('       - Issuer ID mismatch')
console.log("       - Origin not on the issuer's approved list")
