/**
 * Renders the public K Digital page (and robots.txt / sitemap.xml) from the content JSON.
 * Pure function of (content, options): used by api/page.js on Vercel and by the local dev server / tests.
 * All content strings are HTML-escaped here; the content never contains HTML.
 */
'use strict';

const { iconSrc, safeUrl, imageSrcOk } = require('./schema');

const e = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Headings: Plus Jakarta Sans 800 sets commas loosely, so they get a tiny negative margin (see .cm in styles.css).
const hx = (s) => e(s).replace(/, /g, '<span class="cm">,</span> ');
const jsonForScript = (o, indent) => JSON.stringify(o, null, indent).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const svg = (paths, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
const I = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};
const WA_SVG = '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3C9.0 3 3.27 8.7 3.27 15.73c0 2.24.59 4.43 1.71 6.36L3.17 29l7.1-1.86a12.8 12.8 0 0 0 5.77 1.4h.01c7.03 0 12.76-5.71 12.76-12.74 0-3.4-1.33-6.6-3.74-9A12.7 12.7 0 0 0 16.04 3Zm0 23.36h-.01c-1.9 0-3.77-.51-5.4-1.48l-.39-.23-4.21 1.1 1.12-4.1-.25-.42a10.56 10.56 0 0 1-1.62-5.6c0-5.85 4.77-10.6 10.64-10.6 2.84 0 5.5 1.1 7.52 3.12a10.5 10.5 0 0 1 3.11 7.5c0 5.85-4.77 10.6-10.51 10.6Zm5.83-7.94c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.9-1.78-2.21-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.14 3.08 1.3 3.3c.16.2 2.25 3.43 5.45 4.81.76.33 1.36.53 1.82.67.77.24 1.46.21 2 .13.62-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z"/></svg>';

const NAV = [['home', 'Home'], ['about', 'About'], ['services', 'Services'], ['process', 'Process'], ['clients', 'Clients'], ['faq', 'FAQ'], ['contact', 'Contact']];

