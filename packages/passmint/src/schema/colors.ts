import * as v from 'valibot'

/**
 * A color in one of the accepted input formats:
 *   - `rgb(R, G, B)` — Apple's required format, passed through as-is.
 *   - `#RGB` / `#RRGGBB` — hex shorthand, normalized to rgb() at Apple render
 *     time and to `#RRGGBB` at Google render time.
 *
 * The render layer handles conversion; the schema only validates shape.
 */
export const ColorSchema = v.pipe(
  v.string(),
  v.regex(
    /^(rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$/,
    'Expected rgb(R, G, B) or #RGB / #RRGGBB',
  ),
)

export type Color = v.InferOutput<typeof ColorSchema>
