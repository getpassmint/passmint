import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * Runs a smoke-test subset inside a real Cloudflare workerd runtime
 * via `@cloudflare/vitest-pool-workers`. Purpose: catch any accidental
 * Node API usage in the library (or a transitive dep) that Biome's
 * `noRestrictedImports` + the bundle-guard grep might miss.
 *
 * Only `test/workers/**.test.ts` files run here. The bulk of the suite
 * continues to run under normal vitest in Node — those tests exercise
 * openssl/createHash subprocess paths the Workers runtime can't host.
 */
export default defineWorkersConfig({
  test: {
    include: ['test/workers/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
})
