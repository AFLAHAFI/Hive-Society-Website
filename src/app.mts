/**
 * Static site HTTP server, separated from the entry point (`server.mts`) so tests can
 * start it on an ephemeral port against any directory.
 *
 * It mimics Cloudflare's static hosting (Workers static assets, configured in `wrangler.jsonc`), so
 * local testing matches the live site: `_redirects` rules, clean URLs (`/about.html` and `/about/`
 * redirect to `/about`), `404.html` for anything missing, and Cloudflare's own config files
 * (`_redirects`, `_headers`) are never served.
 */
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { renderPage } from './render.mts';
import { loadSite, siteLinks } from './site.mts';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/** Files Cloudflare reads as configuration and never serves (checked against `wrangler dev`). */
const PAGES_CONFIG_FILES: ReadonlySet<string> = new Set(['_redirects', '_headers', '_routes.json', '_worker.js']);

/**
 * Maps a URL path to a file under `root`, mirroring Cloudflare's static hosting:
 * `/` and directories resolve to `index.html`, and extensionless paths try `<path>.html`.
 * Returns `undefined` for anything missing, outside `root` (path traversal), or a Cloudflare config file.
 * `root` must be absolute and normalized; `createSiteServer` guarantees this.
 */
export async function resolveFile(root: string, urlPath: string): Promise<string | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined; // malformed percent-encoding
  }
  const base = join(root, normalize(decoded));
  if (base !== root && !base.startsWith(root + sep)) return undefined;
  // Checked after decoding and normalizing, so /%5Fredirects or /x/../_headers can't reach them either.
  if (PAGES_CONFIG_FILES.has(relative(root, base))) return undefined;

  const candidates = extname(base) ? [base] : [base, `${base}.html`, join(base, 'index.html')];
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => undefined);
    if (info?.isFile()) return candidate;
  }
  return undefined;
}

/** One `_redirects` rule. */
export interface Redirect {
  to: string;
  status: number;
}

/**
 * Parses Cloudflare `_redirects` (`<from> <to> [status]`, `#` comments, default 302).
 * Only exact paths are supported; Cloudflare's splats (`*`) and placeholders (`:name`) aren't, and a
 * rule using them is rejected rather than silently never matching.
 */
export function parseRedirects(text: string): Map<string, Redirect> {
  const rules = new Map<string, Redirect>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [from = '', to = '', status = '302'] = line.split(/\s+/);
    if (/[*:]/.test(from)) throw new Error(`_redirects: "${from}" uses a splat or placeholder, which the local server doesn't support`);
    rules.set(from, { to, status: Number(status) });
  }
  return rules;
}

/** Workers static assets answers clean-URL redirects with 307 (Pages used 308); match production. */
const CLEAN_URL_STATUS = 307;

function redirect(res: ServerResponse, status: number, location: string): void {
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-cache' });
  res.end();
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

/**
 * Cache policy. Fingerprinted URLs (`?v=<content hash>`, added by the export) never change content,
 * so they're cached for a year. Everything else, HTML and un-fingerprinted assets alike, must be
 * revalidated on every use (cheap: a 304 via Last-Modified), so an edit is visible on the next load.
 */
function cacheControl(url: URL): string {
  return url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

async function handle(root: string, sitePath: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;

  // Liveness/readiness probe target; deliberately independent of the filesystem.
  if (pathname === '/healthz') {
    sendText(res, 200, 'ok');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  // Read per request so edits to _redirects apply without a restart (it's a few lines).
  const rules = parseRedirects(await readFile(join(root, '_redirects'), 'utf8').catch(() => ''));
  const rule = rules.get(pathname);
  if (rule) {
    redirect(res, rule.status, rule.to);
    return;
  }

  // Clean URLs, as Cloudflare serves them: /about.html → /about, /index.html and /index → /, /about/ → /about.
  if (pathname.endsWith('.html') && (await resolveFile(root, pathname))) {
    const clean = pathname.slice(0, -'.html'.length).replace(/(^|\/)index$/, '$1');
    redirect(res, CLEAN_URL_STATUS, clean + url.search);
    return;
  }
  if (/(^|\/)index$/.test(pathname) && (await resolveFile(root, `${pathname}.html`))) {
    redirect(res, CLEAN_URL_STATUS, pathname.slice(0, -'index'.length) + url.search);
    return;
  }
  if (pathname.length > 1 && pathname.endsWith('/') && (await resolveFile(root, pathname.slice(0, -1) + '.html'))) {
    redirect(res, CLEAN_URL_STATUS, pathname.slice(0, -1) + url.search);
    return;
  }

  const file = await resolveFile(root, pathname);
  if (!file) {
    const notFound = await resolveFile(root, '/404.html');
    if (!notFound) {
      sendText(res, 404, 'Not Found');
      return;
    }
    const html = renderPage(await readFile(notFound, 'utf8'), { links: siteLinks(await loadSite(sitePath)) });
    res.writeHead(404, { 'Content-Type': MIME_TYPES['.html'] ?? 'text/html', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
    return;
  }

  const ext = extname(file);
  const headers = {
    'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(url),
    'X-Content-Type-Options': 'nosniff',
  };

  if (ext === '.html') {
    // Rendered per request (site settings are read fresh), so there is no file date to validate against.
    const html = renderPage(await readFile(file, 'utf8'), { links: siteLinks(await loadSite(sitePath)) });
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : html);
    return;
  }

  // HTTP dates have 1 s resolution; compare at that granularity.
  const modified = new Date(Math.floor((await stat(file)).mtimeMs / 1000) * 1000);
  const since = Date.parse(req.headers['if-modified-since'] ?? '');
  if (!Number.isNaN(since) && modified.getTime() <= since) {
    res.writeHead(304, { 'Cache-Control': headers['Cache-Control'], 'Last-Modified': modified.toUTCString() });
    res.end();
    return;
  }
  res.writeHead(200, { ...headers, 'Last-Modified': modified.toUTCString() });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await pipeline(createReadStream(file), res);
}

/**
 * Creates (but does not start) a server for the static site rooted at `rootDir`.
 * `sitePath` is the site settings file used to render named links into HTML.
 */
export function createSiteServer(rootDir: string, sitePath = 'content/site.yaml'): Server {
  const root = resolve(rootDir);
  return createServer((req, res) => {
    handle(root, sitePath, req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.destroy();
    });
  });
}
