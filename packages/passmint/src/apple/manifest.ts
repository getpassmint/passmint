import { toArrayBuffer } from '../cms/der'
import { bytesToHex } from '../crypto/hex'
import { PassmintPackagingError } from '../errors'

/**
 * Result of building the manifest for a `.pkpass` package.
 */
export interface ManifestResult {
  /** Raw UTF-8 bytes of `manifest.json`. These are what gets signed. */
  bytes: Uint8Array
  /** Path → lowercase-hex SHA-1 digest, mirroring the JSON. */
  entries: Record<string, string>
}

/**
 * Build a `.pkpass` manifest: SHA-1 each file, produce the JSON map with
 * lowercase hex digests, return both the bytes (for signing) and the
 * entries (for debugging/tests).
 *
 * `manifest.json` and `signature` must NOT be included in the input —
 * Apple validates they are absent from the manifest itself.
 */
export async function buildManifest(
  files: Readonly<Record<string, Uint8Array>>,
): Promise<ManifestResult> {
  if (Object.hasOwn(files, 'manifest.json') || Object.hasOwn(files, 'signature')) {
    throw new PassmintPackagingError(
      'E_MANIFEST',
      'manifest.json and signature must not be included in the manifest input.',
    )
  }

  const entries: Record<string, string> = {}
  const paths = Object.keys(files).sort()
  for (const path of paths) {
    const content = files[path]
    if (content === undefined) continue
    const digest = new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-1', toArrayBuffer(content)),
    )
    entries[path] = bytesToHex(digest)
  }

  const bytes = new TextEncoder().encode(JSON.stringify(entries))
  return { bytes, entries }
}
