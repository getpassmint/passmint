# passmint-example-node

Two sample Node scripts for the real-device gate tests:

| Script | What it does |
|---|---|
| `generate.mjs` | Builds a signed `.pkpass` for iOS Wallet |
| `google.mjs` | Builds a Google Wallet "Add to Google Wallet" save link |

## Apple — `generate.mjs`

### Prerequisites

1. A **Pass Type ID certificate** downloaded from [Apple Developer](https://developer.apple.com/account/resources/certificates/list).
2. The **Apple WWDR intermediate CA** in PEM form. Download from
   https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer and convert:
   ```sh
   openssl x509 -inform DER -in AppleWWDRCAG3.cer -out wwdr.pem
   ```
3. The matching private key in **PKCS#8** PEM form. If you have a PKCS#1 key
   (header `-----BEGIN RSA PRIVATE KEY-----`), convert it:
   ```sh
   openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem
   ```

### Run

```sh
pnpm install
PASSMINT_SIGNER_CERT=./pass-type-id.pem \
PASSMINT_WWDR_CERT=./wwdr.pem \
PASSMINT_PRIVATE_KEY=./key.pkcs8.pem \
PASSMINT_TEAM_ID=ABCD1234EF \
PASSMINT_PASS_TYPE=pass.com.yourcompany.test \
pnpm generate
```

Then AirDrop `sample.pkpass` to your iPhone (or email it to yourself).
Wallet will prompt to add the pass.

### Troubleshooting

- **"This pass cannot be installed"** usually means cert chain or pass type
  identifier mismatch. Verify that your `PASSMINT_PASS_TYPE` matches the
  Common Name of the Pass Type ID certificate exactly (`pass.com.…`).
- **PKCS#1 key errors** — `passmint` only accepts PKCS#8. See conversion
  step above.
- **`.pkpass` treated as `.zip`** — make sure your mail client or server
  sends `Content-Type: application/vnd.apple.pkpass`.

## Google — `google.mjs`

### Prerequisites

1. A **Google Wallet issuer account** with a numeric issuer ID, from the
   [Google Pay & Wallet Console](https://pay.google.com/business/console/).
2. A **Google Cloud service account** with a JSON key downloaded.
3. The service account email added as a "Developer" user on your Wallet
   issuer in the Google Pay & Wallet Console.

### Run

```sh
pnpm install
PASSMINT_GOOGLE_CREDENTIALS=./service-account.json \
PASSMINT_GOOGLE_ISSUER_ID=3388000000022xxx \
PASSMINT_GOOGLE_ORIGIN=yourdomain.com \
pnpm google
```

The script prints the full `https://pay.google.com/gp/v/save/…` URL. Open
it in a browser signed into a Google account — if everything is wired up,
Wallet will offer to add the pass. Any issuer/authorization error shows up
directly on Google's landing page.

### Troubleshooting

- **"Something went wrong"** — usually means the service account isn't
  authorized as a Developer on the issuer. Add it in the Wallet Console.
- **Origin check failure** — make sure `PASSMINT_GOOGLE_ORIGIN` matches a
  domain you've registered on the issuer, or at least a domain you'll be
  serving the save link from.
- **PKCS#1 key errors** — `passmint` only accepts PKCS#8. Google service
  account JSON keys are PKCS#8 by default, so this shouldn't happen unless
  the key was converted at some point.
