# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see [README.md](README.md).
`CLAUDE.md` only imports this file (`@AGENTS.md`). Put guidance here, not there, so every agent reads the same instructions.

> **Keep this file current.** If your change makes anything here wrong or incomplete (commands, layout, conventions, decisions), update this file in the same change. A stale AGENTS.md misleads every later agent.
> Also keep in sync, in the same change:
> - [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md): tick TODOs you finish (move them to **Done** with the date), add TODOs you defer, record decisions.
> - [docs/RUNBOOK.md](docs/RUNBOOK.md), the maintainer runbook (audience: a basic developer; explain *why* a step exists, not just the command): npm scripts, commands, deploys, setup, versions, tests, CI. A test fails if an npm script, test file, or PR-title type isn't in its tables; keep each test file's "what it guarantees" accurate. Container/Kubernetes material goes in [docs/CONTAINERIZATION.md](docs/CONTAINERIZATION.md), never the main runbook.
> - [EDITING.md](EDITING.md), the non-coder guide: whenever what's editable, or how, changes. It's the only doc editors read.
>   **Readers of EDITING.md do not like reading; content must be brief and avoid technical jargon. Assume website editors are lazy.**
>   Short bullets, plain words, no "CMS", "repo", "PR", "cache", file paths, or explanations of how things work. Only what to do, what not to do, and who to ask. If a line doesn't change what an editor does, cut it.

## Project

Website for Hive Society Improv (UIUC), https://hivesocietyimprov.com. Today it's the original Mobirise site in `public/` (cleaned up), served by a Node static server or exported to static files. **Decided: migrating to Astro** (content collections for members/teams/events, static output, islands for interactivity; see `docs/ARCHITECTURE.md`). Until the migration lands, keep changes to `public/` minimal; new page features belong in the Astro version. Read `docs/PROJECT_LOG.md` for current decisions and open work, and `docs/site-audit.md` for the content inventory and plans.

## Commands

| Task | Command |
|---|---|
| Serve `public/` on :8080 | `npm start` |
| Static export → `dist/` | `npm run export` |
| Serve `dist/` | `npm run start:dist` |
| Tests (node:test) | `npm test` |
| Theme rules check | `npm run validate:theme` |
| Lint | `npm run lint` |
| HTML validation (a11y, structure) | `npm run lint:html` |
| Type check | `npm run typecheck` |
| Render k8s manifests | `kubectl kustomize kube/overlays/local` (or `prod`) |
| Image limits check | `npm run check:images` |
| Live Google Form check | `npm run check:form` (network) |

Full reference with options, deploys, and setup: [docs/RUNBOOK.md](docs/RUNBOOK.md).

Node 24+ runs `.mts` directly via type stripping; there's no build step. `tsconfig.json` sets `erasableSyntaxOnly`, so **don't use `enum`, `namespace`, or constructor parameter properties**.

**Before calling a change done:** `npm run lint && npm run lint:html && npm run typecheck && npm test` must pass (plus `npm run validate:theme` if you touched `content/theme.yaml`). These are the same checks CI runs; see `.github/workflows/ci.yml`. If you touched `kube/`, both overlays must render. If you touched the server or export, run it and hit a page.

## Layout

