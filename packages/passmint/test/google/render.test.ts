import { describe, expect, it } from 'vitest'
import { PassmintRenderError } from '../../src/errors'
import { renderGooglePayload } from '../../src/google/render'
import type { PassInput } from '../../src/schema/pass'

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const base: Omit<PassInput, 'style'> = {
  passTypeIdentifier: 'pass.com.example.generic',
  serialNumber: 'gr-1',
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'Example Corp',
  description: 'Sample pass',
  images: { icon: { x2: { bytes: FAKE_ICON } } },
}

const issuerId = '3388000000000000'

function getClassAndObject(
  payload: Record<string, unknown>,
  classKey: string,
  objectKey: string,
): { cls: Record<string, unknown>; obj: Record<string, unknown> } {
  const cls = (payload[classKey] as Record<string, unknown>[])[0]!
  const obj = (payload[objectKey] as Record<string, unknown>[])[0]!
  return { cls, obj }
}

describe('renderGooglePayload — event ticket', () => {
  it('produces eventTicketClasses + eventTicketObjects with required fields', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'eventTicket',
        logoText: 'Concert Night',
        colors: { background: '#FF0000', foreground: '#FFFFFF' },
      },
      { issuerId },
    )
    const { cls, obj } = getClassAndObject(
      payload as Record<string, unknown>,
      'eventTicketClasses',
      'eventTicketObjects',
    )
    expect(cls.id).toBe(`${issuerId}.gr-1-class`)
    expect(cls.issuerName).toBe('Concert Night')
    expect(cls.eventName).toEqual({ defaultValue: { language: 'en', value: 'Concert Night' } })
    expect(cls.hexBackgroundColor).toBe('#ff0000')
    expect(obj.id).toBe(`${issuerId}.gr-1`)
    expect(obj.classId).toBe(`${issuerId}.gr-1-class`)
    expect(obj.state).toBe('ACTIVE')
    expect(obj.ticketNumber).toBe('gr-1')
  })
})

describe('renderGooglePayload — boarding pass routing', () => {
  it('routes transitType=air to flightClasses + flightObjects', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'boardingPass',
        transitType: 'air',
        semantics: {
          airlineCode: 'AA',
          flightNumber: 100,
          departureAirportCode: 'SFO',
          arrivalAirportCode: 'JFK',
          confirmationNumber: 'XYZ123',
        },
      },
      { issuerId },
    )
    expect(payload.flightClasses).toHaveLength(1)
    expect(payload.flightObjects).toHaveLength(1)
    expect(payload.transitClasses).toBeUndefined()
    const cls = (payload.flightClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    const header = cls.flightHeader as Record<string, unknown>
    expect((header.carrier as Record<string, unknown>).carrierIataCode).toBe('AA')
    expect(header.flightNumber).toBe('100')
    expect((cls.origin as Record<string, unknown>).airportIataCode).toBe('SFO')
    expect((cls.destination as Record<string, unknown>).airportIataCode).toBe('JFK')
    const obj = (payload.flightObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect((obj.reservationInfo as Record<string, unknown>).confirmationCode).toBe('XYZ123')
  })

  it('routes transitType=train to transitClasses + transitObjects', () => {
    const payload = renderGooglePayload(
      { ...base, style: 'boardingPass', transitType: 'train' },
      { issuerId },
    )
    expect(payload.transitClasses).toHaveLength(1)
    expect(payload.flightClasses).toBeUndefined()
    const cls = (payload.transitClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(cls.transitType).toBe('TRAIN')
  })

  it('throws E_GOOGLE_MISSING_FLIGHT_SEMANTICS when an air boarding pass lacks required semantics', () => {
    // Google's FlightClass requires airlineCode, flightNumber, and both
    // airport codes. Previously we emitted placeholder empty objects
    // (`{ carrier: {}, origin: {}, destination: {} }`) which the Wallet
    // API rejects at save-link time with an opaque error.
    const cases: Array<{
      semantics: Record<string, unknown> | undefined
      missing: string[]
    }> = [
      {
        semantics: undefined,
        missing: ['airlineCode', 'flightNumber', 'departureAirportCode', 'arrivalAirportCode'],
      },
      {
        semantics: { airlineCode: 'AA', flightNumber: 100 },
        missing: ['departureAirportCode', 'arrivalAirportCode'],
      },
      {
        semantics: { airlineCode: 'AA', flightNumber: 100, departureAirportCode: 'SFO' },
        missing: ['arrivalAirportCode'],
      },
    ]
    for (const c of cases) {
      const input: PassInput = {
        ...base,
        style: 'boardingPass',
        transitType: 'air',
        ...(c.semantics ? { semantics: c.semantics } : {}),
      } as PassInput
      let err: unknown
      try {
        renderGooglePayload(input, { issuerId })
      } catch (e) {
        err = e
      }
      expect(err, `missing=${c.missing.join(',')}`).toBeInstanceOf(PassmintRenderError)
      expect((err as PassmintRenderError).code).toBe('E_GOOGLE_MISSING_FLIGHT_SEMANTICS')
      for (const field of c.missing) {
        expect((err as Error).message).toContain(`semantics.${field}`)
      }
    }
  })

  it('emits a fully-populated flightClass when required semantics are present', () => {
    // Sanity check that the happy path still produces no empty placeholder
    // objects — carrier/flightNumber/origin/destination are all real values.
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'boardingPass',
        transitType: 'air',
        semantics: {
          airlineCode: 'BA',
          flightNumber: 286,
          departureAirportCode: 'SFO',
          arrivalAirportCode: 'LHR',
        },
      },
      { issuerId },
    )
    const cls = (payload.flightClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    const header = cls.flightHeader as Record<string, unknown>
    expect(header.carrier).toEqual({ carrierIataCode: 'BA' })
    expect(header.flightNumber).toBe('286')
    expect(cls.origin).toEqual({ airportIataCode: 'SFO' })
    expect(cls.destination).toEqual({ airportIataCode: 'LHR' })
  })
})