function ctx(c, opts) {
  const k = c.contact;
  const origin = (c.seo.siteUrl || (opts && opts.origin) || 'https://www.kdigital.example').replace(/\/+$/, '') + '/';
  return {
    origin,
    tel: 'tel:' + k.phone,
    wa: 'https://wa.me/' + k.whatsapp,
    mail: 'mailto:' + k.email,
    abs: (src) => (/^https?:\/\//.test(src) ? src : origin + String(src).replace(/^\/+/, '')),
  };
}

/** Replace {phone} / {email} tokens in an (escaped) lead paragraph with links. */
function withTokens(text, c, x) {
  return e(text)
    .replace(/\{phone\}/g, `<a href="${e(x.tel)}">${e(c.contact.phoneDisplay)}</a>`)
    .replace(/\{email\}/g, `<a href="${e(x.mail)}">${e(c.contact.email)}</a>`);
}
const plainTokens = (text, c) => String(text || '').replace(/\{phone\}/g, c.contact.phoneDisplay).replace(/\{email\}/g, c.contact.email);

function scaled(img, h) { return { w: Math.max(1, Math.round(h * img.w / img.h)), h }; }

function logoImg(c, h, srcsetMode, extra = '') {
  const L = c.brand.logo;
  const d = scaled(L, h);
  let srcset = '';
  if (L.src2x) srcset = srcsetMode === 'hub' ? ` srcset="${e(L.src)} 1x, ${e(L.src2x)} 2x"` : ` srcset="${e(L.src)} 2x, ${e(L.src2x)} 3x"`;
  return `<img${extra} src="${e(L.src)}"${srcset} alt="" width="${d.w}" height="${d.h}" decoding="async">`;
}

function brandLink(c, cls = 'brand') {
  return `<a class="${cls}" href="#home" aria-label="${e(c.brand.name)}, back to top">${logoImg(c, 44, 'std', ' class="brand-icon"')}<span class="brand-name">${e(c.brand.name)}</span></a>`;
}

function tile(icon, cls, px, lazy = true) {
  return `<span class="${cls} icon-tile"><img src="${e(iconSrc(icon))}" alt="" width="${px}" height="${px}"${lazy ? ' loading="lazy"' : ''} decoding="async"></span>`;
}

function clientLogo(cl, extraCls) {
  if (cl.logo && imageSrcOk(cl.logo.src)) {
    const { src, w, h } = cl.logo;
    return `<img src="${e(src)}" alt="${e(cl.name)} logo" width="${w}" height="${h}" style="--w:${w}px;--h:${h}px" loading="lazy" decoding="async">`;
  }
  const l1 = cl.wordmark1 || cl.name;
  const l2 = cl.wordmark1 ? cl.wordmark2 : '';
  return `<span class="wordmark-tile${extraCls || ''}" role="img" aria-label="${e(cl.name)}"><span class="wm-1">${e(l1)}</span>${l2 ? `<span class="wm-2">${e(l2)}</span>` : ''}</span>`;
}

function linkInfo(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  if (host.endsWith('instagram.com')) {
    let handle = '';
    try { handle = new URL(url).pathname.replace(/\/+$/, '').split('/').pop(); } catch (_) { handle = ''; }
    return { label: 'Instagram', icon: I.instagram, sr: handle ? `: @${handle}` : '' };
  }
  if (host.endsWith('facebook.com')) return { label: 'Facebook', icon: I.globe, sr: '' };
  if (host.endsWith('linkedin.com')) return { label: 'LinkedIn', icon: I.globe, sr: '' };
  if (host.endsWith('youtube.com')) return { label: 'YouTube', icon: I.globe, sr: '' };
  return { label: 'Website', icon: I.globe, sr: `: ${host}` };
}

function marqueeItems(c, hidden) {
  const ti = hidden ? ' tabindex="-1"' : '';
  return c.clients.items.map((cl) => {
    const link = safeUrl(cl.link);
    const inner = clientLogo(cl);
    if (!link || !(cl.logo && imageSrcOk(cl.logo.src))) return `<li class="logo-tile">${inner}</li>`;
    const li = linkInfo(link);
    return `<li class="logo-tile"><a href="${e(link)}" target="_blank" rel="noopener noreferrer"${ti} aria-label="${e(cl.name)} on ${e(li.label)} (opens in a new tab)">${inner}</a></li>`;
  }).join('');
}

function clientCards(c) {
  return c.clients.items.map((cl) => {
    const link = safeUrl(cl.link);
    const li = link && linkInfo(link);
    const hasLogo = cl.logo && imageSrcOk(cl.logo.src);
    return `<article class="client-card reveal">
  <div class="client-logo">${hasLogo ? clientLogo(cl) : clientLogo(cl, ' wordmark-tile--card')}</div>
  ${cl.industry ? `<p class="client-ind">${e(cl.industry)}</p>` : ''}
  <h3>${e(cl.name)}</h3>
  ${cl.detail ? `<p class="client-det">${e(cl.detail)}</p>` : ''}
  ${li ? `<a class="client-link" href="${e(link)}" target="_blank" rel="noopener noreferrer">${svg(li.icon, 'ico ico-sm')}${e(li.label)}<span class="sr-only">${e(li.sr)} (opens in a new tab)</span>${svg(I.ext, 'ico ico-xs')}</a>` : ''}
</article>`;
  }).join('\n');
}

function jsonld(c, x) {
  const k = c.contact;
  const id = x.origin;
  const biz = {
    '@type': 'ProfessionalService', '@id': id + '#business', name: c.brand.name, alternateName: c.brand.shortName,
    slogan: c.brand.tagline, description: c.seo.businessDescription || c.seo.description, url: id,
    logo: id + 'android-chrome-512x512.png', image: x.abs(c.seo.ogImage.src),
    telephone: k.phone, email: k.email,
    address: { '@type': 'PostalAddress', addressLocality: k.city, addressRegion: k.region, addressCountry: 'IN' },
  };
  if (k.days && k.days.length && k.opens && k.closes) {
    biz.openingHoursSpecification = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: k.days, opens: k.opens, closes: k.closes }];
  }
  if (k.areasServed && k.areasServed.length) biz.areaServed = k.areasServed.map((n) => ({ '@type': 'State', name: n }));
  biz.contactPoint = [{ '@type': 'ContactPoint', telephone: k.phone, email: k.email, contactType: 'customer service', areaServed: 'IN', availableLanguage: ['en'] }];
  biz.hasOfferCatalog = { '@type': 'OfferCatalog', name: 'Digital marketing services',
    itemListElement: c.services.items.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, description: s.text } })) };
  const site = { '@type': 'WebSite', '@id': id + '#website', url: id, name: c.brand.name, alternateName: c.brand.shortName,
    publisher: { '@id': id + '#business' }, inLanguage: 'en-IN' };
  const graph = [biz, site];
  if (c.faq.items.length) {
    graph.push({ '@type': 'FAQPage', '@id': id + '#faq',
      mainEntity: c.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph }, 1);
}

