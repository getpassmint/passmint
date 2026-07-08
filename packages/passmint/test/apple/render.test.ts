import { describe, expect, it } from 'vitest'
import { renderApplePass } from '../../src/apple/render'
import { PassmintRenderError } from '../../src/errors'
import type { PassInput } from '../../src/schema/pass'

const ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const baseInput: Omit<PassInput, 'style'> = {
  passTypeIdentifier: 'pass.com.example.event',
  serialNumber: 'ticket-1',
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'Example',
  description: 'Event ticket',
  images: { icon: { x2: { bytes: ICON } } },
}

describe('renderApplePass — identity + base fields', () => {
  it('emits formatVersion and top-level identity', () => {
    const result = renderApplePass({ ...baseInput, style: 'eventTicket' })
    expect(result.passJson.formatVersion).toBe(1)
    expect(result.passJson.passTypeIdentifier).toBe('pass.com.example.event')
    expect(result.passJson.teamIdentifier).toBe('ABCD1234EF')
  })

  it('emits the style key with field arrays nested under it', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      primaryFields: [{ key: 'event', value: 'Keynote' }],
    })
    const eventTicket = result.passJson.eventTicket as Record<string, unknown>
    expect(eventTicket.primaryFields).toHaveLength(1)
  })

  it('emits PKTransitType for boardingPass', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'boardingPass',
      transitType: 'air',
    })
    const bp = result.passJson.boardingPass as Record<string, unknown>
    expect(bp.transitType).toBe('PKTransitTypeAir')
  })
})

describe('renderApplePass — colors', () => {
  it('normalizes #RRGGBB to rgb()', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      colors: { background: '#FF0000', foreground: '#FFFFFF' },
    })
    expect(result.passJson.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(result.passJson.foregroundColor).toBe('rgb(255, 255, 255)')
  })

  it('normalizes #RGB short form', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      colors: { background: '#F00', foreground: '#0F0' },
    })
    expect(result.passJson.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(result.passJson.foregroundColor).toBe('rgb(0, 255, 0)')
  })

  it('passes through existing rgb() values', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      colors: {
        background: 'rgb(10, 20, 30)',
        foreground: 'rgb(255, 255, 255)',
        label: 'rgb(100, 100, 100)',
      },
    })
    expect(result.passJson.backgroundColor).toBe('rgb(10, 20, 30)')
    expect(result.passJson.labelColor).toBe('rgb(100, 100, 100)')
  })
})

describe('renderApplePass — field enums', () => {
  it('maps textAlignment / dateStyle / numberStyle / dataDetectorTypes', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      primaryFields: [
        {
          key: 'f',
          value: 'v',
          textAlignment: 'center',
          dataDetectorTypes: ['phoneNumber', 'link'],
        },
      ],
      auxiliaryFields: [
        {
          key: 'd',
          value: '2026-06-15T14:30:00Z',
          dateStyle: 'medium',
          timeStyle: 'short',
        },
      ],
    })
    const et = result.passJson.eventTicket as Record<string, unknown>
    const primary = (et.primaryFields as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(primary.textAlignment).toBe('PKTextAlignmentCenter')
    expect(primary.dataDetectorTypes).toEqual([
      'PKDataDetectorTypePhoneNumber',
      'PKDataDetectorTypeLink',
    ])
    const aux = (et.auxiliaryFields as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(aux.dateStyle).toBe('PKDateStyleMedium')
    expect(aux.timeStyle).toBe('PKDateStyleShort')
  })
})

describe('renderApplePass — barcodes', () => {
  it('maps format to PKBarcodeFormat* and defaults altText to message', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      barcodes: [{ format: 'qr', message: 'ABC-123' }],
    })
    const b = (result.passJson.barcodes as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(b.format).toBe('PKBarcodeFormatQR')
    expect(b.message).toBe('ABC-123')
    expect(b.altText).toBe('ABC-123')
    expect(b.messageEncoding).toBe('iso-8859-1')
  })

  it('uses explicit altText when provided', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      barcodes: [
        {
          format: 'pdf417',
          message: 'RAW',
          altText: 'Scan at gate',
          messageEncoding: 'utf-8',
        },
      ],
    })
    const b = (result.passJson.barcodes as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(b.altText).toBe('Scan at gate')
    expect(b.messageEncoding).toBe('utf-8')
  })
})

