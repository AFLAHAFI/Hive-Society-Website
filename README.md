# Hive Society Improv website

Source for [hivesocietyimprov.com](https://hivesocietyimprov.com/), the site for UIUC's long-form improv society.

**Not a developer?** Read [EDITING.md](EDITING.md) instead.

**Contents:** [Quick start](#quick-start) · [How it works](#how-it-works) · [Layout](#layout) · [Contributing](#contributing) · [Documentation](#documentation) · [Planned](#planned)

## Quick start

Requires Node 24+.

```bash
npm ci
npm start            # http://localhost:8080
```

Before committing, run the same checks CI runs:

```bash
npm run lint && npm run lint:html && npm run typecheck && npm test
```

Every command, deploy, and setup step is in [docs/RUNBOOK.md](docs/RUNBOOK.md).

## How it works

The pages are HTML files in `public/`. Colors and settings (calendar, mailing-list form, image limits) are YAML files in `content/`, checked in CI. `npm start` serves the site locally and behaves like Cloudflare, the live host. `npm run export` builds the static files that get deployed.

The site is moving to [Astro](https://astro.build/) so members, teams, and shows can be edited as data. Why Astro, and how the pieces fit: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Layout

```
public/          the website: pages (*.html), images, CSS
content/         theme.yaml (every site color), site.yaml (settings pages use)
src/             local server, page rendering, and the code that validates content/
scripts/         static export (→ dist/) and CLI checks
tests/           automated tests (node:test)
kube/            optional Kubernetes deployment
.github/         CI workflows and Dependabot
docs/            maintainer documentation (see Documentation below)
EDITING.md       guide for non-coders
AGENTS.md        instructions for AI coding agents
```

## Contributing

- Work on a branch and open a pull request; nothing goes to `main` directly. PRs are squash-merged once CI passes.
- Start the PR title with a type such as `content:`, `fix:`, or `feat:`. The type decides the version bump: [RUNBOOK §5](docs/RUNBOOK.md#5-versions-and-releases).
- The repository is public, including its history. Follow the roster-privacy rules in [AGENTS.md](AGENTS.md#roster-privacy) in every commit message and PR.

Step by step: [RUNBOOK §4](docs/RUNBOOK.md#4-making-a-change).

## Documentation

| Doc | For | What's in it |
|---|---|---|
| [EDITING.md](EDITING.md) | Officers and editors | What you can change yourself, and who to ask for the rest |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Maintainers | Every command, deploy, and setup step, tests and CI, what to do when a check fails |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Contributors | The stack, why Astro, theme color rules, caching |
| [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md) | Contributors | Decisions made and why (dated), open TODOs, and a log of finished work. Check it before starting something, since it may already be decided or on hold |
| [docs/CONTAINERIZATION.md](docs/CONTAINERIZATION.md) | Self-hosting only | Optional Docker and Kubernetes deployment; the live site doesn't use it |
| [docs/site-audit.md](docs/site-audit.md) | Background | The original site's content inventory, problems found, and the roadmap they led to |
| [AGENTS.md](AGENTS.md) | AI coding agents | Conventions and rules agents must follow |

## Planned

- **Astro migration:** decided, currently on hold.
- **Point-and-click editor** (Sveltia CMS) so officers can edit text, members, and colors without a developer.

Everything else, and the status of each item: [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md).
