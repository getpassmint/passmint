/**
 * Placeholder Workers entry module referenced by wrangler.toml.
 *
 * `@cloudflare/vitest-pool-workers` requires a `main` field in wrangler
 * config even though the test suite itself never invokes the worker's
 * fetch handler. This export exists solely to satisfy that requirement;
 * the real assertions live in sibling `*.test.ts` files that run inside
 * the workerd sandbox.
 */
export default {
  async fetch(): Promise<Response> {
    return new Response('passmint workers test harness', { status: 200 })
  },
}
