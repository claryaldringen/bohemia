import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { PROTEIN } from '../diet';
import { winterHayAvailable } from '../hay';
import {
  BREEDING_ORDER,
  LIVESTOCK,
  goatBrowseHa,
  grazingDemandHa,
  herdBirths,
  herdLosses,
  herdProteinNeed,
  meatNeedPerYear,
  proteinBudget,
  proteinPerHead,
  pastureHa,
  pigForestHa,
  sizeHerdsToNeed,
  slaughter,
  starveHerds,
  startingHerds,
  villageChickens,
  winterTargets,
  withLivestock,
  yearlyMeatPerHead,
} from '../livestock';
import { advanceVillage } from '../simulate';
import type { FieldPart, HerdSpecies, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Dobytek (diet.md – Dobytek): výchozí stádo, růst, ztráty, nosnost, chovné stádo podle potřeby,
// porážka, zimní úhyn, vejce a staré vsi.

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
    // po prvním dni ztrát (diet.md – Roční ztráty stáda)
    const start = startingHerds(1);
    for (const species of ['sheep', 'goat', 'pig', 'cow'] as const) {
      expect(next.livestock!.herds[species]).toBeCloseTo(start[species], 2);
    }
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

  it('přes zimu: pastva a seno podle přednosti – voli, krávy na mléko a voly, ovce, kozy, krávy', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 6, forestHa: 3 };
    s.livestock!.herds = herds({ sheep: 20, goat: 10, pig: 10, cow: 6 });
    const keep = winterTargets(s, { oxen: 0, hayKg: Infinity });
    // prasata podle lesa (celý rok v lese)
    expect(keep.pig).toBeCloseTo(3, 9);
    // pastva 6 ha: ovce napřed (20 × 0,2 = 4 ha), kozy zbytek (10 × 0,2 = 2 ha), krávám nic
    expect(keep.sheep).toBeCloseTo(20, 9);
    expect(keep.goat).toBeCloseTo(10, 9);
    expect(keep.cow).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // krávy na mléko a voly mají přednost i před ovcemi
    const cows = winterTargets(s, { oxen: 0, hayKg: Infinity, minCows: 4 });
    expect(cows.cow).toBeCloseTo(4, 9);
    expect(cows.sheep).toBeCloseTo(10, 9);
    expect(cows.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // voli mají přednost na pastvě
    expect(winterTargets(s, { oxen: 4, hayKg: Infinity }).sheep).toBeCloseTo(10, 9);
    // seno na zimu jen pro 10 ovcí (po ztrátách ve stohu) – kozy a krávy jen chovný pár
    const hayFor10 = (10 * 151) / winterHayAvailable(1);
    const hay = winterTargets(s, { oxen: 0, hayKg: hayFor10 });
    expect(hay.sheep).toBeCloseTo(10, 9);
    expect(hay.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(hay.cow).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // bez sena zůstane chovný pár
    expect(winterTargets(s, { oxen: 0, hayKg: 0 }).cow).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // pasáci uhlídali polovinu – zbytek jde na maso (krávám zbude pastva na 3)
    const half = winterTargets(s, { oxen: 0, hayKg: Infinity, herding: 0.5 });
    expect(half).toEqual(herds({ sheep: 10, goat: 5, pig: 3, cow: 3 }));
  });

  it('kozy spasou i zarůstající příloh – křoviny a mladý les, kam ovce ani krávy nejdou', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 4, forestHa: 3 };
    s.parts = [
      part(1, { state: 'fallow', fallowSinceDay: at(590, 9, 1), overgrowthYears: 6 }),
      part(2, { state: 'fallow', fallowSinceDay: at(595, 9, 1) }),
    ];
    expect(goatBrowseHa(s)).toBeCloseTo(1, 9);
    s.livestock!.herds = herds({ sheep: 20, goat: 10 });
    const keep = winterTargets(s, { oxen: 0, hayKg: Infinity });
    // louka 4 − 1 ha křovin, které už pastvou nejsou: ovce 3 ha (15 kusů), kozy jen 1 ha křovin
    expect(pastureHa(s)).toBeCloseTo(3, 9);
    expect(keep.sheep).toBeCloseTo(15, 9);
    expect(keep.goat).toBeCloseTo(5, 9);
  });

  it('za rok uhyne podíl stáda – ovce 12 %, kozy 10 %, prasata 12 %, skot 6 %', () => {
    const s = village();
    s.livestock!.herds = herds({ sheep: 100, goat: 100, pig: 100, cow: 100 });
    s.livestock!.young = herds({ sheep: 10 });
    for (let i = 0; i < 365; i++) herdLosses(s);
    expect(s.livestock!.herds.sheep).toBeCloseTo(88, 6);
    expect(s.livestock!.herds.goat).toBeCloseTo(90, 6);
    expect(s.livestock!.herds.pig).toBeCloseTo(88, 6);
    expect(s.livestock!.herds.cow).toBeCloseTo(94, 6);
    expect(s.livestock!.young.sheep).toBeCloseTo(8.8, 6);
    // stálé stádo dá mláďaty po ztrátách maso: ovce (1,4 × 0,88 − 1) × 15 kg
    expect(yearlyMeatPerHead('sheep')).toBeCloseTo((1.4 * 0.88 - 1) * 15, 9);
  });
});

