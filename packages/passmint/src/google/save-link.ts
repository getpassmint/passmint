import { PassmintGoogleError } from '../errors'

const SAVE_LINK_PREFIX = 'https://pay.google.com/gp/v/save/'

/** Soft URL length cap. Browsers vary but ~8000 is a reliable ceiling. */
const MAX_URL_LENGTH = 8000

/**
 * Wrap a signed Google Wallet save JWT in the canonical
 * "Add to Google Wallet" URL.
 *
 * @throws {PassmintGoogleError} with code `E_PAYLOAD_TOO_LARGE` if the
 *   final URL would exceed {@link MAX_URL_LENGTH}. Upload the JWT to
 *   a redirector on your own origin in that case.
 */
export function buildSaveLink(jwt: string): string {
  const url = `${SAVE_LINK_PREFIX}${jwt}`
  if (url.length > MAX_URL_LENGTH) {
    throw new PassmintGoogleError(
      'E_PAYLOAD_TOO_LARGE',
      `Google Wallet save link exceeds ${MAX_URL_LENGTH} characters (${url.length}). Reduce the payload or serve the JWT via a redirector on your own origin.`,
    )
  }
  return url
}
