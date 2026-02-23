#!/usr/bin/env node
/**
 * Fail-loud check that the built `dist/index.js` contains zero `node:`
 * references. `passmint`'s edge-runtime promise is load-bearing — a
 * single `import 'node:crypto'` or `Buffer.from(...)` slipping into
 * production code would break Workers/Vercel Edge/Deno/Bun even though
 * Node tests still pass.
 *
 * We already have a Biome rule banning `node:*` imports in source, but
 * this check runs over the actual tsdown output, so it catches anything
 * pulled in transitively (via a dependency that we forgot is Node-only).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'dist', 'index.js')

let bundle
try {
  bundle = readFileSync(bundlePath, 'utf8')
} catch (err) {
  console.error(`bundle-guard: cannot read ${bundlePath}. Did you run \`pnpm build\` first?`)
  console.error(err.message)
  process.exit(1)
}

// Look for the `node:` specifier token. Matches both `from 'node:crypto'`
// and dynamic `import("node:fs")` shapes. Any occurrence is a fail.
const BANNED = /node:[a-z_/]+/g
const hits = bundle.match(BANNED)

if (hits && hits.length > 0) {
  console.error('bundle-guard: FAIL — dist/index.js references Node-only modules:')
  const unique = [...new Set(hits)].sort()
  for (const hit of unique) {
    console.error(`  - ${hit}`)
  }
  console.error('')
  console.error('passmint must be edge-runtime compatible. Use Web Crypto, Web Streams,')
  console.error('Uint8Array, and TextEncoder/Decoder instead. If a dependency pulled one')
  console.error('of these in, consider an alternative or move it to a sibling package.')
  process.exit(1)
}

// Also sanity-check for Buffer references, which are Node-only even
// without a `node:buffer` import (globalThis.Buffer).
if (/\bBuffer\./.test(bundle)) {
  console.error('bundle-guard: FAIL — dist/index.js references Buffer (Node global).')
  console.error('Use Uint8Array everywhere.')
  process.exit(1)
}

const sizeKb = (bundle.length / 1024).toFixed(2)
console.log(`bundle-guard: ok — ${sizeKb} KB, zero node:* references.`)