```
content/theme.yaml     all site colors (rules below)
content/site.yaml      site settings (calendar ID, …), referenced from pages by name
content/teams.yaml     team rosters (member IDs), oldest team first; drives the Active Members order
public/                site root: HTML pages + assets (the original Mobirise site, cleaned up)
public/assets/css/     site styles: base.css (page-wide: layout, type scale, links, buttons) + sections/<section-class>.css (one per kind of section; pages link only the ones they use)
public/assets/vendor/  third-party libraries, unmodified: Bootstrap 5.3.8 (npm dist files; its collapse and dropdown scripts run the navbar)
public/assets/js/      first-party scripts (small, page-specific: spin-on-click.js, embed-loading.js)
public/404.html        served for unknown URLs (root-absolute links: it's served at any depth)
public/assets/images/  images, one folder per class (members/, teams/; see image-limits)
src/app.mts            static site handler mimicking Cloudflare (Workers static assets): clean URLs (307), _redirects, 404.html, hides config files, /healthz
src/server.mts         entry point: env config, listen, SIGTERM
src/theme.mts          theme.yaml loading, validation, CSS-variable flattening
src/site.mts           site.yaml loading/validation; named links (calendar-google, calendar-webcal, calendar-ics)
src/contrast.mts       WCAG contrast pairs + waivers for theme.yaml (run by validate:theme)
src/images.mts         image policy (site.yaml → image-limits): per-class limits, exceptions, duplicates, folder naming rules
src/forms.mts          Google Form structure parser + drift comparison
src/render.mts         shared HTML transform (server + export): fills data-site-link hrefs; fills <span data-current-year> (copyright); export adds ?v=<hash>, <link rel="canonical">, and og:title/description/url from the page's own title and description (never hand-write those)
scripts/export.mts     public/ → dist/ + robots.txt, sitemap.xml, _headers
wrangler.jsonc         Cloudflare deploy config: Workers static assets serving dist/ (no Worker code)
.nvmrc                 Node version (26) for nvm, CI (`node-version-file`), and Cloudflare's build machine; the Dockerfile's `node:26-alpine` must match
scripts/validate-theme.mts   CLI used by CI
tests/*.test.mts       node:test suites (server, theme, local link/asset check)
.github/               ci.yml (required checks), pr-title.yml (allowed PR types: the one list), pr-labels.yml (labels PRs by type from it), dependabot.yml
kube/base, kube/overlays/{local,prod}   Kustomize; prod = k3s + Cloudflare Tunnel
docs/                  RUNBOOK.md (commands/procedures), ARCHITECTURE.md (stack, rationale, theme rules, caching), PROJECT_LOG.md (decisions + TODOs), site-audit.md
```

## Conventions

### Theme (`content/theme.yaml`), strict
- Keys name **where** a color is used (`navigation.background`, `buttons.hover-text`). **Never** add palette or primitive keys (`purple`, `accent`, `primary`), keys named after CSS selectors (`h1`, `.btn`), or values that reference other keys.
- Values are literal `#rrggbb` / `#rrggbbaa`.
- **Duplicate hex values are intentional.** Don't "deduplicate" them into shared keys.
- `teams` is a list of `{ id, background, text }`. `id` matches the team id in the team data.
- CSS must consume colors only as `var(--group-key)` (e.g. `--navigation-background`, `--teams-usuc-background`), never as hard-coded hex.
- Renaming or removing a key is a **breaking change** (see Versioning).
- **Contrast is checked** (`src/contrast.mts`, run by `validate:theme`): each new key must be added to `CONTRAST_PAIRS` with what it's drawn on (a test fails otherwise). Fix failing colors; `CONTRAST_WAIVERS` is only for known, tracked failures and needs a reason.

