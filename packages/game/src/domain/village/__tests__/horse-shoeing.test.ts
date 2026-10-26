import { describe, expect, it } from 'vitest';
import {
  finishShoeing,
  isUnshod,
  nextShoeingDay,
  planShoeing,
  shoeingCosts,
  shoeingView,
} from '../horse-shoeing';
import { NEIGHBOR_DIRECTIONS } from '../rules';
import { neighbourCrafts } from '../craft-buying';
import { newWorkshop } from '../crafts';
import { trainHorsesDay } from '../horse-riders';
import { lordRides } from '../lord';
import { NO_CRAFTS } from '../productivity';
import { HORSE_SHOEING } from '../rules';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { horse, horseVillage, LORD_ID, START } from './horse-fixtures';
import { dwelling } from './kin-fixtures';

// Kování jezdeckých koní (horses.md – Kování; Martin 26. 10. 2026): termín 60 dní, vlastní kovář
// (práce + hřivny), kovář z jiné vsi (platba z přebytku), nepodkutý kůň nejezdí.

const DUE = START + HORSE_SHOEING.everyDays;

/** Ves se dvěma jezdeckými koňmi a termínem kování od START. */
function stable(): VillageState {
  const s = horseVillage([horse(1, 8, 'male', 50), horse(2, 6, 'male', 10)]);
  planShoeing(s, START, NO_CRAFTS, null);
  return s;
}

/** Přidá obývanou kovárnu (jinak jen kovárna ve vsi) a hřivny do její zásoby. */
function withSmith(s: VillageState, bars: number): VillageState {
  s.dwellings.push({
    ...dwelling(60),
    position: { x: 40, z: 0, rotation: 0 },
    workshop: { ...newWorkshop('smith'), activity: 'producing' },
  });
  s.people.push({ id: 70, bornDay: START - 30 * 365, dwellingId: 60, sex: 'male' });
  s.crafts = { charcoalKg: 100, potteryKg: 0, ironBarsKg: bars };
  return s;
}

/** Cizí kovář, který je dosažitelný (některý soused ho má). */
const hasNeighbourSmith = (s: VillageState): boolean =>
  NEIGHBOR_DIRECTIONS.some((d) => neighbourCrafts(s.seed, d).includes('smith'));

describe('termín kování', () => {
  it('první termín je 60 dní od prvního dne s jezdeckými koňmi, převod je idempotentní', () => {
    const s = horseVillage([horse(1, 8, 'male', 50)]);
    expect(s.shoeing).toBeUndefined();
    planShoeing(s, START, NO_CRAFTS, null);
    expect(nextShoeingDay(s)).toBe(DUE);
    planShoeing(s, START + 5, NO_CRAFTS, null);
    expect(s.shoeing).toEqual({ lastDay: START });
  });

  it('klisny a hříbata se nekují; bez jezdeckých koní termín zanikne', () => {
    const s = horseVillage([horse(1, 8, 'female'), horse(2, 2)]);
    expect(planShoeing(s, START, NO_CRAFTS, null)).toBeNull();
    expect(s.shoeing).toBeUndefined();
    const t = stable();
    t.pens![0]!.horses = [horse(3, 8, 'female')];
    planShoeing(t, START + 10, NO_CRAFTS, null);
    expect(t.shoeing).toBeUndefined();
  });

  it('před termínem se nekuje a kůň je podkutý', () => {
    const s = stable();
    expect(planShoeing(s, DUE - 1, NO_CRAFTS, null)).toBeNull();
    expect(isUnshod(s, DUE - 1)).toBe(false);
  });
});

describe('vlastní kovář', () => {
  it('kuje z práce vsi a hřiven kovárny, termín se posune', () => {
    const s = withSmith(stable(), 5);
    const plan = planShoeing(s, DUE, NO_CRAFTS, null)!;
    expect(plan.own).toBe(true);
    expect(plan.manDays).toBeCloseTo(2 * HORSE_SHOEING.manDays, 9);
    // bez práce se nekuje a kůň je po termínu nepodkutý
    expect(finishShoeing(s, DUE, plan, 0)).toEqual([]);
    expect(isUnshod(s, DUE)).toBe(true);
    const events = finishShoeing(s, DUE, plan, plan.manDays);
    expect(events).toEqual([{ day: DUE, kind: 'horses-shod', horses: 2, own: true }]);
    expect(s.crafts!.ironBarsKg).toBeCloseTo(5 - 2 * HORSE_SHOEING.ironBarsKg, 9);
    expect(nextShoeingDay(s)).toBe(DUE + HORSE_SHOEING.everyDays);
    expect(isUnshod(s, DUE)).toBe(false);
  });

  it('bez dost hřiven kovář nekuje – hledá se cizí kovář', () => {
    const s = withSmith(stable(), 0.1);
    s.storesKg = 0;
    const plan = planShoeing(s, DUE, NO_CRAFTS, null);
    expect(plan?.own ?? false).toBe(false);
  });
});

