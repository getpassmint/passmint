import * as v from 'valibot'

/**
 * A machine-readable semantic tag value. Apple's semantic tag schema
 * accepts strings, numbers, dates (ISO 8601), and structured currency.
 */
const CurrencyAmountSchema = v.object({
  amount: v.string(),
  currencyCode: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/)),
})

/**
 * A seat position. Used by `EventTicketSemantics.seats[]` and
 * `BoardingPassSemantics.seats[]`.
 */
const SeatSchema = v.object({
  seatSection: v.optional(v.string()),
  seatRow: v.optional(v.string()),
  seatNumber: v.optional(v.string()),
  seatIdentifier: v.optional(v.string()),
  seatType: v.optional(v.string()),
  seatDescription: v.optional(v.string()),
})

/**
 * A lat/lon location used by venue semantic tags.
 */
const SemanticLocationSchema = v.object({
  latitude: v.number(),
  longitude: v.number(),
})

const PersonNameComponentsSchema = v.object({
  givenName: v.optional(v.string()),
  familyName: v.optional(v.string()),
})

/**
 * Strict schema of all known Apple Wallet semantic tags as of iOS 19 (2026).
 *
 * Each field is optional; per-style render layers cherry-pick the fields
 * relevant to the pass style. New/unknown tags (for forward-compatibility
 * with newer iOS releases) go through the `applyRaw.apple.semanticTags`
 * escape hatch on the pass input, not through this schema.
 */
export const SemanticTagsSchema = v.object({
  // --- Universal ---
  totalPrice: v.optional(CurrencyAmountSchema),
  duration: v.optional(v.number()),
  silenceRequested: v.optional(v.boolean()),
  customerServiceNumber: v.optional(v.string()),
  homepage: v.optional(v.pipe(v.string(), v.url())),

  // --- Event tickets ---
  eventName: v.optional(v.string()),
  eventType: v.optional(
    v.picklist([
      'generic',
      'artExhibit',
      'conference',
      'concert',
      'festival',
      'livePerformance',
      'movie',
      'performance',
      'sportingEvent',
      'theatreEvent',
    ]),
  ),
  eventStartDate: v.optional(v.string()),
  eventEndDate: v.optional(v.string()),
  venueName: v.optional(v.string()),
  venueLocation: v.optional(SemanticLocationSchema),
  venueRoom: v.optional(v.string()),
  venueEntrance: v.optional(v.string()),
  venuePhoneNumber: v.optional(v.string()),
  venueParkingLotsOpenDate: v.optional(v.string()),
  venueDoorsOpenDate: v.optional(v.string()),
  venueOpenDate: v.optional(v.string()),
  performerNames: v.optional(v.array(v.string())),
  seats: v.optional(v.array(SeatSchema)),

  // --- Boarding passes (air) ---
  airlineCode: v.optional(v.string()),
  flightCode: v.optional(v.string()),
  flightNumber: v.optional(v.number()),
  departureAirportCode: v.optional(v.string()),
  departureAirportName: v.optional(v.string()),
  departureTerminal: v.optional(v.string()),
  departureGate: v.optional(v.string()),
  originalDepartureDate: v.optional(v.string()),
  currentDepartureDate: v.optional(v.string()),
  arrivalAirportCode: v.optional(v.string()),
  arrivalAirportName: v.optional(v.string()),
  arrivalTerminal: v.optional(v.string()),
  arrivalGate: v.optional(v.string()),
  originalArrivalDate: v.optional(v.string()),
  currentArrivalDate: v.optional(v.string()),
  boardingGroup: v.optional(v.string()),
  boardingSequenceNumber: v.optional(v.string()),
  confirmationNumber: v.optional(v.string()),
  passengerName: v.optional(PersonNameComponentsSchema),

  // --- Transit (train/bus/boat) ---
  departureLocation: v.optional(SemanticLocationSchema),
  departureLocationDescription: v.optional(v.string()),
  arrivalLocation: v.optional(SemanticLocationSchema),
  arrivalLocationDescription: v.optional(v.string()),
  transitProvider: v.optional(v.string()),
  vehicleName: v.optional(v.string()),
  vehicleNumber: v.optional(v.string()),
  vehicleType: v.optional(v.string()),
  originalBoardingDate: v.optional(v.string()),
  currentBoardingDate: v.optional(v.string()),

  // --- Store cards / loyalty ---
  balance: v.optional(CurrencyAmountSchema),
  membershipProgramName: v.optional(v.string()),
  membershipProgramNumber: v.optional(v.string()),

  // --- Order tracking (iOS 18+) ---
  orderNumber: v.optional(v.string()),
  orderDate: v.optional(v.string()),
  orderStatus: v.optional(v.string()),
  orderManagementUrl: v.optional(v.pipe(v.string(), v.url())),
  orderTrackingNumber: v.optional(v.string()),
})

export type SemanticTags = v.InferOutput<typeof SemanticTagsSchema>