### Code
- TypeScript ESM (`.mts`), strict typed ESLint (`typescript-eslint` `strictTypeChecked`). Prefer Node built-ins over new dependencies; justify any new dependency.
- Match surrounding style: doc-comments on exported or non-obvious functions, comments explain *why*.
- Tests use `node:test` + `node:assert/strict`, no test framework. New behavior gets a test. ESLint allowlists node:test's `describe`/`it` for `no-floating-promises`, so don't `await` them.
- Relative imports use the real `.mts` extension (`import … from './app.mts'`); Node requires it, and `allowImportingTsExtensions` permits it.
- CI: third-party actions are pinned to a full commit SHA with a `# vX.Y.Z` comment; GitHub-owned actions (`actions/*`) are pinned to a major tag. Dependabot keeps both current. Don't rename CI job `name`s without updating branch protection.
- `public/` pages are the original Mobirise site with readable class names; they're being replaced by templates, so make targeted edits only. Styles for a kind of section go in `public/assets/css/sections/<section-class>.css`, page-wide ones in `css/base.css`; `tests/css-structure.test.mts` checks each page links exactly the files for its sections. Edit the rule that already styles something instead of adding a later override, and put media queries right after the rules they adjust.
- **Class names:** one class per kind of section (`site-nav`, `hero`, `section-heading`, `feature-row`, `member-grid`, `alumni-list`, `contact-cards`, `embed-section`, `site-footer`), variants as `<type>--<variant>` modifiers styled with `.type:where(.type--variant)` (same specificity as the plain class; see the header of `css/base.css`), text sizes as `type-hero/title/heading/nav/body`. Don't reintroduce builder names (`mbr-*`, `display-N`, `cid-*`, numbered ids). Bootstrap class names (`navbar-*`, `nav-link`, `dropdown-*`, `collapse`) stay as they are: its CSS and JS depend on them. Restyle Bootstrap components through its `--bs-*` variables rather than out-specifying its selectors. The fixed navbar's size lives in `--nav-gap`/`--nav-height` (base.css); a page's first section starts at `var(--page-top)`, never a hard-coded padding.
- **Never hard-code values that live in settings.** Links built from settings go in markup as `<a data-site-link="<name>" href="#">`; `renderPage` fills them from `src/site.mts`, and an unknown name fails the render. New settings go in `content/site.yaml` + `parseSite()` + a test.
- Caching: the export fingerprints every `assets/…` reference in HTML (`?v=<sha256 prefix>`), and `/assets/*` is served `immutable` for a year. Files referenced only from CSS (fonts) aren't fingerprinted, so never modify one in place; add a new filename. The dev server revalidates un-hashed files, so a normal reload shows edits.
- `public/assets/vendor/` holds third-party code exactly as published. Never edit it; to update or patch, replace the whole library folder (and note the version in Layout above) or override from the site's own CSS (`css/base.css` or `css/sections/`). First-party code never goes in `vendor/`, and vendored code never goes anywhere else.
- **Page structure (accessibility, enforced by `lint:html`):** content between the nav section and the footer lives in `<main id="main">`; keep exactly one `<h1>` per page and never skip heading levels (page title h1 → section headings h2 → card/person names h3). Text that isn't a heading (class years, quips, subtitles) is `<p>`/`<div>`, not `<h5>`/`<h6>`. Section ids that pages link to are readable (`#alumni`); don't reintroduce builder-generated ids in links.
- **Titles and descriptions:** every page's `<title>` (10-60 characters) and meta description (50-160) are unique; `tests/seo.test.mts` checks them on the real export. Link previews (`og:`) are generated from them, so edit only the title and description.
- **Links between pages use clean URLs** (`about`, `./` for home, `members#alumni`), never `about.html`: Cloudflare redirects `.html` URLs anyway, and `tests/site-links.test.mts` rejects them. The local server mirrors Cloudflare (clean URLs, `_redirects`, `404.html`), so test redirects and 404s with `npm start`; for exact behavior, `npx wrangler dev` (RUNBOOK §7).
- **Page renames:** add the old URL (with and without `.html`) to `public/_redirects` so links elsewhere keep working; `tests/redirects.test.mts` checks targets exist.
- **Members page order:** the Executive Board is sorted by position rank (Co-President, Vice President, Secretary, Treasurer, Membership Director; the `RANK` list in the test), then seniority. Active Members are sorted by team seniority (team order in `content/teams.yaml`, oldest first; members on no team after everyone on one), then seniority. Alumni are sorted by seniority. Seniority = graduation year (earliest first), then last name, then first name; members without a year yet (`Class of '??`) go last. Enforced by `tests/members-order.test.mts`, which also checks every ID in `teams.yaml` has a card. When someone joins, leaves, or switches teams, update `teams.yaml` in the same change. Team ids there aren't tied to `theme.yaml` (teams rename often). The Executive Board rows' layout modifiers (image side; extra space after the last row) belong to the position, not the person: when the order changes, move people between rows, don't move the rows.
- **Member portraits:** `public/assets/images/members/<firstname-lastname>.jpg` (lowercase, hyphens, no nicknames/apostrophes/accents, `-2` for a duplicate name), `alt` = full name. Enforced by `check:images`. The base name is the member's future data ID. A member without a photo yet points at the shared `assets/images/portrait-placeholder.jpg` (never copy it per person; duplicate files fail the check).
- **Team photos and logos:** `public/assets/images/teams/<team-id>.jpg` (`.png` for logos), `<team-id>` = the team's `id` in `content/theme.yaml` where it has one, otherwise the team name in kebab-case. `alt` = "<Team> team photo" / "<Team> logo". `check:images` enforces the format only; team names change about yearly, so don't add a check that names match `theme.yaml` or team data without a rename procedure (see PROJECT_LOG).
- **Image classes:** every image is limited by one `image-limits` section in `content/site.yaml`, chosen by folder (`portraits` = `members/`, `team-photos` = `teams/`, `other` = everything else). A new folder with its own rules = a new entry in `IMAGE_CLASSES` (`src/images.mts`) plus a matching section; all sections are required, unknown ones are rejected.
- **Images committed to the repo:** enforced by `npm run check:images` (limits and exceptions in `content/site.yaml` → `image-limits`). JPEG, within the class limits in `image-limits` (currently 1080 px on the long edge for portraits, so any portrait can fill a large half-width card; 1200 px otherwise), quality ~82, progressive, metadata stripped; larger only via an exception with a reason. Use PNG only for logos or images that need transparency. Git history keeps every version of a file forever, so optimize *before* committing. Example: `convert in.png -auto-orient -resize '1200x1200>' -strip -quality 82 -interlace JPEG out.jpg`. Don't commit duplicate files; reference one shared file instead (e.g. every page's `og:image` is `assets/images/social-preview.png`, as an absolute URL).

