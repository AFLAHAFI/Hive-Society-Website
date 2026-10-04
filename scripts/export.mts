/**
 * Static export: builds `dist/` from `public/` for hosts that only serve files
 * (Cloudflare, DO Spaces/App Platform static, any nginx/Caddy).
 *
 * Steps: copy public/ → dist/, render every page (named links from content/site.yaml, `?v=<hash>`
 * fingerprints on asset references; see src/render.mts), then write robots.txt / sitemap.xml / _headers.
 *
 * Usage: node scripts/export.mts   (SITE_URL=https://example.com overrides the canonical origin; OUT_DIR, the output folder)
 */
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderPage } from '../src/render.mts';
import { loadSite, siteLinks } from '../src/site.mts';

const SRC = resolve('public');
const OUT = resolve(process.env.OUT_DIR ?? 'dist');
const SITE_URL = (process.env.SITE_URL ?? 'https://hivesocietyimprov.com').replace(/\/$/, '');

async function clean(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await cp(SRC, OUT, { recursive: true });
}

/**
 * Renders every page with site links and asset fingerprints. The version is a hash of the file's
 * bytes, so it changes exactly when the file does. Missing files are left untouched here and caught
 * by the link test.
 */
async function renderPages(): Promise<void> {
  const links = siteLinks(await loadSite());
  const versions = new Map<string, string | undefined>();
  const versionOf = async (assetPath: string): Promise<string | undefined> => {
    if (!versions.has(assetPath)) {
      const bytes = await readFile(join(OUT, assetPath)).catch(() => undefined);
      versions.set(assetPath, bytes && createHash('sha256').update(bytes).digest('hex').slice(0, 10));
    }
    return versions.get(assetPath);
  };

  const pages = (await readdir(OUT)).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const html = await readFile(join(OUT, page), 'utf8');
    // Resolve every referenced asset's version up front; renderPage itself is synchronous.
    for (const [, path = ''] of html.matchAll(/\b(?:href|src)="\/?(assets\/[^"?#]+)/g)) await versionOf(path);
    const canonicalUrl = page === NOT_FOUND_PAGE ? undefined : pageUrl(page);
    await writeFile(join(OUT, page), renderPage(html, { links, assetVersion: (p) => versions.get(p), canonicalUrl }));
  }
}

/** The 404 page isn't a destination: no canonical URL, not in the sitemap. */
const NOT_FOUND_PAGE = '404.html';

/** Extensionless URL, matching how Cloudflare (and src/server.mts) serve `foo.html` at `/foo`. */
function pageUrl(file: string): string {
  return file === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${file.slice(0, -'.html'.length)}`;
}

async function pageUrls(): Promise<string[]> {
  const files = await readdir(OUT);
  return files.filter((f) => f.endsWith('.html') && f !== NOT_FOUND_PAGE).sort().map(pageUrl);
}

async function writeMeta(): Promise<void> {
  const urls = await pageUrls();
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

  // Cloudflare header rules; ignored by other hosts. Cloudflare can't vary headers by query string, so this
  // relies on every asset reference in HTML being fingerprinted (renderPages). Files referenced only from CSS
  // (fonts) aren't, so they must never be edited in place: add a new filename instead.
  const headers = ['/assets/*', '  Cache-Control: public, max-age=31536000, immutable', ''].join('\n');

  await Promise.all([
    writeFile(join(OUT, 'sitemap.xml'), sitemap),
    writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`),
    writeFile(join(OUT, '_headers'), headers),
  ]);
  console.log(`Exported ${urls.length.toString()} pages to ${OUT}`);
}

await clean();
await renderPages();
await writeMeta();
