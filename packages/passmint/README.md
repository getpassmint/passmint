<div align="center">

# passmint

**Apple Wallet + Google Wallet passes, from any JavaScript runtime.**

[![npm](https://img.shields.io/npm/v/passmint.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/passmint)
[![bundle](https://img.shields.io/bundlephobia/minzip/passmint?label=gzip)](https://bundlephobia.com/package/passmint)
[![types](https://img.shields.io/npm/types/passmint.svg)](https://www.npmjs.com/package/passmint)
[![license](https://img.shields.io/npm/l/passmint.svg)](./LICENSE)

</div>

One unified pass schema. Two outputs: a signed `.pkpass` for iOS and a Google Wallet save-link JWT for Android. Zero `node:*` imports, Web Crypto only.

```ts
const pass = Pass.eventTicket({ /* ... */ }).build()

await pass.sign(apple)                                  // .pkpass bytes
await pass.toGoogleSaveLink(google, { origins: [...] }) // pay.google.com URL
```

> **Status:** pre-1.0 alpha. API may change based on real-world feedback.

## Contents

- [Features](#features)
- [Install](#install)
- [Quickstart](#quickstart)
- [Apple Wallet](#apple-wallet)
- [Google Wallet](#google-wallet)
- [One schema, two wallets](#one-schema-two-wallets)
- [Pass styles](#pass-styles)
- [Runtimes](#runtimes)
- [Private keys](#private-keys)
- [Output formats](#output-formats)
- [Errors](#errors)
- [Escape hatch](#escape-hatch)
- [Examples](#examples)
- [FAQ](#faq)
- [License](#license)

## Features

- **Edge-native.** Runs on Cloudflare Workers, Vercel Edge, Deno, Bun, Supabase Edge, Netlify Edge, and Node 20+ without polyfills.
- **Web Crypto only.** No `node-forge`, no `node:crypto`, no `Buffer`. Just `Uint8Array`, `crypto.subtle`, `TextEncoder`.
- **One schema, two wallets.** A single `Pass` builds both an Apple `.pkpass` and a Google save-link JWT.
- **~21 KB gzipped.** Strict TypeScript, Valibot discriminated unions per pass style, typed error hierarchy.
- **Battery-included ergonomics.** Fluent builder (`Pass.eventTicket(...).primaryField(...)`) or raw object API (`Pass.from(...)`).

## Install

```sh
npm  install passmint
pnpm add     passmint
yarn add     passmint
bun  add     passmint
```

Requires Node 20+ or any edge runtime with Web Crypto.

## Quickstart

```ts
import { Pass, SigningMaterial } from 'passmint'

const material = await SigningMaterial.fromPem({
  signerCertPem: process.env.APPLE_PASS_CERT!,
  wwdrPem:       process.env.APPLE_WWDR_CERT!,
  privateKeyPkcs8Pem: process.env.APPLE_PASS_KEY!,
})

const signed = await Pass.eventTicket({
  passTypeIdentifier: 'pass.com.example.event',
  serialNumber:       crypto.randomUUID(),
  teamIdentifier:     'ABCD1234EF',
  organizationName:   'Example',
  description:        'Concert ticket',
  images:   { icon: { x2: { bytes: iconPng } } },
  barcodes: [{ format: 'qr', message: 'TICKET-xyz' }],
})
  .primaryField({ key: 'event', label: 'Event',    value: 'Beyoncé Live' })
  .secondaryField({ key: 'loc', label: 'Location', value: 'Apple Park' })
  .sign(material)

await Bun.write('ticket.pkpass', await signed.toUint8Array())
```

## Apple Wallet

On Cloudflare Workers, build signing material once per isolate and reuse it across requests:

```ts
import { Pass, SigningMaterial } from 'passmint'

let material: SigningMaterial | undefined

export default {
  async fetch(request: Request, env: Env) {
    material ??= await SigningMaterial.fromPem({
      signerCertPem:      env.APPLE_PASS_CERT,
      wwdrPem:            env.APPLE_WWDR_CERT,
      privateKeyPkcs8Pem: env.APPLE_PASS_KEY,
    })

    const signed = await Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.event',
      serialNumber:       crypto.randomUUID(),
      teamIdentifier:     'ABCD1234EF',
      organizationName:   'Example',
      description:        'Concert ticket',
      images:   { icon: { x2: { bytes: await loadIcon() } } },
      barcodes: [{ format: 'qr', message: 'TICKET-xyz' }],
    })
      .primaryField({ key: 'event', label: 'Event', value: 'Beyoncé Live' })
      .sign(material)

    return signed.toResponse()
  },
}
```

`toResponse()` sets `Content-Type: application/vnd.apple.pkpass` and a `Content-Disposition: attachment` header so the pass installs on tap.

## Google Wallet

```ts
import { Pass, GoogleSigningMaterial } from 'passmint'

const google = await GoogleSigningMaterial.fromServiceAccount({
  clientEmail:        serviceAccount.client_email,
  privateKeyPkcs8Pem: serviceAccount.private_key,
  issuerId:           '3388000000000000',
})

const pass = Pass.eventTicket({
  passTypeIdentifier: 'pass.com.example.event',
  serialNumber:       'ticket-42',
  teamIdentifier:     'ABCD1234EF',
  organizationName:   'Example',
  description:        'Concert ticket',
  logoText:           'Beyoncé Live',
  colors: { background: '#1a1a2e', foreground: '#ffffff' },
  images: {
    icon:      { x2: { bytes: iconPng } },
    heroImage: { url: 'https://cdn.example.com/hero.jpg' },
  },
  barcodes: [{ format: 'qr', message: 'TICKET-42' }],
}).build()

const url = await pass.toGoogleSaveLink(google, { origins: ['example.com'] })
// → "https://pay.google.com/gp/v/save/<jwt>"
```

Drop `url` into an `<a href>` with Google's "Add to Google Wallet" button and you're done.

## One schema, two wallets

The same `Pass` produces both outputs — write your pass definition once:

```ts
const pass = Pass.eventTicket({ /* ... */ }).build()

const apple  = await pass.sign(appleMaterial)
const google = await pass.toGoogleSaveLink(googleMaterial, {
  origins: ['example.com'],
})
```

## Pass styles

| Style                                 | Apple          | Google                                 |
| ------------------------------------- | -------------- | -------------------------------------- |
| `eventTicket`                         | event ticket   | `eventTicketClass` + `eventTicketObject` |
| `boardingPass` (`transitType: 'air'`) | boarding pass  | `flightClass` + `flightObject`          |
| `boardingPass` (train/bus/boat)       | boarding pass  | `transitClass` + `transitObject`        |
| `storeCard`                           | store card     | `loyaltyClass` + `loyaltyObject`        |
| `coupon`                              | coupon         | `offerClass` + `offerObject`            |
| `generic`                             | generic        | `genericClass` + `genericObject`        |

Per-style field-count limits are enforced at construction time, not at render.

## Runtimes

| Runtime                  | Status                              |
| ------------------------ | ----------------------------------- |
| Node.js 20+              | ✅                                   |
| Cloudflare Workers       | ✅ (CI runs inside real `workerd`)  |
| Vercel Edge Functions    | ✅                                   |
| Deno 1.40+ / Deno 2      | ✅                                   |
| Bun 1.0+                 | ✅                                   |
| Supabase Edge Functions  | ✅                                   |
| Netlify Edge Functions   | ✅                                   |

If your runtime ships Web Crypto, Web Streams, `fetch`, `Uint8Array`, and `TextEncoder`, it will run. Nothing from `node:*`, no `Buffer`.

## Private keys

Web Crypto doesn't accept PKCS#1, so Apple Pass Type ID keys and Google service account keys must be in **PKCS#8** PEM form. Convert once:

```sh
openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem
```

Handing `passmint` a PKCS#1 key throws `PassmintSigningError` with `code: 'E_UNSUPPORTED_KEY_FORMAT'` and this exact command in the message.

## Output formats

```ts
signed.toUint8Array()    // Promise<Uint8Array>
signed.toStream()        // ReadableStream<Uint8Array>
signed.toResponse(init?) // HTTP Response, content-type + content-disposition set
```

All three produce the same bytes. Pick whichever fits your runtime.

## Errors

Every throw extends `PassmintError` and carries a stable `code`:

```ts
import { PassmintSchemaError, PassmintSigningError } from 'passmint'

try {
  const signed = await pass.sign(material)
} catch (err) {
  if (err instanceof PassmintSchemaError) {
    // err.issues: full Valibot issue list for form-level errors
  } else if (err instanceof PassmintSigningError) {
    // err.code: 'E_KEY_IMPORT' | 'E_CERT_PARSE' | 'E_PEM_DECODE'
    //         | 'E_SIGN' | 'E_UNSUPPORTED_KEY_FORMAT'
  }
}
```

| Class                     | Thrown from                              |
| ------------------------- | ---------------------------------------- |
| `PassmintSchemaError`     | Input validation                         |
| `PassmintRenderError`     | Apple / Google render layer              |
| `PassmintSigningError`    | CMS signing, key import                  |
| `PassmintPackagingError`  | ZIP assembly                             |
| `PassmintGoogleError`     | Google save-link JWT                     |

## Escape hatch

For platform-specific fields the unified schema doesn't model (smart-tap redemption, rotating barcodes, Apple semantic tags added in a future iOS release):

```ts
Pass.eventTicket({
  // ...
  applyRaw: {
    apple:  { sharingProhibited: true },
    google: { smartTapRedemptionValue: 'nfc-payload' },
  },
})
```

`applyRaw.apple` deep-merges into `pass.json`. `applyRaw.google` deep-merges into the generated Google object.

## Examples

- [`examples/node`](../../examples/node) — Node scripts for both Apple `.pkpass` generation and Google save-link creation, with a README covering certificate setup.

## FAQ

**Does this work on Cloudflare Workers?**  
Yes. CI runs the full signing pipeline inside real `workerd` via `@cloudflare/vitest-pool-workers`.

**Do I need the Apple WWDR certificate?**  
Yes — `.pkpass` signatures are verified against Apple's intermediate CA. Download the current G4 WWDR cert from [developer.apple.com/certificationauthority](https://www.apple.com/certificateauthority/).

**Can I use a `.p12` file directly?**  
Not in this package — PKCS#12 parsing is Node-only territory and pulls in `node-forge`, which we explicitly avoid. Convert once with `openssl pkcs12 -in cert.p12 -out cert.pem -nodes`, then extract the key to PKCS#8.

**Why Valibot instead of Zod?**  
Tree-shakable (~21 KB total bundle vs. ~35 KB with Zod), and the discriminated-union ergonomics for per-style field limits are cleaner.

**Does this handle the Apple webservice protocol (device registration + APNs push)?**  
Not yet — that's planned for a sibling `@passmint/webservice` package. This library is the pass-generation layer only.

## License

MIT
