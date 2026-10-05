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

/**
 * Certificate sets for the WWDR chain check. Every CA here is a throwaway
 * self-signed cert; the DNs mimic Apple's so error messages read like the
 * real thing (Apple encodes CN first, then OU, O, C).
 */
export interface ChainFixtures {
  /** Leaf (RSA, sha256WithRSA) issued by `g4Pem`. */
  leafCertPem: string
  leafKeyPkcs8Pem: string
  /** The CA that really issued `leafCertPem`. */
  g4Pem: string
  /** Different DN (OU=G3) and key: the classic wrong-generation mistake. */
  g3Pem: string
  /** Same DN as `g4Pem`, different key: a WWDR that only looks right. */
  forgedG4Pem: string
  /** Leaf (RSA key, ecdsa-with-SHA384 signature) issued by `ecCaPem` (P-384). */
  ecLeafCertPem: string
  ecCaPem: string
}

let cachedChain: ChainFixtures | undefined

export function generateChainFixtures(): ChainFixtures {
  if (cachedChain) return cachedChain

  const dir = join(tmpdir(), `passmint-chain-${process.pid}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const wwdr = (ou: string) =>
    `/CN=Apple Worldwide Developer Relations Certification Authority/OU=${ou}/O=Apple Inc./C=US`
  const script = `
    set -e
    cd "${dir}"
    ca() { openssl req -x509 -newkey rsa:2048 -keyout "$1-key.pem" -out "$1.pem" -days 365 -nodes -subj "$2" 2>/dev/null; }
    ca g4 "${wwdr('G4')}"
    ca g3 "${wwdr('G3')}"
    ca forged-g4 "${wwdr('G4')}"
    openssl req -newkey rsa:2048 -keyout leaf-key.pem -out leaf.csr -nodes -subj "/CN=Pass Type ID: pass.com.example" 2>/dev/null
    openssl x509 -req -in leaf.csr -CA g4.pem -CAkey g4-key.pem -CAcreateserial -sha256 -out leaf.pem -days 365 2>/dev/null
    openssl pkcs8 -topk8 -in leaf-key.pem -out leaf-key.pkcs8.pem -nocrypt
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-384 -keyout ec-ca-key.pem -out ec-ca.pem -days 365 -nodes -subj "/CN=Fake WWDR EC" 2>/dev/null
    openssl x509 -req -in leaf.csr -CA ec-ca.pem -CAkey ec-ca-key.pem -CAcreateserial -sha384 -out ec-leaf.pem -days 365 2>/dev/null
  `
  execSync(script, { shell: '/bin/bash' })

  const read = (name: string) => readFileSync(join(dir, name), 'utf8')
  cachedChain = {
    leafCertPem: read('leaf.pem'),
    leafKeyPkcs8Pem: read('leaf-key.pkcs8.pem'),
    g4Pem: read('g4.pem'),
    g3Pem: read('g3.pem'),
    forgedG4Pem: read('forged-g4.pem'),
    ecLeafCertPem: read('ec-leaf.pem'),
    ecCaPem: read('ec-ca.pem'),
  }
  return cachedChain
}
