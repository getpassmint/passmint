# Security Policy

## Supported versions

`passmint` is pre-1.0 alpha. Security fixes are applied to the **latest published minor version only**. When we ship 1.0, this policy will expand to cover at least one previous minor line.

| Version | Supported |
| ------- | --------- |
| `0.x`   | :white_check_mark: latest only |
| `< 0.1` | :x: |

## Reporting a vulnerability

**Please do not file public GitHub issues for security bugs.**

Email **security@passmint.com** with:

- A concise description of the issue.
- A reproduction (code sample, PoC, or steps).
- Your assessment of impact (what an attacker gains / who is affected).
- Whether the issue is already public (CVE, public fork, blog, etc.).

We aim to:

- **Acknowledge** the report within **72 hours**.
- **Provide a first-response assessment** (confirmed / needs info / won't fix) within **7 days**.
- **Ship a fix** for confirmed high / critical issues within **30 days**, or a coordinated disclosure timeline if it will take longer.

If you don't hear back within 72 hours, please ping again — email filtering is imperfect.

## Scope

In scope:

- The `passmint` npm package code.
- Public utility surfaces: `ZipAssembler`, `SigningMaterial`, `GoogleSigningMaterial`, `signManifest`, `signSaveJwt`, schema validators.
- Documented examples under `examples/`.
- Release / CI infrastructure where a bug could affect what's published to npm.

Out of scope:

- Apple Wallet / Google Wallet itself (report to Apple / Google directly).
- Vulnerabilities in third-party dependencies — report upstream first; we'll track and bump once patched.
- Denial of service caused by a caller passing pathologically large inputs without the `passmint` schema reporting it as invalid. (We accept size-cap hardening PRs.)
- Issues reachable only by a caller who already has the signing private key or is already acting with the deployer's trust.

## Acknowledgements

We maintain a hall of fame for researchers who report valid issues. Let us know if you'd like to be listed when we publish the fix.
