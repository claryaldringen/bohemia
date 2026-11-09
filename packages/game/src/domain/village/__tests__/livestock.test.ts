import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { PROTEIN } from '../diet';
import { hayLeftAvailable, hayWinterDaysLeft, winterHayAvailable } from '../hay';
import { mergeHaySlaughter } from '../husbandry';
import { youngsterHerders } from '../herding';
import { predationDay } from '../predators';
import { HERD_BREEDING } from '../rules';
import { WILDLIFE_LAND } from '../rules-wildlife';
import {
  LIVESTOCK,
  goatBrowseHa,
  grazingDemandHa,
  herdBirths,
  herdLosses,
  herdProteinNeed,
  meatEatableKg,
  meatNeedPerYear,
  proteinBudget,
  pastureHa,
  pigForestHa,
  retiringHeads,
  sizeHerdsToNeed,
  slaughter,
  hayShortSlaughter,
  startingHerds,
  villageChickens,
  winterTargets,
  withLivestock,
  yearlyMeatPerHead,
} from '../livestock';
import { advanceVillage } from '../simulate';
import { freshWildlife } from '../wildlife';
import type { ChronicleEvent, FieldPart, HerdSpecies, VillageState } from '../types';
import { withBuiltFirstDwelling, withRoomyPens } from './village-fixtures';

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

/** Děti v prvním domě, které budou mít v den `day` daný věk (let). */
function addChildren(s: VillageState, ages: readonly number[], day: number): void {
  const home = s.people[0]!.dwellingId;
  for (const age of ages) {
    s.people.push({
      id: s.nextId++,
      bornDay: day - Math.round(age * 365.25),
      dwellingId: home,
      sex: s.nextId % 2 === 0 ? 'male' : 'female',
    });
  }
}

