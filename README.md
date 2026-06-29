# Timformatie — website

Source for the [Timformatie](https://timformatie.nl) website: a fast, fully
**pre-rendered static site** with no client-side framework at runtime.

> **Timformatie** is an open-source data platform company for the **healthcare**
> (and education) sector in the Netherlands. We build open, sovereign data
> platforms, data strategy, and interactive data & AI applications — without
> vendor lock-in. *Van data naar actie.*

> ℹ️ **This repository is the marketing website, not the platform itself.**
> Our open-source data platform is **SRDP** — see <https://srdphub.com/>.

---

## How it works

Pages are authored as `*.dc.html` component files (a design-tool format that, in
the browser, hydrates via React at runtime). Shipping that directly would be slow
and invisible to search/AI crawlers, so a build step **pre-renders** each page to
clean, self-contained static HTML.

**Build pipeline** (`build/build.mjs`):

1. Serves `src/` and renders each `*.dc.html` in **headless Chrome**, so any
   JS-generated fragments (e.g. the hero graphic) are produced.
2. Transforms the *source* into static HTML: builds a proper `<head>`
   (title, description, canonical, Open Graph/Twitter, JSON-LD), converts
   `style-hover` attributes to real CSS `:hover` rules, rewrites internal links to
   clean URLs, injects a mobile nav, and splices the recovered dynamic fragments
   back in.
3. Writes the finished pages to the repo root and emits `robots.txt`,
   `sitemap.xml`, and `llms.txt`.

The result loads **zero external resources** — fonts are self-hosted and there is
no runtime JS framework. Light interactivity (scroll reveal, NL/EN toggle, mobile
menu) is handled by one small, dependency-free script, `assets/js/enhance.js`,
with graceful no-JS fallbacks.

## Project structure

```
.
├── src/                     # PAGE SOURCES — edit these
│   ├── *.dc.html            #   one per page (Home, Expertise, …) + 404.html
│   └── support.js           #   dc-runtime, used only during the build render step
├── build/                   # BUILD TOOLING
│   ├── build.mjs            #   pre-render + transform pipeline  (npm run build)
│   ├── config.mjs           #   site settings, page map, clean-URL scheme
│   ├── fonts.mjs            #   download + self-host Google Fonts
│   └── assets.mjs           #   generate social card + favicons
├── assets/                  # static assets (logos, photos, fonts, js, og image)
├── *.html                   # BUILD OUTPUT — generated, do not edit by hand
├── robots.txt, sitemap.xml, llms.txt   # generated
├── CNAME, .nojekyll         # GitHub Pages config
└── README.md, LICENSE, SECURITY.md
```

## Local development

**Prerequisites:** [Node.js](https://nodejs.org) 18+ and **Google Chrome**
(used by `puppeteer-core` for rendering — no separate browser download).

```bash
# 1. install build dependencies (once)
cd build && npm install

# 2. build the static site (outputs *.html to the repo root)
npm run build            # = node build.mjs

# 3. preview from the repo root
cd .. && python3 -m http.server 8000
#   open http://localhost:8000
```

### Editing a page
Edit the relevant file in `src/` (e.g. `src/Expertise.dc.html`), then rerun
`npm run build`. Never edit the generated `*.html` at the repo root — they are
overwritten on every build.

### Regenerating brand assets (only when branding changes)
```bash
cd build
node fonts.mjs     # re-download self-hosted fonts -> assets/fonts/
node assets.mjs    # regenerate OG social card + favicons -> assets/
```

## Deployment

Hosted on **GitHub Pages**, served from the **root of `main`** (`.nojekyll`
disables Jekyll so files are served as-is). Pushing/merging to `main` triggers a
deploy. The custom domain is set via `CNAME`.

The site is currently deployed to the **dev** subdomain and kept out of search
indexes (`noindex`). **To go live on the production domain**, change two values in
[`build/config.mjs`](build/config.mjs) and rebuild:

```js
baseUrl: 'https://timformatie.nl',   // was: dev-website.timformatie.nl
noindex: false,                       // was: true
```

…then update `CNAME` accordingly.

## Contributing

1. Branch from `main`.
2. Make changes in `src/` (or `build/` / `assets/`), run `npm run build`, and
   preview locally.
3. Commit the source **and** the regenerated output, and open a pull request.

Please keep images optimized (web-appropriate dimensions; the build assumes
already-compressed assets) and prefer semantic, accessible HTML.

## Contact

- **General / inquiries:** [info@timformatie.nl](mailto:info@timformatie.nl)
- **Security:** [security@timformatie.nl](mailto:security@timformatie.nl) — see [SECURITY.md](SECURITY.md)
- **Careers:** [sollicitatie@timformatie.nl](mailto:sollicitatie@timformatie.nl)
- **LinkedIn:** <https://www.linkedin.com/company/69914196/>
- **Web:** <https://timformatie.nl>

## License

Source code in this repository is licensed under the **Apache License 2.0** — see
[LICENSE](LICENSE).

**Brand assets are not covered by that license.** All Timformatie trademarks,
logos, the visual identity, photography, and written site content remain
© Timformatie and may not be reused without permission. See [NOTICE](NOTICE).
