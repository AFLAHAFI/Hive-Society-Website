# Architecture

How the site is built and why. For contributors. Commands and procedures are in [RUNBOOK.md](RUNBOOK.md); decisions and open work are in [PROJECT_LOG.md](PROJECT_LOG.md).

**Contents:** [Stack](#stack) · [Why Astro](#why-astro) · [Theme](#theme) · [Caching](#caching)

## Stack

| Layer | Today | Planned |
|---|---|---|
| Pages | Hand-maintained HTML in `public/` (the original Mobirise site, cleaned up) | **[Astro](https://astro.build/)**, with pages and members generated from data |
| Language / runtime | TypeScript on Node 24 (native type stripping, no build step for tooling) | Same |
| Content | Settings and colors in YAML (`content/`), validated in CI | Members, teams, and events as schema-validated YAML/Markdown, edited through **[Sveltia CMS](https://github.com/sveltia/sveltia-cms)** |
| Hosting | Static export on **Cloudflare Workers** (static assets, no Worker code; `wrangler.jsonc`); the local server mimics it | Same; optional **Kubernetes** path (k3s + Kustomize + Cloudflare Tunnel), see [CONTAINERIZATION.md](CONTAINERIZATION.md) |
| CI | GitHub Actions: lint, HTML validation, typecheck, tests, manifest validation, container smoke test, PR-title check, form drift check | Release automation from Conventional Commits (release-please) |

## Why Astro

The site is mostly content: shows, members, teams, and the society's history. It's maintained by rotating student officers, most of whom don't code. The framework had to fit that, not a typical web app. Candidates were **Astro**, **Next.js**, **Eleventy**, and extending the hand-rolled renderer.

- **Content collections with schemas.** Members, teams, and events become typed, validated data. A typo from the CMS fails the build with a readable error instead of breaking a page in production.
- **Zero JavaScript by default, interactivity where it matters.** Pages ship as static HTML. Interactive pieces are isolated "islands", which keeps pages fast on phones.
- **Static-first, server-optional.** The default output deploys directly to Cloudflare. An adapter can serve individual pages on demand if a dynamic feature is ever needed.
- **Built-in asset pipeline.** Image resizing, modern formats, and content-hashed filenames replace this project's custom fingerprinting and manual image optimization.

**Next.js** was the main alternative. Its strengths (per-request rendering, auth, app-style interactivity) aren't requirements here, its static export gives up most of them, and it would ship a React runtime to every visitor of an otherwise static site. **Eleventy** fit the static side but offered no typed content schema or component islands.

## Theme

All site colors live in [`content/theme.yaml`](../content/theme.yaml), grouped by part of the site:

```yaml
navigation:
  background: "#ffffffcc"
  text: "#593269"
teams:
  - id: usuc
    background: "#ffdd00"
    text: "#593269"
```

`npm run validate:theme` enforces the rules below and checks that text is readable on its background (WCAG contrast).

1. **Name the place, not the color.** Keys describe *where* a color is used (`navigation.background`), never *what* it is (`purple`, `accent-2`) or a code name (`h1`, `.btn`).
   *Why:* a key called `purple` gets reused everywhere and the site slowly turns generic. Naming the place makes each decision specific: "what should the USUC background be?"
2. **Always a literal hex value**: `"#593269"`, or `"#593269cc"` with transparency. No color names, no pointing one key at another.
   *Why:* every key stands alone, so reading the file tells you exactly what each part looks like.
3. **Repeating a color is fine.** If the nav text and button background are both `#593269`, write it twice.
   *Why:* they match today by coincidence. When someone wants different buttons, they change one line and nothing else moves.
4. **Adding a team:** copy an entry under `teams:`, set `id` to the team's id, and pick its colors.

**Planned:** each key becomes a CSS variable named after its path (`navigation.background` → `var(--navigation-background)`), and the site's CSS uses only those variables. Today the colors in `theme.yaml` are validated, but the CSS doesn't read them yet.

## Caching

There's no "disable cache" switch because there's nothing stale to bypass:

- **Pages** (HTML) are always revalidated.
- **Assets** referenced from pages get a content hash in their URL at export (`style.css?v=3fa9c1…`), so a changed file gets a new URL, and everything else can be cached for a year.
- The dev server (`npm start`) revalidates un-hashed files on every load, so local edits show on a normal reload.

A `?nocache` page parameter couldn't do this anyway: stylesheets and images are separate requests with their own URLs. One rule follows: files referenced only from CSS (fonts) aren't hashed, so never edit one in place. Add a new filename.
