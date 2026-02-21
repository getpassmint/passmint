import { type SigningMaterial, signManifest } from '../cms'
import type { PassInput } from '../schema/pass'
import { ZipAssembler } from '../zip/assembler'
import { buildManifest } from './manifest'
import { renderApplePass } from './render'

/**
 * Compose a complete `.pkpass` file from a validated `PassInput` and
 * pre-built signing material.
 *
 * Pipeline:
 *   1. Render the pass to Apple shape (`pass.json` object + image/strings file map)
 *   2. Serialize `pass.json` to UTF-8 bytes
 *   3. SHA-1 every file → `manifest.json`
 *   4. CMS-sign the manifest bytes via {@link signManifest}
 *   5. ZIP everything together (STORE, no compression)
 *
 * @returns The final `.pkpass` ZIP bytes, ready to serve or save.
 */
export async function assemblePkpass(
  input: PassInput,
  material: SigningMaterial,
): Promise<Uint8Array> {
  const rendered = renderApplePass(input)

  const passJsonBytes = new TextEncoder().encode(JSON.stringify(rendered.passJson))

  const manifestInput: Record<string, Uint8Array> = {
    'pass.json': passJsonBytes,
    ...rendered.files,
  }
  const manifest = await buildManifest(manifestInput)
  const signature = await signManifest(manifest.bytes, material)

  const zip = new ZipAssembler()
  zip.add('pass.json', passJsonBytes)
  for (const [path, bytes] of Object.entries(rendered.files)) {
    zip.add(path, bytes)
  }
  zip.add('manifest.json', manifest.bytes)
  zip.add('signature', signature)
  return zip.finalize()
}
