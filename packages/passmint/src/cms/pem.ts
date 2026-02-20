import { PassmintSigningError } from '../errors'

export interface PemDecodeOptions {
  /**
   * If provided, the PEM label (e.g. "CERTIFICATE", "PRIVATE KEY") must
   * match exactly. Use to guard against callers passing the wrong blob
   * to a slot that expects a specific format.
   */
  expectedLabel?: string
}

/**
 * Decode a PEM-encoded string into raw DER bytes.
 *
 * Runtime: uses `atob` for base64 decoding — available on every target
 * runtime (Node 20+, Workers, Vercel Edge, Deno, Bun).
 *
 * @throws {PassmintSigningError} with code `E_PEM_DECODE` on malformed
 *   input or label mismatch.
 */
export function pemToDer(pem: string, options: PemDecodeOptions = {}): Uint8Array {
  const match = pem.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END \1-----/)
  const label = match?.[1]
  const body = match?.[2]
  if (!match || label === undefined || body === undefined) {
    throw new PassmintSigningError(
      'E_PEM_DECODE',
      'Input does not contain a valid PEM block. Expected "-----BEGIN <LABEL>-----" / "-----END <LABEL>-----" markers.',
    )
  }
  const actualLabel = label.trim()
  if (options.expectedLabel !== undefined && actualLabel !== options.expectedLabel) {
    throw new PassmintSigningError(
      'E_PEM_DECODE',
      `Expected PEM label "${options.expectedLabel}" but got "${actualLabel}".`,
    )
  }
  const base64 = body.replace(/\s+/g, '')
  let binary: string
  try {
    binary = atob(base64)
  } catch (cause) {
    throw new PassmintSigningError('E_PEM_DECODE', 'PEM body is not valid base64.', { cause })
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
