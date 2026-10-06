# passmint

## 0.6.0

### Minor Changes

- aa60997: Add `images.googleObject` for per-pass Google Wallet images that don't touch the class: `heroImage` (overrides the class hero on one object), `logo` (generic objects only, e.g. a member photo; other styles throw `E_GOOGLE_RENDER`) and `imageModules` (rendered as `imageModulesData`). Each field can be set to `null` to clear it explicitly: the object falls back to its default image, or gets `null` so a REST PATCH removes it. New exported types: `GoogleObjectImages`, `GoogleImageModule`.
- ea09487: Check that the WWDR intermediate actually issued the signer certificate. `SigningMaterial.fromPem` now verifies that the signer's issuer DN matches the WWDR's subject and that the signer's signature verifies against the WWDR's public key, and throws `PassmintSigningError` with the new code `E_WWDR_MISMATCH` (naming both certificates) when they don't. `fromParsed` checks the DN up front and the signature on the first `signManifest` call. Previously a mismatched pair (e.g. a G4-issued Pass Type ID certificate bundled with the G3 intermediate) signed without error and produced a pass Wallet refused to install, so inputs that used to be accepted can now throw. Docs now tell you to download the intermediate that issued your certificate rather than G3.
  
  Fix the Apple barcode format for `itf`: it now renders as Apple's documented `PKBarcodeFormatI2of5` instead of the undocumented `PKBarcodeFormatITF`. The public `itf` name and Google's `ITF_14` mapping are unchanged.

### Patch Changes

- 862fa5d: Fix Google Wallet logo and hero field names. Every class used to get `programLogo` and `heroImage`, which only `loyaltyClass` supports under those names, so Google rejected classes with a logo or hero for the other types. The logo now goes to `titleImage` on offers, `logo` on event tickets and transit, `flightHeader.carrier.airlineLogo` on flights, and the generic object's `logo` (`genericClass` has no image fields, so the generic hero moves to the object too). For non-generic types the hero is now emitted on the class only, so objects inherit it and pick up later class changes instead of keeping the hero they were issued with.

## 0.5.2

### Patch Changes

- d29afe2: Update runtime dependency fflate to ^0.8.3.

## 0.5.1

### Patch Changes

- b178e5d: Update runtime dependencies: valibot to ^1.4.2 and the @peculiar/asn1-\* packages (asn1-schema, asn1-cms, asn1-x509, asn1-rsa) to ^2.8.0.

## 0.5.0

### Minor Changes

- 5ada3d0: `Pass.sign()` now accepts a `ManifestSigner` — a callback receiving the raw `manifest.json` bytes and returning the DER-encoded CMS signature — as an alternative to `SigningMaterial`.

  This lets the private key live somewhere other than the process assembling the pass: a KMS, an HSM, or a separate signing service. Only `manifest.json` crosses the boundary, and it contains nothing but a map of filenames to SHA-1 digests, so no pass content or image data leaves the assembling process either.

  The key-holding side calls the already-exported `signManifest(manifest, material)`. `assemblePkpass()` accepts the same union, and a signer that resolves to a non-`Uint8Array` or an empty signature throws `PassmintSigningError` with code `E_SIGN` rather than producing a `.pkpass` that Wallet silently rejects.

  Passing `SigningMaterial` continues to work unchanged.

## 0.4.0

### Minor Changes

- 0d6ce07: Header fields now render on Google Wallet. Apple already placed `headerFields` in the pass header, but the Google renderer's `fieldsToTextModules` skipped them, so header fields silently vanished from Google passes. They are now flattened into `textModulesData` like the other field groups, ordered first.

## 0.3.0

### Minor Changes

- 29feaf1: Add iOS 27 Wallet support: Poster Generic passes (`poster: true` on `generic`, with an automatic `generic` fallback for iOS 26 and earlier), Featured Actions (`featuredActions` / `.featuredAction()`), and four new barcode formats (EAN-13, Code 39, Codabar, ITF) across both the Apple and Google renderers.

## 0.2.1

### Patch Changes

- 4b5e708: Update `@peculiar/asn1-schema`, `@peculiar/asn1-cms`, `@peculiar/asn1-x509`, and `@peculiar/asn1-rsa` runtime dependencies to ^2.7.0.

## 0.2.0

### Minor Changes

