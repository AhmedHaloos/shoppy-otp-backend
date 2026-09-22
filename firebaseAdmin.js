const admin = require('firebase-admin');

// FIREBASE_SERVICE_ACCOUNT holds the entire service-account JSON as one
// env-var string (see .env.example) -- avoids committing a key file.
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
