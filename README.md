# passmint-pkg

Monorepo for [`passmint`](./packages/passmint) — an edge-native Apple Wallet + Google Wallet SDK built on Web Crypto.

👉 **Using the library?** See the [`passmint` README](./packages/passmint/README.md).

## Packages

| Package                             | Status    | Description                             |
| ----------------------------------- | --------- | --------------------------------------- |
| [`passmint`](./packages/passmint)   | pre-alpha | Core library. Edge-runtime compatible.  |

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

## Repository layout

```
packages/passmint/   the library
examples/node/       Node examples for Apple + Google
.changeset/          changeset-driven release notes
.github/workflows/   CI (lint/type-check/test/bundle-guard/publint/attw/size)
                     + release workflow (changesets → npm with provenance)
```

## Releasing

Releases are driven by [changesets](https://github.com/changesets/changesets):

1. Add a changeset describing your change: `pnpm changeset`
2. Push. CI runs all gates.
3. Once merged to `main`, the release workflow opens (or updates) a "Version Packages" PR.
4. Merge that PR and the workflow publishes to npm with provenance via OIDC.

## License

MIT
