// Static-site build for Timformatie.
//
// Pipeline per page:
//   1. Serve the repo root and render the .dc.html source in headless Chrome so the
//      dc-runtime produces its JS-generated fragments (e.g. the hero graphic).
//   2. Transform the *source* (which keeps style-hover / data-* intact) into clean
//      static HTML: proper <head>, style-hover -> CSS, clean internal URLs, and the
//      recovered dynamic fragments spliced back in.
//   3. Write to dist/. Also emits robots.txt and sitemap.xml.
//
// Run:  cd build && node build.mjs        (Chrome must be installed)

import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, ORG, PAGES, LINK_MAP } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');   // .dc.html sources + support.js live here
const OUT = ROOT;                // built static site is served from the repo root
const PORT = 8123;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

// ---- helpers ---------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

// Rewrite every internal *.dc.html reference (in href/text) to its clean URL.
function rewriteLinks(str) {
  let out = str;
  for (const [src, path] of Object.entries(LINK_MAP)) {
    out = out.split(src).join(path);
  }
  return out;
}

function hoverWithImportant(decls) {
  return decls.split(';').map(d => d.trim()).filter(Boolean)
    .map(d => /!important$/.test(d) ? d : d + ' !important').join('; ');
}

// ---- static server ---------------------------------------------------------
function startServer() {
  return new Promise((res) => {
    const server = http.createServer((req, rep) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      // Resolve sources from src/ first (.dc.html, support.js), then root (assets/).
      const file = [join(SRC, p), join(ROOT, p)]
        .find(f => f.startsWith(ROOT) && existsSync(f) && statSync(f).isFile());
      if (!file) { rep.writeHead(404); rep.end('not found'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(rep);
    });
    server.listen(PORT, () => res(server));
  });
}

// ---- render one page in headless Chrome ------------------------------------
async function renderSource(browser, src) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/${src}`, { waitUntil: 'networkidle0', timeout: 60000 });
  // nudge the runtime: scroll through so any lazily-built graphics mount
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 800));
  const html = await page.content();
  await page.close();
  return { html, errs };
}

// Add a hamburger button + slide-down mobile menu, cloned from the page's own
// desktop nav. Runs before the hover/link passes so the clones get processed too.
function injectMobileNav(xdc, doc) {
  const header = xdc.querySelector('header');
  if (!header) return;
  const desktopNav = header.querySelector('nav[data-nav]');
  if (!desktopNav) return;
  const rightDiv = desktopNav.parentElement?.lastElementChild || header;

  const btn = doc.createElement('button');
  btn.id = 'navToggle';
  btn.type = 'button';
  btn.className = 'dc-navtoggle';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'mobileNav');
  btn.innerHTML = '<span></span><span></span><span></span>';
  rightDiv.appendChild(btn);

  const panel = doc.createElement('nav');
  panel.id = 'mobileNav';
  panel.className = 'dc-mobilenav';
  panel.setAttribute('aria-label', 'Hoofdmenu');
  panel.setAttribute('hidden', '');
  const inner = doc.createElement('div');
  inner.className = 'dc-mobilenav-inner';
  for (const a of desktopNav.querySelectorAll('a')) {
    const c = a.cloneNode(true);
    c.removeAttribute('data-nav');
    inner.appendChild(c);
  }
  const cta = header.querySelector('a[data-nav]');
  if (cta) {
    const c = cta.cloneNode(true);
    c.removeAttribute('data-nav');
    c.classList.add('dc-mobile-cta');
    inner.appendChild(c);
  }
  panel.appendChild(inner);
  header.insertAdjacentElement('afterend', panel);
}

// Build a single JSON-LD @graph per page: Organization + WebSite (stable brand
// entities), the WebPage itself, and a BreadcrumbList on inner pages.
function structuredData(page, title, desc) {
  const ORG_ID = ORG.url + '#organization';
  const SITE_ID = ORG.url + '#website';
  const canonical = SITE.baseUrl + page.path;

  const organization = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORG.name,
    url: ORG.url,
    logo: ORG.logo,
    description: ORG.description,
    email: ORG.email,
    telephone: ORG.telephone,
    sameAs: ORG.sameAs,
    areaServed: ORG.areaServed,
    foundingLocation: ORG.foundingLocation,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ORG.address.street,
      postalCode: ORG.address.postalCode,
      addressLocality: ORG.address.locality,
      addressRegion: ORG.address.region,
      addressCountry: ORG.address.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: ORG.email,
      telephone: ORG.telephone,
      areaServed: ORG.areaServed,
      availableLanguage: ['nl', 'en'],
    },
  };

  const website = {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: ORG.url,
    name: ORG.name,
    inLanguage: 'nl-NL',
    publisher: { '@id': ORG_ID },
  };

  const webpage = {
    '@type': 'WebPage',
    '@id': canonical + '#webpage',
    url: canonical,
    name: title,
    description: desc,
    inLanguage: 'nl-NL',
    isPartOf: { '@id': SITE_ID },
    about: { '@id': ORG_ID },
  };

  const graph = [organization, website, webpage];

  if (page.path !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORG.url + '/' },
        { '@type': 'ListItem', position: 2, name: page.label, item: canonical },
      ],
    });
  }

  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

// ---- transform source -> clean static HTML ---------------------------------
function transform({ source, rendered, page }) {
  const srcDom = new JSDOM(source);
  const srcDoc = srcDom.window.document;
  const renDoc = new JSDOM(rendered).window.document;

  const xdc = srcDoc.querySelector('x-dc');
  if (!xdc) throw new Error('no <x-dc> block');
  const helmet = xdc.querySelector('helmet');

  // --- pull head pieces from helmet
  const title = helmet?.querySelector('title')?.textContent?.trim() || SITE.siteName;
  const desc = helmet?.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  const headExtras = []; // font links, page <style>, cookie <script>, page-level ld+json
  if (helmet) {
    for (const el of [...helmet.children]) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'title') continue;
      if (tag === 'meta') continue; // description + viewport handled explicitly
      // drop existing (inconsistent) JSON-LD; we emit a unified graph below
      if (tag === 'script' && el.getAttribute('type') === 'application/ld+json') continue;
      // drop Google Fonts (preconnect + stylesheet); fonts are self-hosted
      if (tag === 'link') {
        const href = el.getAttribute('href') || '';
        if (href.includes('fonts.googleapis.com') || href.includes('fonts.gstatic.com')) continue;
      }
      headExtras.push(rewriteLinks(el.outerHTML));
    }
    helmet.remove();
  }

  // --- add mobile navigation (cloned from desktop nav) before hover/link passes
  injectMobileNav(xdc, srcDoc);

  // --- tag every NL/EN switch control so enhance.js can wire it consistently
  // (markup varies across pages: langNL/langEN, langNLb/langENb, bare <a>/<span>)
  for (const el of xdc.querySelectorAll('a, button, span')) {
    const t = el.textContent.trim();
    if (t !== 'NL' && t !== 'EN') continue;
    el.setAttribute('data-setlang', t === 'NL' ? 'nl' : 'en');
    // The homepage toggle uses <span>/<a> (text-selectable); on mobile a tap can
    // select the label and the selection highlight then hides it until you tap
    // elsewhere. Make every control non-selectable from first paint (no JS needed).
    const sel = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';
    el.setAttribute('style', `${el.getAttribute('style') || ''}${el.getAttribute('style') ? ';' : ''}${sel}`);
  }

  // --- splice JS-generated fragments: elements empty in source but filled after render
  for (const el of xdc.querySelectorAll('[id]')) {
    if (el.innerHTML.trim() === '') {
      const r = renDoc.getElementById(el.id);
      if (r && r.innerHTML.trim() !== '') el.innerHTML = r.innerHTML;
    }
  }

  // --- style-hover -> scoped CSS classes (hover needs !important to beat inline style)
  const hoverClassByDecls = new Map();
  let n = 0;
  for (const el of xdc.querySelectorAll('[style-hover]')) {
    const decls = el.getAttribute('style-hover').trim();
    el.removeAttribute('style-hover');
    if (!decls) continue;
    let cls = hoverClassByDecls.get(decls);
    if (!cls) { cls = 'dh' + (n++); hoverClassByDecls.set(decls, cls); }
    el.classList.add(cls);
  }
  const hoverCss = [...hoverClassByDecls.entries()]
    .map(([decls, cls]) => `.${cls}:hover{${hoverWithImportant(decls)}}`).join('\n');

  // --- rewrite internal links on anchors
  for (const a of xdc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    const [base, frag] = href.split('#');
    if (LINK_MAP[base]) a.setAttribute('href', LINK_MAP[base] + (frag ? '#' + frag : ''));
  }

  // --- make Formspree's _next redirect absolute against the deploy domain
  // (so a no-JS submission lands on our own thank-you page, not formspree.io).
  // A root-relative placeholder in source becomes baseUrl + path at build time,
  // so it tracks the dev/apex domain automatically.
  for (const inp of xdc.querySelectorAll('input[name="_next"]')) {
    const v = inp.getAttribute('value') || '';
    if (v.startsWith('/')) inp.setAttribute('value', SITE.baseUrl + v);
  }

  // --- remove the dc-runtime embedded script; body is the remaining x-dc content
  xdc.querySelector('script[data-dc-script]')?.remove();
  const bodyHtml = xdc.innerHTML;

  // --- assemble <head>
  const canonical = SITE.baseUrl + page.path;
  const ogUrl = canonical;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // Light-only design: opt out of browser/OS auto dark-mode (esp. Chrome on Android).
    '<meta name="color-scheme" content="light">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${attr(desc)}">`,
    SITE.noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">',
    `<link rel="canonical" href="${attr(canonical)}">`,
    // Open Graph
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${attr(SITE.siteName)}">`,
    `<meta property="og:locale" content="${attr(SITE.locale)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:url" content="${attr(ogUrl)}">`,
    `<meta property="og:image" content="${attr(SITE.baseUrl + SITE.ogImage)}">`,
    `<meta property="og:image:alt" content="${attr(SITE.ogImageAlt)}">`,
    // Twitter
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(desc)}">`,
    `<meta name="twitter:image" content="${attr(SITE.baseUrl + SITE.ogImage)}">`,
    // Structured data (Organization + WebSite + WebPage [+ BreadcrumbList])
    structuredData(page, title, desc),
    // Icons (generated by build/assets.mjs)
    `<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">`,
    `<link rel="icon" type="image/png" sizes="512x512" href="/assets/favicon.png">`,
    `<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">`,
    // self-hosted fonts (replaces Google Fonts CDN)
    `<link rel="stylesheet" href="/assets/fonts/fonts.css">`,
    ...headExtras,
    hoverCss ? `<style>${hoverCss}</style>` : '',
    // reveal gating + visible focus + mobile navigation
    `<style>html.dc-js [data-reveal]{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}html.dc-js [data-reveal].dc-in{opacity:1;transform:none}a:focus-visible,button:focus-visible{outline:2px solid #5F8368;outline-offset:2px}` +
      `.dc-navtoggle{display:none;flex-direction:column;justify-content:center;gap:5px;width:46px;height:42px;padding:0 11px;border:1px solid rgba(15,42,61,0.18);border-radius:11px;background:#FBF9F2;cursor:pointer}` +
      `.dc-navtoggle span{display:block;height:2px;width:100%;background:#0F2A3D;border-radius:2px;transition:transform .22s ease,opacity .22s ease}` +
      `.dc-navtoggle[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}` +
      `.dc-navtoggle[aria-expanded="true"] span:nth-child(2){opacity:0}` +
      `.dc-navtoggle[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}` +
      `.dc-mobilenav{display:none;background:rgba(245,241,232,0.98);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(15,42,61,0.1);position:sticky;top:62px;z-index:55}` +
      `.dc-mobilenav-inner{max-width:1280px;margin:0 auto;padding:10px 22px 22px;display:flex;flex-direction:column}` +
      `.dc-mobilenav a{padding:14px 6px;font-size:17px;font-weight:600;color:#0F2A3D;text-decoration:none;border-bottom:1px solid rgba(15,42,61,0.07)}` +
      `.dc-mobilenav a.dc-mobile-cta{margin-top:16px;border:none;background:#C8A04A;border-radius:999px;text-align:center;padding:15px 20px}` +
      // desktop "Over ons" dropdown (CSS-only hover/focus; the nested link is cloned flat into the mobile menu)
      `.dc-navgroup{position:relative;display:inline-flex;align-items:center}` +
      `.dc-navgroup>a::after{content:"";display:inline-block;width:6px;height:6px;margin-left:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:translateY(-2px) rotate(45deg);opacity:0.5;transition:transform .2s ease,opacity .2s ease}` +
      `.dc-navgroup:hover>a::after,.dc-navgroup:focus-within>a::after{transform:translateY(0) rotate(225deg);opacity:0.9}` +
      `.dc-submenu{position:absolute;top:100%;left:-14px;margin-top:12px;min-width:190px;background:#FBF9F2;border:1px solid rgba(15,42,61,0.1);border-radius:14px;box-shadow:0 16px 40px rgba(15,42,61,0.14);padding:8px;opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease,visibility .18s ease;z-index:60}` +
      `.dc-submenu::before{content:"";position:absolute;bottom:100%;left:0;right:0;height:14px}` +
      `.dc-navgroup:hover .dc-submenu,.dc-navgroup:focus-within .dc-submenu{opacity:1;visibility:visible;transform:translateY(0)}` +
      `.dc-submenu a{display:block;padding:10px 13px;border-radius:9px;font-size:14.5px;font-weight:600;color:rgba(15,42,61,0.68);text-decoration:none;white-space:nowrap}` +
      `.dc-submenu a:hover{background:rgba(94,227,177,0.16);color:#0F2A3D}` +
      `@media(max-width:900px){.dc-navtoggle{display:flex}.dc-mobilenav:not([hidden]){display:block}}</style>`,
    `<script src="/assets/js/enhance.js" defer></script>`,
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="${SITE.lang}">
<head>
${head}
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

