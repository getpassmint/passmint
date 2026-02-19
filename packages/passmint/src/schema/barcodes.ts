import * as v from 'valibot'
import { LocalizedStringSchema } from './localization'

/**
 * Unified barcode format enum. Friendly names; render layers translate to
 * Apple's `PKBarcodeFormatQR` and Google's `QR_CODE` families.
 *
 * Formats supported by both Apple and Google:
 *   - qr       → PKBarcodeFormatQR / QR_CODE
 *   - pdf417   → PKBarcodeFormatPDF417 / PDF_417
 *   - aztec    → PKBarcodeFormatAztec / AZTEC
 *   - code128  → PKBarcodeFormatCode128 / CODE_128 (not on watchOS)
 *
 * Google-only additions (mapped via `applyRaw.google` escape hatch if needed):
 * EAN_13, EAN_8, UPC_A, DATA_MATRIX, ITF_14, CODABAR. Not in the unified
 * format because Apple has no analog.
 */
export const BarcodeFormatSchema = v.picklist(['qr', 'pdf417', 'aztec', 'code128'])

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
