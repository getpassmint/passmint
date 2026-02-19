import * as v from 'valibot'

/**
 * An image source: either inline bytes (Apple-native) or a public HTTPS URL
 * (Google-native).
 *
 * Apple `.pkpass` files require inline image bytes embedded in the ZIP.
 * Google Wallet requires HTTPS URIs. The schema accepts either; the render
 * layer enforces the platform-specific requirement and throws
 * `PassmintRenderError` with actionable guidance on mismatch.
 */
export const ImageSourceSchema = v.union([
  v.object({ bytes: v.instance(Uint8Array) }),
  v.object({ url: v.pipe(v.string(), v.url()) }),
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
      url: v.pipe(v.string(), v.url()),
    }),
  ),
})

export type Images = v.InferOutput<typeof ImagesSchema>
