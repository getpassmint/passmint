import type { BaseIssue } from 'valibot'

/**
 * Base class for every error thrown by `passmint`.
 *
 * Consumers should pattern-match on `error.code` (stable strings) rather than
 * message text. Use `instanceof PassmintError` for broad catches, or the
 * narrower subclasses (`PassmintSchemaError` etc.) for targeted handling.
 */
export class PassmintError extends Error {
  /** Stable failure-mode discriminator. Never localized, never changes across versions. */
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PassmintError'
    this.code = code
  }
}

export type SchemaErrorCode = 'E_SCHEMA'

/**
 * Thrown when a pass input fails schema validation.
 * `issues` is the raw Valibot issue list, preserved so callers can render
 * field-level error messages in forms, API responses, etc.
 */
export class PassmintSchemaError extends PassmintError {
  override readonly code: SchemaErrorCode = 'E_SCHEMA'
  readonly issues: ReadonlyArray<BaseIssue<unknown>>

  constructor(issues: ReadonlyArray<BaseIssue<unknown>>) {
    super('E_SCHEMA', formatIssues(issues))
    this.name = 'PassmintSchemaError'
    this.issues = issues
  }
}

export type RenderErrorCode =
  | 'E_APPLE_MISSING_IMAGE_BYTES'
  | 'E_GOOGLE_MISSING_IMAGE_URL'
  | 'E_GOOGLE_MISSING_FLIGHT_SEMANTICS'
  | 'E_APPLE_INVALID_COLOR'
  | 'E_APPLE_MISSING_TRANSIT_TYPE'

/**
 * Thrown when a schema-valid pass cannot be rendered to the target platform
 * because of a platform-specific constraint (e.g. Apple requires inline image
 * bytes but only a URL was provided).
 */
export class PassmintRenderError extends PassmintError {
  override readonly code: RenderErrorCode

  constructor(code: RenderErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options)
    this.name = 'PassmintRenderError'
    this.code = code
  }
}

export type SigningErrorCode =
  | 'E_KEY_IMPORT'
  | 'E_CERT_PARSE'
  | 'E_PEM_DECODE'
  | 'E_SIGN'
  | 'E_UNSUPPORTED_KEY_FORMAT'

/**
 * Thrown by the CMS signing pipeline: key import, certificate parsing,
 * DER encoding, or the RSA sign operation itself.
 */
export class PassmintSigningError extends PassmintError {
  override readonly code: SigningErrorCode

  constructor(code: SigningErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options)
    this.name = 'PassmintSigningError'
    this.code = code
  }
}

export type PackagingErrorCode = 'E_MANIFEST' | 'E_ZIP' | 'E_STRINGS_FILE'

/**
 * Thrown during .pkpass assembly: manifest generation, ZIP writing, or
 * `.strings` file emission.
 */
export class PassmintPackagingError extends PassmintError {
  override readonly code: PackagingErrorCode

  constructor(code: PackagingErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options)
    this.name = 'PassmintPackagingError'
    this.code = code
  }
}

export type GoogleErrorCode =
  | 'E_JWT_SIGN'
  | 'E_PAYLOAD_TOO_LARGE'
  | 'E_SERVICE_ACCOUNT_KEY'
  | 'E_GOOGLE_RENDER'

/**
 * Thrown by the Google Wallet JWT / save-link pipeline.
 */
export class PassmintGoogleError extends PassmintError {
  override readonly code: GoogleErrorCode

  constructor(code: GoogleErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options)
    this.name = 'PassmintGoogleError'
    this.code = code
  }
}

function formatIssues(issues: ReadonlyArray<BaseIssue<unknown>>): string {
  if (issues.length === 0) return 'Invalid pass input'
  const lines = issues.map((issue) => {
    const path = issue.path?.map((segment) => segment.key).join('.') ?? '(root)'
    return `${path}: ${issue.message}`
  })
  return `Invalid pass input: ${lines.join('; ')}`
}
