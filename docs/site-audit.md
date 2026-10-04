# Site audit & roadmap: hivesocietyimprov.com

Snapshot taken 2026-09-23 from the live site (Mobirise v6.1.9 export on Cloudflare Pages), mirrored into `public/`.

## 1. Content inventory

| Page | Sections | Content | Source of truth today |
|---|---|---|---|
| `index` | hero | Tagline "The School of Long Form Improvisation…", "Laugh, Learn, Improvise.", CTA "Come See Us!" → calendar, hero image | Hand-edited HTML |
| `about` | hero | Two paragraphs: who we are, "reborn in 22-23", audition CTA → mailing list | Hand-edited HTML |
| `calendar` | embed | Indify calendar widget iframe (`indify.co/widgets/live/calendar/…`) | Indify (probably backed by a Google Calendar) |
| `members` | ~14 sections | **Exec board** (5: name, photo, roles, class year, bio). **Active members** (~37: name, photo, class year, one-line bio). **Alumni** (~21: name, class year, some photos) | Hand-edited HTML |
| `teams` | ~15 sections | **NewBee** (Open Mic Surgery), **Core** (Twist & Trout, Mental Chillness), **Elective** (UMIC, USUC), **Dispersed** (Gnome Alone, Purrmuda Triangle, Motion Slickness, Crocs and Sandals / Hive 22-23): name, formed/merged history, team photo, "(L to R)" roster caption | Hand-edited HTML |
| `contactus` | contacts | `buzz@hivesocietyimprov.com`, mailing address (1401 W. Green St., M/C 384, Urbana IL) | Hand-edited HTML |
| `mailinglist` | embed | Google Form iframe | Google Forms |
| All pages | nav, footer | Nav (Calendar, Members ▸ Member List/Teams/Alumni, About, Contact ▸ Mailing List), socials (Twitter, Facebook, Instagram, TikTok, YouTube), "© Copyright 2025" | **Duplicated in all 7 pages** |

Theme palette (from `mbr-additional.css`): purple `#593269` (text/brand), yellow `#ffeb69` (background), `#ffdd00` (section bands), `#fff29c`, orange `#ffa600`. Font: Inter Tight (Google Fonts).

## 2. Problems found

### Performance
- *(Resolved at import: source images are now normalized to ~7 MB total. Responsive variants are still TODO.)*
- **Total payload is 55 MB.** The homepage hero is an **8.4 MB PNG screenshot**, and one member photo is **10 MB** (`cachedimage-ilykeya.png`). Several others are 2–4 MB. Nothing is resized, and there's no `srcset`, no WebP/AVIF, and no `loading="lazy"` anywhere.
- ~~`mbr-additional.css` (166 KB) was requested with a different `?v=` query on each page, so browsers downloaded it 7 times~~ (fixed 2026-09-23: one URL).
- About 1 MB of Bootstrap and icon fonts are shipped for a handful of components.

### Mobile / layout
- **Members page:** every member is a full-width row, so on a 390 px phone each person takes about a whole screen. The page is about **25,000 px tall** (the footer starts at y≈25,460). There's no grid, search, or filter.
- Teams page: same stacked layout. The history and lineage (merges) are buried in body text.
- The calendar and mailing list are fixed-size third-party iframes. They don't match the theme and are awkward on mobile.

### Accessibility / SEO (Lighthouse, mobile, members page: a11y 86, SEO 92)
- ~~`<html>` has no `lang` attribute; social icon links have no accessible name~~ (fixed 2026-09-23). Still open: no `<main>` landmark, heading levels skip.
- `robots.txt` and `sitemap.xml` return the homepage HTML (a Pages fallback), so both are invalid. **`npm run export` now generates real ones.**
- The "Alumni" nav link points to `members.html#article11-15`, a Mobirise auto-generated ID that breaks when sections are reordered.
- The copyright year is hard-coded.

