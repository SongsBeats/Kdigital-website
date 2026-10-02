# K Digital World: website + website editor (/admin)

- Deployable project: `site/` (Vercel, no build step). The home page, robots.txt and sitemap.xml are rendered by a Vercel Function (`site/api/page.js`) from one JSON content document; the owner edits that content at `/admin`.
- Content: built-in defaults in `site/api/_lib/default-content.json`; published edits live in Vercel Blob. Field definitions and validation: `site/api/_lib/schema.js`. HTML renderer: `site/api/_lib/render.js`.
- Functions: `site/api/page.js` (public page), `site/api/admin.js` (editor API), `site/api/chat.js` (AI chat). Hand-written front end: `site/styles.css`, `site/main.js`, `site/chat.js` + `site/chat.css`, `site/admin/*`.
- Generators (not needed at runtime): `tools/process_logos.py`, `tools/make_assets.py`, icon scripts, and `tools/build_site.py` (now only writes `404.html` and `manifest.webmanifest`).
- Brand source: `brand/kdigital-logo-full.jpeg` (client logo).

## TODO before going live
1. Set the real domain: /admin → **Brand & SEO → Website address** (used for canonical, og:url, og:image, JSON-LD, robots.txt and sitemap.xml). If it is empty, the address the page was requested on is used.
2. Client logos are installed (real files from the client doc, processed by `tools/process_logos.py` into `site/assets/logos/*.webp`, mapping: image1=Star Pest Control, image2=Chennai Pigeon Nets, image3=Moni Sahasra Collections, image4=vgrow.ai). Client logos can now be added, replaced or removed in /admin → **Clients** (upload a PNG, JPG, WebP or SVG).
3. A higher-resolution or vector version of the K icon would make the header icon and app icons sharper. The current icon is upscaled from the 69x60 px icon area of the 469x112 JPEG.

