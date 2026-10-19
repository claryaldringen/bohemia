import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { DIET, eatDiet, meatEnergy } from '../diet';
import {
  dayMealInput,
  emergencySlaughter,
  emergencySlaughterPlan,
  emergencySpare,
} from '../emergency-slaughter';
import { breedingCows } from '../husbandry';
import { LIVESTOCK, slaughterRemaining } from '../livestock';
import { EMERGENCY_SLAUGHTER } from '../rules';
import { advanceVillage } from '../simulate';
import type { HerdSpecies, Pen, Person, VillageState } from '../types';
import { woolSheep } from '../wool';
import { withBuiltFirstDwelling } from './village-fixtures';

// Nouzová porážka (diet.md – Nouzová porážka): když výhled jídla do sklizně nevychází, ves napřed
// porazí zvířata navíc – prasata, kozy, krávy nad chovné, ovce nad ovce na vlnu – a teprve pak
// šetří přídělem.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

/** Ves s osadníky a 8 dospělými navíc v jednom domě, bez zásob a stád. */
function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 1, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const home = s.people[0]!.dwellingId;
  const extra: Person[] = Array.from({ length: 8 }, (_, i) => ({
    ...s.people[0]!,
    id: s.nextId + i,
    birthDay: day - 30 * 365,
    dwellingId: home,
    sex: i % 2 === 0 ? 'male' : 'female',
    spouseId: null,
    motherId: null,
    fatherId: null,
  }));
  s.nextId += extra.length;
  s.people.push(...extra);
  s.lastDay = day - 1;
  s.storesKg = 0;
  s.meatKg = 0;
  s.applesKg = 0;
  s.cheeseKg = 0;
  s.legumesKg = 0;
  s.livestock!.herds = herds({});
  s.livestock!.young = herds({});
  return s;
}

/** Výhled jídla dne bez porážky (příděl do sklizně 0–1). */
function outlook(s: VillageState, day: number): number {
  return eatDiet(dayMealInput(s, day, 0, 1)).outlook;
}

