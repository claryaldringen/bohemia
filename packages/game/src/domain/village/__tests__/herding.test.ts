import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { HERDING, herdingCoverage, herdingDay, herdingDemand, recordHerding } from '../herding';
import { advanceVillage } from '../simulate';
import type { HerdSpecies, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Pasáci (diet.md – Pasáci; Martin 19. 10. 2026): jeden pasák uhlídá jen omezené stádo, pasou
// napřed děti od 7 let a starší, zbytek dospělí ze společné práce; co nikdo neuhlídá, jde na maso.

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

  it('napřed děti od 7 let, pak starší, zbytek dospělí', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    s.people = [
      person(s, 1, 30, day),
      person(s, 2, 9, day),
      person(s, 3, 5, day), // malé dítě nepase
      person(s, 4, 50, day),
    ];
    // 0,4 + 0,75 = 1,15 pasáka bez práce vsi
    s.livestock!.herds = herds({ sheep: 100 });
    expect(herdingDay(s, day, 0, 1)).toEqual({
      demand: 1,
      free: 1,
      freeHerders: { children: 1, elders: 1 },
      adults: 0,
    });
    s.livestock!.herds = herds({ sheep: 30 });
    expect(herdingDay(s, day, 0, 1).freeHerders).toEqual({ children: 1, elders: 0 });
    s.livestock!.herds = herds({ cow: 80 });
    const big = herdingDay(s, day, 0, 1);
    expect(big.free).toBeCloseTo(1.15, 9);
    expect(big.adults).toBeCloseTo(2 - 1.15, 9);
    // dospělý pase nejvýš jeden z domácnosti – 200 krav jedna domácnost neuhlídá
    s.livestock!.herds = herds({ cow: 200 });
    expect(herdingDay(s, day, 0, 1).adults).toBe(HERDING.adultsPerHousehold);
  });

  it('co pasáci uhlídali, se sčítá od porážky do porážky', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    expect(herdingCoverage(s)).toBe(1);
    recordHerding(
      s,
      { demand: 2, free: 1, freeHerders: { children: 3, elders: 0 }, adults: 1 },
      0.5,
    );
    recordHerding(s, { demand: 2, free: 1, freeHerders: { children: 3, elders: 0 }, adults: 1 }, 1);
    expect(herdingCoverage(s)).toBeCloseTo(3.5 / 4, 9);
  });
});

describe('simulace – pasáci', () => {
  it('velké stádo – co děti nezvládnou, pasou dospělí ze společné práce; podíl se uloží', () => {
    const day = at(600, 5, 1);
    const s = village(day);
    s.livestock!.herds = herds({ cow: 30, sheep: 60 });
    const next = advanceVillage(s, day + 1, null);
    const herding = next.labor!.shares.filter((share) => share.activity === 'herding');
    const children = next.labor!.herders!.children;
    expect(children).toBeGreaterThan(0);
    expect(herding.reduce((sum, share) => sum + share.manDays, 0)).toBeGreaterThan(0);
    expect(next.livestock!.herding!.needDays).toBeGreaterThan(0);
  });

  it('po porážce začíná nový rok pasení', () => {
    const s = village(at(600, 10, 30));
    s.livestock!.herds = herds({ sheep: 10, pig: 4 });
    const next = advanceVillage(s, at(600, 11, 1), null);
    // 1. 11. ráno porážka smaže součet, den pasení prasat se zapíše znovu
    expect(next.livestock!.herding!.needDays).toBeCloseTo(4 / HERDING.perHerder.pig, 2);
  });
});
