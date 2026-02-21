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

  it('handles an empty archive', () => {
    const zip = new ZipAssembler()
    const bytes = zip.finalize()
    expect(unzipSync(bytes)).toEqual({})
  })
})
