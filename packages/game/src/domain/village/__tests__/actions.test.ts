import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../calendar';
import { foundField, foundVillage, startNewDwelling } from '../actions';
import type { PartInput } from '../actions';
import { ageGroup, ageYears } from '../people';
import { DWELLINGS, FIELD_LIMITS, START_AGES } from '../rules';
import type { Person, VillageState } from '../types';

const DAY = 1000;
const POSITION = { x: 10, z: 20, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];
const part = (overrides: Partial<PartInput> = {}): PartInput => ({
  areaM2: 1500,
  distanceM: 100,
  naturalFertility: 60,
  surface: 'meadow',
  obstacleCost: 0,
  ...overrides,
});
const start = (): VillageState =>
  foundVillage({
    seed: 7,
    day: DAY,
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: [part(), part({ surface: 'forest', obstacleCost: 5 })] },
  });

describe('foundVillage', () => {
  it('založí 4 lidi: 2 dospělé a 2 děti 12 a 13 let, v jedné zemnici', () => {
    const s = start();
    expect(s.people).toHaveLength(4);
    const groups = s.people.map((p) => ageGroup(p, DAY));
    expect(groups.filter((g) => g === 'adult')).toHaveLength(2);
    expect(groups.filter((g) => g === 'child')).toHaveLength(2);
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([...START_AGES]);
    expect(s.dwellings).toHaveLength(1);
    expect(s.dwellings[0]).toMatchObject({ type: 'zemnice', condition: 1, builtDay: DAY });
    expect(s.dwellings[0]?.position).toEqual(POSITION);
    expect(s.people.every((p) => p.dwellingId === s.dwellings[0]?.id)).toBe(true);
  });

  it('dá zásoby na 18 měsíců: 840 kg', () => {
    expect(start().storesKg).toBeCloseTo(840);
  });

  it('první pole je stavba s díly ve stavu founding a součtem ceny', () => {
    const s = start();
    expect(s.fields).toHaveLength(1);
    expect(s.parts).toHaveLength(2);
    expect(s.parts.every((p) => p.state === 'founding' && p.fieldId === s.fields[0]?.id)).toBe(
      true,
    );
    expect(s.parts.every((p) => p.fertilityShare === 1 && p.bonusUntilDay === null)).toBe(true);
    expect(s.constructions).toHaveLength(1);
    const c = s.constructions[0];
    expect(c).toMatchObject({ kind: 'field', done: 0, startedDay: DAY, fieldId: s.fields[0]?.id });
    expect(c?.cost).toBeCloseTo(s.parts.reduce((sum, p) => sum + p.foundingCost, 0));
  });

  it('id jsou jedinečná a nextId je další volné', () => {
    const s = start();
    const ids = [
      ...s.people.map((p) => p.id),
      ...s.dwellings.map((d) => d.id),
      ...s.fields.map((f) => f.id),
      ...s.parts.map((p) => p.id),
      ...s.constructions.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.nextId).toBe(Math.max(...ids) + 1);
  });

  it('počáteční hodnoty a kronika', () => {
    const s = start();
    expect(s).toMatchObject({
      seed: 7,
      foundedDay: DAY,
      lastDay: DAY - 1,
      plan: null,
      threshingFromPlan: null,
      domesticBacklog: 0,
      hungry: false,
      commonLaborHistory: [],
      chronicle: [{ day: DAY, kind: 'village-founded' }],
    });
  });

  it('den mimo svět nebo neceločíselný vyhodí RangeError', () => {
    const found = (day: number): VillageState =>
      foundVillage({ seed: 1, day, dwellingPosition: POSITION, firstField: { parts: [part()] } });
    for (const day of [NaN, Infinity, -1, 1.5, TOTAL_GAME_DAYS]) {
      expect(() => found(day), `den ${day}`).toThrow(RangeError);
    }
    expect(found(0).lastDay).toBe(-1);
    expect(found(TOTAL_GAME_DAYS - 1).foundedDay).toBe(TOTAL_GAME_DAYS - 1);
  });

  it('poloha zemnice s nekonečnou souřadnicí nebo natočením vyhodí RangeError', () => {
    for (const bad of [{ x: NaN }, { z: Infinity }, { rotation: -Infinity }]) {
      expect(() =>
        foundVillage({
          seed: 1,
          day: DAY,
          dwellingPosition: { ...POSITION, ...bad },
          firstField: { parts: [part()] },
        }),
      ).toThrow(RangeError);
    }
  });

  it('první pole se ověřuje jako foundField', () => {
    expect(() =>
      foundVillage({
        seed: 1,
        day: DAY,
        dwellingPosition: POSITION,
        firstField: { outline: OUTLINE, parts: [part({ areaM2: 900 })] },
      }),
    ).toThrow(RangeError);
  });
});

