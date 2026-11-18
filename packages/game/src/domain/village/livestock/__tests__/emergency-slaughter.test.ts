import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { eatDiet, meatEnergy } from '../../core/diet';
import {
  dayMealInput,
  emergencySlaughter,
  emergencyPigFloor,
  emergencySlaughterPlan,
  emergencySpare,
  pigletsSpared,
} from '../emergency-slaughter';
import { breedingCows } from '../husbandry';
import { LIVESTOCK, pigForestHa, slaughterRemaining } from '../livestock';
import { villageOxen } from '../oxen';
import { EMERGENCY_SLAUGHTER } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { HerdSpecies, Pen, Person, VillageState } from '../../types';
import { woolSheep } from '../wool';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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
  // dospělí bez příbuzných ve vsi (bez manžela a rodičů)
  const extra: Person[] = Array.from({ length: 8 }, (_, i) => ({
    id: s.nextId + i,
    bornDay: day - 30 * 365,
    dwellingId: home,
    sex: i % 2 === 0 ? 'male' : 'female',
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

/** Les do 600 m pro prasata (ha) – nosnost lesa, ze které jsou chovné prasnice. */
function withForest(s: VillageState, forestHa: number): VillageState {
  s.livestock!.land = { meadowHa: 60, forestHa };
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
    // práce porážky a uzení – v zimě s porážkou po dnech (diet.md – Porážka v zimě), dělá se hned
    expect(s.livestock!.slaughterWork).toMatchObject({ done: 0 });
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

  it('pořadí prasata, kozy, ovce, krávy – chovný pár, krávy na mléko a voly a ovce na vlnu zůstanou', () => {
    // les jen pro chovný pár – prasnice nad něj nejdou
    const s = withForest(village(day), 1);
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

  it('ovce jdou před kravami (oxen.md – Co nejvíc sena a co největší stáda) – voli nikdy', () => {
    expect(EMERGENCY_SLAUGHTER.order).toEqual(['pig', 'goat', 'sheep', 'cow']);
    const s = withForest(village(day), 1);
    s.livestock!.herds = herds({ pig: 2, goat: 2, cow: 9, sheep: 400 });
    s.storesKg = 0;
    const oxen = villageOxen(s);
    emergencySlaughter(s, day, 0, 1);
    // ovcí navíc je dost – krávy zůstanou celé
    expect(s.livestock!.herds.sheep).toBeLessThan(400);
    expect(s.livestock!.herds.cow).toBe(9);
    expect(villageOxen(s)).toBe(oxen);
  });

  it('letošní mláďata na nouzovou porážku nejdou – dorůstají v příští stádo', () => {
    const s = withForest(village(at(601, 5, 1)), 1);
    s.livestock!.herds = herds({ pig: 12, sheep: 30 });
    s.livestock!.young = herds({ pig: 6, sheep: 8 });
    const spare = emergencySpare(s, at(601, 5, 1));
    expect(spare.pig).toBeCloseTo(12 - 6 - LIVESTOCK.breedingMin, 9);
    expect(spare.sheep).toBeCloseTo(Math.max(0, 30 - 8 - woolSheep(s, at(601, 5, 1))), 9);
    emergencySlaughter(s, at(601, 5, 1), 0, 1);
    expect(s.livestock!.herds.pig).toBeGreaterThanOrEqual(6 + LIVESTOCK.breedingMin - 1e-9);
  });

  it('letošní selata od 1. 9. smějí na nouzovou porážku – v srpnu ne, jehňata a kůzlata nikdy', () => {
    const aug = at(601, 8, 31);
    const sep = at(601, 9, 1);
    expect(pigletsSpared(aug)).toBe(true);
    expect(pigletsSpared(sep)).toBe(false);
    expect(pigletsSpared(at(601, 12, 31))).toBe(false);
    expect(pigletsSpared(at(602, 1, 1))).toBe(true);
    const s = withForest(village(aug), 4);
    s.livestock!.herds = herds({ pig: 20, sheep: 40, goat: 8 });
    s.livestock!.young = herds({ pig: 10, sheep: 8, goat: 3 });
    const floor = emergencyPigFloor(s);
    expect(floor).toBe(LIVESTOCK.breedingMin);
    // selata se od 1. 9. počítají do prasat nad chovnými prasnicemi
    expect(emergencySpare(s, aug).pig).toBeCloseTo(20 - 10 - floor, 9);
    expect(emergencySpare(s, sep).pig).toBeCloseTo(20 - floor, 9);
    // jehňata a kůzlata chráněná dál
    expect(emergencySpare(s, sep).sheep).toBeCloseTo(emergencySpare(s, aug).sheep, 9);
    expect(emergencySpare(s, sep).goat).toBeCloseTo(8 - 3 - LIVESTOCK.breedingMin, 9);
    // v srpnu hladová ves selata nechá – prasat zůstane aspoň na selata a chovné prasnice
    s.storesKg = 0;
    emergencySlaughter(s, aug, 0, 1);
    expect(s.livestock!.herds.pig).toBeGreaterThanOrEqual(10 + floor - 1e-9);
  });

  it('v září sáhne hladová ves i na selata – jehňata a kůzlata zůstanou chráněná', () => {
    const sep = at(601, 9, 10);
    const s = withForest(village(sep), 4);
    // dospělá prasata jen na chovné prasnice (pár), nad nimi 8 letošních selat
    s.livestock!.herds = herds({ pig: 10, sheep: 30, goat: 6 });
    s.livestock!.young = herds({ pig: 8, sheep: 8, goat: 2 });
    const input = dayMealInput(s, sep, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    expect(emergencySpare(s, sep).pig).toBeCloseTo(8, 9);
    const event = emergencySlaughter(s, sep, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    const pigs = event.animals.pig ?? 0;
    expect(pigs).toBeGreaterThan(0);
    // mimo zimní porážku je práce nouzová – dělá se hned
    expect(s.livestock!.slaughterWork).toMatchObject({ done: 0, emergency: true });
    // dospělých prasat je jen na chovné prasnice – porazila se selata; spodní hranice zůstane
    expect(s.livestock!.herds.pig).toBeCloseTo(10 - pigs, 1);
    expect(s.livestock!.herds.pig).toBeGreaterThanOrEqual(LIVESTOCK.breedingMin - 1e-9);
    // kozy jen nad chovný pár a kůzlata – stádo koz zůstane aspoň na nich
    expect(s.livestock!.herds.goat).toBeGreaterThanOrEqual(2 + LIVESTOCK.breedingMin - 1e-9);
    // týž stav v srpnu – selata nejdou, ves sáhne po kozách
    const aug = at(601, 8, 20);
    const a = withForest(village(aug), 4);
    a.livestock!.herds = herds({ pig: 10, sheep: 30, goat: 6 });
    a.livestock!.young = herds({ pig: 8, sheep: 8, goat: 2 });
    const augInput = dayMealInput(a, aug, 0, 1);
    a.storesKg = 0.75 * augInput.needPerDay * augInput.daysToHarvest;
    expect(emergencySpare(a, aug).pig).toBe(0);
    const augEvent = emergencySlaughter(a, aug, 0, 1);
    expect(a.livestock!.herds.pig).toBe(10);
    expect(a.livestock!.young.pig).toBe(8);
    if (augEvent?.kind === 'emergency-slaughter') expect(augEvent.animals.pig).toBeUndefined();
  });

  it('selata první: od 1. 9. porážka ubere napřed selata, dospělá prasata zůstanou (Martin 31. 10. 2026)', () => {
    const sep = at(601, 9, 10);
    const s = withForest(village(sep), 4);
    s.livestock!.herds = herds({ pig: 20, sheep: 30, goat: 6 });
    s.livestock!.young = herds({ pig: 8, sheep: 8, goat: 2 });
    const input = dayMealInput(s, sep, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    const event = emergencySlaughter(s, sep, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    const pigs = event.animals.pig ?? 0;
    expect(pigs).toBeGreaterThan(0);
    // selata ubyla kus za kus (ne poměrem 8 × 12 / 20), dokud jich bylo
    expect(s.livestock!.young.pig).toBeCloseTo(Math.max(0, 8 - pigs), 1);
    expect(s.livestock!.herds.pig).toBeCloseTo(20 - pigs, 1);
  });

  it('chovné prasnice: prasata jen nad polovinou toho, kolik jich uživí les', () => {
    const s = withForest(village(day), 40);
    // tatáž nosnost lesa jako u podzimní porážky (winterTargets)
    const floor = (EMERGENCY_SLAUGHTER.pigForestShare * pigForestHa(s)) / LIVESTOCK.forestHaPerPig;
    expect(floor).toBeCloseTo(20, 9);
    expect(emergencyPigFloor(s)).toBeCloseTo(floor, 9);
    // pod spodní hranicí žádná prasata – ani hladová ves bez obilí
    s.livestock!.herds = herds({ pig: floor - 1 });
    s.storesKg = 0;
    expect(emergencySpare(s, day).pig).toBe(0);
    expect(emergencySlaughterPlan(s, day, 0, 1)).toBeNull();
    // nad ní ano – hladová ves porazí všechna prasata navíc (pod stropem masa) a stádo zůstane na
    // spodní hranici
    s.livestock!.herds = herds({ pig: floor + 10 });
    expect(emergencySpare(s, day).pig).toBeCloseTo(10, 9);
    const event = emergencySlaughter(s, day, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    expect(event.animals.pig).toBeCloseTo(10, 1);
    expect(s.livestock!.herds.pig).toBeCloseTo(floor, 6);
  });

  it('les pro méně prasat než chovný pár – chovný pár zůstane', () => {
    const s = withForest(village(day), 2);
    expect(emergencyPigFloor(s)).toBe(LIVESTOCK.breedingMin);
    s.livestock!.herds = herds({ pig: 10 });
    s.storesKg = 0;
    expect(emergencySpare(s, day).pig).toBeCloseTo(10 - LIVESTOCK.breedingMin, 9);
    emergencySlaughter(s, day, 0, 1);
    expect(s.livestock!.herds.pig).toBeCloseTo(LIVESTOCK.breedingMin, 6);
    // bez lesa taky
    withForest(s, 0);
    expect(emergencyPigFloor(s)).toBe(LIVESTOCK.breedingMin);
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

  it('maso, které se do konce masa nestihne sníst, nepomůže – ves porazí jen tolik a dál šetří', () => {
    // v září se maso jí jen do porážky 1. 11. – výhled ho počítá nejvýš plnou potřebou za ty dny
    // (diet.md – Strava po vrstvách, bez stropů; dřív strop masa 40 %)
    const september = at(600, 9, 15);
    const s = village(september);
    s.livestock!.herds = herds({ pig: 400 });
    s.storesKg = 0;
    const event = emergencySlaughter(s, september, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    expect(s.livestock!.herds.pig).toBeGreaterThan(100);
    const input = dayMealInput(s, september, 0, 1);
    expect(input.daysToMeatEnd).toBeLessThan(input.daysToHarvest);
    const meal = eatDiet(input);
    // maso na plnou potřebu do konce masa – dnes se jí jen maso (a vejce před ním)
    expect(meatEnergy(input.meatKg)).toBeGreaterThanOrEqual(
      input.needPerDay * input.daysToMeatEnd * 0.999,
    );
    expect(meal.diet.energy).toBeCloseTo(1, 2);
    expect(meal.diet.shares.meat).toBeGreaterThan(0.9);
    expect(meal.outlook).toBeLessThan(1);
    // další porážka už nic nepřidá
    expect(emergencySlaughterPlan(s, september, 0, 1)).toBeNull();
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
    // ves bez sena napřed porazí ovce, na které seno nezbude (oxen.md – Co nejvíc sena a co
    // největší stáda, 24. 10. 2026) – ovce na vlnu mají seno před kravami (diet.md – Zima bez sena,
    // 10. 11. 2026), porážka dá méně masa a nouzová porážka přijde týž den (dřív o dva dny později)
    const hay = whole.chronicle.filter((e) => e.kind === 'hay-slaughter');
    expect(hay.map((e) => e.day)).toEqual([at(600, 11, 10)]);
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
