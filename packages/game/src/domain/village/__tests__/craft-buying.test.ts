import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  CRAFT_PRODUCTS,
  neighbourCrafts,
  ownCraftsmanWorks,
  planPurchases,
  productPrice,
  type PurchasePlan,
  purchaseRoute,
  purchaseTravelers,
} from '../craft-buying';
import { craftCoverage, newWorkshop } from '../crafts';
import { neighbourKind } from '../neighbours';
import { CRAFT_BUYING, NEIGHBOR_DIRECTIONS } from '../rules';
import { advanceVillage } from '../simulate';
import type { FieldPart, Person, VillageState } from '../types';

// Nákup u sousedů (crafts.md – Nákup u sousedů; Martin 19. 10. 2026: „Nástroje ať vesničané
// obchodují individuálně… Sami si spočítají, jestli se jim to vyplatí.“).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const NOV15 = at(600, 11, 15);

/** Ves `households` rodin v polozemnici s osetým polem a zásobami `storesKg`, bez řemeslníků. */
function village(households = 3, storesKg = 8000, day = NOV15 - 1): VillageState {
  const s = foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.constructions = [];
  s.dwellings = [
    {
      id: 1,
      type: 'polozemnice',
      builtDay: day - 400,
      condition: 1,
      position: { x: 0, z: 0, rotation: 0 },
    },
  ];
  let id = 10;
  s.people = [];
  for (let h = 0; h < households; h++) {
    for (const [years, sex] of [
      [30, 'male'],
      [28, 'female'],
      [10, 'male'],
      [5, 'female'],
    ] as const) {
      s.people.push({
        id: id++,
        bornDay: day - Math.ceil(years * YEAR),
        dwellingId: 1,
        sex,
      } as Person);
    }
  }
  s.fields = [{ id: 1 }];
  s.parts = Array.from({ length: households * 60 }, (_, i): FieldPart => ({
    id: 100 + i,
    fieldId: 1,
    areaM2: 225,
    distanceM: 120,
    naturalFertility: 60,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x: i % 30, y: Math.floor(i / 30) },
    crop: 'spring',
  }));
  s.storesKg = storesKg;
  s.lastDay = day;
  s.nextId = 1000;
  return s;
}

