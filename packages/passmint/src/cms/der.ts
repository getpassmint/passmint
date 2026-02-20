import { PassmintSigningError } from '../errors'

/**
 * Sort a list of DER TLVs per X.690 §11.6 for use inside a `SET OF`.
 *
 * Rule: byte-by-byte lexicographic compare; when one encoding is a
 * prefix of another, the shorter is "smaller".
 *
 * Critical for CMS `signedAttributes`: the attributes must be in canonical
 * DER order before the RSA signature is computed, or verification fails.
 * `@peculiar/asn1-schema` does NOT sort `SET OF` elements for us — we
 * hand-build the canonical order here.
 */
export function sortSetOfByBytes(elements: readonly Uint8Array[]): Uint8Array[] {
  return [...elements].sort((a, b) => {
    const min = Math.min(a.length, b.length)
    for (let i = 0; i < min; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) break
      if (ai !== bi) return ai - bi
    }
    return a.length - b.length
  })
}

/**
 * Encode a DER length. Short form for lengths < 128, long form (up to
 * 3-octet length) for larger. Rejects negatives, non-integers, and
 * anything over 16 MiB (we don't produce structures that large).
 */
export function encodeLength(length: number): Uint8Array {
  if (length < 0 || !Number.isInteger(length)) {
    throw new PassmintSigningError('E_SIGN', `Invalid DER length: ${length}`)
  }
  if (length < 0x80) return new Uint8Array([length])
  if (length < 0x100) return new Uint8Array([0x81, length])
  if (length < 0x10000) {
    return new Uint8Array([0x82, (length >> 8) & 0xff, length & 0xff])
  }
  if (length < 0x1000000) {
    return new Uint8Array([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff])
  }
  throw new PassmintSigningError('E_SIGN', `DER length too large: ${length}`)
}

/**
 * Wrap a list of DER elements in a `SET OF` (tag 0x31, constructed).
 * Elements should already be sorted via {@link sortSetOfByBytes}.
 */
export function buildSetOf(elements: readonly Uint8Array[]): Uint8Array {
  let contentLength = 0
  for (const element of elements) contentLength += element.length
  const lengthBytes = encodeLength(contentLength)
  const out = new Uint8Array(1 + lengthBytes.length + contentLength)
  out[0] = 0x31 // SET (constructed)
  out.set(lengthBytes, 1)
  let offset = 1 + lengthBytes.length
  for (const element of elements) {
    out.set(element, offset)
    offset += element.length
  }
  return out
}

/**
 * Reinterpret a Uint8Array as a standalone ArrayBuffer. If the view
 * already covers its full backing buffer, returns the buffer directly;
 * otherwise slices a new one. Used at the Web Crypto / asn1-schema
 * boundary where `ArrayBuffer` is required.
 */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
    return u8.buffer as ArrayBuffer
  }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}
