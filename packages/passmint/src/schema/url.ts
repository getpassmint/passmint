import * as v from 'valibot'

/**
 * HTTPS-only URL. Same shape as `v.url()` but rejects any scheme that
 * isn't `https:`. Used for every caller-supplied URL that Apple or
 * Google will fetch on a real device — Apple PKPass explicitly requires
 * HTTPS for the webservice endpoint, and there's no legitimate reason
 * for `homepage` / `orderManagementUrl` to be anything else.
 */
export const HttpsUrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.check((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'URL must use https:// scheme'),
)
