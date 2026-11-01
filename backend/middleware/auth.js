// middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/init');

// Reads the httpOnly session cookie, verifies the JWT, then re-checks the user in the
// database (so deleted users and "log out everywhere" take effect immediately).
function resolveUser(req) {
  const token = req.cookies ? req.cookies[config.COOKIE_NAME] : null;
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    const u = db.prepare('SELECT id, role, name, email, phone, token_version FROM users WHERE id = ?').get(p.id);
    if (!u || u.token_version !== p.tv) return null;
    return { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone };
  } catch (e) { return null; }
}

function authRequired(req, res, next) {
  const u = resolveUser(req);
  if (!u) return res.status(401).json({ error: 'Not authenticated.' });
  req.user = u;
  next();
}

// Optional auth: attaches req.user if a valid session is present, but never blocks.
function authOptional(req, res, next) {
  const u = resolveUser(req);
  if (u) req.user = u;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

// CSRF defense-in-depth: the session cookie is httpOnly + SameSite, and every state-changing
// request must also carry a custom header that a cross-site form post cannot set.
function csrfHeaderRequired(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'HydroSense') {
    return res.status(403).json({ error: 'Request blocked (missing required header).' });
  }
  next();
}

module.exports = { authRequired, authOptional, requireRole, csrfHeaderRequired };
