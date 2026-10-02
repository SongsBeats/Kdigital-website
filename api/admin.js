/**
 * Admin API (single function, action in the query string):
 *   GET  ?action=session            -> { authenticated, csrf, configured, storage }
 *   POST ?action=login   {password} -> sets the session cookie
 *   POST ?action=logout
 *   GET  ?action=content            -> { content, rev, updatedAt, source, schema }
 *   POST ?action=publish {content, baseRev}
 *   POST ?action=upload&kind=logo|client|og|icon   body: image bytes (WebP/PNG/JPEG, max 2 MB)
 *   GET  ?action=versions
 *   POST ?action=restore {id, baseRev}
 *   POST ?action=purge              -> refresh the CDN copy of the public page
 * Every write needs a valid session cookie, the X-CSRF-Token header and a same-origin request.
 */
'use strict';

const auth = require('./_lib/auth');
const store = require('./_lib/store');
const { publicSchema } = require('./_lib/schema');
const { send, fail, readJson, readRaw, query, clientIp, sameOrigin } = require('./_lib/http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isJson = (req) => /^application\/json\b/i.test(String(req.headers['content-type'] || ''));
const IMAGE_TYPES = /^image\/(webp|png|jpeg)$/i;

async function login(req, res, cfg) {
  if (!isJson(req)) return fail(res, 415, 'bad_type', 'Expected JSON.');
  const ip = clientIp(req);
  const wait = auth.loginBlocked(ip, Date.now());
  if (wait) return fail(res, 429, 'rate_limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, null, { 'Retry-After': String(wait) });
  const body = await readJson(req, 4096);
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
  if (!password || !auth.passwordMatches(password, cfg.password)) {
    auth.recordFailure(ip, Date.now());
    await sleep(400 + Math.floor(Math.random() * 300)); // slows down guessing
    return fail(res, 401, 'wrong_password', 'That password is not correct.');
  }
  auth.clearFailures(ip);
  const s = auth.issue(cfg);
  return send(res, 200, { ok: true, csrf: s.csrf, expiresAt: new Date(s.exp).toISOString() },
    { 'Set-Cookie': auth.cookieHeader(s.value, Math.floor(auth.SESSION_MS / 1000)) });
}

module.exports = async function handler(req, res) {
  const action = query(req).action || '';
  const method = req.method;
  try {
    const cfg = auth.config();
    if (method === 'POST' && !sameOrigin(req)) return fail(res, 403, 'forbidden', 'Cross-site request refused.');

    if (action === 'session' && method === 'GET') {
      const s = auth.verify(req, cfg);
      return send(res, 200, {
        authenticated: Boolean(s), csrf: s ? s.csrf : null, expiresAt: s ? new Date(s.exp).toISOString() : null,
        configured: cfg.ok, problems: cfg.ok ? [] : cfg.problems, storage: store.isConfigured(),
      });
    }
    if (action === 'login' && method === 'POST') {
      if (!cfg.ok) return fail(res, 503, 'not_configured', 'The admin is not set up yet: ' + cfg.problems.join('; ') + '.');
      return await login(req, res, cfg);
    }
    if (action === 'logout' && method === 'POST') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', 0) });
    }

    // Everything below needs a valid session.
    const session = auth.verify(req, cfg);
    if (!session) return fail(res, 401, 'unauthorized', 'Please sign in again.');
    if (method === 'POST' && !auth.csrfOk(req, session)) return fail(res, 403, 'csrf', 'Security check failed. Reload the page and try again.');

    if (action === 'content' && method === 'GET') {
      const live = await store.getLiveContent();
      return send(res, 200, { content: live.content, rev: live.rev, updatedAt: live.updatedAt, source: live.source,
        storage: store.isConfigured(), schema: publicSchema(), maxVersions: store.MAX_VERSIONS });
    }
    if (action === 'publish' && method === 'POST') {
      if (!isJson(req)) return fail(res, 415, 'bad_type', 'Expected JSON.');
      const body = await readJson(req, 512 * 1024);
      const r = await store.publish(body.content, { baseRev: body.baseRev });
      return send(res, 200, Object.assign({ ok: true }, r));
    }
    if (action === 'upload' && method === 'POST') {
      if (!IMAGE_TYPES.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'unsupported', 'Please upload a PNG, JPG or WebP image.');
      const len = Number(req.headers['content-length'] || 0);
      if (len > store.MAX_IMAGE_BYTES) return fail(res, 413, 'too_large', 'Images must be 2 MB or smaller.');
      const buf = await readRaw(req, store.MAX_IMAGE_BYTES);
      const r = await store.saveImage(buf, query(req).kind);
      return send(res, 200, Object.assign({ ok: true }, r));
    }
    if (action === 'versions' && method === 'GET') {
      return send(res, 200, { versions: await store.versions(), max: store.MAX_VERSIONS });
    }
    if (action === 'restore' && method === 'POST') {
      if (!isJson(req)) return fail(res, 415, 'bad_type', 'Expected JSON.');
      const body = await readJson(req, 4096);
      const r = await store.restore(body.id, { baseRev: body.baseRev });
      return send(res, 200, Object.assign({ ok: true }, r));
    }
    if (action === 'purge' && method === 'POST') {
      return send(res, 200, { ok: true, purged: await store.purgePageCache() });
    }
    return fail(res, 404, 'not_found', 'Unknown action.');
  } catch (e) {
    if (e instanceof store.StoreError) return fail(res, e.status, e.code, e.message, e.details ? { details: e.details } : null);
    if (e && e.status === 413) return fail(res, 413, 'too_large', 'That request is too large.');
    if (e && e.status === 400) return fail(res, 400, 'bad_json', 'Invalid request.');
    console.error('[admin] error:', e && e.message);
    return fail(res, 500, 'server_error', 'Something went wrong. Please try again.');
  }
};