/** Stádo, které ves nechala přes zimu – bez kusů čekajících na zimní porážku. */
function kept(s: VillageState): Record<HerdSpecies, number> {
  const h = s.livestock!.herds;
  const c = s.livestock!.culling;
  return herds({
    sheep: h.sheep - (c?.sheep ?? 0),
    goat: h.goat - (c?.goat ?? 0),
    pig: h.pig - (c?.pig ?? 0),
    cow: h.cow - (c?.cow ?? 0),
  });
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
    // osadníci (2 dospělí, 2 děti) mají ovcí na vlnu pro oděv všech – 4,8 kg ÷ 0,8 kg (Oděv)
    expect(s.livestock!.herds).toEqual({ ...startingHerds(1), sheep: 6 });
    expect(villageChickens(s)).toBe(2);
  });

  it('ves uložená před dobytkem dostane výchozí stádo z domácností při dopočtu', () => {
    const s = village();
    delete s.livestock;
    delete s.meatKg;
    // bez medvěda (bere prasata absolutně, wildlife.md – Vlci na dobytku): test hlídá výchozí stádo
    s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 2);
    s.wildlife.bear = { present: false, backDay: null };
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
  it('na jaře rodí každá chovná samice – mláďata = samice × odchovaná mláďata na samici', () => {
    const s = village();
    const before = herds({ sheep: 10, goat: 5, pig: 4, cow: 5 });
    s.livestock!.herds = { ...before };
    herdBirths(s);
    const { femaleShare, youngPerDam } = HERD_BREEDING;
    for (const species of ['sheep', 'goat', 'pig', 'cow'] as const) {
      const young = before[species] * femaleShare[species] * youngPerDam[species];
      expect(LIVESTOCK.growth[species]).toBeCloseTo(femaleShare[species] * youngPerDam[species], 9);
      expect(s.livestock!.young[species]).toBeCloseTo(young, 9);
      expect(s.livestock!.herds[species]).toBeCloseTo(before[species] + young, 9);
    }
    // ovce +64 %, kozy +78 %, prasata +144 %, krávy +40 % (dřív 40 / 40 / 100 / 20 %)
    expect(LIVESTOCK.growth.sheep).toBeCloseTo(0.644, 9);
    expect(LIVESTOCK.growth.goat).toBeCloseTo(0.784, 9);
    expect(LIVESTOCK.growth.pig).toBeCloseTo(1.44, 9);
    expect(LIVESTOCK.growth.cow).toBeCloseTo(0.4, 9);
  });

  it('porody nejsou omezené výrostky – rodí i stádo, které nikdo nepase', () => {
    const s = village();
    // bez dětí – výrostci nebudou
    s.people = s.people.slice(0, 2);
    expect(youngsterHerders(s, s.lastDay)).toBe(0);
    s.livestock!.herds = herds({ sheep: 80, pig: 50, cow: 20 });
    herdBirths(s);
    expect(s.livestock!.young.sheep).toBeCloseTo(80 * LIVESTOCK.growth.sheep, 9);
    expect(s.livestock!.young.pig).toBeCloseTo(50 * LIVESTOCK.growth.pig, 9);
    expect(s.livestock!.young.cow).toBeCloseTo(20 * LIVESTOCK.growth.cow, 9);
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
    expect(pastureHa(s, s.lastDay)).toBeCloseTo(20, 9);
    // les 10 − dva díly založené v lese
    expect(pigForestHa(s)).toBeCloseTo(8, 9);
    expect(grazingDemandHa(herds({ sheep: 5, goat: 5, cow: 2 }), 2)).toBeCloseTo(6, 9);
  });

  it('přes zimu pastva, seno i pasáci podle přednosti – voli, krávy, ovce, kozy, prasata (24. 10. 2026)', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 6, forestHa: 3 };
    s.livestock!.herds = herds({ sheep: 20, goat: 10, pig: 10, cow: 6 });
    const keep = winterTargets(s, s.lastDay, { oxen: 0, hayKg: Infinity });
    // prasata podle lesa (celý rok v lese)
    expect(keep.pig).toBeCloseTo(3, 9);
    // pastva 6 ha: krávy napřed (6 × 1 ha), ovcím a kozám nic – chovný pár zůstane
    expect(keep.cow).toBeCloseTo(6, 9);
    expect(keep.sheep).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(keep.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // voli mají přednost na pastvě
    expect(winterTargets(s, s.lastDay, { oxen: 4, hayKg: Infinity }).cow).toBeCloseTo(2, 9);
    // víc pastvy: ovce před kozami
    s.livestock!.land = { meadowHa: 9, forestHa: 3 };
    const more = winterTargets(s, s.lastDay, { oxen: 0, hayKg: Infinity });
    expect(more).toEqual(herds({ sheep: 15, goat: LIVESTOCK.breedingMin, pig: 3, cow: 6 }));
    // seno na zimu jen pro 3 krávy (po ztrátách ve stohu) – ovce a kozy jen chovný pár
    const hayFor3 = (3 * 5 * 151) / winterHayAvailable(1);
    const hay = winterTargets(s, s.lastDay, { oxen: 0, hayKg: hayFor3 });
    expect(hay.cow).toBeCloseTo(3, 9);
    expect(hay.sheep).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(hay.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    // bez sena zůstane chovný pár
    expect(winterTargets(s, s.lastDay, { oxen: 0, hayKg: 0 }).cow).toBeCloseTo(
      LIVESTOCK.breedingMin,
      9,
    );
    // pasáci uhlídali polovinu potřeby (0,65 pasáka): krávy napřed (0,15), ovce 0,175 z 0,2,
    // kozám a prasatům nic – chovný pár zůstane
    s.livestock!.land = { meadowHa: 100, forestHa: 100 };
    const half = winterTargets(s, s.lastDay, { oxen: 0, hayKg: Infinity, herding: 0.5 });
    expect(half.cow).toBeCloseTo(6, 9);
    expect(half.sheep).toBeCloseTo(17.5, 9);
    expect(half.goat).toBeCloseTo(LIVESTOCK.breedingMin, 9);
    expect(half.pig).toBeCloseTo(LIVESTOCK.breedingMin, 9);
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
    const keep = winterTargets(s, s.lastDay, { oxen: 0, hayKg: Infinity });
    // louka 4 − 1 ha křovin, které už pastvou nejsou: ovce 3 ha (15 kusů), kozy jen 1 ha křovin
    expect(pastureHa(s, s.lastDay)).toBeCloseTo(3, 9);
    expect(keep.sheep).toBeCloseTo(15, 9);
    expect(keep.goat).toBeCloseTo(5, 9);
  });

  it('za rok uhyne podíl stáda – ovce 12 %, kozy 10 %, prasata 12 %, skot 6 %', () => {
    const s = village();
    s.livestock!.herds = herds({ sheep: 100, goat: 100, pig: 100, cow: 100 });
    s.livestock!.young = herds({ sheep: 10 });
    // základ + vlčí díl při plné smečce (ves bez zvěře má 5 vlků); rok od 1. 1.
    for (let i = 0; i < 365; i++) {
      herdLosses(s);
      predationDay(s, at(600, 1, 1) + i);
    }
    expect(s.livestock!.herds.sheep).toBeCloseTo(88, 6);
    expect(s.livestock!.herds.goat).toBeCloseTo(90, 6);
    expect(s.livestock!.herds.pig).toBeCloseTo(88, 6);
    expect(s.livestock!.herds.cow).toBeCloseTo(94, 6);
    expect(s.livestock!.young.sheep).toBeCloseTo(8.8, 6);
    // stálé stádo dá mláďaty po ztrátách maso: ovce ((1 + růst) × 0,88 − 1) × 15 kg
    expect(yearlyMeatPerHead('sheep')).toBeCloseTo(
      ((1 + LIVESTOCK.growth.sheep) * 0.88 - 1) * 15,
      9,
    );
  });
});

