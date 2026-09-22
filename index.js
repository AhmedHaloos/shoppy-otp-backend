require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const admin = require('./firebaseAdmin');
const { createOtp, verifyOtp } = require('./otpStore');
const { sendOtpEmail } = require('./mailer');

const app = express();
app.use(cors());
app.use(express.json());

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/otp', otpLimiter);

function otpErrorMessage(code) {
  switch (code) {
    case 'not_found':
      return 'No pending code for this request. Please request a new one.';
    case 'expired':
      return 'This code has expired. Please request a new one.';
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Please request a new code.';
    case 'invalid_code':
      return 'Incorrect code.';
    default:
      return 'Could not verify code.';
  }
}

async function uidFromIdToken(req) {
  const idToken = req.body && req.body.idToken;
  if (!idToken) {
    const err = new Error('Missing idToken.');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded.uid;
  } catch (e) {
    const err = new Error('Invalid or expired session. Please sign in again.');
    err.status = 401;
    throw err;
  }
}

// --- Email change -----------------------------------------------------

app.post('/otp/email-change/request', async (req, res) => {
  try {
    const uid = await uidFromIdToken(req);
    const newEmail = (req.body.newEmail || '').trim().toLowerCase();
    if (!newEmail) {
      return res.status(400).json({ error: 'newEmail is required.' });
    }

    try {
      const existing = await admin.auth().getUserByEmail(newEmail);
      if (existing.uid !== uid) {
        return res.status(409).json({ error: 'This email is already in use.' });
      }
    } catch (e) {
      // auth/user-not-found is expected -- the new email is free to use.
      if (e.code !== 'auth/user-not-found') throw e;
    }

    const code = await createOtp(uid, 'emailChange', { newEmail });
    await sendOtpEmail(newEmail, code, 'emailChange');
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Request failed.' });
  }
});

app.post('/otp/email-change/verify', async (req, res) => {
  try {
    const uid = await uidFromIdToken(req);
    const code = (req.body.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'code is required.' });
    }

    let payload;
    try {
      payload = await verifyOtp(uid, code);
    } catch (e) {
      return res.status(400).json({ error: otpErrorMessage(e.code) });
    }

    const newEmail = payload.newEmail;
    await admin.auth().updateUser(uid, { email: newEmail, emailVerified: true });
    await admin.firestore().collection('customers').doc(uid).update({ email: newEmail });

    res.json({ ok: true, newEmail });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Verification failed.' });
  }
});

// --- Password reset -----------------------------------------------------

app.post('/otp/password-reset/request', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  // Always the same response, whether or not the account exists -- avoids
  // leaking account existence to a caller who only supplies an email.
  const genericResponse = { ok: true };
  if (!email) {
    return res.json(genericResponse);
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    const code = await createOtp(user.uid, 'passwordReset', { email });
    await sendOtpEmail(email, code, 'passwordReset');
  } catch (e) {
    // Includes auth/user-not-found -- intentionally swallowed.
  }
  res.json(genericResponse);
});

app.post('/otp/password-reset/verify', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const code = (req.body.code || '').trim();
    const newPassword = req.body.newPassword || '';
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'email, code and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    let uid;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (e) {
      return res.status(400).json({ error: otpErrorMessage('not_found') });
    }

    try {
      await verifyOtp(uid, code);
    } catch (e) {
      return res.status(400).json({ error: otpErrorMessage(e.code) });
    }

    await admin.auth().updateUser(uid, { password: newPassword });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Reset failed.' });
  }
});

app.get('/', (req, res) => res.json({ ok: true, service: 'shoppy-otp-backend' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`shoppy-otp-backend listening on ${port}`));
