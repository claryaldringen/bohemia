import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { daysUntilHarvest } from '../food';
import { foodNeedPerDay } from '../../people/people';
import {
  advanceGroupStarvation,
  groupStarvation,
  hungerSplit,
  priorityEnergy,
} from '../../people/hunger-groups';
import { populationDay } from '../../people/population';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import { withoutSmallGame } from '../../__tests__/village-fixtures';
import type { Person, VillageState } from '../../types';

// Přednost v hladu (population.md – Přednost v hladu; Martin 17. 11. 2026): rod vojvody, mistři
// huti a řemeslníci jedí napřed, zbytek vsi si rozdělí, co zbude.

const YEAR = 365.25;
const START = dayIndexOf({ year: 700, month: 9, day: 1 });
const born = (age: number): number => START - Math.ceil((age + 0.5) * YEAR);

/**
 * Ves se třemi obydlími: 1 – dvorec vojvody (muž a žena), 2 – dílna kováře (šest dospělých),
 * 3 – zbytek (šest dospělých). Zásoby obilí `ration` násobkem potřeby do sklizně; bez polí a stád.
 */
function village(seed: number, ration: number): VillageState {
  const adult = (id: number, dwellingId: number, extra: Partial<Person> = {}): Person => ({
    id,
    bornDay: born(25 + (id % 5)),
    dwellingId,
    ...extra,
  });
  const people: Person[] = [
    adult(10, 1, { sex: 'male', spouseId: 11 }),
    adult(11, 1, { sex: 'female', spouseId: 10 }),
    ...[0, 1, 2, 3, 4, 5].map((i) => adult(20 + i, 2)),
    ...[0, 1, 2, 3, 4, 5].map((i) => adult(30 + i, 3)),
  ];
  const state = withoutSmallGame({
    seed,
    foundedDay: START - 100 * 366,
    lastDay: START - 1,
    nextId: 10_000,
    people,
    manorId: 1,
    dwellings: [1, 2, 3].map((id) => ({
      id,
      type: 'zemnice' as const,
      builtDay: START - 100,
      condition: 1,
      position: { x: id * 10, z: 0, rotation: 0 },
      ...(id === 2 ? { workshop: { craft: 'smith' as const } } : {}),
    })),
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    livestock: {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    },
  } as unknown as VillageState);
  const need = people.reduce((sum, p) => sum + foodNeedPerDay(p, START), 0);
  state.storesKg = need * daysUntilHarvest(START) * ration;
  return state;
}

/** Živí z původních lidí skupiny – 1 rod (id 10–11), 2 řemeslníci (20–25), 3 zbytek (30–35). */
const aliveIn = (s: VillageState, group: number): number =>
  s.people.filter((p) => Math.floor(p.id / 10) === group).length;

