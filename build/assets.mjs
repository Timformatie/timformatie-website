// Generate brand images (social card + favicons) with headless Chrome.
// Run on demand (not part of the per-page build):  cd build && node assets.mjs
// Outputs are committed; rerun only when the branding changes.

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ASSETS = join(ROOT, 'assets');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const FONT = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">`;

// 1200x630 Open Graph / social card
const ogCard = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{margin:0;box-sizing:border-box}
#card{width:1200px;height:630px;background:#0F2A3D;color:#F5F1E8;font-family:'Archivo',sans-serif;
  padding:74px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.ghost{position:absolute;right:-60px;bottom:-120px;font-size:560px;font-weight:900;color:rgba(94,227,177,0.07);line-height:1}
.brand{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:800;letter-spacing:-0.02em;z-index:1}
.dot{color:#5EE3B1}
.tag{font-family:'JetBrains Mono',monospace;font-size:19px;letter-spacing:0.16em;text-transform:uppercase;color:#5EE3B1;font-weight:600;margin-bottom:22px;z-index:1}
h1{font-size:92px;font-weight:800;line-height:0.98;letter-spacing:-0.02em;z-index:1}
mark{background:#5EE3B1;color:#0F2A3D;padding:0 .12em;border-radius:4px}
.sub{font-size:30px;color:rgba(245,241,232,0.82);max-width:880px;margin-top:26px;font-weight:600;z-index:1}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:22px;color:rgba(245,241,232,0.7);z-index:1;font-weight:600}
.pill{background:#C8A04A;color:#0F2A3D;padding:8px 18px;border-radius:999px;font-weight:700}
</style></head><body><div id="card">
  <div class="ghost">t.</div>
  <div class="brand">timformatie<span class="dot">.</span></div>
  <div>
    <div class="tag">Open source dataplatformen</div>
    <h1>Van data naar <mark>actie</mark>.</h1>
    <div class="sub">Open, soevereine dataplatformen voor de zorg in Nederland — zonder vendor lock-in.</div>
  </div>
  <div class="foot"><span>timformatie.nl</span><span class="pill">FHIR &amp; OMOP · Zorg &amp; onderwijs</span></div>
</div></body></html>`;

// Square brand mark for favicons (transparent rounded background)
const favicon = (size, radius) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{margin:0;box-sizing:border-box}html,body{background:transparent}
#m{width:${size}px;height:${size}px;background:#0F2A3D;border-radius:${radius}px;
  display:flex;align-items:center;justify-content:center;font-family:'Archivo',sans-serif;
  font-weight:900;color:#F5F1E8;font-size:${Math.round(size * 0.62)}px;letter-spacing:-0.04em}
.dot{color:#5EE3B1}
</style></head><body><div id="m">t<span class="dot">.</span></div></body></html>`;

async function shoot(browser, html, sel, path, scale = 1) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 250));
  const el = await page.$(sel);
  await el.screenshot({ path, omitBackground: true });
  await page.close();
  console.log('✓', path.replace(ROOT + '/', ''));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
mkdirSync(join(ASSETS, 'og'), { recursive: true });
await shoot(browser, ogCard, '#card', join(ASSETS, 'og', 'og-default.png'));
await shoot(browser, favicon(512, 96), '#m', join(ASSETS, 'favicon.png'));
await shoot(browser, favicon(180, 36), '#m', join(ASSETS, 'apple-touch-icon.png'));
await shoot(browser, favicon(32, 6), '#m', join(ASSETS, 'favicon-32.png'));
await browser.close();
console.log('done');
