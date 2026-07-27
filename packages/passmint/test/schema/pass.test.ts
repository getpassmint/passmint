import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { PassInputSchema, PassmintSchemaError, parsePassInput } from '../../src/index'

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
      expect(() =>
        parsePassInput({ style: 'generic', ...validBase, serialNumber: serial }),
      ).not.toThrow()
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

describe('parsePassInput — webService HTTPS-only', () => {
  it('accepts https:// webService.url', () => {
    const pass = parsePassInput({
      style: 'generic',
      ...validBase,
      webService: {
        url: 'https://api.example.com/pass/v1',
        authToken: 'super-secret-token-123',
      },
    })
    expect(pass.webService?.url).toBe('https://api.example.com/pass/v1')
  })

  it.each([
    ['http://api.example.com/pass/v1'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
    ['ftp://example.com/'],
  ])('rejects non-HTTPS webService.url %s', (url) => {
    expect(() =>
      parsePassInput({
        style: 'generic',
        ...validBase,
        webService: { url, authToken: 'super-secret-token-123' },
      }),
    ).toThrow(PassmintSchemaError)
  })

  it('rejects https://  semantic-tag homepage on http://', () => {
    expect(() =>
      parsePassInput({
        style: 'generic',
        ...validBase,
        semantics: { homepage: 'http://example.com' },
      }),
    ).toThrow(PassmintSchemaError)
  })

  it('rejects http:// for image URL', () => {
    expect(() =>
      parsePassInput({
        style: 'generic',
        ...validBase,
        images: { icon: { x2: { url: 'http://cdn.example.com/icon.png' } } },
      }),
    ).toThrow(PassmintSchemaError)
  })

  it('accepts https:// for image URL', () => {
    expect(() =>
      parsePassInput({
        style: 'generic',
        ...validBase,
        images: { icon: { x2: { url: 'https://cdn.example.com/icon.png' } } },
      }),
    ).not.toThrow()
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

  it.each([
    ['passTypeIdentifier', 'pass.com.attacker.forgery'],
    ['teamIdentifier', 'ATTACKERXX'],
    ['serialNumber', '../../evil'],
    ['authenticationToken', 'attacker-controlled-token'],
    ['webServiceURL', 'https://evil.com/harvest'],
  ])('rejects applyRaw.apple.%s (identity override)', (key, value) => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        applyRaw: { apple: { [key]: value } },
      }),
    ).toThrow(PassmintSchemaError)
  })

  it.each([
    ['id', 'forged-id'],
    ['classId', '123.forged-class'],
    ['state', 'INACTIVE'],
  ])('rejects applyRaw.google.%s (identity override)', (key, value) => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        applyRaw: { google: { [key]: value } },
      }),
    ).toThrow(PassmintSchemaError)
  })

  it('still allows safe applyRaw.apple fields like sharingProhibited', () => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        applyRaw: { apple: { sharingProhibited: true, voided: false } },
      }),
    ).not.toThrow()
  })

  it('still allows safe applyRaw.google fields like rotatingBarcode', () => {
    expect(() =>
      parsePassInput({
        style: 'eventTicket',
        ...validBase,
        applyRaw: { google: { rotatingBarcode: { type: 'QR_CODE' } } },
      }),
    ).not.toThrow()
  })
})

describe('GenericPassSchema — poster', () => {
  const base = {
    style: 'generic' as const,
    passTypeIdentifier: 'pass.com.example.card',
    serialNumber: 'card-1',
    teamIdentifier: 'ABCD1234EF',
    organizationName: 'Example',
    description: 'Membership card',
    images: {
      icon: { x2: { bytes: new Uint8Array([1]) } },
      background: { x2: { bytes: new Uint8Array([2]) } },
    },
  }

  it('accepts poster: true when a background image is present', () => {
    const r = v.safeParse(PassInputSchema, { ...base, poster: true })
    expect(r.success).toBe(true)
  })

  it('rejects poster: true without a background image', () => {
    const { background, ...noBg } = base.images
    const r = v.safeParse(PassInputSchema, { ...base, images: noBg, poster: true })
    expect(r.success).toBe(false)
  })

  it('accepts a single footerField with poster: true', () => {
    const r = v.safeParse(PassInputSchema, {
      ...base,
      poster: true,
      footerFields: [{ key: 'tier', value: 'Family Pass' }],
    })
    expect(r.success).toBe(true)
  })

  it('rejects footerFields without poster: true', () => {
    const r = v.safeParse(PassInputSchema, {
      ...base,
      footerFields: [{ key: 'tier', value: 'Family Pass' }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects more than one footerField', () => {
    const r = v.safeParse(PassInputSchema, {
      ...base,
      poster: true,
      footerFields: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('accepts a normal (non-poster) generic pass with no background', () => {
    const { background, ...noBg } = base.images
    const r = v.safeParse(PassInputSchema, { ...base, images: noBg })
    expect(r.success).toBe(true)
  })
})
