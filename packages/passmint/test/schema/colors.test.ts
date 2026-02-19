import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { ColorSchema } from '../../src/schema/colors'

describe('ColorSchema', () => {
  it.each([
    ['rgb(255, 0, 0)'],
    ['rgb(0,0,0)'],
    ['rgb(  10, 20, 30  )'],
    ['#FFF'],
    ['#fff'],
    ['#FF0000'],
    ['#12ab56'],
  ])('accepts %s', (input) => {
    expect(v.safeParse(ColorSchema, input).success).toBe(true)
  })

  it.each([[''], ['red'], ['rgb(255)'], ['rgba(0,0,0,0.5)'], ['#GG0000'], ['#FFFF'], ['#1234567']])(
    'rejects %s',
    (input) => {
      expect(v.safeParse(ColorSchema, input).success).toBe(false)
    },
  )
})