describe('chovné stádo podle potřeby (Martin 19. 10. 2026)', () => {
  it('celé stádo v nosnosti zůstane – cena jídla ho nezmenšuje (24. 10. 2026)', () => {
    const s = village(at(600, 11, 1));
    const day = at(600, 11, 1);
    const keep = herds({ sheep: 60, goat: 6, pig: 60, cow: 8 });
    const sized = sizeHerdsToNeed(s, day, keep);
    expect(sized.keep).toEqual(keep);
    expect(sized.coverage).toBeGreaterThan(0);
    expect(herdProteinNeed(s, day)).toBeGreaterThan(0);
    // stádo pod potřebou se nezvětší nad nosnost (luštěniny z pole ves nepěstuje – 9. 11. 2026)
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
    // polovina mláďat prasat (50 kg) nepokryje potřebu – i polovina jehňat; přes zimu ves nechá
    // jen mladší kusy (staré jdou na maso – čtvrtina prasnic, osmina ovcí)
    expect(kept(s).pig).toBeCloseTo(3, 9);
    expect(kept(s).sheep).toBeCloseTo(5, 9);
    expect(s.livestock!.young).toEqual(herds({}));
    // kusy na maso čekají na zimní porážku – ves je sní čerstvé
    expect(s.livestock!.culling).toEqual(herds({ pig: 1, sheep: 1 }));
  });

  it('stádo v nosnosti zůstane celé – na maso jen staré kusy (24. 10. 2026)', () => {
    const s = village(at(600, 11, 1));
    const day = at(600, 11, 1);
    // výrostků dost – stádo neomezí místo pro mláďata
    addChildren(s, [8, 8, 9, 9, 10, 10], day);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 40, sheep: 6, cow: 3 });
    s.livestock!.young = herds({ pig: 20, sheep: 2, cow: 0.5 });
    s.meatKg = 0;
    const old = retiringHeads(s.livestock!.herds, s.livestock!.young);
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    expect(event).toMatchObject({ kind: 'slaughter' });
    expect(kept(s).pig).toBeCloseTo(40 - old.pig, 9);
    expect(kept(s).sheep).toBeCloseTo(6 - old.sheep, 9);
    expect(kept(s).cow).toBeCloseTo(3 - old.cow, 9);
  });

  it('stádo v nosnosti porážka nezredukuje nad to, co ves sní – staré kusy jdou na maso vždy', () => {
    // vesničané se snaží vyrobit co nejvíc jídla: prasata uživí les a práci nestojí (Martin);
    // staré kusy ale na maso jdou, i když se maso nestihne sníst (Martin 19. 10. 2026)
    const day = at(600, 11, 1);
    const s = village(day);
    addChildren(s, [8, 8, 9, 9, 10, 10, 11, 11], day);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 60, sheep: 6 });
    s.meatKg = 100;
    const old = retiringHeads(s.livestock!.herds, s.livestock!.young);
    expect(old.pig).toBeCloseTo(15, 9);
    const oldMeat = old.pig * LIVESTOCK.meatKg.pig + old.sheep * LIVESTOCK.meatKg.sheep;
    // staré kusy dají víc masa, než ves do 31. 8. sní
    expect(oldMeat + 100).toBeGreaterThan(meatEatableKg(s, day));
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    expect(event).toMatchObject({ kind: 'slaughter', kg: Math.round(oldMeat) });
    // nic víc – zbytek v nosnosti žije
    expect(kept(s).pig).toBeCloseTo(60 - old.pig, 6);
    expect(kept(s).sheep).toBeCloseTo(6 - old.sheep, 6);
  });

  it('prasata, která uživí les, porážka nesníží na pár, když na ně výrostci stačí (Vlkov)', () => {
    // Vlkov 1. 11. 792: 65 ovcí (38 na vlnu), 83 prasat, les asi pro 53 – dřív plán podle dnešních
    // výrostků nechal jen chovný pár prasat; příští léto tu výrostci stáda i s mláďaty uhlídají
    const day = at(600, 11, 1);
    const s = village(day);
    addChildren(s, [7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12], day);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ pig: 83, sheep: 65, goat: 4, cow: 2 });
    s.livestock!.herding = { needDays: 100, watchedDays: 90 };
    slaughter(s, day, { oxen: 0, hayKg: Infinity, minSheep: 38 });
    expect(kept(s).pig).toBeGreaterThan(40);
    expect(kept(s).sheep).toBeGreaterThan(38);
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

