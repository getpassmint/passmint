import * as v from 'valibot'
import { BarcodeSchema } from './barcodes'
import { ColorSchema } from './colors'
import { FieldSchema } from './fields'
import { ImagesSchema } from './images'
import { LocalizedStringSchema } from './localization'
import { BeaconSchema, LocationSchema } from './locations'
import { SemanticTagsSchema } from './semantic-tags'
import { HttpsUrlSchema } from './url'

/**
 * ISO 8601 date/time string with timezone. Matches Apple's format requirement
 * — omitting the timezone causes silent rendering failures on older iOS.
 */
const IsoDateTimeSchema = v.pipe(
  v.string(),
  v.regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    'Expected ISO 8601 date/time with timezone (e.g. "2026-06-15T14:30:00-07:00" or "...Z")',
  ),
)

/**
 * Apple Pass Type Identifier. Reverse-DNS starting with `pass.`, matching
 * the Pass Type ID certificate's Common Name.
 */
const PassTypeIdentifierSchema = v.pipe(
  v.string(),
  v.regex(/^pass\.[a-zA-Z0-9.-]+$/, 'Expected reverse-DNS identifier starting with "pass."'),
)

/**
 * Serial number. Alphanumerics plus `._-`, 1–64 characters.
 *
 * The character set is deliberately tight — the serial number is interpolated
 * into `.pkpass` filenames, `Content-Disposition` headers, and webservice
 * URLs, and any non-URL-safe character there is a footgun. Tightening here
 * means downstream interpolation sites can trust the value.
 */
const SerialNumberSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9._-]{1,64}$/, 'serialNumber must be 1–64 characters from [A-Za-z0-9._-]'),
)

/**
 * 10-character Apple Developer Team ID.
 */
const TeamIdentifierSchema = v.pipe(
  v.string(),
  v.length(10, 'Apple Team Identifier must be exactly 10 characters'),
)

/**
 * Localization overrides: one map per language tag, each mapping string
 * keys to translated values. Used by consumers who want to manage
 * translations separately from the fields that reference them. (Optional;
 * prefer `LocalizedString` on individual fields.)
 */
const LocalizationSchema = v.record(v.string(), v.string())

/**
 * Web service configuration for pass updates. Apple-only.
 *
 * `url` must be HTTPS — Apple's spec requires it, and modern iOS rejects
 * non-HTTPS webServiceURL at install time. Older iOS was more permissive,
 * so we enforce this at the schema layer instead of relying on device-side
 * rejection.
 */
const WebServiceSchema = v.object({
  url: HttpsUrlSchema,
  authToken: v.pipe(v.string(), v.minLength(16, 'authToken must be at least 16 characters')),
})

/**
 * Platform-specific escape hatch. Deep-merged into the rendered output
 * after the unified render step. Power users only — `applyRaw` is NOT
 * validated for field types and must never be populated from untrusted
 * input directly.
 *
 * Identity fields are explicitly denied here: even the escape hatch
 * cannot overwrite `passTypeIdentifier`, `teamIdentifier`, `serialNumber`,
 * `authenticationToken`, or `webServiceURL` on the Apple side, nor `id`,
 * `classId`, or `state` on the Google side. These fields have regex /
 * shape constraints the rest of the library depends on (serial-number
 * sanitization feeds downstream URL + filename interpolation; identifiers
 * are matched against the signing cert's Common Name; etc.). If a caller
 * needs to change one of these values, they should change the validated
 * top-level field, not route around it through `applyRaw`.
 */
const UnknownValueSchema = v.unknown() as v.GenericSchema<unknown>

const APPLE_APPLYRAW_LOCKED_KEYS = [
  'passTypeIdentifier',
  'teamIdentifier',
  'serialNumber',
  'authenticationToken',
  'webServiceURL',
] as const

const GOOGLE_APPLYRAW_LOCKED_KEYS = ['id', 'classId', 'state'] as const

function rejectLockedKeys(locked: readonly string[]): (record: Record<string, unknown>) => boolean {
  return (record) => {
    for (const key of locked) {
      if (Object.hasOwn(record, key)) return false
    }
    return true
  }
}

const ApplyRawSchema = v.optional(
  v.object({
    apple: v.optional(
      v.pipe(
        v.record(v.string(), UnknownValueSchema),
        v.check(
          rejectLockedKeys(APPLE_APPLYRAW_LOCKED_KEYS),
          `applyRaw.apple cannot override identity fields (${APPLE_APPLYRAW_LOCKED_KEYS.join(', ')}) — set them at the top level instead`,
        ),
      ),
    ),
    google: v.optional(
      v.pipe(
        v.record(v.string(), UnknownValueSchema),
        v.check(
          rejectLockedKeys(GOOGLE_APPLYRAW_LOCKED_KEYS),
          `applyRaw.google cannot override identity fields (${GOOGLE_APPLYRAW_LOCKED_KEYS.join(', ')}) — use classSuffix / objectSuffix instead`,
        ),
      ),
    ),
  }),
)