function renderPage(c, opts) {
  const x = ctx(c, opts);
  const k = c.contact;
  const nav = NAV.map(([a, t]) => `<li><a href="#${a}">${t}</a></li>`).join('');
  const badge = (() => {
    const b = c.hero.badge || '';
    const i = b.lastIndexOf(', ');
    return i > 0 ? `${e(b.slice(0, i))}<span class="eyebrow-extra">${e(b.slice(i))}</span>` : e(b);
  })();
  const n = c.hero.ring.length;
  const ring = c.hero.ring.map((r, i) => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const px = (50 + 37.5 * Math.cos(ang)).toFixed(2), py = (50 + 37.5 * Math.sin(ang)).toFixed(2);
    return `<li class="orbit-item" style="--x:${px}%;--y:${py}%"><span class="orbit-tile icon-tile"><img src="${e(iconSrc(r.icon))}" alt="" width="44" height="44" decoding="async"></span><span class="orbit-label">${e(r.label)}</span></li>`;
  }).join('');
  const stats = c.stats.map((s) => `<li class="stat"><span class="stat-num">${e(s.value)}</span><span class="stat-label">${e(s.label)}</span></li>`).join('\n');
  const why = c.why.items.map((w, i) => `<article class="why-card${i === 0 ? ' why-card--lead' : ''} reveal">
  ${tile(w.icon, 'why-ico', i === 0 ? 44 : 40)}
  <h3>${e(w.title)}</h3>
  <p>${e(w.text)}</p>
</article>`).join('\n');
  const aboutCards = c.about.cards.map((m) => `<div class="mp-card reveal">
        ${tile(m.icon, 'mp-ico', 40)}
        <h3>${e(m.title)}</h3>
        <p>${e(m.text)}</p>
      </div>`).join('\n      ');
  const services = c.services.items.map((s) => `<article class="svc-card reveal">
  <span class="svc-ico icon-tile"><img src="${e(iconSrc(s.icon))}" alt="" width="49" height="49" loading="lazy" decoding="async"></span>
  <h3>${e(s.name)}</h3>
  <p>${e(s.text)}</p>
</article>`).join('\n');
  const steps = c.process.steps.map((s, i) => `<li class="step reveal">
  <span class="step-mark">${tile(s.icon, 'step-ico', 34)}<span class="step-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></span>
  <h3><span class="sr-only">Step ${i + 1}: </span>${e(s.title)}</h3>
  <p>${e(s.text)}</p>
</li>`).join('\n');
  const faqs = c.faq.items.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}>
  <summary><h3>${e(f.q)}</h3><span class="faq-icon" aria-hidden="true"></span></summary>
  <div class="faq-a"><p>${e(f.a)}</p></div>
