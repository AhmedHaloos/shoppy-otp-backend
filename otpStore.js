const crypto = require('crypto');
const admin = require('./firebaseAdmin');

const db = admin.firestore();
const COLLECTION = 'otpCodes';
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  const pepper = process.env.OTP_HASH_PEPPER || '';
  return crypto.createHash('sha256').update(`${code}:${pepper}`).digest('hex');
}

function generateCode() {
  // 6-digit numeric code, zero-padded.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Creates (or overwrites, if one already existed) a pending OTP for `key`
 * (usually a Firebase uid). Returns the plaintext code -- caller is
 * responsible for emailing it; only the hash is ever persisted.
 */
async function createOtp(key, purpose, payload) {
  const code = generateCode();
  await db.collection(COLLECTION).doc(key).set({
    purpose,
    payload: payload || null,
    codeHash: hashCode(code),
    attempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + EXPIRY_MS),
  });
  return code;
}

/**
 * Verifies `code` against the pending OTP for `key`. On success, deletes
 * the document and resolves with its stored `payload`. On failure,
 * throws an Error with a `.code` of one of: 'not_found', 'expired',
 * 'too_many_attempts', 'invalid_code'.
 */
async function verifyOtp(key, code) {
  const ref = db.collection(COLLECTION).doc(key);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('No pending code for this request.');
    err.code = 'not_found';
    throw err;
  }
  const data = snap.data();
  if (data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    const err = new Error('Code expired.');
    err.code = 'expired';
    throw err;
  }
  if (data.attempts >= MAX_ATTEMPTS) {
    await ref.delete();
    const err = new Error('Too many incorrect attempts.');
    err.code = 'too_many_attempts';
    throw err;
  }
  if (data.codeHash !== hashCode(code)) {
    await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
    const err = new Error('Incorrect code.');
    err.code = 'invalid_code';
    throw err;
  }
  await ref.delete();
  return data.payload;
}

module.exports = { createOtp, verifyOtp };
