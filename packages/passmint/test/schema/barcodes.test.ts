import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { BarcodeSchema } from '../../src/schema/barcodes'

describe('BarcodeSchema', () => {
  it('accepts a minimal barcode', () => {
    const r = v.safeParse(BarcodeSchema, {
      format: 'qr',
      message: 'TICKET-123',
    })
    expect(r.success).toBe(true)
  })

  it.each([['qr'], ['pdf417'], ['aztec'], ['code128']])('accepts format %s', (format) => {
    const r = v.safeParse(BarcodeSchema, { format, message: 'x' })
    expect(r.success).toBe(true)
  })

  it.each([['QR'], ['qrcode'], ['ean13'], ['upc_a'], [''], [null]])(
    'rejects format %s',
    (format) => {
      const r = v.safeParse(BarcodeSchema, { format, message: 'x' })
      expect(r.success).toBe(false)
    },
  )

  it('accepts a full barcode with altText and encoding', () => {
    const r = v.safeParse(BarcodeSchema, {
      format: 'pdf417',
      message: 'BOARDING-PASS-DATA',
      messageEncoding: 'utf-8',
      altText: 'Boarding pass for flight AA123',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a localized altText', () => {
    const r = v.safeParse(BarcodeSchema, {
      format: 'qr',
      message: 'x',
      altText: { default: 'Scan me', translations: { es: 'Escanea' } },
    })
    expect(r.success).toBe(true)
  })

  it('rejects missing message', () => {
    expect(v.safeParse(BarcodeSchema, { format: 'qr' }).success).toBe(false)
  })
})
