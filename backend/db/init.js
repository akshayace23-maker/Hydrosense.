// db/init.js — schema setup for NeerCare/HydroSense (better-sqlite3)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hydrosense.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('citizen','authority')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS water_bodies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  lat REAL, lng REAL,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code TEXT NOT NULL UNIQUE,
  citizen_id INTEGER NOT NULL REFERENCES users(id),
  water_body_id INTEGER REFERENCES water_bodies(id),
  water_body_name_raw TEXT,
  water_body_type TEXT,
  lat REAL, lng REAL, address TEXT,
  gps_source TEXT DEFAULT 'unavailable',
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  observed_issues TEXT NOT NULL DEFAULT '[]',
  additional_notes TEXT,
  ai_relevance TEXT DEFAULT 'unchecked',
  ai_indicators TEXT DEFAULT '[]',
  ai_followup TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'evidence',
  captured_at TEXT,
  gps_lat REAL, gps_lng REAL, gps_source TEXT DEFAULT 'unavailable',
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  status TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, user_id)
);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  inspector_id INTEGER NOT NULL REFERENCES users(id),
  inspection_date TEXT NOT NULL,
  observed_condition TEXT,
  visible_pollution INTEGER DEFAULT 0,
  sewage_inflow INTEGER DEFAULT 0,
  solid_waste INTEGER DEFAULT 0,
  aquatic_vegetation INTEGER DEFAULT 0,
  fish_condition TEXT,
  odour TEXT,
  water_appearance TEXT,
  additional_findings TEXT,
  recommended_intervention TEXT,
  fish_mortality_observed INTEGER DEFAULT 0,
  invasive_plants_observed INTEGER DEFAULT 0,
  biodiversity_reduced_observed INTEGER DEFAULT 0,
  habitat_disturbance_observed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  action_taken TEXT NOT NULL,
  action_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  water_body_id INTEGER REFERENCES water_bodies(id),
  summary TEXT NOT NULL,
  photo_filename TEXT,
  status TEXT DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Security / audit events (logins, lockouts, password changes). Never stores passwords.
CREATE TABLE IF NOT EXISTS security_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit trail kept after an authority deletes a report (no citizen identity stored).
CREATE TABLE IF NOT EXISTS report_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code TEXT NOT NULL,
  deleted_by INTEGER REFERENCES users(id),
  reason TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_water_body ON reports(water_body_id);
CREATE INDEX IF NOT EXISTS idx_reports_citizen ON reports(citizen_id);
CREATE INDEX IF NOT EXISTS idx_photos_report ON report_photos(report_id);
CREATE INDEX IF NOT EXISTS idx_updates_report ON report_updates(report_id);
`);

// Lightweight migration: session-revocation counter (bumping it logs out every device).
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes('token_version')) db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
if (!userCols.includes('password_changed_at')) db.exec('ALTER TABLE users ADD COLUMN password_changed_at TEXT');

module.exports = db;
