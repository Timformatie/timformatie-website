/* Timformatie progressive enhancement.
 * Replaces the parts of the old dc-runtime that needed JS. Everything degrades
 * gracefully: with JS disabled the page is fully readable and all content visible.
 * No external dependencies, no network calls. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;

  // Mark JS as available so reveal-animation CSS can hide-then-reveal. Without
  // this class, [data-reveal] elements stay fully visible (SEO + no-JS safe).
  root.classList.add('dc-js');

  function onReady(fn) {
    if (doc.readyState !== 'loading') fn();
    else doc.addEventListener('DOMContentLoaded', fn);
  }

  // --- Scroll reveal ---------------------------------------------------------
  function initReveal() {
    var items = [].slice.call(doc.querySelectorAll('[data-reveal]'));
    if (!items.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('dc-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('dc-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
    // Hard fallback: never let content stay hidden.
    setTimeout(function () { items.forEach(function (el) { el.classList.add('dc-in'); }); }, 2600);
  }

  // --- Language toggle -------------------------------------------------------
  // NL is the source language. EN content lives in data-en (text) or
  // data-en-html (markup). Controls are tagged with data-setlang="nl|en".
  var LANG_KEY = 'tim-lang';
  var currentLang = 'nl';
  var langGroups = [];   // paired NL/EN controls with their active/inactive looks

  function applyLang(lang) {
    lang = lang === 'en' ? 'en' : 'nl';
    currentLang = lang;
    var els = doc.querySelectorAll('[data-en], [data-en-html]');
    [].forEach.call(els, function (el) {
      if (el.getAttribute('data-nl-orig') === null) el.setAttribute('data-nl-orig', el.innerHTML);
      if (lang === 'en') {
        var en = el.getAttribute('data-en-html');
        if (en === null) en = el.getAttribute('data-en');
        el.innerHTML = en;
      } else {
        el.innerHTML = el.getAttribute('data-nl-orig');
      }
    });
    root.setAttribute('lang', lang);
    [].forEach.call(doc.querySelectorAll('[data-setlang]'), function (c) {
      c.setAttribute('aria-pressed', String(c.getAttribute('data-setlang') === lang));
    });
    // move the highlighted ("active") look onto the chosen language control
    langGroups.forEach(function (g) {
      var on = lang === 'en' ? g.en : g.nl;
      var off = lang === 'en' ? g.nl : g.en;
      on.style.background = g.active.bg; on.style.color = g.active.fg;
      off.style.background = g.inactive.bg; off.style.color = g.inactive.fg;
    });
    translateCookieBanner(lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  function initLang() {
    var ctrls = [].slice.call(doc.querySelectorAll('[data-setlang]'));
    if (!ctrls.length) return;
    var groups = [];
    ctrls.forEach(function (c) {
      c.style.cursor = 'pointer';
      c.addEventListener('click', function (e) { e.preventDefault(); applyLang(c.getAttribute('data-setlang')); });
      var p = c.parentNode, g = null, i;
      for (i = 0; i < groups.length; i++) { if (groups[i].p === p) { g = groups[i]; break; } }
      if (!g) { g = { p: p }; groups.push(g); }
      g[c.getAttribute('data-setlang')] = c;
    });
    // NL starts active, EN starts inactive -> capture both looks (bg + color)
    groups.forEach(function (g) {
      if (g.nl && g.en) langGroups.push({
        nl: g.nl, en: g.en,
        active: { bg: g.nl.style.background, fg: g.nl.style.color },
        inactive: { bg: g.en.style.background, fg: g.en.style.color }
      });
    });
    var saved;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (saved === 'en') applyLang('en');
  }

  // --- Cookie-consent banner (its text is injected by a separate inline script) ---
  function translateCookieBanner(lang) {
    var b = doc.getElementById('timCookieBanner');
    if (!b) return;
    var en = lang === 'en';
    var accept = doc.getElementById('timBnAccept'),
        reject = doc.getElementById('timBnReject'),
        settings = doc.getElementById('timBnSettings');
    if (accept) accept.textContent = en ? 'Accept all' : 'Alles accepteren';
    if (reject) reject.textContent = en ? 'Decline' : 'Weigeren';
    if (settings) settings.textContent = en ? 'Preferences' : 'Voorkeuren';
    var p = b.querySelector('p');
    if (p) {
      var a = p.querySelector('a');
      var href = a ? a.getAttribute('href') : '/cookiebeleid.html';
      var astyle = a ? (a.getAttribute('style') || '') : '';
      p.innerHTML = (en
        ? 'Functional cookies are always active. For preferences, statistics and marketing we ask your consent. Read more in our '
        : 'Functionele cookies zijn altijd actief. Voor voorkeuren, statistieken en marketing vragen we je toestemming. Lees meer in ons ')
        + '<a href="' + href + '" style="' + astyle + '">' + (en ? 'cookie policy' : 'cookiebeleid') + '</a>.';
      var title = p.previousElementSibling;
      if (title) title.textContent = en ? 'We use cookies' : 'We gebruiken cookies';
    }
  }

  // The banner is added asynchronously by the consent script; translate it whenever
  // it appears (and on every language switch via applyLang).
  function watchCookieBanner() {
    if (doc.getElementById('timCookieBanner')) { translateCookieBanner(currentLang); return; }
    if (!('MutationObserver' in window) || !doc.body) return;
    var mo = new MutationObserver(function () {
      if (doc.getElementById('timCookieBanner')) { translateCookieBanner(currentLang); mo.disconnect(); }
    });
    mo.observe(doc.body, { childList: true });
  }

  // --- Scroll & cursor parallax (ported from the old dc-runtime) -------------
  function initParallax() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    // elements that drift horizontally as you scroll past them
    var pxEls = [].slice.call(doc.querySelectorAll('[data-px]'));
    if (pxEls.length) {
      var drift = function () {
        var vh = window.innerHeight || 800;
        pxEls.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
          var range = parseFloat(el.getAttribute('data-px')) || 120;
          el.style.transform = 'translate3d(' + ((p - 0.5) * 2 * range) + 'px,0,0)';
        });
      };
      window.addEventListener('scroll', drift, { passive: true });
      window.addEventListener('resize', drift, { passive: true });
      drift();
    }

    // cursor parallax on the hero graphic
    var hero = doc.getElementById('heroSection'), fig = doc.getElementById('heroGraphic');
    if (hero && fig) {
      fig.style.transition = 'transform .12s ease-out';
      hero.addEventListener('mousemove', function (ev) {
        var r = hero.getBoundingClientRect();
        var dx = (ev.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (ev.clientY - (r.top + r.height / 2)) / r.height;
        fig.style.transform = 'translate(' + (dx * 22) + 'px,' + (dy * 18) + 'px)';
      });
      hero.addEventListener('mouseleave', function () {
        fig.style.transition = 'transform .6s ease';
        fig.style.transform = 'none';
        setTimeout(function () { fig.style.transition = 'transform .12s ease-out'; }, 600);
      });
    }
  }

  // --- Mobile navigation toggle ---------------------------------------------
  function initMobileNav() {
    var btn = doc.getElementById('navToggle'), panel = doc.getElementById('mobileNav');
    if (!btn || !panel) return;
    function close() { panel.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
    function open() { panel.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    btn.addEventListener('click', function () {
      if (panel.hasAttribute('hidden')) open(); else close();
    });
    // close after choosing a destination
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    // never leave the panel open when resizing up to the desktop layout
    window.addEventListener('resize', function () { if (window.innerWidth > 900) close(); });
  }

  onReady(function () { initReveal(); initLang(); initMobileNav(); initParallax(); watchCookieBanner(); });
})();
