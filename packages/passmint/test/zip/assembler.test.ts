import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { PassmintPackagingError } from '../../src/errors'
import { ZipAssembler } from '../../src/zip/assembler'

describe('ZipAssembler', () => {
  it('builds a valid ZIP that fflate can round-trip', () => {
    const zip = new ZipAssembler()
    zip.add('a.txt', new TextEncoder().encode('hello'))
    zip.add('dir/b.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const bytes = zip.finalize()

    const unzipped = unzipSync(bytes)
    expect(new TextDecoder().decode(unzipped['a.txt'])).toBe('hello')
    expect(Array.from(unzipped['dir/b.png'] ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('reports size and has()', () => {
    const zip = new ZipAssembler()
    expect(zip.size).toBe(0)
    expect(zip.has('x')).toBe(false)
    zip.add('x', new Uint8Array([1]))
    expect(zip.size).toBe(1)
    expect(zip.has('x')).toBe(true)
  })

  it('replaces earlier entries with later ones at the same path', () => {
    const zip = new ZipAssembler()
    zip.add('a', new TextEncoder().encode('first'))
    zip.add('a', new TextEncoder().encode('second'))
    const bytes = zip.finalize()
    const unzipped = unzipSync(bytes)
    expect(new TextDecoder().decode(unzipped.a)).toBe('second')
  })

  it('rejects empty and absolute paths', () => {
    const zip = new ZipAssembler()
    expect(() => zip.add('', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('/abs', new Uint8Array())).toThrow(PassmintPackagingError)
  })

  it('rejects path traversal segments (ZIP Slip hardening)', () => {
    const zip = new ZipAssembler()
    // Standard traversal — POSIX style.
    expect(() => zip.add('../evil', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('a/../evil', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('a/b/../../evil', new Uint8Array())).toThrow(PassmintPackagingError)
    // Trailing .. segment.
    expect(() => zip.add('a/..', new Uint8Array())).toThrow(PassmintPackagingError)
    // A literal ".." filename is also rejected — even though it's technically
    // a single-segment name, no legitimate pkpass entry uses it.
    expect(() => zip.add('..', new Uint8Array())).toThrow(PassmintPackagingError)
  })

  it('rejects backslash path separators (Windows traversal)', () => {
    const zip = new ZipAssembler()
    expect(() => zip.add('..\\evil', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('a\\b', new Uint8Array())).toThrow(PassmintPackagingError)
  })

  it('rejects drive-letter prefixes', () => {
    const zip = new ZipAssembler()
    expect(() => zip.add('C:/evil', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('c:evil', new Uint8Array())).toThrow(PassmintPackagingError)
  })

  it('rejects NUL bytes in paths (C-string truncation smuggling)', () => {
    const zip = new ZipAssembler()
    expect(() => zip.add('safe.png\0../evil', new Uint8Array())).toThrow(PassmintPackagingError)
    expect(() => zip.add('\0', new Uint8Array())).toThrow(PassmintPackagingError)
  })

  it('still accepts legitimate relative paths including dots in filenames', () => {
    const zip = new ZipAssembler()
    expect(() => zip.add('pass.json', new Uint8Array())).not.toThrow()
    expect(() => zip.add('icon@2x.png', new Uint8Array())).not.toThrow()
    expect(() => zip.add('en.lproj/pass.strings', new Uint8Array())).not.toThrow()
    // A dot-prefixed filename (single segment, not traversal) is fine.
    expect(() => zip.add('.hidden', new Uint8Array())).not.toThrow()
    // A filename containing two dots but not a segment of `..` is fine.
    expect(() => zip.add('a..b', new Uint8Array())).not.toThrow()
  })

  it('handles an empty archive', () => {
    const zip = new ZipAssembler()
    const bytes = zip.finalize()
    expect(unzipSync(bytes)).toEqual({})
  })
})
