// routes/news.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db/init');
const { authRequired, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

// Public: list published news
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT n.id, n.title, n.category, n.summary, n.photo_filename, n.created_at, n.water_body_id, u.name as author_name, wb.name as water_body_name
    FROM news_posts n LEFT JOIN users u ON u.id = n.author_id
    LEFT JOIN water_bodies wb ON wb.id = n.water_body_id
    WHERE n.status = 'published' ORDER BY n.created_at DESC LIMIT 100
  `).all();
  res.json({ news: rows });
});

// Authority: publish news
router.post(
  '/',
  authRequired, requireRole('authority'), upload.single('photo'),
  [body('title').trim().isLength({ min: 3, max: 150 }), body('summary').trim().isLength({ min: 3, max: 2000 }),
   body('category').isIn(['environmental_alert', 'restoration_update', 'inspection_update', 'water_body_condition', 'community_update', 'research_awareness', 'achievement'])],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { title, summary, category, water_body_id } = req.body;
    const info = db.prepare(`INSERT INTO news_posts (author_id, title, category, water_body_id, summary, photo_filename)
      VALUES (?,?,?,?,?,?)`).run(
      req.user.id, title, category, water_body_id || null, summary, req.file ? req.file.filename : null
    );
    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }
);

module.exports = router;
