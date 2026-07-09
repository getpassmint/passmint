import { assemblePkpass, type ManifestSigner } from './apple/pkpass'
import type { SigningMaterial } from './cms'
import { PassmintGoogleError } from './errors'
import { type GoogleSaveJwtClaims, signSaveJwt } from './google/jwt'
import type { GoogleSigningMaterial } from './google/material'
import { type GoogleRenderOptions, renderGooglePayload } from './google/render'
import { buildSaveLink } from './google/save-link'
import type { Barcode } from './schema/barcodes'
import type { FeaturedAction } from './schema/featured-actions'
import type { Field } from './schema/fields'
import { parsePassInput } from './schema/index'
import type { Beacon, Location } from './schema/locations'
import type {
  BoardingPassInput,
  CouponInput,
  EventTicketInput,
  GenericPassInput,
  PassInput,
  StoreCardInput,
} from './schema/pass'
import type { SemanticTags } from './schema/semantic-tags'

/**
 * Default save-link JWT lifetime: 15 minutes. Long enough to cover a
 * normal user journey (email click, browser load, save), short enough
 * to neutralize most forwarded-URL replay scenarios. Callers can
 * override via `GoogleSaveOptions.expirySeconds`.
 */
export const DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS = 15 * 60

/**
 * Options for generating a Google Wallet save-link JWT. Passed to
 * {@link Pass.toGoogleJwt} and {@link Pass.toGoogleSaveLink}.
 */
export interface GoogleSaveOptions extends Omit<GoogleRenderOptions, 'issuerId'> {
  /**
   * Allowed origin domains for the save link. Google enforces an
   * origin check against the referring page, so this should list your
   * real application domains (no protocol, no trailing slash).
   */
  origins: readonly string[]
  /**
   * JWT lifetime in seconds, relative to `iat`. Defaults to 15 minutes
   * (see {@link DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS}). Set to `null` to
   * omit the `exp` claim entirely (not recommended — leaked save URLs
   * remain valid indefinitely). Values ≤ 0 throw.
   */
  expirySeconds?: number | null
}

/**
 * A signed `.pkpass`. Produced by {@link Pass.sign}.
 *
 * Offers three output methods so consumers can pick whichever fits
 * their runtime best:
 *   - `toUint8Array()` — buffered bytes
 *   - `toStream()` — `ReadableStream<Uint8Array>` for piping
 *   - `toResponse()` — HTTP `Response` with correct content type
 */
export class SignedPass {
  private readonly bytes: Uint8Array
  private readonly serialNumber: string

  constructor(bytes: Uint8Array, serialNumber: string) {
    this.bytes = bytes
    this.serialNumber = serialNumber
  }

  /** The raw `.pkpass` ZIP bytes. */
  toUint8Array(): Uint8Array {
    return this.bytes
  }

  /**
   * A single-chunk `ReadableStream<Uint8Array>`. v0 is non-streaming
   * internally; this wrapper exists so consumer code can use the same
   * shape everywhere.
   */
  toStream(): ReadableStream<Uint8Array> {
    const chunk = this.bytes
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.close()
      },
    })
  }

  /**
   * HTTP `Response` pre-set with `Content-Type: application/vnd.apple.pkpass`
   * and a `Content-Disposition` attachment filename derived from the
   * serial number. Override either via `init.headers`.
   *
   * @example
   * ```ts
   * return pass.sign(material).then((p) => p.toResponse())
   * ```
   */
  toResponse(init?: ResponseInit): Response {
    const headers = new Headers(init?.headers)
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/vnd.apple.pkpass')
    }
    if (!headers.has('content-disposition')) {
      // The schema already restricts serialNumber to [A-Za-z0-9._-], but
      // defend in depth in case the value arrived via `Pass.from` on a
      // schema bypass — strip anything that isn't in the safe set before
      // interpolating into the quoted filename.
      const safeSerial = this.serialNumber.replace(/[^A-Za-z0-9._-]/g, '_')
      headers.set('content-disposition', `attachment; filename="${safeSerial}.pkpass"`)
    }
    // Copy into a standalone ArrayBuffer — avoids a TS 5.7+ generic
    // variance mismatch between Uint8Array<ArrayBufferLike> and BodyInit.
    const body = this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    ) as ArrayBuffer
    return new Response(body, { ...init, headers })
  }
}

/**
 * A validated pass. Build via one of:
 *   - fluent builders: `Pass.eventTicket({...}).primaryField({...})...`
 *   - raw object: `Pass.from({ style: 'eventTicket', ... })`
 *
 * Pass objects are immutable after construction. Call {@link sign} to
 * produce a {@link SignedPass} for output.
 */
export class Pass {
  readonly input: PassInput

  private constructor(input: PassInput) {
    this.input = input
  }

  // ---- entry points ----

  /**
   * Parse and validate a raw pass input. Throws {@link PassmintSchemaError}
   * if the input is invalid.
   */
  static from(input: unknown): Pass {
    return new Pass(parsePassInput(input))
  }

