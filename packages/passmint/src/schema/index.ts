import * as v from 'valibot'
import { PassmintSchemaError } from '../errors'
import { type PassInput, PassInputSchema } from './pass'

export type { Barcode, BarcodeFormat } from './barcodes'
export type { Color } from './colors'
export type {
  DataDetector,
  DateTimeStyle,
  Field,
  FieldValue,
  NumberStyle,
  TextAlignment,
} from './fields'
export type { ImageSource, Images, ImageTriple } from './images'
export type { LocalizedString } from './localization'
export type { Beacon, Location } from './locations'
export type {
  BoardingPassInput,
  CouponInput,
  EventTicketInput,
  GenericPassInput,
  PassInput,
  PassStyle,
  StoreCardInput,
} from './pass'
export { PassInputSchema } from './pass'
export type { SemanticTags } from './semantic-tags'

/**
 * Validate and parse a raw pass input. Throws {@link PassmintSchemaError}
 * on invalid input. The error's `issues` field contains the raw Valibot
 * issue list for field-level error rendering.
 *
 * @example
 * ```ts
 * import { parsePassInput, PassmintSchemaError } from 'passmint'
 *
 * try {
 *   const pass = parsePassInput({
 *     style: 'eventTicket',
 *     passTypeIdentifier: 'pass.com.example.event',
 *     serialNumber: 'ticket-123',
 *     teamIdentifier: 'ABCD1234EF',
 *     organizationName: 'Example',
 *     description: 'Concert ticket',
 *     images: { icon: { x2: { bytes: iconBytes } } }
 *   })
 * } catch (err) {
 *   if (err instanceof PassmintSchemaError) {
 *     console.error(err.issues)
 *   }
 * }
 * ```
 */
export function parsePassInput(input: unknown): PassInput {
  const result = v.safeParse(PassInputSchema, input)
  if (!result.success) {
    throw new PassmintSchemaError(result.issues)
  }
  return result.output
}