- a48448f: Security hardening pass — 28 new tests, 0 regressions.

  **New guarantees (some of these tighten existing inputs):**

  - **`ZipAssembler.add()`** now rejects `..` path segments, backslashes, drive-letter prefixes (e.g. `C:\`), and NUL bytes. Prevents ZIP-Slip-class issues for downstream consumers who use `ZipAssembler` directly with untrusted filenames. The internal `.pkpass` pipeline was already safe; this hardens the public API.
  - **`webService.url`** must be `https://`. Previously any URL shape was accepted. Apple PKPass spec requires HTTPS; we now enforce at the schema layer instead of relying on device-side rejection. Same enforcement applies to `semantics.homepage`, `semantics.orderManagementUrl`, and all image URLs.
  - **`applyRaw.apple`** cannot override identity fields (`passTypeIdentifier`, `teamIdentifier`, `serialNumber`, `authenticationToken`, `webServiceURL`). **`applyRaw.google`** cannot override `id`, `classId`, `state`. Prevents accidental identity forgery when callers pipe semi-trusted input through the escape hatch.
  - **Google save-link JWTs** now include an `exp` claim by default (15 minutes). Override via `GoogleSaveOptions.expirySeconds`, or opt out with `expirySeconds: null`. Non-integer / non-positive values throw.
  - **`classSuffix` / `objectSuffix`** validated against Google's allowed charset `[A-Za-z0-9._-]` with a 100-char cap. Prior behavior silently produced JWTs that Google rejected with an opaque error.
  - **Image bytes** capped at 5 MiB per source. **PEM input** capped at 100 KiB. Prevents edge-runtime OOM via attacker-controlled input size.

  **Public API additions:** `DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS`, `MAX_IMAGE_BYTE_LENGTH`, `MAX_PEM_LENGTH`, `GoogleSaveOptions.expirySeconds`, `GoogleSaveJwtClaims.exp`.

  **Other:** Added `SECURITY.md` and `.github/dependabot.yml`.

  **Breaking for:**

  - Anyone passing `http://` to `webService.url`, image URLs, or semantic URLs (now errors at schema time — switch to `https://`).
  - Anyone passing image bytes > 5 MiB (resize before adding to the pass).
  - Anyone who was relying on `applyRaw` to override identity fields (use the validated top-level fields instead).
  - Anyone using `ZipAssembler.add()` with `..` or backslashes in paths (rarely legitimate).

## 0.1.0

### Minor Changes

- 2d715a9: Initial alpha release.

  `passmint` is a TypeScript library for generating Apple Wallet `.pkpass`
  files and Google Wallet save-link JWTs from any JavaScript runtime that
  supports Web Crypto, Web Streams, `Uint8Array`, and `TextEncoder`. That
  means Cloudflare Workers, Vercel Edge, Deno, Bun, Supabase Edge, Netlify
  Edge, and Node 20+ without polyfills.

  ### What works in this release

  - Unified pass schema (Valibot `v.variant` over 5 pass styles) with
    per-style field-count limits enforced at construction time.
  - Apple `.pkpass` assembly: schema → render → SHA-1 manifest → CMS/PKCS#7
    detached signature over Web Crypto → STORE-only ZIP via `fflate`.
    Verified end-to-end against `openssl cms -verify` and confirmed to
    install on a real iPhone in Wallet.
  - Google Wallet save-link JWT: RS256 signing via Web Crypto, inline
    class+object payload per pass style, verified round-trip with
    matching public key.
  - Fluent builder API (`Pass.eventTicket(...).primaryField(...)`) and
    raw object API (`Pass.from(...)`). Output as `Uint8Array`,
    `ReadableStream<Uint8Array>`, or HTTP `Response`.
  - Typed error hierarchy (`PassmintError`, `PassmintSchemaError`,
    `PassmintRenderError`, `PassmintSigningError`,
    `PassmintPackagingError`, `PassmintGoogleError`) with stable
    string codes and preserved causes.
  - Zero `node:*` imports, enforced by Biome at the source level, by a
    post-build bundle-guard script, and by a real Cloudflare workerd
    runtime test via `@cloudflare/vitest-pool-workers`.

  ### What's not in this release

  - PKCS#12 (`.p12`) parsing — planned for a sibling `@passmint/p12`
    package that runs Node-only. Consumers must pre-convert to PKCS#8
    PEM with `openssl pkcs8 -topk8`.
  - Apple webservice protocol (device registration + APNs push) —
    planned for `@passmint/webservice`.
  - React components — planned for `@passmint/react`.
  - Google Wallet REST API (class/object CRUD) — planned for
    `@passmint/google-admin`. The JWT save-link flow covers the
    primary edge use case.

  ### Requirements

  - Node 20+ (or any supported edge runtime)
  - Private keys must be in PKCS#8 PEM format
  - Apple pass signing requires the real Apple WWDR intermediate CA
    and a Pass Type ID certificate from Apple Developer

  This is a pre-1.0 alpha. The public API may change before 1.0 based
  on real-world feedback.
