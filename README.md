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

## 2. Deploy to Render (free tier, no card required)

1. Push this folder to its own GitHub repository (do **not** commit `.env`
   — it's already in `.gitignore`).
2. Go to [render.com](https://render.com) and sign up / log in (GitHub
   login is fine, no card needed for the free tier).
3. **New** → **Web Service** → connect the GitHub repo you just pushed.
4. Settings:
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free
5. Under **Environment**, add the same three variables from your local
   `.env`: `FIREBASE_SERVICE_ACCOUNT`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   `OTP_HASH_PEPPER`. Do not set `PORT` — Render provides it automatically.
6. Deploy. Render will give you a URL like `https://shoppy-otp-backend.onrender.com`.
7. Give that URL to Claude so it can be wired into the Flutter app as the
   backend base URL.

Note: Render's free tier spins the service down after inactivity, so the
first request after a quiet period may take 30-60 seconds (cold start) —
expected, not a bug.

## 3. Firestore rules

The `otpCodes` collection is already denied to all client access by
Firestore's deny-by-default behavior (no client ever needs to read/write
it directly — only this backend does, via the Admin SDK, which bypasses
rules entirely). An explicit `allow read, write: if false;` rule for
`otpCodes` should also be added to `shoppy_dashboard/firestore.rules` as
defense in depth, and deployed with `firebase deploy --only firestore:rules`.
