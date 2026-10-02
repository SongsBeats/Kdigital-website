/* K Digital World website editor (vanilla JS, no dependencies).
   Talks to /api/admin. Forms are generated from the schema the server sends, so the editor and the
   server-side validation always agree. Images are resized and converted to WebP in the browser. */
(function () {
  'use strict';

  var API = '/api/admin';
  var LOCAL_KEY = 'kd-admin-draft-v1';
  var MAX_UPLOAD = 2 * 1024 * 1024;
  var MAX_ORIGINAL = 10 * 1024 * 1024;

  var state = { csrf: null, schema: null, published: null, draft: null, rev: 0, updatedAt: null, source: 'default',
    storage: false, section: 'brand', errors: {}, open: {}, busy: false };

  /* ---------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  var ICONS = {
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    chev: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function svgIcon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('width', '16'); s.setAttribute('height', '16');
    s.innerHTML = ICONS[name];
    return s;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function getAt(obj, path) { return path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setAt(obj, path, value) {
    var o = obj;
    for (var i = 0; i < path.length - 1; i++) { if (o[path[i]] == null) o[path[i]] = typeof path[i + 1] === 'number' ? [] : {}; o = o[path[i]]; }
    o[path[path.length - 1]] = value;
  }
  function pkey(path) { return path.join('.'); }
  function uid() { return 'f' + Math.random().toString(36).slice(2, 9); }
  function iconSrc(v) {
    var hit = (state.schema.icons || []).filter(function (i) { return i.value === v; })[0];
    if (hit) return '/' + hit.src;
    return v || '';
  }
  function imgSrc(src) { return /^(https?:)?\//.test(src) ? src : '/' + src; }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; }
  }
  function ago(iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return fmtDate(iso);
  }
  function toast(msg, isErr, link) {
    var t = el('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
    if (link) { t.appendChild(document.createTextNode(' ')); t.appendChild(el('a', { href: link.href, target: '_blank', rel: 'noopener', text: link.text })); }
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 9000 : 6000);
  }

  function api(action, opts) {
    opts = opts || {};
    var headers = {};
    var body;
    if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = state.csrf || '';
    if (opts.raw) { body = opts.raw; headers['Content-Type'] = opts.contentType; }
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
    return fetch(API + '?action=' + action + (opts.query || ''), { method: opts.method || 'GET', headers: headers, body: body, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401 && action !== 'login' && action !== 'session') { showLogin('Your session has ended. Please sign in again. Your edits are kept on this device.'); }
          return { status: r.status, ok: r.ok, data: data };
        });
      })
      .catch(function () { return { status: 0, ok: false, data: { message: 'Network error. Check your connection and try again.' } }; });
  }

  /* ---------------------------------------------------------------- login */
  function showLogin(msg) {
    $('app').hidden = true; $('login').hidden = false;
    var e = $('login-error');
    if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
    setTimeout(function () { ($('username').value ? $('password') : $('username')).focus(); }, 30);
  }
  function markLoginInvalid(on) {
    ['username', 'password'].forEach(function (id) { if (on) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid'); });
  }
  ['username', 'password'].forEach(function (id) { $(id).addEventListener('input', function () { markLoginInvalid(false); }); });
  $('pw-toggle').addEventListener('click', function () {
    var p = $('password'); var show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-pressed', String(show));
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var user = $('username').value.trim();
    var pw = $('password').value;
    var err = $('login-error');
    if (!user || !pw) {
      err.textContent = !user ? 'Enter your username.' : 'Enter your password.'; err.hidden = false;
      $(!user ? 'username' : 'password').setAttribute('aria-invalid', 'true');
      $(!user ? 'username' : 'password').focus();
      return;
    }
    var btn = $('login-btn'); btn.disabled = true; btn.textContent = 'Signing in...';
    api('login', { method: 'POST', body: { username: user, password: pw } }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Sign in';
      if (!r.ok) {
        err.textContent = r.data.message || 'Sign-in failed.'; err.hidden = false;
        if (r.status === 401) markLoginInvalid(true);
        $('password').select(); return;
      }
      markLoginInvalid(false); err.hidden = true;
      $('password').value = '';
      state.csrf = r.data.csrf;
      loadContent();
    });
  });
  $('logout').addEventListener('click', function () {
    if (isDirty() && !confirm('You have unpublished changes. They stay saved on this device. Sign out anyway?')) return;
    api('logout', { method: 'POST' }).then(function () { state.csrf = null; showLogin('You are signed out.'); });
  });

  /* ---------------------------------------------------------------- content */
  function loadContent(keepSection) {
    return api('content').then(function (r) {
      if (!r.ok) { if (r.status !== 401) toast(r.data.message || 'Could not load the content.', true); return; }
      state.schema = r.data.schema;
      state.published = r.data.content;
      state.draft = clone(r.data.content);
      state.rev = r.data.rev || 0; state.updatedAt = r.data.updatedAt; state.source = r.data.source;
      state.storage = r.data.storage; state.errors = {};
      if (!keepSection) state.section = state.section || 'brand';
      $('login').hidden = true; $('app').hidden = false;
      $('storage-banner').hidden = !!state.storage;
      checkLocalDraft();
      renderNav(); renderSection(); updateStatus(); updateDirty();
    });
  }
  function checkLocalDraft() {
    var b = $('draft-banner'); b.hidden = true; b.innerHTML = '';
    var saved;
    try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.draft || JSON.stringify(saved.draft) === JSON.stringify(state.published)) return;
    var stale = saved.baseRev !== state.rev;
    b.appendChild(el('span', { text: stale ? 'You have unpublished edits saved on this device, made before the latest publish.' : 'You have unpublished edits saved on this device.' }));
    b.appendChild(el('button', { class: 'btn btn-primary btn-xs', type: 'button', text: 'Continue editing', onclick: function () {
      state.draft = saved.draft; b.hidden = true; renderNav(); renderSection(); updateDirty();
    } }));
    b.appendChild(el('button', { class: 'btn btn-ghost btn-xs', type: 'button', text: 'Discard them', onclick: function () {
      localStorage.removeItem(LOCAL_KEY); b.hidden = true;
    } }));
    b.hidden = false;
  }
  function saveLocal() {
    try {
      if (isDirty()) localStorage.setItem(LOCAL_KEY, JSON.stringify({ baseRev: state.rev, draft: state.draft, at: Date.now() }));
      else localStorage.removeItem(LOCAL_KEY);
    } catch (e) { /* storage full or disabled */ }
  }
  function isDirty() { return state.draft && JSON.stringify(state.draft) !== JSON.stringify(state.published); }
  function sectionDirty(sec) {
    return sec.keys.some(function (k) { return JSON.stringify(state.draft[k]) !== JSON.stringify(state.published[k]); });
  }
  function changed() { updateDirty(); saveLocal(); }
  function updateDirty() {
    var d = isDirty();
    var m = $('dirty-msg');
    m.textContent = d ? 'You have unpublished changes' : 'No unpublished changes';
    m.classList.toggle('dirty', !!d);
    $('publish').disabled = !d || state.busy;
    $('discard').disabled = !d || state.busy;
    var btns = document.querySelectorAll('#nav button[data-sec]');
    Array.prototype.forEach.call(btns, function (b) {
      var sec = state.schema.sections.filter(function (s) { return s.id === b.getAttribute('data-sec'); })[0];
      var dot = b.querySelector('.dot');
      if (sec && sectionDirty(sec)) { if (!dot) b.appendChild(el('span', { class: 'dot', 'aria-label': 'changed' })); }
      else if (dot) dot.remove();
    });
  }
  function updateStatus() {
    var s = $('status');
    if (state.source === 'blob') s.textContent = 'Live version ' + state.rev + ' \u00b7 published ' + ago(state.updatedAt);
    else if (state.source === 'fallback') s.textContent = 'Storage is not responding: showing the last known content';
    else s.textContent = 'Showing the built-in content (nothing published yet)';
  }
  window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------------------------------------------------------- navigation */
  function renderNav() {
    var ul = $('nav'); ul.innerHTML = '';
    state.schema.sections.forEach(function (s) {
      ul.appendChild(el('li', null, el('button', { type: 'button', 'data-sec': s.id, 'aria-current': state.section === s.id ? 'page' : null,
        onclick: function () { go(s.id); } }, el('span', { text: s.label }))));
    });
    ul.appendChild(el('li', { class: 'sep', 'aria-hidden': 'true' }));
    ul.appendChild(el('li', null, el('button', { type: 'button', 'data-nav': 'versions', 'aria-current': state.section === 'versions' ? 'page' : null,
      onclick: function () { go('versions'); } }, el('span', { text: 'Version history' }))));
  }
  function go(id, focusPath) {
    state.section = id; renderNav(); renderSection(); updateDirty();
    var cur = document.querySelector('#nav [aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (focusPath) {
      var f = document.querySelector('[data-path="' + focusPath + '"]');
      if (f) { f.scrollIntoView({ block: 'center' }); if (f.focus) f.focus(); return; }
    }
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------- section rendering */
  function renderSection() {
    var main = $('main'); main.innerHTML = '';
    if (state.section === 'versions') return renderVersions(main);
    var sec = state.schema.sections.filter(function (s) { return s.id === state.section; })[0] || state.schema.sections[0];
    main.appendChild(el('div', { class: 'sec-head' }, el('h2', { text: sec.label }),
      el('p', { text: 'Edit the fields below, then press Publish changes. Nothing changes on the live site until you publish.' })));
    sec.keys.forEach(function (k) {
      var def = state.schema.fields[k];
      if (def.type === 'group') {
        var card = el('div', { class: 'card' }, el('h3', { text: def.label }), def.help ? el('p', { class: 'card-help', text: def.help }) : null);
        Object.keys(def.fields).forEach(function (fk) { card.appendChild(renderField(def.fields[fk], [k, fk])); });
        main.appendChild(card);
      } else {
        main.appendChild(el('div', { class: 'card' }, el('h3', { text: def.label }), def.help ? el('p', { class: 'card-help', text: def.help }) : null, renderField(def, [k], true)));
      }
    });
  }

  function fieldWrap(def, path, control, opts) {
    var id = control && control.id;
    var err = state.errors[pkey(path)];
    var head = el('div', { class: 'field-row' },
      el('label', { class: 'f-label', for: id || null }, def.label, def.required ? el('span', { class: 'f-req', 'aria-hidden': 'true', text: '*' }) : null),
      opts && opts.counter ? opts.counter : null);
    var w = el('div', { class: 'field' + (err ? ' has-error' : '') }, head, control,
      def.help ? el('p', { class: 'f-help', id: id ? id + '-h' : null, text: def.help }) : null,
      err ? el('p', { class: 'f-error', text: err }) : null);
    if (id && def.help) control.setAttribute('aria-describedby', id + '-h');
    return w;
  }

  function renderField(def, path, bare) {
    switch (def.type) {
      case 'group': {
        var box = el('div');
        Object.keys(def.fields).forEach(function (k) { box.appendChild(renderField(def.fields[k], path.concat(k))); });
        return box;
      }
      case 'list': return renderList(def, path, bare);
      case 'strings': return renderStrings(def, path);
      case 'image': return renderImage(def, path);
      case 'icon': return renderIcon(def, path);
      case 'days': return renderDays(def, path);
      default: return renderText(def, path);
    }
  }

  function renderText(def, path) {
    var v = getAt(state.draft, path);
    var id = uid();
    var multi = def.type === 'textarea';
    var type = { url: 'url', email: 'email', tel: 'tel', time: 'time' }[def.type] || 'text';
    var input = multi ? el('textarea', { id: id, rows: def.max > 500 ? 5 : 3 }) : el('input', { id: id, type: type });
    if (def.type === 'digits') input.setAttribute('inputmode', 'numeric');
    if (def.max && def.type !== 'time') input.setAttribute('maxlength', String(def.max));
    if (def.required) input.setAttribute('required', '');
    input.setAttribute('data-path', pkey(path));
    input.value = v == null ? '' : v;
    var counter = def.max && def.type !== 'time' ? el('span', { class: 'f-count', 'aria-hidden': 'true' }) : null;
    function count() { if (counter) { counter.textContent = input.value.length + ' / ' + def.max; counter.classList.toggle('over', input.value.length > def.max); } }
    count();
    input.addEventListener('input', function () {
      setAt(state.draft, path, input.value); count();
      if (state.errors[pkey(path)]) { delete state.errors[pkey(path)]; var f = input.closest('.field'); f.classList.remove('has-error'); var fe = f.querySelector('.f-error'); if (fe) fe.remove(); }
      if (multi) autosize(input);
      changed();
      refreshItemTitle(input);
    });
    if (multi) setTimeout(function () { autosize(input); }, 0);
    return fieldWrap(def, path, input, { counter: counter });
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 480) + 'px'; }

  function renderDays(def, path) {
    var v = getAt(state.draft, path) || [];
    var box = el('div', { class: 'days', role: 'group', 'aria-label': def.label });
    state.schema.days.forEach(function (d) {
      var cb = el('input', { type: 'checkbox', value: d });
      cb.checked = v.indexOf(d) >= 0;
      cb.addEventListener('change', function () {
        var cur = (getAt(state.draft, path) || []).filter(function (x) { return x !== d; });
        if (cb.checked) cur.push(d);
        setAt(state.draft, path, state.schema.days.filter(function (x) { return cur.indexOf(x) >= 0; }));
        changed();
      });
      box.appendChild(el('label', { class: 'chip' }, cb, d.slice(0, 3)));
    });
    var w = fieldWrap(def, path, box);
    return w;
  }

  function renderStrings(def, path) {
    var wrap = el('div', { class: 'field strings' });
    function draw() {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'f-label', text: def.label }));
      var arr = getAt(state.draft, path) || [];
      arr.forEach(function (s, i) {
        var input = def.multiline ? el('textarea', { rows: 3, maxlength: String(def.itemMax), 'aria-label': def.label + ' ' + (i + 1), 'data-path': pkey(path.concat(i)) })
          : el('input', { type: 'text', maxlength: String(def.itemMax), 'aria-label': def.label + ' ' + (i + 1), 'data-path': pkey(path.concat(i)) });
        input.value = s;
        input.addEventListener('input', function () { arr[i] = input.value; setAt(state.draft, path, arr); if (def.multiline) autosize(input); changed(); });
        if (def.multiline) setTimeout(function () { autosize(input); }, 0);
        wrap.appendChild(el('div', { class: 'str-row' }, input,
          el('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Remove ' + def.label.toLowerCase() + ' ' + (i + 1), onclick: function () { arr.splice(i, 1); setAt(state.draft, path, arr); draw(); changed(); } }, svgIcon('trash'))));
      });
      var add = el('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: function () { arr.push(''); setAt(state.draft, path, arr); draw(); changed(); var ins = wrap.querySelectorAll('input,textarea'); if (ins.length) ins[ins.length - 1].focus(); } }, svgIcon('plus'), 'Add');
      if (arr.length >= def.max) add.disabled = true;
      wrap.appendChild(add);
    }
    draw();
    return wrap;
  }

  /* lists: add / remove / reorder */
  function itemTitle(def, item, i) {
    var t = def.itemLabel && item ? String(item[def.itemLabel] || '').trim() : '';
    return t || 'Item ' + (i + 1);
  }
  function refreshItemTitle(input) {
    var item = input.closest('.item');
    if (!item) return;
    var path = item.getAttribute('data-item').split('.');
    var listPath = path.slice(0, -1).map(function (p) { return /^\d+$/.test(p) ? Number(p) : p; });
    var def = item.__def;
    var i = Number(path[path.length - 1]);
    var obj = getAt(state.draft, listPath)[i];
    var ttl = item.querySelector('.ttl'); if (ttl) ttl.textContent = itemTitle(def, obj, i);
  }
  function renderList(def, path, bare) {
    var wrap = el('div', { class: 'list' });
    function draw() {
      wrap.innerHTML = '';
      var arr = getAt(state.draft, path) || [];
      if (!bare) wrap.appendChild(el('div', null, el('div', { class: 'f-label', text: def.label }), def.help ? el('p', { class: 'f-help', text: def.help }) : null));
      arr.forEach(function (item, i) {
        var key = pkey(path.concat(i));
        var isOpen = state.open[key] !== undefined ? state.open[key] : arr.length <= 2;
        var hasErr = Object.keys(state.errors).some(function (k) { return k.indexOf(key + '.') === 0; });
        if (hasErr) isOpen = true;
        var bodyId = uid();
        var thumbSrc = item && item.icon ? iconSrc(item.icon) : (item && item.logo && item.logo.src ? imgSrc(item.logo.src) : '');
        var head = el('div', { class: 'item-head' },
          thumbSrc ? el('span', { class: 'item-thumb' }, el('img', { src: thumbSrc, alt: '', width: '22', height: '22' })) : null,
          el('button', { type: 'button', class: 'item-toggle', 'aria-expanded': String(isOpen), 'aria-controls': bodyId, onclick: function () { state.open[key] = !isOpen; draw(); } },
            el('span', { class: 'num', text: String(i + 1) }), el('span', { class: 'ttl', text: itemTitle(def, item, i) }), el('span', { class: 'chev' }, svgIcon('chev'))),
          el('div', { class: 'item-tools' },
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, onclick: function () { move(i, -1); } }, svgIcon('up')),
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', title: 'Move down', disabled: i === arr.length - 1, onclick: function () { move(i, 1); } }, svgIcon('down')),
            el('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Remove ' + itemTitle(def, item, i), title: 'Remove', disabled: arr.length <= (def.min || 0),
              onclick: function () { if (confirm('Remove "' + itemTitle(def, item, i) + '"?')) { arr.splice(i, 1); setAt(state.draft, path, arr); state.open = {}; draw(); changed(); } } }, svgIcon('trash'))));
        var node = el('div', { class: 'item', 'data-item': key, open: isOpen }, head);
        node.__def = def;
        if (isOpen) {
          var body = el('div', { class: 'item-body', id: bodyId });
          Object.keys(def.fields).forEach(function (fk) { body.appendChild(renderField(def.fields[fk], path.concat(i, fk))); });
          node.appendChild(body);
        }
        wrap.appendChild(node);
      });
      var add = el('button', { type: 'button', class: 'btn btn-ghost btn-sm list-add', onclick: function () {
        arr.push(clone(def.newItem || {})); setAt(state.draft, path, arr); state.open = {}; state.open[pkey(path.concat(arr.length - 1))] = true; draw(); changed();
        var last = wrap.querySelectorAll('.item'); last = last[last.length - 1]; if (last) { var f = last.querySelector('input,textarea'); if (f) f.focus(); last.scrollIntoView({ block: 'center' }); }
      } }, svgIcon('plus'), 'Add ' + (def.label.toLowerCase().replace(/\s*\(.*\)$/, '').replace(/s$/, '')));
      if (arr.length >= def.max) { add.disabled = true; add.title = 'Maximum ' + def.max; }
      wrap.appendChild(add);
      function move(i, d) {
        var j = i + d; if (j < 0 || j >= arr.length) return;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t; setAt(state.draft, path, arr);
        var oi = state.open[pkey(path.concat(i))], oj = state.open[pkey(path.concat(j))];
        state.open[pkey(path.concat(i))] = oj; state.open[pkey(path.concat(j))] = oi;
        draw(); changed();
        var btn = wrap.querySelectorAll('.item')[j]; if (btn) btn.querySelector(d < 0 ? '[aria-label="Move up"]' : '[aria-label="Move down"]').focus();
      }
    }
    draw();
    return wrap;
  }

  /* images */
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); img.decoding = 'async';
      img.onload = function () { resolve(img); }; img.onerror = function () { reject(new Error('This file could not be read as an image.')); };
      img.src = url;
    });
  }
  function toBlob(canvas, type, q) { return new Promise(function (r) { canvas.toBlob(r, type, q); }); }
  function processImage(file, kind) {
    var k = state.schema.imageKinds[kind];
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return Promise.reject(new Error('Please choose a PNG, JPG, WebP or SVG image.'));
    if (file.size > MAX_ORIGINAL) return Promise.reject(new Error('That file is too large (maximum 10 MB before optimisation).'));
    var isSvg = file.type === 'image/svg+xml';
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var sw = img.naturalWidth || 512, sh = img.naturalHeight || 512;
      var cw, ch, dx = 0, dy = 0, dw, dh, scale;
      if (k.crop) { cw = k.maxW; ch = k.maxH; scale = Math.max(cw / sw, ch / sh); }
      else if (k.square) { cw = k.maxW; ch = k.maxH; scale = Math.min(cw / sw, ch / sh); }
      else { scale = Math.min(k.maxW / sw, k.maxH / sh); if (!isSvg) scale = Math.min(1, scale); cw = Math.max(1, Math.round(sw * scale)); ch = Math.max(1, Math.round(sh * scale)); }
      dw = Math.round(sw * scale); dh = Math.round(sh * scale); dx = Math.round((cw - dw) / 2); dy = Math.round((ch - dh) / 2);
      // Downscale in halving steps for sharper results.
      var src = img, srcW = sw, srcH = sh;
      while (!isSvg && srcW / 2 > dw * 1.5) {
        var tmp = document.createElement('canvas'); tmp.width = Math.round(srcW / 2); tmp.height = Math.round(srcH / 2);
        var tc = tmp.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(src, 0, 0, tmp.width, tmp.height);
        src = tmp; srcW = tmp.width; srcH = tmp.height;
      }
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      if (k.crop) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
      ctx.drawImage(src, dx, dy, dw, dh);
      return toBlob(c, 'image/webp', 0.88).then(function (b) {
        if (b && b.type === 'image/webp') return b;
        return toBlob(c, k.crop ? 'image/jpeg' : 'image/png', 0.88); // browsers without WebP encoding (older Safari)
      }).then(function (b) {
        if (!b) throw new Error('This image could not be converted.');
        if (b.size > MAX_UPLOAD) throw new Error('The optimised image is still larger than 2 MB. Please use a smaller image.');
        return { blob: b, w: cw, h: ch };
      });
    });
  }
  function upload(file, kind) {
    return processImage(file, kind).then(function (p) {
      return api('upload', { method: 'POST', raw: p.blob, contentType: p.blob.type, query: '&kind=' + encodeURIComponent(kind) });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.data.message || 'Upload failed.');
      return r.data;
    });
  }
  function filePicker(onFile) {
    var input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true });
    input.addEventListener('change', function () { if (input.files && input.files[0]) onFile(input.files[0]); input.value = ''; });
    return input;
  }
  function renderImage(def, path) {
    var v = getAt(state.draft, path);
    var kind = state.schema.imageKinds[def.kind] || {};
    var wrap = el('div');
    function draw() {
      v = getAt(state.draft, path);
      wrap.innerHTML = '';
      var prev = el('div', { class: 'img-preview' + (def.kind === 'og' ? ' wide' : '') },
        v && v.src ? el('img', { src: imgSrc(v.src), alt: 'Current ' + def.label.toLowerCase() }) : el('span', { class: 'none', text: 'No image' }));
      var picker = filePicker(function (file) {
        wrap.classList.add('busy'); btn.textContent = 'Uploading...';
        upload(file, def.kind).then(function (d) {
          setAt(state.draft, path, { src: d.src, w: d.w, h: d.h });
          delete state.errors[pkey(path)];
          draw(); changed(); toast('Image uploaded (' + d.w + ' x ' + d.h + ', ' + Math.round(d.bytes / 1024) + ' KB). Publish to make it live.');
        }).catch(function (e) { toast(e.message, true); draw(); }).then(function () { wrap.classList.remove('busy'); });
      });
      var btn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-path': pkey(path), disabled: !state.storage, title: state.storage ? null : 'Connect storage to upload images',
        onclick: function () { picker.click(); } }, v && v.src ? 'Replace image' : 'Upload image');
      var rm = !def.required && v && v.src ? el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: function () { setAt(state.draft, path, null); draw(); changed(); } }, 'Remove') : null;
      var meta = el('p', { class: 'img-meta', text: (v && v.src ? v.w + ' x ' + v.h + ' px. ' : '') + 'PNG, JPG, WebP or SVG. Converted to WebP' + (kind.maxW ? ' and resized to fit ' + kind.maxW + ' x ' + kind.maxH : '') + '. Max 2 MB.' });
      var err = state.errors[pkey(path)];
      wrap.appendChild(el('div', { class: 'field' + (err ? ' has-error' : '') },
        el('div', { class: 'f-label', text: def.label }),
        el('div', { class: 'img-field' }, prev, el('div', null, el('div', { class: 'img-btns' }, btn, rm), meta)), picker,
        def.help ? el('p', { class: 'f-help', text: def.help }) : null, err ? el('p', { class: 'f-error', text: err }) : null));
    }
    draw();
    return wrap;
  }
  function renderIcon(def, path) {
    var wrap = el('div');
    function draw() {
      var v = getAt(state.draft, path) || '';
      wrap.innerHTML = '';
      var id = uid();
      var sel = el('select', { id: id, 'data-path': pkey(path) });
      var known = state.schema.icons.some(function (i) { return i.value === v; });
      var g1 = el('optgroup', { label: 'Service and platform icons' }), g2 = el('optgroup', { label: 'Section icons' });
      state.schema.icons.forEach(function (i) {
        var o = el('option', { value: i.value, text: i.label }); if (i.value === v) o.selected = true;
        (i.src.indexOf('/sec/') > 0 ? g2 : g1).appendChild(o);
      });
      if (!known && v) sel.appendChild(el('option', { value: v, text: 'Custom image (uploaded)', selected: true }));
      sel.appendChild(g1); sel.appendChild(g2);
      sel.addEventListener('change', function () { setAt(state.draft, path, sel.value); draw(); changed(); var s = wrap.querySelector('select'); if (s) s.focus(); });
      var picker = filePicker(function (file) {
        wrap.classList.add('busy');
        upload(file, 'icon').then(function (d) { setAt(state.draft, path, d.src); draw(); changed(); toast('Icon uploaded. Publish to make it live.'); })
          .catch(function (e) { toast(e.message, true); }).then(function () { wrap.classList.remove('busy'); });
      });
      var row = el('div', { class: 'icon-field' }, el('span', { class: 'icon-prev' }, v ? el('img', { src: iconSrc(v), alt: '' }) : null), sel,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: !state.storage, onclick: function () { picker.click(); } }, 'Upload custom'), picker);
      wrap.appendChild(fieldWrap(def, path, row));
      var lbl = wrap.querySelector('label'); if (lbl) lbl.setAttribute('for', id);
    }
    draw();
    return wrap;
  }

  /* ---------------------------------------------------------------- versions */
  function renderVersions(main) {
    main.appendChild(el('div', { class: 'sec-head' }, el('h2', { text: 'Version history' }),
      el('p', { text: 'Every publish is saved. The last ' + (state.schema ? 10 : 10) + ' versions are kept, so you can go back if something goes wrong.' })));
    var card = el('div', { class: 'card' }, el('p', { class: 'card-help', text: 'Loading...' }));
    main.appendChild(card);
    if (!state.storage) { card.innerHTML = ''; card.appendChild(el('p', { class: 'card-help', text: 'Version history appears here once storage is connected and you publish for the first time.' })); return; }
    api('versions').then(function (r) {
      card.innerHTML = '';
      if (!r.ok) { card.appendChild(el('p', { class: 'card-help', text: r.data.message || 'Could not load versions.' })); return; }
      var list = r.data.versions || [];
      if (!list.length) { card.appendChild(el('p', { class: 'card-help', text: 'Nothing published yet. The site shows its built-in content.' })); return; }
      var ul = el('ul', { class: 'versions' });
      list.forEach(function (v, i) {
        ul.appendChild(el('li', null,
          el('div', null, el('div', { class: 'when' }, fmtDate(v.savedAt), i === 0 ? el('span', { class: 'badge', text: 'Live' }) : null),
            el('div', { class: 'meta', text: ago(v.savedAt) + ' \u00b7 ' + Math.max(1, Math.round(v.size / 1024)) + ' KB' })),
          i === 0 ? null : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { restore(v); } }, 'Restore')));
      });
      card.appendChild(ul);
    });
  }
  function restore(v) {
    if (isDirty() && !confirm('Restoring replaces your unpublished changes. Continue?')) return;
    if (!confirm('Restore the version from ' + fmtDate(v.savedAt) + '? It will be published as a new version right away.')) return;
    setBusy(true);
    api('restore', { method: 'POST', body: { id: v.id, baseRev: state.rev } }).then(function (r) {
      setBusy(false);
      if (!r.ok) { toast(r.data.message || 'Restore failed.', true); return; }
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
      toast('Version restored and published. The live site updates within a few seconds.', false, { href: '/', text: 'View site' });
      loadContent(true);
    });
  }

  /* ---------------------------------------------------------------- publish / discard */
  function setBusy(b) { state.busy = b; $('publish').textContent = b ? 'Publishing...' : 'Publish changes'; updateDirty(); }
  function sectionOfPath(p) {
    var top = p.split('.')[0];
    var s = state.schema.sections.filter(function (x) { return x.keys.indexOf(top) >= 0; })[0];
    return s ? s.id : 'brand';
  }
  $('publish').addEventListener('click', function () {
    if (!state.storage) { toast('Storage is not connected yet, so changes cannot be published. See the README, section "Admin setup".', true); return; }
    setBusy(true);
    api('publish', { method: 'POST', body: { content: state.draft, baseRev: state.rev } }).then(function (r) {
      setBusy(false);
      if (r.ok) {
        state.published = clone(state.draft); state.rev = r.data.rev; state.updatedAt = r.data.updatedAt; state.source = 'blob'; state.errors = {};
        try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
        updateDirty(); updateStatus();
        toast(r.data.purged ? 'Published. The live site updates within a few seconds.' : 'Published. The live site updates shortly.', false, { href: '/', text: 'View site' });
        return;
      }
      if (r.status === 400 && r.data.details) {
        state.errors = {};
        r.data.details.forEach(function (d) { state.errors[d.path] = d.message.replace(/^[^:]+:\s*/, ''); });
        var first = r.data.details[0];
        toast(r.data.message + ' (' + r.data.details.length + ' field' + (r.data.details.length > 1 ? 's' : '') + ')', true);
        if (first) go(sectionOfPath(first.path), first.path); else renderSection();
        return;
      }
      if (r.status === 409) {
        toast(r.data.message, true);
        if (confirm(r.data.message + '\n\nLoad the latest version now? Your edits stay saved on this device and you can continue them.')) loadContent(true);
        return;
      }
      if (r.status !== 401) toast(r.data.message || 'Publishing failed. Please try again.', true);
    });
  });
  $('discard').addEventListener('click', function () {
    if (!confirm('Discard all unpublished changes?')) return;
    state.draft = clone(state.published); state.errors = {};
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
    renderSection(); updateDirty();
  });

  /* ---------------------------------------------------------------- boot */
  api('session').then(function (r) {
    var cfg = $('login-config');
    if (r.ok && !r.data.configured) {
      cfg.hidden = false; cfg.innerHTML = '';
      cfg.appendChild(el('strong', { text: 'The editor is not set up yet. ' }));
      cfg.appendChild(document.createTextNode('In Vercel > Project > Settings > Environment Variables, set: ' + r.data.problems.join('; ') + '. Then redeploy.'));
    }
    if (r.ok && r.data.authenticated) { state.csrf = r.data.csrf; loadContent(); }
    else showLogin();
  });
})();
