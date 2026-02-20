import { describe, expect, it } from 'vitest'
import { buildSetOf, encodeLength, sortSetOfByBytes, toArrayBuffer } from '../../src/cms/der'
import { PassmintSigningError } from '../../src/errors'

describe('sortSetOfByBytes', () => {
  it('sorts by lexicographic byte order', () => {
    const input = [
      new Uint8Array([0x03, 0x01]),
      new Uint8Array([0x01, 0x02]),
      new Uint8Array([0x02, 0x00]),
    ]
    const result = sortSetOfByBytes(input)
    expect(Array.from(result[0] ?? [])).toEqual([0x01, 0x02])
    expect(Array.from(result[1] ?? [])).toEqual([0x02, 0x00])
    expect(Array.from(result[2] ?? [])).toEqual([0x03, 0x01])
  })

  it('treats shorter encoding as smaller when one is a prefix', () => {
    const input = [new Uint8Array([0x01, 0x02, 0x03]), new Uint8Array([0x01, 0x02])]
    const result = sortSetOfByBytes(input)
    expect(result[0]?.length).toBe(2)
    expect(result[1]?.length).toBe(3)
  })

  it('returns a new array (does not mutate input)', () => {
    const original = [new Uint8Array([0x02]), new Uint8Array([0x01])]
    const snapshot = [...original]
    sortSetOfByBytes(original)
    expect(original).toEqual(snapshot)
  })

  it('handles an empty list', () => {
    expect(sortSetOfByBytes([])).toEqual([])
  })
})

describe('encodeLength', () => {
  it.each<[number, number[]]>([
    [0, [0x00]],
    [1, [0x01]],
    [127, [0x7f]],
    [128, [0x81, 0x80]],
    [255, [0x81, 0xff]],
    [256, [0x82, 0x01, 0x00]],
    [65535, [0x82, 0xff, 0xff]],
    [65536, [0x83, 0x01, 0x00, 0x00]],
    [16777215, [0x83, 0xff, 0xff, 0xff]],
  ])('encodes %i as %o', (n, expected) => {
    expect(Array.from(encodeLength(n))).toEqual(expected)
  })

  it('throws on negative length', () => {
    expect(() => encodeLength(-1)).toThrow(PassmintSigningError)
  })

  it('throws on non-integer length', () => {
    expect(() => encodeLength(1.5)).toThrow(PassmintSigningError)
  })

  it('throws on length >= 2^24', () => {
    expect(() => encodeLength(0x1000000)).toThrow(PassmintSigningError)
  })
})

describe('buildSetOf', () => {
  it('wraps elements with tag 0x31 and correct length', () => {
    const result = buildSetOf([
      new Uint8Array([0x02, 0x01, 0x05]),
      new Uint8Array([0x02, 0x01, 0x06]),
    ])
    expect(result[0]).toBe(0x31)
    expect(result[1]).toBe(6)
    expect(Array.from(result.slice(2))).toEqual([0x02, 0x01, 0x05, 0x02, 0x01, 0x06])
  })

  it('handles an empty set', () => {
    const result = buildSetOf([])
    expect(Array.from(result)).toEqual([0x31, 0x00])
  })

  it('uses long-form length for sets >= 128 bytes', () => {
    const element = new Uint8Array(130)
    const result = buildSetOf([element])
    expect(result[0]).toBe(0x31)
    expect(result[1]).toBe(0x81)
    expect(result[2]).toBe(130)
  })
})

describe('toArrayBuffer', () => {
  it('returns the raw buffer when view covers it fully', () => {
    const u8 = new Uint8Array([1, 2, 3, 4])
    const ab = toArrayBuffer(u8)
    expect(ab.byteLength).toBe(4)
    expect(Array.from(new Uint8Array(ab))).toEqual([1, 2, 3, 4])
  })

  it('slices a new buffer for a partial view', () => {
    const backing = new Uint8Array([0, 0, 1, 2, 3, 0, 0])
    const slice = new Uint8Array(backing.buffer, 2, 3)
    const ab = toArrayBuffer(slice)
    expect(ab.byteLength).toBe(3)
    expect(Array.from(new Uint8Array(ab))).toEqual([1, 2, 3])
  })
})
