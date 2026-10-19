import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { HERDING, herdingCoverage, herdingDay, herdingDemand, recordHerding } from '../herding';
import { HAY, HAY_WINTER_DAYS } from '../hay';
import {
  LIVESTOCK,
  headEconomy,
  sizeHerdsToNeed,
  TYPICAL_FOOD_COSTS,
  winterTargets,
  yearlyMeatPerHead,
} from '../livestock';
import { advanceVillage } from '../simulate';
import type { HerdSpecies, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Pasáci (diet.md – Pasáci; Martin 19. 10. 2026): jeden pasák uhlídá jen omezené stádo, pasou jen
// výrostci 7–13 let (bez práce vsi), dospělí ani starší ne; co nikdo neuhlídá, jde na maso.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

/** Člověk daného věku v den `day` v domě prvního obydlí. */
function person(s: VillageState, id: number, age: number, day: number): Person {
  const p: Person = { ...s.people[0]!, id, bornDay: day - Math.ceil(age * 365.25) - 10 };
  delete p.spouseId;
  return p;
}

describe('kolik pasáků stáda potřebují', () => {
  it('krávy 40, ovce a kozy 100, prasata 50 na dospělého pasáka; v zimě jen prasata', () => {
    const summer = at(600, 6, 1);
    expect(herdingDemand(herds({ cow: 20, sheep: 50, goat: 50, pig: 25 }), 0, summer)).toBeCloseTo(
      0.5 + 0.5 + 0.5 + 0.5,
      9,
    );
    // voli na pastvě jako krávy
    expect(herdingDemand(herds({}), 4, summer)).toBeCloseTo(4 / HERDING.perHerder.cow, 9);
    expect(herdingDemand(herds({ cow: 20, sheep: 50, pig: 25 }), 2, at(600, 12, 1))).toBeCloseTo(
      0.5,
      9,
    );
  });

  it('pasou jen výrostci 7–13 let – jen kolik jich stáda potřebují; starší ani dospělí ne', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    s.people = [
      person(s, 1, 30, day),
      person(s, 2, 9, day),
      person(s, 3, 12, day),
      person(s, 4, 5, day), // malé dítě nepase
      person(s, 5, 50, day), // starší nepase
    ];
    // 30 ovcí = 0,3 pasáka – stačí jeden výrostek
    s.livestock!.herds = herds({ sheep: 30 });
    expect(herdingDay(s, day, 0)).toEqual({ demand: 0.3, free: 0.3, freeHerders: { children: 1 } });
    // 80 krav = 2 pasáci – dva výrostci uhlídají 0,8, zbytek nikdo (dospělí nepasou)
    s.livestock!.herds = herds({ cow: 80 });
    const big = herdingDay(s, day, 0);
    expect(big.demand).toBeCloseTo(2, 9);
    expect(big.free).toBeCloseTo(0.8, 9);
    expect(big.freeHerders).toEqual({ children: 2 });
    // bez výrostků stáda nikdo nepase
    s.people = [person(s, 1, 30, day), person(s, 5, 50, day)];
    expect(herdingDay(s, day, 0).free).toBe(0);
  });

  it('co pasáci uhlídali, se sčítá od porážky do porážky', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    expect(herdingCoverage(s)).toBe(1);
    recordHerding(s, { demand: 2, free: 1, freeHerders: { children: 3 } });
    recordHerding(s, { demand: 2, free: 1.5, freeHerders: { children: 4 } });
    expect(herdingCoverage(s)).toBeCloseTo(2.5 / 4, 9);
  });
});

describe('rovnovážné hospodaření – pasáci (diet.md)', () => {
  it('pasáci ani dojení nestojí práci vsi – kus stojí jen seno a porážku', () => {
    const slaughter = (sp: HerdSpecies): number =>
      yearlyMeatPerHead(sp) / LIVESTOCK.slaughterKgPerManDay;
    // prase: jen porážka a uzení
    expect(headEconomy('pig', TYPICAL_FOOD_COSTS).labor).toBeCloseTo(slaughter('pig'), 9);
    // kráva: zimní seno a porážka – dojení, sýr ani péče ne
    expect(headEconomy('cow', TYPICAL_FOOD_COSTS).labor).toBeCloseTo(
      HAY.dailyKg.cow * HAY_WINTER_DAYS * TYPICAL_FOOD_COSTS.hayPerKg + slaughter('cow'),
      9,
    );
  });

  it('stádo omezí jen podíl, který výrostci přes rok uhlídali – plán pasáky nepočítá', () => {
    // Vlkov 1. 11. 792 (Martin 19. 10. 2026): dva výrostci k porážce, ale přes rok uhlídali 90 %
    // – plán stáda nesmí podle dnešních výrostků porazit prasata, která uživí les
    const day = at(600, 11, 1);
    const s = village(day);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ sheep: 60, goat: 2, pig: 40, cow: 2 });
    const watched = winterTargets(s, day, { oxen: 0, hayKg: Infinity });
    const half = winterTargets(s, day, { oxen: 0, hayKg: Infinity, herding: 0.5 });
    // co výrostci neuhlídali, jde na maso (winterTargets – herdingCoverage)
    expect(half.pig).toBeLessThan(watched.pig);
    expect(half.sheep).toBeLessThan(watched.sheep);
    // plán (rovnovážné hospodaření) pasáky nepočítá – ovce napřed nezaberou místo prasatům
    const plan = sizeHerdsToNeed(s, day, watched).keep;
    expect(plan.sheep).toBeGreaterThan(LIVESTOCK.breedingMin);
    expect(plan.pig).toBeGreaterThan(LIVESTOCK.breedingMin);
  });
});

describe('simulace – pasáci', () => {
  it('velké stádo – dospělí na pasení práci nedávají, neuhlídaný podíl se uloží', () => {
    const day = at(600, 5, 1);
    const s = village(day);
    s.livestock!.herds = herds({ cow: 30, sheep: 60 });
    const next = advanceVillage(s, day + 1, null);
    const herding = next.labor!.shares.filter((share) => share.activity === 'herding');
    expect(herding).toEqual([]);
    expect(next.labor!.herders!.children).toBeGreaterThan(0);
    const year = next.livestock!.herding!;
    expect(year.needDays).toBeGreaterThan(0);
    // zakladatelé mají jednoho výrostka (13 let) – 30 krav a 60 ovcí neuhlídá
    expect(year.watchedDays).toBeLessThan(year.needDays);
  });

  it('po porážce začíná nový rok pasení', () => {
    const s = village(at(600, 10, 30));
    s.livestock!.herds = herds({ sheep: 10, pig: 4 });
    const next = advanceVillage(s, at(600, 11, 1), null);
    // 1. 11. ráno porážka smaže součet, den pasení prasat se zapíše znovu
    expect(next.livestock!.herding!.needDays).toBeCloseTo(4 / HERDING.perHerder.pig, 2);
  });
});