  /** Start building an event ticket pass with the required base fields. */
  static eventTicket(base: Omit<EventTicketInput, 'style'>): PassBuilder<EventTicketInput> {
    return new PassBuilder<EventTicketInput>({ ...base, style: 'eventTicket' } as EventTicketInput)
  }

  /** Start building a boarding pass with the required base fields. */
  static boardingPass(base: Omit<BoardingPassInput, 'style'>): PassBuilder<BoardingPassInput> {
    return new PassBuilder<BoardingPassInput>({
      ...base,
      style: 'boardingPass',
    } as BoardingPassInput)
  }

  /** Start building a store card pass with the required base fields. */
  static storeCard(base: Omit<StoreCardInput, 'style'>): PassBuilder<StoreCardInput> {
    return new PassBuilder<StoreCardInput>({ ...base, style: 'storeCard' } as StoreCardInput)
  }

  /** Start building a coupon pass with the required base fields. */
  static coupon(base: Omit<CouponInput, 'style'>): PassBuilder<CouponInput> {
    return new PassBuilder<CouponInput>({ ...base, style: 'coupon' } as CouponInput)
  }

  /** Start building a generic pass with the required base fields. */
  static generic(base: Omit<GenericPassInput, 'style'>): PassBuilder<GenericPassInput> {
    return new PassBuilder<GenericPassInput>({ ...base, style: 'generic' } as GenericPassInput)
  }

  // ---- operations ----

  /**
   * Sign and assemble the pass into a `.pkpass` file. Use with a
   * {@link SigningMaterial} instance you've built once and cached for
   * reuse across requests.
   *
   * Alternatively pass a {@link ManifestSigner} — a callback that receives the
   * raw `manifest.json` bytes and returns the DER-encoded CMS signature. Use it
   * when the private key must not exist in this process: the callback can hand
   * the manifest to a KMS, an HSM, or a separate signing service, and nothing
   * but `manifest.json` (a map of filenames to SHA-1 digests) ever leaves.
   *
   * @example
   * ```ts
   * await pass.sign(material)                               // key is here
   * await pass.sign((manifest) => signer.sign(manifest))    // key is elsewhere
   * ```
   */
  async sign(signing: SigningMaterial | ManifestSigner): Promise<SignedPass> {
    const bytes = await assemblePkpass(this.input, signing)
    return new SignedPass(bytes, this.input.serialNumber)
  }

  /**
   * Render the pass to a Google Wallet save-link JWT (the JWT string
   * itself, not wrapped in a URL). Useful when you need to embed the
   * JWT somewhere other than the standard save link.
   */
  async toGoogleJwt(material: GoogleSigningMaterial, options: GoogleSaveOptions): Promise<string> {
    const renderOptions: GoogleRenderOptions = { issuerId: material.issuerId }
    if (options.classSuffix !== undefined) renderOptions.classSuffix = options.classSuffix
    if (options.objectSuffix !== undefined) renderOptions.objectSuffix = options.objectSuffix
    const payload = renderGooglePayload(this.input, renderOptions)
    const iat = Math.floor(Date.now() / 1000)
    // `expirySeconds === null` is an explicit opt-out; undefined uses the
    // default; any positive finite integer wins. We reject NaN, Infinity,
    // non-integers, and ≤ 0 values up front — each would either produce
    // an expired JWT (≤ 0) or a non-integer `exp` that JSON.stringify
    // turns into `null` (NaN / Infinity) or that Google's JWT validator
    // silently coerces (fractional seconds).
    const expirySeconds =
      options.expirySeconds === undefined
        ? DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS
        : options.expirySeconds
    if (expirySeconds !== null && (!Number.isInteger(expirySeconds) || expirySeconds <= 0)) {
      throw new PassmintGoogleError(
        'E_JWT_SIGN',
        `expirySeconds must be a positive integer or null (got ${expirySeconds}).`,
      )
    }
    const claims: GoogleSaveJwtClaims = {
      iss: material.clientEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat,
      origins: options.origins,
      payload,
    }
    if (expirySeconds !== null) claims.exp = iat + expirySeconds
    return signSaveJwt(claims, material)
  }

  /**
   * Render the pass to a full "Add to Google Wallet" URL
   * (`https://pay.google.com/gp/v/save/{jwt}`). This is the usual way
   * to distribute passes via the save-link flow.
   *
   * @example
   * ```ts
   * const url = await pass.toGoogleSaveLink(googleMaterial, {
   *   origins: ['example.com'],
   * })
   * return Response.redirect(url)
   * ```
   */
  async toGoogleSaveLink(
    material: GoogleSigningMaterial,
    options: GoogleSaveOptions,
  ): Promise<string> {
    const jwt = await this.toGoogleJwt(material, options)
    return buildSaveLink(jwt)
  }

