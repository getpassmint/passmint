import * as v from 'valibot'
import { LocalizedStringSchema } from './localization'

/**
 * Unified barcode format enum. Friendly names; render layers translate to
 * Apple's `PKBarcodeFormat*` and Google's `QR_CODE` families.
 *
 * Supported by both Apple and Google:
 *   - qr       → PKBarcodeFormatQR / QR_CODE
 *   - pdf417   → PKBarcodeFormatPDF417 / PDF_417
 *   - aztec    → PKBarcodeFormatAztec / AZTEC
 *   - code128  → PKBarcodeFormatCode128 / CODE_128 (not on watchOS)
 *
 * Added for iOS 27 (Apple) — long-standing on Google:
 *   - ean13    → PKBarcodeFormatEAN13  / EAN_13
 *   - code39   → PKBarcodeFormatCode39 / CODE_39
 *   - codabar  → PKBarcodeFormatCodabar / CODABAR
 *   - itf      → PKBarcodeFormatITF    / ITF_14
 *
 * iOS 27+ only renders ean13/code39/codabar/itf. For iOS 26 and earlier,
 * include a `qr` (or other pre-iOS-27) barcode entry in the same `barcodes`
 * array — Wallet renders the first format it supports, and passmint never
 * reorders or strips entries.
 */
export const BarcodeFormatSchema = v.picklist([
  'qr',
  'pdf417',
  'aztec',
  'code128',
  'ean13',
  'code39',
  'codabar',
  'itf',
])

export type BarcodeFormat = v.InferOutput<typeof BarcodeFormatSchema>

/**
 * A barcode attached to a pass.
 *
 * `altText` is optional on input. When omitted, render layers fall back to
 * `message`.
 */
export const BarcodeSchema = v.object({
  format: BarcodeFormatSchema,
  message: v.string(),
  /**
   * Character encoding for `message`. Defaults to `iso-8859-1` at render
   * time (Apple's default). Set to `utf-8` for non-ASCII content.
   */
  messageEncoding: v.optional(v.picklist(['iso-8859-1', 'utf-8', 'utf-16'])),
  /**
   * Human-readable fallback shown if the barcode fails to scan. Defaults
   * to `message` if omitted.
   */
  altText: v.optional(LocalizedStringSchema),
})

export type Barcode = v.InferOutput<typeof BarcodeSchema>