describe('přednost v hladu – rozdělení jídla', () => {
  it('plný příděl podle pořadí skupin, skupina, na kterou nevyjde, dělí zbytek rovným dílem', () => {
    // potřeby 2, 6, 6 (jednotky): z 0,7 celku (9,8) dostane rod 2, řemeslníci 6, zbytek 1,8
    const [lord, crafts, rest] = priorityEnergy(0.7, [2, 6, 6]) as [number, number, number];
    expect(lord).toBe(1);
    expect(crafts).toBe(1);
    expect(rest).toBeCloseTo(1.8 / 6, 10);
    // nevyjde ani na řemeslníky: ti si rozdělí zbytek, zbytek vsi nic
    const low = priorityEnergy(0.3, [2, 6, 6]) as [number, number, number];
    expect(low[0]).toBe(1);
    expect(low[1]).toBeCloseTo(2.2 / 6, 10);
    expect(low[2]).toBe(0);
    // nevyjde ani na rod: jí jen on, rovným dílem
    const only = priorityEnergy(0.1, [2, 6, 6]);
    expect(only[0]).toBeCloseTo(0.7, 10);
    expect(only.slice(1)).toEqual([0, 0]);
    // dosyta jedí všichni; skupina bez lidí nebere nic
    expect(priorityEnergy(1, [2, 6, 6])).toEqual([1, 1, 1]);
    expect(priorityEnergy(0.5, [0, 6, 6])).toEqual([1, 1, 0]);
  });

  it('skupiny: rod, domácnost mistra s dětmi, řemeslníci a učeň mimo dílnu, zbytek a hosté', () => {
    const s = village(1, 1);
    s.people.push(
      { id: 40, bornDay: born(30), dwellingId: 3, sex: 'male', spouseId: 41, mason: 'stonemason' },
      { id: 41, bornDay: born(28), dwellingId: 3, sex: 'female', spouseId: 40 },
      { id: 42, bornDay: born(5), dwellingId: 3, fatherId: 40, motherId: 41 },
      { id: 43, bornDay: born(14), dwellingId: 3, practice: { smith: 1 } },
    );
    s.guests = [{ untilDay: START + 10 }] as VillageState['guests'];
    const { groupOf, counts, needs } = hungerSplit(s, START);
    expect(groupOf.get(10)).toBe(0);
    expect(groupOf.get(11)).toBe(0);
    expect([40, 41, 42].map((id) => groupOf.get(id))).toEqual([1, 1, 1]);
    expect(groupOf.get(21)).toBe(2);
    expect(groupOf.get(43)).toBe(2);
    expect(groupOf.get(30)).toBeUndefined();
    // rest = 6 lidí ze 3. obydlí bez mistrovy domácnosti a učně + host
    expect(counts).toEqual([2, 3, 7, 7]);
    expect(needs.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe('přednost v hladu – dopočet vsi', () => {
  it('v nedostatku na 70 % jedí rod a řemeslníci plně, hlad roste jen zbytku a umírá jen on', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = advanceVillage(village(seed, 0.7), START + 24, null);
      // rod a řemeslníci nehladoví, zbytek ano
      const [g0, g1, g2, g3] = groupStarvation(s) as [number, number, number, number];
      expect([g0, g1, g2]).toEqual([0, 0, 0]);
      expect(g3).toBeGreaterThan(5);
      expect(s.starvationDays).toBe(g3);
      expect(s.starvationGroups).toEqual([0, 0, 0]);
      expect(aliveIn(s, 1)).toBe(2);
      expect(aliveIn(s, 2)).toBe(6);
      // hráč vidí hlad zbytku
      expect(s.ration).toBeLessThan(0.6);
      expect(summarizeVillage(s, START + 24).hunger).not.toBe('fed');
    }
    const late = advanceVillage(village(3, 0.7), START + 59, null);
    expect(aliveIn(late, 1)).toBe(2);
    expect(aliveIn(late, 2)).toBe(6);
    expect(aliveIn(late, 3)).toBeLessThan(6);
  });

  it('když nevyjde ani na řemeslníky, rod jí plně a zbytek vsi vymře první', () => {
    const s = advanceVillage(village(5, 0.3), START + 54, null);
    expect(aliveIn(s, 1)).toBe(2);
    expect(aliveIn(s, 3)).toBeLessThanOrEqual(aliveIn(s, 2));
    expect(aliveIn(s, 3)).toBeLessThan(6);
  });

  it('když nevyjde ani na rod, jí jen on rovným dílem a ostatní hladoví naplno', () => {
    const s = advanceVillage(village(2, 0.04), START + 9, null);
    const [g0, g1, g2, g3] = groupStarvation(s) as [number, number, number, number];
    expect(g0).toBeGreaterThan(0);
    expect(g0).toBeLessThan(g1);
    expect(g1).toBeCloseTo(g2, 10);
    expect(g2).toBeCloseTo(g3, 10);
  });

  it('dostatek jídla chování nemění – jediný hlad vsi, žádné skupiny', () => {
    const s = advanceVillage(village(4, 1.3), START + 40, null);
    expect(s.starvationDays ?? 0).toBe(0);
    expect(s.starvationGroups).toBeUndefined();
    expect(s.ration).toBeUndefined();
    expect(s.people).toHaveLength(14);
  });
});

describe('přednost v hladu – stav a porody', () => {
  it('ves uložená dřív (bez skupin) začíná všemi skupinami z hladu vsi', () => {
    const s = village(1, 1);
    s.starvationDays = 7;
    expect(groupStarvation(s)).toEqual([7, 7, 7, 7]);
    // opakovaný zápis stejných hodnot zůstane bez skupin (idempotentně)
    advanceGroupStarvation(s, [0.9, 0.9, 0.9, 0.9], [1, 1, 1, 1], false);
    expect(s.starvationGroups).toBeUndefined();
    expect(s.starvationDays).toBe(6);
  });

  it('prázdná skupina přebírá hlad nejbližší neprázdné', () => {
    const s = village(1, 1);
    s.starvationGroups = [3, 3, 3];
    s.starvationDays = 9;
    const values = advanceGroupStarvation(s, [1, 1, 1, 0], [0, 0, 5, 5], false);
    expect(values[0]).toBe(values[2]);
    expect(values[1]).toBe(values[2]);
    expect(values[3]).toBeGreaterThan(9);
  });

  it('porod brzdí energie skupiny matky, ne celé vsi', () => {
    const couple = (dwellingId: number): Person[] => [
      { id: 1, bornDay: born(22), dwellingId, sex: 'male', spouseId: 2 },
      { id: 2, bornDay: born(22), dwellingId, sex: 'female', spouseId: 1 },
    ];
    const births = (group: number): number => {
      let count = 0;
      for (let seed = 1; seed <= 1500; seed++) {
        const s = village(seed, 1);
        s.people = couple(3);
        const before = s.people.length;
        const energy = [1, 1, 1, 0];
        populationDay(s, START, 1, 0.5, {
          groupOf: new Map(s.people.map((p) => [p.id, group])),
          energy,
          starvation: [0, 0, 0, 0],
        });
        count += s.people.length - before;
      }
      return count;
    };
    // matka ve skupině s plnou energií rodí, matka ve skupině bez jídla ne
    expect(births(0)).toBeGreaterThan(0);
    expect(births(3)).toBe(0);
  });
});