describe('řemeslníci sousedů', () => {
  it('řemeslníci mají kováře, hrnčíře i tesaře, ostatní někdy – deterministicky', () => {
    const seed = 5;
    for (const direction of NEIGHBOR_DIRECTIONS) {
      const crafts = neighbourCrafts(seed, direction);
      expect(neighbourCrafts(seed, direction)).toEqual(crafts);
      if (neighbourKind(seed, direction) === 'crafters') {
        expect(crafts).toEqual(['smith', 'potter', 'carpenter']);
      }
    }
    // kolem každé vsi jsou dva sousedé řemeslníci – každé řemeslo jde koupit
    const all = NEIGHBOR_DIRECTIONS.flatMap((d) => neighbourCrafts(seed, d));
    for (const craft of ['smith', 'potter', 'carpenter'] as const) {
      expect(all.filter((c) => c === craft).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cena – nabízené zboží za 0,96 hodnoty; po stezce kratší cesta než krajinou', () => {
    expect(productPrice('toolsKg')).toBeCloseTo(60 * 0.96, 9);
    expect(productPrice('potteryKg')).toBeCloseTo(3 * 0.96, 9);
    expect(productPrice('woodToolsKg')).toBeCloseTo(CRAFT_BUYING.woodToolsValueKg * 0.96, 9);
    const s = village();
    const off = purchaseRoute(s, 'N', null);
    expect(off.trailId).toBeNull();
    // kraj mapy na sever (+z) – 960 m od středu
    expect(off.edge).toEqual({ x: 0, z: 960 });
    s.trails = [{ id: 7, direction: 'N', pieces: [], lengthM: 960, startedDay: 0, builtDay: 1 }];
    const trail = purchaseRoute(s, 'N', null);
    expect(trail.trailId).toBe(7);
    expect(trail.days).toBeLessThan(off.days);
  });
});

describe('rozhodnutí vesničanů', () => {
  it('bez řemeslníků ve vsi se vyplatí koupit nástroje, keramiku i dřevěné nářadí', () => {
    const s = village();
    const plans = planPurchases(s, NOV15, craftCoverage(s, NOV15), null);
    expect(plans.map((p) => p.product).sort()).toEqual([...CRAFT_PRODUCTS].sort());
    // napřed to, co ušetří nejvíc práce na práci, kterou stojí (rozhodnutí Clauda)
    const ratios = plans.map((p) => p.savedManDays / p.costManDays);
    expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
    for (const plan of plans) {
      expect(plan.worthIt).toBe(true);
      expect(plan.savedManDays).toBeGreaterThan(plan.costManDays);
      expect(neighbourCrafts(s.seed, plan.route.direction).length).toBeGreaterThan(0);
    }
  });

  it('z malého přebytku koupí napřed nejvýhodnější výrobek, ne první v pořadí', () => {
    const rich = planPurchases(village(), NOV15, craftCoverage(village(), NOV15), null);
    const best = rich.reduce((a, b) =>
      a.savedManDays / a.costManDays >= b.savedManDays / b.costManDays ? a : b,
    );
    // přebytek jen na kus nákupu – dostane ho výrobek s nejlepším poměrem
    const worth = (storesKg: number): PurchasePlan[] => {
      const s = village(3, storesKg);
      return planPurchases(s, NOV15, craftCoverage(s, NOV15), null).filter((p) => p.worthIt);
    };
    let storesKg = 8000;
    while (worth(storesKg).length > 1) storesKg -= 250;
    storesKg += 250;
    while (worth(storesKg).length > 1) storesKg -= 10;
    const bought = worth(storesKg);
    expect(bought).toHaveLength(1);
    expect(bought[0]!.product).toBe(best.product);
    expect(best.product).not.toBe(CRAFT_PRODUCTS[0]);
  });

  it('bez přebytku nad pojistkou zásob nekupuje', () => {
    const s = village(3, 200);
    expect(planPurchases(s, NOV15, craftCoverage(s, NOV15), null)).toEqual([]);
  });

  it('vlastní kovář má přednost – nástroje nekupuje; kovář bez uhlí ano', () => {
    const s = village();
    s.dwellings.push({
      id: 2,
      type: 'polozemnice',
      builtDay: NOV15 - 400,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
      workshop: { ...newWorkshop('smith'), activity: 'producing' },
    });
    s.people.push({ id: 90, bornDay: NOV15 - 9000, dwellingId: 2, sex: 'male' } as Person);
    expect(ownCraftsmanWorks(s, 'smith')).toBe(true);
    const own = planPurchases(s, NOV15, craftCoverage(s, NOV15), null);
    expect(own.some((p) => p.product === 'toolsKg')).toBe(false);
    s.dwellings[1]!.workshop!.activity = 'no-charcoal';
    const blocked = planPurchases(s, NOV15, craftCoverage(s, NOV15), null);
    expect(blocked.some((p) => p.product === 'toolsKg')).toBe(true);
  });

  it('kupuje jen do zásoby – se zásobou na cíli nic', () => {
    const s = village();
    s.crafts = { charcoalKg: 0, potteryKg: 1000, woodToolsKg: 1000 };
    s.toolEquipmentKg = 1000;
    expect(planPurchases(s, NOV15, craftCoverage(s, NOV15), null)).toEqual([]);
  });
});

describe('výprava za nákupem', () => {
  it('15. 11. skupina vyrazí, platí obilím, je pryč a s návratem přinese výrobky', () => {
    const s = village();
    const day1 = advanceVillage(s, NOV15, null);
    expect(day1.purchases?.length).toBeGreaterThan(0);
    expect(day1.storesKg).toBeLessThan(s.storesKg - 100);
    const travelers = purchaseTravelers(day1);
    expect(travelers).toBeGreaterThan(0);
    expect(day1.labor!.shares.some((x) => x.activity === 'trade' && x.target.kind === 'edge')).toBe(
      true,
    );
    const back = advanceVillage(day1, NOV15 + 70, null);
    expect(back.purchases).toBeUndefined();
    const bought = back.chronicle.filter((e) => e.kind === 'crafts-bought');
    expect(bought.length).toBe(day1.purchases!.length);
    // nástroje jdou do vybavení domácností (production-chains.md)
    expect(back.toolEquipmentKg).toBeGreaterThan(0);
    expect(back.crafts!.potteryKg).toBeGreaterThan(0);
    expect(craftCoverage(back, NOV15 + 70).tools).toBeGreaterThan(0);
  });

  it('jindy než 15. 11. ves nekupuje', () => {
    const s = village(3, 8000, at(600, 10, 1));
    const next = advanceVillage(s, at(600, 11, 10), null);
    expect(next.purchases).toBeUndefined();
  });

  it('na kouscích dopočtu nezávisí', () => {
    const s = village();
    const whole = advanceVillage(s, NOV15 + 40, null);
    let pieces = s;
    for (const to of [NOV15 - 1 + 1, NOV15 + 3, NOV15 + 17, NOV15 + 40]) {
      pieces = advanceVillage(pieces, to, null);
    }
    expect(pieces).toEqual(whole);
  });
});
