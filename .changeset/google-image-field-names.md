---
"passmint": patch
---

Fix Google Wallet logo and hero field names. Every class used to get `programLogo` and `heroImage`, which only `loyaltyClass` supports under those names, so Google rejected classes with a logo or hero for the other types. The logo now goes to `titleImage` on offers, `logo` on event tickets and transit, `flightHeader.carrier.airlineLogo` on flights, and the generic object's `logo` (`genericClass` has no image fields, so the generic hero moves to the object too). For non-generic types the hero is now emitted on the class only, so objects inherit it and pick up later class changes instead of keeping the hero they were issued with.
