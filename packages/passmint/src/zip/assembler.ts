import { zipSync } from 'fflate'
import { PassmintPackagingError } from '../errors'

/**
 * In-memory ZIP assembler for `.pkpass` payloads.
 *
 * v0 uses STORE (no compression): .pkpass contents are dominated by
 * already-compressed PNGs, so DEFLATE adds CPU cost for no real size
 * win, and Apple Wallet accepts STORE.
 *
 * Streaming finalize is a v0.2 concern. v0 returns a single Uint8Array.
 *
 * @example
 * ```ts
 * const zip = new ZipAssembler()
 * zip.add('pass.json', passBytes)
 * zip.add('icon.png', iconBytes)
 * const bytes = zip.finalize()
 * ```
 */
export class ZipAssembler {
  private readonly files: Record<string, Uint8Array> = {}

  /**
   * Add a file at the given relative path. Later calls with the same
   * path replace earlier ones.
   */
  add(path: string, content: Uint8Array): this {
    if (path === '' || path.startsWith('/')) {
      throw new PassmintPackagingError(
        'E_ZIP',
        `Invalid zip entry path: "${path}". Use forward-slash separated relative paths.`,
      )
    }
    this.files[path] = content
    return this
  }

  /** Number of files currently queued. */
  get size(): number {
    return Object.keys(this.files).length
  }

  /** Whether the given path has been added. */
  has(path: string): boolean {
    return Object.hasOwn(this.files, path)
  }

  /**
   * Build the final ZIP bytes. All entries use STORE (level 0, no
   * compression). Does not mutate the assembler — subsequent `.add`
   * calls build a new archive.
   */
  finalize(): Uint8Array {
    const input: Record<string, [Uint8Array, { level: 0 }]> = {}
    for (const [path, content] of Object.entries(this.files)) {
      input[path] = [content, { level: 0 }]
    }
    try {
      return zipSync(input)
    } catch (cause) {
      throw new PassmintPackagingError('E_ZIP', 'fflate zipSync failed.', { cause })
    }
  }
}