describe('cizí kovář', () => {
  it('bez kováře ve vsi přijde soused, platí se z přebytku nad pojistkou', () => {
    const s = stable();
    s.storesKg = 200_000;
    expect(hasNeighbourSmith(s)).toBe(true);
    const plan = planShoeing(s, DUE, NO_CRAFTS, null);
    expect(plan).not.toBeNull();
    expect(plan!.own).toBe(false);
    expect(plan!.grainKg + plan!.legumesKg).toBeGreaterThan(0);
    expect(plan!.grainKg).toBeLessThanOrEqual(s.storesKg);
    const before = s.storesKg;
    expect(finishShoeing(s, DUE, plan, 0)[0]).toMatchObject({ kind: 'horses-shod', own: false });
    expect(s.storesKg).toBeCloseTo(before - plan!.grainKg, 6);
  });

  it('bez přebytku ves nezaplatí – koně zůstanou nepodkutí, kuje se zkusí znovu', () => {
    const s = stable();
    s.storesKg = 0;
    expect(planShoeing(s, DUE, NO_CRAFTS, null)).toBeNull();
    expect(isUnshod(s, DUE)).toBe(true);
    expect(isUnshod(s, DUE + 20)).toBe(true);
  });

  it('cizí kovář je aspoň 3x dražší než vlastní', () => {
    const s = stable();
    for (const route of [4, 8, 14]) {
      const costs = shoeingCosts(s, DUE, NO_CRAFTS, 2, route);
      expect(costs.foreign / costs.own).toBeGreaterThanOrEqual(3);
    }
  });

  it('panel: termín a zdroj', () => {
    const s = withSmith(stable(), 5);
    expect(shoeingView(s, START + 10, NO_CRAFTS)).toMatchObject({
      daysLeft: 50,
      unshod: false,
      source: 'own',
    });
  });
});

describe('panel starší vsi', () => {
  it('ves bez uloženého termínu ukáže první termín od dneška', () => {
    const s = horseVillage([horse(1, 8, 'male', 50)]);
    expect(s.shoeing).toBeUndefined();
    expect(shoeingView(s, START, NO_CRAFTS)).toMatchObject({
      daysLeft: HORSE_SHOEING.everyDays,
      unshod: false,
    });
    expect(s.shoeing).toBeUndefined();
  });
});

describe('nepodkutý kůň', () => {
  it('nejezdí a výcvik stojí, po podkutí pokračuje', () => {
    const s = stable();
    s.horsesCaredToday = 1;
    s.horsesFed = true;
    s.pens![0]!.horses![0]!.riderId = LORD_ID;
    const riding = new Map([[LORD_ID, 1]]);
    const training = (): number => s.pens![0]!.horses![0]!.training;
    const t0 = training();
    trainHorsesDay(s, DUE - 1, riding);
    const t1 = training();
    expect(t1).toBeGreaterThan(t0);
    // termín prošel a kovat nebylo jak
    trainHorsesDay(s, DUE, riding);
    expect(training()).toBe(t1);
    expect(lordRides(s, DUE)).toBeNull();
    // po podkutí pokračuje
    s.shoeing!.lastDay = DUE;
    trainHorsesDay(s, DUE + 1, riding);
    expect(training()).toBeGreaterThan(t1);
  });
});

describe('determinismus', () => {
  it('dopočet vcelku je stejný jako po dnech', () => {
    const make = (): VillageState => {
      const s = stable();
      s.storesKg = 30_000;
      return s;
    };
    const target = DUE + 5;
    const whole = advanceVillage(make(), target, null);
    let stepped = make();
    for (let d = START + 13; d < target; d += 13) stepped = advanceVillage(stepped, d, null);
    stepped = advanceVillage(stepped, target, null);
    expect(stepped.shoeing).toEqual(whole.shoeing);
    expect(stepped.storesKg).toBeCloseTo(whole.storesKg, 6);
    expect(stepped.pens![0]!.horses).toEqual(whole.pens![0]!.horses);
    expect(whole.shoeing?.lastDay).toBe(DUE);
  });
});
