import { AsnConvert } from '@peculiar/asn1-schema'
import type { Certificate, Name } from '@peculiar/asn1-x509'
import { bytesToHex } from '../crypto/hex'
import { PassmintSigningError } from '../errors'
import { toArrayBuffer } from './der'

const WWDR_DOWNLOAD_HINT =
  'Download the matching intermediate from https://www.apple.com/certificateauthority/ (check which one with `openssl x509 -in signerCert.pem -noout -issuer` and look at the OU, e.g. OU=G4).'

/** Short names for the attribute types that show up in Apple cert DNs. */
const ATTR_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '0.9.2342.19200300.100.1.1': 'UID',
}

/**
 * Render an X.509 Name as a readable DN in encoding order — the same order
 * `openssl x509 -noout -issuer` prints, so users can compare the two, e.g.
 * `CN=Apple Worldwide Developer Relations Certification Authority, OU=G4, O=Apple Inc., C=US`.
 * Only used for error messages, never for comparison.
 */
export function formatName(name: Name): string {
  const parts: string[] = []
  for (const rdn of name) {
    for (const atv of rdn) {
      parts.push(`${ATTR_NAMES[atv.type] ?? atv.type}=${atv.value.toString()}`)
    }
  }
  return parts.join(', ')
}

function nameBytes(name: Name): string {
  return bytesToHex(new Uint8Array(AsnConvert.serialize(name)))
}

/**
 * Synchronous half of the chain check: the signer's issuer DN must equal
 * the WWDR's subject DN. Catches the common mistake of bundling the wrong
 * WWDR generation (e.g. G3 with a G4-issued Pass Type ID certificate).
 *
 * @throws {PassmintSigningError} with code `E_WWDR_MISMATCH`.
 */
export function assertIssuerName(signerCert: Certificate, wwdrCert: Certificate): void {
  const issuer = signerCert.tbsCertificate.issuer
  const wwdrSubject = wwdrCert.tbsCertificate.subject
  if (nameBytes(issuer) !== nameBytes(wwdrSubject)) {
    throw new PassmintSigningError(
      'E_WWDR_MISMATCH',
      `The signer certificate was issued by '${formatName(issuer)}' but wwdrPem is '${formatName(wwdrSubject)}'. ${WWDR_DOWNLOAD_HINT}`,
    )
  }
}

type VerifyParams =
  | { kind: 'rsa'; hash: string }
  | { kind: 'ecdsa'; hash: string }
  | { kind: 'unsupported' }

function signatureParams(oid: string): VerifyParams {
  switch (oid) {
    case '1.2.840.113549.1.1.5':
      return { kind: 'rsa', hash: 'SHA-1' }
    case '1.2.840.113549.1.1.11':
      return { kind: 'rsa', hash: 'SHA-256' }
    case '1.2.840.113549.1.1.12':
      return { kind: 'rsa', hash: 'SHA-384' }
    case '1.2.840.113549.1.1.13':
      return { kind: 'rsa', hash: 'SHA-512' }
    case '1.2.840.10045.4.3.2':
      return { kind: 'ecdsa', hash: 'SHA-256' }
    case '1.2.840.10045.4.3.3':
      return { kind: 'ecdsa', hash: 'SHA-384' }
    case '1.2.840.10045.4.3.4':
      return { kind: 'ecdsa', hash: 'SHA-512' }
    default:
      return { kind: 'unsupported' }
  }
}

/** DER-encoded namedCurve OIDs (hex) → Web Crypto curve name + coordinate size. */
const EC_CURVES: Record<string, { name: string; size: number }> = {
  '06082a8648ce3d030107': { name: 'P-256', size: 32 },
  '06052b81040022': { name: 'P-384', size: 48 },
  '06052b81040023': { name: 'P-521', size: 66 },
}

/**
 * Convert a DER `Ecdsa-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER }`
 * into the fixed-width `r || s` form Web Crypto expects.
 */
function ecdsaDerToRaw(der: Uint8Array, size: number): Uint8Array | undefined {
  let offset = 0
  const readLength = (): number | undefined => {
    const first = der[offset++]
    if (first === undefined) return undefined
    if ((first & 0x80) === 0) return first
    let len = 0
    for (let n = first & 0x7f; n > 0; n--) {
      const b = der[offset++]
      if (b === undefined) return undefined
      len = (len << 8) | b
    }
    return len
  }
  if (der[offset++] !== 0x30 || readLength() === undefined) return undefined
  const out = new Uint8Array(size * 2)
  for (let part = 0; part < 2; part++) {
    if (der[offset++] !== 0x02) return undefined
    const len = readLength()
    if (len === undefined || offset + len > der.length) return undefined
    let int = der.subarray(offset, offset + len)
    offset += len
    while (int.length > 0 && int[0] === 0) int = int.subarray(1)
    if (int.length > size) return undefined
    out.set(int, part * size + (size - int.length))
  }
  return out
}

/**
 * Asynchronous half of the chain check: the signer certificate's signature
 * must verify against the WWDR's public key. Catches a WWDR that has the
 * right DN but is not actually the issuing certificate.
 *
 * Certificates signed with an algorithm Web Crypto can't verify here
 * (anything other than RSA PKCS#1 v1.5 or ECDSA) skip this half; the DN
 * check still applies.
 *
 * @throws {PassmintSigningError} with code `E_WWDR_MISMATCH`.
 */
export async function verifyIssuerSignature(
  signerCert: Certificate,
  wwdrCert: Certificate,
): Promise<void> {
  const params = signatureParams(signerCert.signatureAlgorithm.algorithm)
  if (params.kind === 'unsupported') return

  const spki = wwdrCert.tbsCertificate.subjectPublicKeyInfo
  const spkiDer = AsnConvert.serialize(spki)
  const tbs = signerCert.tbsCertificateRaw ?? AsnConvert.serialize(signerCert.tbsCertificate)
  let signature: Uint8Array | undefined = new Uint8Array(signerCert.signatureValue)

  let ok = false
  try {
    if (params.kind === 'rsa') {
      const key = await globalThis.crypto.subtle.importKey(
        'spki',
        spkiDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: params.hash },
        false,
        ['verify'],
      )
      ok = await globalThis.crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        toArrayBuffer(signature),
        tbs,
      )
    } else {
      const curveParams = spki.algorithm.parameters
      const curve = curveParams ? EC_CURVES[bytesToHex(new Uint8Array(curveParams))] : undefined
      signature = curve ? ecdsaDerToRaw(signature, curve.size) : undefined
      if (curve && signature) {
        const key = await globalThis.crypto.subtle.importKey(
          'spki',
          spkiDer,
          { name: 'ECDSA', namedCurve: curve.name },
          false,
          ['verify'],
        )
        ok = await globalThis.crypto.subtle.verify(
          { name: 'ECDSA', hash: params.hash },
          key,
          toArrayBuffer(signature),
          tbs,
        )
      }
    }
  } catch {
    // Key type doesn't match the signature algorithm, or the key can't be
    // imported: either way the WWDR did not issue this signer.
    ok = false
  }

  if (!ok) {
    throw new PassmintSigningError(
      'E_WWDR_MISMATCH',
      `The signer certificate names '${formatName(signerCert.tbsCertificate.issuer)}' as its issuer, but its signature does not verify against the public key in wwdrPem. The WWDR certificate has the right name but is not the one that issued your certificate. ${WWDR_DOWNLOAD_HINT}`,
    )
  }
}
