import * as v from 'valibot'

/**
 * Language code: BCP 47 (e.g. "en", "en-US", "fr-CA").
 *
 * Validated with a permissive regex — matches ISO 639-1 (2 chars) or 639-2
 * (3 chars), optionally followed by a region tag. Full RFC 5646 validation
 * is out of scope.
 */
export const LanguageTagSchema = v.pipe(
  v.string(),
  v.regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Expected BCP 47 language tag (e.g. "en" or "en-US")'),
)

/**
 * A localized string: either a bare string (the default value, no translations),
 * or the full `{ default, translations }` form for multi-language content.
 *
 * Modeled after Google Wallet's `LocalizedString`. At Apple render time, the
 * `default` is emitted into `pass.json` and each translation becomes a line
 * in the corresponding `{lang}.lproj/pass.strings` file.
 */
export const LocalizedStringSchema = v.union([
  v.string(),
  v.object({
    default: v.string(),
    translations: v.optional(v.record(LanguageTagSchema, v.string())),
  }),
])

export type LocalizedString = v.InferOutput<typeof LocalizedStringSchema>

/**
 * Resolve a `LocalizedString` to its default value. Used by render layers
 * that don't care about translations.
 */
export function defaultValue(localized: LocalizedString): string {
  return typeof localized === 'string' ? localized : localized.default
}

/**
 * Return the translations map (empty if none).
 */
export function translations(localized: LocalizedString): Record<string, string> {
  if (typeof localized === 'string') return {}
  return localized.translations ?? {}
}
