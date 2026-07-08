import { PassmintGoogleError, PassmintRenderError } from '../errors'
import type { Barcode } from '../schema/barcodes'
import type { Field } from '../schema/fields'
import type { ImageSource } from '../schema/images'
import type { LocalizedString } from '../schema/localization'
import { defaultValue, translations } from '../schema/localization'
import type { Location } from '../schema/locations'
import type { PassInput } from '../schema/pass'
import type { GoogleSavePayload } from './jwt'

/**
 * Options that control how a `PassInput` is rendered to Google Wallet
 * shape. `issuerId` comes from the {@link GoogleSigningMaterial}; the
 * rest default sensibly when omitted.
 */
export interface GoogleRenderOptions {
  /** Numeric Google Wallet issuer ID. */
  issuerId: string
  /**
   * Suffix for the class ID (`{issuerId}.{classSuffix}`). Defaults to
   * `{serialNumber}-class`. One class per pass style is the norm in
   * production, so consumers typically pass a stable suffix here.
   */
  classSuffix?: string
  /**
   * Suffix for the object ID (`{issuerId}.{objectSuffix}`). Defaults
   * to the pass input's `serialNumber`.
   */
  objectSuffix?: string
}

// --- helpers ---

const GOOGLE_BARCODE_FORMAT: Record<string, string> = {
  qr: 'QR_CODE',
  pdf417: 'PDF_417',
  aztec: 'AZTEC',
  code128: 'CODE_128',
  ean13: 'EAN_13',
  code39: 'CODE_39',
  codabar: 'CODABAR',
  itf: 'ITF_14',
}

const HEX_LONG = /^#[0-9a-f]{6}$/i
const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/

