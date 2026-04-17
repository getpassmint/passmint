---
'passmint': minor
---

Security hardening pass — 28 new tests, 0 regressions.

**New guarantees (some of these tighten existing inputs):**

- **`ZipAssembler.add()`** now rejects `..` path segments, backslashes, drive-letter prefixes (e.g. `C:\`), and NUL bytes. Prevents ZIP-Slip-class issues for downstream consumers who use `ZipAssembler` directly with untrusted filenames. The internal `.pkpass` pipeline was already safe; this hardens the public API.
- **`webService.url`** must be `https://`. Previously any URL shape was accepted. Apple PKPass spec requires HTTPS; we now enforce at the schema layer instead of relying on device-side rejection. Same enforcement applies to `semantics.homepage`, `semantics.orderManagementUrl`, and all image URLs.
- **`applyRaw.apple`** cannot override identity fields (`passTypeIdentifier`, `teamIdentifier`, `serialNumber`, `authenticationToken`, `webServiceURL`). **`applyRaw.google`** cannot override `id`, `classId`, `state`. Prevents accidental identity forgery when callers pipe semi-trusted input through the escape hatch.
- **Google save-link JWTs** now include an `exp` claim by default (15 minutes). Override via `GoogleSaveOptions.expirySeconds`, or opt out with `expirySeconds: null`. Non-integer / non-positive values throw.
- **`classSuffix` / `objectSuffix`** validated against Google's allowed charset `[A-Za-z0-9._-]` with a 100-char cap. Prior behavior silently produced JWTs that Google rejected with an opaque error.
- **Image bytes** capped at 5 MiB per source. **PEM input** capped at 100 KiB. Prevents edge-runtime OOM via attacker-controlled input size.

**Public API additions:** `DEFAULT_GOOGLE_JWT_EXPIRY_SECONDS`, `MAX_IMAGE_BYTE_LENGTH`, `MAX_PEM_LENGTH`, `GoogleSaveOptions.expirySeconds`, `GoogleSaveJwtClaims.exp`.

**Other:** Added `SECURITY.md` and `.github/dependabot.yml`.

**Breaking for:**

- Anyone passing `http://` to `webService.url`, image URLs, or semantic URLs (now errors at schema time — switch to `https://`).
- Anyone passing image bytes > 5 MiB (resize before adding to the pass).
- Anyone who was relying on `applyRaw` to override identity fields (use the validated top-level fields instead).
- Anyone using `ZipAssembler.add()` with `..` or backslashes in paths (rarely legitimate).
