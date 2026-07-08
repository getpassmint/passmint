import * as v from 'valibot'
import { HttpsUrlSchema } from './url'

/**
 * A featured action: a tappable button shown below the pass face (iOS 27+).
 * A pass may declare up to two. Apple-only — Google has no equivalent and
 * ignores these. Older iOS ignores the unknown `featuredActions` key.
 *
 * `type` is an open string rather than a closed enum: Apple's full set of
 * action types is not publicly enumerated, and a closed list would force a
 * release each time Apple adds one. Known values include `membershipBenefits`
 * and `viewMembership`.
 */
export const FeaturedActionSchema = v.object({
  /** Stable, unique identifier for the action within the pass. */
  identifier: v.pipe(v.string(), v.minLength(1)),
  /** Action type, e.g. `membershipBenefits`, `viewMembership`. */
  type: v.pipe(v.string(), v.minLength(1)),
  /** Universal link opened when the action is tapped. Must be HTTPS. */
  url: HttpsUrlSchema,
})

export type FeaturedAction = v.InferOutput<typeof FeaturedActionSchema>
