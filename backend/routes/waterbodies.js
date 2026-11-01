// routes/waterbodies.js
const express = require('express');
const db = require('../db/init');
const { authRequired, requireRole } = require('../middleware/auth');
const { computeFoodWebIndex } = require('../eco/foodWebIndex');
const { waterBodyHistoryPdf } = require('../pdf/generate');

const router = express.Router();

// Public: list all water bodies (for map + directory)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT wb.*,
      (SELECT COUNT(*) FROM reports r WHERE r.water_body_id = wb.id) as report_count,
      (SELECT COUNT(*) FROM reports r WHERE r.water_body_id = wb.id AND r.status NOT IN ('resolved','rejected')) as active_count
    FROM water_bodies wb ORDER BY report_count DESC
  `).all();
  res.json({ water_bodies: rows });
});

// Public: single water-body profile with full history
router.get('/:id', (req, res) => {
  const wb = db.prepare('SELECT * FROM water_bodies WHERE id = ?').get(req.params.id);
  if (!wb) return res.status(404).json({ error: 'Water body not found.' });

  const reports = db.prepare(`
    SELECT id, report_code, status, priority, observed_issues, created_at, is_anonymous
    FROM reports WHERE water_body_id = ? ORDER BY created_at DESC
  `).all(wb.id);

  const reportIds = reports.map((r) => r.id);
  let inspections = [], actions = [], confirmations = 0;
  if (reportIds.length) {
    const placeholders = reportIds.map(() => '?').join(',');
    inspections = db.prepare(`SELECT * FROM inspections WHERE report_id IN (${placeholders}) ORDER BY created_at DESC`).all(...reportIds);
    actions = db.prepare(`SELECT * FROM actions WHERE report_id IN (${placeholders}) ORDER BY created_at DESC`).all(...reportIds);
    confirmations = db.prepare(`SELECT COUNT(*) c FROM confirmations WHERE report_id IN (${placeholders})`).get(...reportIds).c;
  }

  const resolved = reports.filter((r) => r.status === 'resolved').length;
  const active = reports.filter((r) => !['resolved', 'rejected'].includes(r.status)).length;

  res.json({
    water_body: wb,
    stats: { total_reports: reports.length, resolved, active, confirmations },
    reports, inspections, actions,
    eco_index: computeFoodWebIndex(inspections),
  });
});

// Authority: water-body history PDF (environmental monitoring summary)
router.get('/:id/pdf', authRequired, requireRole('authority'), (req, res) => {
  const wb = db.prepare('SELECT * FROM water_bodies WHERE id = ?').get(req.params.id);
  if (!wb) return res.status(404).json({ error: 'Water body not found.' });
  const reports = db.prepare('SELECT id, report_code, status, created_at FROM reports WHERE water_body_id = ? ORDER BY created_at DESC').all(wb.id);
  const reportIds = reports.map((r) => r.id);
  let inspections = [], actions = [], confirmations = 0;
  if (reportIds.length) {
    const placeholders = reportIds.map(() => '?').join(',');
    inspections = db.prepare(`SELECT * FROM inspections WHERE report_id IN (${placeholders}) ORDER BY created_at DESC`).all(...reportIds);
    actions = db.prepare(`SELECT * FROM actions WHERE report_id IN (${placeholders}) ORDER BY created_at DESC`).all(...reportIds);
    confirmations = db.prepare(`SELECT COUNT(*) c FROM confirmations WHERE report_id IN (${placeholders})`).get(...reportIds).c;
  }
  const resolved = reports.filter((r) => r.status === 'resolved').length;
  const active = reports.filter((r) => !['resolved', 'rejected'].includes(r.status)).length;
  waterBodyHistoryPdf({
    res, waterBody: wb,
    stats: { total_reports: reports.length, resolved, active, confirmations },
    reports, inspections, actions,
    ecoIndex: computeFoodWebIndex(inspections),
  });
});

module.exports = router;
