import {
  Attribute,
  CMSVersion,
  CertificateChoices,
  CertificateSet,
  ContentInfo,
  DigestAlgorithmIdentifier,
  DigestAlgorithmIdentifiers,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignatureAlgorithmIdentifier,
  SignedData,
  SignerIdentifier,
  SignerInfo,
  SignerInfos,
  id_contentType,
  id_data,
  id_messageDigest,
  id_signedData,
  id_signingTime,
} from '@peculiar/asn1-cms'
import {
  AsnConvert,
  AsnProp,
  AsnPropTypes,
  AsnType,
  AsnTypeTypes,
  OctetString,
} from '@peculiar/asn1-schema'
import { PassmintSigningError } from '../errors'
import { buildSetOf, sortSetOfByBytes, toArrayBuffer } from './der'
import type { SigningMaterial } from './material'

// --- Tiny wrapper classes for bare DER value encoding ---
// We wrap the desired value in a SEQUENCE, serialize, then strip the outer
// SEQUENCE tag+length to extract just the inner TLV bytes. @peculiar doesn't
// expose a way to serialize primitive values directly, so this SEQUENCE-strip
// trick is the cheapest workaround.

class OidWrapper {
  oid = ''
}
AsnProp({ type: AsnPropTypes.ObjectIdentifier })(OidWrapper.prototype, 'oid')
AsnType({ type: AsnTypeTypes.Sequence })(OidWrapper)

class OctetStringWrapper {
  v: ArrayBuffer = new ArrayBuffer(0)
}
AsnProp({ type: AsnPropTypes.OctetString })(OctetStringWrapper.prototype, 'v')
AsnType({ type: AsnTypeTypes.Sequence })(OctetStringWrapper)

class UtcTimeWrapper {
  t: Date = new Date()
}
AsnProp({ type: AsnPropTypes.UTCTime })(UtcTimeWrapper.prototype, 't')
AsnType({ type: AsnTypeTypes.Sequence })(UtcTimeWrapper)

/**
 * Strip the outer SEQUENCE tag+length from a DER blob, returning just
 * the inner element bytes. Supports short and long-form lengths.
 */
function stripSeq(der: ArrayBuffer): Uint8Array {
  const view = new Uint8Array(der)
  // Skip SEQUENCE tag (1 byte), then read length.
  let offset = 1
  const firstLenByte = view[offset++]
  if (firstLenByte === undefined) {
    throw new PassmintSigningError('E_SIGN', 'Unexpected end of DER while reading length.')
  }
  if ((firstLenByte & 0x80) !== 0) {
    offset += firstLenByte & 0x7f // long form: low bits = number of length octets
  }
  return view.slice(offset)
}

function encodeOid(oid: string): Uint8Array {
  const wrapper = new OidWrapper()
  wrapper.oid = oid
  return stripSeq(AsnConvert.serialize(wrapper))
}

function encodeOctetString(bytes: Uint8Array): Uint8Array {
  const wrapper = new OctetStringWrapper()
  wrapper.v = toArrayBuffer(bytes)
  return stripSeq(AsnConvert.serialize(wrapper))
}

function encodeUtcTime(date: Date): Uint8Array {
  const wrapper = new UtcTimeWrapper()
  wrapper.t = date
  return stripSeq(AsnConvert.serialize(wrapper))
}

const NULL_PARAMS = new Uint8Array([0x05, 0x00]).buffer

// OID constants — stable across @peculiar/asn1-cms versions.
const OID_SHA1 = '1.3.14.3.2.26'
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1'

/**
 * Sign a manifest with the given signing material, producing a DER-encoded
 * CMS SignedData detached signature compatible with Apple Wallet.
 *
 * Pure function: no I/O, no fetch, no PEM parsing. Cheap to call repeatedly
 * after building {@link SigningMaterial} once. Runs in any runtime that
 * supports Web Crypto's `RSASSA-PKCS1-v1_5` + SHA-1.
 *
 * @param manifest Raw bytes of `manifest.json`.
 * @param material Pre-parsed signing material from
 *   {@link SigningMaterial.fromPem} or `.fromParsed`.
 * @returns DER-encoded CMS `ContentInfo` bytes, ready to write as the
 *   `signature` file inside a `.pkpass` ZIP.
 *
 * @example
 * ```ts
 * const material = await SigningMaterial.fromPem({ ... })
 * const manifest = new TextEncoder().encode(JSON.stringify(manifestObject))
 * const signature = await signManifest(manifest, material)
 * // signature goes into the ZIP as "signature"
 * ```
 */
