const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const SUBJECTS = {
  emailChange: 'Confirm your new shoppy email',
  passwordReset: 'Your shoppy password reset code',
  registerVerify: 'Verify your shoppy account',
};

async function sendOtpEmail(to, code, purpose) {
  const subject = SUBJECTS[purpose] || 'Your shoppy verification code';
  await transporter.sendMail({
    from: `shoppy <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: `Your shoppy verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your shoppy verification code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}

module.exports = { sendOtpEmail };
