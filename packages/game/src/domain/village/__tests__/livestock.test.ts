import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { PROTEIN } from '../diet';
import {
  LIVESTOCK,
  grazingDemandHa,
  herdBirths,
  meatNeedPerYear,
  proteinBudget,
  pastureHa,
  pigForestHa,
  slaughter,
  startingHerds,
  villageChickens,
  winterTargets,
  withLivestock,
} from '../livestock';
import { advanceVillage } from '../simulate';
import type { FieldPart, HerdSpecies, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Dobytek (diet.md – Dobytek): výchozí stádo, růst, nosnost, porážka, vejce a staré vsi.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day = at(600, 9, 2)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

describe('výchozí stádo', () => {
  it('na domácnost 3 ovce, koza, 2 prasata, kráva na 2 domácnosti; slepice u obydlí', () => {
    expect(startingHerds(1)).toEqual({ sheep: 3, goat: 1, pig: 2, cow: 1 });
    expect(startingHerds(4)).toEqual({ sheep: 12, goat: 4, pig: 8, cow: 2 });
    const s = village();
    expect(s.livestock!.herds).toEqual(startingHerds(1));
    expect(villageChickens(s)).toBe(2);
  });

  it('ves uložená před dobytkem dostane výchozí stádo z domácností při dopočtu', () => {
    const s = village();
    delete s.livestock;
    delete s.meatKg;
    const json = JSON.parse(JSON.stringify(s)) as VillageState;
    const next = advanceVillage(json, s.lastDay + 1, null);
    expect(next.livestock!.herds).toEqual(startingHerds(1));
    // jídlo prvního dne i s vejci
    expect(next.diet!.shares.eggs).toBeGreaterThan(0);
  });

  it('withLivestock doplní krajinu pro pastvu jednou – pak vrátí týž stav', () => {
    const s = village();
    const land = { meadowHa: 30, forestHa: 12 };
    const next = withLivestock(s, land);
    expect(next.livestock!.land).toEqual(land);
    expect(withLivestock(next, { meadowHa: 1, forestHa: 1 })).toBe(next);
  });
});

describe('růst a nosnost', () => {
  it('na jaře mláďata: ovce a kozy +40 %, prasata +100 %, krávy +20 %', () => {
    const s = village();
    s.livestock!.herds = herds({ sheep: 10, goat: 5, pig: 4, cow: 5 });
    herdBirths(s);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 14, goat: 7, pig: 8, cow: 6 }));
    expect(s.livestock!.young).toEqual(herds({ sheep: 4, goat: 2, pig: 4, cow: 1 }));
  });

  it('pastva = louka bez polí mimo příloh + příloh na vymýceném lese', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 20, forestHa: 10 };
    s.parts = [
      part(1),
      part(2, { state: 'fallow', fallowSinceDay: at(595, 9, 1) }),
      part(3, { state: 'fallow', surface: 'forest', fallowSinceDay: at(595, 9, 1) }),
      part(4, { surface: 'forest' }),
    ];
    // louka 20 − osetý díl 1 ha (příloh na louce je pořád pastva) + příloh na lese 1 ha
    expect(pastureHa(s)).toBeCloseTo(20, 9);
    // les 10 − dva díly založené v lese
    expect(pigForestHa(s)).toBeCloseTo(8, 9);
    expect(grazingDemandHa(herds({ sheep: 5, goat: 5, cow: 2 }), 2)).toBeCloseTo(6, 9);
  });

  it('přes zimu: prasata podle lesa, pasoucí se podle pastvy, krávy podle sena, chovný pár', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 6, forestHa: 3 };
    s.livestock!.herds = herds({ sheep: 20, goat: 10, pig: 10, cow: 6 });
    const keep = winterTargets(s, 0, 2 * 1500);
    expect(keep.pig).toBeCloseTo(3, 9);
    // pastva 6 ha – poptávka 20 × 0,2 + 10 × 0,2 + 6 = 12 ha → polovina
    expect(keep.sheep).toBeCloseTo(10, 9);
    expect(keep.goat).toBeCloseTo(5, 9);
    // krávy: pastva by unesla 3, seno jen 2
    expect(keep.cow).toBeCloseTo(2, 9);
    // bez sena zůstane chovný pár
    expect(winterTargets(s, 0, 0).cow).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // voli mají přednost na pastvě
    expect(winterTargets(s, 4, 10_000).sheep).toBeCloseTo((20 * 2) / 12, 9);
  });
});

