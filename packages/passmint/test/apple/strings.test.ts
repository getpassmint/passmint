import { describe, expect, it } from 'vitest'
import { encodeStringsFile, encodeUtf16BeWithBom } from '../../src/apple/strings'

function decodeUtf16Be(bytes: Uint8Array): string {
  // Skip BOM (first 2 bytes)
  if (bytes[0] !== 0xfe || bytes[1] !== 0xff) throw new Error('missing BOM')
  let out = ''
  for (let i = 2; i + 1 < bytes.length; i += 2) {
    const hi = bytes[i] ?? 0
    const lo = bytes[i + 1] ?? 0
    out += String.fromCharCode((hi << 8) | lo)
  }
  return out
}

describe('encodeUtf16BeWithBom', () => {
  it('emits BOM followed by UTF-16 BE code units', () => {
    const bytes = encodeUtf16BeWithBom('Hi')
    expect(bytes[0]).toBe(0xfe)
    expect(bytes[1]).toBe(0xff)
    // 'H' = 0x48, 'i' = 0x69
    expect(Array.from(bytes.slice(2))).toEqual([0x00, 0x48, 0x00, 0x69])
  })

  it('round-trips ASCII content', () => {
    const bytes = encodeUtf16BeWithBom('Hello world')
    expect(decodeUtf16Be(bytes)).toBe('Hello world')
  })

  it('handles non-ASCII BMP characters', () => {
    const bytes = encodeUtf16BeWithBom('café')
    expect(decodeUtf16Be(bytes)).toBe('café')
  })

  it('handles an empty string with only the BOM', () => {
    const bytes = encodeUtf16BeWithBom('')
    expect(bytes.length).toBe(2)
    expect(Array.from(bytes)).toEqual([0xfe, 0xff])
  })
})

describe('encodeStringsFile', () => {
  it('formats key/value pairs with semicolons and newlines', () => {
    const bytes = encodeStringsFile({ Event: 'Evento', Location: 'Ubicación' })
    const text = decodeUtf16Be(bytes)
    expect(text).toBe('"Event" = "Evento";\n"Location" = "Ubicación";\n')
  })

  it('escapes backslashes, quotes, newlines, CR, tabs', () => {
    const bytes = encodeStringsFile({
      'path\\with\\backslash': 'tab\there',
      quoted: 'has "quotes"',
      multiline: 'line1\nline2\r\n',
    })
    const text = decodeUtf16Be(bytes)
    expect(text).toContain('"path\\\\with\\\\backslash"')
    expect(text).toContain('\\there')
    expect(text).toContain('"has \\"quotes\\""')
    expect(text).toContain('line1\\nline2\\r\\n')
  })

  it('produces an empty file (BOM only) for an empty map', () => {
    const bytes = encodeStringsFile({})
    expect(bytes.length).toBe(2)
    expect(bytes[0]).toBe(0xfe)
    expect(bytes[1]).toBe(0xff)
  })
})
