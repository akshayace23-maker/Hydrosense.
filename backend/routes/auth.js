// routes/auth.js — registration, login, sessions, account self-service
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const db = require('../db/init');
const config = require('../config');
const { isAuthorityEmail, passwordProblem, logSecurity } = require('../utils');
const { authRequired, authOptional } = require('../middleware/auth');
const { UPLOAD_ROOT } = require('../middleware/upload');

const router = express.Router();

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;
// Compared against when an email does not exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-' + crypto.randomBytes(8).toString('hex'), BCRYPT_COST);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-ups from this network. Please try again later.' },
});
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function publicUser(u) {
  return { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone || null };
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, tv: user.token_version || 0 },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
  res.cookie(config.COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

function firstError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ error: errors.array()[0].msg });
  return true;
}

// ---------- REGISTER ----------
router.post(
  '/register',
  registerLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters.'),
    body('email').trim().isEmail().isLength({ max: 150 }).normalizeEmail().withMessage('A valid email is required.'),
    body('password').isString().withMessage('Password is required.'),
    body('role').isIn(['citizen', 'authority']).withMessage('Invalid role.'),
    body('phone').optional({ checkFalsy: true }).trim().matches(/^[0-9+()\-\s]{6,20}$/).withMessage('Enter a valid phone number.'),
    body('invite_code').optional({ checkFalsy: true }).isString().isLength({ max: 100 }),
  ],
  async (req, res) => {
    if (firstError(req, res)) return;
    const { name, email, password, role, phone, invite_code } = req.body;

    const pwProblem = passwordProblem(password, email);
    if (pwProblem) return res.status(400).json({ error: pwProblem });

    if (role === 'authority') {
      if (!isAuthorityEmail(email)) {
        return res.status(400).json({
          error: `Authority accounts must use an official @${config.AUTHORITY_EMAIL_DOMAIN} email address.`,
        });
      }
      // A domain check cannot prove someone owns that mailbox, so an invite code issued by the
      // administrator is also required. In production, authority sign-up is disabled until one is configured.
      if (!config.AUTHORITY_INVITE_CODE) {
        if (config.NODE_ENV === 'production') {
          return res.status(403).json({ error: 'Authority sign-up is currently closed. Please contact the administrator.' });
        }
      } else {
        const a = Buffer.from(String(invite_code || ''));
        const b = Buffer.from(config.AUTHORITY_INVITE_CODE);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          logSecurity(db, null, 'authority_signup_bad_invite', req);
          return res.status(403).json({ error: 'The authority invite code is incorrect.' });
        }
      }
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    const info = db
      .prepare("INSERT INTO users (role, name, email, password_hash, phone, password_changed_at) VALUES (?,?,?,?,?,datetime('now'))")
      .run(role, name, email, password_hash, phone || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    logSecurity(db, user.id, 'register_' + role, req);
    setSessionCookie(res, user);
    res.status(201).json({ user: publicUser(user) });
  }
);

