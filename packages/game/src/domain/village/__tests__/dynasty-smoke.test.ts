import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { isLineMan, isSecondaryWife, lineMen, wivesOf } from '../dynasty';
import { isOvercrowded } from '../dwellings';
import { parentIndex } from '../kinship';
import { LORD } from '../rules';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';

// Kouřový test rodu (lord.md – Rod vojvody, fáze 1): ves se zakladateli několik let, každý rok
// invarianty rodu a manželek; výsledek nezávisí na kouscích dopočtu.

const START = dayIndexOf({ year: 601, month: 3, day: 1 });
const YEAR_DAYS = 365;
const STEP = 30;

const found = (): VillageState =>
  foundVillage({
    seed: 11,
    day: START,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    lord: { name: 'Bořivoj' },
  });

/** Dopočte ves po měsíčních krocích do dne `to`. */
function run(from: VillageState, to: number): VillageState {
  let s = from;
  while (s.lastDay < to) s = advanceVillage(s, Math.min(to, s.lastDay + STEP), null);
  return s;
}

/** Invarianty rodu po jednom roce; vrací popis porušení (prázdné = v pořádku). */
function violations(s: VillageState): string[] {
  const out: string[] = [];
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const index = parentIndex(s);
  const lordIds = new Set((s.dynasty?.lords ?? []).map((l) => l.id));
  const line = lineMen(s);
  const first = s.dynasty?.lords[0]?.id;
  for (const man of s.people.filter((p) => p.sex === 'male')) {
    const wives = wivesOf(s, man);
    if (wives.length > LORD.maxWives) out.push(`muž ${man.id} má ${wives.length} manželek`);
    if (man.spouseId !== undefined) {
      const w = byId.get(man.spouseId);
      if (!w || w.spouseId !== man.id) out.push(`muž ${man.id}: spouseId neodpovídá`);
    }
  }
  for (const w of s.people.filter((p) => p.sex === 'female' && p.spouseId !== undefined)) {
    const husband = byId.get(w.spouseId!);
    if (!husband || husband.sex !== 'male') out.push(`žena ${w.id} nemá žijícího muže`);
  }
  for (const man of line) {
    if (man.id !== first && !(man.fatherId !== undefined && index.has(man.fatherId))) {
      out.push(`muž rodu ${man.id} nemá otce v rodu`);
    }
    // bez jména smí být jen vojvoda a synové vojvody (čekají na hráče)
    const waiting =
      lordIds.has(man.id) || (man.fatherId !== undefined && lordIds.has(man.fatherId));
    if (man.name === undefined && !waiting) out.push(`muž rodu ${man.id} je bez jména`);
  }
  // vedlejší manželka v přeplněném domě manžela jen bez volného obydlí
  for (const w of s.people.filter((p) => isSecondaryWife(s, p))) {
    const husband = byId.get(w.spouseId!)!;
    if (w.dwellingId !== husband.dwellingId || !isOvercrowded(s, w.dwellingId, s.lastDay)) continue;
    const free = s.dwellings.filter(
      (d) => d.id !== w.dwellingId && !s.people.some((p) => p.dwellingId === d.id),
    );
    if (free.length > 0)
      out.push(`vedlejší manželka ${w.id} v přeplněném domě, volných ${free.length}`);
  }
  return out;
}

describe('rod vojvody – kouřový test', () => {
  it(
    'invarianty po každém roce a determinismus (5 let vcelku = 2 + 3)',
    { timeout: 240_000 },
    () => {
      const t0 = performance.now();
      let s = run(found(), START + YEAR_DAYS);
      const years = performance.now() - t0 < 6_000 ? 5 : 3; // pod 30 s, jinak 3 roky
      expect(violations(s)).toEqual([]);
      for (let y = 2; y <= years; y++) {
        s = run(s, START + y * YEAR_DAYS);
        expect(violations(s), `rok ${y}`).toEqual([]);
      }
      expect(s.people.some(isLineMan)).toBe(true);
      const split = run(run(found(), START + 2 * YEAR_DAYS), START + years * YEAR_DAYS);
      expect(JSON.stringify(split)).toBe(JSON.stringify(s));
    },
  );
});