### Cleanup already done when importing into `public/`
- Collapsed the `?v=`/`?f2bix4` query-string filenames into single files.
- Decoded Cloudflare's email obfuscation back to a plain `mailto:` and removed the `/cdn-cgi/` script, since that only works when proxied through Cloudflare.
- Removed the Mobirise badge section (spacer GIF + inline styles), builder meta tags and editor-only attributes, and the unused YouTube-background script (2026-09-23).
- ~~Left as-is on purpose: the `cid-*` section classes that `mbr-additional.css` targets~~ (done 2026-09-24: renamed to readable section classes, `mbr-additional.css` → `sections.css` at 39 KB). The Bootstrap markup stays until the pages become templates (§5).

## 3. Where dynamic content, a database, or integrations fit

| Area | Today | Opportunity | Kind |
|---|---|---|---|
| **Members** | ~60 hand-written HTML blocks | One record per person: `name, slug, classYear, photo, bio, roles[], teams[], status`. The page is rendered from the data | Data (Beeble/YAML) |
| **Alumni** | Hand-moved list | **Derived**: `classYear < current academic year` (or `status: alumni`), so nobody has to move people each May | Derived |
| **Exec board** | Separate hand-written section | Derived from `roles[]`. Ordering by role is config | Derived |
| **Teams** | Prose history plus "(L to R)" captions | `Team { kind: newbee\|core\|elective\|dispersed, formed, mergedFrom[], photo, roster[] }`. Enables team↔member links, a lineage timeline, and "currently on" badges on member cards | Data + relations |
| **Shows / calendar** | Indify iframe | Events from Beeble or the Google Calendar API, rendered natively. The home page CTA becomes "**Next show: Fri 8pm @ Lincoln Hall**", plus a `.ics` / add-to-calendar link | Dynamic (build-time or server fetch) |
| **Auditions** | Mentioned in About text | A config flag `auditions.open` plus a date that shows a site-wide banner and switches CTAs | Config |
| **Mailing list** | Google Form iframe | Short term: keep it but style a native form that posts to the same Form. Longer term: a server endpoint that writes to Beeble or a list provider | Server endpoint |
| **Media** | YouTube link only | Latest videos via the YouTube Data API (build-time) on the home page | Build-time fetch |
| **Nav / footer / socials / contact** | Copied into 7 files | One `site.yaml` | Config |

Everything except the mailing list endpoint can be done at **build time**, so the static export stays fully static. The Node server only becomes necessary for form posts, live data without rebuilds, or preview/edit mode (§4).

## 4. Making content editable by non-technical people (map only, not implemented)

### Layers

```
theme.yaml     per-component colors  ──►  CSS custom properties (:root { --navigation-background: … }); rules in docs/ARCHITECTURE.md → Theme
site.yaml      nav, footer, socials, contact, auditions flag, copy blocks (hero text, about paragraphs)
content/       members/*.yaml, teams/*.yaml, events (or fetched from Beeble)
templates/     page layouts, which only reference tokens and data and never literal colors or text
```

The rule that makes this work is that **templates contain no literal colors or copy.** Every color is a `var(--token)`, and every visible string comes from YAML or data. Swapping a YAML file then re-themes or re-words the site without anyone touching HTML.

### Editing surfaces, least to most effort

