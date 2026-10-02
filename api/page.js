/**
 * Public page: GET / (rewritten here by vercel.json), plus /robots.txt and /sitemap.xml.
 * Renders the HTML from the latest published content (Vercel Blob) or the bundled defaults.
 * The CDN caches the result (tag "kd-page") and publishing in /admin purges that tag, so edits go live
 * within seconds while visitors normally get a cached, static-speed response.
 */
'use strict';

const { getLiveContent, PAGE_CACHE_TAG, DEFAULTS } = require('./_lib/store');
const { renderPage, renderRobots, renderSitemap } = require('./_lib/render');
const { repair } = require('./_lib/schema');
const { query, requestOrigin } = require('./_lib/http');

function routeOf(req) {
  const q = query(req);
  if (q.r === 'robots' || q.r === 'sitemap') return q.r;
  const p = String(req.url || '').split('?')[0];
  if (p.endsWith('/robots.txt')) return 'robots';
  if (p.endsWith('/sitemap.xml')) return 'sitemap';
  return 'page';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end('Method not allowed');
  }
  const route = routeOf(req);
  const opts = { origin: requestOrigin(req) };
  let live;
  let body;
  try {
    live = await getLiveContent();
    body = route === 'robots' ? renderRobots(live.content, opts) : route === 'sitemap' ? renderSitemap(live.content, opts) : renderPage(live.content, opts);
  } catch (e) {
    console.error('[page] render failed, using defaults:', e && e.message);
    live = { ok: false };
    const d = repair(DEFAULTS, DEFAULTS);
    body = route === 'robots' ? renderRobots(d, opts) : route === 'sitemap' ? renderSitemap(d, opts) : renderPage(d, opts);
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', route === 'robots' ? 'text/plain; charset=utf-8' : route === 'sitemap' ? 'application/xml; charset=utf-8' : 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');          // browsers always re-check
  res.setHeader('Vercel-CDN-Cache-Control', live.ok ? 'max-age=86400, stale-while-revalidate=604800' : 'max-age=30');
  res.setHeader('Vercel-Cache-Tag', PAGE_CACHE_TAG);
  res.setHeader('X-Content-Source', live.source || 'default');
  res.end(req.method === 'HEAD' ? undefined : body);
};
