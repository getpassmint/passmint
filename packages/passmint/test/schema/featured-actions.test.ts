import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { FeaturedActionSchema } from '../../src/schema/featured-actions'

describe('FeaturedActionSchema', () => {
  it('accepts a valid action', () => {
    const r = v.safeParse(FeaturedActionSchema, {
      identifier: 'view-benefits',
      type: 'membershipBenefits',
      url: 'https://example.com/benefits',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-HTTPS url', () => {
    const r = v.safeParse(FeaturedActionSchema, {
      identifier: 'x',
      type: 'y',
      url: 'http://example.com',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty identifier', () => {
    const r = v.safeParse(FeaturedActionSchema, {
      identifier: '',
      type: 'y',
      url: 'https://example.com',
    })
    expect(r.success).toBe(false)
  })
})