/**
 * Fields shared by every pass style.
 */
const PassBaseSchema = v.object({
  // --- identity ---
  passTypeIdentifier: PassTypeIdentifierSchema,
  serialNumber: SerialNumberSchema,
  teamIdentifier: TeamIdentifierSchema,
  organizationName: v.pipe(v.string(), v.minLength(1)),
  description: v.pipe(v.string(), v.minLength(1)),

  // --- branding ---
  logoText: v.optional(LocalizedStringSchema),
  colors: v.optional(
    v.object({
      background: ColorSchema,
      foreground: ColorSchema,
      label: v.optional(ColorSchema),
    }),
  ),

  // --- lifecycle ---
  expirationDate: v.optional(IsoDateTimeSchema),
  relevantDate: v.optional(IsoDateTimeSchema),
  voided: v.optional(v.boolean()),
  sharingProhibited: v.optional(v.boolean()),
  groupingIdentifier: v.optional(v.string()),

  // --- relevance ---
  locations: v.optional(v.pipe(v.array(LocationSchema), v.maxLength(10))),
  beacons: v.optional(v.pipe(v.array(BeaconSchema), v.maxLength(10))),
  maxDistance: v.optional(v.pipe(v.number(), v.minValue(0))),

  // --- back of pass ---
  backFields: v.optional(v.array(FieldSchema)),

  // --- barcodes ---
  barcodes: v.optional(v.pipe(v.array(BarcodeSchema), v.minLength(1))),

  // --- localization ---
  localizations: v.optional(v.record(v.string(), LocalizationSchema)),

  // --- semantics ---
  semantics: v.optional(SemanticTagsSchema),

  // --- web service (Apple only) ---
  webService: v.optional(WebServiceSchema),

  // --- images ---
  images: ImagesSchema,

  // --- escape hatch ---
  applyRaw: ApplyRawSchema,
})

/**
 * Field layout for styles with the 3/1/4/4 arrangement
 * (event ticket, store card, coupon, generic).
 */
const StandardFieldLayout = {
  headerFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(3))),
  primaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(1))),
  secondaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(4))),
  auxiliaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(4))),
}

/**
 * Boarding pass field layout: 3 headers, 2 primary (allows origin+destination),
 * 4 secondary, 5 auxiliary.
 */
const BoardingPassFieldLayout = {
  headerFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(3))),
  primaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(2))),
  secondaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(4))),
  auxiliaryFields: v.optional(v.pipe(v.array(FieldSchema), v.maxLength(5))),
}

// --- Per-style schemas ---

export const BoardingPassSchema = v.object({
  ...PassBaseSchema.entries,
  style: v.literal('boardingPass'),
  transitType: v.picklist(['air', 'train', 'bus', 'boat', 'generic']),
  ...BoardingPassFieldLayout,
})
export type BoardingPassInput = v.InferOutput<typeof BoardingPassSchema>

export const EventTicketSchema = v.object({
  ...PassBaseSchema.entries,
  style: v.literal('eventTicket'),
  ...StandardFieldLayout,
})
export type EventTicketInput = v.InferOutput<typeof EventTicketSchema>

export const StoreCardSchema = v.object({
  ...PassBaseSchema.entries,
  style: v.literal('storeCard'),
  ...StandardFieldLayout,
})
export type StoreCardInput = v.InferOutput<typeof StoreCardSchema>

export const CouponSchema = v.object({
  ...PassBaseSchema.entries,
  style: v.literal('coupon'),
  ...StandardFieldLayout,
})
export type CouponInput = v.InferOutput<typeof CouponSchema>

export const GenericPassSchema = v.object({
  ...PassBaseSchema.entries,
  style: v.literal('generic'),
  ...StandardFieldLayout,
})
export type GenericPassInput = v.InferOutput<typeof GenericPassSchema>

/**
 * The unified pass input. Discriminated by `style` — use `Pass.eventTicket`,
 * `Pass.boardingPass`, etc. for type-guided construction, or pass the raw
 * object to `Pass.from()`.
 */
export const PassInputSchema = v.variant('style', [
  BoardingPassSchema,
  EventTicketSchema,
  StoreCardSchema,
  CouponSchema,
  GenericPassSchema,
])

export type PassInput = v.InferOutput<typeof PassInputSchema>
export type PassStyle = PassInput['style']
