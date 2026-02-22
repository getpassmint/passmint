import { describe, expect, it } from 'vitest'
import { PassmintGoogleError } from '../../src/errors'
import { buildSaveLink } from '../../src/google/save-link'

describe('buildSaveLink', () => {
  it('wraps a JWT in the canonical pay.google.com URL', () => {
    const jwt = 'header.payload.signature'
    expect(buildSaveLink(jwt)).toBe('https://pay.google.com/gp/v/save/header.payload.signature')
  })

  it('throws E_PAYLOAD_TOO_LARGE when the URL exceeds the soft cap', () => {
    const bigJwt = 'a'.repeat(9000)
    try {
      buildSaveLink(bigJwt)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintGoogleError)
      if (err instanceof PassmintGoogleError) {
        expect(err.code).toBe('E_PAYLOAD_TOO_LARGE')
      }
    }
  })
})
