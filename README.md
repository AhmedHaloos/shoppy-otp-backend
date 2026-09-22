# shoppy-otp-backend

Small Node.js/Express backend that sends and verifies 6-digit email OTP
codes for the shoppy app's two flows:

- **Change account email** — `/otp/email-change/request`, `/otp/email-change/verify`
- **Reset a forgotten password** — `/otp/password-reset/request`, `/otp/password-reset/verify`

Uses the Firebase Admin SDK (full access, bypasses Firestore/Auth security
rules — never expose this service to anything other than the shoppy app
itself) and Gmail SMTP via Nodemailer to send the codes. Pending codes are
stored (SHA-256 hashed, never in plaintext) in a Firestore collection
`otpCodes`, one document per user, with a 10-minute expiry and a 5-attempt
limit.

## 1. Run it locally first

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `FIREBASE_SERVICE_ACCOUNT` — the **entire contents** of a Firebase service
  account key JSON, as one line. Get one from the
  [Firebase Console](https://console.firebase.google.com/) → your project
  (`blog-56c04`) → gear icon → **Project settings** → **Service accounts**
  tab → **Generate new private key**. Open the downloaded file and paste its
  full JSON as the value (keep it as one line, wrapped in `'...'` if you're
  setting it from a shell).
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — a Gmail address that will send the
  codes, and an **App Password** for it (not your normal Gmail password).
  Requires 2-Step Verification enabled on that Google account:
  Google Account → Security → **App passwords** → generate one for "Mail" →
  use the 16-character password shown.
- `OTP_HASH_PEPPER` — any long random string (e.g. generate one with
  `openssl rand -hex 32`). Keep it secret; it's mixed into the hash of every
  stored code.

Then:

```bash
npm start
```

Sanity-check the routes with curl (replace `<idToken>` with a real Firebase
Auth ID token from a signed-in shoppy user — get one for testing via the
Firebase Auth REST `signInWithPassword` API, or by temporarily logging a
`getIdToken()` call in the app):

```bash
curl -X POST http://localhost:3000/otp/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@example.com"}'

curl -X POST http://localhost:3000/otp/email-change/request \
  -H "Content-Type: application/json" \
  -d '{"idToken":"<idToken>","newEmail":"new-address@example.com"}'
```

Confirm the email actually arrives before moving on to deployment.

## 2. Deploy to Vercel (free Hobby tier, no card required)

Render's free tier now requires card verification (even though it's not
charged), which defeats the original card-free requirement, so this
deploys to Vercel instead. The app is set up to run as a Vercel
serverless function (see `vercel.json` + the `require.main === module`
guard at the bottom of `index.js`) while still working as a normal
`node index.js` server locally.

1. Push this folder to its own GitHub repository (do **not** commit `.env`
   — it's already in `.gitignore`).
2. Go to [vercel.com](https://vercel.com) and sign up / log in with
   GitHub (no card needed for the Hobby tier). Note: Hobby is officially
   licensed for personal/non-commercial projects — acceptable here as a
   small-scale OTP backend, but worth knowing.
3. **Add New...** → **Project** → import the GitHub repo you just pushed.
   Leave the framework preset as **Other**.
4. Under **Environment Variables**, add:
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` — **base64-encode the service
     account JSON first**, don't paste the raw JSON. Several hosting
     UIs (confirmed on Vercel) mangle the `private_key` field's escaped
     `\n` newlines on paste, breaking the PEM and crashing the Admin SDK
     with `Invalid PEM formatted message`. Generate it with:
     ```bash
     node -e "console.log(Buffer.from(require('fs').readFileSync('service-account.json')).toString('base64'))"
     ```
     (or, from an already-set local `.env`:
     `node -e "require('dotenv').config(); console.log(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT).toString('base64'))"`)
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `OTP_HASH_PEPPER` — same values
     as your local `.env`.
   - Don't set `PORT` — not used on Vercel (serverless, no listening port).
5. Click **Deploy**.
6. Use the **production domain** Vercel gives you
   (`https://<project-name>.vercel.app`, no random hash in it) as the
   app's backend URL — the per-deployment preview URL (with a hash like
   `shoppy-otp-backend-9rzhtb6tc-....vercel.app`) is protected by
   Vercel's SSO wall and will redirect every request to a login page,
   making it unusable as a public API endpoint.
7. Give that production URL to Claude so it can be wired into the
   Flutter app as the backend base URL.

Note: Vercel serverless functions are stateless between cold starts, so
`express-rate-limit`'s in-memory store won't reliably persist across
invocations the way it would on a traditional always-on server — a known,
acceptable trade-off for a "basic" backend at this scale, not a bug.

## 3. Firestore rules

The `otpCodes` collection is already denied to all client access by
Firestore's deny-by-default behavior (no client ever needs to read/write
it directly — only this backend does, via the Admin SDK, which bypasses
rules entirely). An explicit `allow read, write: if false;` rule for
`otpCodes` should also be added to `shoppy_dashboard/firestore.rules` as
defense in depth, and deployed with `firebase deploy --only firestore:rules`.
