import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { SigningMaterial } from '../../src/cms/material'
import { GoogleSigningMaterial } from '../../src/google/material'
import { Pass } from '../../src/pass'

/**
 * Runs inside workerd via @cloudflare/vitest-pool-workers.
 *
 * The job of this file is to prove that `passmint`'s production code
 * actually loads and executes inside a real Cloudflare Workers runtime.
 * Biome's `noRestrictedImports` rule and the post-build bundle-guard
 * script catch Node APIs at the source and artifact layers; this test
 * catches anything subtle enough to slip past both — a transitive
 * dependency that probes `globalThis.Buffer` at import time, a TS
 * helper that expects `process`, etc.
 *
 * Only three tests run here: one Apple pipeline end to end (schema →
 * render → CMS sign → ZIP), one Google save-link round-trip, and one
 * Response output check. The bulk of assertions stay in the normal
 * Node suite where we have openssl subprocess verification.
 *
 * Test certs and keys are static fixtures so the tests don't depend
 * on `@peculiar/x509` (which needs a devDep we don't otherwise want)
 * or on subprocess-driven cert generation (which workerd can't do).
 * The private key is public on purpose — it signs fake test data and
 * is never used for real pass issuance.
 */

const FAKE_ICON = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Self-signed SHA-1 test cert + matching PKCS#8 key. Generated via:
//   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
//     -days 3650 -nodes -subj "/CN=passmint-smoke-test" -sha1
//   openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem
const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDHTCCAgWgAwIBAgIUEVptwhGeBoDWdQQUcm39NhXt/CcwDQYJKoZIhvcNAQEF
BQAwHjEcMBoGA1UEAwwTcGFzc21pbnQtc21va2UtdGVzdDAeFw0yNjA0MTUxMDEx
NDdaFw0zNjA0MTIxMDExNDdaMB4xHDAaBgNVBAMME3Bhc3NtaW50LXNtb2tlLXRl
c3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDLhDz1Rg256iBmWreh
Q0ep+w6wY1R7zl8bY84YrrUXKXgRnwtxxsChMC6Fl1e7jJx0EoJh07/nivk1ksPz
+YpWK8LjYlOVI4JfUXc31gSdKd8RlcIBFKXK3tgDuWwRGl4wg2Oc3SN0bVik68Y7
AH+ddrvvdt3br+V5ZPlJ3co6ehZHBS2IQn5rGLxWPIf9uYMlZebOztqxx+EZ+mus
vtKKT6KJCscQBE236qqFppTxU6MtIwBZuOqQ+9HCW8TdGjzKnQOIEKbT5gkiSvVR
hMpCLPg1Lrr6O0OPkL8UujiYBs6EMusqA2aausc+d/E+n05aZNzJLUXegnOdKFv2
WbNhAgMBAAGjUzBRMB0GA1UdDgQWBBR7b+kYG7F41OHNTRE/E65b2bE9ADAfBgNV
HSMEGDAWgBR7b+kYG7F41OHNTRE/E65b2bE9ADAPBgNVHRMBAf8EBTADAQH/MA0G
CSqGSIb3DQEBBQUAA4IBAQAxZImTuayCTKvk5ILkUUE8f8VkNMRrsKiH4zSDtT/w
ejBLrCvx+ws0TRqFUDqa8xdFPOzzCZgd1botbHEM0wAwZXCskrOQP822a+TFSynm
cbuDa8tz+WfFGUcB7rIJJXmRdQadKP89zrB+GtUDBEHFJpvZRZ13P5FPi1/+bzRe
i8QlQCoKYbVPjPhkV9W3W0OxsKLRk62vXa51+TBusXFp+OgmA++OkCgkJKL7NnMG
9aYRrTyYhIsXoUHhwkbgsJPE/i2WZ7isDZsW+db8t9iZ6SPt+fAis79IFf18ghuK
Dlbs3OU2bk2cWQmm6qURm7OzcZCscju7I82Hdy4HTfDd
-----END CERTIFICATE-----
`

const TEST_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDLhDz1Rg256iBm
WrehQ0ep+w6wY1R7zl8bY84YrrUXKXgRnwtxxsChMC6Fl1e7jJx0EoJh07/nivk1
ksPz+YpWK8LjYlOVI4JfUXc31gSdKd8RlcIBFKXK3tgDuWwRGl4wg2Oc3SN0bVik
68Y7AH+ddrvvdt3br+V5ZPlJ3co6ehZHBS2IQn5rGLxWPIf9uYMlZebOztqxx+EZ
+musvtKKT6KJCscQBE236qqFppTxU6MtIwBZuOqQ+9HCW8TdGjzKnQOIEKbT5gki
SvVRhMpCLPg1Lrr6O0OPkL8UujiYBs6EMusqA2aausc+d/E+n05aZNzJLUXegnOd
KFv2WbNhAgMBAAECggEACqS1Y8DAkNpFzFc5YXGUEszv2/mEjn6rZSfkpvr4urJ0
a9F/nE6VaOiiP4zRGFx2cIXo89uf3pNbTKS1YvHy55Dy0zL40DooRDq4YNRsby65
0ouHNvNrke7yaPbJHXeITle0vYb9fBuIMQR+nGZ+hg+SrRJFmzVkAM5Z0OCMm18K
pg+frNRCLyqegq65eCvz1+hP2ODJKcwSDUOf83jCRoPXsgI5iXaXOx6d2G0EkfOf
acVUEpxeIdS2lcjJMWUtI6hczbKMQKsC3vzk/WJWuY9D+1mzR5UDZqyMmjdCuDpO
XHhYiwSGJIpT5sScLABF4jgulScJE/lQm71immu8xQKBgQD/MlSSSLJ1zymkBLHo
OxZs2r8WZ5TH4AtPjX6iXhxJ6hl+EV9qy9PzX7HN4fRrX1i0lbccMPMCHfiYtukX
z8JabA62mqhcg2fNywWZycm3AswrlmJJZYY1YPcKR8VPo/a2nsb1HYZrb3lDcrTo
Hq7Bpr4txvYwp7h264y83IWdzQKBgQDMKEHocIjIAzQwvSelY3xKLofvVINJfmTp
CaXKaGtEp4wgzmR+PkqHxDTuQ3c7GA5paVZUVqaYD0+AfNVjn2zlHT5znP57COMz
JL85ovsvCl9e7tRp3dVkWZbagaPkkOuE0d49F0UbG3xWx97s0ho5S+SeMMIN/9R+
ar0AdR635QKBgQD1C40t0mSav0wK1P9IMcS8zeeDSf8RVk9GGmYo3xlm2EWWSnRH
BmYFYjRHr9qVZ76z2Lc1eMM/myvk6G42kSbc0LnoGeXkv8FjWLmODLeG5kbK6+KA
+929T9inpHcQnC8A+MGvCKTUcPwOCg0wfpXsGYKwTkaEPejhOBmyGEatWQKBgQCC
Jpf9yuAoQoKfH7eKpGW0FP3sAYDA9ab3OYNMCk14MygOMgW2xZdV/iuQScpVDf0C
DnlOwv7pqbkRPIP9QsF1PrN1mPxTC1NsY1zVLaXcU0yBhNg9tYI4uzSEkGkfaZP7
1J9NauxPX7Jg0IK5jyfQpyVUA9lye0nIXdun0wKGUQKBgQDMJ4SgRxem3XaJ6hUs
Rjkj0n5hZykvmObpb8mr2EAkn2XoeFGsDes5/FwMWPdR3bvVtdZiWmFHIm5+EYWw
Lcx05UMbcuU7tgFxO/+KYMpd9rhJ9zA7PHTnu5SxDR+mVSh67lbJBC9a+X0F6Ycm
DJzSH++Wezu2A+/E04Ver+kubw==
-----END PRIVATE KEY-----
`

