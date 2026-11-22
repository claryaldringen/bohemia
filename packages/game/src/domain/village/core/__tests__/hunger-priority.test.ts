import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { daysUntilHarvest } from '../food';
import { DIET, DAILY_MEAT_KEEP, proteinNeedPerDay, villageFoodNeed } from '../diet';
import { eat } from '../simulate-food';
import { NO_CRAFTS } from '../productivity';
import { APPLE_FOOD_VALUE } from '../../rules';
import { HONEY } from '../../rules/rules-wares';
import { foodNeedPerDay, guestFoodNeedPerDay } from '../../people/people';
import {
  advanceGroupStarvation,
  groupStarvation,
  hungerSplit,
  lowestFedGroup,
  rationShares,
  villageRationFor,
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
function village(seed: number, ration: number, start = START): VillageState {
  const bornAt = (age: number): number => born(age) + (start - START);
  const adult = (id: number, dwellingId: number, extra: Partial<Person> = {}): Person => ({
    id,
    bornDay: bornAt(25 + (id % 5)),
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
    foundedDay: start - 100 * 366,
    lastDay: start - 1,
    nextId: 10_000,
    people,
    manorId: 1,
    dwellings: [1, 2, 3].map((id) => ({
      id,
      type: 'zemnice' as const,
      builtDay: start - 100,
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
  const need = people.reduce((sum, p) => sum + foodNeedPerDay(p, start), 0);
  state.storesKg = need * daysUntilHarvest(start) * ration;
  return state;
}

describe('přednost v hladu – rozdělení jídla', () => {
  it('nad životním minimem 75 % dostanou všichni minimum a zbytek jde po vrstvách', () => {
    expect(rationShares(1, [2, 1, 1, 6])).toEqual([1, 1, 1, 1]);
    expect(rationShares(1.2, [2, 1, 1, 6])).toEqual([1, 1, 1, 1]);
    // 0,9 z potřeby 4: každý 0,75 (3), zbytek 0,6 po vrstvách – 0 a 1 plně, 2 dostane 0,1
    const s = rationShares(0.9, [1, 1, 1, 1]);
    expect(s[0]).toBeCloseTo(1, 12);
    expect(s[1]).toBeCloseTo(1, 12);
    expect(s[2]).toBeCloseTo(0.85, 12);
    expect(s[3]).toBeCloseTo(0.75, 12);
    // pod minimem všichni stejně
    expect(rationShares(0.6, [2, 1, 1, 6])).toEqual([0.6, 0.6, 0.6, 0.6]);
    // prázdná vrstva má plno, potřebu nenese
    expect(rationShares(0.8, [0, 1, 1, 2])[0]).toBe(1);
    // součet energie = ratio × potřeba
    const needs = [3, 2, 1, 14];
    const r = rationShares(0.83, needs);
    expect(r.reduce((a, x, i) => a + x * needs[i]!, 0)).toBeCloseTo(0.83 * 20, 9);
  });

  it('obrácený příděl (přežívací zásoba): nejmenší příděl vsi, při kterém zbytek vsi dostane cíl', () => {
    for (const needs of [
      [6, 0, 0, 4],
      [2, 1, 1, 6],
      [1, 1, 1, 1],
      [9, 0, 0, 1],
      [0, 0, 0, 5],
    ]) {
      for (const share of [0, 0.3, 0.6, 0.75, 0.76, 0.8, 0.875, 0.9, 1]) {
        const r = villageRationFor(share, needs);
        expect(r).toBeLessThanOrEqual(1);
        expect(r).toBeGreaterThanOrEqual(share - 1e-12);
        expect(rationShares(r, needs)[3]).toBeGreaterThanOrEqual(share - 1e-12);
        // nejmenší – o kousek méně a zbytek vsi by cíl nedostal
        if (share > 0 && r < 1) expect(rationShares(r - 1e-6, needs)[3]).toBeLessThan(share);
      }
    }
    // rod 60 % potřeby, cíl zbytku vsi 0,875: příděl vsi 0,6 + 0,875 × 0,4 = 0,95 (rod sytý)
    expect(villageRationFor(0.875, [6, 0, 0, 4])).toBeCloseTo(0.95, 12);
    expect(rationShares(0.95, [6, 0, 0, 4])[0]).toBeCloseTo(1, 12);
    // do životního minima jedí všichni stejně – příděl vsi je cíl
    expect(villageRationFor(0.7, [6, 0, 0, 4])).toBe(0.7);
    // bez zbytku vsi cíl nejnižší vrstvy s potřebou (řemeslníci)
    expect(lowestFedGroup([6, 0, 4, 0])).toBe(2);
    expect(villageRationFor(0.875, [6, 0, 4, 0])).toBeCloseTo(0.95, 12);
    expect(rationShares(0.95, [6, 0, 4, 0])[2]).toBeCloseTo(0.875, 12);
    // jediná vrstva s potřebou (i jen rod) – příděl vsi je cíl, jako bez vrstev
    expect(villageRationFor(0.875, [10, 0, 0, 0])).toBeCloseTo(0.875, 12);
    expect(villageRationFor(0.875, [0, 0, 0, 10])).toBeCloseTo(0.875, 12);
    // nikdo nejí
    expect(lowestFedGroup([0, 0, 0, 0])).toBe(-1);
    expect(villageRationFor(0.875, [0, 0, 0, 0])).toBe(0.875);
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

  it('hosté jedí ve zbytku vsi – nesou potřebu jídla, bílkoviny ne', () => {
    const s = village(1, 1);
    const home = hungerSplit(s, START);
    s.guests = [{ untilDay: START + 10 }, { untilDay: START }] as VillageState['guests'];
    const split = hungerSplit(s, START);
    expect(guestFoodNeedPerDay(s, START)).toBeGreaterThan(0);
    expect(split.needs[3]).toBeCloseTo(home.needs[3]! + guestFoodNeedPerDay(s, START), 12);
    expect(split.needs.slice(0, 3)).toEqual(home.needs.slice(0, 3));
    expect(split.proteinNeeds).toEqual(home.proteinNeeds);
    // bílkoviny vrstvy = potřeba bílkovin jejích lidí
    for (let group = 0; group < 4; group++) {
      const people = s.people.filter((p) => (split.groupOf.get(p.id) ?? 3) === group);
      const protein = people.reduce((sum, p) => sum + proteinNeedPerDay(p, START), 0);
      expect(split.proteinNeeds[group]).toBeCloseTo(protein, 12);
    }
    // součet potřeb vrstev = potřeba vsi (výhled a příděl jídla dne)
    const total = split.needs.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(villageFoodNeed(s, START), 12);
  });

  it('jedlíci: lidé, kteří jedí ze zásob vsi, a hosté – ne lidé pryč', () => {
    const s = village(1, 1);
    // tři kováři na robotě (jedí jinde), host ve zbytku vsi
    for (const id of [20, 21, 22]) {
      s.people.find((p) => p.id === id)!.away = { kind: 'labor', untilDay: START + 30 };
    }
    s.guests = [{ untilDay: START + 10 }] as VillageState['guests'];
    const split = hungerSplit(s, START);
    expect(split.counts).toEqual([2, 0, 6, 7]);
    expect(split.eaters).toEqual([2, 0, 3, 7]);
  });
});

describe('strava po vrstvách – štěstí ze stravy po lidech', () => {
  it('trochu masa sní rod vojvody – štěstí z masa jen jemu, ne celé vsi poměrně', () => {
    const day = START + 10;
    const s = village(3, 1.3);
    const need = villageFoodNeed(s, day);
    // maso za 5 % potřeby vsi – rodu (2 ze 14 lidí) dá přes 20 % energie
    s.meatKg = (0.05 * need) / DIET.meatEnergy / DAILY_MEAT_KEEP;
    const result = eat(s, day, NO_CRAFTS);
    expect(s.diet!.shares.meat).toBeCloseTo(0.05, 9);
    expect(result.diet.meat).toBeCloseTo((DIET.meatHappiness.max * 2) / 14, 9);
    expect(result.diet.fruit).toBe(0);
    expect(result.diet.honey).toBe(0);
  });

  it('ovoce a pevný příděl medu jedí všichni stejně – i rod sytý z masa (+5 a +2 celé vsi)', () => {
    const day = START + 10;
    const s = village(3, 1.3);
    const need = villageFoodNeed(s, day);
    // maso za 30 % potřeby vsi (rod by se jím nasytil sám), ovoce za 10 %, med z klátů
    s.meatKg = (0.3 * need) / DIET.meatEnergy / DAILY_MEAT_KEEP;
    s.applesKg = (0.1 * need) / APPLE_FOOD_VALUE;
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 10, waxKg: 0 };
    const result = eat(s, day, NO_CRAFTS);
    expect(s.diet!.shares.fruit).toBeCloseTo(0.1, 9);
    expect(s.diet!.shares.honey).toBeGreaterThan(0);
    expect(result.diet.fruit).toBeCloseTo(DIET.fruitHappiness, 12);
    expect(result.diet.honey).toBeCloseTo(HONEY.happiness, 12);
    // maso sní rod (do zbytku přídělu po ovoci a medu) a kováři; zbytek vsi už nic
    expect(result.diet.meat).toBeCloseTo((DIET.meatHappiness.max * 8) / 14, 9);
  });

  it('lidé pryč se do štěstí ze stravy nepočítají – průměr jen přes jedlíky', () => {
    const day = START + 10;
    const s = village(3, 1.3);
    // zbytek vsi (6 lidí) je na robotě – jí jinde
    for (const p of s.people)
      if (p.dwellingId === 3) p.away = { kind: 'labor', untilDay: day + 30 };
    const need = villageFoodNeed(s, day);
    // maso za 10 % potřeby – sní ho celé rod (2 z 8 jedlíků)
    s.meatKg = (0.1 * need) / DIET.meatEnergy / DAILY_MEAT_KEEP;
    const result = eat(s, day, NO_CRAFTS);
    expect(result.diet.meat).toBeCloseTo((DIET.meatHappiness.max * 2) / 8, 9);
  });
});

describe('přednost v hladu – dopočet vsi', () => {
  it('v krátkém nedostatku na 83 % (nad minimem) rod nehladoví, řemeslníci jedí víc než zbytek vsi', () => {
    // sklizeň za 62 dní – zbytek vsi přežije do žní i s minimem 75 % (v dlouhém hladu se rod
    // uskrovní – long-hunger.test.ts); za kratší dobu do žní ztratí obilí skladováním méně, proto
    // 83 %
    const start = dayIndexOf({ year: 701, month: 7, day: 1 });
    for (let seed = 1; seed <= 8; seed++) {
      const s = advanceVillage(village(seed, 0.83, start), start + 24, null);
      const [g0, , g2, g3] = groupStarvation(s) as [number, number, number, number];
      // rod dostane plný příděl, řemeslníci víc než zbytek (zbytek má jen minimum; podle úmrtí
      // a porodů za 24 dní jsou řemeslníci někdy už sytí)
      expect(g0).toBe(0);
      expect(g3).toBeGreaterThan(g2);
      expect(s.starvationDays).toBe(g3);
      // hráč vidí hlad zbytku
      expect(summarizeVillage(s, start + 24).hunger).not.toBe('fed');
    }
  });

  it('pod životním minimem 75 % hladoví všichni stejně, i rod', () => {
    const s = advanceVillage(village(2, 0.3), START + 9, null);
    const [g0, g1, g2, g3] = groupStarvation(s) as [number, number, number, number];
    expect(g0).toBeGreaterThan(0);
    expect(g0).toBeCloseTo(g1, 10);
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
