/* K Digital: small progressive enhancements, no dependencies. */
(function () {
  'use strict';
  // Contact details come from the page (rendered from the admin-edited content); values below are fallbacks.
  var CFG = {};
  try { CFG = JSON.parse((document.getElementById('kd-config') || {}).textContent || '{}'); } catch (e) { CFG = {}; }
  var WA_NUMBER = CFG.whatsapp || '919912360547';
  var EMAIL = CFG.email || 'kdigitalads9@gmail.com';
  var GREETING = CFG.greeting || 'Hello K Digital, I would like a free consultation.';

  // Sticky header shadow
  var header = document.querySelector('.site-header');
  var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
  }
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
  });
  window.matchMedia('(min-width: 981px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });

  // Active nav link
  if ('IntersectionObserver' in window) {
    var links = {};
    document.querySelectorAll('.nav-list a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && links[en.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
          links[en.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });

    // Reveal on scroll
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Contact form -> prefilled WhatsApp message (no backend)
  var form = document.getElementById('contact-form');
  var err = document.getElementById('form-error');
  var status = document.getElementById('form-status');
  var mailto = document.getElementById('mailto-link');

  function val(name) { return (form.elements[name].value || '').trim(); }
  function buildText() {
    var lines = [GREETING, ''];
    lines.push('Name: ' + val('name'));
    lines.push('Phone: ' + val('phone'));
    if (val('business')) lines.push('Business type: ' + val('business'));
    if (val('service')) lines.push('Service needed: ' + val('service'));
    if (val('message')) lines.push('Message: ' + val('message'));
    return lines.join('\n');
  }
  function updateMailto() {
    var subject = 'Free consultation request' + (val('name') ? ' from ' + val('name') : '');
    mailto.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(buildText());
  }
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) e.target.removeAttribute('aria-invalid');
    updateMailto();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true; status.textContent = '';
    var name = form.elements.name, phone = form.elements.phone, bad = [];
    [name, phone].forEach(function (f) { f.value = f.value.trim(); f.removeAttribute('aria-invalid'); });
    if (!name.value) bad.push(name);
    var digits = phone.value.replace(/\D/g, '');
    if (!/^[0-9+()\s-]+$/.test(phone.value) || digits.length < 7 || digits.length > 15) bad.push(phone);
    if (bad.length) {
      bad.forEach(function (f) { f.setAttribute('aria-invalid', 'true'); });
      err.textContent = bad.length === 2 ? 'Please enter your name and a valid phone number.' :
        (bad[0] === name ? 'Please enter your name.' : 'Please enter a valid phone number.');
      err.hidden = false; bad[0].focus();
      return;
    }
    updateMailto();
    var url = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(buildText());
    var w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (x) {} } else { window.location.href = url; }
    status.textContent = 'Opening WhatsApp with your details. If it did not open, please use the email link above.';
  });
  updateMailto();

  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  // AI chat assistant: chat.css + chat.js are lazy-loaded on first intent (hover/focus/touch) or click.
  var launcher = document.querySelector('.chat-launcher');
  if (launcher) {
    var loading = null;
    var loadChat = function () {
      if (loading) return loading;
      loading = Promise.all([
        new Promise(function (res, rej) {
          var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'chat.css';
          l.onload = res; l.onerror = rej; document.head.appendChild(l);
        }),
        new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = 'chat.js'; s.async = true;
          s.onload = res; s.onerror = rej; document.body.appendChild(s);
        })
      ]).catch(function (e) { loading = null; throw e; });
      return loading;
    };
    ['pointerenter', 'focus', 'touchstart'].forEach(function (ev) {
      launcher.addEventListener(ev, function () { loadChat().catch(function () {}); }, { once: true, passive: true });
    });
    launcher.addEventListener('click', function () {
      if (window.KDChat) { window.KDChat.toggle(); return; }
      launcher.setAttribute('aria-busy', 'true');
      loadChat().then(function () {
        launcher.removeAttribute('aria-busy');
        window.KDChat.open();
      }).catch(function () {
        launcher.removeAttribute('aria-busy');
        window.open('https://wa.me/' + WA_NUMBER, '_blank', 'noopener');   // offline / blocked: fall back to WhatsApp
      });
    });
  }
})();
