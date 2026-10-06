import * as v from 'valibot'
import { LocalizedStringSchema } from './localization'
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

const GoogleUrlImageSchema = v.object({ url: HttpsUrlSchema })

/**
 * One Google Wallet image module: a full-width image shown in the pass
 * details. Google displays at most one module from the object (plus one
 * from the class).
 */
export const GoogleImageModuleSchema = v.object({
  /** Module ID, so later updates can address the same module. */
  id: v.pipe(v.string(), v.minLength(1)),
  /** The image. Google requires an HTTPS URL. */
  image: GoogleUrlImageSchema,
  /** Accessibility text, rendered as the image's `contentDescription`. */
  description: v.optional(LocalizedStringSchema),
})

export type GoogleImageModule = v.InferOutput<typeof GoogleImageModuleSchema>

/**
 * Google Wallet images set on the object (one pass) rather than the class
 * (shared by every pass of the template). Google-only; Apple ignores it.
 *
 * Each field is three-state:
 * - omitted: no override, the object gets whatever passmint renders by default;
 * - a value: the object gets this image;
 * - `null`: explicitly clear the override. The object gets the default if
 *   there is one (e.g. the generic object's logo from `images.logo`),
 *   otherwise the field is emitted as `null` so a Google REST PATCH removes
 *   what an earlier render set.
 */
export const GoogleObjectImagesSchema = v.object({
  /**
   * Object `heroImage`, replacing the class hero on this pass only.
   * Supported by every Google object type.
   */
  heroImage: v.optional(v.nullable(GoogleUrlImageSchema)),
  /**
   * Object `logo`. Only `genericObject` has one (top left of the card, also
   * the list thumbnail); setting it on any other style throws at render.
   */
  logo: v.optional(v.nullable(GoogleUrlImageSchema)),
  /** Object `imageModulesData`. Supported by every Google object type. */
  imageModules: v.optional(v.nullable(v.pipe(v.array(GoogleImageModuleSchema), v.minLength(1)))),
})

export type GoogleObjectImages = v.InferOutput<typeof GoogleObjectImagesSchema>

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
  /**
   * Google Wallet images for this pass's object, independent of the class.
   * See {@link GoogleObjectImagesSchema}.
   */
  googleObject: v.optional(GoogleObjectImagesSchema),
})

export type Images = v.InferOutput<typeof ImagesSchema>
