import { describe, expect, it } from 'vitest'
import { MAX_PEM_LENGTH, pemToDer } from '../../src/cms/pem'
import { PassmintSigningError } from '../../src/errors'

describe('pemToDer', () => {
  it('decodes a valid PEM block', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nAQIDBA==\n-----END CERTIFICATE-----'
    const der = pemToDer(pem)
    expect(Array.from(der)).toEqual([0x01, 0x02, 0x03, 0x04])
  })

  it('tolerates extra whitespace and CRLF line endings', () => {
    const pem = '-----BEGIN CERTIFICATE-----\r\n  AQID\r\n  BA==  \r\n-----END CERTIFICATE-----'
    expect(Array.from(pemToDer(pem))).toEqual([0x01, 0x02, 0x03, 0x04])
  })

  it('accepts any label when expectedLabel is omitted', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----'
    expect(pemToDer(pem)).toBeInstanceOf(Uint8Array)
  })

  it('enforces expectedLabel when provided', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----'
    expect(() => pemToDer(pem, { expectedLabel: 'CERTIFICATE' })).toThrowError(
      /label "CERTIFICATE"/,
    )
  })

  it('throws PassmintSigningError on missing markers', () => {
    expect(() => pemToDer('not a pem')).toThrow(PassmintSigningError)
  })

  it('throws on mismatched BEGIN/END labels', () => {
    const pem = '-----BEGIN A-----\nAQID\n-----END B-----'
    expect(() => pemToDer(pem)).toThrow(PassmintSigningError)
  })

  it('throws on invalid base64', () => {
    const pem = '-----BEGIN CERTIFICATE-----\n@@@@\n-----END CERTIFICATE-----'
    expect(() => pemToDer(pem)).toThrow(PassmintSigningError)
  })

  it('rejects oversized PEM input (DoS guard)', () => {
    // Pad a valid-looking PEM past the hard cap so we hit the length
    // check before the regex.
    const huge = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(MAX_PEM_LENGTH)}\n-----END CERTIFICATE-----`
    expect(() => pemToDer(huge)).toThrowError(/exceeds/)
  })
})