describe('renderApplePass — images', () => {
  it('extracts required @2x and optional @1x/@3x', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      images: {
        icon: {
          x1: { bytes: new Uint8Array([1]) },
          x2: { bytes: new Uint8Array([2]) },
          x3: { bytes: new Uint8Array([3]) },
        },
        logo: { x2: { bytes: new Uint8Array([4]) } },
      },
    })
    expect(result.files['icon.png']).toBeInstanceOf(Uint8Array)
    expect(result.files['icon@2x.png']).toBeInstanceOf(Uint8Array)
    expect(result.files['icon@3x.png']).toBeInstanceOf(Uint8Array)
    expect(result.files['logo@2x.png']).toBeInstanceOf(Uint8Array)
    expect(result.files['logo.png']).toBeUndefined()
  })

  it('throws when Apple requires bytes but only URL was provided', () => {
    expect(() =>
      renderApplePass({
        ...baseInput,
        style: 'eventTicket',
        images: { icon: { x2: { url: 'https://example.com/icon.png' } } },
      }),
    ).toThrow(PassmintRenderError)
  })
})

describe('renderApplePass — localization', () => {
  it('collects field label translations into .strings files', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      primaryFields: [
        {
          key: 'event',
          label: { default: 'Event', translations: { es: 'Evento', 'fr-CA': 'Événement' } },
          value: 'Keynote',
        },
      ],
    })
    expect(result.files['es.lproj/pass.strings']).toBeInstanceOf(Uint8Array)
    expect(result.files['fr-CA.lproj/pass.strings']).toBeInstanceOf(Uint8Array)

    // Emitted label should be the default (key form)
    const et = result.passJson.eventTicket as Record<string, unknown>
    const primary = (et.primaryFields as Record<string, unknown>[])[0] as Record<string, unknown>
    expect(primary.label).toBe('Event')
  })

  it('merges top-level localizations map', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      localizations: {
        es: { Welcome: 'Bienvenido' },
      },
    })
    expect(result.files['es.lproj/pass.strings']).toBeInstanceOf(Uint8Array)
  })
})

describe('renderApplePass — semantics and applyRaw', () => {
  it('emits semanticTags when provided', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      semantics: { eventName: 'WWDC 2026', eventType: 'conference' },
    })
    expect(result.passJson.semanticTags).toEqual({
      eventName: 'WWDC 2026',
      eventType: 'conference',
    })
  })

  it('deep-merges applyRaw.apple into the result', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      applyRaw: { apple: { sharingProhibited: true, custom: { nested: 'value' } } },
    })
    expect(result.passJson.sharingProhibited).toBe(true)
    expect(result.passJson.custom).toEqual({ nested: 'value' })
  })

  it('ignores __proto__/constructor/prototype keys in applyRaw to block prototype pollution', () => {
    // Simulate a developer forwarding parsed JSON into applyRaw. JSON.parse
    // produces an own property literally named `__proto__`, which a naive
    // deepMerge would walk into a bracket assignment and trigger the
    // Object.prototype.__proto__ setter.
    const evilApple = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"hijacked":true},"prototype":{"also":"bad"},"safe":"ok"}',
    )

    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      applyRaw: { apple: evilApple },
    })

    // Safe keys still merge.
    expect((result.passJson as Record<string, unknown>).safe).toBe('ok')

    // Unsafe keys are not copied to the output.
    expect(Object.hasOwn(result.passJson, '__proto__')).toBe(false)
    expect(Object.hasOwn(result.passJson, 'prototype')).toBe(false)

    // And critically, nothing leaked onto Object.prototype.
    const canary = {} as Record<string, unknown>
    expect(canary.polluted).toBeUndefined()
    expect(canary.hijacked).toBeUndefined()
  })
})