describe('renderGooglePayload — other styles', () => {
  it('renders storeCard as loyaltyClasses + loyaltyObjects', () => {
    const payload = renderGooglePayload({ ...base, style: 'storeCard' }, { issuerId })
    expect(payload.loyaltyClasses).toHaveLength(1)
    expect(payload.loyaltyObjects).toHaveLength(1)
    const obj = (payload.loyaltyObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(obj.accountId).toBe('gr-1')
  })

  it('renders coupon as offerClasses + offerObjects with required title/provider', () => {
    const payload = renderGooglePayload(
      { ...base, style: 'coupon', logoText: '50% off widgets' },
      { issuerId },
    )
    const cls = (payload.offerClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(cls.title).toBe('50% off widgets')
    expect(cls.provider).toBe('Example Corp')
    expect(cls.redemptionChannel).toBe('BOTH')
  })

  it('renders generic with cardTitle + header LocalizedStrings', () => {
    const payload = renderGooglePayload({ ...base, style: 'generic' }, { issuerId })
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect((obj.cardTitle as Record<string, unknown>).defaultValue).toEqual({
      language: 'en',
      value: 'Example Corp',
    })
    expect((obj.header as Record<string, unknown>).defaultValue).toEqual({
      language: 'en',
      value: 'Sample pass',
    })
  })
})

describe('renderGooglePayload — shared mapping', () => {
  it('converts barcodes to Google format with alternateText default', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        barcodes: [{ format: 'pdf417', message: 'ABC' }],
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    const barcode = obj.barcode as Record<string, unknown>
    expect(barcode.type).toBe('PDF_417')
    expect(barcode.value).toBe('ABC')
    expect(barcode.alternateText).toBe('ABC')
    // Non-QR barcodes can never carry UTF_8 per Google's BarcodeRenderEncoding enum.
    expect(barcode.renderEncoding).toBe('RENDER_ENCODING_UNSPECIFIED')
  })

  it('emits UTF_8 renderEncoding only for QR + utf-8, UNSPECIFIED otherwise', () => {
    // Google's BarcodeRenderEncoding has only two values: UTF_8 (QR-only) and
    // RENDER_ENCODING_UNSPECIFIED. The previous implementation normalized our
    // own encoding names (ISO_8859_1 / UTF_16) which Google rejects at
    // save-link time.
    // https://developers.google.com/wallet/reference/rest/v1/BarcodeRenderEncoding
    const cases: Array<{
      format: 'qr' | 'pdf417' | 'aztec' | 'code128'
      messageEncoding?: 'iso-8859-1' | 'utf-8' | 'utf-16'
      expected: string
    }> = [
      { format: 'qr', messageEncoding: 'utf-8', expected: 'UTF_8' },
      { format: 'qr', messageEncoding: 'iso-8859-1', expected: 'RENDER_ENCODING_UNSPECIFIED' },
      { format: 'qr', expected: 'RENDER_ENCODING_UNSPECIFIED' },
      // UTF_8 is QR-only per Google — PDF417/Aztec/Code128 with utf-8 must still fall back.
      { format: 'pdf417', messageEncoding: 'utf-8', expected: 'RENDER_ENCODING_UNSPECIFIED' },
      { format: 'aztec', messageEncoding: 'utf-8', expected: 'RENDER_ENCODING_UNSPECIFIED' },
      { format: 'code128', messageEncoding: 'utf-8', expected: 'RENDER_ENCODING_UNSPECIFIED' },
      { format: 'code128', expected: 'RENDER_ENCODING_UNSPECIFIED' },
    ]
    for (const c of cases) {
      const barcode: {
        format: 'qr' | 'pdf417' | 'aztec' | 'code128'
        message: string
        messageEncoding?: 'iso-8859-1' | 'utf-8' | 'utf-16'
      } = { format: c.format, message: 'ABC' }
      if (c.messageEncoding !== undefined) barcode.messageEncoding = c.messageEncoding
      const payload = renderGooglePayload(
        { ...base, style: 'generic', barcodes: [barcode] },
        { issuerId },
      )
      const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
      const rendered = obj.barcode as Record<string, unknown>
      expect(rendered.renderEncoding, `${c.format} / ${c.messageEncoding ?? 'no-encoding'}`).toBe(
        c.expected,
      )
    }
  })

  it('converts rgb() and short hex to #rrggbb', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        colors: { background: 'rgb(10, 20, 30)', foreground: '#F00' },
      },
      { issuerId },
    )
    const cls = (payload.genericClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(cls.hexBackgroundColor).toBe('#0a141e')
  })

  it('converts LocalizedString label with translations', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        primaryFields: [
          {
            key: 'p1',
            label: { default: 'Name', translations: { es: 'Nombre', fr: 'Nom' } },
            value: 'Alice',
          },
        ],
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    const textModules = obj.textModulesData as Record<string, unknown>[]
    expect(textModules[0]!.header).toBe('Name')
    const localized = textModules[0]!.localizedHeader as Record<string, unknown>
    expect((localized.defaultValue as Record<string, unknown>).value).toBe('Name')
    expect(localized.translatedValues).toEqual([
      { language: 'es', value: 'Nombre' },
      { language: 'fr', value: 'Nom' },
    ])
  })

  it('flattens primary/secondary/auxiliary/back fields into textModulesData', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        primaryFields: [{ key: 'p', label: 'P', value: '1' }],
        secondaryFields: [{ key: 's', label: 'S', value: '2' }],
        auxiliaryFields: [{ key: 'a', label: 'A', value: '3' }],
        backFields: [{ key: 'b', label: 'B', value: '4' }],
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(obj.textModulesData).toHaveLength(4)
  })

  it('passes through locations', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        locations: [{ latitude: 37.33, longitude: -122.03 }],
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(obj.locations).toEqual([{ latitude: 37.33, longitude: -122.03 }])
  })

  it('uses heroImage URL in both class and object', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        images: {
          icon: { x2: { bytes: FAKE_ICON } },
          heroImage: { url: 'https://example.com/hero.jpg' },
        },
      },
      { issuerId },
    )
    const cls = (payload.genericClasses as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(
      ((cls.heroImage as Record<string, unknown>).sourceUri as Record<string, unknown>).uri,
    ).toBe('https://example.com/hero.jpg')
  })

  it('throws when logo is provided as bytes instead of URL', () => {
    expect(() =>
      renderGooglePayload(
        {
          ...base,
          style: 'generic',
          images: {
            icon: { x2: { bytes: FAKE_ICON } },
            logo: { x2: { bytes: FAKE_ICON } },
          },
        },
        { issuerId },
      ),
    ).toThrow(PassmintRenderError)
  })

  it('deep-merges applyRaw.google into the object definition', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        applyRaw: {
          google: {
            smartTapRedemptionValue: 'tap-payload',
            textModulesData: [{ id: 'override', header: 'x', body: 'y' }],
          },
        },
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(obj.smartTapRedemptionValue).toBe('tap-payload')
    expect(obj.textModulesData).toEqual([{ id: 'override', header: 'x', body: 'y' }])
  })

  it('ignores __proto__/constructor/prototype keys in applyRaw to block prototype pollution', () => {
    const evilGoogle = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"hijacked":true},"prototype":{"also":"bad"},"smartTapRedemptionValue":"safe"}',
    )

    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        applyRaw: { google: evilGoogle },
      },
      { issuerId },
    )

    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>

    // Safe keys still merge.
    expect(obj.smartTapRedemptionValue).toBe('safe')

    // Unsafe keys are not copied to the output.
    expect(Object.hasOwn(obj, '__proto__')).toBe(false)
    expect(Object.hasOwn(obj, 'prototype')).toBe(false)

    // And critically, nothing leaked onto Object.prototype.
    const canary = {} as Record<string, unknown>
    expect(canary.polluted).toBeUndefined()
    expect(canary.hijacked).toBeUndefined()
  })

  it('honors custom classSuffix and objectSuffix', () => {
    const payload = renderGooglePayload(
      { ...base, style: 'generic' },
      { issuerId, classSuffix: 'my-class', objectSuffix: 'my-object' },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(obj.classId).toBe(`${issuerId}.my-class`)
    expect(obj.id).toBe(`${issuerId}.my-object`)
  })
})
