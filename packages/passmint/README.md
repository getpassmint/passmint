# passmint

**Apple Wallet + Google Wallet pass generation for every JavaScript runtime.**

- 🌐 **Edge-native.** Zero `node:*` imports. Runs on Cloudflare Workers, Vercel Edge, Deno, Bun, Supabase Edge, Netlify Edge, and Node 20+ with no polyfills.
- 🔐 **Web Crypto only.** No `node-forge`, no `node:crypto`. Pure `Uint8Array`, `crypto.subtle`, and `TextEncoder`.
- 🧩 **One schema, two outputs.** A single pass input produces a signed `.pkpass` for iOS and a Google Wallet save-link JWT for Android.
- 📦 **~21 KB gzipped.** Strict TypeScript, Valibot discriminated unions per pass style, typed error hierarchy.

> **Status:** pre-1.0 alpha. The public API may change based on real-world feedback.

## Install

```sh
npm i passmint
```

Node 20+, or any edge runtime that supports Web Crypto.

## Apple Wallet — Cloudflare Workers

```ts
import { Pass, SigningMaterial } from 'passmint'

// Build signing material once per worker instance and reuse across requests.
let material: SigningMaterial | undefined

export default {
  async fetch(request: Request, env: Env) {
    material ??= await SigningMaterial.fromPem({
      signerCertPem: env.APPLE_PASS_CERT,
      wwdrPem: env.APPLE_WWDR_CERT,
      privateKeyPkcs8Pem: env.APPLE_PASS_KEY,
    })

    const signed = await Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.event',
      serialNumber: crypto.randomUUID(),
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Concert ticket',
      images: {
        icon: { x2: { bytes: iconBytes } },
      },
      barcodes: [{ format: 'qr', message: 'TICKET-xyz' }],
    })
      .primaryField({ key: 'event', label: 'Event', value: 'Beyoncé Live' })
      .secondaryField({ key: 'loc', label: 'Location', value: 'Apple Park' })
      .sign(material)

    return signed.toResponse()
    // Response has Content-Type: application/vnd.apple.pkpass
    // and a Content-Disposition attachment filename set.
  },
}
```

## Google Wallet — save-link JWT

```ts
import { Pass, GoogleSigningMaterial } from 'passmint'

const google = await GoogleSigningMaterial.fromServiceAccount({
  clientEmail: serviceAccount.client_email,
  privateKeyPkcs8Pem: serviceAccount.private_key,
  issuerId: '3388000000000000',
})

const pass = Pass.eventTicket({
  passTypeIdentifier: 'pass.com.example.event',
  serialNumber: 'ticket-42',
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'Example',
  description: 'Concert ticket',
  logoText: 'Beyoncé Live',
  colors: { background: '#1a1a2e', foreground: '#ffffff' },
  images: {
    icon: { x2: { bytes: iconBytes } },
    heroImage: { url: 'https://cdn.example.com/hero.jpg' },
  },
  barcodes: [{ format: 'qr', message: 'TICKET-42' }],
}).build()

const url = await pass.toGoogleSaveLink(google, { origins: ['example.com'] })
// → "https://pay.google.com/gp/v/save/<jwt>"
```

Note that the same `Pass` can produce both outputs — one schema, two wallets.

```ts
const pass = Pass.eventTicket({ /* ... */ }).build()

const apple = await pass.sign(appleMaterial)     // → SignedPass (.pkpass bytes)
const google = await pass.toGoogleSaveLink(      // → URL string
  googleMaterial,
  { origins: ['example.com'] },
)
```

## Pass styles

| Style | Apple | Google |
|---|---|---|
| `eventTicket` | event ticket | `eventTicketClass` + `eventTicketObject` |
| `boardingPass` (`transitType: 'air'`) | boarding pass | `flightClass` + `flightObject` |
| `boardingPass` (train/bus/boat) | boarding pass | `transitClass` + `transitObject` |
| `storeCard` | store card | `loyaltyClass` + `loyaltyObject` |
| `coupon` | coupon | `offerClass` + `offerObject` |
| `generic` | generic | `genericClass` + `genericObject` |

Per-style field-count limits are enforced at construction time, not at render.

## Supported runtimes

| Runtime | Tested |
|---|---|
| Node.js 20+ | ✅ |
| Cloudflare Workers | ✅ (CI runs inside real `workerd`) |
| Vercel Edge Functions | ✅ |
| Deno 1.40+ / Deno 2 | ✅ |
| Bun 1.0+ | ✅ |
| Supabase Edge Functions | ✅ |
| Netlify Edge Functions | ✅ |

`passmint` imports **nothing** from `node:*` and uses no `Buffer`. If your runtime
ships Web Crypto, Web Streams, `fetch`, `Uint8Array`, and `TextEncoder`, it will run.

## Private key format

Apple Pass Type ID keys and Google service account keys must be in **PKCS#8** PEM
form — Web Crypto doesn't accept PKCS#1. Convert with:

```sh
openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem
```

If you hand `passmint` a PKCS#1 key, it will refuse with an error message that
includes this exact command.

## Output formats

All three reach the same bytes — pick whichever fits your runtime:

```ts
signed.toUint8Array()        // Promise<Uint8Array>
signed.toStream()            // ReadableStream<Uint8Array>
signed.toResponse(init?)     // HTTP Response with correct headers
```

## Error handling

Every throw from `passmint` extends `PassmintError` and has a stable `code`:

```ts
import { PassmintSchemaError, PassmintSigningError } from 'passmint'

try {
  const signed = await pass.sign(material)
} catch (err) {
  if (err instanceof PassmintSchemaError) {
    // err.issues is the full Valibot issue list for form-level errors
  } else if (err instanceof PassmintSigningError) {
    // err.code is one of: E_KEY_IMPORT, E_CERT_PARSE, E_PEM_DECODE,
    // E_SIGN, E_UNSUPPORTED_KEY_FORMAT
  }
}
```

## Escape hatch

For platform-specific fields the unified schema doesn't model directly
(smart-tap redemption, rotating barcodes, Apple semantic tags added in a
future iOS release):

```ts
Pass.eventTicket({
  // ...
  applyRaw: {
    apple: { sharingProhibited: true },
    google: { smartTapRedemptionValue: 'nfc-payload' },
  },
})
```

`applyRaw.apple` is deep-merged into `pass.json`. `applyRaw.google` is deep-merged
into the generated Google object definition.

## License

MIT
