/**
 * Content schema: single source of truth for (1) server-side validation of published content and
 * (2) the admin dashboard forms (sent to the browser by GET /api/admin?action=content).
 * Content is plain text only (no HTML); the renderer escapes everything.
 */
'use strict';

const SVC_ICONS = {
  social: 'Social media (Instagram + Facebook)', meta: 'Meta', google: 'Google Ads', linkedin: 'LinkedIn', youtube: 'YouTube',
  seo: 'SEO chart', logo: 'Pen (logo design)', analytics: 'Google Analytics', gbp: 'Google Business Profile',
  video: 'Clapper (video)', web: 'Laptop (website)',
};
const SEC_ICONS = {
  'why-agency': 'Toolbox', 'why-local': 'World map', 'why-results': 'Bullseye', 'why-reports': 'Clipboard', 'why-price': 'Price tag',
  'about-mission': 'Compass', 'about-promise': 'Handshake', 'step-discover': 'Magnifier', 'step-strategy': 'Chess pawn',
  'step-create': 'Palette', 'step-launch': 'Rocket', 'step-optimize': 'Bar chart', 'c-phone': 'Phone', 'c-whatsapp': 'WhatsApp',
  'c-email': 'Envelope', 'c-location': 'Location pin', 'c-hours': 'Alarm clock',
};
const ICON_CHOICES = Object.entries(SVC_ICONS).map(([v, l]) => ({ value: v, label: l, src: `assets/icons3d/${v}.webp` }))
  .concat(Object.entries(SEC_ICONS).map(([v, l]) => ({ value: v, label: l, src: `assets/icons3d/sec/${v}.webp` })));
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const BLOB_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9._\/-]+\.(webp|png|jpe?g)$/;
const ASSET_RE = /^assets\/[A-Za-z0-9@._\/-]+\.(webp|png|jpe?g)$/;
const DEV_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/__blob\/[A-Za-z0-9._\/-]+\.(webp|png|jpe?g)$/;

function imageSrcOk(src) {
  if (typeof src !== 'string' || src.length > 400 || src.includes('..')) return false;
  if (ASSET_RE.test(src) || BLOB_RE.test(src)) return true;
  return process.env.KD_DEV_BLOB === '1' && DEV_RE.test(src); // local dev server only
}
function iconSrc(icon) {
  if (Object.prototype.hasOwnProperty.call(SEC_ICONS, icon)) return `assets/icons3d/sec/${icon}.webp`;
  if (Object.prototype.hasOwnProperty.call(SVC_ICONS, icon)) return `assets/icons3d/${icon}.webp`;
  if (imageSrcOk(icon)) return icon;
  return 'assets/icons3d/sec/why-agency.webp';
}
function safeUrl(u) {
  if (typeof u !== 'string' || !u) return '';
  try { const p = new URL(u); return (p.protocol === 'https:' || p.protocol === 'http:') ? p.toString() : ''; } catch (_) { return ''; }
}

/* ------------------------------------------------------------------ field builders */
const T = (label, max, o) => Object.assign({ type: 'text', label, max }, o);
const A = (label, max, o) => Object.assign({ type: 'textarea', label, max }, o);
const ICON = (label, o) => Object.assign({ type: 'icon', label: label || 'Icon' }, o);
const IMG = (label, kind, o) => Object.assign({ type: 'image', label, kind }, o);
const LIST = (label, fields, o) => Object.assign({ type: 'list', label, fields }, o);
const G = (label, fields, o) => Object.assign({ type: 'group', label, fields }, o);
const TOKENS = 'You can write {phone} or {email} to insert a link.';

// Image kinds: client-side resize targets (the browser converts uploads to WebP before sending).
const IMAGE_KINDS = {
  logo: { maxW: 330, maxH: 330, label: 'Logo' },
  client: { maxW: 480, maxH: 240, label: 'Client logo' },
  og: { maxW: 1200, maxH: 630, crop: true, label: 'Social share image (1200 x 630)' },
  icon: { maxW: 112, maxH: 112, square: true, label: 'Icon' },
};

