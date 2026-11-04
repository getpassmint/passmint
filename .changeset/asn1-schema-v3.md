---
'passmint': minor
---

Upgrade the `@peculiar/asn1-*` packages to v3. They are now ESM-only and mark themselves side-effect free, so the worst-case consumer bundle shrinks from about 49 kB to about 46 kB gzipped. `asn1js` v4 is now a direct dependency, because the v3 packages take it as a peer and fail `instanceof` checks against asn1js v3 objects. The supported Node range narrows from `>=20.0.0` to `^20.19.0 || >=22.12.0` to match: Node 20.0–20.18 and 22.0–22.11 are no longer supported. Edge runtimes are unaffected and the public API is unchanged.
