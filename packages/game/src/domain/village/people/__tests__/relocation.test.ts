import { describe, expect, it } from 'vitest';
import { foundVillage, startNewDwelling, startReplacement } from '../../core/actions';
import { availableSettlers } from '../households';
import { occupants } from '../people';
import {
  relocatingHouseholds,
  replacementAffordability,
  relocationBlock,
  relocationOf,
} from '../relocation';
import { DWELLINGS, DWELLING_TREES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Nový dům domácnosti (migration.md, demolition.md – Správce): domácnost si postaví nový dům a po
// dostavění se do něj přestěhuje; náhrada správce starý dům zbourá, starší přestěhování ne.

const DAY = 1000;
const HOME = { x: 10, z: 20, rotation: 0 };
const NEW_HOME = { x: 60, z: -40, rotation: 1 };

/** Ves s dostavěnou zemnicí zakladatelů (4 lidé, nikdo k osídlení) a 10 kládami na hromadě. */
function settled(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 7, day: DAY, dwellingPosition: HOME }));
  s.woodLogs = 10;
  return s;
}

const household = (s: VillageState): number => s.dwellings[0]!.id;

/** Ves dopočítaná do dne, kdy je přestěhování (stavba `id`) dostavěné. */
function untilFinished(s: VillageState, id: number): VillageState {
  let state = s;
  for (let day = s.lastDay + 30; day < s.lastDay + 3 * 365; day += 30) {
    state = advanceVillage(state, day, null);
    if (!state.constructions.some((c) => c.id === id)) return state;
  }
  throw new Error('Přestěhování se nedostavělo.');
}

describe('startReplacement', () => {
  it('nový dům domácnosti je stavba bez lidí k osídlení – běžné obydlí od 8. 11. 2026 taky', () => {
    const s = settled();
    expect(availableSettlers(s, DAY)).toBeLessThanOrEqual(0);
    expect(() => startNewDwelling(s, DAY, 'zemnice', NEW_HOME, 0)).not.toThrow();
    const next = startReplacement(s, DAY, household(s), 'zemnice', NEW_HOME, 4);
    const site = next.constructions.at(-1);
    expect(site).toMatchObject({
      kind: 'dwelling',
      dwellingType: 'zemnice',
      position: NEW_HOME,
      dwellingId: null,
      relocates: household(s),
      startedDay: DAY,
    });
    // dřevo z hromady jako u nového obydlí
    expect(site?.wood?.fromPile).toBe(DWELLING_TREES.zemnice);
    expect(next.woodLogs).toBe(10 - DWELLING_TREES.zemnice);
    expect(next.chronicle.at(-1)).toEqual({
      day: DAY,
      kind: 'relocation-started',
      dwellingId: household(s),
      type: 'zemnice',
    });
    // lidé k osídlení se nemění – přestěhování nikoho nečeká
    expect(availableSettlers(next, DAY)).toBe(availableSettlers(s, DAY));
    expect(relocatingHouseholds(next)).toEqual(new Set([household(s)]));
    expect(relocationOf(next, household(s))?.id).toBe(site?.id);
    // vstupní stav se nemění
    expect(s.constructions).toEqual([]);
  });

  it('podruhé, z prázdného nebo přestavovaného domu nejde', () => {
    const s = settled();
    const id = household(s);
    const once = startReplacement(s, DAY, id, 'zemnice', NEW_HOME, 0);
    expect(relocationBlock(once, id)).toBe('relocating');
    expect(() => startReplacement(once, DAY, id, 'zemnice', HOME, 0)).toThrow(RangeError);
    expect(relocationBlock(s, 999)).toBe('no-household');
    expect(() => startReplacement(s, DAY, 999, 'zemnice', NEW_HOME, 0)).toThrow(RangeError);
    const empty = structuredClone(s);
    empty.people = [];
    expect(relocationBlock(empty, id)).toBe('no-household');
    const rebuilding = structuredClone(s);
    rebuilding.constructions.push({
      id: 500,
      kind: 'rebuild',
      startedDay: DAY,
      cost: 10,
      done: 0,
      dwellingType: 'zemnice',
      position: null,
      dwellingId: id,
      fieldId: null,
    });
    expect(relocationBlock(rebuilding, id)).toBe('rebuilding');
    expect(() => startReplacement(rebuilding, DAY, id, 'zemnice', NEW_HOME, 0)).toThrow(RangeError);
  });

  it('cena předem je jen dřevo – lidi k osídlení nechce ani běžné obydlí', () => {
    const s = settled();
    for (const type of ['zemnice', 'polozemnice'] as const) {
      expect(replacementAffordability(s, type)).toEqual({ affordable: true, missing: {} });
    }
  });

  it('neplatný vstup a den do minulosti vsi vyhodí RangeError', () => {
    const s = settled();
    const id = household(s);
    expect(() => startReplacement(s, DAY, id, 'zemnice', { ...NEW_HOME, x: NaN }, 0)).toThrow(
      RangeError,
    );
    expect(() => startReplacement(s, DAY, id, 'zemnice', NEW_HOME, -1)).toThrow(RangeError);
    const later = structuredClone(s);
    later.lastDay = DAY + 5;
    expect(() => startReplacement(later, DAY + 4, id, 'zemnice', NEW_HOME, 0)).toThrow(RangeError);
  });
});

