// config.js — central configuration, all secrets from environment variables
require('dotenv').config();

function required(name, fallbackDev) {
  const v = process.env[name];
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}. Set it in your .env file.`);
    }
    return fallbackDev;
  }
  return v;
}

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  JWT_EXPIRES_IN: '8h',
  COOKIE_NAME: 'hs_session',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Shared secret handed out by the administrator to genuine officials. Required (in production)
  // in addition to the email domain, because a domain check alone can't prove ownership of an email.
  AUTHORITY_INVITE_CODE: process.env.AUTHORITY_INVITE_CODE || '',
  AUTHORITY_EMAIL_DOMAIN: (process.env.AUTHORITY_EMAIL_DOMAIN || 'krct.ac.in').toLowerCase(),
  REPORT_CODE_PREFIX: process.env.REPORT_CODE_PREFIX || 'TRI',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_UPLOAD_MB: 12,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  // Free alternative to Anthropic: a Google Gemini key from https://aistudio.google.com/apikey (no card needed).
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // Comma-separated list; the first model that exists is used (Google renames models over time).
  GEMINI_MODELS: (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.8-flash,gemini-2.5-flash,gemini-2.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean),
  GEMINI_API_URL: (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, ''),
  ANTHROPIC_API_URL: (process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'HydroSense <no-reply@hydrosense.local>',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
};
