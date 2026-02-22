import { toArrayBuffer } from '../cms/der'
import { pemToDer } from '../cms/pem'
import { PassmintGoogleError } from '../errors'

export interface GoogleSigningMaterialFromServiceAccountInput {
  /**
   * The `client_email` field from a Google Cloud service account JSON.
   * Used as the JWT `iss` claim.
   */
  clientEmail: string
  /**
   * The `private_key` field from the service account JSON — PEM-encoded
   * PKCS#8 RSA private key.
   */
  privateKeyPkcs8Pem: string
  /**
   * Numeric Google Wallet issuer ID (from the Google Pay & Wallet
   * Console). Used as the `{issuerId}.` prefix for class and object IDs.
   */
  issuerId: string
}

export interface GoogleSigningMaterialFromParsedInput {
  clientEmail: string
  issuerId: string
  privateKey: CryptoKey
}

/**
 * Pre-parsed Google Wallet signing material. Build once from a service
 * account JSON, reuse across many JWT save-link calls.
 *
 * Unlike Apple's signing material, Google's uses **RS256** (RSA-PKCS1-v1_5
 * with SHA-256) — Google Wallet mandates SHA-256 for save-link JWTs. The
 * same private key cannot be shared with the Apple CMS path (which uses
 * SHA-1); Web Crypto key usage is locked per `hash` at import time.
 *
 * @example
 * ```ts
 * import serviceAccount from './service-account.json' with { type: 'json' }
 *
 * const material = await GoogleSigningMaterial.fromServiceAccount({
 *   clientEmail: serviceAccount.client_email,
 *   privateKeyPkcs8Pem: serviceAccount.private_key,
 *   issuerId: '3388000000022xxx',
 * })
 * ```
 */
export class GoogleSigningMaterial {
  readonly clientEmail: string
  readonly issuerId: string
  readonly privateKey: CryptoKey

  private constructor(clientEmail: string, issuerId: string, privateKey: CryptoKey) {
    this.clientEmail = clientEmail
    this.issuerId = issuerId
    this.privateKey = privateKey
  }

  static fromParsed(input: GoogleSigningMaterialFromParsedInput): GoogleSigningMaterial {
    return new GoogleSigningMaterial(input.clientEmail, input.issuerId, input.privateKey)
  }

  static async fromServiceAccount(
    input: GoogleSigningMaterialFromServiceAccountInput,
  ): Promise<GoogleSigningMaterial> {
    if (!input.clientEmail.includes('@')) {
      throw new PassmintGoogleError(
        'E_SERVICE_ACCOUNT_KEY',
        `Expected a service account email for clientEmail but got "${input.clientEmail}".`,
      )
    }
    if (!/^\d+$/.test(input.issuerId)) {
      throw new PassmintGoogleError(
        'E_SERVICE_ACCOUNT_KEY',
        `Expected a numeric Google Wallet issuer ID but got "${input.issuerId}".`,
      )
    }
    if (/-----BEGIN RSA PRIVATE KEY-----/.test(input.privateKeyPkcs8Pem)) {
      throw new PassmintGoogleError(
        'E_SERVICE_ACCOUNT_KEY',
        'Received a PKCS#1 private key. Google service account keys are PKCS#8. Download a fresh key JSON from the Google Cloud console, or convert with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem',
      )
    }

    let keyDer: Uint8Array
    try {
      keyDer = pemToDer(input.privateKeyPkcs8Pem, { expectedLabel: 'PRIVATE KEY' })
    } catch (cause) {
      throw new PassmintGoogleError(
        'E_SERVICE_ACCOUNT_KEY',
        'Failed to decode the service account private key PEM.',
        { cause },
      )
    }

    let privateKey: CryptoKey
    try {
      privateKey = await globalThis.crypto.subtle.importKey(
        'pkcs8',
        toArrayBuffer(keyDer),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
      )
    } catch (cause) {
      throw new PassmintGoogleError(
        'E_SERVICE_ACCOUNT_KEY',
        'Web Crypto failed to import the service account private key. Ensure it is RSA in PKCS#8 format.',
        { cause },
      )
    }

    return new GoogleSigningMaterial(input.clientEmail, input.issuerId, privateKey)
  }
}