/** Rozestavěné přestěhování ze starší vsi (před bouráním): stavba nese `relocates` bez `replaces`. */
function legacyRelocation(s: VillageState, from: number): VillageState {
  const started = startReplacement(s, DAY, from, 'zemnice', NEW_HOME, 0);
  for (const c of started.constructions) delete c.replaces;
  return started;
}

/** Ves dopočítaná po dnech do dne, kdy podmínka platí (nejvýš rok). */
function untilDay(s: VillageState, done: (x: VillageState) => boolean): VillageState {
  let state = s;
  for (let day = s.lastDay + 1; day < s.lastDay + 365; day++) {
    state = advanceVillage(state, day, null);
    if (done(state)) return state;
  }
  throw new Error('Podmínka do roka nenastala.');
}

describe('náhrada domu správcem (demolition.md – Správce)', () => {
  it('po dostavění se domácnost přestěhuje a starý dům se opustí a zbourá', () => {
    const s = settled();
    const from = household(s);
    const started = startReplacement(s, DAY, from, 'zemnice', NEW_HOME, 0);
    const site = started.constructions.find((c) => c.relocates === from)!;
    expect(site.replaces).toBe(true);
    const moved = untilDay(started, (x) => !x.constructions.some((c) => c.id === site.id));
    // týž den: domácnost v novém domě, starý dům opuštěný a ve stavbě bourání
    expect(occupants(moved, from)).toEqual([]);
    expect(moved.dwellings.find((d) => d.id === from)?.disusedDay).toBe(moved.lastDay);
    const demolition = moved.constructions.find((c) => c.kind === 'demolition');
    expect(demolition?.demolition).toEqual({ structure: 'dwelling', id: from });
    // po bourání dům zmizí, kronika „zbořeno“
    const gone = untilDay(moved, (x) => !x.dwellings.some((d) => d.id === from));
    expect(gone.chronicle.filter((e) => e.kind === 'structure-demolished')).toEqual([
      expect.objectContaining({ structure: 'dwelling', id: from }),
    ]);
  });
});

describe('dostavěné přestěhování ze starší vsi (bez replaces)', () => {
  it('domácnost se přestěhuje do nového domu, starý zůstane prázdný, nebourá se a chátrá', () => {
    const s = settled();
    const from = household(s);
    const people = occupants(s, from).map((p) => p.id);
    const started = legacyRelocation(s, from);
    const siteId = started.constructions.at(-1)!.id;
    const done = untilFinished(started, siteId);
    const moved = done.chronicle.find((e) => e.kind === 'household-relocated');
    expect(moved).toMatchObject({ kind: 'household-relocated', fromDwellingId: from });
    if (moved?.kind !== 'household-relocated') throw new Error('Domácnost se nepřestěhovala.');
    const to = moved.toDwellingId;
    expect(to).not.toBe(from);
    const fresh = done.dwellings.find((d) => d.id === to);
    expect(fresh).toMatchObject({ type: 'zemnice', position: NEW_HOME, condition: 1 });
    // všichni původní obyvatelé (kdo žije) bydlí v novém domě, ve starém nikdo
    const alive = done.people.filter((p) => people.includes(p.id));
    expect(alive.length).toBeGreaterThan(0);
    expect(alive.every((p) => p.dwellingId === to)).toBe(true);
    expect(occupants(done, from)).toEqual([]);
    const old = done.dwellings.find((d) => d.id === from);
    expect(old).toBeDefined();
    expect(old?.disusedDay).toBeUndefined();
    expect(done.constructions.some((c) => c.kind === 'demolition')).toBe(false);
    expect(relocatingHouseholds(done).size).toBe(0);
    // prázdný dům chátrá rychleji než obydlený
    const later = advanceVillage(done, done.lastDay + 365, null);
    const oldLater = later.dwellings.find((d) => d.id === from);
    const freshLater = later.dwellings.find((d) => d.id === to)!;
    expect(oldLater === undefined || oldLater.condition < freshLater.condition).toBe(true);
  });

  it('domácnost, která se stěhuje, starý dům nepřestavuje', () => {
    const s = settled();
    const id = household(s);
    // dožilý dům (rozhoduje stáří) – obyvatelé by ho jinak hned přestavěli
    s.dwellings[0]!.builtDay = DAY - Math.ceil((DWELLINGS.zemnice.lifespanYears + 1) * 365.25);
    const rebuilt = advanceVillage(s, DAY + 1, null);
    expect(rebuilt.constructions.some((c) => c.kind === 'rebuild')).toBe(true);
    const relocating = advanceVillage(
      startReplacement(s, DAY, id, 'zemnice', NEW_HOME, 0),
      DAY + 1,
      null,
    );
    expect(relocating.constructions.some((c) => c.kind === 'rebuild')).toBe(false);
  });

  it('výsledek nezávisí na tom, po jakých kouscích se ves dopočítá', () => {
    const started = startReplacement(settled(), DAY, 1, 'polozemnice', NEW_HOME, 3);
    const end = DAY + 400;
    const once = advanceVillage(started, end, null);
    let pieces = started;
    for (const day of [DAY + 7, DAY + 90, DAY + 91, DAY + 250, end]) {
      pieces = advanceVillage(pieces, day, null);
    }
    expect(pieces).toEqual(once);
  });
});
