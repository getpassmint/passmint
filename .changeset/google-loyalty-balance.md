---
'passmint': minor
---

Add `google.loyalty` on store cards for Google Wallet loyalty objects: `points` and `secondaryPoints` (`{ label, balance }`, rendered as `loyaltyPoints` / `secondaryLoyaltyPoints`; a string balance becomes `balance.string`, an int32 `balance.int`, any other number `balance.double`) and `accountName` (the holder's name; `null` omits it). Without `google.loyalty` the output is unchanged: `accountName` is still the pass description. New exported types: `GoogleLoyalty`, `GoogleLoyaltyPoints`.
