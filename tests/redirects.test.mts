/**
 * public/_redirects (Cloudflare) must point at pages that exist, and must not shadow a page
 * that still exists at the old path.
 */
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);
const pagePath = (url: string): string => `public${url === '/' ? '/index' : url.replace(/\.html$/, '')}.html`;

const rules = (await readFile('public/_redirects', 'utf8'))
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .map((line) => line.split(/\s+/));
const redirects = rules.map(([from = '', to = '', status = '']) => ({ from, to, status }));

describe('_redirects', () => {
  it('has well-formed rules (from, to, 301/302)', () => {
    for (const rule of rules) assert.equal(rule.length, 3, `expected "<from> <to> <status>": ${rule.join(' ')}`);
    for (const { from, status } of redirects) assert.match(status, /^30[12]$/, `${from}: status must be 301 or 302`);
  });

  it('sends every old URL to a page that exists', async () => {
    for (const { from, to } of redirects) assert.ok(await exists(pagePath(to)), `${from} → ${to}: no such page`);
  });

  it('never redirects away from a page that still exists', async () => {
    for (const { from } of redirects) assert.equal(await exists(pagePath(from)), false, `${from} is still a page; remove its redirect`);
  });
});