const FIELDS = {
  brand: G('Brand', {
    name: T('Business name', 60, { required: true }),
    shortName: T('Short name', 40, { required: true }),
    tagline: T('Tagline', 120),
    logo: IMG('Logo (K icon, used in the header, hero and footer)', 'logo', { required: true, help: 'Square-ish PNG, JPG, WebP or SVG with a transparent background works best. Max 2 MB.' }),
  }),
  seo: G('Search engines (SEO) and social sharing', {
    siteUrl: { type: 'url', label: 'Website address', max: 200, help: 'For example https://www.your-domain.com. Leave empty to use the current domain.' },
    title: T('Page title (shown in Google)', 80, { required: true, help: 'Aim for 50 to 60 characters.' }),
    description: A('Meta description (shown in Google)', 220, { required: true, help: 'Aim for 140 to 160 characters.' }),
    keywords: A('Keywords (comma-separated)', 400),
    businessDescription: A('Business description (structured data for Google)', 700),
    ogImage: IMG('Social share image', 'og', { required: true, help: 'Shown when the site is shared on WhatsApp, Facebook, LinkedIn. 1200 x 630.' }),
    ogImageAlt: T('Social share image description', 160),
  }),
  contact: G('Contact details (used everywhere on the site and by the chat assistant)', {
    phoneDisplay: T('Phone (as shown)', 30, { required: true }),
    phone: { type: 'tel', label: 'Phone (for the call button, international format)', max: 20, required: true, help: 'For example +919912360547' },
    whatsapp: { type: 'digits', label: 'WhatsApp number (digits only, with country code)', max: 15, required: true, help: 'For example 919912360547' },
    whatsappGreeting: T('First line of WhatsApp messages from the contact form', 200),
    email: { type: 'email', label: 'Email', max: 120, required: true },
    location: T('Location (as shown)', 80),
    city: T('City', 60, { required: true }),
    region: T('State', 60),
    hours: T('Working hours (as shown)', 80),
    days: { type: 'days', label: 'Open days (for Google)' },
    opens: { type: 'time', label: 'Opens at (24h, for Google)' },
    closes: { type: 'time', label: 'Closes at (24h, for Google)' },
    areasServed: { type: 'strings', label: 'Areas served', max: 10, itemMax: 60 },
  }),
  hero: G('Hero (top of the page)', {
    badge: T('Small badge above the headline', 80),
    titleStart: T('Headline', 80, { required: true }),
    titleHighlight: T('Headline: highlighted last words', 40),
    lead: A('Intro paragraph', 400, { required: true, help: TOKENS }),
    ctaLabel: T('Main button label', 40, { required: true }),
    ring: LIST('Icons around the logo', { icon: ICON('Icon', { required: true }), label: T('Label', 40, { required: true }) },
      { min: 3, max: 10, itemLabel: 'label', newItem: { icon: 'seo', label: 'New service' } }),
  }),
  stats: LIST('Figures band', { value: T('Figure', 16, { required: true }), label: T('Label', 50, { required: true }) },
    { min: 0, max: 6, itemLabel: 'value', newItem: { value: '', label: '' }, help: 'Only use figures you can stand behind.' }),
  why: G('Why choose us', {
    kicker: T('Small label', 60), title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }),
    items: LIST('Reasons', { icon: ICON(), title: T('Title', 80, { required: true }), text: A('Text', 300) },
      { min: 1, max: 9, itemLabel: 'title', newItem: { icon: 'why-results', title: '', text: '' }, help: 'The first reason is shown as the large navy card.' }),
  }),
  about: G('About', {
    kicker: T('Small label', 60), title: T('Heading', 120, { required: true }),
    paragraphs: { type: 'strings', label: 'Paragraphs', max: 4, itemMax: 800, multiline: true },
    cards: LIST('Cards (mission, promise...)', { icon: ICON(), title: T('Title', 60, { required: true }), text: A('Text', 300) },
      { min: 0, max: 4, itemLabel: 'title', newItem: { icon: 'about-mission', title: '', text: '' } }),
  }),
  services: G('Services', {
    title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }),
    items: LIST('Services', { icon: ICON(), name: T('Name', 90, { required: true }), text: A('Description', 500) },
      { min: 1, max: 20, itemLabel: 'name', newItem: { icon: 'seo', name: '', text: '' }, help: 'The first 6 also appear in the footer. All appear in the contact form menu.' }),
    ctaTitle: T('Last card: title', 80), ctaText: A('Last card: text', 300), ctaButton: T('Last card: button label', 40),
  }),
  process: G('How we work', {
    kicker: T('Small label', 60), title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }),
    steps: LIST('Steps (numbered automatically)', { icon: ICON(), title: T('Title', 60, { required: true }), text: A('Text', 300) },
      { min: 1, max: 8, itemLabel: 'title', newItem: { icon: 'step-launch', title: '', text: '' } }),
  }),
  clients: G('Clients', {
    title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }),
    items: LIST('Clients', {
      name: T('Business name', 80, { required: true }), industry: T('Industry label', 40), detail: A('What they do', 200),
      logo: IMG('Logo', 'client', { help: 'Without a logo, a text logo is shown using the two lines below.' }),
      link: { type: 'url', label: 'Link (Instagram or website)', max: 300 },
      wordmark1: T('Text logo: line 1', 40), wordmark2: T('Text logo: line 2', 40),
    }, { min: 0, max: 20, itemLabel: 'name', newItem: { name: '', industry: '', detail: '', logo: null, link: '', wordmark1: '', wordmark2: '' } }),
  }),
  faq: G('FAQ', {
    title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }),
    items: LIST('Questions', { q: T('Question', 200, { required: true }), a: A('Answer', 1200, { required: true }) },
      { min: 0, max: 30, itemLabel: 'q', newItem: { q: '', a: '' } }),
  }),
  contactSection: G('Contact section', { kicker: T('Small label', 60), title: T('Heading', 120, { required: true }), lead: A('Intro', 400, { help: TOKENS }) }),
  footer: G('Footer', { about: A('Short description', 400) }),
};

