/**
 * The members page order is fixed by rule, so nobody's position depends on who edited the page
 * last (so no one gets hurt fee-fees :P).
 * - Executive Board: by position rank (RANK below), then seniority.
 * - Active Members: by team seniority (team order in content/teams.yaml, oldest first; members on
 *   no team last), then seniority.
 * - Alumni: by seniority.
 * Seniority = earliest graduation year first, then last name, then first name; members without a
 * year yet ("Class of '??") come last.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const page = await readFile('public/members.html', 'utf8');

interface Team { id: string; name: string; members: string[]; 'on-hiatus'?: string[] }
const { teams } = parse(await readFile('content/teams.yaml', 'utf8')) as { teams: Team[] };
/** Member ID → index of their team in teams.yaml (0 = oldest). */
const teamIndex = new Map(teams.flatMap((team, i) => team.members.map((id) => [id, i] as const)));

interface Person { id: string; name: string; year: number; role?: string; team?: number }

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

/** "Class of '27", "Class of Fall '23", "Graduate Class of '25", "Class of '(19)25" → 27, 23, 25, 25; unknown → 99. */
function classYear(html: string): number {
  const m = /Class of (?:Fall )?'(?:\(19\))?(\d\d)/.exec(text(html));
  return m?.[1] === undefined ? 99 : Number(m[1]);
}

/** Executive Board roles, highest first. A role not listed here fails the test, so a new role gets a rank. */
const RANK = ['Hive Co-President', 'Hive Vice President', 'Hive Secretary', 'Hive Treasurer', 'Hive Membership Director'];

function sortKey({ name, year, role, team }: Person): string {
  const parts = name.replace(/"[^"]*"/g, '').trim().split(/\s+/);
  const rank = role === undefined ? 0 : RANK.indexOf(role);
  assert.ok(rank >= 0, `unknown Executive Board role "${role ?? ''}" for ${name}; add it to RANK`);
  const group = team ?? 99;
  return `${String(rank).padStart(2, '0')} ${String(group).padStart(2, '0')} ${String(year).padStart(2, '0')} ${(parts.at(-1) ?? '').toLowerCase()} ${(parts[0] ?? '').toLowerCase()}`;
}

/** Cards between `start` and `end`, each read with `cardPattern` (group 1 = card HTML, containing the name). */
function people(start: string, end: string, cardPattern: RegExp, namePattern: RegExp): Person[] {
  const from = page.indexOf(start);
  const section = page.slice(from, page.indexOf(end, from + start.length));
  return [...section.matchAll(cardPattern)].map(([card]) => {
    // A member's ID is their portrait's file name (cards without a portrait have no ID).
    const id = /assets\/images\/members\/([a-z0-9-]+)\.jpg/.exec(card)?.[1] ?? '';
    const person: Person = { id, name: text(namePattern.exec(card)?.[1] ?? '').trim(), year: classYear(card) };
    // Board cards open with the role: <p class="body-text …">Hive Co-President<br>…
    const role = /<p class="body-text[^"]*">([^<]*)<br>/.exec(card)?.[1];
    if (role !== undefined && start.includes('executive-board')) person.role = role.trim();
    return person;
  });
}

const activeMembers = people('<section class="member-grid"', '<section class="section-heading', /<div class="item [\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/g, /<h3[^>]*>\s*<strong>(.*?)<\/strong>/)
  .map((person) => ({ ...person, team: teamIndex.get(person.id) }));
const sections = {
  'Executive Board': people('id="executive-board"', 'id="active-members"', /<section class="feature-row[\s\S]*?<\/section>/g, /<h3[^>]*>\s*<strong>(.*?)<\/strong>/),
  'Active Members': activeMembers,
  Alumni: people('<section class="alumni-list"', '</section>', /<div class="item [\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, /<h3[^>]*>\s*<strong>(.*?)<\/strong>/),
};

describe('members page order', () => {
  for (const [title, list] of Object.entries(sections)) {
    it(`${title} is in the required order`, () => {
      assert.ok(list.length > 0, `found no people under ${title}; did the markup change?`);
      const sorted = [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      assert.deepEqual(list.map((p) => p.name), sorted.map((p) => p.name));
    });
  }

  it('reads every card (counts match the page)', () => {
    assert.equal(sections['Executive Board'].length, (page.match(/<section class="feature-row/g) ?? []).length);
    assert.equal(sections['Active Members'].length, (page.match(/<h3 class="item-title/g) ?? []).length);
    assert.equal(sections.Alumni.length, (page.match(/<h3 class="card-title/g) ?? []).length);
  });
});

describe('content/teams.yaml', () => {
  const onPage = new Set([...sections['Executive Board'], ...activeMembers].map((p) => p.id));

  it('lists each team with an id, a name, and members', () => {
    assert.ok(Array.isArray(teams) && teams.length > 0, 'expected a non-empty `teams:` list');
    for (const team of teams) {
      assert.ok(typeof team.id === 'string' && team.id !== '' && typeof team.name === 'string' && team.name !== '', `team ${JSON.stringify(team)} needs an id and a name`);
      assert.ok(Array.isArray(team.members) && team.members.length > 0, `${team.id} has no members`);
    }
    assert.equal(new Set(teams.map((t) => t.id)).size, teams.length, 'team ids must be unique');
  });

  it('puts each member on at most one team', () => {
    const all = teams.flatMap((t) => t.members);
    assert.deepEqual(all.filter((id, i) => all.indexOf(id) !== i), []);
  });

  it('only lists current members (IDs match portraits on the members page)', () => {
    for (const team of teams) {
      assert.deepEqual(team.members.filter((id) => !onPage.has(id)), [], `${team.id} lists IDs with no Executive Board or Active Members card`);
    }
  });

  it('only marks a team\'s own members as on hiatus', () => {
    for (const team of teams) {
      assert.deepEqual((team['on-hiatus'] ?? []).filter((id) => !team.members.includes(id)), [], `${team.id}: on-hiatus IDs must also be in its members`);
    }
  });
});
