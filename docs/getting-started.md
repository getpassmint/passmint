# Getting started with passmint

This guide walks you end-to-end from an empty project to a working Apple Wallet `.pkpass` and a working Google Wallet save link. It covers the parts that aren't code — Apple Developer, Google Pay & Wallet Console, certificate wrangling — because that's usually where people get stuck.

By the end you'll have:

1. A signed `.pkpass` you can install on your iPhone.
2. A `pay.google.com/gp/v/save/…` link that adds a pass to Google Wallet.
3. Both generated from a single `Pass` definition, running on any JavaScript runtime with Web Crypto.

- [1. Prerequisites](#1-prerequisites)
- [2. Key terms](#2-key-terms)
- [3. Install passmint](#3-install-passmint)
- [4. Apple Wallet setup](#4-apple-wallet-setup)
- [5. Your first `.pkpass`](#5-your-first-pkpass)
- [6. Serving the pass from an HTTP endpoint](#6-serving-the-pass-from-an-http-endpoint)
- [7. Google Wallet setup](#7-google-wallet-setup)
- [8. Your first Google save link](#8-your-first-google-save-link)
- [9. One schema, two wallets](#9-one-schema-two-wallets)
- [10. Images, colors, and barcodes](#10-images-colors-and-barcodes)
- [11. Troubleshooting](#11-troubleshooting)
- [Next steps](#next-steps)

---

## 1. Prerequisites

You need:

- **Node 20+** (or any edge runtime with Web Crypto — Cloudflare Workers, Vercel Edge, Deno, Bun, Supabase/Netlify Edge all work).
- **`openssl`** on your `PATH` for one-time certificate and key conversion.
- An **Apple Developer account** ($99/year) if you want to ship `.pkpass` files.
- A **Google Cloud project** and a **Google Pay & Wallet Console** issuer account if you want Google Wallet.

You can do Apple-only or Google-only — they're independent. If you only care about one, skip the other section.

## 2. Key terms

Wallet pass tooling throws a lot of jargon at you. Here's the short version of everything you'll see below, so the rest of the guide makes sense.

**Apple side**

- **`.pkpass`** — the file format iOS Wallet installs. It's a zip containing `pass.json` (the pass definition), images, a `manifest.json` (SHA-1 hashes of every file), and a `signature` (a CMS/PKCS#7 signature over the manifest). passmint builds all of this for you.
- **Pass Type ID** — a reverse-DNS identifier like `pass.com.yourcompany.ticket` that identifies a *kind* of pass your team issues. You create it in the Apple Developer portal. Every `.pkpass` must declare one.
- **Pass Type ID certificate** — an X.509 certificate Apple issues to you, scoped to a specific Pass Type ID. The private key for this certificate is what signs your passes.
- **Team ID** — your Apple Developer team's 10-character identifier (e.g. `ABCD1234EF`). Shown top-right of the developer portal. Must be embedded in every pass as `teamIdentifier`.
- **WWDR** — Apple's *Worldwide Developer Relations* intermediate certificate authority. Your Pass Type ID cert is signed by WWDR, which is in turn signed by Apple's root. iOS verifies the whole chain when installing a pass, so you have to ship the WWDR cert inside your signing material.
- **CSR** (Certificate Signing Request) — a file you generate locally that contains your public key and identity info. You upload it to Apple, Apple signs it, and hands you back a certificate. The private key never leaves your machine.
- **PKCS#1 / PKCS#8 / PKCS#12** — three different file formats for RSA private keys. Web Crypto (and therefore passmint) only accepts **PKCS#8** (`-----BEGIN PRIVATE KEY-----`). PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) and PKCS#12 (`.p12` bundles) need to be converted once with `openssl`.
- **CMS signing** — Cryptographic Message Syntax, aka PKCS#7. The kind of detached signature a `.pkpass` needs. You don't need to care about the details — passmint handles the encoding.

**Google side**

- **Issuer** — your account in the Google Pay & Wallet Console. Identified by a numeric **issuer ID** like `3388000000022xxx`. Every pass you create is owned by an issuer.
- **Pass class** — the template for a kind of pass (e.g. "Beyoncé 2026 tour ticket"). Think of it as a reusable schema — shared fields, images, branding.
- **Pass object** — an instance of a class, one per user/ticket. Has its own serial, barcode, and any per-object field overrides.
- **Save link** — a URL shaped like `https://pay.google.com/gp/v/save/<jwt>`. The `<jwt>` is a short JSON Web Token signed by your service account that tells Google "this user is allowed to save this object". passmint builds the class, the object, and the JWT — you just hand the resulting URL to a user.
- **Service account** — a Google Cloud identity (not a human) with its own email and private key. This is what signs the save-link JWT. You authorize the service account's email as a Developer on your Wallet issuer so it's allowed to mint passes.
- **Origin** — a domain you've registered with your issuer. Google checks that save links are loaded from a registered origin. You pass this to `toGoogleSaveLink` as the `origins` array.

## 3. Install passmint

```sh
npm  install passmint
pnpm add     passmint
yarn add     passmint
bun  add     passmint
```

passmint is ESM-only and ships types. No peer dependencies, no `node:*` imports, ~21 KB gzipped.

## 4. Apple Wallet setup

You need three files before you can sign a `.pkpass`:

1. Your **Pass Type ID certificate** (PEM).
2. The **Apple WWDR G4 intermediate certificate** (PEM).
3. Your **private key** in **PKCS#8** PEM form — the one generated alongside your CSR in step 4b.

Work through the following in order. You only do this once per Pass Type ID.

### 4a. Create a Pass Type ID

1. Sign in to [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. Create a new identifier of type **Pass Type IDs**. Use a reverse-DNS string, e.g. `pass.com.yourcompany.ticket`. Write this down — you'll pass it as `passTypeIdentifier` in code.
3. Note your 10-character **Team ID** (top-right of the developer portal). You'll pass it as `teamIdentifier` in code, and you'll also use it as the `CN` in the CSR below.

### 4b. Generate a key and a Certificate Signing Request

You can do this through Keychain Access on macOS, or from the command line on any platform. The CLI version:

```sh
# 1. Generate a 2048-bit RSA private key
openssl genrsa -out pass.key 2048

# 2. Generate a CSR for Apple to sign.
#    Replace <YOUR_TEAM_ID> with your 10-character Apple Team ID (e.g. ABCD1234EF)
#    and <you@example.com> with the email on your Apple Developer account.
openssl req -new -key pass.key -out pass.csr \
  -subj "/emailAddress=<you@example.com>/CN=<YOUR_TEAM_ID>/C=US"
```

`pass.key` is your private key. `pass.csr` contains your public key and the subject line above, which is what you'll upload to Apple.

> **Why these values?** A CSR's subject line tells the CA who you are. For a Pass Type ID certificate the useful identifying field is your Team ID — it's the stable identifier Apple already knows you by. Don't copy the literal string `<YOUR_TEAM_ID>` into the command; substitute your actual Team ID. The email should be the one on your Apple Developer account.

### 4c. Upload the CSR and download the certificate

1. On the Pass Type ID's page in the developer portal, click **Create Certificate** and upload `pass.csr`.
2. Download the resulting file (Apple delivers it as `pass.cer` in DER form).
3. Convert it to PEM so passmint can read it:

   ```sh
   openssl x509 -inform DER -in pass.cer -out signerCert.pem
   ```

### 4d. Convert the private key to PKCS#8

Web Crypto does not accept PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), which is what `openssl genrsa` produces. Convert once:

```sh
openssl pkcs8 -topk8 -nocrypt -in pass.key -out signerKey.pem
```

The resulting file should start with `-----BEGIN PRIVATE KEY-----`. If you hand passmint a PKCS#1 key it will throw `PassmintSigningError` with `code: 'E_UNSUPPORTED_KEY_FORMAT'` and print this exact conversion command in the message.

### 4e. Download the Apple WWDR certificate

Grab the current **G4** WWDR intermediate from [apple.com/certificateauthority](https://www.apple.com/certificateauthority/) and convert it to PEM:

```sh
curl -o AppleWWDRCAG4.cer https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

At this point you should have three files: `signerCert.pem`, `signerKey.pem`, `wwdr.pem`. Store their contents as secrets in your runtime (env vars, Workers secrets, Vercel env, etc.) — never commit them.

## 5. Your first `.pkpass`

This example works unchanged on Node, Bun, Deno, Cloudflare Workers, Vercel Edge, and any runtime with Web Crypto. The only thing that changes is how you load the PEM strings and where you write the output — the passmint codepath is identical everywhere.

```ts
import { Pass, SigningMaterial } from 'passmint'

const material = await SigningMaterial.fromPem({
  signerCertPem:      process.env.APPLE_PASS_CERT!,
  wwdrPem:            process.env.APPLE_WWDR_CERT!,
  privateKeyPkcs8Pem: process.env.APPLE_PASS_KEY!,
})

const iconPng: Uint8Array = /* load a 58x58 PNG from disk, KV, R2, … */

const signed = await Pass.eventTicket({
  passTypeIdentifier: 'pass.com.yourcompany.ticket', // ← your Pass Type ID
  serialNumber:       crypto.randomUUID(),           // ← unique per issued pass
  teamIdentifier:     'ABCD1234EF',                  // ← your 10-char Team ID
  organizationName:   'Your Company',
  description:        'Concert ticket',
  logoText:           'Beyoncé Live',
  colors: {
    background: '#1a1a2e',
    foreground: '#ffffff',
    label:      '#e94560',
  },
  images: {
    icon: { x2: { bytes: iconPng } },
  },
  barcodes: [{ format: 'qr', message: 'TICKET-0001' }],
})
  .primaryField({   key: 'event',    label: 'Event',    value: 'Beyoncé Live' })
  .secondaryField({ key: 'location', label: 'Location', value: 'Apple Park' })
  .auxiliaryField({ key: 'date',     label: 'Date',     value: '2026-06-12T20:00:00Z', dateStyle: 'medium', timeStyle: 'short' })
  .sign(material)

const bytes = await signed.toUint8Array()
```

`SigningMaterial.fromPem` parses your cert chain and imports the private key through `crypto.subtle`. `Pass.eventTicket(...)` opens a fluent builder with per-style field limits enforced at construction time. `.sign(material)` assembles `pass.json`, hashes every file into `manifest.json`, signs that manifest with CMS, zips the result, and hands you a `SignedPass` object.

Write `bytes` to disk, stream it, or hand it back from an HTTP handler. To test on a real device, AirDrop the file to your iPhone or email it to yourself — Wallet will prompt "Add" if the signature and cert chain verify.

### Field limits per style

passmint validates field counts at construction time. Apple's own limits are style-specific (e.g. an `eventTicket` allows only one primary field, a `boardingPass` allows two). Hand-authoring `pass.json` lets you exceed these and then discover the silent render failure on-device; passmint throws `PassmintSchemaError` before you ever sign.

## 6. Serving the pass from an HTTP endpoint

`toResponse()` returns a standard `Response` with the right `Content-Type: application/vnd.apple.pkpass` and a `Content-Disposition: attachment` header, so users who tap a link on iOS get an install prompt instead of a zip download:

```ts
export default {
  async fetch(request: Request, env: Env) {
    const material = await SigningMaterial.fromPem({
      signerCertPem:      env.APPLE_PASS_CERT,
      wwdrPem:            env.APPLE_WWDR_CERT,
      privateKeyPkcs8Pem: env.APPLE_PASS_KEY,
    })

    const signed = await Pass.eventTicket({ /* … */ }).sign(material)
    return signed.toResponse()
  },
}
```

On long-lived runtimes (Workers isolates, Node servers), cache the `SigningMaterial` across requests — `fromPem` parses certs and imports the key through `crypto.subtle`, so you don't want to do it on every request:

```ts
let material: SigningMaterial | undefined
material ??= await SigningMaterial.fromPem({ /* … */ })
```

## 7. Google Wallet setup

Unlike Apple, Google Wallet doesn't use a signed bundle file. Instead you create a **pass class** (template) and a **pass object** (instance), then sign a short JWT that says "let this user save this object" and put that JWT in a `pay.google.com/gp/v/save/<jwt>` URL. passmint builds the class, the object, and the JWT for you — but Google still needs you to tell it who you are.

### 7a. Create a Wallet issuer

1. Go to [Google Pay & Wallet Console](https://pay.google.com/business/console/) and enable Google Wallet API access.
2. Accept the terms. You'll be assigned a numeric **issuer ID** — something like `3388000000022xxx`. Write it down.

### 7b. Create a service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project.
2. Enable the **Google Wallet API** for that project.
3. Go to **IAM & Admin → Service accounts**, create a new service account, and download a JSON key. It looks like:

   ```json
   {
     "client_email": "wallet-signer@my-project.iam.gserviceaccount.com",
     "private_key":  "-----BEGIN PRIVATE KEY-----\nMIIE…",
     …
   }
   ```

   The `private_key` is already in PKCS#8 form (that's Google's default), so no `openssl` conversion needed.

### 7c. Authorize the service account as a Wallet developer

Back in the Pay & Wallet Console, open **Users** for your issuer and add the service account's `client_email` as a **Developer**. Without this step Google will return `unauthorized` when you try to use the save link.

### 7d. Register an origin

In the Pay & Wallet Console, register at least one domain origin (e.g. `yourdomain.com`). You'll pass it to `toGoogleSaveLink(…, { origins: [...] })`. Google checks the origin the user loads the save link from against this list.

## 8. Your first Google save link

```ts
import { Pass, GoogleSigningMaterial } from 'passmint'

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)

const google = await GoogleSigningMaterial.fromServiceAccount({
  clientEmail:        serviceAccount.client_email,
  privateKeyPkcs8Pem: serviceAccount.private_key,
  issuerId:           '3388000000022xxx', // ← your issuer ID
})

const pass = Pass.eventTicket({
  passTypeIdentifier: 'pass.com.yourcompany.ticket',
  serialNumber:       'ticket-42',
  teamIdentifier:     'ABCD1234EF',
  organizationName:   'Your Company',
  description:        'Concert ticket',
  logoText:           'Beyoncé Live',
  colors: { background: '#1a1a2e', foreground: '#ffffff' },
  images: {
    icon:      { x2: { bytes: iconPng } },
    heroImage: { url: 'https://cdn.yourdomain.com/hero.jpg' },
  },
  barcodes: [{ format: 'qr', message: 'TICKET-42' }],
}).build()

const url = await pass.toGoogleSaveLink(google, {
  origins: ['yourdomain.com'],
})
// → https://pay.google.com/gp/v/save/<jwt>
```

Drop `url` into an `<a href>` behind Google's "Add to Google Wallet" button. Opening it in a browser signed into a Google account will offer to save the pass.

Notes:

- `heroImage` on Google is a hosted URL, not bytes — Google's rendering pipeline fetches it at display time.
- `passTypeIdentifier` and `serialNumber` are reused as the Google class and object IDs under the hood, so the same ticket has a stable identity on both platforms.
- `.build()` returns a platform-neutral `Pass` — the same object you could also `.sign()` for Apple. The fluent chain (`.primaryField`, `.secondaryField`, …) works before `.build()` or `.sign()` interchangeably.

## 9. One schema, two wallets

The point of passmint is that you write your pass definition once and fan out to both platforms:

```ts
const pass = Pass.eventTicket({
  passTypeIdentifier: 'pass.com.yourcompany.ticket',
  serialNumber:       ticketId,
  teamIdentifier:     'ABCD1234EF',
  organizationName:   'Your Company',
  description:        'Concert ticket',
  logoText:           'Beyoncé Live',
  colors: { background: '#1a1a2e', foreground: '#ffffff' },
  images: {
    icon:      { x2: { bytes: iconPng } },
    heroImage: { url: 'https://cdn.yourdomain.com/hero.jpg' },
  },
  barcodes: [{ format: 'qr', message: ticketId }],
})
  .primaryField({   key: 'event', label: 'Event',    value: 'Beyoncé Live' })
  .secondaryField({ key: 'loc',   label: 'Location', value: 'Apple Park' })
  .build()

const apple  = await pass.sign(appleMaterial)
const google = await pass.toGoogleSaveLink(googleMaterial, { origins: ['yourdomain.com'] })

// Hand `apple.toResponse()` to iOS and `google` (the URL) to Android.
```

A common pattern is user-agent sniffing in a single `/pass/:id` route: iOS gets the `.pkpass`, Android gets a redirect to the save link.

## 10. Images, colors, and barcodes

- **Icon is mandatory.** At minimum supply `images.icon.x2` as a 58×58 PNG (Apple's `@2x` icon). passmint raises a schema error if you forget it.
- **PNG bytes for Apple, URLs for Google.** Apple embeds images inside the `.pkpass` zip; Google references them by URL. `images.icon` accepts `{ x2: { bytes } }`; `images.heroImage` accepts `{ url }`.
- **Colors are CSS hex strings.** passmint converts to the `rgb(r, g, b)` form Apple expects automatically.
- **Barcodes.** `format: 'qr' | 'pdf417' | 'aztec' | 'code128'`. Apple renders the first one; Google takes the first QR/barcode it can map.
- **Dates.** Use ISO-8601 strings with `dateStyle` / `timeStyle` so both wallets render locale-aware.

## 11. Troubleshooting

**"This pass cannot be installed on iPhone."** Almost always one of: (a) `passTypeIdentifier` in your code doesn't match the Pass Type ID the certificate was issued for, (b) wrong WWDR intermediate (make sure you're using the current G4), (c) system clock skew on your signing machine. You can inspect a `.pkpass` with `unzip sample.pkpass -d sample` and check `pass.json` — that's the JSON file Apple reads to render the pass.

**`PassmintSigningError` with `code: 'E_UNSUPPORTED_KEY_FORMAT'`.** Your key is PKCS#1 (starts with `-----BEGIN RSA PRIVATE KEY-----`). Run `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem` and use the output.

**`PassmintSchemaError`.** You handed the builder an invalid shape — a missing required field, an exceeded field-count limit, or an unknown style. The `issues` array is a standard Valibot issue list — each entry has a `path` telling you which field is wrong.

**Google "Something went wrong" landing page.** The service account isn't authorized as a Developer on your issuer. Open the Pay & Wallet Console, find your issuer, and add the `client_email` under Users.

**Google origin check failure.** The `origins` array you pass to `toGoogleSaveLink` must include a domain registered on the issuer, or at least a domain you'll be serving the save link from.

**Can I use a `.p12` file directly?** Not in passmint — PKCS#12 parsing would pull in `node-forge` and break edge-runtime support. Extract once with `openssl pkcs12 -in cert.p12 -out cert.pem -nodes`, then pull the key into PKCS#8 per step 4d.

**Do I need Apple's webservice protocol (device registration, APNs updates)?** Only if you want to push pass updates to already-installed passes. That's a separate server you run. It's planned for a sibling `@passmint/webservice` package — passmint itself is the pass-generation layer.

## Next steps

- Read the [package README](../packages/passmint/README.md) for the full API reference, pass styles, error hierarchy, and the `applyRaw` escape hatch for platform-specific fields the unified schema doesn't model.
- Browse [`examples/node`](../examples/node) for runnable Apple and Google scripts wired to real certs.
- File issues at [github.com/getpassmint/passmint/issues](https://github.com/getpassmint/passmint/issues) — the library is pre-1.0 and feedback shapes the API.