describe('porážka při nedostatku sena (24. 10. 2026)', () => {
  it('seno do jara nevystačí – ves hned porazí kusy, na které nezbude (kozy, ovce, krávy); chovný pár zůstane', () => {
    const day = at(601, 2, 1);
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20, goat: 3, pig: 8, cow: 6 });
    const days = hayWinterDaysLeft(day);
    expect(days).toBe(59);
    // seno dost – nic
    s.hay = { kg: 10_000, mowing: null };
    expect(hayShortSlaughter(s, day, 0)).toBeNull();
    // seno na 4,5 krávy do konce března: krávy napřed (celé kusy – 1 navíc), ovcím a kozám nic
    s.hay.kg = (4.5 * 5 * days) / hayLeftAvailable(1, days);
    const event = hayShortSlaughter(s, day, 0);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 2, goat: 2, pig: 8, cow: 5 }));
    expect(event).toEqual({
      day,
      kind: 'hay-slaughter',
      kg: 120 + 18 * 15 + 12,
      animals: { cow: 1, sheep: 18, goat: 1 },
    });
    expect(s.meatKg).toBeCloseTo(402, 9);
    // voli jedí napřed – bez sena na krávy zůstane chovný pár
    expect(hayShortSlaughter(s, day, 5)).toMatchObject({ animals: { cow: 3 } });
    expect(s.livestock!.herds.cow).toBe(2);
  });
});

describe('zlé roky – bez úniku budoucnosti (disasters.md – Kdy je vidět)', () => {
  it('v lednu dlouhé zimy se poráží stejně jako v normální (dlouhá zima ještě není vidět)', () => {
    const day = at(601, 1, 10);
    const run = (winter: 'normal' | 'long'): Record<HerdSpecies, number> => {
      const s = village(day);
      s.disasters = { override: { weather: { 601: { winter } } } };
      s.livestock!.herds = herds({ sheep: 20, goat: 3, pig: 8, cow: 6 });
      s.hay = { kg: 3_000, mowing: null };
      hayShortSlaughter(s, day, 0);
      return s.livestock!.herds;
    };
    expect(run('long')).toEqual(run('normal'));
    // od 1. 3. už se počítá s krmením do konce dubna – poráží se víc
    const march = at(601, 3, 5);
    const cut = (winter: 'normal' | 'long'): number => {
      const s = village(march);
      s.disasters = { override: { weather: { 601: { winter } } } };
      s.livestock!.herds = herds({ sheep: 20, goat: 3, pig: 8, cow: 6 });
      s.hay = { kg: 1_500, mowing: null };
      hayShortSlaughter(s, march, 0);
      const h = s.livestock!.herds;
      return h.sheep + h.goat + h.cow;
    };
    expect(cut('long')).toBeLessThan(cut('normal'));
  });

  it('pastva od 1. 9. nepočítá s právě minulým létem (sucho minulého léta ji 1. 11. nesráží)', () => {
    const s = village(at(601, 8, 20));
    s.livestock!.land = { meadowHa: 20, forestHa: 10 };
    s.disasters = { override: { weather: { 601: { summer: 'drought' } } } };
    expect(pastureHa(s, at(601, 8, 20))).toBeLessThan(20);
    expect(pastureHa(s, at(601, 9, 1))).toBeCloseTo(20, 9);
    expect(pastureHa(s, at(601, 11, 1))).toBeCloseTo(20, 9);
  });
});

describe('simulace – stáda za rok', () => {
  it('startovní ves: na jaře mláďata, v listopadu porážka a maso v zásobě, vejce celý rok', () => {
    // ohrady všech druhů – stáda neomezí místa na noc (oxen.md – Ohrady podle druhu)
    const s = withRoomyPens(village(at(600, 3, 1)));
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

describe('kronika porážky pro nedostatek sena', () => {
  it('další porážky téže zimy se sečtou do posledního zápisu', () => {
    const s = { chronicle: [] as ChronicleEvent[] } as VillageState;
    const events: ChronicleEvent[] = [];
    mergeHaySlaughter(s, { day: 100, kind: 'hay-slaughter', kg: 120, animals: { cow: 1 } }, events);
    s.chronicle.push(...events.splice(0));
    mergeHaySlaughter(
      s,
      { day: 101, kind: 'hay-slaughter', kg: 240, animals: { cow: 2, goat: 1 } },
      events,
    );
    expect(events).toEqual([]);
    expect(s.chronicle).toEqual([
      { day: 100, kind: 'hay-slaughter', kg: 360, animals: { cow: 3, goat: 1 } },
    ]);
    // jiná zima = nový zápis
    mergeHaySlaughter(
      s,
      { day: 100 + 365, kind: 'hay-slaughter', kg: 10, animals: { cow: 1 } },
      events,
    );
    expect(events).toHaveLength(1);
  });
});
