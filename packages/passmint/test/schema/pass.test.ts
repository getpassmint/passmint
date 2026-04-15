import { describe, expect, it } from 'vitest'
import { PassmintSchemaError, parsePassInput } from '../../src/index'

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const validBase = {
  passTypeIdentifier: 'pass.com.example.event',
  serialNumber: 'ticket-123',
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'Example',
  description: 'Concert ticket',
  images: { icon: { x2: { bytes: FAKE_PNG } } },
}

describe('parsePassInput — event ticket', () => {
  it('accepts a minimal event ticket', () => {
    const pass = parsePassInput({ style: 'eventTicket', ...validBase })
    expect(pass.style).toBe('eventTicket')
    if (pass.style === 'eventTicket') {
      expect(pass.passTypeIdentifier).toBe('pass.com.example.event')
    }
  })

  it('accepts full field arrays within style limits', () => {
    const pass = parsePassInput({
      style: 'eventTicket',
      ...validBase,
      headerFields: [
        { key: 'h1', value: 'H1' },
        { key: 'h2', value: 'H2' },
        { key: 'h3', value: 'H3' },
      ],
      primaryFields: [{ key: 'event', label: 'Event', value: 'Keynote' }],
      secondaryFields: [
        { key: 's1', value: 'S1' },
        { key: 's2', value: 'S2' },
      ],
      auxiliaryFields: [{ key: 'a1', value: 'A1' }],
    })
    expect(pass.style).toBe('eventTicket')
  })

  it('rejects too many primary fields for event ticket', () => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        primaryFields: [
          { key: 'a', value: 'A' },
          { key: 'b', value: 'B' },
        ],
      }),
    ).toThrow(PassmintSchemaError)
  })
})

describe('parsePassInput — boarding pass', () => {
  it('requires transitType', () => {
    expect(() => parsePassInput({ style: 'boardingPass', ...validBase })).toThrow(
      PassmintSchemaError,
    )
  })

  it('accepts air transit with 2 primary fields', () => {
    const pass = parsePassInput({
      style: 'boardingPass',
      ...validBase,
      transitType: 'air',
      primaryFields: [
        { key: 'from', value: 'SFO' },
        { key: 'to', value: 'LHR' },
      ],
    })
    expect(pass.style).toBe('boardingPass')
    if (pass.style === 'boardingPass') {
      expect(pass.transitType).toBe('air')
    }
  })

  it('rejects 3 primary fields even for boarding pass', () => {
    expect(() =>
      parsePassInput({
        style: 'boardingPass',
        ...validBase,
        transitType: 'air',
        primaryFields: [
          { key: 'a', value: 'A' },
          { key: 'b', value: 'B' },
          { key: 'c', value: 'C' },
        ],
      }),
    ).toThrow(PassmintSchemaError)
  })

  it.each([['air'], ['train'], ['bus'], ['boat'], ['generic']])(
    'accepts transitType %s',
    (transitType) => {
      const pass = parsePassInput({
        style: 'boardingPass',
        ...validBase,
        transitType,
      })
      expect(pass.style).toBe('boardingPass')
    },
  )

  it('rejects an invalid transitType', () => {
    expect(() =>
      parsePassInput({ style: 'boardingPass', ...validBase, transitType: 'spaceship' }),
    ).toThrow(PassmintSchemaError)
  })
})

