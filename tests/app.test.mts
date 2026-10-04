import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createSiteServer, parseRedirects } from '../src/app.mts';

const server = createSiteServer('public');
let base = '';

before(async () => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port.toString()}`;
});
after(() => {
  server.close();
});

async function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(base + path, { redirect: 'manual', ...init });
}

describe('site server', () => {
  it('serves index.html at /', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('serves pages without the .html extension, like Cloudflare', async () => {
    const res = await get('/members');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>[^<]*Members/);
  });

  it('redirects .html and trailing-slash URLs to the clean URL, like Cloudflare', async () => {
    for (const [from, to] of [['/members.html', '/members'], ['/index.html', '/'], ['/index', '/'], ['/members/', '/members'], ['/members.html?x=1', '/members?x=1']]) {
      const res = await get(from);
      assert.equal(res.status, 307, from);
      assert.equal(res.headers.get('location'), to, from);
    }
  });

  it('follows public/_redirects rules', async () => {
    const res = await get('/mailinglist');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/mailing-list');
  });

  it("never serves Cloudflare's config files, however the path is spelled", async () => {
    for (const path of ['/_redirects', '/_headers', '/%5Fredirects', '/assets/../_headers']) {
      const res = await get(path);
      assert.equal(res.status, 404, path);
      assert.match(await res.text(), /Page not found/, path);
    }
  });

  it('makes un-fingerprinted assets revalidate, answering 304 when unchanged', async () => {
    const res = await get('/assets/images/zinger-purple.svg');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    const lastModified = res.headers.get('last-modified') ?? '';
    assert.ok(lastModified);
    const again = await get('/assets/images/zinger-purple.svg', { headers: { 'If-Modified-Since': lastModified } });
    assert.equal(again.status, 304);
  });

  it('caches fingerprinted (?v=) assets for a year', async () => {
    const res = await get('/assets/images/zinger-purple.svg?v=abc');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  it('renders named links into pages from site settings', async () => {
    const html = await (await get('/calendar')).text();
    assert.match(html, /data-site-link="calendar-google" href="https:\/\/calendar\.google\.com\/calendar\/u\/0\?cid=/);
    assert.doesNotMatch(html, /data-site-link="[^"]+" href="#"/);
  });

  it('answers the health probe', async () => {
    const res = await get('/healthz');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('answers missing pages with the 404 page and a 404 status', async () => {
    const res = await get('/nope');
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Page not found/);
  });

  it('refuses path traversal, including encoded separators', async () => {
    for (const path of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/%2e%2e/etc/passwd']) {
      assert.equal((await get(path)).status, 404, path);
    }
  });

  it('returns 404 for malformed percent-encoding instead of crashing', async () => {
    assert.equal((await get('/%E0%A4%A')).status, 404);
  });

  it('rejects methods other than GET and HEAD', async () => {
    const res = await get('/', { method: 'POST' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  });

  it('answers HEAD with headers and no body', async () => {
    const res = await get('/', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
  });
});

describe('parseRedirects', () => {
  it('reads rules, skipping comments and blank lines, defaulting to 302', () => {
    const rules = parseRedirects('# old pages\n\n/a /b 301\n/c   /d\n');
    assert.deepEqual([...rules], [['/a', { to: '/b', status: 301 }], ['/c', { to: '/d', status: 302 }]]);
  });

  it('rejects splats and placeholders instead of silently ignoring them', () => {
    assert.throws(() => parseRedirects('/blog/* /news/:splat 301'), /splat or placeholder/);
  });
});
