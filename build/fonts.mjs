// Self-host the Google Fonts used by the site (GDPR + performance).
// Downloads woff2 files + writes assets/fonts/fonts.css. Run on demand:
//   cd build && node fonts.mjs
// Outputs are committed; rerun only when the font set changes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FONT_DIR = join(ROOT, 'assets', 'fonts');

// Superset of every family/weight used across the pages.
const API = 'https://fonts.googleapis.com/css2'
  + '?family=Archivo:wght@500;600;700;800;900'
  + '&family=Source+Sans+3:wght@400;500;600;700'
  + '&family=JetBrains+Mono:wght@500;600'
  + '&display=swap';

// Keep Latin subsets only (site is NL/EN); drop cyrillic/greek/vietnamese.
const KEEP = new Set(['latin', 'latin-ext']);
// Modern UA so Google serves woff2.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

mkdirSync(FONT_DIR, { recursive: true });
const css = await fetch(API, { headers: { 'User-Agent': UA } }).then(r => r.text());

const blockRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g;
let out = '';
let downloaded = 0, skipped = 0;
const seen = new Set();

for (const m of css.matchAll(blockRe)) {
  const subset = m[1];
  const body = m[2];
  if (!KEEP.has(subset)) { skipped++; continue; }
  const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
  const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1];
  const url = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1];
  if (!family || !weight || !url) continue;

  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const file = `${slug}-${weight}-${subset}.woff2`;
  if (!seen.has(file)) {
    const buf = Buffer.from(await fetch(url, { headers: { 'User-Agent': UA } }).then(r => r.arrayBuffer()));
    writeFileSync(join(FONT_DIR, file), buf);
    seen.add(file);
    downloaded++;
  }
  out += `/* ${family} ${weight} ${subset} */\n@font-face{${body.replace(/src:[^;]+;/, `src:url(/assets/fonts/${file}) format('woff2');`).replace(/\s+/g, ' ').trim()}}\n`;
}

writeFileSync(join(FONT_DIR, 'fonts.css'), out);
console.log(`Downloaded ${downloaded} woff2 files (skipped ${skipped} non-Latin blocks).`);
console.log(`Wrote assets/fonts/fonts.css (${out.length} bytes).`);
