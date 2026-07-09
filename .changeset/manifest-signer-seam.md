---
'passmint': minor
---

`Pass.sign()` now accepts a `ManifestSigner` — a callback receiving the raw `manifest.json` bytes and returning the DER-encoded CMS signature — as an alternative to `SigningMaterial`.

This lets the private key live somewhere other than the process assembling the pass: a KMS, an HSM, or a separate signing service. Only `manifest.json` crosses the boundary, and it contains nothing but a map of filenames to SHA-1 digests, so no pass content or image data leaves the assembling process either.

The key-holding side calls the already-exported `signManifest(manifest, material)`. `assemblePkpass()` accepts the same union, and a signer that resolves to a non-`Uint8Array` or an empty signature throws `PassmintSigningError` with code `E_SIGN` rather than producing a `.pkpass` that Wallet silently rejects.

Passing `SigningMaterial` continues to work unchanged.