## Icons (hero ring, services cards and section icons)
- Platform services use the platforms' official brand marks in their official colours: Instagram + Facebook (Social media), Meta (Meta Ads), Google Ads, Google Business Profile (the blue storefront with awning), LinkedIn, YouTube, Google Analytics.
  Source: the official logo SVG files as published on Wikimedia Commons (`brand/platform/*.svg`: Instagram_logo_2016.svg, 2023_Facebook_icon.svg, Meta_Platforms_Inc._logo_(cropped).svg, Google_Ads_logo.svg, Logo_Google_Analytics.svg, Google_Maps_icon_(2020).svg, LinkedIn_icon.svg, YouTube_full-color_icon_(2017).svg). Google Business Profile has no logo file on Commons, so it uses Google's own official product icon from Google's branding CDN (`brand/platform/gbp.png`, 1024x1024, https://www.gstatic.com/images/branding/product/2x/google_my_business_512dp.png), official colours unchanged. Wordmarks were cropped off Google Ads / Analytics; marks are not recoloured, only given a thin extruded edge + soft top gloss (`tools/render_svgs.py`, `tools/make_platform_icons.py`).
  **Trademark note:** Meta, Facebook, Instagram, Google Ads, Google Business Profile, Google Analytics, LinkedIn and YouTube logos are trademarks of their respective owners (Meta Platforms, Inc.; Google LLC; LinkedIn Corporation). They are used only to indicate the platforms on which K Digital World provides services and do not imply endorsement. Check each platform's brand guidelines before using them in ads/print.
- SEO, Logo design, AI videos and Website design use Microsoft Fluent UI Emoji 3D renders (MIT License, (c) Microsoft; sources in `brand/fluent3d/`, licence copied to `site/assets/icons3d/LICENSE-fluentui-emoji.txt`), re-toned to the brand palette (`tools/make_3d_icons.py`).
- All icons sit on a shared glossy 3D tile drawn in CSS (`.icon-tile`). Regenerate: `python tools/render_svgs.py && python tools/make_3d_icons.py brand 152 && python tools/make_platform_icons.py`.
- Section icons (Why choose K Digital, About, How we work, Contact) are also Fluent UI Emoji 3D renders (MIT), re-toned to brand navy and blue-purple and exported as 112px WebP to `site/assets/icons3d/sec/`: toolbox, world map, bullseye, clipboard, price tag (Why); compass, handshake (About); magnifier, chess pawn, palette, rocket, bar chart (process steps); telephone receiver, envelope, pushpin, alarm clock (Contact). The Contact WhatsApp icon is the official WhatsApp logo in its own colours (Wikimedia Commons `WhatsApp.svg`, public domain; WhatsApp is a trademark of Meta Platforms, Inc.). Regenerate: `python tools/make_section_icons.py`.

## AI chat assistant (Google Gemini)
- Floating chat launcher (bottom-right, below the WhatsApp button). `site/chat.js` and `site/chat.css` are lazy-loaded by `main.js` only when a visitor hovers, focuses or taps the launcher, so they don't affect page-load scores.
- The browser only talks to `/api/chat`. The Gemini key stays on the server in `site/api/chat.js` (a Vercel Node serverless function, CommonJS, no dependencies, plain `fetch` to the Gemini `generateContent` REST API). **Never put the key in any front-end file.**
- The bot is grounded only in the site's facts (services, process, FAQ, clients, contact details, mission/promise). It replies in the visitor's language (English/Telugu/Hindi), never invents prices or guarantees, and points leads to WhatsApp, a call or the contact form. Its instructions are built from the same content document as the page (`buildSystemInstruction` in `site/api/chat.js`), so after you publish in /admin the bot knows the new services, FAQs, clients and contact details within about a minute.
- Safeguards: POST only; same-origin check; last 10 messages, 1,000 characters per message and 6,000 in total; in-memory per-IP rate limit (10/minute, 60/hour per warm instance); friendly JSON errors. When the API is unavailable, the widget shows WhatsApp and call buttons.
- Models: `GEMINI_MODEL` (default `gemini-3.8-flash`). On 429/503 the main model is retried once with a short backoff, then each model in `GEMINI_FALLBACK_MODELS` is tried in order (default `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-latest`). Every attempt is capped at 9 s and all attempts together at 25 s. `vercel.json` gives the function `maxDuration: 30`. Note: `gemini-2.5-flash` and `gemini-2.0-flash` return 404 for new API keys, so they are not in the default list.
- Local test: `GEMINI_API_KEY=your-key node tools/dev_server.js 8090` serves `site/` and routes `/api/chat`. Add `CHAT_MOCK=1` for a fake reply without a key, or `CHAT_MOCK=fail` to see the fallback. Unit tests with a mocked fetch: `node tests/chat.test.js`. UI tests and screenshots: `python tools/chat_shots.py`.

## Deploy on Vercel
1. Vercel → **Add New… → Project** → import the repository (or run `vercel` inside `site/`). If the repo contains more than the site, set **Root Directory** to `site`.
2. Framework Preset: **Other**. Build Command: leave empty (no build). Output Directory: leave as default. Install Command: default (Vercel runs `npm install` for the two dependencies in `package.json`: `@vercel/blob` and `@vercel/functions`).
3. Set up the website editor and the chat as described in **Website editor (/admin): owner setup** below, then deploy.
4. `.vercelignore` stops local `.env` files, `node_modules` and this README from being uploaded; `.gitignore` keeps `.env` files out of git.

## Website editor (/admin): owner setup
One-time steps in the Vercel dashboard (about 5 minutes):
1. **Create the storage.** Project → **Storage** → **Create Database** → **Blob** → access **Public** → create, then **Connect** it to this project (Production and Preview). Vercel adds the store credentials to the project automatically; you do not copy any token.
2. **Add environment variables.** Project → **Settings → Environment Variables** (Production, plus Preview if wanted):
   - `ADMIN_PASSWORD`: the editor password, at least 10 characters (a long passphrase is best).
   - `ADMIN_SESSION_SECRET`: at least 32 random characters, e.g. the output of `openssl rand -hex 32`.
   - `GEMINI_API_KEY`: the Google Gemini key for the chat assistant (optional: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`).
3. **Deploy** (or **Redeploy** the latest deployment), because new variables and storage only apply to new deployments.
4. Open `https://<your-domain>/admin`, sign in with `ADMIN_PASSWORD`, and set **Brand & SEO → Website address** to the real domain. Press **Publish changes**.

Before step 1 the public site still works and shows the built-in content; the editor shows a notice that storage is not connected and cannot publish. Before step 2 the login page explains which variables are missing.

### Using the editor
- Sections: Brand & SEO (logo, page title, description, social share image, website address), Contact details, Hero & figures (headline, ring icons, stats), Why choose us, About, Services (11, with icons), How we work (steps), Clients (logos and links), FAQ, Footer. Lists can be added to, removed and reordered with the arrows.
- Nothing changes on the live site until you press **Publish changes**. Edits are also kept on this device as a draft, so a closed tab or an expired session does not lose work.
- **Version history** keeps the last 10 published versions; **Restore** publishes an older one again as a new version.
- Images: PNG, JPG, WebP or SVG up to 10 MB are accepted in the browser, which resizes them (logo up to 330 px, client logo up to 480 × 240, social share image cropped to 1200 × 630, service icon 112 × 112) and converts them to WebP before upload. SVGs are turned into a picture in the browser, so no SVG code is ever stored or served. The server re-checks every upload (real PNG/JPEG/WebP bytes only, max 2 MB, max 4096 px).
- The FAQ answers are also published as FAQ structured data for Google, and the AI chat assistant uses the same content, so both stay in sync automatically.

### How it works (architecture)
- `/` is rewritten (vercel.json) to `api/page.js`, which renders the full HTML from the content JSON on the server, so every word, the JSON-LD (ProfessionalService with address, hours and service catalogue, plus FAQPage) and the meta tags are in the HTML at first paint (crawlable, no client-side rendering). `/robots.txt` and `/sitemap.xml` are rendered the same way.
- The rendered page is cached on Vercel's CDN (`Vercel-CDN-Cache-Control: max-age=86400, stale-while-revalidate=604800`, cache tag `kd-page`); browsers always revalidate. Publishing or restoring purges the `kd-page` tag, so the live site shows changes within seconds while normal visits are served from the CDN.
- Storage: each publish writes a new immutable JSON file `content/versions/…json` to Vercel Blob (newest sorts first; only the newest 10 are kept). Images go to `uploads/…`. If Blob is not connected or is unreachable, the page falls back to the last good copy, then to the built-in defaults, so the site never breaks.
- Security: the password is compared in constant time; the session is a signed (HMAC-SHA256 with `ADMIN_SESSION_SECRET`) HttpOnly, Secure, SameSite=Strict cookie valid for 8 hours; every write also needs a CSRF token header, a same-origin request and a JSON body; failed logins are rate limited (5 per 15 minutes and 30 per day per IP, plus a global cap) with a short delay; `/admin` and `/api/admin` send `noindex` and `no-store`, `/admin` has a strict Content-Security-Policy, and robots.txt disallows `/admin` and `/api/`. Content is validated against a schema on the server and everything is HTML-escaped when rendered.

### Limitations
- The login rate limit is kept in memory per server instance, so it slows guessing but is not a global lockout. Use a long password.
- Signing out clears the cookie in that browser. To sign out every device at once, change `ADMIN_SESSION_SECRET` (or the password) and redeploy.
- Old uploaded images are not deleted automatically when replaced (they are small WebP files). They can be removed in Vercel → Storage → Blob if wanted.
- One editor at a time is assumed. If two people publish from different tabs, the second one is told to reload instead of overwriting.

### Local development and tests
```bash
cd site && npm install && cd ..
# public page + editor with a filesystem Blob mock (stored in /tmp/kd-blob), fake chat replies:
KD_DEV_BLOB=1 KD_BLOB_DIR=/tmp/kd-blob CHAT_MOCK=1 ADMIN_PASSWORD='choose-a-long-password' \
  ADMIN_SESSION_SECRET="$(openssl rand -hex 32)" node tools/dev_server.js 8095
# then open http://localhost:8095/ and http://localhost:8095/admin

node tests/unit.test.js     # schema validation, image checks, renderer escaping, chat prompt builder
node tests/admin.test.js    # API: login, rate limit, cookies, CSRF, uploads, publish, live page, versions, restore
node tests/chat.test.js     # chat function with a mocked Gemini API
ADMIN_PASSWORD='same-as-server' BASE=http://localhost:8095 python tools/admin_e2e.py   # browser test + admin screenshots
```
`tools/dev_server.js` mirrors vercel.json (rewrites, redirects, headers) and mounts the three functions. Use `vercel dev` inside `site/` to test against a real Blob store (after `vercel env pull`).
