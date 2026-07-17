# passmint

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
