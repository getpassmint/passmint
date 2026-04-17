import { PassmintRenderError } from '../errors'
import type { Barcode } from '../schema/barcodes'
import type { Field } from '../schema/fields'
import type { ImageSource, Images, ImageTriple } from '../schema/images'
import type { LocalizedString } from '../schema/localization'
import { defaultValue, translations } from '../schema/localization'
import type { PassInput } from '../schema/pass'
import { encodeStringsFile } from './strings'

/**
 * Result of rendering a `PassInput` to Apple shape.
 *
 * Callers zip these together (plus `manifest.json` + `signature`) to
 * produce the final `.pkpass`.
 */
export interface AppleRenderedPass {
  /** The decoded `pass.json` object (not yet JSON-stringified). */
  passJson: Record<string, unknown>
  /**
   * Files to include in the ZIP at the given paths. Includes image
   * assets keyed as `icon.png`, `icon@2x.png`, etc. Does NOT include
   * `pass.json`, `manifest.json`, or `signature`.
   */
  files: Record<string, Uint8Array>
}

// --- color normalization ---

const HEX_FULL = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i

function normalizeColor(input: string): string {
  if (input.startsWith('rgb(')) return input
  const full = HEX_FULL.exec(input)
  if (full) {
    const r = Number.parseInt(full[1] ?? '0', 16)
    const g = Number.parseInt(full[2] ?? '0', 16)
    const b = Number.parseInt(full[3] ?? '0', 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  const short = HEX_SHORT.exec(input)
  if (short) {
    const r = Number.parseInt((short[1] ?? '0').repeat(2), 16)
    const g = Number.parseInt((short[2] ?? '0').repeat(2), 16)
    const b = Number.parseInt((short[3] ?? '0').repeat(2), 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  throw new PassmintRenderError(
    'E_APPLE_INVALID_COLOR',
    `Cannot normalize color "${input}" to rgb() form.`,
  )
}

// --- friendly-name → Apple PK* enum maps ---

const TEXT_ALIGNMENT: Record<string, string> = {
  left: 'PKTextAlignmentLeft',
  center: 'PKTextAlignmentCenter',
  right: 'PKTextAlignmentRight',
  natural: 'PKTextAlignmentNatural',
}

const DATE_TIME_STYLE: Record<string, string> = {
  none: 'PKDateStyleNone',
  short: 'PKDateStyleShort',
  medium: 'PKDateStyleMedium',
  long: 'PKDateStyleLong',
  full: 'PKDateStyleFull',
}

const NUMBER_STYLE: Record<string, string> = {
  decimal: 'PKNumberStyleDecimal',
  percent: 'PKNumberStylePercent',
  scientific: 'PKNumberStyleScientific',
  spellOut: 'PKNumberStyleSpellOut',
}

const DATA_DETECTOR: Record<string, string> = {
  phoneNumber: 'PKDataDetectorTypePhoneNumber',
  link: 'PKDataDetectorTypeLink',
  address: 'PKDataDetectorTypeAddress',
  calendarEvent: 'PKDataDetectorTypeCalendarEvent',
}

const BARCODE_FORMAT: Record<string, string> = {
  qr: 'PKBarcodeFormatQR',
  pdf417: 'PKBarcodeFormatPDF417',
  aztec: 'PKBarcodeFormatAztec',
  code128: 'PKBarcodeFormatCode128',
}

const TRANSIT_TYPE: Record<string, string> = {
  air: 'PKTransitTypeAir',
  train: 'PKTransitTypeTrain',
  bus: 'PKTransitTypeBus',
  boat: 'PKTransitTypeBoat',
  generic: 'PKTransitTypeGeneric',
}

// --- localization collection ---

/**
 * Accumulator for translations gathered from `LocalizedString` fields
 * across the pass input. Keyed by language tag, then by the default
 * value (which becomes the key in pass.strings).
 */
class TranslationCollector {
  private readonly byLang: Map<string, Map<string, string>> = new Map()

  add(localized: LocalizedString): string {
    const key = defaultValue(localized)
    const trans = translations(localized)
    for (const [lang, value] of Object.entries(trans)) {
      let map = this.byLang.get(lang)
      if (!map) {
        map = new Map()
        this.byLang.set(lang, map)
      }
      map.set(key, value)
    }
    return key
  }

  /**
   * Merge additional pre-built translations (from the top-level
   * `localizations` field). Later writes win over earlier ones.
   */
  merge(lang: string, entries: Readonly<Record<string, string>>): void {
    let map = this.byLang.get(lang)
    if (!map) {
      map = new Map()
      this.byLang.set(lang, map)
    }
    for (const [key, value] of Object.entries(entries)) {
      map.set(key, value)
    }
  }

  /**
   * Emit `.strings` files as a file map keyed by `{lang}.lproj/pass.strings`.
   */
  toFiles(): Record<string, Uint8Array> {
    const out: Record<string, Uint8Array> = {}
    for (const [lang, map] of this.byLang.entries()) {
      if (map.size === 0) continue
      const entries: Record<string, string> = {}
      for (const [key, value] of map.entries()) {
        entries[key] = value
      }
      out[`${lang}.lproj/pass.strings`] = encodeStringsFile(entries)
    }
    return out
  }
}

// --- field / barcode rendering ---

function renderField(field: Field, collector: TranslationCollector): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: field.key,
    value: field.value,
  }
  if (field.label !== undefined) out.label = collector.add(field.label)
  if (field.attributedValue !== undefined) out.attributedValue = field.attributedValue
  if (field.textAlignment !== undefined) {
    out.textAlignment = TEXT_ALIGNMENT[field.textAlignment]
  }
  if (field.dateStyle !== undefined) out.dateStyle = DATE_TIME_STYLE[field.dateStyle]
  if (field.timeStyle !== undefined) out.timeStyle = DATE_TIME_STYLE[field.timeStyle]
  if (field.isRelative !== undefined) out.isRelative = field.isRelative
  if (field.ignoresTimeZone !== undefined) out.ignoresTimeZone = field.ignoresTimeZone
  if (field.currencyCode !== undefined) out.currencyCode = field.currencyCode
  if (field.numberStyle !== undefined) out.numberStyle = NUMBER_STYLE[field.numberStyle]
  if (field.changeMessage !== undefined) out.changeMessage = field.changeMessage
  if (field.dataDetectorTypes !== undefined) {
    out.dataDetectorTypes = field.dataDetectorTypes.map((d) => DATA_DETECTOR[d])
  }
  return out
}

function renderBarcode(barcode: Barcode, collector: TranslationCollector): Record<string, unknown> {
  // altText defaults to the barcode message if not provided.
  const altLocalized: LocalizedString = barcode.altText ?? barcode.message
  const out: Record<string, unknown> = {
    format: BARCODE_FORMAT[barcode.format],
    message: barcode.message,
    messageEncoding: barcode.messageEncoding ?? 'iso-8859-1',
    altText: collector.add(altLocalized),
  }
  return out
}

// --- image extraction ---

function extractImageSource(source: ImageSource, path: string): Uint8Array {
  if ('bytes' in source) return source.bytes
  throw new PassmintRenderError(
    'E_APPLE_MISSING_IMAGE_BYTES',
    `Apple .pkpass requires inline image bytes for "${path}", but only a URL was provided. Fetch the URL yourself and pass the bytes as Uint8Array, or use a sibling helper package.`,
  )
}

function extractTriple(
  triple: ImageTriple | undefined,
  base: string,
  files: Record<string, Uint8Array>,
): void {
  if (!triple) return
  if (triple.x1) files[`${base}.png`] = extractImageSource(triple.x1, `${base}.png`)
  files[`${base}@2x.png`] = extractImageSource(triple.x2, `${base}@2x.png`)
  if (triple.x3) files[`${base}@3x.png`] = extractImageSource(triple.x3, `${base}@3x.png`)
}

function extractImages(images: Images): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  extractTriple(images.icon, 'icon', files)
  extractTriple(images.logo, 'logo', files)
  extractTriple(images.strip, 'strip', files)
  extractTriple(images.thumbnail, 'thumbnail', files)
  extractTriple(images.background, 'background', files)
  extractTriple(images.footer, 'footer', files)
  // heroImage is Google-only and does not appear in the pkpass.
  return files
}

// --- semantic tag rendering ---

function renderSemantics(semantics: PassInput['semantics']): Record<string, unknown> | undefined {
  if (!semantics) return undefined
  // Semantics are already in Apple shape for most fields; we just strip
  // undefined properties so we don't emit them as null.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(semantics)) {
    if (v !== undefined) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// --- deep merge for applyRaw escape hatch ---

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

// --- style content builder ---

function buildStyleContent(
  input: PassInput,
  collector: TranslationCollector,
): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  if (input.headerFields)
    content.headerFields = input.headerFields.map((f) => renderField(f, collector))
  if (input.primaryFields)
    content.primaryFields = input.primaryFields.map((f) => renderField(f, collector))
  if (input.secondaryFields)
    content.secondaryFields = input.secondaryFields.map((f) => renderField(f, collector))
  if (input.auxiliaryFields)
    content.auxiliaryFields = input.auxiliaryFields.map((f) => renderField(f, collector))
  if (input.backFields) content.backFields = input.backFields.map((f) => renderField(f, collector))
  if (input.style === 'boardingPass') {
    content.transitType = TRANSIT_TYPE[input.transitType]
  }
  return content
}

// --- main entry point ---

/**
 * Render a validated `PassInput` into the Apple `.pkpass` shape: the
 * decoded `pass.json` object and the file map (images + strings).
 *
 * Pure function: no signing, no zipping, no I/O. The composer
 * (`assemblePkpass`) drives this then signs + zips the result.
 *
 * @throws {PassmintRenderError} if a platform constraint is violated
 *   (e.g., an image source is URL-only when Apple requires bytes).
 */
export function renderApplePass(input: PassInput): AppleRenderedPass {
  const collector = new TranslationCollector()

  const passJson: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber: input.serialNumber,
    teamIdentifier: input.teamIdentifier,
    organizationName: input.organizationName,
    description: input.description,
  }

  if (input.logoText !== undefined) passJson.logoText = collector.add(input.logoText)

  if (input.colors) {
    passJson.backgroundColor = normalizeColor(input.colors.background)
    passJson.foregroundColor = normalizeColor(input.colors.foreground)
    if (input.colors.label !== undefined) {
      passJson.labelColor = normalizeColor(input.colors.label)
    }
  }

  if (input.expirationDate !== undefined) passJson.expirationDate = input.expirationDate
  if (input.relevantDate !== undefined) passJson.relevantDate = input.relevantDate
  if (input.voided !== undefined) passJson.voided = input.voided
  if (input.sharingProhibited !== undefined) passJson.sharingProhibited = input.sharingProhibited
  if (input.groupingIdentifier !== undefined) passJson.groupingIdentifier = input.groupingIdentifier

  if (input.webService) {
    passJson.webServiceURL = input.webService.url
    passJson.authenticationToken = input.webService.authToken
  }

  if (input.locations) passJson.locations = input.locations
  if (input.beacons) passJson.beacons = input.beacons
  if (input.maxDistance !== undefined) passJson.maxDistance = input.maxDistance

  const semanticTags = renderSemantics(input.semantics)
  if (semanticTags) passJson.semanticTags = semanticTags

  if (input.barcodes) {
    passJson.barcodes = input.barcodes.map((b) => renderBarcode(b, collector))
  }

  passJson[input.style] = buildStyleContent(input, collector)

  // Merge top-level localizations if the user provided any explicitly.
  if (input.localizations) {
    for (const [lang, entries] of Object.entries(input.localizations)) {
      collector.merge(lang, entries)
    }
  }

  // Apply the Apple escape-hatch overrides last so users can force
  // anything we don't support natively.
  if (input.applyRaw?.apple) {
    deepMerge(passJson, input.applyRaw.apple)
  }

  const files = extractImages(input.images)
  for (const [path, bytes] of Object.entries(collector.toFiles())) {
    files[path] = bytes
  }

  return { passJson, files }
}