export async function signManifest(
  manifest: Uint8Array,
  material: SigningMaterial,
): Promise<Uint8Array> {
  // 1. SHA-1 digest of the manifest.
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-1', toArrayBuffer(manifest)),
  )

  // 2. Build the three signed attributes required by CMS + Apple:
  //    contentType, messageDigest, signingTime.
  const contentTypeAttr = new Attribute({
    attrType: id_contentType,
    attrValues: [toArrayBuffer(encodeOid(id_data))],
  })
  const messageDigestAttr = new Attribute({
    attrType: id_messageDigest,
    attrValues: [toArrayBuffer(encodeOctetString(digest))],
  })
  const signingTimeAttr = new Attribute({
    attrType: id_signingTime,
    attrValues: [toArrayBuffer(encodeUtcTime(new Date()))],
  })

  // 3. Serialize each attribute, sort per X.690 §11.6, then build the
  //    SET OF (tag 0x31) form. This SET OF is what RSA signs — NOT the
  //    [0] IMPLICIT form that SignerInfo stores. Re-parsing the sorted
  //    encodings into Attribute objects ensures the SignerInfo encoder
  //    emits the same byte order inside the [0] IMPLICIT wrapper, so
  //    the signed bytes and the stored bytes differ only in the outer
  //    tag (0x31 vs 0xA0). RFC 5652 §5.4.
  const attrEncodings = sortSetOfByBytes(
    [contentTypeAttr, messageDigestAttr, signingTimeAttr].map(
      (attr) => new Uint8Array(AsnConvert.serialize(attr)),
    ),
  )
  const tbs = buildSetOf(attrEncodings)
  if (tbs[0] !== 0x31) {
    // Defensive guard — buildSetOf always sets 0x31, but if it ever
    // regresses, failing here is much clearer than debugging a silent
    // openssl verification failure downstream.
    throw new PassmintSigningError(
      'E_SIGN',
      `Internal error: signed-attributes TBS must start with 0x31 (SET OF) but got 0x${tbs[0]?.toString(16) ?? '??'}.`,
    )
  }
  const sortedAttrs = attrEncodings.map((bytes) =>
    AsnConvert.parse(toArrayBuffer(bytes), Attribute),
  )

  // 4. RSA sign the TBS.
  let signatureBytes: Uint8Array
  try {
    signatureBytes = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        material.privateKey,
        toArrayBuffer(tbs),
      ),
    )
  } catch (cause) {
    throw new PassmintSigningError(
      'E_SIGN',
      'Web Crypto failed to produce an RSA signature. Verify the private key was imported with RSASSA-PKCS1-v1_5 / SHA-1.',
      { cause },
    )
  }

  // 5. Build SignerInfo.
  const sha1Algo = new DigestAlgorithmIdentifier({
    algorithm: OID_SHA1,
    parameters: NULL_PARAMS,
  })
  const rsaAlgo = new SignatureAlgorithmIdentifier({
    algorithm: OID_RSA_ENCRYPTION,
    parameters: NULL_PARAMS,
  })

  const signerInfo = new SignerInfo({
    version: CMSVersion.v1,
    sid: new SignerIdentifier({
      issuerAndSerialNumber: new IssuerAndSerialNumber({
        issuer: material.signerCert.tbsCertificate.issuer,
        serialNumber: material.signerCert.tbsCertificate.serialNumber,
      }),
    }),
    digestAlgorithm: sha1Algo,
    signedAttrs: sortedAttrs,
    signatureAlgorithm: rsaAlgo,
    signature: new OctetString(toArrayBuffer(signatureBytes)),
  })

  // 6. Assemble SignedData: version 1, SHA-1 digest algos, detached
  //    encapContentInfo, signer + WWDR in the certificate set, one
  //    SignerInfo.
  const certs = new CertificateSet([
    new CertificateChoices({ certificate: material.signerCert }),
    new CertificateChoices({ certificate: material.wwdrCert }),
  ])
  const signedData = new SignedData({
    version: CMSVersion.v1,
    digestAlgorithms: new DigestAlgorithmIdentifiers([sha1Algo]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: id_data,
      // no eContent → detached
    }),
    certificates: certs,
    signerInfos: new SignerInfos([signerInfo]),
  })

  // 7. Wrap in ContentInfo and emit final DER.
  const contentInfo = new ContentInfo({
    contentType: id_signedData,
    content: AsnConvert.serialize(signedData),
  })
  return new Uint8Array(AsnConvert.serialize(contentInfo))
}
