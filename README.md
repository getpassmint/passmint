<div align="center">
	<br>
	<br>
	<picture>
		<source media="(prefers-color-scheme: dark)"
			srcset="https://github.com/getpassmint/passmint/raw/main/assets/dark.png?sanitize=true"
			width="600"
		>
		<img
			width="600"
			alt="light-mode banner"
			src="https://github.com/getpassmint/passmint/raw/main/assets/light.png?sanitize=true"
		>
	</picture>
	<br>
	<br>
  <h3 align="center">passmint</h3>
	<p align="center">Issue Apple Wallet and Google Wallet passes from any edge runtime.</p>
</div>

One unified pass schema. Two outputs: a signed `.pkpass` for iOS and a Google Wallet save-link JWT for Android. Zero `node:*` imports, Web Crypto only.

```ts
const pass = Pass.eventTicket({ /* ... */ }).build()

await pass.sign(apple)                                  // .pkpass bytes
await pass.toGoogleSaveLink(google, { origins: [...] }) // pay.google.com URL
```

> **Status:** pre-1.0 alpha. API may change based on real-world feedback.

👉 **Full docs, quickstart, and API reference:** [`packages/passmint/README.md`](./packages/passmint/README.md)

## Why passmint

- **Edge-native.** Runs on Cloudflare Workers, Vercel Edge, Deno, Bun, Supabase Edge, Netlify Edge, and Node 20+ without polyfills.
- **Web Crypto only.** No `node-forge`, no `node:crypto`, no `Buffer`. Just `Uint8Array`, `crypto.subtle`, `TextEncoder`.
- **One schema, two wallets.** A single `Pass` builds both an Apple `.pkpass` and a Google save-link JWT.
- **~21 KB gzipped.** Strict TypeScript, Valibot discriminated unions per pass style, typed error hierarchy.

## Packages

| Package                           | Status    | Description                            |
| --------------------------------- | --------- | -------------------------------------- |
| [`passmint`](./packages/passmint) | pre-alpha | Core library. Edge-runtime compatible. |

## Repository layout

```
packages/passmint/   the library
examples/node/       Node examples for Apple + Google
.changeset/          changeset-driven release notes
.github/workflows/   CI (lint/type-check/test/bundle-guard/publint/attw/size)
                     + release workflow (changesets → npm with provenance)
```

## Development

Prerequisites: Node 20+, pnpm 9+, and `openssl` on `PATH` (tests shell out to it for round-trip verification).

```sh
pnpm install
pnpm build          # tsdown ESM build
pnpm test           # vitest (Node pool)
pnpm lint           # biome
pnpm type-check     # tsc --noEmit
```

### Package-specific checks

```sh
cd packages/passmint

pnpm test:workers   # smoke tests inside real workerd via vitest-pool-workers
pnpm bundle-guard   # fails if dist/ contains any `node:*` import
pnpm publint        # catches common publish mistakes
pnpm attw            # @arethetypeswrong/cli, esm-only profile
pnpm size           # size-limit gate
```

## Releasing

Releases are driven by [changesets](https://github.com/changesets/changesets):

1. Add a changeset describing your change: `pnpm changeset`
2. Push. CI runs all gates.
3. Once merged to `main`, the release workflow opens (or updates) a "Version Packages" PR.
4. Merge that PR and the workflow publishes to npm with provenance via OIDC.

## License

MIT
