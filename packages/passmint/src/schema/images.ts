import * as v from 'valibot'
import { HttpsUrlSchema } from './url'

/**
 * Hard cap on inline image bytes: 5 MiB per image. Well above realistic
 * pass icon / strip / background sizes (those are typically ~200 KB each),
 * and below the memory budget of every target edge runtime (Cloudflare
 * Workers ~128 MB per request).
 *
 * Prevents a single bad caller input from ballooning the ZIP allocation
 * and OOMing an edge isolate. If you need larger images, split into a
 * separate service that pre-optimizes them before handing bytes to
 * passmint — or open an issue with a concrete use case.
 */
export const MAX_IMAGE_BYTE_LENGTH = 5 * 1024 * 1024

/**
 * An image source: either inline bytes (Apple-native, capped at
 * {@link MAX_IMAGE_BYTE_LENGTH}) or a public HTTPS URL (Google-native).
 *
 * Apple `.pkpass` files require inline image bytes embedded in the ZIP.
 * Google Wallet requires HTTPS URIs (scheme enforced at the schema layer).
 * The render layer enforces the platform-specific bytes-vs-url requirement
 * and throws `PassmintRenderError` with actionable guidance on mismatch.
 */
export const ImageSourceSchema = v.union([
  v.object({
    bytes: v.pipe(
      v.instance(Uint8Array),
      v.check(
        (u) => u.byteLength <= MAX_IMAGE_BYTE_LENGTH,
        `Image bytes exceed ${MAX_IMAGE_BYTE_LENGTH} bytes (${MAX_IMAGE_BYTE_LENGTH / 1024 / 1024} MiB) — resize or compress before adding to the pass.`,
      ),
    ),
  }),
  v.object({ url: HttpsUrlSchema }),
])

export type ImageSource = v.InferOutput<typeof ImageSourceSchema>

/**
 * Triple of @1x/@2x/@3x variants for Retina support. @2x is required; the
 * others are optional. Apple recommends providing all three.
 */
export const ImageTripleSchema = v.object({
  x1: v.optional(ImageSourceSchema),
  x2: ImageSourceSchema,
  x3: v.optional(ImageSourceSchema),
})

export type ImageTriple = v.InferOutput<typeof ImageTripleSchema>

/**
 * Full image set for a pass. Only `icon` is required (Apple requires icon
 * for lock-screen display). Others are optional per pass style.
 */
export const ImagesSchema = v.object({
  icon: ImageTripleSchema,
  logo: v.optional(ImageTripleSchema),
  strip: v.optional(ImageTripleSchema),
  thumbnail: v.optional(ImageTripleSchema),
  background: v.optional(ImageTripleSchema),
  footer: v.optional(ImageTripleSchema),
  /**
   * Google Wallet hero image. Google-only; no Apple analog.
   * Always a URL (Google requires HTTPS URIs for images).
   */
  heroImage: v.optional(
    v.object({
      url: HttpsUrlSchema,
    }),
  ),
})

export type Images = v.InferOutput<typeof ImagesSchema>
