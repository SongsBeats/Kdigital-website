'use strict';

function send(res, status, payload, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (headers) for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(payload));
}
function fail(res, status, code, message, extra, headers) {
  send(res, status, Object.assign({ error: code, message }, extra || {}), headers);
}

/** Read the raw request body (stream first; Vercel's lazy req.body getter only as a fallback). */
async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  if (!req.readableEnded) {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(chunk);
    }
  }
  if (size === 0 && req.body !== undefined && req.body !== null) {
    const b = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    if (b.length > limit) throw Object.assign(new Error('too large'), { status: 413 });
    return b;
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit) {
  const buf = await readRaw(req, limit);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (_) { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

function query(req) {
  const out = {};
  try { new URL(req.url, 'http://local').searchParams.forEach((v, k) => { out[k] = v; }); } catch (_) { /* ignore */ }
  if (req.query && typeof req.query === 'object') for (const k of Object.keys(req.query)) if (out[k] === undefined) out[k] = String(req.query[k]);
  return out;
}

function clientIp(req) {
  const h = req.headers || {};
  const xff = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(h['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function requestHost(req) {
  const h = req.headers || {};
  return String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
}
function requestOrigin(req) {
  const h = req.headers || {};
  const proto = String(h['x-forwarded-proto'] || '').split(',')[0].trim() || (requestHost(req).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${requestHost(req)}`;
}
/** Browsers send Origin on cross-site POSTs; requests from other sites are refused. */
function sameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === requestHost(req); } catch (_) { return false; }
}

module.exports = { send, fail, readRaw, readJson, query, clientIp, requestHost, requestOrigin, sameOrigin };