describe('chovné stádo podle potřeby (Martin 19. 10. 2026)', () => {
  it('zmenší se na bílkoviny, které ves potřebuje, a čtvrtinu navíc – ovce napřed, prasata naposled', () => {
    const s = village(at(600, 11, 1));
    const day = at(600, 11, 1);
    const keep = herds({ sheep: 6, goat: 2, pig: 18, cow: 3 });
    const sized = sizeHerdsToNeed(s, day, keep);
    const required = herdProteinNeed(s, day) * (1 + LIVESTOCK.needReserve);
    expect(BREEDING_ORDER).toEqual(['sheep', 'goat', 'cow', 'pig']);
    expect(sized.sufficient).toBe(true);
    // chovné páry, pak ovce, kozy a krávy celé; prasata jen na zbytek potřeby
    expect(sized.keep.sheep).toBeCloseTo(6, 9);
    expect(sized.keep.goat).toBeCloseTo(2, 9);
    expect(sized.keep.cow).toBeCloseTo(3, 9);
    const withoutPigs =
      6 * proteinPerHead('sheep') + 2 * proteinPerHead('goat') + 3 * proteinPerHead('cow');
    expect(sized.keep.pig).toBeCloseTo((required - withoutPigs) / proteinPerHead('pig'), 9);
    expect(sized.keep.pig).toBeLessThan(18);
  });

  it('krávy na mléko a voly zůstanou, i když potřebu pokryjí ovce', () => {
    const s = village(at(600, 11, 1));
    const day = at(600, 11, 1);
    const sized = sizeHerdsToNeed(s, day, herds({ sheep: 500, goat: 9, pig: 9, cow: 6 }), 4);
    expect(sized.keep.cow).toBeCloseTo(4, 9);
    expect(sized.keep.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(sized.keep.pig).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(sized.keep.sheep).toBeLessThan(500);
    // stádo pod potřebou se nezvětší nad nosnost
    const small = sizeHerdsToNeed(s, day, herds({ sheep: 3, pig: 1 }));
    expect(small.sufficient).toBe(false);
    expect(small.keep).toEqual(herds({ sheep: 3, pig: 1 }));
  });
});

describe('porážka (1. 11.)', () => {
  it('na maso jde, co přeroste nosnost – výtěžnost podle druhu, práce 1 čd na 20 kg', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 1000, forestHa: 2 };
    s.livestock!.herds = herds({ pig: 6 });
    s.meatKg = 10_000; // masa dost – mláďata navíc nejdou
    const event = slaughter(s, at(600, 11, 1), { oxen: 0, hayKg: 0 });
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
    slaughter(s, at(600, 11, 1), { oxen: 0, hayKg: Infinity });
    // polovina mláďat prasat (50 kg) nepokryje potřebu – i polovina jehňat
    expect(s.livestock!.herds.pig).toBeCloseTo(3, 9);
    expect(s.livestock!.herds.sheep).toBeCloseTo(5, 9);
    expect(s.livestock!.young).toEqual(herds({}));
  });

  it('chovné stádo nad potřebu jde na maso i s dospělými kusy – jednou, pak už jen mláďata', () => {
    const s = village(at(600, 11, 1));
    const day = at(600, 11, 1);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 40, sheep: 6, cow: 3 });
    s.livestock!.young = herds({ pig: 20, sheep: 2, cow: 0.5 });
    s.meatKg = 0;
    const kept = sizeHerdsToNeed(s, day, herds({ pig: 40, sheep: 6, cow: 3 })).keep;
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    expect(s.livestock!.herds.pig).toBeCloseTo(kept.pig, 9);
    // i dospělá prasata – víc než letošní mláďata
    expect(40 - kept.pig).toBeGreaterThan(20);
    expect(event).toMatchObject({ kind: 'slaughter', kg: Math.round((40 - kept.pig) * 50) });
    expect(s.livestock!.herds.sheep).toBeCloseTo(6, 9);
    expect(s.livestock!.herds.cow).toBeCloseTo(3, 9);
  });

  it('chovný pár zůstane, i když nosnost nic neunese', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.land = { meadowHa: 0, forestHa: 0 };
    s.livestock!.herds = herds({ sheep: 5, pig: 1, cow: 3 });
    s.meatKg = 10_000;
    slaughter(s, at(600, 11, 1), { oxen: 0, hayKg: 0 });
    expect(s.livestock!.herds).toEqual(herds({ sheep: 2, pig: 1, cow: 2 }));
  });
});

describe('zimní úhyn (1. 3.)', () => {
  it('pod polovinou sena se stádo zmenší na tolik, kolik by polovinu mělo – chovný pár přežije', () => {
    const s = village(at(601, 3, 1));
    s.livestock!.herds = herds({ sheep: 20, goat: 3, pig: 8, cow: 6 });
    expect(starveHerds(s, at(601, 3, 1), 0.6)).toBeNull();
    const event = starveHerds(s, at(601, 3, 1), 0.25);
    // čtvrtina sena = polovina kusů přežije; prasata seno nežerou
    expect(s.livestock!.herds).toEqual(herds({ sheep: 10, goat: 2, pig: 8, cow: 3 }));
    expect(event).toEqual({
      day: at(601, 3, 1),
      kind: 'herd-starved',
      animals: { sheep: 10, goat: 1, cow: 3 },
    });
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
    expect(chunked.hay).toEqual(whole.hay);
    expect(chunked.chronicle).toEqual(whole.chronicle);
    expect(chunked.diet).toEqual(whole.diet);
  });
});