describe('renderApplePass — new iOS 27 barcode formats', () => {
  it.each([
    ['ean13', 'PKBarcodeFormatEAN13'],
    ['code39', 'PKBarcodeFormatCode39'],
    ['codabar', 'PKBarcodeFormatCodabar'],
    ['itf', 'PKBarcodeFormatITF'],
  ])('maps %s to %s', (format, pkFormat) => {
    const result = renderApplePass({
      ...baseInput,
      style: 'storeCard',
      barcodes: [{ format: format as 'ean13', message: '1234567890' }],
    })
    const barcodes = result.passJson.barcodes as Array<Record<string, unknown>>
    expect(barcodes[0]?.format).toBe(pkFormat)
  })
})

describe('renderApplePass — web service + locations', () => {
  it('maps webService to webServiceURL/authenticationToken', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      webService: { url: 'https://example.com/pass', authToken: 'x'.repeat(32) },
    })
    expect(result.passJson.webServiceURL).toBe('https://example.com/pass')
    expect(result.passJson.authenticationToken).toBe('x'.repeat(32))
  })

  it('passes through locations and beacons', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'eventTicket',
      locations: [{ latitude: 37.33, longitude: -122.03, relevantText: 'At the venue' }],
      beacons: [{ proximityUUID: 'F8F589E9-C07E-58B0-AEAB-A36BE4D48FAC' }],
      maxDistance: 500,
    })
    expect(result.passJson.locations).toHaveLength(1)
    expect(result.passJson.beacons).toHaveLength(1)
    expect(result.passJson.maxDistance).toBe(500)
  })
})

describe('renderApplePass — featured actions', () => {
  it('emits featuredActions as a top-level array', () => {
    const result = renderApplePass({
      ...baseInput,
      style: 'storeCard',
      featuredActions: [
        { identifier: 'benefits', type: 'membershipBenefits', url: 'https://example.com/b' },
      ],
    })
    const actions = result.passJson.featuredActions as Array<Record<string, unknown>>
    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({
      identifier: 'benefits',
      type: 'membershipBenefits',
      url: 'https://example.com/b',
    })
  })

  it('omits featuredActions when none are provided', () => {
    const result = renderApplePass({ ...baseInput, style: 'storeCard' })
    expect(result.passJson.featuredActions).toBeUndefined()
  })
})

describe('PassBuilder — featuredAction', () => {
  it('accumulates featured actions onto the draft', async () => {
    const { Pass } = await import('../../src/pass')
    const pass = Pass.storeCard({
      passTypeIdentifier: 'pass.com.example.card',
      serialNumber: 'card-1',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Loyalty card',
      images: { icon: { x2: { bytes: ICON } } },
    })
      .featuredAction({ identifier: 'a', type: 'membershipBenefits', url: 'https://example.com/a' })
      .build()
    expect(pass.toObject().featuredActions).toHaveLength(1)
  })

  it('rejects a third featured action at build time', async () => {
    const { Pass } = await import('../../src/pass')
    const { PassmintSchemaError } = await import('../../src/errors')
    const build = () =>
      Pass.storeCard({
        passTypeIdentifier: 'pass.com.example.card',
        serialNumber: 'card-2',
        teamIdentifier: 'ABCD1234EF',
        organizationName: 'Example',
        description: 'Loyalty card',
        images: { icon: { x2: { bytes: ICON } } },
      })
        .featuredAction({ identifier: 'a', type: 't', url: 'https://example.com/a' })
        .featuredAction({ identifier: 'b', type: 't', url: 'https://example.com/b' })
        .featuredAction({ identifier: 'c', type: 't', url: 'https://example.com/c' })
        .build()
    expect(build).toThrow(PassmintSchemaError)
  })
})
