/**
 * The one HTML transform shared by the server (live) and the static export, so both produce the same pages:
 *
 * 1. Named links: `<a data-site-link="calendar-google" href="#">` gets its `href` from site settings
 *    (`src/site.mts`), so values like the calendar ID live in one place instead of in page markup.
 * 2. Asset fingerprints (export only): local `assets/…` references get `?v=<content hash>`. A changed file
 *    gets a new URL, so browsers fetch it immediately; unchanged files can be cached for a year. This is
 *    what makes a "disable caching" switch unnecessary.
 * 3. Current year: `<span data-current-year>` (the footer's copyright) gets the year the page is built, so it
 *    never goes stale as long as the site is rebuilt (every merge deploys).
 * 4. Canonical URL and link previews (export only): `<link rel="canonical">` naming the page's one real
 *    address, so search engines fold workers.dev, preview, and `?utm_…` copies into it; plus `og:title`,
 *    `og:description`, and `og:url` copied from the page's own title, description, and that address, so
 *    shared links get a proper preview card without anyone keeping two copies in sync.
 *
 * Interim: a template engine (the Astro migration, issue #29) replaces this when pages become templates.
 */

export interface RenderContext {
  /** Named link targets, e.g. from `siteLinks()`. Unknown names are an error, not a silent `#`. */
  links: Readonly<Record<string, string>>;
  /** Returns a version token for a site-root-relative asset path (e.g. `assets/x.css`), or undefined to leave it. */
  assetVersion?: (assetPath: string) => string | undefined;
  /**
   * Absolute URL of the page's canonical address; also turns on the generated link-preview (`og:`) tags.
   * Omitted for the live server and the 404 page.
   */
  canonicalUrl?: string;
  /** Year for `data-current-year`; defaults to the current year (tests pass a fixed one). */
  year?: number;
}

const CURRENT_YEAR = /(<span\b[^>]*\bdata-current-year\b[^>]*>)[^<]*(<\/span>)/g;
const TAG_WITH_SITE_LINK = /<a\b[^>]*\bdata-site-link="([^"]+)"[^>]*>/g;
/** `assets/…` or root-absolute `/assets/…` (the 404 page uses absolute URLs: it's served at any depth). */
const ASSET_ATTR = /\b(href|src)="(\/?)(assets\/[^"?#]+)(?:\?[^"#]*)?(#[^"]*)?"/g;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function renderPage(html: string, ctx: RenderContext): string {
  let out = html.replace(TAG_WITH_SITE_LINK, (tag: string, name: string) => {
    // hasOwn, not `in`/lookup: names like "constructor" must not resolve to Object.prototype members.
    if (!Object.hasOwn(ctx.links, name)) throw new Error(`Unknown data-site-link "${name}"`);
    const href = `href="${escapeAttr(ctx.links[name] ?? '')}"`;
    return /\bhref="[^"]*"/.test(tag) ? tag.replace(/\bhref="[^"]*"/, href) : tag.replace(/>$/, ` ${href}>`);
  });

  const year = String(ctx.year ?? new Date().getFullYear());
  out = out.replace(CURRENT_YEAR, (_whole: string, open: string, close: string) => `${open}${year}${close}`);

  const { assetVersion } = ctx;
  if (assetVersion) {
    out = out.replace(ASSET_ATTR, (whole: string, attr: string, slash: string, path: string, hash: string | undefined) => {
      const version = assetVersion(path);
      return version ? `${attr}="${slash}${path}?v=${version}${hash ?? ''}"` : whole;
    });
  }
  if (ctx.canonicalUrl !== undefined) out = addHeadTags(out, ctx.canonicalUrl);
  return out;
}

const GENERATED_TAG = /<link\b[^>]*\brel="canonical"|<meta\b[^>]*\bproperty="og:(?:title|description|url)"/;

/** Canonical link and `og:` tags, generated from the page itself so there's one source of truth. */
function addHeadTags(html: string, canonicalUrl: string): string {
  // A hand-written copy would drift from what's generated here, so it's an error rather than a duplicate.
  if (GENERATED_TAG.test(html)) throw new Error('Page already has a canonical link or og:title/description/url; the export adds them');
  if (!html.includes('</head>')) throw new Error('Page has no </head> to add a canonical link to');
  // Title is HTML text and the description an attribute value: both are already escaped, so only quotes need it.
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim();
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!title || !description) throw new Error('Page needs a <title> and a meta description for its link preview');
  const tags = [
    `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">`,
    `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${escapeAttr(canonicalUrl)}">`,
  ];
  return html.replace('</head>', `${tags.map((t) => `  ${t}\n`).join('')}</head>`);
}
