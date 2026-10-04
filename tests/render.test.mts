import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderPage } from '../src/render.mts';

const links = { 'calendar-google': 'https://example.com/add?cid=a&b="c"' };

describe('renderPage: named links', () => {
  it('fills href from site settings, escaping the value', () => {
    const out = renderPage('<a class="btn" data-site-link="calendar-google" href="#">Add</a>', { links });
    assert.equal(out, '<a class="btn" data-site-link="calendar-google" href="https://example.com/add?cid=a&amp;b=&quot;c&quot;">Add</a>');
  });

  it('adds href when the tag has none, and is idempotent', () => {
    const once = renderPage('<a data-site-link="calendar-google">Add</a>', { links });
    assert.match(once, /href="https:\/\/example\.com/);
    assert.equal(renderPage(once, { links }), once);
  });

  it('fails loudly on an unknown link name instead of shipping a dead "#"', () => {
    assert.throws(() => renderPage('<a data-site-link="nope" href="#">x</a>', { links }), /Unknown data-site-link "nope"/);
    assert.throws(() => renderPage('<a data-site-link="constructor">x</a>', { links }), /Unknown data-site-link/);
  });
});

describe('renderPage: canonical URL and link previews', () => {
  const page = '<html><head><title>Hive &amp; "Co"</title><meta name="description" content="Shows &amp; more"></head><body></body></html>';

  it('adds the canonical link and og: tags before </head>, escaped once', () => {
    const out = renderPage(page, { links, canonicalUrl: 'https://example.com/a?b=1&c=2' });
    assert.match(out, /<link rel="canonical" href="https:\/\/example\.com\/a\?b=1&amp;c=2">/);
    assert.match(out, /<meta property="og:title" content="Hive &amp; &quot;Co&quot;">/);
    assert.match(out, /<meta property="og:description" content="Shows &amp; more">/);
    assert.match(out, /<meta property="og:url" content="https:\/\/example\.com\/a\?b=1&amp;c=2">\n<\/head>/);
  });

  it('refuses a page without a title or description to build the preview from', () => {
    assert.throws(() => renderPage('<head><title>x</title></head>', { links, canonicalUrl: 'https://example.com/' }), /needs a <title> and a meta description/);
  });

  it('adds nothing without a canonicalUrl (live server, 404 page)', () => {
    assert.equal(renderPage(page, { links }), page);
  });

  it('refuses hand-written copies of the generated tags, or a page with no </head>', () => {
    for (const tag of ['<link rel="canonical" href="https://x.test/">', '<meta property="og:title" content="x">']) {
      assert.throws(() => renderPage(page.replace('</head>', `${tag}</head>`), { links, canonicalUrl: 'https://example.com/' }), /already has a canonical/);
    }
    assert.throws(() => renderPage('<p>no head</p>', { links, canonicalUrl: 'https://example.com/' }), /no <\/head>/);
  });
});

describe('renderPage: asset fingerprints', () => {
  const assetVersion = (p: string): string | undefined => (p === 'assets/a.css' ? 'v1' : undefined);

  it('versions local assets, replacing any existing query and keeping fragments', () => {
    const html = '<link href="assets/a.css?old=1"><img src="assets/a.css#x">';
    assert.equal(renderPage(html, { links, assetVersion }), '<link href="assets/a.css?v=v1"><img src="assets/a.css?v=v1#x">');
    assert.equal(renderPage('<link href="/assets/a.css">', { links, assetVersion }), '<link href="/assets/a.css?v=v1">');
  });

  it('leaves unknown assets, pages, and external URLs alone', () => {
    const html = '<a href="members.html"></a><img src="assets/b.png"><a href="https://x.test/assets/a.css"></a>';
    assert.equal(renderPage(html, { links, assetVersion }), html);
  });

  it('does not fingerprint without an assetVersion function (live server)', () => {
    assert.equal(renderPage('<link href="assets/a.css">', { links }), '<link href="assets/a.css">');
  });
});
