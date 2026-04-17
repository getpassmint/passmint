export const VERSION: string = '0.0.0'

// --- Errors ---
export {
  PassmintError,
  PassmintSchemaError,
  PassmintRenderError,
  PassmintSigningError,
  PassmintPackagingError,
  PassmintGoogleError,
} from './errors'
export type {
  SchemaErrorCode,
  RenderErrorCode,
  SigningErrorCode,
  PackagingErrorCode,
  GoogleErrorCode,
} from './errors'

// --- The main facade ---
export { Pass, PassBuilder, SignedPass, DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS } from './pass'
export type { GoogleSaveOptions } from './pass'

// --- Google Wallet (JWT save-link) ---
export {
  GoogleSigningMaterial,
  signSaveJwt,
  renderGooglePayload,
  buildSaveLink,
  base64url,
  base64urlJson,
} from './google'
export type {
  GoogleSigningMaterialFromServiceAccountInput,
  GoogleSigningMaterialFromParsedInput,
  GoogleSaveJwtClaims,
  GoogleSavePayload,
  GoogleRenderOptions,
} from './google'

// --- CMS signing (Apple .pkpass) ---
export { SigningMaterial, signManifest } from './cms'
export type {
  SigningMaterialFromPemInput,
  SigningMaterialFromParsedInput,
} from './cms'
export { MAX_PEM_LENGTH } from './cms/pem'

// --- Low-level Apple pipeline (for advanced use cases) ---
export { assemblePkpass } from './apple/pkpass'
export { renderApplePass } from './apple/render'
export type { AppleRenderedPass } from './apple/render'
export { buildManifest } from './apple/manifest'
export type { ManifestResult } from './apple/manifest'
export { encodeStringsFile, encodeUtf16BeWithBom } from './apple/strings'
export { ZipAssembler } from './zip/assembler'

// --- Schema + validation ---
export { parsePassInput, PassInputSchema } from './schema/index'
export { MAX_IMAGE_BYTE_LENGTH } from './schema/images'
export type {
  PassInput,
  PassStyle,
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GenericPassInput,
  LocalizedString,
  Color,
  ImageSource,
  ImageTriple,
  Images,
  Barcode,
  BarcodeFormat,
  Field,
  FieldValue,
  TextAlignment,
  DateTimeStyle,
  NumberStyle,
  DataDetector,
  Location,
  Beacon,
  SemanticTags,
} from './schema/index'
