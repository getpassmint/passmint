import * as v from 'valibot'

/**
 * A geographic location that triggers lock-screen relevance.
 * Apple allows up to 10 per pass. Enforced at the containing array level.
 */
export const LocationSchema = v.object({
  latitude: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
  longitude: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
  /** Altitude in meters. Apple-only; Google ignores. */
  altitude: v.optional(v.number()),
  /** Text shown on the lock screen when the pass is location-relevant. */
  relevantText: v.optional(v.string()),
})

export type Location = v.InferOutput<typeof LocationSchema>

/**
 * An iBeacon. Up to 10 per pass. Apple-only; Google has no equivalent.
 */
export const BeaconSchema = v.object({
  proximityUUID: v.pipe(
    v.string(),
    v.regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      'Expected a UUID',
    ),
  ),
  major: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(65535))),
  minor: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(65535))),
  relevantText: v.optional(v.string()),
})

export type Beacon = v.InferOutput<typeof BeaconSchema>
