import { PassmintPackagingError } from '../errors'

/**
 * Escape a string for embedding inside a `.strings` file literal.
 * Backslashes, double quotes, newlines, carriage returns, and tabs are
 * backslash-escaped per Apple's format.
 */
function escapeStringLiteral(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i)
    switch (ch) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      default:
        out += ch
    }
  }
  return out
}

/**
 * Encode a JS string as UTF-16 BE with a BOM. Web Standards `TextEncoder`
 * only emits UTF-8, and Apple's `.strings` format historically requires
 * UTF-16 BE. We hand-encode by walking JS code units (already UTF-16)
 * and writing high byte then low byte. Surrogate pairs pass through
 * correctly because each half is emitted in order.
 */
export function encodeUtf16BeWithBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xfe
  out[1] = 0xff
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = (code >> 8) & 0xff
    out[2 + i * 2 + 1] = code & 0xff
  }
  return out
}

/**
 * Build the bytes of a `pass.strings` file from an entry map, encoded
 * as UTF-16 BE with BOM. Empty entries produce an empty file (BOM only),
 * which Apple tolerates.
 *
 * @throws {PassmintPackagingError} if a key or value is not a string.
 */
export function encodeStringsFile(entries: Readonly<Record<string, string>>): Uint8Array {
  let text = ''
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new PassmintPackagingError(
        'E_STRINGS_FILE',
        `Invalid .strings entry: keys and values must be strings (got ${typeof key} / ${typeof value})`,
      )
    }
    text += `"${escapeStringLiteral(key)}" = "${escapeStringLiteral(value)}";\n`
  }
  return encodeUtf16BeWithBom(text)
}