/** Convert any passmint color form to Google's `#rrggbb` hex. */
function toHexColor(color: string): string {
  if (HEX_LONG.test(color)) return color.toLowerCase()
  const short = HEX_SHORT.exec(color)
  if (short) {
    const [, r, g, b] = short
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const rgb = RGB.exec(color)
  if (rgb) {
    const toHex = (s: string) => Number.parseInt(s, 10).toString(16).padStart(2, '0')
    return `#${toHex(rgb[1] ?? '0')}${toHex(rgb[2] ?? '0')}${toHex(rgb[3] ?? '0')}`
  }
  throw new PassmintRenderError(
    'E_APPLE_INVALID_COLOR',
    `Cannot normalize color "${color}" to Google #rrggbb form.`,
  )
}

/**
 * Convert a passmint `LocalizedString` to Google's `LocalizedString`.
 * Uses `'en'` as the assumed language for shorthand strings — Google
 * requires an explicit language tag on every LocalizedString, even
 * when there are no translations.
 */
function toGoogleLocalized(ls: LocalizedString): Record<string, unknown> {
  if (typeof ls === 'string') {
    return { defaultValue: { language: 'en', value: ls } }
  }
  const out: Record<string, unknown> = {
    defaultValue: { language: 'en', value: ls.default },
  }
  const trans = translations(ls)
  if (Object.keys(trans).length > 0) {
    out.translatedValues = Object.entries(trans).map(([lang, value]) => ({
      language: lang,
      value,
    }))
  }
  return out
}

/**
 * Convert an `ImageSource` to Google's Image shape. Google requires
 * an HTTPS URI — inline bytes are rejected with an actionable error.
 */
function toGoogleImage(source: ImageSource, field: string): Record<string, unknown> {
  if ('url' in source) {
    return { sourceUri: { uri: source.url } }
  }
  throw new PassmintRenderError(
    'E_GOOGLE_MISSING_IMAGE_URL',
    `Google Wallet requires an HTTPS URI for "${field}", but only inline bytes were provided. Upload the image to a CDN and use the URL form.`,
  )
}

function maybeToGoogleImage(
  source: ImageSource | undefined,
  field: string,
): Record<string, unknown> | undefined {
  if (source === undefined) return undefined
  return toGoogleImage(source, field)
}

/**
 * Map our barcode encoding to Google's `BarcodeRenderEncoding` enum.
 *
 * Google only defines two values:
 *   - `RENDER_ENCODING_UNSPECIFIED` (the default)
 *   - `UTF_8` — valid ONLY for `qrCode` barcodes
 *
 * Anything else (`ISO_8859_1`, `UTF_16`, etc.) is rejected at save-link time.
 * See https://developers.google.com/wallet/reference/rest/v1/BarcodeRenderEncoding
 */
function googleRenderEncoding(barcode: Barcode): string {
  if (barcode.format === 'qr' && barcode.messageEncoding === 'utf-8') {
    return 'UTF_8'
  }
  return 'RENDER_ENCODING_UNSPECIFIED'
}

function renderBarcode(barcode: Barcode): Record<string, unknown> {
  const altText: LocalizedString = barcode.altText ?? barcode.message
  return {
    type: GOOGLE_BARCODE_FORMAT[barcode.format],
    value: barcode.message,
    alternateText: defaultValue(altText),
    renderEncoding: googleRenderEncoding(barcode),
  }
}

function renderLocations(
  locations: readonly Location[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!locations || locations.length === 0) return undefined
  return locations.map((loc) => ({ latitude: loc.latitude, longitude: loc.longitude }))
}

/**
 * Turn passmint fields into Google `textModulesData` entries. Apple's
 * positional arrays (header/primary/secondary/auxiliary/back) have no
 * direct Google analog, so we flatten them into label/body rows.
 */
function fieldsToTextModules(input: PassInput): Record<string, unknown>[] | undefined {
  const collected: Field[] = []
  for (const group of [
    input.headerFields,
    input.primaryFields,
    input.secondaryFields,
    input.auxiliaryFields,
    input.backFields,
  ] as const) {
    if (group) collected.push(...group)
  }
  if (collected.length === 0) return undefined
  return collected.map((field) => {
    const entry: Record<string, unknown> = {
      id: field.key,
      body: String(field.value),
    }
    if (field.label !== undefined) {
      entry.header = defaultValue(field.label)
      entry.localizedHeader = toGoogleLocalized(field.label)
    }
    return entry
  })
}

// --- deep merge (shared with apple renderer pattern) ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Prototype-pollution guard: own-property keys named `__proto__`, `constructor`,
// or `prototype` (as can appear in JSON.parse output) must never be walked into
// a bracket assignment on the target.
const UNSAFE_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function deepMerge(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): void {
  for (const key of Object.keys(source)) {
    if (UNSAFE_MERGE_KEYS.has(key)) continue
    const value = source[key]
    const existing = target[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      deepMerge(existing, value)
    } else {
      target[key] = value
    }
  }
}

// --- title helpers ---

/** Derive a cardTitle / issuerName from the input. */
function resolveTitle(input: PassInput): LocalizedString {
  return input.logoText ?? input.organizationName
}

/** Derive the "header" text for a card. Uses description as a fallback. */
function resolveHeader(input: PassInput): LocalizedString {
  return input.description
}

// --- per-style renderers ---

interface StyleResult {
  classKey: keyof GoogleSavePayload
  objectKey: keyof GoogleSavePayload
  classDef: Record<string, unknown>
  objectDef: Record<string, unknown>
}

function commonClassFields(input: PassInput, classId: string): Record<string, unknown> {
  const cls: Record<string, unknown> = {
    id: classId,
    issuerName: defaultValue(resolveTitle(input)),
    reviewStatus: 'UNDER_REVIEW',
  }
  if (input.colors?.background !== undefined) {
    cls.hexBackgroundColor = toHexColor(input.colors.background)
  }
  if (input.images.logo) {
    const logoImage = maybeToGoogleImage(input.images.logo.x2, 'images.logo.x2')
    if (logoImage) cls.programLogo = logoImage
  }
  if (input.images.heroImage) {
    cls.heroImage = { sourceUri: { uri: input.images.heroImage.url } }
  }
  return cls
}

function commonObjectFields(
  input: PassInput,
  classId: string,
  objectId: string,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: objectId,
    classId,
    state: 'ACTIVE',
  }
  if (input.colors?.background !== undefined) {
    obj.hexBackgroundColor = toHexColor(input.colors.background)
  }
  if (input.barcodes && input.barcodes.length > 0) {
    obj.barcode = renderBarcode(input.barcodes[0] as Barcode)
  }
  const textModules = fieldsToTextModules(input)
  if (textModules) obj.textModulesData = textModules
  const locations = renderLocations(input.locations)
  if (locations) obj.locations = locations
  if (input.images.heroImage) {
    obj.heroImage = { sourceUri: { uri: input.images.heroImage.url } }
  }
  if (input.expirationDate !== undefined) {
    obj.validTimeInterval = { end: { date: input.expirationDate } }
  }
  return obj
}

