import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  LanguageTagSchema,
  LocalizedStringSchema,
  defaultValue,
  translations,
} from '../../src/schema/localization'

describe('LanguageTagSchema', () => {
  it.each([['en'], ['es'], ['fr-CA'], ['zh-CN'], ['pt-BR']])('accepts %s', (tag) => {
    expect(v.safeParse(LanguageTagSchema, tag).success).toBe(true)
  })

  it.each([[''], ['E'], ['ENGLISH'], ['en_US'], ['en-us'], ['123']])('rejects %s', (tag) => {
    expect(v.safeParse(LanguageTagSchema, tag).success).toBe(false)
  })
})

describe('LocalizedStringSchema', () => {
  it('accepts a bare string as shorthand', () => {
    const r = v.safeParse(LocalizedStringSchema, 'Hello')
    expect(r.success).toBe(true)
    if (r.success) expect(r.output).toBe('Hello')
  })

  it('accepts the full object form', () => {
    const r = v.safeParse(LocalizedStringSchema, {
      default: 'Hello',
      translations: { es: 'Hola', 'fr-CA': 'Bonjour' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts the full form with no translations', () => {
    const r = v.safeParse(LocalizedStringSchema, { default: 'Hello' })
    expect(r.success).toBe(true)
  })

  it('rejects invalid language tags in translations', () => {
    const r = v.safeParse(LocalizedStringSchema, {
      default: 'Hello',
      translations: { INVALID: 'x' },
    })
    expect(r.success).toBe(false)
  })
})

describe('defaultValue / translations helpers', () => {
  it('returns the string itself when shorthand', () => {
    expect(defaultValue('Hi')).toBe('Hi')
    expect(translations('Hi')).toEqual({})
  })

  it('returns default and translations map from full form', () => {
    const ls = { default: 'Hi', translations: { es: 'Hola' } }
    expect(defaultValue(ls)).toBe('Hi')
    expect(translations(ls)).toEqual({ es: 'Hola' })
  })

  it('returns empty translations when full form has none', () => {
    expect(translations({ default: 'Hi' })).toEqual({})
  })
})