const SECTIONS = [
  { id: 'brand', label: 'Brand & SEO', keys: ['brand', 'seo'] },
  { id: 'contact', label: 'Contact details', keys: ['contact', 'contactSection'] },
  { id: 'hero', label: 'Hero & figures', keys: ['hero', 'stats'] },
  { id: 'why', label: 'Why choose us', keys: ['why'] },
  { id: 'about', label: 'About', keys: ['about'] },
  { id: 'services', label: 'Services', keys: ['services'] },
  { id: 'process', label: 'How we work', keys: ['process'] },
  { id: 'clients', label: 'Clients', keys: ['clients'] },
  { id: 'faq', label: 'FAQ', keys: ['faq'] },
  { id: 'footer', label: 'Footer', keys: ['footer'] },
];

/* ------------------------------------------------------------------ normalize / validate */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Walks `input` against the schema. strict=true: collect errors (publish). strict=false: silently repair with
 * the fallback (reading stored content, so a bad or older document can never break the live page).
 */
function walk(def, input, fallback, path, errors, strict) {
  const err = (msg) => { errors.push({ path: path.join('.'), message: msg }); };
  const label = def.label || path[path.length - 1];
  switch (def.type) {
    case 'group': {
      const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const fb = fallback && typeof fallback === 'object' ? fallback : {};
      const out = {};
      for (const [k, d] of Object.entries(def.fields)) {
        const has = Object.prototype.hasOwnProperty.call(src, k);
        out[k] = walk(d, has ? src[k] : fb[k], fb[k], path.concat(k), errors, strict && has);
        if (strict && !has && d.required) err(`${d.label || k}: missing`);
      }
      return out;
    }
    case 'list': {
      if (!Array.isArray(input)) { if (strict) err(`${label}: expected a list`); return Array.isArray(fallback) ? walk(def, fallback, [], path, [], false) : []; }
      let arr = input;
      if (arr.length > (def.max || 50)) { if (strict) err(`${label}: at most ${def.max} items`); arr = arr.slice(0, def.max || 50); }
      if (arr.length < (def.min || 0)) { if (strict) err(`${label}: at least ${def.min} items`); else if (Array.isArray(fallback) && fallback.length >= (def.min || 0)) return walk(def, fallback, [], path, [], false); }
      const item = { type: 'group', fields: def.fields };
      return arr.map((v, i) => walk(item, v, def.newItem || {}, path.concat(String(i)), errors, strict));
    }
    case 'strings': {
      const arr = Array.isArray(input) ? input : (Array.isArray(fallback) ? fallback : []);
      const out = arr.slice(0, def.max || 20).map((s) => String(s == null ? '' : s).replace(CTRL, '').trim())
        .filter(Boolean).map((s) => { if (s.length > def.itemMax) { if (strict) err(`${label}: an item is longer than ${def.itemMax} characters`); return s.slice(0, def.itemMax); } return s; });
      if (strict && Array.isArray(input) && input.length > (def.max || 20)) err(`${label}: at most ${def.max} items`);
      return out;
    }
    case 'days': {
      const arr = Array.isArray(input) ? input : (Array.isArray(fallback) ? fallback : []);
      return DAYS.filter((d) => arr.includes(d));
    }
    case 'image': {
      if (input === null || input === undefined || input === '' || (input && input.src === '')) {
        if (def.required) { if (strict) err(`${label}: required`); return fallback || null; }
        return null;
      }
      const ok = input && typeof input === 'object' && imageSrcOk(input.src) &&
        Number.isInteger(input.w) && Number.isInteger(input.h) && input.w > 0 && input.h > 0 && input.w <= 4096 && input.h <= 4096 &&
        (input.src2x === undefined || input.src2x === null || input.src2x === '' || imageSrcOk(input.src2x));
      if (!ok) { if (strict) err(`${label}: invalid image`); return fallback && fallback.src ? fallback : null; }
      const out = { src: input.src, w: input.w, h: input.h };
      if (input.src2x) out.src2x = input.src2x;
      return out;
    }
    case 'icon': {
      const v = typeof input === 'string' ? input.trim() : '';
      if (SEC_ICONS[v] || SVC_ICONS[v] || imageSrcOk(v)) return v;
      if (strict && (v || def.required)) err(`${label}: choose an icon`);
      return typeof fallback === 'string' && fallback ? fallback : 'why-agency';
    }
    default: { // text-like
      let v = input === null || input === undefined ? '' : String(input);
      v = v.replace(CTRL, '').replace(/\r\n?/g, '\n');
      if (def.type !== 'textarea') v = v.replace(/\n/g, ' ');
      v = v.trim();
      const fb = typeof fallback === 'string' ? fallback : '';
      if (!v) { if (def.required) { if (strict) err(`${label}: required`); return fb; } return ''; }
      if (v.length > def.max) { if (strict) err(`${label}: at most ${def.max} characters`); v = v.slice(0, def.max); }
      if (def.type === 'url') { const u = safeUrl(v); if (!u) { if (strict) err(`${label}: enter a full web address starting with https://`); return ''; } return u.length <= def.max ? u : ''; }
      if (def.type === 'email' && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) { if (strict) err(`${label}: enter a valid email address, like name@example.com`); return fb; }
      if (def.type === 'tel') { const t = v.replace(/[\s()-]/g, ''); if (!/^\+?[0-9]{6,15}$/.test(t)) { if (strict) err(`${label}: enter a valid phone number, like +91 99123 60547`); return fb; } return t; }
      if (def.type === 'digits') { const t = v.replace(/[\s+()-]/g, ''); if (!/^[0-9]{8,15}$/.test(t)) { if (strict) err(`${label}: digits only, with country code`); return fb; } return t; }
      if (def.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { if (strict) err(`${label}: use HH:MM (24h)`); return fb; }
      return v;
    }
  }
}

const ROOT = { type: 'group', fields: FIELDS };

/** Strict validation for publishing. Returns { value, errors }. */
function validate(input, defaults) {
  const errors = [];
  const value = walk(ROOT, input, defaults, [], errors, true);
  return { value, errors };
}
/** Lenient repair for reading stored content (never throws, fills gaps from defaults). */
function repair(input, defaults) {
  const value = walk(ROOT, input, defaults, [], [], false);
  if (input && typeof input === 'object') {
    if (typeof input.updatedAt === 'string') value.updatedAt = input.updatedAt;
    if (Number.isInteger(input.rev)) value.rev = input.rev;
  }
  value.schemaVersion = 1;
  return value;
}

/** Schema for the admin UI (labels, limits, choices); no functions inside. */
function publicSchema() {
  return { fields: FIELDS, sections: SECTIONS, icons: ICON_CHOICES, imageKinds: IMAGE_KINDS, days: DAYS };
}

module.exports = { validate, repair, publicSchema, imageSrcOk, iconSrc, safeUrl, FIELDS, SECTIONS, IMAGE_KINDS };
