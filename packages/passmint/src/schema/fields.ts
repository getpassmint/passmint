import * as v from 'valibot'
import { LocalizedStringSchema } from './localization'

/**
 * The value of a pass field. Matches Apple's `PassFieldContent.value`:
 *   - `string` for text or ISO 8601 date/time content
 *   - `number` for numeric/currency content
 */
export const FieldValueSchema = v.union([v.string(), v.number()])

export type FieldValue = v.InferOutput<typeof FieldValueSchema>

export const TextAlignmentSchema = v.picklist(['left', 'center', 'right', 'natural'])
export type TextAlignment = v.InferOutput<typeof TextAlignmentSchema>

export const DateTimeStyleSchema = v.picklist(['none', 'short', 'medium', 'long', 'full'])
export type DateTimeStyle = v.InferOutput<typeof DateTimeStyleSchema>

export const NumberStyleSchema = v.picklist(['decimal', 'percent', 'scientific', 'spellOut'])
export type NumberStyle = v.InferOutput<typeof NumberStyleSchema>

export const DataDetectorSchema = v.picklist(['phoneNumber', 'link', 'address', 'calendarEvent'])
export type DataDetector = v.InferOutput<typeof DataDetectorSchema>

/**
 * Currency code (ISO 4217). Three uppercase letters, e.g. "USD", "EUR".
 */
export const CurrencyCodeSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Z]{3}$/, 'Expected ISO 4217 three-letter currency code (e.g. "USD")'),
)

/**
 * A single pass field. Mirrors Apple's `PassFieldContent` with friendly
 * enum names. Validation rules enforce type consistency between `value`
 * and the formatting modifiers (e.g., `currencyCode` implies numeric value).
 * Deeper cross-field checks happen at render time.
 */
export const FieldSchema = v.pipe(
  v.object({
    /** Unique key within the containing field array. */
    key: v.string(),
    /** Display label above the value. Localizable. */
    label: v.optional(LocalizedStringSchema),
    /** The value. String for text/date, number for numeric/currency. */
    value: FieldValueSchema,
    /**
     * Alternative rendered value with limited HTML (e.g. `<a>` tags).
     * Apple-only. When set, Apple uses this instead of `value` for display
     * but `value` is still used for semantic meaning. Google ignores it.
     */
    attributedValue: v.optional(v.string()),
    textAlignment: v.optional(TextAlignmentSchema),
    /**
     * Date formatting style. Requires `value` to be an ISO 8601 date string.
     */
    dateStyle: v.optional(DateTimeStyleSchema),
    /**
     * Time formatting style. Requires `value` to be an ISO 8601 date string.
     */
    timeStyle: v.optional(DateTimeStyleSchema),
    /**
     * Render as a relative offset ("in 3 hours") instead of absolute time.
     */
    isRelative: v.optional(v.boolean()),
    ignoresTimeZone: v.optional(v.boolean()),
    /**
     * ISO 4217 currency code. When set, `value` must be a number and
     * `numberStyle` is implied.
     */
    currencyCode: v.optional(CurrencyCodeSchema),
    numberStyle: v.optional(NumberStyleSchema),
    /**
     * Message shown on update. `%@` is replaced with the new value.
     */
    changeMessage: v.optional(v.string()),
    dataDetectorTypes: v.optional(v.array(DataDetectorSchema)),
  }),
  v.forward(
    v.partialCheck(
      [['currencyCode'], ['value']],
      (input) => input.currencyCode === undefined || typeof input.value === 'number',
      '`currencyCode` requires `value` to be a number',
    ),
    ['value'],
  ),
)

export type Field = v.InferOutput<typeof FieldSchema>
