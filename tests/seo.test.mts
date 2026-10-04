/**
 * Search and link-preview basics, checked on the real export (what Cloudflare serves), not on public/:
 * the canonical and og: tags only exist after the export adds them.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';

const SITE_URL = 'https://hivesocietyimprov.com';
const NOT_FOUND_PAGE = '404.html';

let out = '';
const pages = new Map<string, string>();

before(async () => {
  out = await mkdtemp(join(tmpdir(), 'hive-seo-'));
  await promisify(execFile)(process.execPath, ['scripts/export.mts'], { env: { ...process.env, OUT_DIR: out, SITE_URL } });
  for (const file of (await readdir(out)).filter((f) => f.endsWith('.html') && f !== NOT_FOUND_PAGE)) {
    pages.set(file, await readFile(join(out, file), 'utf8'));
  }
});
after(async () => {
  await rm(out, { recursive: true, force: true });
});

/** Every value of `attr` on tags matching `tag` (e.g. all og:title contents). */
function all(html: string, tag: RegExp, attr: string): string[] {
  return [...html.matchAll(new RegExp(tag.source, 'g'))].map(([t]) => new RegExp(`\\b${attr}="([^"]*)"`).exec(t)?.[1] ?? '');
}
const titleOf = (html: string): string[] => [...html.matchAll(/<title>([^<]*)<\/title>/g)].map(([, t = '']) => t.trim());
const descriptionOf = (html: string): string[] => all(html, /<meta name="description"[^>]*>/, 'content');
const og = (html: string, prop: string): string[] => all(html, new RegExp(`<meta property="og:${prop}"[^>]*>`), 'content');
const canonicalOf = (html: string): string[] => all(html, /<link rel="canonical"[^>]*>/, 'href');
const urlOf = (file: string): string => (file === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${file.slice(0, -'.html'.length)}`);

describe('SEO: every page', () => {
  it('has exactly one title, 10-60 characters, unique across the site', () => {
    const seen = new Map<string, string>();
    for (const [file, html] of pages) {
      const titles = titleOf(html);
      assert.equal(titles.length, 1, `${file}: ${titles.length.toString()} <title> tags`);
      const [title = ''] = titles;
      assert.ok(title.length >= 10 && title.length <= 60, `${file}: title is ${title.length.toString()} characters (search results cut off around 60)`);
      assert.ok(!seen.has(title), `${file}: same title as ${seen.get(title) ?? ''}`);
      seen.set(title, file);
    }
  });

  it('has exactly one meta description, 50-160 characters, unique across the site', () => {
    const seen = new Map<string, string>();
    for (const [file, html] of pages) {
      const descriptions = descriptionOf(html);
      assert.equal(descriptions.length, 1, `${file}: ${descriptions.length.toString()} meta descriptions`);
      const [description = ''] = descriptions;
      assert.ok(description.length >= 50 && description.length <= 160, `${file}: description is ${description.length.toString()} characters (aim for 50-160)`);
      assert.ok(!seen.has(description), `${file}: same description as ${seen.get(description) ?? ''}; search engines ignore duplicates`);
      seen.set(description, file);
    }
  });

  it('declares its clean URL on the bare domain as canonical, once', () => {
    for (const [file, html] of pages) assert.deepEqual(canonicalOf(html), [urlOf(file)], file);
  });

  it('has a full link preview: og:title, og:description, og:url matching the page, og:image absolute', () => {
    for (const [file, html] of pages) {
      assert.deepEqual(og(html, 'title'), titleOf(html), `${file}: og:title`);
      assert.deepEqual(og(html, 'description'), descriptionOf(html), `${file}: og:description`);
      assert.deepEqual(og(html, 'url'), [urlOf(file)], `${file}: og:url`);
      const images = og(html, 'image');
      assert.equal(images.length, 1, `${file}: og:image`);
      assert.match(images[0] ?? '', /^https:\/\//, `${file}: og:image must be an absolute https URL; preview cards can't resolve relative ones`);
    }
  });

  it('declares its language and is not hidden from search engines', () => {
    for (const [file, html] of pages) {
      assert.match(html, /<html lang="[a-z]{2}/, `${file}: <html lang>`);
      assert.doesNotMatch(html, /<meta name="robots"[^>]*noindex/, `${file}: noindex would drop it from search`);
    }
  });
});

describe('SEO: site files', () => {
  it('sitemap lists exactly the pages, by canonical URL', async () => {
    const sitemap = await readFile(join(out, 'sitemap.xml'), 'utf8');
    const listed = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, u = '']) => u).sort();
    assert.deepEqual(listed, [...pages.keys()].map(urlOf).sort());
  });

  it('robots.txt allows crawling and points at the sitemap', async () => {
    const robots = await readFile(join(out, 'robots.txt'), 'utf8');
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, 'robots.txt blocks the whole site');
    assert.match(robots, new RegExp(`^Sitemap: ${SITE_URL}/sitemap\\.xml$`, 'm'));
  });
});
