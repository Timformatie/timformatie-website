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
    if (doc.getElementById('ckStatus')) setCookieStatus(readConsent());
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  function initLang() {
    var ctrls = [].slice.call(doc.querySelectorAll('[data-setlang]'));
    if (!ctrls.length) return;
    var groups = [];
    ctrls.forEach(function (c) {
      c.style.cursor = 'pointer';
      // The homepage toggle uses <span>/<a> (selectable); other pages use <button>
      // (not). On mobile a tap can select the label, and the selection highlight
      // then hides it. Make every control behave like a button: not selectable.
      c.style.userSelect = 'none';
      c.style.webkitUserSelect = 'none';
      c.style.webkitTouchCallout = 'none';
      c.style.webkitTapHighlightColor = 'transparent';
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

  // --- Team bio overlay (Over ons page; ported from the dc-runtime) ----------
  // Each team photo is a <button data-open="id">; the matching detail lives in a
  // <div data-panel="id"> inside #bioOverlay. With JS off the overlay stays hidden
  // and the page is still fully readable.
  function initBioOverlay() {
    var ov = doc.getElementById('bioOverlay');
    if (!ov) return;
    var panels = [].slice.call(ov.querySelectorAll('[data-panel]'));

    function open(id) {
      panels.forEach(function (p) {
        p.style.display = (p.getAttribute('data-panel') === id) ? 'block' : 'none';
      });
      ov.style.display = 'flex';
      doc.body.style.overflow = 'hidden';
      var btn = ov.querySelector('[data-close-btn]');
      if (btn) btn.focus();
    }
    function close() {
      ov.style.display = 'none';
      doc.body.style.overflow = '';
    }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    [].forEach.call(doc.querySelectorAll('[data-open]'), function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-open')); });
      var lift = b.querySelector('[data-lift]');
      if (lift && !reduce) {
        b.addEventListener('mouseenter', function () { lift.style.transform = 'translateY(-6px)'; });
        b.addEventListener('mouseleave', function () { lift.style.transform = 'none'; });
      }
    });
    [].forEach.call(ov.querySelectorAll('[data-close-bg], [data-close-btn]'), function (el) {
      el.addEventListener('click', close);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.style.display !== 'none') close();
    });
  }

  // --- Booking modal (Google Calendar appointment scheduling) ----------------
  // Triggers carry data-booking; clicking one opens a modal with the scheduling
  // iframe. The iframe is built lazily on first open (kept off initial page load),
  // and each trigger keeps its href (the contact page) as a no-JS fallback.
  var BOOKING_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1fKCz3finlqnfYeVXsOeHMue0UibEqnB7On-WBvVSHuTOwJ2bQj03-jE7ZNuTgPbD576-xDyPF?gv=true';
  function initBooking() {
    var triggers = [].slice.call(doc.querySelectorAll('[data-booking]'));
    if (!triggers.length) return;
    var overlay = null, frameLoaded = false;

    function build() {
      overlay = doc.createElement('div');
      overlay.id = 'bookingOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Plan een afspraak');
      overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:120;align-items:center;justify-content:center;padding:24px;';
      overlay.innerHTML =
        '<div data-close-bg style="position:absolute;inset:0;background:rgba(15,42,61,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);"></div>' +
        '<div style="position:relative;z-index:1;width:100%;max-width:760px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;background:#FBF9F2;border-radius:24px;box-shadow:0 24px 64px rgba(15,42,61,0.28);">' +
          '<button type="button" data-close-btn aria-label="Sluiten" style="position:absolute;top:14px;right:14px;z-index:2;width:38px;height:38px;border:none;border-radius:50%;background:rgba(15,42,61,0.12);color:#0F2A3D;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>' +
          '<div data-frame-host style="flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;"></div>' +
        '</div>';
      doc.body.appendChild(overlay);
      overlay.querySelector('[data-close-bg]').addEventListener('click', close);
      overlay.querySelector('[data-close-btn]').addEventListener('click', close);
    }
    function open() {
      if (!overlay) build();
      if (!frameLoaded) {
        var f = doc.createElement('iframe');
        f.src = BOOKING_URL;
        f.title = currentLang === 'en' ? 'Google Calendar appointment scheduling' : 'Google Agenda afsprakenplanner';
        f.setAttribute('frameborder', '0');
        f.style.cssText = 'border:0;display:block;width:100%;height:600px;';
        overlay.querySelector('[data-frame-host]').appendChild(f);
        frameLoaded = true;
      }
      overlay.style.display = 'flex';
      doc.body.style.overflow = 'hidden';
      overlay.querySelector('[data-close-btn]').focus();
    }
    function close() {
      if (!overlay) return;
      overlay.style.display = 'none';
      doc.body.style.overflow = '';
    }

    triggers.forEach(function (t) {
      t.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') close();
    });
  }

  // --- Contact form (Contact page) -------------------------------------------
  // Submits to Formspree over AJAX so the visitor stays on the page. The form's
  // action attribute is the single source of truth for the endpoint. Status is
  // shown in #cfHint, language-aware. Without JS the native POST still works
  // (Formspree shows its own confirmation page).
  function initContactForm() {
    var form = doc.getElementById('contactForm');
    if (!form) return;
    var hint = doc.getElementById('cfHint');
    var btn = form.querySelector('button[type="submit"]');
    var setHint = function (msg, color) {
      if (!hint) return;
      hint.textContent = msg;
      hint.style.color = color || 'rgba(15,42,61,0.5)';
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var en = currentLang === 'en';
      var fail = en ? 'Something went wrong. Please email info@timformatie.nl.'
                    : 'Er ging iets mis. Mail ons gerust op info@timformatie.nl.';
      if (btn) btn.disabled = true;
      setHint(en ? 'Sending…' : 'Versturen…');
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      }).then(function (r) {
        if (r.ok) {
          form.reset();
          // Land on our own styled thank-you page (same target as the no-JS _next).
          var next = form.querySelector('[name="_next"]');
          window.location.href = (next && next.value) ? next.value : '/bedankt.html';
          return;
        }
        return r.json().then(function (d) {
          var msg = (d && d.errors && d.errors.length)
            ? d.errors.map(function (x) { return x.message; }).join(', ')
            : fail;
          setHint(msg, '#C0392B');
        });
      }).catch(function () {
        setHint(fail, '#C0392B');
      }).then(function () {
        if (btn) btn.disabled = false;
      });
    });
  }

  // --- Cookie preference centre (Cookiebeleid page; ported from the dc-runtime) ---
  var CONSENT_KEY = 'tim-cookie-consent';
  function readConsent() {
    try { var r = localStorage.getItem(CONSENT_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function writeConsent(c) {
    var d = { functional: true, preferences: !!c.preferences, statistics: !!c.statistics, marketing: !!c.marketing, ts: Date.now(), version: 1 };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(d)); } catch (e) {}
    return d;
  }
  function setCookieChecks(c) {
    var p = doc.getElementById('cbPreferences'); if (p) p.checked = !!(c && c.preferences);
    var s = doc.getElementById('cbStatistics'); if (s) s.checked = !!(c && c.statistics);
    var m = doc.getElementById('cbMarketing'); if (m) m.checked = !!(c && c.marketing);
  }
  function setCookieStatus(data) {
    var el = doc.getElementById('ckStatus'); if (!el) return;
    var en = currentLang === 'en';
    if (!data) { el.textContent = en ? 'No choice saved yet' : 'Nog geen keuze opgeslagen'; return; }
    var d = new Date(data.ts);
    var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
    el.textContent = (en ? 'Saved on ' : 'Opgeslagen op ') + dd + '-' + mm + '-' + d.getFullYear();
  }
  function initCookiePrefs() {
    if (!doc.getElementById('prefCenter')) return;
    var fn = doc.getElementById('cbFunctional');
    if (fn) { fn.checked = true; fn.disabled = true; fn.addEventListener('click', function (e) { e.preventDefault(); fn.checked = true; }); }
    setCookieChecks(readConsent() || {});
    setCookieStatus(readConsent());
    // let the consent banner refresh this panel after accept/reject
    window.__timPrefSync = function () { setCookieChecks(readConsent() || {}); setCookieStatus(readConsent()); };
    var flashTimer;
    function save(c, en, nl) {
      var d = writeConsent(c);
      setCookieChecks(d);
      var el = doc.getElementById('ckStatus');
      if (el) {
        el.textContent = currentLang === 'en' ? en : nl;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { setCookieStatus(readConsent()); }, 2400);
      }
      if (window.TimCookies && window.TimCookies.removeBanner) window.TimCookies.removeBanner();
    }
    var acc = doc.getElementById('ckAcceptAll');
    if (acc) acc.addEventListener('click', function () { save({ preferences: true, statistics: true, marketing: true }, 'All cookies accepted ✓', 'Alle cookies geaccepteerd ✓'); });
    var rej = doc.getElementById('ckRejectAll');
    if (rej) rej.addEventListener('click', function () { save({ preferences: false, statistics: false, marketing: false }, 'Functional cookies only ✓', 'Alleen functionele cookies ✓'); });
    var sav = doc.getElementById('ckSave');
    if (sav) sav.addEventListener('click', function () {
      save({
        preferences: !!(doc.getElementById('cbPreferences') || {}).checked,
        statistics: !!(doc.getElementById('cbStatistics') || {}).checked,
        marketing: !!(doc.getElementById('cbMarketing') || {}).checked
      }, 'Preferences saved ✓', 'Voorkeuren opgeslagen ✓');
    });
  }

  onReady(function () { initReveal(); initLang(); initMobileNav(); initParallax(); watchCookieBanner(); initCookiePrefs(); initBioOverlay(); initBooking(); initContactForm(); });
})();
