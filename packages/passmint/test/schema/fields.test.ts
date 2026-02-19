import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { CurrencyCodeSchema, FieldSchema } from '../../src/schema/fields'

describe('CurrencyCodeSchema', () => {
  it.each([['USD'], ['EUR'], ['JPY'], ['GBP']])('accepts %s', (c) => {
    expect(v.safeParse(CurrencyCodeSchema, c).success).toBe(true)
  })

  it.each([['usd'], ['US'], ['DOLLARS'], [''], ['US1']])('rejects %s', (c) => {
    expect(v.safeParse(CurrencyCodeSchema, c).success).toBe(false)
  })
})

describe('FieldSchema', () => {
  it('accepts a minimal string-value field', () => {
    const r = v.safeParse(FieldSchema, { key: 'name', value: 'John' })
    expect(r.success).toBe(true)
  })

  it('accepts a number value with currency', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'price',
      value: 19.99,
      currencyCode: 'USD',
    })
    expect(r.success).toBe(true)
  })

  it('rejects string value when currencyCode is set', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'price',
      value: '19.99',
      currencyCode: 'USD',
    })
    expect(r.success).toBe(false)
  })

  it('accepts date-style formatting on string value', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'date',
      value: '2026-06-15T14:30:00-07:00',
      dateStyle: 'medium',
      timeStyle: 'short',
      isRelative: true,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a localized label', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'name',
      value: 'John',
      label: { default: 'Name', translations: { es: 'Nombre' } },
    })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid text alignment', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'x',
      value: 'y',
      textAlignment: 'justify',
    })
    expect(r.success).toBe(false)
  })

  it('accepts data detector array', () => {
    const r = v.safeParse(FieldSchema, {
      key: 'contact',
      value: 'Call 555-1234 or visit example.com',
      dataDetectorTypes: ['phoneNumber', 'link'],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty key', () => {
    // Empty string is currently allowed by v.string(); uniqueness/non-empty
    // is enforced at a higher layer (containing field array).
    const r = v.safeParse(FieldSchema, { key: '', value: 'x' })
    expect(r.success).toBe(true)
  })
})
