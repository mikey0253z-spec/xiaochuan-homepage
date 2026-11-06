'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const COOKIE_NAME = 'xc_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function loadSecret() {
  const fromEnv = (process.env.SESSION_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (saved) return saved;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const SECRET = loadSecret();

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createSession() {
  const expires = String(Date.now() + SESSION_TTL);
  return `${expires}.${sign(expires)}`;
}

function verifySession(token) {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  const expected = sign(expires);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return false;
  if (!crypto.timingSafeEqual(given, wanted)) return false;
  return Number(expires) > Date.now();
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  });
  return cookies;
}

function isAuthenticated(req) {
  return verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function setSession(res, secure) {
  res.cookie(COOKIE_NAME, createSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = { COOKIE_NAME, isAuthenticated, setSession, clearSession };