// ---------- LOGIN ----------
router.post(
  '/login',
  loginLimiter,
  [body('email').trim().isEmail().normalizeEmail(), body('password').isString().notEmpty().isLength({ max: 200 })],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Enter a valid email and password.' });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const genericError = { error: 'Invalid email or password.' };

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH); // keep timing similar
      return res.status(401).json(genericError);
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked after too many failed attempts. Try again in a few minutes.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      let locked_until = null;
      let nextAttempts = attempts;
      if (attempts >= LOCK_THRESHOLD) {
        locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        nextAttempts = 0;
        logSecurity(db, user.id, 'account_locked', req);
      }
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(nextAttempts, locked_until, user.id);
      logSecurity(db, user.id, 'login_failed', req);
      return res.status(401).json(genericError);
    }

    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    logSecurity(db, user.id, 'login_ok', req);
    setSessionCookie(res, user);
    res.json({ user: publicUser(user) });
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie(config.COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Guests get { user: null } (HTTP 200) so the site can check login state without noisy 401 errors.
router.get('/me', authOptional, (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// ---------- ACCOUNT SELF-SERVICE ----------
router.put(
  '/profile',
  authRequired,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters.'),
    body('phone').optional({ checkFalsy: true }).trim().matches(/^[0-9+()\-\s]{6,20}$/).withMessage('Enter a valid phone number.'),
  ],
  (req, res) => {
    if (firstError(req, res)) return;
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(req.body.name, req.body.phone || null, req.user.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(u) });
  }
);

router.post(
  '/change-password',
  authRequired,
  sensitiveLimiter,
  [body('current_password').isString().notEmpty(), body('new_password').isString().notEmpty()],
  async (req, res) => {
    if (firstError(req, res)) return;
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(req.body.current_password, u.password_hash))) {
      logSecurity(db, u.id, 'change_password_bad_current', req);
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }
    const problem = passwordProblem(req.body.new_password, u.email);
    if (problem) return res.status(400).json({ error: problem });
    if (req.body.new_password === req.body.current_password) {
      return res.status(400).json({ error: 'The new password must be different from the current one.' });
    }
    const hash = await bcrypt.hash(req.body.new_password, BCRYPT_COST);
    // Bumping token_version signs out every other device/session.
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, password_changed_at = datetime('now') WHERE id = ?").run(hash, u.id);
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    logSecurity(db, u.id, 'password_changed', req);
    setSessionCookie(res, fresh);
    res.json({ ok: true });
  }
);

router.post('/logout-all', authRequired, (req, res) => {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.user.id);
  logSecurity(db, req.user.id, 'logout_all', req);
  res.clearCookie(config.COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Download everything HydroSense holds about the signed-in user.
router.get('/export', authRequired, (req, res) => {
  const u = db.prepare('SELECT id, role, name, email, phone, created_at FROM users WHERE id = ?').get(req.user.id);
  const reports = db.prepare('SELECT * FROM reports WHERE citizen_id = ?').all(u.id).map((r) => {
    const { citizen_id, ...rest } = r; // internal id is not part of the export
    return rest;
  });
  const confirmations = db.prepare('SELECT report_id, created_at FROM confirmations WHERE user_id = ?').all(u.id);
  const log = db.prepare('SELECT event, created_at FROM security_log WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id);
  res.setHeader('Content-Disposition', 'attachment; filename="hydrosense-my-data.json"');
  res.json({ exported_at: new Date().toISOString(), account: u, reports, confirmations, security_events: log });
});

// Permanently delete a citizen account together with its reports, photos and confirmations.
router.delete('/account', authRequired, sensitiveLimiter, [body('password').isString().notEmpty()], async (req, res) => {
  if (firstError(req, res)) return;
  if (req.user.role !== 'citizen') {
    return res.status(403).json({ error: 'Authority accounts hold official inspection records and must be removed by the administrator.' });
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(req.body.password, u.password_hash))) {
    return res.status(401).json({ error: 'Password is incorrect.' });
  }
  const files = db.prepare(`SELECT p.filename FROM report_photos p JOIN reports r ON r.id = p.report_id WHERE r.citizen_id = ?`).all(u.id)
    .concat(db.prepare('SELECT filename FROM report_photos WHERE uploaded_by = ?').all(u.id));
  db.transaction(() => {
    db.prepare('DELETE FROM confirmations WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM reports WHERE citizen_id = ?').run(u.id); // child rows cascade
    db.prepare('UPDATE report_photos SET uploaded_by = NULL WHERE uploaded_by = ?').run(u.id);
    db.prepare('UPDATE report_updates SET actor_id = NULL WHERE actor_id = ?').run(u.id);
    db.prepare('DELETE FROM security_log WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  })();
  for (const f of files) {
    try { fs.unlinkSync(path.join(UPLOAD_ROOT, path.basename(f.filename))); } catch (e) { /* already gone */ }
  }
  res.clearCookie(config.COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

module.exports = router;
