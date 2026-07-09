import { type SigningMaterial, signManifest } from '../cms'
import { PassmintSigningError } from '../errors'
import type { PassInput } from '../schema/pass'
import { ZipAssembler } from '../zip/assembler'
import { buildManifest } from './manifest'
import { renderApplePass } from './render'

/**
 * Produces the detached CMS signature over the raw bytes of `manifest.json`.
 *
 * Pass one of these instead of a {@link SigningMaterial} when the private key
 * must not be present in the process assembling the pass — for example when the
 * key lives behind a KMS, an HSM, or a separate service that exposes only a
 * signing operation.
 *
 * The callback receives exactly the bytes that will be written to
 * `manifest.json`, and must resolve to the DER-encoded CMS `ContentInfo` bytes
 * that will be written to `signature`. {@link signManifest} produces exactly
 * that, so a remote signer is typically `signManifest(manifest, material)`
 * executed wherever the key lives.
 *
 * @example
 * ```ts
 * // In the process that holds no key:
 * const signed = await pass.sign((manifest) => keyService.signManifest(manifest))
 *
 * // In the process that holds the key:
 * const material = await SigningMaterial.fromPem({ ... })
 * const signature = await signManifest(manifest, material)
 * ```
 */
export type ManifestSigner = (manifest: Uint8Array) => Promise<Uint8Array>

/**
 * Resolve the `signature` bytes from either pre-built signing material or a
 * caller-supplied signer.
 *
 * A {@link SigningMaterial} is a class instance and a {@link ManifestSigner} is
 * a function, so `typeof` separates them unambiguously.
 */
async function resolveSignature(
  manifest: Uint8Array,
  signing: SigningMaterial | ManifestSigner,
): Promise<Uint8Array> {
  if (typeof signing !== 'function') {
    return signManifest(manifest, signing)
  }

  const signature = await signing(manifest)

  // A signer that returns nothing useful would otherwise produce a `.pkpass`
  // that Wallet rejects with no explanation. Fail here, where the cause is
  // obvious, rather than on the device.
  if (!(signature instanceof Uint8Array)) {
    throw new PassmintSigningError(
      'E_SIGN',
      'ManifestSigner must resolve to a Uint8Array of DER-encoded CMS ContentInfo bytes.',
    )
  }
  if (signature.length === 0) {
    throw new PassmintSigningError('E_SIGN', 'ManifestSigner resolved to an empty signature.')
  }

  return signature
}

/**
 * Compose a complete `.pkpass` file from a validated `PassInput` and either
 * pre-built signing material or a {@link ManifestSigner}.
 *
 * Pipeline:
 *   1. Render the pass to Apple shape (`pass.json` object + image/strings file map)
 *   2. Serialize `pass.json` to UTF-8 bytes
 *   3. SHA-1 every file → `manifest.json`
 *   4. CMS-sign the manifest bytes via {@link signManifest}, or hand them to the
 *      supplied {@link ManifestSigner}
 *   5. ZIP everything together (STORE, no compression)
 *
 * @returns The final `.pkpass` ZIP bytes, ready to serve or save.
 */
export async function assemblePkpass(
  input: PassInput,
  signing: SigningMaterial | ManifestSigner,
): Promise<Uint8Array> {
  const rendered = renderApplePass(input)

  const passJsonBytes = new TextEncoder().encode(JSON.stringify(rendered.passJson))

  const manifestInput: Record<string, Uint8Array> = {
    'pass.json': passJsonBytes,
    ...rendered.files,
  }
  const manifest = await buildManifest(manifestInput)
  const signature = await resolveSignature(manifest.bytes, signing)

  const zip = new ZipAssembler()
  zip.add('pass.json', passJsonBytes)
  for (const [path, bytes] of Object.entries(rendered.files)) {
    zip.add(path, bytes)
  }
  zip.add('manifest.json', manifest.bytes)
  zip.add('signature', signature)
  return zip.finalize()
}
