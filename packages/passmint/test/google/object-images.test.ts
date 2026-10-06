import { describe, expect, it } from 'vitest'
import { renderApplePass } from '../../src/apple/render'
import { PassmintGoogleError } from '../../src/errors'
import { renderGooglePayload } from '../../src/google/render'
import type { GoogleObjectImages } from '../../src/schema/images'
import { parsePassInput } from '../../src/schema/index'
import type { PassInput } from '../../src/schema/pass'

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const issuerId = '3388000000000000'

const base: Omit<PassInput, 'style'> = {
  passTypeIdentifier: 'pass.com.example.generic',
  serialNumber: 'oi-1',
  teamIdentifier: 'ABCD1234EF',
  organizationName: 'Example Corp',
  description: 'Sample pass',
  images: { icon: { x2: { bytes: FAKE_ICON } } },
}

const flightSemantics = {
  airlineCode: 'AA',
  flightNumber: 100,
  departureAirportCode: 'SFO',
  arrivalAirportCode: 'JFK',
}

const TEMPLATE_HERO = 'https://example.com/template-hero.jpg'
const PASS_HERO = 'https://example.com/pass-hero.jpg'
const PASS_PHOTO = 'https://example.com/member.png'

interface TypeCase {
  name: string
  input: Record<string, unknown>
  classKey: string
  objectKey: string
}

const types: TypeCase[] = [
  {
    name: 'loyalty',
    input: { ...base, style: 'storeCard' },
    classKey: 'loyaltyClasses',
    objectKey: 'loyaltyObjects',
  },
  {
    name: 'offer',
    input: { ...base, style: 'coupon' },
    classKey: 'offerClasses',
    objectKey: 'offerObjects',
  },
  {
    name: 'eventTicket',
    input: { ...base, style: 'eventTicket' },
    classKey: 'eventTicketClasses',
    objectKey: 'eventTicketObjects',
  },
  {
    name: 'generic',
    input: { ...base, style: 'generic' },
    classKey: 'genericClasses',
    objectKey: 'genericObjects',
  },
  {
    name: 'transit',
    input: { ...base, style: 'boardingPass', transitType: 'train' },
    classKey: 'transitClasses',
    objectKey: 'transitObjects',
  },
  {
    name: 'flight',
    input: { ...base, style: 'boardingPass', transitType: 'air', semantics: flightSemantics },
    classKey: 'flightClasses',
    objectKey: 'flightObjects',
  },
]

function render(
  type: TypeCase,
  googleObject: GoogleObjectImages | undefined,
  extraImages: Partial<PassInput['images']> = {},
): { cls: Record<string, unknown>; obj: Record<string, unknown> } {
  const input = {
    ...type.input,
    images: {
      icon: { x2: { bytes: FAKE_ICON } },
      ...extraImages,
      ...(googleObject ? { googleObject } : {}),
    },
  } as PassInput
  const payload = renderGooglePayload(input, { issuerId }) as Record<string, unknown>
  return {
    cls: (payload[type.classKey] as Record<string, unknown>[])[0]!,
    obj: (payload[type.objectKey] as Record<string, unknown>[])[0]!,
  }
}

const module = {
  id: 'pass-thumbnail',
  image: { url: PASS_PHOTO },
  description: 'Member photo',
}
const renderedModule = {
  id: 'pass-thumbnail',
  mainImage: {
    sourceUri: { uri: PASS_PHOTO },
    contentDescription: { defaultValue: { language: 'en', value: 'Member photo' } },
  },
}

