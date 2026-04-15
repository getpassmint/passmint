# passmint

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