</details>`).join('\n');
  const svcOpts = c.services.items.map((s) => `<option>${e(s.name)}</option>`).join('');
  const footerSvcs = c.services.items.slice(0, 6).map((s) => `<li><a href="#services">${e(s.name.split(' (')[0])}</a></li>`).join('');
  const config = { whatsapp: k.whatsapp, phone: k.phone, phoneDisplay: k.phoneDisplay, email: k.email, greeting: k.whatsappGreeting, brand: c.brand.name };
  const og = c.seo.ogImage;
  const contactRows = [
    `<li>${tile('c-phone', 'ci-ico', 28)}<div><span class="ci-label">Phone</span><a href="${e(x.tel)}">${e(k.phoneDisplay)}</a></div></li>`,
    k.whatsapp && `<li>${tile('c-whatsapp', 'ci-ico', 28)}<div><span class="ci-label">WhatsApp</span><a href="${e(x.wa)}" target="_blank" rel="noopener noreferrer">${e(k.phoneDisplay)}<span class="sr-only"> on WhatsApp (opens in a new tab)</span></a></div></li>`,
    k.email && `<li>${tile('c-email', 'ci-ico', 28)}<div><span class="ci-label">Email</span><a href="${e(x.mail)}">${e(k.email)}</a></div></li>`,
    k.location && `<li>${tile('c-location', 'ci-ico', 28)}<div><span class="ci-label">Location</span><span>${e(k.location)}</span></div></li>`,
    k.hours && `<li>${tile('c-hours', 'ci-ico', 28)}<div><span class="ci-label">Working hours</span><span>${e(k.hours)}</span></div></li>`,
  ].filter(Boolean).join('\n        ');
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(c.seo.title)}</title>
<meta name="description" content="${e(c.seo.description)}">
${c.seo.keywords ? `<meta name="keywords" content="${e(c.seo.keywords)}">\n` : ''}<meta name="author" content="${e(c.brand.name)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#114979">
<meta name="geo.region" content="IN-TG">
<meta name="geo.placename" content="${e(k.city)}">
<link rel="canonical" href="${e(x.origin)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_IN">
<meta property="og:site_name" content="${e(c.brand.name)}">
<meta property="og:title" content="${e(c.seo.title)}">
<meta property="og:description" content="${e(c.seo.description)}">
<meta property="og:url" content="${e(x.origin)}">
<meta property="og:image" content="${e(x.abs(og.src))}">
<meta property="og:image:width" content="${og.w}">
<meta property="og:image:height" content="${og.h}">
<meta property="og:image:alt" content="${e(c.seo.ogImageAlt || c.brand.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(c.seo.title)}">
<meta name="twitter:description" content="${e(c.seo.description)}">
<meta name="twitter:image" content="${e(x.abs(og.src))}">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<!-- Plus Jakarta Sans + Poppins (Google Fonts, OFL) self-hosted as latin woff2 subsets with font-display: swap -->
<link rel="preload" href="assets/fonts/plus-jakarta-sans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/poppins-700-wordmark.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">
${jsonld(c, x)}
</script>
<script type="application/json" id="kd-config">${jsonForScript(config)}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header" id="top">
  <div class="container header-inner">
    ${brandLink(c)}
    <nav class="nav" id="site-nav" aria-label="Main">
      <ul class="nav-list">${nav}</ul>
      <a class="btn btn-primary btn-sm nav-cta" href="#contact">${e(c.hero.ctaLabel)}</a>
    </nav>
    <div class="header-actions">
      <a class="icon-btn" href="${e(x.tel)}" aria-label="Call ${e(k.phoneDisplay)}">${svg(I.phone)}</a>
      <button class="icon-btn menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
        <span class="i-open">${svg(I.menu)}</span><span class="i-close">${svg(I.close)}</span>
      </button>
    </div>
  </div>
</header>

<main id="main">

<section class="hero" id="home" aria-labelledby="hero-title">
  <div class="container hero-grid">
    <div class="hero-copy">
      ${badge ? `<p class="eyebrow"><span>${badge}</span></p>` : ''}
      <h1 id="hero-title">${hx(c.hero.titleStart)}${c.hero.titleHighlight ? ` <span class="grad-text">${hx(c.hero.titleHighlight)}</span>` : ''}</h1>
      <p class="lead">${withTokens(c.hero.lead, c, x)}</p>
      <div class="hero-ctas">
        <a class="btn btn-primary btn-lg" href="#contact">${e(c.hero.ctaLabel)} ${svg(I.arrow, 'ico ico-sm')}</a>
        <a class="btn btn-ghost btn-lg" href="${e(x.tel)}">${svg(I.phone, 'ico ico-sm')}Call ${e(k.phoneDisplay)}</a>
      </div>
    </div>
    <!-- Icons: platform logos are trademarks of their owners (Meta, Google, LinkedIn, YouTube), shown to indicate the services offered.
         Other 3D icons: Microsoft Fluent UI Emoji 3D (MIT), re-toned to brand colours; see assets/icons3d/LICENSE-fluentui-emoji.txt -->
    <div class="hero-visual">
      <span class="orbit-ring orbit-ring--outer" aria-hidden="true"></span>
      <span class="orbit-ring orbit-ring--inner" aria-hidden="true"></span>
      <span class="orbit-hub" aria-hidden="true">${logoImg(c, 70, 'hub')}</span>
      <ul class="orbit" aria-label="Services handled by one team">${ring}</ul>
    </div>
  </div>
</section>

<section class="stats-band" aria-label="${e(c.brand.shortName)} at a glance">
  <div class="container">
    <ul class="stats" style="--n:${Math.max(1, c.stats.length)}">${stats}</ul>
  </div>
</section>

<section class="section" id="why" aria-labelledby="why-title">
  <div class="container why-grid">
    <div class="section-head why-head reveal">
      ${c.why.kicker ? `<p class="kicker">${e(c.why.kicker)}</p>` : ''}
      <h2 id="why-title">${hx(c.why.title)}</h2>
      ${c.why.lead ? `<p class="section-lead">${withTokens(c.why.lead, c, x)}</p>` : ''}
    </div>
    ${why}
  </div>
</section>

<section class="section section-soft" id="about" aria-labelledby="about-title">
  <div class="container about-grid">
    <div class="about-copy reveal">
      ${c.about.kicker ? `<p class="kicker">${e(c.about.kicker)}</p>` : ''}
      <h2 id="about-title">${hx(c.about.title)}</h2>
      ${c.about.paragraphs.map((p) => `<p>${withTokens(p, c, x)}</p>`).join('\n      ')}
    </div>
    <div class="about-cards">
      ${aboutCards}
    </div>
  </div>
</section>

<section class="section" id="services" aria-labelledby="services-title">
  <div class="container">
    <div class="section-head center reveal">
      <h2 id="services-title">${hx(c.services.title)}</h2>
      ${c.services.lead ? `<p class="section-lead">${withTokens(c.services.lead, c, x)}</p>` : ''}
    </div>
    <div class="svc-grid">
${services}
      <article class="svc-card svc-cta reveal">
        <h3>${e(c.services.ctaTitle)}</h3>
        <p>${e(c.services.ctaText)}</p>
        <a class="btn btn-light" href="#contact">${e(c.services.ctaButton)} ${svg(I.arrow, 'ico ico-sm')}</a>
      </article>
    </div>
  </div>
</section>

<section class="section section-soft" id="process" aria-labelledby="process-title">
  <div class="container">
    <div class="section-head center reveal">
      ${c.process.kicker ? `<p class="kicker">${e(c.process.kicker)}</p>` : ''}
      <h2 id="process-title">${hx(c.process.title)}</h2>
      ${c.process.lead ? `<p class="section-lead">${withTokens(c.process.lead, c, x)}</p>` : ''}
    </div>
    <ol class="steps" style="--n:${Math.max(1, c.process.steps.length)}">
${steps}
    </ol>
  </div>
</section>

<section class="section" id="clients" aria-labelledby="clients-title">
  <div class="container">
    <div class="section-head center reveal">
      <h2 id="clients-title">${hx(c.clients.title)}</h2>
      ${c.clients.lead ? `<p class="section-lead">${withTokens(c.clients.lead, c, x)}</p>` : ''}
    </div>
  </div>
  ${c.clients.items.length ? `<div class="marquee" role="region" aria-label="Client logos">
    <ul class="marquee-group">${marqueeItems(c, false)}</ul>
    <ul class="marquee-group" aria-hidden="true">${marqueeItems(c, true)}</ul>
  </div>
  <div class="container">
    <div class="client-grid">
