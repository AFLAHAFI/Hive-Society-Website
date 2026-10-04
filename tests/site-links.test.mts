/**
 * Every local href/src in the site's pages must resolve to a real file, using the same
 * resolution rules as the server (extensionless pages, index.html). Catches broken images
 * and links after renames, cleanups, or CMS media changes. Links between pages use clean URLs
 * (`about`, not `about.html`), because Cloudflare redirects .html URLs to the clean form.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolveFile } from '../src/app.mts';

const ROOT = resolve('public');
const ATTR = /\b(?:href|src)="([^"]+)"/g;
/** External, in-page, and non-file references are out of scope for a local link check. */
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html')).sort();

describe('local links and assets resolve', () => {
  it('finds pages to check', () => {
    assert.ok(pages.length > 0);
  });

  for (const page of pages) {
    it(page, async () => {
      const html = await readFile(join(ROOT, page), 'utf8');
      const missing: string[] = [];
      const dotHtml: string[] = [];
      for (const [, ref = ''] of html.matchAll(ATTR)) {
        if (SKIP.test(ref)) continue;
        const path = ref.split(/[?#]/, 1)[0] ?? '';
        if (path === '') continue;
        if (path.endsWith('.html')) dotHtml.push(ref);
        const urlPath = path.startsWith('/') ? path : '/' + join(dirname(page), path);
        if (!(await resolveFile(ROOT, urlPath))) missing.push(ref);
      }
      assert.deepEqual(missing, [], `${page} references missing files`);
      assert.deepEqual(dotHtml, [], `${page} links with .html; use the clean URL (e.g. "about", "./" for home)`);
    });
  }
});
