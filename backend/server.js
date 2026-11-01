// server.js
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config');
require('./db/init'); // ensures schema exists on boot
const { csrfHeaderRequired } = require('./middleware/auth');
const { UPLOAD_ROOT } = require('./middleware/upload');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const waterBodyRoutes = require('./routes/waterbodies');
const newsRoutes = require('./routes/news');
const geoRoutes = require('./routes/geo');

const app = express();

// Trust proxy (needed for correct rate-limiting / secure cookies behind a reverse proxy in production).
app.set('trust proxy', 1);

const isProd = config.NODE_ENV === 'production';
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // Every script, font and library is self-hosted (public/js/vendor, public/fonts), so scripts
      // can only come from this origin. No inline scripts are allowed.
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(isProd ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieParser());

// Global rate limit as a baseline defense-in-depth on top of per-route limits.
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } }));
// API responses can contain personal data — never let browsers or proxies cache them.
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// Liveness probe for the hosting platform.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// CSRF defense-in-depth on all state-changing API calls (see middleware/auth.js).
app.use('/api', csrfHeaderRequired);

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/water-bodies', waterBodyRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/geo', geoRoutes);

// Serve uploaded evidence photos. Directory listing is disabled by express.static by default,
// and filenames are server-generated random tokens (see middleware/upload.js), not user input.
app.use('/uploads', express.static(UPLOAD_ROOT, { dotfiles: 'deny', index: false }));

// Serve the frontend.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));

// Unknown API route -> JSON 404; unknown page -> friendly 404 page.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

// Centralized error handler (keeps stack traces out of responses).
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `Each photo must be under ${config.MAX_UPLOAD_MB} MB.` });
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many photos attached.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  if (err.message && (err.message.includes('Only JPEG') || err.message.includes('could not be read'))) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.PORT, () => {
  console.log(`HydroSense server running on http://localhost:${config.PORT} [${config.NODE_ENV}]`);
});