  /** Return the underlying validated input. */
  toObject(): PassInput {
    return this.input
  }
}

/**
 * A style-scoped mutable draft, chainable. Builders do not validate on
 * every mutation — validation happens in {@link build} / {@link sign},
 * so errors surface when you commit the pass, not earlier.
 *
 * Field-count limits declared in the schema (e.g., event tickets allow
 * at most 1 primary field) are still enforced — they just fire at build
 * time rather than at each mutation.
 */
export class PassBuilder<TInput extends PassInput> {
  private draft: TInput

  constructor(initial: TInput) {
    this.draft = initial
  }

  // --- field adders ---

  headerField(field: Field): this {
    const current = (this.draft as unknown as { headerFields?: Field[] }).headerFields ?? []
    ;(this.draft as unknown as { headerFields?: Field[] }).headerFields = [...current, field]
    return this
  }

  primaryField(field: Field): this {
    const current = (this.draft as unknown as { primaryFields?: Field[] }).primaryFields ?? []
    ;(this.draft as unknown as { primaryFields?: Field[] }).primaryFields = [...current, field]
    return this
  }

  secondaryField(field: Field): this {
    const current = (this.draft as unknown as { secondaryFields?: Field[] }).secondaryFields ?? []
    ;(this.draft as unknown as { secondaryFields?: Field[] }).secondaryFields = [...current, field]
    return this
  }

  auxiliaryField(field: Field): this {
    const current = (this.draft as unknown as { auxiliaryFields?: Field[] }).auxiliaryFields ?? []
    ;(this.draft as unknown as { auxiliaryFields?: Field[] }).auxiliaryFields = [...current, field]
    return this
  }

  backField(field: Field): this {
    const current = (this.draft as unknown as { backFields?: Field[] }).backFields ?? []
    ;(this.draft as unknown as { backFields?: Field[] }).backFields = [...current, field]
    return this
  }

  /**
   * Add the poster-only footer field (generic poster passes; max 1).
   * Only takes effect on a generic pass built with `poster: true`; on other
   * styles or non-poster generic passes it is ignored or rejected at build.
   */
  footerField(field: Field): this {
    const current = (this.draft as unknown as { footerFields?: Field[] }).footerFields ?? []
    ;(this.draft as unknown as { footerFields?: Field[] }).footerFields = [...current, field]
    return this
  }

  // --- supplementary ---

  barcode(barcode: Barcode): this {
    const current = this.draft.barcodes ?? []
    ;(this.draft as unknown as { barcodes?: Barcode[] }).barcodes = [...current, barcode]
    return this
  }

  /** Add a featured action (Apple only, iOS 27+). Max 2, enforced at build. */
  featuredAction(action: FeaturedAction): this {
    const current =
      (this.draft as unknown as { featuredActions?: FeaturedAction[] }).featuredActions ?? []
    ;(this.draft as unknown as { featuredActions?: FeaturedAction[] }).featuredActions = [
      ...current,
      action,
    ]
    return this
  }

  location(location: Location): this {
    const current = this.draft.locations ?? []
    ;(this.draft as unknown as { locations?: Location[] }).locations = [...current, location]
    return this
  }

  beacon(beacon: Beacon): this {
    const current = this.draft.beacons ?? []
    ;(this.draft as unknown as { beacons?: Beacon[] }).beacons = [...current, beacon]
    return this
  }

  /**
   * Add or merge an explicit localization table for a language. Keys are
   * the default (source) strings; values are the translations. These
   * are merged with any `LocalizedString` translations extracted from
   * individual field labels at render time.
   */
  localize(lang: string, entries: Readonly<Record<string, string>>): this {
    const existing = (this.draft.localizations ?? {}) as Record<string, Record<string, string>>
    const merged: Record<string, Record<string, string>> = { ...existing }
    merged[lang] = { ...(existing[lang] ?? {}), ...entries }
    ;(
      this.draft as unknown as { localizations?: Record<string, Record<string, string>> }
    ).localizations = merged
    return this
  }

  /** Attach semantic tags (Apple semanticTags / Google equivalents). */
  semantics(tags: SemanticTags): this {
    ;(this.draft as unknown as { semantics?: SemanticTags }).semantics = {
      ...((this.draft as unknown as { semantics?: SemanticTags }).semantics ?? {}),
      ...tags,
    }
    return this
  }

  // --- terminal ops ---

  /**
   * Validate the accumulated draft and return a {@link Pass}. Throws
   * {@link PassmintSchemaError} if the draft violates the schema
   * (including per-style field-count limits).
   */
  build(): Pass {
    return Pass.from(this.draft)
  }

  /** Shortcut: `.build().sign(signing)`. Accepts material or a {@link ManifestSigner}. */
  async sign(signing: SigningMaterial | ManifestSigner): Promise<SignedPass> {
    return this.build().sign(signing)
  }

  /** Return the raw (unvalidated) draft. */
  toObject(): TInput {
    return this.draft
  }
}