function renderEventTicket(input: PassInput, classId: string, objectId: string): StyleResult {
  return {
    classKey: 'eventTicketClasses',
    objectKey: 'eventTicketObjects',
    classDef: {
      ...commonClassFields(input, classId),
      eventName: toGoogleLocalized(resolveTitle(input)),
    },
    objectDef: {
      ...commonObjectFields(input, classId, objectId),
      ticketNumber: input.serialNumber,
    },
  }
}

function renderFlight(input: PassInput, classId: string, objectId: string): StyleResult {
  // Google's FlightClass requires airline + flight number + origin/destination
  // airport codes. Emitting empty placeholder objects (`{ carrier: {}, ... }`)
  // produces a JWT that Google rejects at save-link time with an opaque
  // error, so we fail fast here with a concrete list of what's missing.
  // See https://developers.google.com/wallet/reference/rest/v1/flightclass
  const airlineCode = input.semantics?.airlineCode
  const flightNumber = input.semantics?.flightNumber
  const departureAirportCode = input.semantics?.departureAirportCode
  const arrivalAirportCode = input.semantics?.arrivalAirportCode

  if (
    airlineCode === undefined ||
    flightNumber === undefined ||
    departureAirportCode === undefined ||
    arrivalAirportCode === undefined
  ) {
    const missing: string[] = []
    if (airlineCode === undefined) missing.push('semantics.airlineCode')
    if (flightNumber === undefined) missing.push('semantics.flightNumber')
    if (departureAirportCode === undefined) missing.push('semantics.departureAirportCode')
    if (arrivalAirportCode === undefined) missing.push('semantics.arrivalAirportCode')
    throw new PassmintRenderError(
      'E_GOOGLE_MISSING_FLIGHT_SEMANTICS',
      `Google Wallet flight class requires ${missing.join(', ')} on an air boarding pass. Set them via the pass's \`semantics\` field.`,
    )
  }

  const classDef: Record<string, unknown> = {
    ...commonClassFields(input, classId),
    flightHeader: {
      carrier: { carrierIataCode: airlineCode },
      flightNumber: String(flightNumber),
    },
    origin: { airportIataCode: departureAirportCode },
    destination: { airportIataCode: arrivalAirportCode },
  }
  const objectDef: Record<string, unknown> = {
    ...commonObjectFields(input, classId, objectId),
    reservationInfo: {
      confirmationCode: input.semantics?.confirmationNumber ?? input.serialNumber,
    },
  }
  return { classKey: 'flightClasses', objectKey: 'flightObjects', classDef, objectDef }
}

function renderTransit(input: PassInput, classId: string, objectId: string): StyleResult {
  const googleTransitType = ((): string => {
    if (input.style !== 'boardingPass') return 'OTHER'
    switch (input.transitType) {
      case 'train':
        return 'TRAIN'
      case 'bus':
        return 'BUS'
      case 'boat':
        return 'OTHER'
      default:
        return 'OTHER'
    }
  })()
  return {
    classKey: 'transitClasses',
    objectKey: 'transitObjects',
    classDef: {
      ...commonClassFields(input, classId),
      transitType: googleTransitType,
    },
    objectDef: {
      ...commonObjectFields(input, classId, objectId),
      tripType: 'ONE_WAY',
    },
  }
}

function renderLoyalty(input: PassInput, classId: string, objectId: string): StyleResult {
  return {
    classKey: 'loyaltyClasses',
    objectKey: 'loyaltyObjects',
    classDef: {
      ...commonClassFields(input, classId),
      programName: defaultValue(resolveTitle(input)),
    },
    objectDef: {
      ...commonObjectFields(input, classId, objectId),
      accountId: input.serialNumber,
      accountName: defaultValue(resolveHeader(input)),
    },
  }
}

