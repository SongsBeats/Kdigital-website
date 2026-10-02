/**
 * Admin authentication: one password (ADMIN_PASSWORD) and a stateless signed session cookie.
 *   cookie  kd_admin = v1.<expires-ms>.<nonce>.<hmac>   HttpOnly; Secure; SameSite=Strict; Path=/; 8 hours
 *   hmac    HMAC-SHA256(ADMIN_SESSION_SECRET, "v1.<exp>.<nonce>.<password fingerprint>")
 * Changing ADMIN_PASSWORD or ADMIN_SESSION_SECRET signs everyone out. CSRF: every write must send the
 * X-CSRF-Token header (HMAC of the session nonce), JSON content type and a same-origin Origin.
 */
'use strict';

const crypto = require('crypto');

const COOKIE = 'kd_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_LIMITS = [{ windowMs: 15 * 60 * 1000, max: 5 }, { windowMs: 24 * 60 * 60 * 1000, max: 30 }];
const GLOBAL_LIMIT = { windowMs: 15 * 60 * 1000, max: 50 };   // all IPs together, per instance
const MIN_PASSWORD = 10;
const MIN_SECRET = 32;

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s, 'utf8').digest();

function config() {
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  const problems = [];
  if (password.length < MIN_PASSWORD) problems.push(`ADMIN_PASSWORD must be set (at least ${MIN_PASSWORD} characters)`);
  if (secret.length < MIN_SECRET) problems.push(`ADMIN_SESSION_SECRET must be set (at least ${MIN_SECRET} random characters)`);
  return { ok: problems.length === 0, problems, password, secret };
}

/** Constant-time comparison (hash both sides so lengths always match). */
function passwordMatches(given, expected) {
  return crypto.timingSafeEqual(sha256(given), sha256(expected)) && expected.length > 0;
}

function sign(cfg, exp, nonce) {
  const fp = b64u(sha256('pw:' + cfg.password)).slice(0, 16);
  return b64u(hmac(cfg.secret, `v1.${exp}.${nonce}.${fp}`));
}
function csrfFor(cfg, nonce) { return b64u(hmac(cfg.secret, 'csrf.' + nonce)); }

function issue(cfg, now) {
  const exp = (now || Date.now()) + SESSION_MS;
  const nonce = b64u(crypto.randomBytes(18));
  return { value: `v1.${exp}.${nonce}.${sign(cfg, exp, nonce)}`, exp, csrf: csrfFor(cfg, nonce) };
}

function parseCookies(req) {
  const out = {};
  String((req.headers && req.headers.cookie) || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

/** Returns { exp, nonce, csrf } for a valid session, else null. */
function verify(req, cfg) {
  if (!cfg.ok) return null;
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const good = Buffer.from(sign(cfg, parts[1], parts[2]));
  const got = Buffer.from(parts[3]);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  return { exp, nonce: parts[2], csrf: csrfFor(cfg, parts[2]) };
}

function csrfOk(req, session) {
  const got = Buffer.from(String((req.headers && req.headers['x-csrf-token']) || ''));
  const want = Buffer.from(session.csrf);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function cookieHeader(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

/* ---------------------------------------------------- login rate limiting (per warm instance) */
const attempts = new Map(); // ip -> [timestamps of failed attempts]
let globalFails = [];
function loginBlocked(ip, now) {
  const longest = Math.max(...LOGIN_LIMITS.map((l) => l.windowMs));
  const list = (attempts.get(ip) || []).filter((t) => now - t < longest);
  attempts.set(ip, list);
  globalFails = globalFails.filter((t) => now - t < GLOBAL_LIMIT.windowMs);
  for (const l of LOGIN_LIMITS) {
    const inWin = list.filter((t) => now - t < l.windowMs);
    if (inWin.length >= l.max) return Math.ceil((inWin[0] + l.windowMs - now) / 1000);
  }
  if (globalFails.length >= GLOBAL_LIMIT.max) return Math.ceil((globalFails[0] + GLOBAL_LIMIT.windowMs - now) / 1000);
  return 0;
}
function recordFailure(ip, now) {
  const list = attempts.get(ip) || [];
  list.push(now);
  attempts.set(ip, list);
  globalFails.push(now);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (!v.length || now - v[v.length - 1] > 86400000) attempts.delete(k);
}
function clearFailures(ip) { attempts.delete(ip); }

module.exports = {
  config, passwordMatches, issue, verify, csrfOk, cookieHeader, loginBlocked, recordFailure, clearFailures,
  SESSION_MS, COOKIE, _reset() { attempts.clear(); globalFails = []; },
};