### Commits, PRs, and versioning
`main` is branch-protected: **all changes go through a PR on a branch**, required CI checks must pass before merge, and PRs are squash-merged. Never commit or push to `main` directly, and never bypass or weaken protection or required checks to get a change in. If a check is wrong, fix the check in its own PR.

Conventional Commits; the PR title becomes the squash commit message and is checked by `.github/workflows/pr-title.yml`. If you change the allowed types, update that file, this table, and RUNBOOK §5 together. The version is bumped automatically. **Never edit `version` in `package.json` by hand.**

| Type | Use for | Release |
|---|---|---|
| `content:` | Text, photos, members, teams | patch |
| `theme:` | Color *value* changes in `theme.yaml` | patch |
| `fix:` / `perf:` / `revert:` | Bug fixes / performance / reverting a change | patch |
| `refactor:` | Restructuring shipped code with no intended behavior change | patch (so regressions map to a release) |
| `build:` | Dockerfile, base image, build/export pipeline | patch |
| `deps:` | Dependency updates (runtime or build) | patch |
| `feat:` | New page, component, CMS collection, **new** theme key or content field | minor |
| `<type>!:` or `BREAKING CHANGE:` footer | Removed/renamed theme key or content field, changed URLs, change needing manual deploy steps (new secret, cluster, site engine) | major |
| `test:` `ci:` `docs:` `style:` (formatting only) `chore:` | No runtime regression risk | none |

Rule of thumb: bump by **regression risk**. If the change could alter the deployed site's behavior or appearance (code logic, image, dependencies, content), it gets at least a patch. Formatting-only and test-only changes touch code but carry no runtime risk, so they don't release. "Architecture change" is **not** automatically major. What matters is whether a contract breaks (content/theme schema, URLs, deploy steps). Full rationale is in RUNBOOK §5.

### Infrastructure
- Kustomize: environment differences go in overlays, never forked copies of base files. Use standard `networking.k8s.io/v1` Ingress, not Traefik CRDs, to stay portable.
- Pods run non-root with a numeric UID and a read-only root filesystem. Keep it that way.
- **No secrets in the repo.** The Cloudflare tunnel token is created manually as the `cloudflared-token` Secret.

### Roster privacy
- Never create a lasting record that someone was removed rather than made alumni: no labels, tags, files, YAML fields, commit-message keywords, or PR-text tokens. Git history showing a file deleted is acceptable.
- The roster check's override is the `workflow_dispatch` "Approve roster removal" action: officer allowlist in the repository variable `ROSTER_OFFICERS` (settings, not a file), which sets a success status on the PR's head SHA. It's invalidated by new commits and leaves only an Actions run log that expires.

## Don't
- **Push your feature branch when a request is done**, without asking: every push gets a Cloudflare preview build, so the human can check the change while reviewing. Never push to `main` or force-push, and don't open or merge PRs, deploy, or apply manifests to a real cluster unless the human asks.
- Don't change `.gitignore`, CI workflows, ESLint/TS config, or Kustomize base without saying so in your summary.
- Don't implement items marked **on hold** in the project log (e.g. rendering the archived Beeble handbook).