function renderOffer(input: PassInput, classId: string, objectId: string): StyleResult {
  return {
    classKey: 'offerClasses',
    objectKey: 'offerObjects',
    classDef: {
      ...commonClassFields(input, classId),
      title: defaultValue(resolveTitle(input)),
      provider: input.organizationName,
      redemptionChannel: 'BOTH',
    },
    objectDef: {
      ...commonObjectFields(input, classId, objectId),
    },
  }
}

function renderGeneric(input: PassInput, classId: string, objectId: string): StyleResult {
  return {
    classKey: 'genericClasses',
    objectKey: 'genericObjects',
    classDef: commonClassFields(input, classId),
    objectDef: {
      ...commonObjectFields(input, classId, objectId),
      cardTitle: toGoogleLocalized(resolveTitle(input)),
      header: toGoogleLocalized(resolveHeader(input)),
    },
  }
}

// --- public entry point ---

/**
 * Render a validated `PassInput` into a Google Wallet save-link JWT
 * payload. Returns the `payload` object that goes inside the JWT —
 * the caller (`signSaveJwt`) wraps it with the claims.
 *
 * Routes by pass style + transit type:
 *   - `eventTicket`  → eventTicketClasses + eventTicketObjects
 *   - `boardingPass` with `transitType: 'air'` → flightClasses + flightObjects
 *   - `boardingPass` with other transitType   → transitClasses + transitObjects
 *   - `storeCard`    → loyaltyClasses + loyaltyObjects
 *   - `coupon`       → offerClasses + offerObjects
 *   - `generic`      → genericClasses + genericObjects
 *
 * Deep-merges `applyRaw.google` into the object definition last so
 * consumers can add rotatingBarcode, smartTapRedemptionValue, and
 * any other fields the unified schema doesn't cover natively.
 *
 * @throws {PassmintRenderError} if a Google constraint is violated
 *   (e.g., an image is provided as bytes when Google requires a URL).
 */
// Google Wallet class/object IDs are restricted to [A-Za-z0-9._-]. Feeding
// anything outside this charset produces a JWT that Google rejects at
// save-link time with an opaque error, so we validate early and surface
// a concrete message instead. Length cap mirrors the practical ceiling
// on Google's side — 100 chars is well above any real suffix.
const GOOGLE_ID_SUFFIX = /^[A-Za-z0-9._-]{1,100}$/

function validateSuffix(value: string, field: 'classSuffix' | 'objectSuffix'): void {
  if (!GOOGLE_ID_SUFFIX.test(value)) {
    throw new PassmintGoogleError(
      'E_GOOGLE_RENDER',
      `Invalid ${field}: ${JSON.stringify(value)}. Must match ${GOOGLE_ID_SUFFIX.source} (Google-allowed charset [A-Za-z0-9._-], 1–100 chars).`,
    )
  }
}

export function renderGooglePayload(
  input: PassInput,
  options: GoogleRenderOptions,
): GoogleSavePayload {
  const classSuffix = options.classSuffix ?? `${input.serialNumber}-class`
  const objectSuffix = options.objectSuffix ?? input.serialNumber
  validateSuffix(classSuffix, 'classSuffix')
  validateSuffix(objectSuffix, 'objectSuffix')
  const classId = `${options.issuerId}.${classSuffix}`
  const objectId = `${options.issuerId}.${objectSuffix}`

  let result: StyleResult
  if (input.style === 'eventTicket') {
    result = renderEventTicket(input, classId, objectId)
  } else if (input.style === 'boardingPass') {
    result =
      input.transitType === 'air'
        ? renderFlight(input, classId, objectId)
        : renderTransit(input, classId, objectId)
  } else if (input.style === 'storeCard') {
    result = renderLoyalty(input, classId, objectId)
  } else if (input.style === 'coupon') {
    result = renderOffer(input, classId, objectId)
  } else {
    result = renderGeneric(input, classId, objectId)
  }

  if (input.applyRaw?.google) {
    deepMerge(result.objectDef, input.applyRaw.google)
  }

  return {
    [result.classKey]: [result.classDef],
    [result.objectKey]: [result.objectDef],
  }
}
