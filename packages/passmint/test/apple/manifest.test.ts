import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildManifest } from '../../src/apple/manifest'
import { PassmintPackagingError } from '../../src/errors'

function sha1Hex(bytes: Uint8Array): string {
  return createHash('sha1').update(Buffer.from(bytes)).digest('hex')
}

describe('buildManifest', () => {
  it('computes lowercase SHA-1 hex for each file', async () => {
    const files: Record<string, Uint8Array> = {
      'pass.json': new TextEncoder().encode('{"formatVersion":1}'),
      'icon.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    }
    const result = await buildManifest(files)

    expect(result.entries['pass.json']).toBe(sha1Hex(files['pass.json']!))
    expect(result.entries['icon.png']).toBe(sha1Hex(files['icon.png']!))
    for (const hex of Object.values(result.entries)) {
      expect(hex).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('returns bytes that JSON.parse round-trips to the entries', async () => {
    const files: Record<string, Uint8Array> = {
      'a.png': new Uint8Array([1, 2, 3]),
      'b.png': new Uint8Array([4, 5, 6]),
    }
    const result = await buildManifest(files)
    const decoded = JSON.parse(new TextDecoder().decode(result.bytes))
    expect(decoded).toEqual(result.entries)
  })

  it('handles empty input', async () => {
    const result = await buildManifest({})
    expect(result.entries).toEqual({})
    expect(new TextDecoder().decode(result.bytes)).toBe('{}')
  })

  it('rejects manifest.json in input', async () => {
    await expect(buildManifest({ 'manifest.json': new Uint8Array(0) })).rejects.toThrow(
      PassmintPackagingError,
    )
  })

  it('rejects signature in input', async () => {
    await expect(buildManifest({ signature: new Uint8Array(0) })).rejects.toThrow(
      PassmintPackagingError,
    )
  })
})
