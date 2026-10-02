/**
 * Content storage on Vercel Blob (public store).
 *
 *   content/versions/<inverted-ms>-<ms>.json   one immutable JSON document per publish (newest sorts first)
 *   uploads/<kind>-<ms>-<random>.<ext>         uploaded images (immutable, cached for a year)
 *
 * Every publish writes a NEW immutable version, so reads never hit a stale CDN copy (Blob caches overwritten
 * files for up to 60 s). The newest version is found with one list({ limit: 1 }) call. The last MAX_VERSIONS
 * versions are kept for "restore". Without a Blob store the site serves the bundled default content.
 */
'use strict';

const DEFAULTS = require('./default-content.json');
const { repair, validate } = require('./schema');

const PREFIX = 'content/versions/';
const MAX_VERSIONS = 10;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;
const PAGE_CACHE_TAG = 'kd-page';
const BIG = 9999999999999;

let blobModule = null;
function blob() {
  if (!blobModule) blobModule = require('@vercel/blob'); // the local dev server swaps in a filesystem mock
  return blobModule;
}
function isConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

const versionPath = (ms) => `${PREFIX}${String(BIG - ms).padStart(13, '0')}-${String(ms).padStart(13, '0')}.json`;
const VERSION_ID_RE = /^\d{13}-\d{13}$/;
function versionInfo(b) {
  const id = b.pathname.slice(PREFIX.length).replace(/\.json$/, '');
  const ms = Number(id.split('-')[1]);
  return { id, savedAt: new Date(ms).toISOString(), size: b.size, url: b.url };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('blob fetch ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function listVersions(limit) {
  const out = [];
  let cursor;
  do {
    const page = await blob().list({ prefix: PREFIX, limit: limit || 1000, cursor });
    out.push(...page.blobs);
    cursor = page.hasMore && !limit ? page.cursor : undefined;
  } while (cursor);
  out.sort((a, b) => (a.pathname < b.pathname ? -1 : 1)); // newest first
  return out;
}

let lastGood = null;      // last successfully read document (fallback if Blob is briefly unavailable)
let memo = null;          // { at, result } short-lived cache, only for callers that allow it (chat)

/**
 * Returns { content, source: 'default'|'blob'|'fallback', ok, rev, updatedAt }.
 * ok=false means Blob failed and the caller should cache briefly.
 */
async function getLiveContent(opts) {
  const maxAgeMs = (opts && opts.maxAgeMs) || 0;
  if (maxAgeMs && memo && Date.now() - memo.at < maxAgeMs) return memo.result;
  let result;
  if (!isConfigured()) {
    result = { content: repair(DEFAULTS, DEFAULTS), source: 'default', ok: true, rev: 0, updatedAt: null };
  } else {
    try {
      const [newest] = await listVersions(1);
      if (!newest) {
        result = { content: repair(DEFAULTS, DEFAULTS), source: 'default', ok: true, rev: 0, updatedAt: null };
      } else {
        const doc = await fetchJson(newest.url);
        const content = repair(doc, DEFAULTS);
        result = { content, source: 'blob', ok: true, rev: content.rev || 0, updatedAt: content.updatedAt || null, versionId: versionInfo(newest).id };
        lastGood = result;
      }
    } catch (e) {
      console.error('[store] read failed:', e && e.message);
      result = lastGood ? Object.assign({}, lastGood, { source: 'fallback', ok: false })
        : { content: repair(DEFAULTS, DEFAULTS), source: 'fallback', ok: false, rev: 0, updatedAt: null };
    }
  }
  memo = { at: Date.now(), result };
  return result;
}

async function purgePageCache() {
  try {
    const fns = require('@vercel/functions');
    try { await fns.dangerouslyDeleteByTag(PAGE_CACHE_TAG); } catch (_) { await fns.invalidateByTag(PAGE_CACHE_TAG); }
    return true;
  } catch (e) {
    console.error('[store] cache purge failed:', e && e.message);
    return false;
  }
}

class StoreError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

/** Validate and publish a new version. baseRev guards against two people overwriting each other. */
async function publish(input, opts) {
  if (!isConfigured()) throw new StoreError(503, 'storage_not_configured', 'Storage is not set up yet. Connect a Vercel Blob store to this project (see README), then redeploy.');
  const { value, errors } = validate(input, DEFAULTS);
  if (errors.length) throw new StoreError(400, 'invalid', 'Please fix the highlighted fields.', errors);
  const current = await getLiveContent();
  if (!current.ok) throw new StoreError(503, 'storage_unavailable', 'Storage is temporarily unavailable. Please try again in a minute.');
  if (opts && Number.isInteger(opts.baseRev) && opts.baseRev !== current.rev) {
    throw new StoreError(409, 'conflict', 'The site was changed somewhere else since you opened the editor. Reload to get the latest version, then re-apply your edits.');
  }
  const now = Date.now();
  const doc = Object.assign({ schemaVersion: 1 }, value, { rev: current.rev + 1, updatedAt: new Date(now).toISOString() });
  if (opts && opts.note) doc.note = String(opts.note).slice(0, 120);
  await blob().put(versionPath(now), JSON.stringify(doc), {
    access: 'public', contentType: 'application/json; charset=utf-8', addRandomSuffix: false, cacheControlMaxAge: 31536000,
  });
  memo = null;
  lastGood = { content: repair(doc, DEFAULTS), source: 'blob', ok: true, rev: doc.rev, updatedAt: doc.updatedAt };
  let pruned = 0;
  try {
    const all = await listVersions();
    const old = all.slice(MAX_VERSIONS);
    if (old.length) { await blob().del(old.map((b) => b.url)); pruned = old.length; }
  } catch (e) { console.error('[store] prune failed:', e && e.message); }
  const purged = await purgePageCache();
  return { rev: doc.rev, updatedAt: doc.updatedAt, pruned, purged };
}

async function versions() {
  if (!isConfigured()) return [];
  return (await listVersions()).slice(0, MAX_VERSIONS).map(versionInfo).map(({ url, ...v }) => v);
}

async function restore(id, opts) {
  if (!isConfigured()) throw new StoreError(503, 'storage_not_configured', 'Storage is not set up yet.');
  if (!VERSION_ID_RE.test(String(id || ''))) throw new StoreError(400, 'bad_version', 'Unknown version.');
  const all = await listVersions();
  const hit = all.find((b) => b.pathname === `${PREFIX}${id}.json`);
  if (!hit) throw new StoreError(404, 'not_found', 'That version no longer exists.');
  const doc = repair(await fetchJson(hit.url), DEFAULTS);
  return publish(doc, { baseRev: opts && opts.baseRev, note: 'Restored version from ' + versionInfo(hit).savedAt });
}

/* ------------------------------------------------------------------ images */

/** Sniff type + pixel size from the bytes (never trust the file name or Content-Type). */
function sniffImage(buf) {
  if (buf.length < 32) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'image/png', ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buf.length >= 30) return { type: 'image/webp', ext: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const b = buf.readUInt32LE(21);
      return { type: 'image/webp', ext: 'webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X' && buf.length >= 30) return { type: 'image/webp', ext: 'webp', w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { type: 'image/jpeg', ext: 'jpg', w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  return null; // SVG, GIF and everything else are rejected (the admin converts SVG to WebP in the browser)
}

const KINDS = new Set(['logo', 'client', 'og', 'icon']);
async function saveImage(buf, kind) {
  if (!isConfigured()) throw new StoreError(503, 'storage_not_configured', 'Storage is not set up yet, so images cannot be uploaded.');
  if (!KINDS.has(kind)) throw new StoreError(400, 'bad_kind', 'Unknown image type.');
  if (!buf || !buf.length) throw new StoreError(400, 'empty', 'The file is empty.');
  if (buf.length > MAX_IMAGE_BYTES) throw new StoreError(413, 'too_large', 'Images must be 2 MB or smaller.');
  const info = sniffImage(buf);
  if (!info) throw new StoreError(415, 'unsupported', 'Please upload a PNG, JPG or WebP image.');
  if (!info.w || !info.h || info.w > MAX_IMAGE_SIDE || info.h > MAX_IMAGE_SIDE) throw new StoreError(400, 'bad_size', 'Image dimensions must be at most 4096 x 4096 pixels.');
  const r = await blob().put(`uploads/${kind}-${Date.now()}.${info.ext}`, buf, {
    access: 'public', contentType: info.type, addRandomSuffix: true, cacheControlMaxAge: 31536000,
  });
  return { src: r.url, w: info.w, h: info.h, type: info.type, bytes: buf.length };
}

module.exports = {
  getLiveContent, publish, versions, restore, saveImage, sniffImage, isConfigured, purgePageCache,
  StoreError, DEFAULTS, PAGE_CACHE_TAG, MAX_VERSIONS, MAX_IMAGE_BYTES,
  _reset() { lastGood = null; memo = null; blobModule = null; },
};
