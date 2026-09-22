const admin = require('firebase-admin');

// Prefer FIREBASE_SERVICE_ACCOUNT_BASE64 (the whole service-account JSON,
// base64-encoded) over the raw-JSON FIREBASE_SERVICE_ACCOUNT -- several
// hosting UIs (confirmed live on Vercel) mangle the private_key field's
// escaped \n newlines when a raw multi-field JSON blob is pasted into
// their environment-variable editor, especially via a bulk/.env-style
// paste, corrupting the PEM and breaking Admin SDK init. Base64 has no
// characters any of these UIs could misinterpret, so it's immune to this
// whole class of bug. Raw JSON is kept as a fallback for local `.env`
// use, where this problem doesn't occur.
// TEMP DIAGNOSTIC -- remove once the credential loads correctly.
console.log('DEBUG_CRED: has BASE64 var =', !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  'length =', (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').length);
console.log('DEBUG_CRED: has raw JSON var =', !!process.env.FIREBASE_SERVICE_ACCOUNT,
  'length =', (process.env.FIREBASE_SERVICE_ACCOUNT || '').length);

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
  console.log('DEBUG_CRED: decoded starts with =', decoded.slice(0, 30));
  console.log('DEBUG_CRED: decoded private_key snippet =', (JSON.parse(decoded).private_key || '').slice(0, 40));
  serviceAccount = JSON.parse(decoded);
} else {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