describe('images.googleObject — per type', () => {
  for (const type of types) {
    describe(type.name, () => {
      it('sets the object heroImage override', () => {
        const { obj } = render(type, { heroImage: { url: PASS_HERO } })
        expect(obj.heroImage).toEqual({ sourceUri: { uri: PASS_HERO } })
      })

      it('object hero override wins over images.heroImage without touching the class hero', () => {
        const withOverride = render(
          type,
          { heroImage: { url: PASS_HERO } },
          { heroImage: { url: TEMPLATE_HERO } },
        )
        const without = render(type, undefined, { heroImage: { url: TEMPLATE_HERO } })
        expect(withOverride.obj.heroImage).toEqual({ sourceUri: { uri: PASS_HERO } })
        expect(withOverride.cls).toEqual(without.cls)
      })

      it('sets imageModulesData', () => {
        const { obj } = render(type, { imageModules: [module] })
        expect(obj.imageModulesData).toEqual([renderedModule])
      })

      it('omits contentDescription when no description is given', () => {
        const { obj } = render(type, { imageModules: [{ id: 'm', image: { url: PASS_PHOTO } }] })
        expect(obj.imageModulesData).toEqual([
          { id: 'm', mainImage: { sourceUri: { uri: PASS_PHOTO } } },
        ])
      })

      it('leaves the class output unchanged', () => {
        const images: GoogleObjectImages = {
          heroImage: { url: PASS_HERO },
          imageModules: [module],
          ...(type.name === 'generic' ? { logo: { url: PASS_PHOTO } } : {}),
        }
        const extra = {
          heroImage: { url: TEMPLATE_HERO },
          logo: { x2: { url: 'https://example.com/logo.png' } },
        }
        expect(render(type, images, extra).cls).toEqual(render(type, undefined, extra).cls)
        expect(render(type, { heroImage: null, imageModules: null }, extra).cls).toEqual(
          render(type, undefined, extra).cls,
        )
      })

      it('null clears imageModulesData explicitly', () => {
        const { obj } = render(type, { imageModules: null })
        expect(obj).toHaveProperty('imageModulesData', null)
      })

      it('null hero falls back to the default object hero, else emits null', () => {
        const fallback = render(type, undefined, { heroImage: { url: TEMPLATE_HERO } }).obj
          .heroImage
        const cleared = render(type, { heroImage: null }, { heroImage: { url: TEMPLATE_HERO } }).obj
        expect(cleared).toHaveProperty('heroImage', fallback ?? null)
        expect(render(type, { heroImage: null }).obj).toHaveProperty('heroImage', null)
      })

      it('emits nothing extra when googleObject is omitted', () => {
        const { obj } = render(type, undefined)
        expect(obj).not.toHaveProperty('heroImage')
        expect(obj).not.toHaveProperty('imageModulesData')
        expect(obj).not.toHaveProperty('logo')
      })

      if (type.name === 'generic') {
        it('sets the object logo', () => {
          const { obj } = render(type, { logo: { url: PASS_PHOTO } })
          expect(obj.logo).toEqual({ sourceUri: { uri: PASS_PHOTO } })
        })

        it('null logo emits null when there is no default logo', () => {
          expect(render(type, { logo: null }).obj).toHaveProperty('logo', null)
        })
      } else {
        it('rejects an object logo (Google has none on this type)', () => {
          expect(() => render(type, { logo: { url: PASS_PHOTO } })).toThrow(PassmintGoogleError)
          expect(() => render(type, { logo: null })).toThrow(/only supported on generic passes/)
        })
      }
    })
  }

  it('applyRaw.google still merges last', () => {
    const payload = renderGooglePayload(
      {
        ...base,
        style: 'generic',
        images: { ...base.images, googleObject: { heroImage: { url: PASS_HERO } } },
        applyRaw: { google: { heroImage: { sourceUri: { uri: TEMPLATE_HERO } } } },
      },
      { issuerId },
    )
    const obj = (payload.genericObjects as Record<string, unknown>[])[0]!
    expect(obj.heroImage).toEqual({ sourceUri: { uri: TEMPLATE_HERO } })
  })
})

describe('images.googleObject — schema and Apple', () => {
  const raw = {
    ...base,
    style: 'generic',
    images: {
      icon: { x2: { bytes: FAKE_ICON } },
      googleObject: {
        heroImage: { url: PASS_HERO },
        logo: null,
        imageModules: [{ id: 'm', image: { url: PASS_PHOTO }, description: { default: 'Photo' } }],
      },
    },
  }

  it('parses a valid googleObject', () => {
    expect(() => parsePassInput(raw)).not.toThrow()
  })

  it('rejects non-HTTPS URLs, empty module lists and empty module IDs', () => {
    const bad = (googleObject: unknown) => () =>
      parsePassInput({ ...raw, images: { ...raw.images, googleObject } })
    expect(bad({ heroImage: { url: 'http://example.com/x.png' } })).toThrow()
    expect(bad({ logo: { bytes: FAKE_ICON } })).toThrow()
    expect(bad({ imageModules: [] })).toThrow()
    expect(bad({ imageModules: [{ id: '', image: { url: PASS_PHOTO } }] })).toThrow()
  })

  it('does not change the Apple output', () => {
    const withImages = renderApplePass(parsePassInput(raw))
    const without = renderApplePass(parsePassInput({ ...raw, images: { icon: raw.images.icon } }))
    expect(withImages.passJson).toEqual(without.passJson)
    expect(Object.keys(withImages.files)).toEqual(Object.keys(without.files))
  })
})
