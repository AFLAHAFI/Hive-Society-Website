/**
 * Each kind of section has one stylesheet, named after its class: `<section class="hero …">` is
 * styled by `assets/css/sections/hero.css`. A page links `base.css` and exactly the section files for
 * the sections it contains, so a page never loads CSS it doesn't use, never misses a section's
 * styles, and no section file is left over once nothing uses it.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = resolve('public');
const SECTIONS_DIR = join(ROOT, 'assets/css/sections');
/** The first class of each <section>: its kind. Later classes are `--variant` modifiers. */
const SECTION_KIND = /<section class="([a-z0-9-]+)/g;
const STYLESHEET = /<link rel="stylesheet" href="\/?assets\/css\/([^"?]+)"/g;

const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html')).sort();
const sectionFiles = (await readdir(SECTIONS_DIR)).filter((f) => f.endsWith('.css')).sort();
const kindsByPage = new Map<string, string[]>();
const linksByPage = new Map<string, string[]>();
for (const page of pages) {
  const html = await readFile(join(ROOT, page), 'utf8');
  kindsByPage.set(page, [...new Set([...html.matchAll(SECTION_KIND)].map((m) => m[1]))]);
  linksByPage.set(page, [...html.matchAll(STYLESHEET)].map((m) => m[1]));
}

describe('CSS structure: one stylesheet per kind of section', () => {
  for (const page of pages) {
    it(`${page} links base.css first, then exactly its sections' stylesheets`, () => {
      const links = linksByPage.get(page) ?? [];
      assert.equal(links[0], 'base.css', `${page}: base.css must be the first site stylesheet`);
      const linked = links.slice(1).sort();
      const expected = (kindsByPage.get(page) ?? []).map((k) => `sections/${k}.css`).sort();
      assert.deepEqual(linked, expected, `${page}: section stylesheets don't match its <section> classes`);
    });
  }

  it('every section stylesheet is used by some page', () => {
    const used = new Set([...kindsByPage.values()].flat().map((k) => `${k}.css`));
    assert.deepEqual(sectionFiles.filter((f) => !used.has(f)), [], 'unused files in assets/css/sections/');
  });
});