describe('startNewDwelling', () => {
  const sixPeople = (): VillageState => {
    const s = start();
    const extra: Person[] = [
      { id: 100, bornDay: DAY - 20 * 365.25, dwellingId: 1 },
      { id: 101, bornDay: DAY - 20 * 365.25, dwellingId: 1 },
    ];
    s.dwellings[0]!.id = 1;
    s.people.forEach((p) => (p.dwellingId = 1));
    s.people[2]!.bornDay = DAY - 20 * 365.25;
    s.people[3]!.bornDay = DAY - 20 * 365.25;
    s.people.push(...extra);
    return s;
  };

  it('na startovní vsi vyhodí RangeError', () => {
    expect(() => startNewDwelling(start(), DAY, 'zemnice', POSITION, 0)).toThrow(RangeError);
  });

  it('při 6 lidech se 4 dospělými projde, druhá stavba hned potom ne', () => {
    const s = sixPeople();
    const next = startNewDwelling(s, DAY, 'polozemnice', POSITION, 15);
    const added = next.constructions.at(-1);
    expect(added).toMatchObject({
      kind: 'dwelling',
      startedDay: DAY,
      cost: DWELLINGS.polozemnice.cost + 15,
      done: 0,
      dwellingType: 'polozemnice',
      dwellingId: null,
      fieldId: null,
    });
    expect(added?.position).toEqual(POSITION);
    expect(() => startNewDwelling(next, DAY, 'zemnice', POSITION, 0)).toThrow(RangeError);
  });

  it('záporné náklady na překážky vyhodí RangeError', () => {
    expect(() => startNewDwelling(sixPeople(), DAY, 'zemnice', POSITION, -1)).toThrow(RangeError);
  });

  it('nekonečná poloha, cena překážek nebo den vyhodí RangeError', () => {
    const s = sixPeople();
    const bad = { ...POSITION, x: NaN };
    expect(() => startNewDwelling(s, DAY, 'zemnice', bad, 0)).toThrow(RangeError);
    expect(() => startNewDwelling(s, DAY, 'zemnice', POSITION, NaN)).toThrow(RangeError);
    expect(() => startNewDwelling(s, DAY, 'zemnice', POSITION, Infinity)).toThrow(RangeError);
    expect(() => startNewDwelling(s, NaN, 'zemnice', POSITION, 0)).toThrow(RangeError);
  });

  it('nemění vstupní stav', () => {
    const s = sixPeople();
    const copy = structuredClone(s);
    startNewDwelling(s, DAY, 'zemnice', POSITION, 0);
    expect(s).toEqual(copy);
  });
});

describe('foundField', () => {
  const field = { outline: OUTLINE, parts: [part()] };

  it('přidá pole, díly founding a stavbu field', () => {
    const s = start();
    const next = foundField(s, DAY + 5, field);
    expect(next.fields).toHaveLength(2);
    expect(next.parts).toHaveLength(3);
    expect(next.constructions).toHaveLength(2);
    const created = next.parts.at(-1);
    expect(created).toMatchObject({ state: 'founding', foundingDone: 0, sownYears: 0 });
    expect(next.constructions.at(-1)).toMatchObject({
      kind: 'field',
      startedDay: DAY + 5,
      fieldId: next.fields.at(-1)?.id,
    });
    expect(next.nextId).toBeGreaterThan(s.nextId);
  });

  it('plocha pod minimem vyhodí RangeError', () => {
    expect(() =>
      foundField(start(), DAY, { outline: OUTLINE, parts: [part({ areaM2: 900 })] }),
    ).toThrow(RangeError);
    expect(FIELD_LIMITS.minAreaM2).toBe(1000);
  });

  it('díl dál než 800 m vyhodí RangeError', () => {
    expect(() =>
      foundField(start(), DAY, { outline: OUTLINE, parts: [part({ distanceM: 850 })] }),
    ).toThrow(RangeError);
  });

  it('prázdné díly, nekladná plocha a záporná překážka vyhodí RangeError', () => {
    expect(() => foundField(start(), DAY, { outline: OUTLINE, parts: [] })).toThrow(RangeError);
    expect(() =>
      foundField(start(), DAY, { outline: OUTLINE, parts: [part(), part({ areaM2: 0 })] }),
    ).toThrow(RangeError);
    expect(() =>
      foundField(start(), DAY, { outline: OUTLINE, parts: [part({ obstacleCost: -1 })] }),
    ).toThrow(RangeError);
  });

  it('nekonečná plocha, vzdálenost, úrodnost, překážky nebo den vyhodí RangeError', () => {
    const bad: Partial<PartInput>[] = [
      { areaM2: NaN },
      { areaM2: Infinity },
      { distanceM: NaN },
      { distanceM: -Infinity },
      { naturalFertility: NaN },
      { naturalFertility: Infinity },
      { obstacleCost: NaN },
      { obstacleCost: Infinity },
    ];
    for (const overrides of bad) {
      expect(
        () => foundField(start(), DAY, { parts: [part(), part(overrides)] }),
        JSON.stringify(overrides, (_, v: unknown) => (typeof v === 'number' ? String(v) : v)),
      ).toThrow(RangeError);
    }
    expect(() => foundField(start(), NaN, field)).toThrow(RangeError);
    expect(() => foundField(start(), 2.5, field)).toThrow(RangeError);
  });

  it('nemění vstupní stav', () => {
    const s = start();
    const copy = structuredClone(s);
    foundField(s, DAY, field);
    expect(s).toEqual(copy);
  });
});
