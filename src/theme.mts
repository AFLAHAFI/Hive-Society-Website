/**
 * Loading and validating `content/theme.yaml`.
 *
 * The rules are the ones in docs/ARCHITECTURE.md → Theme. This module enforces the parts a machine can check:
 * - groups map component keys to literal hex colors (no nesting, no references, no CSS names);
 * - keys and team ids are kebab-case, so they map 1:1 onto CSS custom property names;
 * - `teams` is a list of `{ id, background, text }` with unique ids.
 * "Keys name a place, not a color" is a human judgement and is left to review.
 */
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const HEX = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TEAM_COLOR_KEYS = ['background', 'text'] as const;

/** Shape of one `teams` entry once `validateTheme` has passed. */
export type ThemeTeam = { id: string } & Record<(typeof TEAM_COLOR_KEYS)[number], string>;

export interface ThemeIssue {
  /** Dotted location in the file, e.g. `buttons.text` or `teams[2].id`. */
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkColor(path: string, value: unknown, issues: ThemeIssue[]): void {
  if (typeof value !== 'string' || !HEX.test(value)) {
    issues.push({ path, message: `must be a hex color like "#593269" (or "#593269cc"), got ${JSON.stringify(value)}` });
  }
}

function checkTeams(value: unknown, issues: ThemeIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path: 'teams', message: 'must be a list of { id, background, text } entries' });
    return;
  }
  const seen = new Set<string>();
  value.forEach((team: unknown, i) => {
    const at = `teams[${i.toString()}]`;
    if (!isRecord(team)) {
      issues.push({ path: at, message: 'must be an object with id, background, text' });
      return;
    }
    const { id } = team;
    if (typeof id !== 'string' || !KEBAB.test(id)) {
      issues.push({ path: `${at}.id`, message: `must be a kebab-case id like "usuc", got ${JSON.stringify(id)}` });
    } else if (seen.has(id)) {
      issues.push({ path: `${at}.id`, message: `duplicate team id "${id}"` });
    } else {
      seen.add(id);
    }
    for (const key of TEAM_COLOR_KEYS) {
      if (!(key in team)) issues.push({ path: `${at}.${key}`, message: 'is required' });
    }
    for (const [key, color] of Object.entries(team)) {
      if (key === 'id') continue;
      if (!(TEAM_COLOR_KEYS as readonly string[]).includes(key)) {
        issues.push({ path: `${at}.${key}`, message: `unknown team key; allowed: ${TEAM_COLOR_KEYS.join(', ')}` });
        continue;
      }
      checkColor(`${at}.${key}`, color, issues);
    }
  });
}

/** Validates an already-parsed theme document. Returns every problem found (empty = valid). */
export function validateTheme(doc: unknown): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  if (!isRecord(doc)) return [{ path: '(root)', message: 'theme must be a mapping of groups' }];

  for (const [group, entries] of Object.entries(doc)) {
    if (!KEBAB.test(group)) issues.push({ path: group, message: 'group names must be kebab-case' });
    if (group === 'teams') {
      checkTeams(entries, issues);
      continue;
    }
    if (!isRecord(entries)) {
      issues.push({ path: group, message: 'must be a group of `key: "#hex"` entries' });
      continue;
    }
    for (const [key, value] of Object.entries(entries)) {
      const at = `${group}.${key}`;
      if (!KEBAB.test(key)) issues.push({ path: at, message: 'keys must be kebab-case' });
      checkColor(at, value, issues);
    }
  }
  return issues;
}

/**
 * Flattens a *valid* theme into CSS custom properties:
 * `navigation.background` → `--navigation-background`, team `usuc` → `--teams-usuc-background`.
 */
export function themeToCssVariables(doc: Record<string, unknown>): Map<string, string> {
  const vars = new Map<string, string>();
  for (const [group, entries] of Object.entries(doc)) {
    if (Array.isArray(entries)) {
      for (const team of entries as ThemeTeam[]) {
        for (const key of TEAM_COLOR_KEYS) vars.set(`--${group}-${team.id}-${key}`, team[key]);
      }
    } else if (isRecord(entries)) {
      for (const [key, value] of Object.entries(entries)) vars.set(`--${group}-${key}`, String(value));
    }
  }
  return vars;
}

/** Reads and parses a theme file. Parse errors throw; schema problems are reported by `validateTheme`. */
export async function loadTheme(path: string): Promise<unknown> {
  return parse(await readFile(path, 'utf8')) as unknown;
}
