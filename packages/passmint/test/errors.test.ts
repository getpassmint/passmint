import { describe, expect, it } from 'vitest'
import {
  PassmintError,
  PassmintGoogleError,
  PassmintPackagingError,
  PassmintRenderError,
  PassmintSchemaError,
  PassmintSigningError,
} from '../src/errors'

describe('PassmintError', () => {
  it('stores code, message, and optional cause', () => {
    const cause = new Error('upstream')
    const err = new PassmintError('E_TEST', 'something went wrong', { cause })

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(PassmintError)
    expect(err.code).toBe('E_TEST')
    expect(err.message).toBe('something went wrong')
    expect(err.cause).toBe(cause)
    expect(err.name).toBe('PassmintError')
  })
})

describe('PassmintSchemaError', () => {
  it('formats multiple issues into a readable message and preserves the issue list', () => {
    const issues = [
      {
        kind: 'schema' as const,
        type: 'string',
        input: 123,
        expected: 'string',
        received: 'number',
        message: 'Invalid type: Expected string but received 123',
        path: [{ type: 'object', origin: 'value', input: {}, key: 'name', value: 123 }],
      },
      {
        kind: 'schema' as const,
        type: 'number',
        input: 'abc',
        expected: 'number',
        received: 'string',
        message: 'Invalid type: Expected number but received "abc"',
        path: [{ type: 'object', origin: 'value', input: {}, key: 'count', value: 'abc' }],
      },
      // biome-ignore lint/suspicious/noExplicitAny: test stubs
    ] as any

    const err = new PassmintSchemaError(issues)
    expect(err).toBeInstanceOf(PassmintError)
    expect(err.code).toBe('E_SCHEMA')
    expect(err.message).toContain('name:')
    expect(err.message).toContain('count:')
    expect(err.issues).toHaveLength(2)
  })

  it('handles empty issue list gracefully', () => {
    const err = new PassmintSchemaError([])
    expect(err.message).toBe('Invalid pass input')
  })
})

describe('error subclass hierarchy', () => {
  it('every subclass extends PassmintError and carries its own code', () => {
    const errors = [
      new PassmintRenderError('E_APPLE_MISSING_IMAGE_BYTES', 'no bytes'),
      new PassmintSigningError('E_KEY_IMPORT', 'bad key'),
      new PassmintPackagingError('E_ZIP', 'zip failed'),
      new PassmintGoogleError('E_JWT_SIGN', 'jwt failed'),
    ]

    for (const err of errors) {
      expect(err).toBeInstanceOf(PassmintError)
      expect(err).toBeInstanceOf(Error)
      expect(err.code).toBeTruthy()
      expect(err.name).not.toBe('PassmintError') // overridden
    }
  })

  it('preserves cause through subclasses', () => {
    const upstream = new Error('openssl: bad key')
    const err = new PassmintSigningError('E_KEY_IMPORT', 'failed to import', { cause: upstream })
    expect(err.cause).toBe(upstream)
  })
})
