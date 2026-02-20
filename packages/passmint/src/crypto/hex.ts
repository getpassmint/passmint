const HEX = '0123456789abcdef'

/**
 * Lowercase hex encoding of a byte sequence.
 *
 * Apple requires **lowercase** hex for `manifest.json` SHA-1 digests.
 * Uppercase has been observed to cause silent Wallet validation failures.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0
    out += HEX[(b >> 4) & 0xf]
    out += HEX[b & 0xf]
  }
  return out
}
