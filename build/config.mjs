// Central build configuration for the Timformatie static site.
// Pre-render pipeline: render each .dc.html source with the dc-runtime in headless
// Chrome to recover JS-generated fragments, then emit clean static HTML.

export const SITE = {
  // Production target is timformatie.nl; during the dev phase we deploy to the
  // dev subdomain and keep the site out of the index. Flip both at go-live:
  //   baseUrl -> 'https://timformatie.nl'  and  noindex -> false
  baseUrl: 'https://dev-website.timformatie.nl',
  noindex: true,
  lang: 'nl',
  siteName: 'Timformatie',
  locale: 'nl_NL',
  twitter: '', // add @handle when available
  // TODO: replace with a purpose-built 1200x630 social card.
  ogImage: '/assets/logo/logo-sage.png',
  ogImageAlt: 'Timformatie — open source dataplatformen voor de zorg',
};

// Real site pages only. Exploration/variant files are intentionally excluded and
// will be removed from the repo in the cleanup step.
//   src  : source file at repo root
//   out  : output filename in dist/
//   path : canonical path (used for <link rel=canonical> and sitemap)
export const PAGES = [
  { src: 'Home.dc.html',                out: 'index.html',                 path: '/' },
  { src: 'Expertise.dc.html',           out: 'expertise.html',             path: '/expertise.html' },
  { src: 'Projecten.dc.html',           out: 'projecten.html',             path: '/projecten.html' },
  { src: 'OverOns.dc.html',             out: 'over-ons.html',              path: '/over-ons.html' },
  { src: 'Contact.dc.html',             out: 'contact.html',               path: '/contact.html' },
  { src: 'WerkenBij.dc.html',           out: 'werken-bij.html',            path: '/werken-bij.html' },
  { src: 'Helpdesk.dc.html',            out: 'helpdesk.html',              path: '/helpdesk.html' },
  { src: 'RShiny.dc.html',              out: 'r-shiny.html',               path: '/r-shiny.html' },
  { src: 'Informatiebeveiliging.dc.html', out: 'informatiebeveiliging.html', path: '/informatiebeveiliging.html' },
  { src: 'Privacy.dc.html',             out: 'privacy.html',               path: '/privacy.html' },
  { src: 'Cookiebeleid.dc.html',        out: 'cookiebeleid.html',          path: '/cookiebeleid.html' },
];

// Map every internal .dc.html reference -> clean URL (root-absolute, works on
// both the dev subdomain and the apex domain since both serve from /).
export const LINK_MAP = Object.fromEntries(PAGES.map(p => [p.src, p.path]));
