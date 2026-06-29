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

  // --- Language toggle (NL default, EN from data-en attributes) --------------
  var LANG_KEY = 'tim-lang';
  function applyLang(lang) {
    var els = [].slice.call(doc.querySelectorAll('[data-en]'));
    els.forEach(function (el) {
      if (lang === 'en') {
        if (el.getAttribute('data-nl') === null) el.setAttribute('data-nl', el.innerHTML);
        el.innerHTML = el.getAttribute('data-en');
      } else if (el.getAttribute('data-nl') !== null) {
        el.innerHTML = el.getAttribute('data-nl');
      }
    });
    root.setAttribute('lang', lang === 'en' ? 'en' : 'nl');
    var nl = doc.getElementById('langNL'), en = doc.getElementById('langEN');
    if (nl) nl.setAttribute('aria-pressed', String(lang !== 'en'));
    if (en) en.setAttribute('aria-pressed', String(lang === 'en'));
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }
  function initLang() {
    var nl = doc.getElementById('langNL'), en = doc.getElementById('langEN');
    if (nl) nl.addEventListener('click', function (e) { e.preventDefault(); applyLang('nl'); });
    if (en) en.addEventListener('click', function (e) { e.preventDefault(); applyLang('en'); });
    var saved;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (saved === 'en') applyLang('en');
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

  onReady(function () { initReveal(); initLang(); initMobileNav(); });
})();
