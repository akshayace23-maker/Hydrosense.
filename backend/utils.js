// utils.js
const crypto = require('crypto');
const config = require('./config');

// Generates report codes like HS-TRI-2026-00042 using a DB row count seed
// plus randomness, so codes are unpredictable (not sequential/guessable).
function makeReportCode(db) {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(10000, 99999);
  return `HS-${config.REPORT_CODE_PREFIX}-${year}-${rand}`;
}

// Very small HTML-escape helper used anywhere we build server-side snippets
// (e.g. emails) from user-supplied text, to prevent stored/reflected XSS.
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAuthorityEmail(email) {
  const domain = String(email).split('@')[1] || '';
  return domain.toLowerCase() === config.AUTHORITY_EMAIL_DOMAIN;
}

// Optional email sending. If SMTP is not configured, this logs instead of
// throwing, so the app keeps working in local/demo environments.
let transporter = null;
function getMailer() {
  if (transporter !== null) return transporter;
  if (!config.SMTP_HOST) {
    transporter = false;
    return transporter;
  }
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT),
    secure: Number(config.SMTP_PORT) === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const mailer = getMailer();
  if (!mailer) {
    console.log(`[mail:disabled] Would send to ${to}: ${subject}`);
    return;
  }
  try {
    await mailer.sendMail({ from: config.MAIL_FROM, to, subject, html });
  } catch (e) {
    console.error('[mail:error]', e.message);
  }
}

const COMMON_PASSWORDS = new Set(['password','password1','password123','12345678','123456789','1234567890','qwertyuiop','qwerty123','iloveyou1','admin123','welcome123','letmein123','hydrosense','hydrosense1','hydrosense123']);
// Returns an error string, or null when the password is acceptable.
function passwordProblem(pw, email) {
  if (typeof pw !== 'string') return 'Password is required.';
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (Buffer.byteLength(pw) > 72) return 'Password is too long (max 72 characters).';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'That password is too common. Please choose another.';
  if (email && pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) return 'Password must not contain your email name.';
  return null;
}

function logSecurity(db, userId, event, req) {
  try {
    db.prepare('INSERT INTO security_log (user_id, event, ip) VALUES (?,?,?)').run(userId || null, event, req ? (req.ip || null) : null);
  } catch (e) { /* never break a request because of logging */ }
}

module.exports = {
  passwordProblem, logSecurity, makeReportCode, escapeHtml, isAuthorityEmail, sendMail };