// ---- 404 page (hand-written static, no <x-dc>) -----------------------------
// Passthrough: drop Google Fonts, link self-hosted fonts, clean internal URLs.
function build404() {
  let html = readFileSync(join(SRC, '404.html'), 'utf8');
  html = html.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '');
  html = html.replace('</head>', '<meta name="color-scheme" content="light">\n<link rel="stylesheet" href="/assets/fonts/fonts.css">\n</head>');
  html = rewriteLinks(html);
  writeFileSync(join(OUT, '404.html'), html);
  console.log('✓ 404.html (passthrough: fonts + clean URLs)');
}

// ---- sitemap + robots ------------------------------------------------------
function writeRobotsAndSitemap() {
  const robots = SITE.noindex
    ? `# Dev deployment — keep out of search indexes.\nUser-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\n\n# AI search crawlers welcome\nUser-agent: GPTBot\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${SITE.baseUrl}/sitemap.xml\n`;
  writeFileSync(join(OUT, 'robots.txt'), robots);

  const urls = PAGES.filter(p => !p.noSitemap).map(p => `  <url><loc>${SITE.baseUrl}${p.path}</loc></url>`).join('\n');
  writeFileSync(join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  // llms.txt — concise, machine-readable site summary for AI tools.
  const pageList = PAGES.filter(p => !p.noSitemap).map(p => `- [${p.label}](${SITE.baseUrl}${p.path})`).join('\n');
  const llms = `# Timformatie

> ${ORG.description}

Timformatie bouwt open source dataplatformen voor de zorg en het onderwijs in Nederland: soevereiniteit by design, geen vendor lock-in, en ondersteuning voor standaarden als FHIR en OMOP. Van data naar actie — dataplatformen, datastrategie en interactieve data- en AI-toepassingen.

Ons open source dataplatform heet SRDP (https://srdphub.com/).

## Pagina's
${pageList}

## Contact
- E-mail: ${ORG.email}
- Telefoon: +31 6 29472470
- LinkedIn: ${ORG.sameAs[0]}
- Adres: ${ORG.address.street}, ${ORG.address.postalCode} ${ORG.address.locality}, ${ORG.address.country}
`;
  writeFileSync(join(OUT, 'llms.txt'), llms);
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (!existsSync(CHROME)) { console.error('Chrome not found at', CHROME); process.exit(1); }
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  console.log(`Building ${PAGES.length} pages -> repo root\n`);

  let ok = 0;
  for (const page of PAGES) {
    try {
      const source = readFileSync(join(SRC, page.src), 'utf8');
      const { html: rendered, errs } = await renderSource(browser, page.src);
      const out = transform({ source, rendered, page });
      writeFileSync(join(OUT, page.out), out);
      const note = errs.length ? `  ⚠ ${errs.length} page error(s)` : '';
      console.log(`✓ ${page.src.padEnd(34)} -> ${page.out.padEnd(28)} (${(out.length / 1024).toFixed(0)} KB)${note}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${page.src}: ${e.message}`);
    }
  }

  build404();
  writeRobotsAndSitemap();
  console.log(`\nWrote robots.txt + sitemap.xml + llms.txt`);
  console.log(`Done: ${ok}/${PAGES.length} pages.`);
  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
