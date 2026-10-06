---
"passmint": minor
---

Add `images.googleObject` for per-pass Google Wallet images that don't touch the class: `heroImage` (overrides the class hero on one object), `logo` (generic objects only, e.g. a member photo; other styles throw `E_GOOGLE_RENDER`) and `imageModules` (rendered as `imageModulesData`). Each field can be set to `null` to clear it explicitly: the object falls back to its default image, or gets `null` so a REST PATCH removes it. New exported types: `GoogleObjectImages`, `GoogleImageModule`.
