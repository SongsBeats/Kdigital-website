/* K Digital World: AI chat assistant widget (lazy-loaded by main.js). No dependencies.
   Talks to /api/chat (Vercel serverless function holding the Gemini key). Never put API keys in this file. */
(function () {
  'use strict';
  if (window.KDChat) return;

  var CFG = {};
  try { CFG = JSON.parse((document.getElementById('kd-config') || {}).textContent || '{}'); } catch (e) { CFG = {}; }
  var WA = 'https://wa.me/' + (/^\d{8,15}$/.test(CFG.whatsapp || '') ? CFG.whatsapp : '919912360547');
  var TEL = 'tel:' + (/^\+?\d{6,15}$/.test(CFG.phone || '') ? CFG.phone : '+919912360547');
  var PHONE = CFG.phoneDisplay || '+91 99123 60547';
  var MAX_CHARS = 1000;
  var STORE = 'kdc-history-v1';
  var launcher = document.querySelector('.chat-launcher');
  var ENDPOINT = (launcher && launcher.getAttribute('data-endpoint')) || '/api/chat';
  var CHIPS = ['What services do you offer?', 'How soon will I see results?', 'Do you work with small businesses?', 'How do I contact you?'];
  var GREETING = "Hi, I'm the **K Digital assistant**. Ask me about our services, how we work or how to get started. " +
    'I can reply in English, తెలుగు or हिंदी.';
  var mqMobile = window.matchMedia('(max-width: 640px)');

  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE) || '[]').filter(function (m) { return m && typeof m.content === 'string'; }); } catch (e) { history = []; }
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(history.slice(-20))); } catch (e) {} }

  /* ---------- safe markdown: escape everything, then allow **bold**, [links](url), bare URLs and lists ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function linkHtml(label, href) {
    var raw = href.replace(/&amp;/g, '&');
    if (!/^(https?:\/\/|mailto:|tel:|#[\w-]+$)/i.test(raw)) return label;           // drops javascript:, data:, etc.
    var ext = /^https?:/i.test(raw);
    return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
  }
  function inline(text) {
    var tokens = [];
    var keep = function (html) { tokens.push(html); return '\u0000' + (tokens.length - 1) + '\u0000'; };
    var s = esc(text);
    s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, function (_, l, h) { return keep(linkHtml(l, h)); });
    s = s.replace(/\bhttps?:\/\/[^\s<\u0000]+[^\s<.,;:!?)\u0000]/g, function (u) { return keep(linkHtml(u, u)); });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return tokens[+i]; });
  }
  function md(text) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var out = [], para = [], list = null;
    var flushPara = function () { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    var flushList = function () { if (list) { out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; } };
    lines.forEach(function (line) {
      var t = line.trim(), m;
      if (!t) { flushPara(); flushList(); return; }
      if ((m = t.match(/^[-*•]\s+(.*)$/)) || (m = t.match(/^(\d{1,2})[.)]\s+(.*)$/))) {
        var tag = /^\d/.test(t) ? 'ol' : 'ul', item = m[m.length - 1];
        flushPara();
        if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
        list.items.push(item); return;
      }
      flushList();
      para.push(t.replace(/^#{1,6}\s+/, ''));
    });
    flushPara(); flushList();
    return out.join('');
  }

  /* ---------- DOM ---------- */
  var ICON = {
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h13M12 5l7 7-7 7"/></svg>',
    wa: '<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3C9.0 3 3.27 8.7 3.27 15.73c0 2.24.59 4.43 1.71 6.36L3.17 29l7.1-1.86a12.8 12.8 0 0 0 5.77 1.4h.01c7.03 0 12.76-5.71 12.76-12.74 0-3.4-1.33-6.6-3.74-9A12.7 12.7 0 0 0 16.04 3Zm0 23.36h-.01c-1.9 0-3.77-.51-5.4-1.48l-.39-.23-4.21 1.1 1.12-4.1-.25-.42a10.56 10.56 0 0 1-1.62-5.6c0-5.85 4.77-10.6 10.64-10.6 2.84 0 5.5 1.1 7.52 3.12a10.5 10.5 0 0 1 3.11 7.5c0 5.85-4.77 10.6-10.51 10.6Zm5.83-7.94c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.9-1.78-2.21-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.14 3.08 1.3 3.3c.16.2 2.25 3.43 5.45 4.81.76.33 1.36.53 1.82.67.77.24 1.46.21 2 .13.62-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>'
  };
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

  var panel = el('section', 'kdc');
  panel.id = 'kd-chat';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'kdc-title');
  panel.setAttribute('aria-describedby', 'kdc-sub');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML =
    '<header class="kdc-head">' +
      '<span class="kdc-avatar"><img src="assets/logo-icon.png" alt="" width="30" height="26"></span>' +
      '<div class="kdc-titles"><h2 id="kdc-title">K Digital Assistant</h2>' +
      '<p id="kdc-sub"><span class="kdc-dot" aria-hidden="true"></span>AI assistant · English, తెలుగు, हिंदी</p></div>' +
      '<a class="kdc-hbtn kdc-wa" href="' + WA + '" target="_blank" rel="noopener noreferrer" aria-label="Chat with a person on WhatsApp (opens in a new tab)">' + ICON.wa + '</a>' +
      '<button class="kdc-hbtn kdc-close" type="button" aria-label="Close chat">' + ICON.close + '</button>' +
    '</header>' +
    '<div class="kdc-body">' +
      '<div class="kdc-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation"></div>' +
      '<div class="kdc-chips" role="group" aria-label="Suggested questions"></div>' +
    '</div>' +
    '<form class="kdc-form" novalidate>' +
      '<label class="sr-only" for="kdc-input">Type your question</label>' +
      '<textarea id="kdc-input" rows="1" maxlength="' + MAX_CHARS + '" placeholder="Ask about our services…" autocomplete="off"></textarea>' +
      '<button class="kdc-send" type="submit" aria-label="Send message">' + ICON.send + '</button>' +
    '</form>' +
    '<p class="kdc-note">AI answers can be imperfect. For quotes, <a href="' + WA + '" target="_blank" rel="noopener noreferrer">WhatsApp</a> or <a href="' + TEL + '">call us</a>.</p>';
  var backdrop = el('div', 'kdc-backdrop');
  backdrop.hidden = true;
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  var log = panel.querySelector('.kdc-log');
  var body = panel.querySelector('.kdc-body');
  var chips = panel.querySelector('.kdc-chips');
  var form = panel.querySelector('.kdc-form');
  var input = panel.querySelector('#kdc-input');
  var sendBtn = panel.querySelector('.kdc-send');
  var closeBtn = panel.querySelector('.kdc-close');
  var busy = false;

  if (launcher) launcher.insertAdjacentHTML('beforeend', '<span class="chat-launcher-x" aria-hidden="true">' + ICON.close + '</span>');

  function scrollDown() { body.scrollTop = body.scrollHeight; }
  function bubble(role, html, extraCls) {
    var row = el('div', 'kdc-row kdc-row--' + role + (extraCls ? ' ' + extraCls : ''));
    if (role === 'bot') row.appendChild(el('span', 'kdc-mini', '<img src="assets/logo-icon.png" alt="" width="20" height="18">'));
    var b = el('div', 'kdc-msg');
    var sr = el('span', 'sr-only', role === 'bot' ? 'Assistant: ' : 'You: ');
    var content = el('div', 'kdc-md', html);
    b.appendChild(sr); b.appendChild(content);
    row.appendChild(b);
    log.appendChild(row);
    scrollDown();
    return row;
  }
  function addUser(text) { bubble('user', esc(text).replace(/\n/g, '<br>')); }
  function addBot(text) { bubble('bot', md(text)); }
  function addError(message) {
    var row = bubble('bot', '<p></p>', 'kdc-row--error');
    row.querySelector('.kdc-md p').textContent = message || "Sorry, I couldn't connect just now. You can reach our team directly:";
    row.querySelector('.kdc-msg').insertAdjacentHTML('beforeend',
      '<div class="kdc-actions"><a class="kdc-act kdc-act--wa" href="' + WA + '" target="_blank" rel="noopener noreferrer">' + ICON.wa + 'WhatsApp us</a>' +
      '<a class="kdc-act" href="' + TEL + '">' + ICON.phone + 'Call ' + esc(PHONE) + '</a></div>');
    scrollDown();
  }
  var typingRow = null;
  function typing(on) {
    if (on && !typingRow) {
      typingRow = bubble('bot', '<span class="kdc-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Assistant is typing…</span>', 'kdc-row--typing');
    } else if (!on && typingRow) { typingRow.remove(); typingRow = null; }
  }
  function renderChips() {
    chips.innerHTML = '';
    CHIPS.forEach(function (q) {
      var c = el('button', 'kdc-chip'); c.type = 'button'; c.textContent = q;
      c.addEventListener('click', function () { ask(q); });
      chips.appendChild(c);
    });
    chips.hidden = history.some(function (m) { return m.role === 'user'; });
  }
  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    panel.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }

  function ask(text) {
    text = String(text || '').trim().slice(0, MAX_CHARS);
    if (!text || busy) return;
    chips.hidden = true;
    addUser(text);
    history.push({ role: 'user', content: text });
    save();
    setBusy(true);
    typing(true);
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 35000);
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-10) }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d || {} }; });
    }).then(function (res) {
      typing(false);
      if (res.ok && typeof res.d.reply === 'string' && res.d.reply.trim()) {
        addBot(res.d.reply);
        history.push({ role: 'assistant', content: res.d.reply });
        save();
      } else {
        history.pop(); save();
        addError(res.status === 429 || res.status === 400 ? res.d.message : null);
      }
    }).catch(function () {
      typing(false);
      history.pop(); save();
      addError(null);
    }).then(function () {
      clearTimeout(timer);
      setBusy(false);
      if (!mqMobile.matches || document.activeElement === input) input.focus({ preventScroll: true });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    if (!v.trim() || busy) return;
    input.value = ''; autosize();
    ask(v);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
  input.addEventListener('input', autosize);
  closeBtn.addEventListener('click', function () { close(); });
  backdrop.addEventListener('click', function () { close(); });
  log.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (a) close(false);            // in-page links (e.g. #contact): close so the section is visible
  });

  /* Escape closes; on the mobile full-screen sheet Tab focus is kept inside the panel */
  document.addEventListener('keydown', function (e) {
    if (panel.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && mqMobile.matches) {
      var f = Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),textarea,[tabindex="0"]'), function (n) { return n.offsetParent !== null && !n.closest('[hidden]'); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  var rendered = false;
  function render() {
    if (rendered) return;
    rendered = true;
    addBot(GREETING);
    history.forEach(function (m) { if (m.role === 'user') addUser(m.content); else addBot(m.content); });
    renderChips();
  }
  function open() {
    render();
    panel.hidden = false;
    backdrop.hidden = !mqMobile.matches;
    document.documentElement.classList.add('kdc-open');
    if (mqMobile.matches) document.documentElement.classList.add('kdc-lock');
    if (launcher) { launcher.setAttribute('aria-expanded', 'true'); launcher.setAttribute('aria-label', 'Close the K Digital assistant'); launcher.classList.add('is-open'); }
    requestAnimationFrame(function () {
      panel.classList.add('is-in');
      scrollDown();
      if (mqMobile.matches) panel.focus({ preventScroll: true }); else input.focus({ preventScroll: true });
    });
  }
  function close(returnFocus) {
    if (panel.hidden) return;
    panel.classList.remove('is-in');
    panel.hidden = true;
    backdrop.hidden = true;
    document.documentElement.classList.remove('kdc-open', 'kdc-lock');
    if (launcher) {
      launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-label', 'Ask the K Digital assistant'); launcher.classList.remove('is-open');
      if (returnFocus !== false) launcher.focus({ preventScroll: true });
    }
  }
  mqMobile.addEventListener('change', function () {
    if (panel.hidden) return;
    backdrop.hidden = !mqMobile.matches;
    document.documentElement.classList.toggle('kdc-lock', mqMobile.matches);
  });

  window.KDChat = { open: open, close: close, toggle: function () { if (panel.hidden) open(); else close(); }, ask: function (q) { open(); ask(q); }, _md: md };
})();
