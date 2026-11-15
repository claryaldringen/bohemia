import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { kilnsField, kilnViews } from '../kiln-view';

// Milíř a milířiště v pohledu na ves (crafts.md – Milíř u skácených buků – Co hráč vidí): fáze,
// uhlí, cesty ze zemnice a z kovárny a kdo sem dnes chodí pro uhlí.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const born = (age: number): number => DAY - age * 365 - 30;

/** Ves s uhlířem (id 50) s vypáleným a rozdělaným milířem a kovárnou (51) – kovář a syn 11 let. */
const burnerVillage = (): VillageState => {
  const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -50, z: -50, rotation: 0 } });
  s.dwellings.push(
    {
      id: 50,
      type: 'zemnice',
      builtDay: DAY - 400,
      condition: 1,
      position: { x: 0, z: 0, rotation: 0 },
      workshop: {
        craft: 'burner',
        felling: null,
        fuelKg: 0,
        activity: 'drawing',
        kilns: [
          {
            id: 700,
            site: { x: 60, z: 80 },
            trees: Array.from({ length: 15 }, () => ({ id: null, cost: 2 })),
            stage: 'draw',
            prepared: 15,
            done: 0,
            charcoalKg: 612.4,
            walkM: 96.4,
            carry: { smithId: 51, walkM: 183.2 },
          },
          {
            id: 701,
            site: { x: 30, z: 40 },
            trees: Array.from({ length: 15 }, () => ({ id: null, cost: 2 })),
            stage: 'wood',
            prepared: 6,
            done: 0,
          },
        ],
      },
    },
    {
      id: 51,
      type: 'polozemnice',
      builtDay: DAY - 400,
      condition: 1,
      position: { x: -100, z: 0, rotation: 0 },
      workshop: { craft: 'smith', felling: null, fuelKg: 0, activity: 'producing' },
    },
  );
  s.people.push(
    { id: 900, bornDay: born(41), dwellingId: 51, sex: 'male' },
    { id: 901, bornDay: born(11), dwellingId: 51, sex: 'male', fatherId: 900 },
    { id: 910, bornDay: born(30), dwellingId: 50, sex: 'male' },
  );
  s.kilnRemnants = [{ id: 600, burnerId: 50, x: 90, z: -30, day: DAY - 365 * 2 }];
  return s;
};

describe('kilnViews', () => {
  it('fáze, uhlí, cesty po celých; rozdělaný milíř bez kovárny; milířiště zarůstá', () => {
    const [burnt, building, remnant] = kilnViews(burnerVillage(), DAY);
    expect(burnt).toMatchObject({
      id: 700,
      burnerId: 50,
      stage: 'draw',
      charcoalKg: 612,
      yieldKg: 1800,
      burnerWalkM: 96,
      smithWalkM: 183,
      fetchers: [],
      cart: false,
      burnerHere: false,
    });
    expect(burnt!.progress).toBeCloseTo(0.66, 2);
    expect(building).toMatchObject({
      id: 701,
      stage: 'wood',
      prepared: 6,
      trees: 15,
      progress: 0.4,
      burnerWalkM: 50,
      smithWalkM: null,
    });
    expect(remnant).toMatchObject({ id: 600, stage: 'remnant', progress: 0.2, burnerWalkM: 95 });
  });

  it('kdo sem dnes chodí pro uhlí – syn s věkem, kovář; vůz; uhlíř tu pracuje', () => {
    const s = burnerVillage();
    const kiln = { kind: 'kiln' as const, id: 50, kiln: 700, x: 60, z: 80 };
    s.labor = {
      day: DAY,
      shares: [
        { activity: 'craft', target: kiln, manDays: 1.2 },
        { activity: 'fetch', target: { ...kiln, from: 51 }, manDays: 0.2, ages: [11] },
        { activity: 'fetch', target: { ...kiln, from: 51 }, manDays: 0.1, ages: [41] },
        {
          activity: 'fetch',
          target: { ...kiln, from: 51 },
          manDays: 0.3,
          ages: [38, 12],
          pole: 'burner-son',
        },
        { activity: 'haul', target: kiln, manDays: 0.05, carts: 1, job: 'charcoal' },
        // jiný milíř se nepočítá
        { activity: 'fetch', target: { ...kiln, kiln: 701, from: 51 }, manDays: 1, ages: [15] },
      ],
    };
    const [burnt] = kilnViews(s, DAY);
    expect(burnt!.fetchers).toEqual([
      { age: 38, role: 'burner' },
      { age: 12, role: 'burner-son' },
      { age: 41, role: 'smith' },
      { age: 11, role: 'smith-son' },
    ]);
    expect(burnt!.cart).toBe(true);
    expect(burnt!.burnerHere).toBe(true);
    // rozdělení práce jiného dne – dnes nikdo
    expect(kilnViews(s, DAY + 1)[0]!.fetchers).toEqual([]);
  });

  it('dvojice u tyče – uhlíř s kovářem, uhlíř se synem kováře', () => {
    const s = burnerVillage();
    const kiln = { kind: 'kiln' as const, id: 50, kiln: 700, x: 60, z: 80, from: 51 };
    const pair = (ages: number[], pole: 'smith' | 'smith-son'): void => {
      s.labor = {
        day: DAY,
        shares: [{ activity: 'fetch', target: kiln, manDays: 0.3, ages, pole }],
      };
    };
    pair([38, 41], 'smith');
    expect(kilnViews(s, DAY)[0]!.fetchers).toEqual([
      { age: 38, role: 'burner' },
      { age: 41, role: 'smith' },
    ]);
    pair([38, 12], 'smith-son');
    expect(kilnViews(s, DAY)[0]!.fetchers).toEqual([
      { age: 38, role: 'burner' },
      { age: 12, role: 'smith-son' },
    ]);
  });

  it('ves bez milířů – pole v pohledu chybí', () => {
    const s = burnerVillage();
    s.dwellings.find((d) => d.id === 50)!.workshop!.kilns = [];
    delete s.kilnRemnants;
    expect(kilnsField(s, DAY)).toEqual({});
    expect(kilnsField(burnerVillage(), DAY).kilns).toHaveLength(3);
  });
});
