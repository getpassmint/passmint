export const VERSION: string = '0.0.0'

export type { ManifestResult } from './apple/manifest'
export { buildManifest } from './apple/manifest'
// --- Low-level Apple pipeline (for advanced use cases) ---
export { assemblePkpass } from './apple/pkpass'
export type { AppleRenderedPass } from './apple/render'
export { renderApplePass } from './apple/render'
export { encodeStringsFile, encodeUtf16BeWithBom } from './apple/strings'
export type {
  SigningMaterialFromParsedInput,
  SigningMaterialFromPemInput,
} from './cms'
// --- CMS signing (Apple .pkpass) ---
export { SigningMaterial, signManifest } from './cms'
export { MAX_PEM_LENGTH } from './cms/pem'
export type {
  GoogleErrorCode,
  PackagingErrorCode,
  RenderErrorCode,
  SchemaErrorCode,
  SigningErrorCode,
} from './errors'
// --- Errors ---
export {
  PassmintError,
  PassmintGoogleError,
  PassmintPackagingError,
  PassmintRenderError,
  PassmintSchemaError,
  PassmintSigningError,
} from './errors'
export type {
  GoogleRenderOptions,
  GoogleSaveJwtClaims,
  GoogleSavePayload,
  GoogleSigningMaterialFromParsedInput,
  GoogleSigningMaterialFromServiceAccountInput,
} from './google'
// --- Google Wallet (JWT save-link) ---
export {
  base64url,
  base64urlJson,
  buildSaveLink,
  GoogleSigningMaterial,
  renderGooglePayload,
  signSaveJwt,
} from './google'
export type { GoogleSaveOptions } from './pass'
// --- The main facade ---
export { DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS, Pass, PassBuilder, SignedPass } from './pass'
export { MAX_IMAGE_BYTE_LENGTH } from './schema/images'
export type {
  Barcode,
  BarcodeFormat,
  Beacon,
  BoardingPassInput,
  Color,
  CouponInput,
  DataDetector,
  DateTimeStyle,
  EventTicketInput,
  Field,
  FieldValue,
  GenericPassInput,
  ImageSource,
  Images,
  ImageTriple,
  LocalizedString,
  Location,
  NumberStyle,
  PassInput,
  PassStyle,
  SemanticTags,
  StoreCardInput,
  TextAlignment,
} from './schema/index'
// --- Schema + validation ---
export { PassInputSchema, parsePassInput } from './schema/index'
export { ZipAssembler } from './zip/assembler'