describe('parsePassInput — identity validation', () => {
  it('rejects a non-reverse-DNS pass type id', () => {
    expect(() =>
      parsePassInput({ style: 'generic', ...validBase, passTypeIdentifier: 'example' }),
    ).toThrow(PassmintSchemaError)
  })

  it('rejects a short team identifier', () => {
    expect(() => parsePassInput({ style: 'generic', ...validBase, teamIdentifier: 'ABC' })).toThrow(
      PassmintSchemaError,
    )
  })

  it('rejects missing description', () => {
    const { description: _, ...rest } = validBase
    expect(() => parsePassInput({ style: 'generic', ...rest })).toThrow(PassmintSchemaError)
  })

  it('accepts safe serial numbers', () => {
    for (const serial of ['ticket-1', 'abc.def_123', 'A'.repeat(64), 'x']) {
      expect(() => parsePassInput({ style: 'generic', ...validBase, serialNumber: serial })).not.toThrow()
    }
  })

  it('rejects serial numbers with unsafe characters (header/filename injection)', () => {
    // These are the exploit strings from the security review.
    const unsafe = [
      'evil"; x-custom="bar', // double-quote break
      'foo\r\nX-Injected: yes', // CRLF
      '../../etc/passwd', // path traversal
      'a b c', // spaces
      'ñoñó', // non-ASCII
      '', // empty
      'A'.repeat(65), // too long
    ]
    for (const serial of unsafe) {
      expect(() =>
        parsePassInput({ style: 'generic', ...validBase, serialNumber: serial }),
      ).toThrow(PassmintSchemaError)
    }
  })
})

describe('parsePassInput — dates', () => {
  it('accepts ISO 8601 with timezone offset', () => {
    const pass = parsePassInput({
      style: 'eventTicket',
      ...validBase,
      expirationDate: '2026-12-31T23:59:59-07:00',
    })
    expect(pass.style).toBe('eventTicket')
  })

  it('accepts ISO 8601 with Z', () => {
    const pass = parsePassInput({
      style: 'eventTicket',
      ...validBase,
      expirationDate: '2026-12-31T23:59:59Z',
    })
    expect(pass.style).toBe('eventTicket')
  })

  it('rejects date-only (no time)', () => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        expirationDate: '2026-12-31',
      }),
    ).toThrow(PassmintSchemaError)
  })

  it('rejects ISO 8601 without timezone', () => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        expirationDate: '2026-12-31T23:59:59',
      }),
    ).toThrow(PassmintSchemaError)
  })
})

describe('parsePassInput — locations and beacons', () => {
  it('accepts up to 10 locations', () => {
    const locations = Array.from({ length: 10 }, (_, i) => ({
      latitude: 37 + i * 0.01,
      longitude: -122 + i * 0.01,
    }))
    const pass = parsePassInput({ style: 'generic', ...validBase, locations })
    expect(pass.style).toBe('generic')
  })

  it('rejects more than 10 locations', () => {
    const locations = Array.from({ length: 11 }, (_, i) => ({
      latitude: 37 + i * 0.01,
      longitude: -122 + i * 0.01,
    }))
    expect(() => parsePassInput({ style: 'generic', ...validBase, locations })).toThrow(
      PassmintSchemaError,
    )
  })

  it('rejects out-of-range latitude', () => {
    expect(() =>
      parsePassInput({
        style: 'generic',
        ...validBase,
        locations: [{ latitude: 200, longitude: 0 }],
      }),
    ).toThrow(PassmintSchemaError)
  })
})

describe('parsePassInput — error preserves issues', () => {
  it('catchable PassmintSchemaError with issues array', () => {
    try {
      parsePassInput({ style: 'eventTicket', ...validBase, teamIdentifier: 'bad' })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PassmintSchemaError)
      if (err instanceof PassmintSchemaError) {
        expect(err.issues.length).toBeGreaterThan(0)
        expect(err.code).toBe('E_SCHEMA')
      }
    }
  })
})

describe('parsePassInput — applyRaw escape hatch', () => {
  it('accepts arbitrary apple and google overrides', () => {
    const pass = parsePassInput({
      style: 'eventTicket',
      ...validBase,
      applyRaw: {
        apple: { semanticTags: { futureTag: 'some value' } },
        google: { rotatingBarcode: { type: 'QR_CODE' } },
      },
    })
    expect(pass.applyRaw?.apple).toBeDefined()
    expect(pass.applyRaw?.google).toBeDefined()
  })
})