async function loadAppleMaterial(): Promise<SigningMaterial> {
  return SigningMaterial.fromPem({
    signerCertPem: TEST_CERT_PEM,
    // Reuse the same cert as the "intermediate" — we never chain-verify
    // in this smoke test. The CMS pipeline just needs a parseable cert.
    wwdrPem: TEST_CERT_PEM,
    privateKeyPkcs8Pem: TEST_KEY_PEM,
  })
}

async function generateGoogleMaterialInWorker(): Promise<GoogleSigningMaterial> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey))

  let binary = ''
  for (let i = 0; i < pkcs8.length; i++) binary += String.fromCharCode(pkcs8[i] ?? 0)
  const b64 = btoa(binary)
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64))
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`

  return GoogleSigningMaterial.fromServiceAccount({
    clientEmail: 'workers-test@passmint.iam.gserviceaccount.com',
    privateKeyPkcs8Pem: pem,
    issuerId: '3388000000000000',
  })
}

describe('passmint running inside workerd', () => {
  it('validates a schema, renders Apple, signs with CMS, and zips into a .pkpass', async () => {
    const material = await loadAppleMaterial()

    const signed = await Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.workers',
      serialNumber: 'workers-smoke-1',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint workers smoke',
      description: 'Runs in workerd',
      colors: { background: '#0f172a', foreground: '#f1f5f9' },
      images: { icon: { x2: { bytes: FAKE_ICON } } },
      barcodes: [{ format: 'qr', message: 'SMOKE-1' }],
    })
      .primaryField({ key: 'event', label: 'Event', value: 'Workers smoke' })
      .sign(material)

    const bytes = signed.toUint8Array()
    expect(bytes.length).toBeGreaterThan(200)

    // Round-trip through fflate inside workerd.
    const entries = unzipSync(bytes)
    expect(entries['pass.json']).toBeDefined()
    expect(entries['manifest.json']).toBeDefined()
    expect(entries.signature).toBeDefined()
    expect(entries['icon@2x.png']).toBeDefined()

    const passJson = JSON.parse(new TextDecoder().decode(entries['pass.json']!)) as Record<
      string,
      unknown
    >
    expect(passJson.formatVersion).toBe(1)
    expect(passJson.backgroundColor).toBe('rgb(15, 23, 42)')
  })

  it('toResponse returns a Response with the correct headers', async () => {
    const material = await loadAppleMaterial()

    const response = await Pass.generic({
      passTypeIdentifier: 'pass.com.example.workers',
      serialNumber: 'workers-resp',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'Example',
      description: 'Response test',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
    })
      .sign(material)
      .then((p) => p.toResponse())

    expect(response.headers.get('content-type')).toBe('application/vnd.apple.pkpass')
    expect(response.headers.get('content-disposition')).toContain('workers-resp.pkpass')
    const body = new Uint8Array(await response.arrayBuffer())
    expect(body.length).toBeGreaterThan(200)
  })

  it('produces a Google Wallet save-link JWT with the expected structure', async () => {
    const material = await generateGoogleMaterialInWorker()

    const pass = Pass.eventTicket({
      passTypeIdentifier: 'pass.com.example.workers',
      serialNumber: 'workers-google-1',
      teamIdentifier: 'ABCD1234EF',
      organizationName: 'passmint',
      description: 'Workers Google test',
      logoText: 'Workers Smoke',
      images: { icon: { x2: { bytes: FAKE_ICON } } },
      barcodes: [{ format: 'qr', message: 'GOOGLE-1' }],
    }).build()

    const url = await pass.toGoogleSaveLink(material, { origins: ['example.com'] })
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true)

    const jwt = url.slice('https://pay.google.com/gp/v/save/'.length)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)

    // Decode claims without depending on node:buffer.
    const claimsB64 = parts[1]!
    const padded = claimsB64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(claimsB64.length + ((4 - (claimsB64.length % 4)) % 4), '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    expect(claims.iss).toBe(material.clientEmail)
    expect(claims.aud).toBe('google')
    expect(claims.typ).toBe('savetowallet')
  })
})
