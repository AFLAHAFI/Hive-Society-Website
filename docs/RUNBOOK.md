# Runbook

Everything needed to develop, check, deploy, and maintain the site, written so someone with basic web-development experience can take over with nothing but this file.

- Not a developer? You want [EDITING.md](../EDITING.md).
- Containers, Docker, Kubernetes: **optional**, and kept separately in [CONTAINERIZATION.md](CONTAINERIZATION.md). The live site doesn't need any of it.

**Contents:** [1 Setup](#1-setup) · [2 How it fits together](#2-how-it-fits-together) · [3 npm scripts](#3-npm-scripts) · [4 Making a change](#4-making-a-change) · [5 Versions and releases](#5-versions-and-releases) · [6 Images](#6-images) · [7 Deploying](#7-deploying) · [8 One-time project setup](#8-one-time-project-setup) · [9 Roster changes](#9-roster-changes) · [10 Tests and checks](#10-tests-and-checks) · [11 When CI fails](#11-when-ci-fails) · [12 Routine maintenance](#12-routine-maintenance) · [13 Troubleshooting](#13-troubleshooting)

---

## 1. Setup

### Dependencies

**Required** for everything in this runbook:

| Tool | Version | Install | Check |
|---|---|---|---|
| Node.js (includes npm) | 26 (24+ works) | [nvm](https://github.com/nvm-sh/nvm): `nvm install` (reads `.nvmrc`) | `node --version` |
| git | any recent | [git-scm.com](https://git-scm.com/downloads) | `git --version` |

**Optional**, only for the task listed:

| Tool | Needed for | Install | Check |
|---|---|---|---|
| ImageMagick | Resizing photos before adding them ([§6](#6-images)) | `sudo apt install imagemagick` · `brew install imagemagick` | `convert -version` (v7: `magick -version`) |
| GitHub CLI (`gh`) | Opening PRs / checking CI from the terminal; the GitHub website does the same | [cli.github.com](https://cli.github.com/) · `brew install gh` | `gh --version` |

Container tools (Docker, kubectl, k3d, …) are listed in [CONTAINERIZATION.md](CONTAINERIZATION.md#tools).

### Get the site running

```bash
git clone <repo-url> hive_site && cd hive_site
npm ci          # installs the exact dependency versions recorded in package-lock.json
npm start       # → http://localhost:8080
```

Use `npm ci`, not `npm install`, unless you're deliberately adding or upgrading a dependency: `npm install` can silently change `package-lock.json`.

There's no build step for development. The code is TypeScript (`.mts` files), and Node (24 and later) runs it directly by ignoring the type annotations. That's why type checking is a separate command ([§3](#3-npm-scripts)).

## 2. How it fits together

```
content/*.yaml ──┐
public/ (pages) ─┼─► npm start           → local preview, http://localhost:8080
                 └─► npm run export → dist/ → Cloudflare Workers → hivesocietyimprov.com
```

- **`public/`**: the site's pages (`*.html`) and `assets/`: `images/`, `css/` (the site's styles: `base.css` for the whole page, plus one file per kind of section in `css/sections/`, named after the section's class), and `vendor/` (third-party libraries such as Bootstrap, kept unmodified). (Being replaced by the Astro version; see [ARCHITECTURE.md](ARCHITECTURE.md).)
- **`content/theme.yaml`**: every color on the site. **`content/site.yaml`**: settings that pages read (calendar, mailing-list form) and image limits.
- **`public/assets/images/members/`**: one portrait per member, `firstname-lastname.jpg` ([§6](#member-portraits)).
- **`src/`**: the small Node server behind `npm start`, and the code that reads the YAML files.
- **`scripts/`**: the export and the checks that CI runs.
- **`tests/`**: automated tests ([§10](#10-tests-and-checks)).
- **GitHub Actions** (CI) runs the checks on every change; **Cloudflare** (Workers static assets) builds and hosts the live site from GitHub.

## 3. npm scripts

The complete list. A test fails if a script in `package.json` isn't in this table.

| Command | What it does | When to use it |
|---|---|---|
| `npm start` | Runs the site locally at http://localhost:8080. Pages are rebuilt on every request, so edits show on reload. Behaves like Cloudflare (the live host): clean URLs (`/about`; `/about.html` redirects there), `public/_redirects` rules, the 404 page for unknown URLs, and never serving Cloudflare's own config files (`_redirects`, `_headers`) | Day-to-day development |
| `npm run start:dist` | Serves the exported `dist/` folder instead, exactly as it will be deployed | Final check before a manual deploy (run `npm run export` first) |
| `npm run export` | Builds the deployable site into `dist/` (see below) | Before a manual deploy; Cloudflare runs it automatically |
| `npm test` | Runs the automated tests ([§10](#10-tests-and-checks)) | Before every commit |
| `npm run lint` | Runs ESLint (see below) | Before every commit |
| `npm run lint:html` | Checks every page's HTML: valid nesting, headings in order (one `<h1>`, no skipped levels), images have `alt`, iframes have titles, landmarks (see below) | After editing a page |
| `npm run typecheck` | Runs the TypeScript compiler in check-only mode (see below) | Before every commit |
| `npm run validate:theme` | Checks `content/theme.yaml` follows the color rules, and that every text/icon color is readable on its background (WCAG contrast; known failures print as warnings) | After editing colors |
| `npm run check:images` | Checks every image is within the size limits, none are duplicates, and member portraits are named correctly ([§6](#6-images)) | After adding or replacing images |
| `npm run check:form` | Compares the live Google Form (mailing list) with the settings in `content/site.yaml`. Needs internet | After anyone edits the Google Form, or when the daily check fails |

**What these checks are for**, if you haven't used them before:

- **Linting (`lint`)** reads the code without running it and flags patterns that are probably bugs or make code harder to maintain. Examples: a promise whose failure is silently ignored, a variable that's never used, a comparison that can never be true. The rules are strict on purpose, because they catch mistakes before anyone clicks through the site. Most style issues can be fixed automatically with `--fix`.
- **HTML validation (`lint:html`)** does the same for the pages, with [html-validate](https://html-validate.org/): structure and accessibility problems that browsers silently tolerate but screen readers and search engines don't. Config is `.htmlvalidate.json` (the recommended preset, plus heading order). Everything is an error, so fixed problems can't come back. To tolerate a known issue temporarily, set that rule to `"warn"` there with a comment saying why; warnings print but don't fail CI.
- **Type checking (`typecheck`)** verifies that values are used consistently across files: that a function expecting a number isn't handed text, that a setting that might be missing is handled. Node runs our TypeScript *without* checking types, so this command is the only place type mistakes are caught.
- **Tests (`test`)** run the code and compare results with what should happen, e.g. "requesting `/members` returns the members page" or "a color written as `purple` is rejected".
- **The export (`export`)** copies `public/` to `dist/` and prepares it for hosting. It fills in links from `content/site.yaml`, and it adds a short code (a hash of the file's contents) to every stylesheet and image URL, like `style.css?v=3fa9c1…`. When a file changes its URL changes, so visitors never see an outdated copy, and unchanged files can be cached for a year. Each page (except the 404 page) gets a canonical link naming its one real address, so search engines treat copies at other addresses (preview links, `?utm_…` links from social media) as the same page. It also writes `sitemap.xml` and `robots.txt` (for search engines) and `_headers` (caching rules for Cloudflare).

Useful variations:

```bash
npm run lint -- --fix                               # let ESLint fix what it can
npm run validate:theme -- path/to/other-theme.yaml  # check a different file
node --test tests/theme.test.mts                     # run one test file
node --test --test-name-pattern='health' tests/app.test.mts   # run only tests whose name matches
PORT=3000 npm start                                 # use another port
SITE_URL=https://staging.example.com npm run export # different domain in sitemap/robots
```

**Before every commit**, run the same checks CI will:

```bash
npm run lint && npm run lint:html && npm run typecheck && npm run validate:theme && npm run check:images && npm test && npm run export
```

## 4. Making a change

`main` is the live version and is protected: nothing is committed to it directly. Every change goes on its own branch and through a **pull request (PR)** on GitHub, where CI runs the checks and someone reviews it.

```bash
git switch main && git pull                          # start from the latest version
git switch -c <github-user>/<short-description>      # e.g. alex/fix-footer-spacing
# …make changes, run the pre-commit checks above…
git add -A && git commit -m "fix: tighten footer spacing on mobile"
git push -u origin HEAD                              # then open a PR on GitHub
```

- **The PR title matters.** It must start with a type like `fix:` or `content:` ([§5](#5-versions-and-releases)), and it decides the next version number. CI rejects other titles.
- PRs are **squash-merged**: all the branch's commits become one commit on `main`, titled with the PR title.
- If you changed a command, convention, or folder layout, update this runbook, [AGENTS.md](../AGENTS.md), and [PROJECT_LOG.md](PROJECT_LOG.md) in the same PR. If you changed what editors can do, update [EDITING.md](../EDITING.md).

## 5. Versions and releases

The site has a version number like **`1.4.2`**, following [Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**. Nobody edits it by hand. It goes up automatically based on the **type** at the start of each PR title (the [Conventional Commits](https://www.conventionalcommits.org/) format).

| PR title starts with | Use it for | Example title | Version change |
|---|---|---|---|
| `content:` | Text, photos, members, teams, shows | `content: add fall 2026 NewBee team` | patch `1.4.2 → 1.4.3` |
| `theme:` | Changing existing color values in `theme.yaml` | `theme: darken button hover color` | patch |
| `fix:` | Fixing something broken | `fix: calendar link opens wrong calendar` | patch |
| `perf:` | Making the site faster without changing what it does | `perf: lazy-load member photos` | patch |
| `refactor:` | Restructuring code without intended behavior change | `refactor: split page rendering into modules` | patch |
| `build:` | The export, Dockerfile, or other build setup | `build: update container base image` | patch |
| `deps:` | Updating dependencies (Dependabot uses this) | `deps: bump yaml to 2.10.0` | patch |
| `revert:` | Undoing an earlier change | `revert: "theme: darken button hover color"` | patch |
| `feat:` | Something new: page, component, CMS section, new color key or content field | `feat: add alumni filter to members page` | minor `1.4.3 → 1.5.0` |
| `test:` | Only tests | `test: cover calendar link escaping` | none |
| `ci:` | Only CI workflows | `ci: run image check on pull requests` | none |
| `docs:` | Only documentation | `docs: explain release types` | none |
| `style:` | Only code formatting (not visual style; that's `theme:` or `fix:`) | `style: reformat server module` | none |
| `chore:` | Repo housekeeping that doesn't affect the site | `chore: update .gitignore` | none |

**Major** (`1.5.0 → 2.0.0`) = a **breaking change**: something others rely on stops working as before. Here that means a color key or content field is renamed or removed (editors' files and the CMS break), page URLs change (links and search results break), or a deploy needs manual steps. Mark it with `!` after the type (`feat!: rename footer color keys`) or add a line `BREAKING CHANGE: <what breaks>` to the PR description. A big rewrite that keeps all of those working is **not** major.

The rule of thumb: **if a change could make the live site behave or look different, even by accident, it gets at least a patch**, so any problem can be traced to the release that introduced it. Tests, CI, docs, and formatting can't, so they don't release.

**Releases** *(automation planned; see [PROJECT_LOG.md](PROJECT_LOG.md))*: a bot (release-please) keeps a "Release v1.5.0" PR open that collects merged changes into a changelog. Merging that PR creates the git tag `v1.5.0` and a GitHub Release with the notes, and publishes the matching container image. Until then there are no version tags.

## 6. Images

**CI rejects oversized or misnamed images.** Every image falls into one class by its folder, and each class has its own limits in `content/site.yaml` under `image-limits:`:

| Class (`image-limits:` section) | Folder in `public/assets/images/` | Longest side | File size |
|---|---|---|---|
| `portraits` | `members/` | 1080 px | 225 KB |
| `team-photos` | `teams/` | 1200 px | 250 KB |
| `other` | anything else | 1200 px | 300 KB |

All three sections are required, so no image goes unchecked; a misspelled section name fails the check. Also: no two identical files (reuse the existing one instead).

Phone photos are around 4000 px and 3–5 MB, so **resize before adding**:

```bash
convert photo.jpg -auto-orient -resize '1200x1200>' -strip -quality 82 -interlace JPEG photo-small.jpg
convert photo.jpg -auto-orient -resize '1080x1080>' -strip -quality 82 -interlace JPEG firstname-lastname.jpg   # member portraits
npm run check:images
```

(`-auto-orient` keeps rotation right, `-strip` removes camera metadata such as location, `-quality 82` is visually lossless for photos. ImageMagick 7: use `magick` instead of `convert`.)

Use JPEG for photos, PNG only for logos or anything that needs transparency.

### Member portraits

Every member's photo goes in **`public/assets/images/members/`**, named after the person:

| Name | File |
|---|---|
| Tess O'Brien | `tess-obrien.jpg` |
| Aiden Garland-Sutter | `aiden-garland-sutter.jpg` |
| Lukas "Kukas" Unguraitis | `lukas-unguraitis.jpg` (no nicknames) |
| A second Alex Kim | `alex-kim-2.jpg` |

Rules: lowercase, words joined by `-`, apostrophes and accents dropped, `.jpg` only, no subfolders. CI rejects anything else (e.g. `IMG_1234.jpg`). The name matters because it will be the member's ID once members are data, so anyone can find a person's photo without looking it up. Set the page's `alt` text to the person's full name. No photo yet? Point the card at the shared `assets/images/portrait-placeholder.jpg` with `alt="Photo of <Name> coming soon"`; don't copy it per person (duplicate files fail the check). Every portrait is sized for the large (half-width) card, so anyone can be moved into one without a new photo.

### Team photos

Team photos and logos go in **`public/assets/images/teams/`**, named after the team: the team's `id` in `content/theme.yaml` if it has one (e.g. `twist-and-trout.jpg`, `umic.png`), otherwise the team name in lowercase with hyphens (e.g. `purrmuda-triangle.jpg`). When a team renames, rename its photo (and its `theme.yaml` id) in the same change. CI checks the name's format only, not that it matches a current team, because teams rename about once a year. `.jpg` for photos, `.png` for logos; no subfolders. Set `alt` to "<Team name> team photo" or "<Team name> logo".

**Exceptions** (when an image genuinely needs to be bigger, like a full-width banner): add it under `image-limits: exceptions:` in `content/site.yaml` with a reason (exceptions skip the size limits, not the naming rules):

```yaml
image-limits:
  exceptions:
    new-banner.jpg: Full-width banner on the About page; 1920 px needed on large screens
```

Keep the list short: every exception is a file every visitor downloads. The check fails if an exception names a file that no longer exists.

Why it's strict: git keeps every version of every file forever, so one 5 MB photo makes every future clone of the repository 5 MB bigger, even after it's replaced.

## 7. Deploying

### Cloudflare Workers (the live site)

The site is hosted as **Workers static assets**: Cloudflare serves the files in `dist/` straight from its network. No server code runs, and requests for static files are free. [`wrangler.jsonc`](../wrangler.jsonc) tells Cloudflare where the files are and how to handle URLs (clean URLs, `404.html`); `_redirects` and `_headers` in `dist/` work as they did on Pages.

Cloudflare **builds straight from GitHub** (Workers Builds, [setup](#8-one-time-project-setup)):

- Every merge to `main` installs dependencies, then runs `npx wrangler deploy`: wrangler builds `dist/` itself (`npm run export`, the `build` command in `wrangler.jsonc`) and the live site updates.
- Every other branch runs `npx wrangler preview` (Cloudflare's Worker Previews, in open beta), which gives it its own **preview URL** without touching the live site. Check changes there before merging. Preview links ask officers to log in (Cloudflare Access), since they show unmerged changes.

The build machine's Node version comes from `.nvmrc`.

Nothing to run by hand. **Manual deploy** (only if the automatic one is broken, or before it's set up):

```bash
npm ci && npm run export
npx wrangler login                     # first time only; opens a browser to log in to Cloudflare
npx wrangler deploy
```

`wrangler` is Cloudflare's command-line tool; `npx` downloads and runs it, so there's nothing to install.

**Check against Cloudflare's own runtime:** `npx wrangler dev` (it runs the export first) serves `dist/` exactly as Cloudflare will, at http://localhost:8787. `npm start` imitates it closely enough for daily work; use this when changing redirects, headers, or URL handling. It leaves a `.wrangler/` folder behind; delete it.

### Scheduled rebuilds *(planned)*

The calendar page will be built from the shows Google Calendar when the site is exported. To pick up new shows without anyone merging a PR, a **daily scheduled job** will rebuild and deploy the site (mechanism to be chosen: a GitHub Actions job running the manual deploy above with a Cloudflare API token, or a Cloudflare-side trigger).

## 8. One-time project setup

Done once when the project is set up or handed to new owners. Tick each off in [PROJECT_LOG.md](PROJECT_LOG.md).

**GitHub**
1. Create the repository (public), push `main`, and make `main` the default branch (Settings → General). Dependabot opens its PRs against the default branch.
2. **Protect `main`:** Settings → Rules → Rulesets → New branch ruleset targeting `main`:
   - require a pull request before merging;
   - require status checks: **Lint, typecheck, test**, **Kubernetes manifests**, **Container image**, **Conventional PR title** (names must match exactly);
   - block force pushes.

   Then Settings → General → Pull Requests: allow **squash merging** only, set its default commit message to **Pull request title** (so the checked PR title becomes the commit on `main`, even for one-commit PRs), and turn on **Automatically delete head branches** (stacked PRs get retargeted to `main` when their base branch goes). Rulesets are free on public repos; if the repo is ever made private, they need GitHub Pro or Team (students get Pro free with the [GitHub Student Developer Pack](https://education.github.com/pack)).
3. **Roster officers:** Settings → Secrets and variables → Actions → Variables → new variable `ROSTER_OFFICERS` = comma-separated GitHub usernames of officers allowed to approve roster overrides (e.g. for removing someone from the roster without marking them as alumni, or when someone is kicked out of Hive). See [§9](#9-roster-changes).
4. **Log retention:** Settings → Actions → General → artifact and log retention, e.g. 30 days. Roster-override approvals exist only in these logs.
5. **Dependabot** runs automatically from `.github/dependabot.yml`. Turn on alerts under Settings → Code security.

**Cloudflare Workers**
1. Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → install Cloudflare's GitHub app and grant it this repository → select it.
2. Build command `npm ci && npm run export` (the export also runs from `wrangler.jsonc`, so a missing or ignored build command can't ship an empty site); deploy command `npx wrangler deploy`; non-production branch deploy command `npx wrangler preview` (the default; it needs the `previews` block in `wrangler.jsonc`. If the beta misbehaves, `npx wrangler versions upload` also works); production branch `main`; root directory blank. No `NODE_VERSION` needed: `.nvmrc` sets it.
3. Settings → Domains & Routes → add the custom domain `hivesocietyimprov.com`. Then send `www` to it: Rules → Redirect Rules → template **Redirect from WWW to root**, target `https://hivesocietyimprov.com` (not `www`, or it loops).
4. **Lock previews to officers.** Preview links show unmerged changes, so only officers should see them. `wrangler.jsonc` already turns previews on; the login is set up here:
   - Turn on Zero Trust if it isn't yet, choosing the **Free** plan: up to 50 people, and over that it refuses new logins instead of billing. Cloudflare may ask for a card; check Manage Account → Billing afterwards shows Zero Trust Free at $0.
   - The Worker → **Access** tab → **Protect this Worker behind Access** → **Previews only** (not "All traffic", which would put a login in front of the public site too) → pick a policy → **Apply Access**.
   - Then in Zero Trust → Access, edit that policy to **Include → Emails** with the officers' addresses, and use **One-time PIN** as the login method (Cloudflare emails a code; nothing else to set up). An email list is better than the "Cloudflare account" policy, which would mean making every officer a member of the Cloudflare account.
   - Set seat expiration (Zero Trust settings) so former officers free their seat.
   - Check: open a preview link in a private window. You should get a Cloudflare login page, not the site.
5. Analytics & Logs → **Web Analytics** → enable for the domain (free, no cookies).
6. Before moving the domain, check the new build at the Worker's own address, `hive-society-website.<account>.workers.dev`, which always shows the latest `main`. Once the new project serves the domain, delete the old Pages project.

**Google** (Hive Google account)
- The **"Hive Shows - Website Calendar"** must stay **public**; its ID is in `content/site.yaml`.
- The mailing-list **Google Form**'s question IDs are in `content/site.yaml`; confirm with `npm run check:form`.

## 9. Roster changes

*(The roster check is planned; it needs members stored as data, part of the Astro migration.)*

**The rule:** when someone leaves the active roster, they move to **Alumni**, even if they quit rather than graduated. A CI check will block any PR that removes someone from the roster without adding them to Alumni.

**The override** covers removing someone from the roster without marking them as alumni, for example when someone is kicked out of Hive. An officer approves the PR instead of the check:

1. On GitHub: **Actions** → **Approve roster removal** → **Run workflow**.
2. Enter the PR number and run it.

The action checks the person running it is listed in `ROSTER_OFFICERS` ([§8](#8-one-time-project-setup)), then marks the roster check as passed for that exact version of the PR. If anyone pushes more changes, the approval no longer applies and must be repeated.

**What's recorded:** no label, tag, file, or note in the PR. The only trace is the Action's run log, which GitHub deletes after the retention period. The person's removal is visible in git history like any other edit, and they simply don't appear on the next version of the site.

## 10. Tests and checks

### Test suites (`npm test`)

Written with Node's built-in test runner (`node:test`, no extra framework). All offline, under a second. This table must list every file in `tests/`; a test enforces it.

| File | What it guarantees |
|---|---|
| `tests/app.test.mts` | The local server behaves like Cloudflare: pages load at `/` and without `.html`, `.html`, `/index` and trailing-slash URLs redirect to the clean URL, Cloudflare's config files (`_redirects`, `_headers`) are never served, `_redirects` rules are followed (and unsupported rule syntax is rejected), unknown URLs get the 404 page with a 404 status; caching behaves (unchanged files answer "not modified", versioned files are cached long-term); links from `site.yaml` are filled in; the health-check URL works; attempts to read files outside the site (path traversal) are refused; only GET/HEAD requests are allowed |
| `tests/render.test.mts` | Filling in the current year (footer copyright); filling in named links (escaped safely; unknown names stop the build instead of leaving a dead link) and adding version codes to stylesheet/image URLs, relative or root-absolute (`/assets/…`); adding the canonical link and `og:` link-preview tags from the page's own title and description (escaped once; refused if a page already has them) |
| `tests/seo.test.mts` | Runs the real export and checks what search engines and link previews see: every page has one unique title (10-60 characters) and one unique description (50-160), a canonical link and `og:url` naming its clean URL on the bare domain, `og:title`/`og:description` matching the page, an absolute `og:image`, a language, and no `noindex`; the sitemap lists exactly the pages; `robots.txt` allows crawling and names the sitemap. Failing on a description? Rewrite it so it's unique and the right length |
| `tests/site.test.mts` | `content/site.yaml` loads; mistakes are reported with the exact setting named; the "Add to Google Calendar" and Apple/Outlook links are built correctly |
| `tests/forms.test.mts` | Reading a Google Form's questions, and detecting when a question was deleted/re-created or a new required one added. Uses a built-in sample, not the live form |
| `tests/contrast.test.mts` | Contrast math (WCAG 2.1 ratios, 4.5:1 text, 3:1 large text and icons, see-through backgrounds), that every theme color is in a checked pair, and that the site's colors pass except for listed waivers (and no waiver is left over once fixed) |
| `tests/members-order.test.mts` | The members page order is fixed by rule, so it never depends on who edited last: Executive Board by position rank, then seniority; Active Members and Alumni by seniority (graduation year, then last name, then first name; no year yet = last). An unranked board role fails the test |
| `tests/redirects.test.mts` | `public/_redirects` is well-formed, every old URL points at a page that exists, and no redirect hides a page that still exists |
| `tests/theme.test.mts` | The color rules for `theme.yaml`: real hex values only, no color names or references, correct naming, valid team list |
| `tests/images.test.mts` | Reading image dimensions, and the image rules: per-folder size limits, every class has limits, exceptions need a reason, no duplicates, no leftover exceptions, member portrait and team photo naming |
| `tests/css-structure.test.mts` | Each page loads `base.css` plus exactly the stylesheets for the kinds of section it contains (`<section class="hero">` → `sections/hero.css`), and no section stylesheet is left unused. Failing? Add or remove the page's `<link>` to match its sections |
| `tests/site-links.test.mts` | Every link and image on every page points to a file that exists, and links between pages use clean URLs (`about`, not `about.html`) |
| `tests/docs.test.mts` | This runbook lists every npm script, every test file, and every allowed PR-title type |

### What CI runs (automatic testing)

**CI** (continuous integration) means GitHub runs these checks automatically on every PR, so problems are caught before they reach the live site. The ones marked "Blocks merging" must pass before a PR can be merged.

| Check (as shown on the PR) | What it does | When | Blocks merging? |
|---|---|---|---|
| **Lint, typecheck, test** | Installs dependencies, runs lint, type check, theme check, image check, all tests, and the export | Every PR and every update to `main` | Yes |
| **Kubernetes manifests** | Checks the (optional) Kubernetes configuration is valid; see [CONTAINERIZATION.md](CONTAINERIZATION.md) | Same | Yes |
| **Container image** | Builds the (optional) container and confirms it serves pages; see [CONTAINERIZATION.md](CONTAINERIZATION.md) | Same | Yes |
| **Conventional PR title** | PR title starts with an allowed type ([§5](#5-versions-and-releases)) | When a PR is opened or edited | Yes |
| **Label by PR type** | Labels the PR `type: <type>` from its title, plus `breaking` for `type!:` or a `BREAKING CHANGE:` line, so PRs can be filtered by kind: search `label:"type: content"`. Fixes itself when the title is edited | When a PR is opened or edited | No |
| **Live form matches site settings** | `npm run check:form` against the real Google Form | Daily, on demand, and on PRs that change form settings | No: it depends on Google being reachable |
| Dependabot | Opens PRs that update dependencies; they go through the checks above | Weekly | n/a |

**Changes made in the site editor (CMS)** also arrive as PRs, so the same checks apply to them: a bad color or oversized photo from the editor fails CI like any other change. The editor doesn't run `npm` itself; it runs in the browser. It will get its own instant field checks (e.g. color format) when it's configured, so editors see mistakes before saving.

### Not covered yet

Planned ([PROJECT_LOG.md](PROJECT_LOG.md)): browser tests on phone and desktop sizes (Playwright), accessibility checks (axe), screenshot comparison, performance and SEO scores (Lighthouse, with the Astro migration), a color-contrast check, and the roster check. Nothing tests the exported `dist/` folder directly yet.

Checked by hand only: the "Add to Google Calendar" button (needs a signed-in Google account).

## 11. When CI fails

Open the failed check on the PR and read the log; every check prints what's wrong.

| Failing check / step | What it means | Fix |
|---|---|---|
| **Conventional PR title** | The title doesn't start with an allowed type | Edit the PR title (e.g. `fix: …`). No new commit needed |
| Lint | ESLint found a likely bug or style problem | Run `npm run lint` locally; `npm run lint -- --fix` fixes most |
| Validate HTML | A page has invalid or inaccessible markup (e.g. a missing `alt`, a skipped heading level, a `<div>` inside a heading) | Run `npm run lint:html` locally; each message names the file, line, and rule with a link explaining the fix |
| Typecheck | A value is used inconsistently with its type | Run `npm run typecheck`; the message names the file and line |
| Validate theme.yaml | A color isn't a hex value, a key is misnamed, or a team entry is malformed | The message names the exact key in `content/theme.yaml` |
| Check image sizes | An image is too large, duplicated, a member portrait is misnamed, or an exception is stale | Resize or rename ([§6](#6-images)), reuse the existing file, or add/remove an exception |
| Test: *local links and assets resolve* | A page points to a file that doesn't exist | The failure lists the missing paths |
| Test: *docs/RUNBOOK.md …* | A script, test file, or PR type was added without documenting it here | Add the row to [§3](#3-npm-scripts), [§10](#10-tests-and-checks), or [§5](#5-versions-and-releases) |
| **Kubernetes manifests** / **Container image** | The optional container setup broke | See [CONTAINERIZATION.md](CONTAINERIZATION.md#when-its-checks-fail) |
| **Live form matches site settings** (daily) | A Google Form question was deleted, re-created, or a required one added | `npm run check:form` says which. Update the ID in `content/site.yaml` (open the form → ⋮ → *Get pre-filled link*; fields appear as `entry.<id>`) |

## 12. Routine maintenance

| When | Task |
|---|---|
| Weekly | Review and merge Dependabot PRs once their checks pass. If one fails because two packages can't agree on a version (`npm ci` says `ERESOLVE`), don't force it: hold that update with an `ignore` entry in `.github/dependabot.yml`, with a comment saying when to remove it |
| When the daily form check emails you | [§11](#11-when-ci-fails), last row |
| Start of each semester | Upcoming shows are in the shows calendar; roster is updated (leavers → Alumni); `ROSTER_OFFICERS` lists current officers |
| When officers change | Update GitHub access, `ROSTER_OFFICERS`, and who can access the Hive Google and Cloudflare accounts |
| Before making the repo public | Review git history for anything that shouldn't be public |

## 13. Troubleshooting

- **Browser shows an old version:** hard-reload (Ctrl/Cmd + Shift + R). On the live site this shouldn't happen; if it does, check the deploy ran `npm run export`.
- **`npm start` fails with a `site.yaml` error:** the message names the setting to fix in `content/site.yaml`.
- **"Port 8080 already in use":** `PORT=3000 npm start`, or find what's using it with `lsof -i :8080`.
- **`npm ci` fails:** `package.json` and `package-lock.json` disagree. Run `npm install` once and commit both files.
