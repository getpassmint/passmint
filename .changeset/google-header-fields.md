---
'passmint': minor
---

Header fields now render on Google Wallet. Apple already placed `headerFields` in the pass header, but the Google renderer's `fieldsToTextModules` skipped them, so header fields silently vanished from Google passes. They are now flattened into `textModulesData` like the other field groups, ordered first.