${clientCards(c)}
    </div>
  </div>` : ''}
</section>

<section class="section section-soft" id="faq" aria-labelledby="faq-title">
  <div class="container faq-grid">
    <div class="section-head reveal">
      <h2 id="faq-title">${hx(c.faq.title)}</h2>
      ${c.faq.lead ? `<p class="section-lead">${withTokens(c.faq.lead, c, x)}</p>` : ''}
    </div>
    <div class="faq-list">
${faqs}
    </div>
  </div>
</section>

<section class="section" id="contact" aria-labelledby="contact-title">
  <div class="container contact-grid">
    <div class="contact-info reveal">
      ${c.contactSection.kicker ? `<p class="kicker">${e(c.contactSection.kicker)}</p>` : ''}
      <h2 id="contact-title">${hx(c.contactSection.title)}</h2>
      ${c.contactSection.lead ? `<p class="section-lead">${withTokens(c.contactSection.lead, c, x)}</p>` : ''}
      <ul class="contact-list">
        ${contactRows}
      </ul>
      <div class="contact-ctas">
        <a class="btn btn-wa" href="${e(x.wa)}" target="_blank" rel="noopener noreferrer">${WA_SVG}Chat on WhatsApp</a>
        <a class="btn btn-ghost" href="${e(x.tel)}">${svg(I.phone, 'ico ico-sm')}Call now</a>
      </div>
    </div>
    <form class="contact-form reveal" id="contact-form" novalidate>
      <div class="field">
        <label for="f-name">Name</label>
        <input id="f-name" name="name" type="text" autocomplete="name" required placeholder="Your name">
      </div>
      <div class="field">
        <label for="f-phone">Phone</label>
        <input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+91 98765 43210">
      </div>
      <div class="field">
        <label for="f-business">Business type</label>
        <input id="f-business" name="business" type="text" placeholder="e.g. Boutique, clinic, shop">
      </div>
      <div class="field">
        <label for="f-service">Service needed</label>
        <select id="f-service" name="service">
          <option value="">Select a service</option>${svcOpts}
          <option>Not sure yet</option>
        </select>
      </div>
      <div class="field field-full">
        <label for="f-message">Message</label>
        <textarea id="f-message" name="message" rows="4" placeholder="Tell us about your goals"></textarea>
      </div>
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="field-full form-actions">
        <button class="btn btn-primary btn-lg" type="submit">${WA_SVG}Send on WhatsApp</button>
        <p class="form-note">Opens WhatsApp with your details filled in. Prefer email? <a id="mailto-link" href="${e(x.mail)}?subject=Free%20consultation%20request">Email ${e(k.email)}</a></p>
      </div>
      <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>

</main>

<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      ${brandLink(c, 'brand brand-footer')}
      <p class="tagline">${e(c.brand.tagline)}</p>
      <p class="footer-about">${e(c.footer.about)}</p>
    </div>
    <nav class="footer-col" aria-label="Footer">
      <h2 class="footer-h">Company</h2>
      <ul>${NAV.slice(1).map(([a, t]) => `<li><a href="#${a}">${t}</a></li>`).join('')}</ul>
    </nav>
    <div class="footer-col">
      <h2 class="footer-h">Services</h2>
      <ul>${footerSvcs}<li><a href="#services">View all services</a></li></ul>
    </div>
    <div class="footer-col">
      <h2 class="footer-h">Get in touch</h2>
      <ul>
        ${k.city ? `<li>${e(k.city)}${k.region ? ` (${e(k.region)})` : ''}</li>` : ''}
        <li><a href="${e(x.tel)}">${e(k.phoneDisplay)}</a></li>
        ${k.email ? `<li><a href="${e(x.mail)}">${e(k.email)}</a></li>` : ''}
        ${k.hours ? `<li>${e(k.hours)}</li>` : ''}
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <span id="year">${year}</span> ${e(c.brand.name)}. All rights reserved.</p>
    <p>${e(c.brand.tagline)}</p>
  </div>
</footer>

<div class="fab-stack">
  <a class="wa-float" href="${e(x.wa)}" target="_blank" rel="noopener noreferrer" aria-label="Chat with ${e(c.brand.name)} on WhatsApp">${WA_SVG}</a>
  <button class="chat-launcher" type="button" aria-expanded="false" aria-controls="kd-chat" aria-haspopup="dialog" aria-label="Ask the ${e(c.brand.shortName)} assistant" data-endpoint="/api/chat">
    <span class="chat-launcher-avatar">${logoImg(c, 30, 'none')}</span>
    <span class="chat-launcher-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg></span>
  </button>
</div>

<script src="main.js" defer></script>
</body>
</html>
`;
}

function renderRobots(c, opts) {
  const x = ctx(c, opts);
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${x.origin}sitemap.xml\n`;
}

function renderSitemap(c, opts) {
  const x = ctx(c, opts);
  const lastmod = (c.updatedAt ? new Date(c.updatedAt) : new Date()).toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${e(x.origin)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

module.exports = { renderPage, renderRobots, renderSitemap, plainTokens, escapeHtml: e };
