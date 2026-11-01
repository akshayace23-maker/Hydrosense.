// routes/geo.js — resolves shortened map links (e.g. https://maps.app.goo.gl/xxxx) so the report form can
// pin the location automatically. SSRF-safe: https only, strict hostname allowlist on EVERY redirect hop,
// short timeout, signed-in users only, rate limited. Only the final URL string is returned.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, message: { error: 'Too many link lookups. Please try again shortly.' } });

const ALLOWED_HOSTS = [
  /^maps\.app\.goo\.gl$/i, /^goo\.gl$/i, /^g\.co$/i, /^maps\.google\.[a-z.]+$/i, /^(www\.)?google\.[a-z.]+$/i,
  /^(www\.)?openstreetmap\.org$/i, /^osm\.org$/i,
];
const hostOK = (u) => u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));

router.post('/resolve', authRequired, limiter, [body('url').isString().isLength({ min: 8, max: 600 })], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Paste a valid map link.' });
  let current;
  try { current = new URL(req.body.url.trim()); } catch (e) { return res.status(400).json({ error: 'Paste a valid map link.' }); }
  if (!hostOK(current)) return res.status(400).json({ error: 'Only Google Maps and OpenStreetMap links can be used.' });

  try {
    for (let hop = 0; hop < 6; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      let r;
      try {
        r = await fetch(current.toString(), { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (HydroSense link resolver)', 'Accept-Language': 'en' } });
      } finally { clearTimeout(timer); }
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        const next = new URL(r.headers.get('location'), current);
        if (!hostOK(next)) {
          // The destination may be a consent page or an app deep link; its query string can still hold the coordinates.
          if (/google\./i.test(next.hostname)) return res.json({ url: next.toString() });
          return res.status(400).json({ error: 'That link redirects somewhere that is not allowed.' });
        }
        current = next;
        continue;
      }
      return res.json({ url: current.toString() });
    }
    return res.status(400).json({ error: 'That link redirects too many times.' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not open that link. Please paste the coordinates instead (for example 10.9503, 78.6911).' });
  }
});

module.exports = router;
