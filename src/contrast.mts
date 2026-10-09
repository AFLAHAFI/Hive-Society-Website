/**
 * WCAG 2.1 contrast check for `content/theme.yaml`: every text/icon color against the background it
 * sits on. Runs in CI via `npm run validate:theme`, so a color edit that makes text unreadable fails
 * the PR instead of shipping.
 *
 * Which key sits on which background is a fact about the site's layout, not about colors, so the
 * pairs live here rather than in theme.yaml (whose rules forbid references between keys).
 * `uncoveredThemeKeys` makes sure a new theme key can't dodge the check by not being in any pair.
 */
import Color from 'colorjs.io';

/** Minimum ratios from WCAG 2.1 SC 1.4.3 (text) and 1.4.11 (non-text: icons, UI shapes). */
export const MIN_RATIO = { text: 4.5, large: 3, ui: 3 } as const;

export interface ContrastPair {
  /** Dotted theme key of the foreground (text or icon). */
  fg: string;
  /** Dotted theme key of what it's drawn on. */
  bg: string;
  /** What's drawn: body text (4.5:1), large text ≥ 24px or bold ≥ 18.66px (3:1), or an icon/UI shape (3:1). */
  kind: keyof typeof MIN_RATIO;
  /** Set when `bg` is translucent: the opaque color showing through it. */
  under?: string;
}

/** Every place a theme color is drawn on another. Teams are added per entry by `themePairs`. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: 'navigation.text', bg: 'navigation.background', under: 'page.background', kind: 'text' },
  { fg: 'navigation.menu-icon', bg: 'navigation.background', under: 'page.background', kind: 'ui' },
  { fg: 'navigation.dropdown-text', bg: 'navigation.dropdown-background', kind: 'text' },
  { fg: 'page.text', bg: 'page.background', kind: 'text' },
  { fg: 'page.heading', bg: 'page.background', kind: 'large' },
  { fg: 'section-band.text', bg: 'section-band.background', kind: 'large' },
  { fg: 'buttons.text', bg: 'buttons.background', kind: 'text' },
  { fg: 'buttons.hover-text', bg: 'buttons.hover-background', kind: 'text' },
  { fg: 'links.text', bg: 'page.background', kind: 'text' },
  { fg: 'links.hover-text', bg: 'page.background', kind: 'text' },
  { fg: 'member-cards.name', bg: 'member-cards.background', kind: 'large' },
  { fg: 'member-cards.details', bg: 'member-cards.background', kind: 'text' },
  { fg: 'footer.heading', bg: 'footer.background', kind: 'large' },
  { fg: 'footer.text', bg: 'footer.background', kind: 'text' },
  { fg: 'footer.copyright', bg: 'footer.background', kind: 'text' },
  { fg: 'footer.social-icon', bg: 'footer.social-icon-background', kind: 'ui' },
  { fg: 'footer.social-icon', bg: 'footer.social-icon-hover-background', kind: 'ui' },
  { fg: 'footer.social-icon-background', bg: 'footer.background', kind: 'ui' },
];

/**
 * Known failures that warn instead of failing CI, keyed `fg on bg`. Each needs a reason and should
 * be temporary: fix the color, then delete the entry (a stale entry is reported).
 */
export const CONTRAST_WAIVERS: Readonly<Partial<Record<string, string>>> = {
  'links.text on page.background': 'Inherited from the Mobirise site; new link colors pending a design decision (issue #26)',
  'links.hover-text on page.background': 'Same as links.text',
};

export interface ContrastResult {
  pair: ContrastPair;
  ratio: number;
  required: number;
}

/** The static pairs plus each team's text on its background. */
export function themePairs(doc: Record<string, unknown>): ContrastPair[] {
  const teams = Array.isArray(doc.teams) ? (doc.teams as { id: string }[]) : [];
  return [...CONTRAST_PAIRS, ...teams.map((t): ContrastPair => ({ fg: `teams.${t.id}.text`, bg: `teams.${t.id}.background`, kind: 'text' }))];
}

/** Dotted key (`teams.<id>.text` for teams) → hex, from a theme that passed `validateTheme`. */
export function themeColors(doc: Record<string, unknown>): Map<string, string> {
  const colors = new Map<string, string>();
  for (const [group, value] of Object.entries(doc)) {
    if (Array.isArray(value)) {
      for (const team of value as Record<string, string>[]) {
        for (const [key, hex] of Object.entries(team)) if (key !== 'id') colors.set(`${group}.${team.id}.${key}`, hex);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, hex] of Object.entries(value)) colors.set(`${group}.${key}`, String(hex));
    }
  }
  return colors;
}

/** Composites a translucent color over an opaque one the way browsers do (in sRGB). */
function flatten(color: Color, under: Color): Color {
  const a = color.alpha;
  const top = color.to('srgb').coords;
  const bottom = under.to('srgb').coords;
  return new Color('srgb', [0, 1, 2].map((i) => (top[i] ?? 0) * a + (bottom[i] ?? 0) * (1 - a)) as [number, number, number]);
}

/** Contrast ratio for every pair; throws if a pair names a key the theme doesn't have. */
export function checkContrast(colors: ReadonlyMap<string, string>, pairs: readonly ContrastPair[]): ContrastResult[] {
  const get = (key: string): Color => {
    const hex = colors.get(key);
    if (hex === undefined) throw new Error(`contrast pair names "${key}", which isn't in theme.yaml (renamed? update src/contrast.mts)`);
    return new Color(hex);
  };
  return pairs.map((pair) => {
    let bg = get(pair.bg);
    if (pair.under !== undefined) bg = flatten(bg, get(pair.under));
    const ratio = get(pair.fg).contrast(bg, 'WCAG21');
    return { pair, ratio, required: MIN_RATIO[pair.kind] };
  });
}

export const pairLabel = (p: ContrastPair): string => `${p.fg} on ${p.bg}`;

/** Theme keys not used in any pair (as foreground, background, or `under`), so unchecked. */
export function uncoveredThemeKeys(colors: ReadonlyMap<string, string>, pairs: readonly ContrastPair[]): string[] {
  const used = new Set(pairs.flatMap((p) => [p.fg, p.bg, ...(p.under === undefined ? [] : [p.under])]));
  return [...colors.keys()].filter((k) => !used.has(k));
}
