import { AsnConvert } from '@peculiar/asn1-schema'
import { Certificate } from '@peculiar/asn1-x509'
import { PassmintSigningError } from '../errors'
import { toArrayBuffer } from './der'
import { pemToDer } from './pem'

export interface SigningMaterialFromPemInput {
  /** PEM-encoded Pass Type ID certificate (the signer / leaf cert). */
  signerCertPem: string
  /** PEM-encoded Apple WWDR intermediate certificate. */
  wwdrPem: string
  /**
   * PEM-encoded private key in **PKCS#8** format — not PKCS#1.
   * Convert PKCS#1 with: `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem`
   */
  privateKeyPkcs8Pem: string
}

export interface SigningMaterialFromParsedInput {
  signerCert: Certificate
  wwdrCert: Certificate
  privateKey: CryptoKey
}

/**
 * Pre-parsed CMS signing material: parsed signer + WWDR X.509 certificates
 * and a Web Crypto `CryptoKey` imported from the private key.
 *
 * Build once, reuse across many pass signings. Holding the parsed form
 * removes PEM parsing, ASN.1 decoding, and key import from the hot path.
 *
 * @example
 * ```ts
 * const material = await SigningMaterial.fromPem({
 *   signerCertPem: env.APPLE_PASS_CERT,
 *   wwdrPem: env.APPLE_WWDR,
 *   privateKeyPkcs8Pem: env.APPLE_PASS_KEY,
 * })
 * // material can now be reused across many signManifest() calls
 * ```
 */
export class SigningMaterial {
  readonly signerCert: Certificate
  readonly wwdrCert: Certificate
  readonly privateKey: CryptoKey

  private constructor(signerCert: Certificate, wwdrCert: Certificate, privateKey: CryptoKey) {
    this.signerCert = signerCert
    this.wwdrCert = wwdrCert
    this.privateKey = privateKey
  }

  /**
   * Construct from pre-parsed components. Useful when a sibling package
   * has already decoded the certs and imported the key (for example,
   * `@passmint/p12` parsing a PKCS#12 bundle on Node).
   */
  static fromParsed(input: SigningMaterialFromParsedInput): SigningMaterial {
    return new SigningMaterial(input.signerCert, input.wwdrCert, input.privateKey)
  }

  /**
   * Construct from PEM strings. Parses both certificates and imports the
   * private key via Web Crypto. The key is imported for `RSASSA-PKCS1-v1_5`
   * with SHA-1 — Apple Wallet still mandates SHA-1 for pass signatures as
   * of iOS 19 (2026).
   *
   * @throws {PassmintSigningError} with code `E_PEM_DECODE`,
   *   `E_CERT_PARSE`, `E_UNSUPPORTED_KEY_FORMAT`, or `E_KEY_IMPORT`.
   */
  static async fromPem(input: SigningMaterialFromPemInput): Promise<SigningMaterial> {
    // Detect the most common private-key footgun: PKCS#1 instead of PKCS#8.
    if (/-----BEGIN RSA PRIVATE KEY-----/.test(input.privateKeyPkcs8Pem)) {
      throw new PassmintSigningError(
        'E_UNSUPPORTED_KEY_FORMAT',
        'Received a PKCS#1 private key ("BEGIN RSA PRIVATE KEY"). Web Crypto requires PKCS#8. Convert with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem',
      )
    }

    const signerDer = pemToDer(input.signerCertPem, { expectedLabel: 'CERTIFICATE' })
    const wwdrDer = pemToDer(input.wwdrPem, { expectedLabel: 'CERTIFICATE' })
    const keyDer = pemToDer(input.privateKeyPkcs8Pem, { expectedLabel: 'PRIVATE KEY' })

    let signerCert: Certificate
    try {
      signerCert = AsnConvert.parse(toArrayBuffer(signerDer), Certificate)
    } catch (cause) {
      throw new PassmintSigningError(
        'E_CERT_PARSE',
        'Failed to parse signer certificate. Expected an X.509 v3 certificate in DER (PEM-wrapped).',
        { cause },
      )
    }

    let wwdrCert: Certificate
    try {
      wwdrCert = AsnConvert.parse(toArrayBuffer(wwdrDer), Certificate)
    } catch (cause) {
      throw new PassmintSigningError(
        'E_CERT_PARSE',
        'Failed to parse WWDR intermediate certificate.',
        { cause },
      )
    }

    let privateKey: CryptoKey
    try {
      privateKey = await globalThis.crypto.subtle.importKey(
        'pkcs8',
        toArrayBuffer(keyDer),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
        false,
        ['sign'],
      )
    } catch (cause) {
      throw new PassmintSigningError(
        'E_KEY_IMPORT',
        'Web Crypto failed to import the private key. Ensure it is RSA in PKCS#8 format and matches the signer certificate.',
        { cause },
      )
    }

    return new SigningMaterial(signerCert, wwdrCert, privateKey)
  }
}