| Tier | How editors work | Needs | Tradeoff |
|---|---|---|---|
| 0 | Edit YAML in GitHub's web UI; CI rebuilds and deploys | Nothing extra | Non-technical people will find YAML syntax errors frustrating |
| **1 (recommended)** | **Git-backed CMS**, e.g. [Sveltia CMS](https://github.com/sveltia/sveltia-cms) / [Decap CMS](https://decapcms.org/) / [Pages CMS](https://pagescms.org/). A form UI at `/admin` edits the same YAML files, commits to GitHub, and CI deploys | A config file describing the schema, plus GitHub OAuth | Fully static-compatible, no database, history and rollback via git. A change takes about a minute to go live |
| 2 | **In-browser theme/preview mode**: `?edit` (or `/admin/theme`) shows a panel of color pickers and font selects bound to the CSS custom properties, updating live. "Save" exports `theme.yaml` or commits it through the Tier 1 CMS | ~200 lines of client JS. Only works because of the token rule above | Instant visual feedback. Saving still goes through git |
| 3 | Data changes go live without a deploy (runtime fetch) | Node server with a cache | Instant edits, but requires the server (not a pure static export). Less relevant now that Beeble is git-based (§6) |

**Dev mode hot-swap:** the Node server watches `content/`, `site.yaml` and `theme.yaml`, re-renders on change, and pushes a reload over Server-Sent Events. Editing a YAML file refreshes the browser, which is the same loop editors get in Tier 2.

### Rendering engine (decide before implementing)
- **Astro**: content collections validate YAML with a schema (so typos fail the build, not the site), it does static export and Node SSR from one codebase, and "islands" add reactivity (member filters) only where needed. **Best fit** for Tiers 1–3.
- **Eleventy**: a simpler mental model that reads YAML natively with zero client JS by default. Reactivity has to be added by hand.
- **Hand-rolled** (`scripts/export.mts` plus template literals): no dependencies, but you rebuild what the options above already provide.

## 5. Layout improvements

- **Members:** a responsive card grid (2 columns on phones, 3–4 on desktop) with fixed-aspect (4:5) photos and name, year, and team chips on the card. Tapping or clicking expands the bio. Add filter chips for team, class year, and exec, plus name search. With about 40 members this is a few hundred bytes of JS, or plain CSS with `:has()`.
- **Exec board:** a horizontal scroll strip on mobile and a row on desktop, above the grid.
- **Teams:** cards grouped by kind, with a **lineage timeline** built from `formed` / `mergedFrom` (Hive 22-23 → Crocs and Sandals + Motion Slickness → Mental Chillness …). Roster names link to member cards instead of "(L to R)" prose.
- **Home:** hero with the next show and an auditions banner (both from data), the latest video, and a teams teaser.
- **Calendar:** a native event list (date, venue, team, ticket link, add to calendar), which removes the Indify iframe.
- **Images:** source images are normalized (≤1200 px, hero 1920; ~7 MB). Still to do: AVIF/WebP at 400/800/1200 px with `srcset` + `sizes` + `loading="lazy"` at export time.
- **Semantics:** `lang="en"`, `<main>`, one `<h1>` per page, labelled icon links, stable anchor IDs (`#alumni`).
- **Theme:** derive a dark mode from the tokens (`prefers-color-scheme`). The purple and yellow palette inverts well.

## 6. Beeble (external data source)

*Updated 2026-09-23.* Beeble is **Hive's handbook, built with [mdBook](https://rust-lang.github.io/mdBook/)**: Markdown in git (`lumirth/beeble`, by Lukas Unguraitis), deployed with GitHub Pages to **https://mirth.cc/beeble/**. It has no API or database; the git repo *is* the data source. Most chapters are stubs, and its planned "Archive: Roster / Achievements / Shows" section is commented out.

Managers want Beeble to be the source of truth for members and teams. The proposed approach (pending sign-off; details and TODOs in `docs/PROJECT_LOG.md`):
- Members and teams become **structured YAML** (`handbook/data/`), not prose. Beeble's roster pages *and* this site both render from it.
- Beeble is imported into this repo as `handbook/` (a monorepo), so one CMS, one PR, and one CI run cover both. It keeps its own deploy and URL.
- Fallback if it stays a separate repo: transfer it to the Hive org, give it a second CMS instance, and have the site fetch its data at build time.

Rendering Beeble's handbook prose on this site is **on hold**.

## 7. Suggested order
1. ~~Source image optimization~~ (done); responsive image variants in the export pipeline.
2. Pick a rendering engine; extract `site.yaml` + `theme.yaml` and move nav/footer into a layout.
3. Members and teams as data, with the new grid layout.
4. Tier 1 CMS.
5. Beeble data (members/teams YAML) once managers sign off; events.
6. Tier 2 theme editor.
