---
"passmint": minor
---

Check that the WWDR intermediate actually issued the signer certificate. `SigningMaterial.fromPem` now verifies that the signer's issuer DN matches the WWDR's subject and that the signer's signature verifies against the WWDR's public key, and throws `PassmintSigningError` with the new code `E_WWDR_MISMATCH` (naming both certificates) when they don't. `fromParsed` checks the DN up front and the signature on the first `signManifest` call. Previously a mismatched pair (e.g. a G4-issued Pass Type ID certificate bundled with the G3 intermediate) signed without error and produced a pass Wallet refused to install, so inputs that used to be accepted can now throw. Docs now tell you to download the intermediate that issued your certificate rather than G3.

Fix the Apple barcode format for `itf`: it now renders as Apple's documented `PKBarcodeFormatI2of5` instead of the undocumented `PKBarcodeFormatITF`. The public `itf` name and Google's `ITF_14` mapping are unchanged.
