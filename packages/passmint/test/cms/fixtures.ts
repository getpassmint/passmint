import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Self-signed test fixtures for CMS signing. Generated fresh in a temp
 * directory via `openssl` subprocess. Never committed.
 *
 * The "WWDR" cert here is a fake self-signed intermediate — it's only
 * used to prove the CMS pipeline produces a structurally valid
 * SignedData blob that verifies with `openssl cms -verify -noverify`.
 * A real Apple Pass Type ID cert + the real Apple WWDR Intermediate CA
 * are needed for production signing.
 */
export interface CmsFixtures {
  leafCertPem: string
  wwdrCertPem: string
  leafKeyPkcs8Pem: string
  /** Temp directory holding the generated PEM files. Reusable for subprocess verification. */
  dir: string
}

let cached: CmsFixtures | undefined

export function generateCmsFixtures(): CmsFixtures {
  if (cached) return cached

  const dir = join(tmpdir(), `passmint-cms-${process.pid}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Generate fake WWDR (self-signed CA) + leaf cert signed by WWDR.
  // The leaf key is converted to PKCS#8 for Web Crypto compatibility.
  const script = `
    set -e
    cd "${dir}"
    openssl req -x509 -newkey rsa:2048 -keyout wwdr-key.pem -out wwdr-cert.pem \
      -days 365 -nodes -subj "/CN=Fake WWDR Intermediate" 2>/dev/null
    openssl req -newkey rsa:2048 -keyout leaf-key.pem -out leaf.csr \
      -nodes -subj "/CN=Fake Pass Type ID" 2>/dev/null
    openssl x509 -req -in leaf.csr -CA wwdr-cert.pem -CAkey wwdr-key.pem \
      -CAcreateserial -out leaf-cert.pem -days 365 2>/dev/null
    openssl pkcs8 -topk8 -in leaf-key.pem -out leaf-key.pkcs8.pem -nocrypt
  `
  execSync(script, { shell: '/bin/bash' })

  cached = {
    leafCertPem: readFileSync(join(dir, 'leaf-cert.pem'), 'utf8'),
    wwdrCertPem: readFileSync(join(dir, 'wwdr-cert.pem'), 'utf8'),
    leafKeyPkcs8Pem: readFileSync(join(dir, 'leaf-key.pkcs8.pem'), 'utf8'),
    dir,
  }
  return cached
}

/**
 * Write bytes into the fixtures temp dir and return the absolute path.
 * Used by integration tests that invoke `openssl` as a verifier.
 */
export function writeFixtureFile(name: string, bytes: Uint8Array): string {
  const fixtures = generateCmsFixtures()
  const path = join(fixtures.dir, name)
  writeFileSync(path, bytes)
  return path
}