describe('nouzová porážka', () => {
  const day = at(600, 12, 1);

  it('ves, které jídlo do sklizně vychází, nic navíc neporáží', () => {
    const s = village(day);
    s.storesKg = 50_000;
    s.livestock!.herds = herds({ pig: 40 });
    expect(emergencySlaughterPlan(s, day, 0, 1)).toBeNull();
    expect(emergencySlaughter(s, day, 0, 1)).toBeNull();
    expect(s.livestock!.herds.pig).toBe(40);
  });

  it('porazí prasata, aby výhled vyšel i s rezervou – příděl zůstane plný', () => {
    const s = village(day);
    s.livestock!.herds = herds({ pig: 60, sheep: 30 });
    // obilí na 75 % potřeby do sklizně (vejce a mléko přidají)
    const input = dayMealInput(s, day, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    expect(outlook(s, day)).toBeLessThan(0.9);
    const event = emergencySlaughter(s, day, 0, 1);
    expect(event).toMatchObject({ kind: 'emergency-slaughter' });
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    // jen prasata – stačila, ovce zůstaly
    expect(Object.keys(event.animals)).toEqual(['pig']);
    expect(s.livestock!.herds.sheep).toBe(30);
    expect(s.livestock!.herds.pig).toBeCloseTo(60 - event.animals.pig!, 1);
    expect(s.meatKg).toBeCloseTo(event.kg, 0);
    // příděl dnes plný a výhled vyjde i se zásobou o rezervu menší
    expect(outlook(s, day)).toBeGreaterThanOrEqual(1 - 1e-9);
    const after = dayMealInput(s, day, 0, 1);
    const reserve = EMERGENCY_SLAUGHTER.reserveShare * after.needPerDay * after.daysToHarvest;
    expect(eatDiet({ ...after, grainKg: after.grainKg - reserve }).outlook).toBeGreaterThan(
      1 - 1e-6,
    );
    // nejméně masa – o pár kil míň by s rezervou nevyšlo
    expect(
      eatDiet({ ...after, grainKg: after.grainKg - reserve, meatKg: after.meatKg - 5 }).outlook,
    ).toBeLessThan(1);
    // práce porážky a uzení mimo listopad – nouzová, dělá se hned
    expect(s.livestock!.slaughterWork).toMatchObject({ done: 0, emergency: true });
    expect(s.livestock!.slaughterWork!.required).toBeCloseTo(
      s.meatKg! / LIVESTOCK.slaughterKgPerManDay,
      9,
    );
    expect(slaughterRemaining(s, day)).toBeCloseTo(s.meatKg! / LIVESTOCK.slaughterKgPerManDay, 6);
    // druhý den už nic – rezerva drží
    expect(emergencySlaughterPlan(s, day, 0, 1)).toBeNull();
  });

  it('maso z nouze se do osevu podle stravy počítá jako potřeba z pole', () => {
    const s = village(day);
    s.livestock!.herds = herds({ pig: 60 });
    const input = dayMealInput(s, day, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    s.fieldFood = { needKg: 1000, fieldKg: 600 };
    emergencySlaughter(s, day, 0, 1);
    expect(s.fieldFood.fieldKg).toBeCloseTo(600 + meatEnergy(s.meatKg!), 9);
  });

  it('pořadí prasata, kozy, krávy, ovce – chovný pár, krávy na mléko a voly a ovce na vlnu zůstanou', () => {
    const s = village(day);
    s.livestock!.herds = herds({ pig: 5, goat: 6, cow: 9, sheep: 40 });
    s.storesKg = 0;
    const spare = emergencySpare(s, day);
    const cows = Math.max(LIVESTOCK.breedingMin, breedingCows(s));
    const wool = Math.max(LIVESTOCK.breedingMin, woolSheep(s, day));
    expect(spare).toEqual({ pig: 3, goat: 4, cow: 9 - cows, sheep: 40 - wool });
    emergencySlaughter(s, day, 0, 1);
    // ani všechna zvířata navíc hladovou ves bez obilí neuživí – porazí se všechna, kde to ještě
    // pomůže, a spodní hranice zůstanou
    expect(s.livestock!.herds.pig).toBeCloseTo(LIVESTOCK.breedingMin, 6);
    expect(s.livestock!.herds.goat).toBeCloseTo(LIVESTOCK.breedingMin, 6);
    expect(s.livestock!.herds.cow).toBeGreaterThanOrEqual(cows - 1e-6);
    expect(s.livestock!.herds.sheep).toBeGreaterThanOrEqual(wool - 1e-6);
    expect(outlook(s, day)).toBeLessThan(1);
  });

  it('pár kusů navíc, které příděl skoro nezvednou, ves neporáží – nepokryje-li schodek', () => {
    const s = village(day);
    const input = dayMealInput(s, day, 0, 1);
    s.storesKg = 0.5 * input.needPerDay * input.daysToHarvest;
    // půl prasete navíc (25 kg masa) zvedne příděl o zlomek procenta
    s.livestock!.herds = herds({ pig: LIVESTOCK.breedingMin + 0.5 });
    expect(emergencySlaughterPlan(s, day, 0, 1)).toBeNull();
    // celé stádo prasat navíc ano
    s.livestock!.herds = herds({ pig: 40 });
    const plan = emergencySlaughterPlan(s, day, 0, 1);
    expect(plan?.kg).toBeGreaterThan(0);
    s.livestock!.herds.pig -= plan!.animals.pig;
    s.meatKg = plan!.kg;
    expect(outlook(s, day) - 0.5).toBeGreaterThanOrEqual(EMERGENCY_SLAUGHTER.minGain);
  });

  it('spřežení a telata ve výcviku jsou v ohradě – na porážku nejdou, ohrada zvedne krávy chovné', () => {
    const s = village(day);
    const pen: Pen = {
      id: 900,
      cell: { x: 3, y: 3 },
      x: 50,
      z: 50,
      builtDay: day - 800,
      team: { readyDay: day - 400 },
      training: { startDay: day - 100 },
    };
    s.pens = [pen];
    s.livestock!.herds = herds({ cow: 10 });
    s.storesKg = 0;
    emergencySlaughter(s, day, 0, 1);
    expect(s.pens).toEqual([pen]);
    expect(breedingCows(s)).toBeGreaterThanOrEqual(3);
    expect(s.livestock!.herds.cow).toBeCloseTo(Math.max(3, breedingCows(s)), 6);
  });

  it('maso nad strop ve stravě nepomůže – ves porazí jen po strop a dál šetří', () => {
    const s = village(day);
    s.livestock!.herds = herds({ pig: 400 });
    s.storesKg = 0;
    const event = emergencySlaughter(s, day, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    expect(s.livestock!.herds.pig).toBeGreaterThan(100);
    const input = dayMealInput(s, day, 0, 1);
    const meal = eatDiet(input);
    // maso rovným dílem do zkažení na stropu 40 % energie
    expect(meatEnergy(input.meatKg) / input.daysToMeatEnd).toBeGreaterThanOrEqual(
      DIET.caps.meat * input.needPerDay * 0.999,
    );
    expect(meal.diet.shares.meat).toBeCloseTo(DIET.caps.meat, 3);
    expect(meal.outlook).toBeLessThan(1);
    // další porážka už nic nepřidá
    expect(emergencySlaughterPlan(s, day, 0, 1)).toBeNull();
  });

  it('v simulaci: ves s prasaty místo šetření porazí a jí dosyta; dopočet po kouscích stejný', () => {
    const start = village(at(600, 11, 10));
    start.livestock!.herds = herds({ pig: 50, sheep: 30, cow: 3 });
    const input = dayMealInput(start, at(600, 11, 10), 0, 1);
    start.storesKg = 0.8 * input.needPerDay * input.daysToHarvest;
    const end = at(601, 2, 20);
    const whole = advanceVillage(start, end, null);
    const events = whole.chronicle.filter((e) => e.kind === 'emergency-slaughter');
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.day).toBe(at(600, 11, 10));
    expect(whole.chronicle.some((e) => e.kind === 'hunger-began')).toBe(false);
    expect(whole.hungry).toBe(false);
    expect(whole.ration).toBeUndefined();
    expect(whole.diet?.energy).toBeCloseTo(1, 9);
    // práce porážky se odvedla
    const work = whole.livestock!.slaughterWork!;
    expect(work.done).toBeCloseTo(work.required, 6);
    let chunked = start;
    const steps = [1, 3, 17, 40];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % 4]!), null);
    }
    expect(chunked).toEqual(whole);
  });

  it('ves bez zvířat navíc šetří přídělem – příděl ve stavu', () => {
    const start = village(at(600, 12, 1));
    const input = dayMealInput(start, at(600, 12, 1), 0, 1);
    start.storesKg = 0.95 * input.needPerDay * input.daysToHarvest;
    const next = advanceVillage(start, at(600, 12, 1), null);
    expect(next.hungry).toBe(true);
    expect(next.ration).toBeGreaterThan(0.9);
    expect(next.ration).toBeLessThan(1);
    expect(next.chronicle.some((e) => e.kind === 'emergency-slaughter')).toBe(false);
  });
});
