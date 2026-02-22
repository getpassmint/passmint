import { toArrayBuffer } from '../cms/der'
import { PassmintGoogleError } from '../errors'
import type { GoogleSigningMaterial } from './material'

/**
 * Encode a byte sequence as base64url (no padding, URL-safe alphabet).
 * Uses `btoa` for the base64 step — available on every target runtime.
 */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Encode a value as JSON and then as base64url. Throws
 * {@link PassmintGoogleError} if the value is not JSON-serializable.
 */
export function base64urlJson(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch (cause) {
    throw new PassmintGoogleError('E_JWT_SIGN', 'Failed to JSON-serialize the JWT component.', {
      cause,
    })
  }
  return base64url(new TextEncoder().encode(json))
}

export interface GoogleSaveJwtClaims {
  /** Issuer — the service account email. */
  iss: string
  /** Audience — always `"google"`. */
  aud: 'google'
  /** Type — always `"savetowallet"`. */
  typ: 'savetowallet'
  /** Issued-at timestamp in seconds. */
  iat: number
  /** Allowed origin domains. */
  origins: readonly string[]
  /** Payload containing class + object arrays for each pass type. */
  payload: GoogleSavePayload
}

export interface GoogleSavePayload {
  genericClasses?: readonly unknown[]
  genericObjects?: readonly unknown[]
  eventTicketClasses?: readonly unknown[]
  eventTicketObjects?: readonly unknown[]
  flightClasses?: readonly unknown[]
  flightObjects?: readonly unknown[]
  transitClasses?: readonly unknown[]
  transitObjects?: readonly unknown[]
  loyaltyClasses?: readonly unknown[]
  loyaltyObjects?: readonly unknown[]
  offerClasses?: readonly unknown[]
  offerObjects?: readonly unknown[]
  giftCardClasses?: readonly unknown[]
  giftCardObjects?: readonly unknown[]
}

/**
 * Sign a Google Wallet save-link JWT with RS256 via Web Crypto.
 *
 * The return value is a compact JWT (`header.payload.signature`) ready
 * to embed in a `https://pay.google.com/gp/v/save/{jwt}` URL or hand to
 * {@link buildSaveLink}.
 *
 * @throws {PassmintGoogleError} with code `E_JWT_SIGN` on any failure.
 *
 * @example
 * ```ts
 * const jwt = await signSaveJwt(
 *   {
 *     iss: material.clientEmail,
 *     aud: 'google',
 *     typ: 'savetowallet',
 *     iat: Math.floor(Date.now() / 1000),
 *     origins: ['example.com'],
 *     payload: { genericObjects: [...] }
 *   },
 *   material,
 * )
 * ```
 */
export async function signSaveJwt(
  claims: GoogleSaveJwtClaims,
  material: GoogleSigningMaterial,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const signingInput = `${base64urlJson(header)}.${base64urlJson(claims)}`
  let signatureBytes: Uint8Array
  try {
    signatureBytes = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        material.privateKey,
        toArrayBuffer(new TextEncoder().encode(signingInput)),
      ),
    )
  } catch (cause) {
    throw new PassmintGoogleError(
      'E_JWT_SIGN',
      'Web Crypto RSA-SHA-256 signing failed. Verify the service account key was imported correctly.',
      { cause },
    )
  }
  return `${signingInput}.${base64url(signatureBytes)}`
}