describe('porážka (1. 11.)', () => {
  it('na maso jde, co přeroste nosnost – výtěžnost podle druhu, práce 1 čd na 20 kg', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 1000, forestHa: 2 };
    s.livestock!.herds = herds({ pig: 6 });
    s.meatKg = 10_000; // masa dost – mláďata navíc nejdou
    const event = slaughter(s, at(600, 11, 1), 0, 0);
    expect(s.livestock!.herds.pig).toBeCloseTo(2, 9);
    expect(event).toMatchObject({ kind: 'slaughter', kg: 4 * 50, animals: { pig: 4 } });
    expect(s.meatKg).toBeCloseTo(10_000 + 200, 9);
    expect(s.livestock!.slaughterWork).toEqual({ required: 200 / 20, done: 0 });
  });

  it('když maso nestačí na rok, jdou na maso i mláďata navíc – nejvýš polovina, prasata první', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 4, sheep: 6 });
    s.livestock!.young = herds({ pig: 2, sheep: 2 });
    s.meatKg = 0;
    const need = meatNeedPerYear(s, at(600, 11, 1));
    // bílkoviny (1,6 g na kg váhy), které chybí po obilí, mléku ovcí a vejcích – v mase
    const b = proteinBudget(s, at(600, 11, 1));
    expect(b.need).toBeCloseTo(
      ((2 * PROTEIN.bodyKg.adult + 2 * PROTEIN.bodyKg.child) * PROTEIN.gPerKgBody * 365) / 1000,
      9,
    );
    expect(need).toBeCloseTo((b.need - b.grain - b.milk - b.eggs) / PROTEIN.perKg.meat, 9);
    expect(need).toBeGreaterThan(150);
    slaughter(s, at(600, 11, 1), 0, 0);
    // polovina mláďat prasat (50 kg) nepokryje potřebu – i polovina jehňat
    expect(s.livestock!.herds.pig).toBeCloseTo(3, 9);
    expect(s.livestock!.herds.sheep).toBeCloseTo(5, 9);
    expect(s.livestock!.young).toEqual(herds({}));
  });

  it('stádo, které dává masa dost (1,5× potřeby), neroste – mláďata jdou na maso celá', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 18, sheep: 6, cow: 3 });
    s.livestock!.young = herds({ pig: 9, sheep: 2, cow: 0.5 });
    s.meatKg = 0;
    slaughter(s, at(600, 11, 1), 0, 10_000);
    expect(s.livestock!.herds.pig).toBeCloseTo(9, 9);
    expect(s.livestock!.herds.sheep).toBeCloseTo(4, 9);
    // krávy rostou dál do nosnosti (telata pro voly)
    expect(s.livestock!.herds.cow).toBeCloseTo(3, 9);
  });

  it('chovný pár zůstane, i když nosnost nic neunese', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 0, forestHa: 0 };
    s.livestock!.herds = herds({ sheep: 5, pig: 1, cow: 3 });
    s.meatKg = 10_000;
    slaughter(s, at(600, 11, 1), 0, 0);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 2, pig: 1, cow: 2 }));
  });
});

describe('simulace – stáda za rok', () => {
  it('startovní ves: na jaře mláďata, v listopadu porážka a maso v zásobě, vejce celý rok', () => {
    const s = village(at(600, 3, 1));
    const end = advanceVillage(s, at(600, 11, 2), null);
    const event = end.chronicle.find((e) => e.kind === 'slaughter');
    expect(event).toBeDefined();
    expect(end.meatKg).toBeGreaterThan(0);
    // stádo prasat rostlo – polovina mláďat jde na maso
    expect(end.livestock!.herds.pig).toBeGreaterThan(2);
  });

  it('výsledek nezávisí na tom, po jakých kouscích se dopočítává', () => {
    const s = village(at(600, 3, 1));
    const whole = advanceVillage(s, at(602, 3, 1), null);
    let chunked = s;
    for (let d = s.lastDay + 37; d < at(602, 3, 1); d += 37)
      chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, at(602, 3, 1), null);
    expect(chunked.livestock).toEqual(whole.livestock);
    expect(chunked.meatKg).toBeCloseTo(whole.meatKg!, 9);
    expect(chunked.diet).toEqual(whole.diet);
  });
});
