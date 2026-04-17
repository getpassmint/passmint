import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  ImageSourceSchema,
  ImageTripleSchema,
  ImagesSchema,
  MAX_IMAGE_BYTE_LENGTH,
} from '../../src/schema/images'

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

describe('ImageSourceSchema', () => {
  it('accepts inline bytes', () => {
    expect(v.safeParse(ImageSourceSchema, { bytes: FAKE_PNG }).success).toBe(true)
  })

  it('accepts a URL', () => {
    expect(v.safeParse(ImageSourceSchema, { url: 'https://example.com/icon.png' }).success).toBe(
      true,
    )
  })

  it('rejects objects with neither bytes nor url', () => {
    expect(v.safeParse(ImageSourceSchema, {}).success).toBe(false)
  })

  it('rejects a plain string as url', () => {
    expect(v.safeParse(ImageSourceSchema, 'https://example.com/icon.png').success).toBe(false)
  })

  it('rejects a non-URL string', () => {
    expect(v.safeParse(ImageSourceSchema, { url: 'not-a-url' }).success).toBe(false)
  })

  it('rejects image bytes larger than the cap (edge-runtime memory guard)', () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTE_LENGTH + 1)
    const r = v.safeParse(ImageSourceSchema, { bytes: oversized })
    expect(r.success).toBe(false)
  })

  it('accepts image bytes exactly at the cap', () => {
    const atLimit = new Uint8Array(MAX_IMAGE_BYTE_LENGTH)
    const r = v.safeParse(ImageSourceSchema, { bytes: atLimit })
    expect(r.success).toBe(true)
  })
})

describe('ImageTripleSchema', () => {
  it('requires x2', () => {
    expect(v.safeParse(ImageTripleSchema, {}).success).toBe(false)
    expect(v.safeParse(ImageTripleSchema, { x2: { bytes: FAKE_PNG } }).success).toBe(true)
  })

  it('accepts all three variants', () => {
    const r = v.safeParse(ImageTripleSchema, {
      x1: { bytes: FAKE_PNG },
      x2: { bytes: FAKE_PNG },
      x3: { bytes: FAKE_PNG },
    })
    expect(r.success).toBe(true)
  })

  it('mixes bytes and url sources within a triple', () => {
    const r = v.safeParse(ImageTripleSchema, {
      x1: { url: 'https://example.com/1x.png' },
      x2: { bytes: FAKE_PNG },
    })
    expect(r.success).toBe(true)
  })
})

describe('ImagesSchema', () => {
  it('requires only icon', () => {
    const r = v.safeParse(ImagesSchema, {
      icon: { x2: { bytes: FAKE_PNG } },
    })
    expect(r.success).toBe(true)
  })

  it('accepts the full set', () => {
    const triple = { x2: { bytes: FAKE_PNG } }
    const r = v.safeParse(ImagesSchema, {
      icon: triple,
      logo: triple,
      strip: triple,
      thumbnail: triple,
      background: triple,
      footer: triple,
      heroImage: { url: 'https://example.com/hero.jpg' },
    })
    expect(r.success).toBe(true)
  })

  it('rejects missing icon', () => {
    expect(v.safeParse(ImagesSchema, {}).success).toBe(false)
  })
})
