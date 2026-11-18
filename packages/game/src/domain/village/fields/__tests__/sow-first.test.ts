import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { ageGroup } from '../../people/people';
import { hungerSplit, rationShares } from '../../people/hunger-groups';
import { HUNGER_PRIORITY, SEED_STORES, STARVATION } from '../../rules';
import { craftCoverage } from '../../crafts/crafts';
import { eatDiet, grainAheadForOutlookKg, grainKeepPerDay } from '../../core/diet';
import { dayMealInput } from '../../livestock/emergency-slaughter';
import { baseMealInput } from '../../core/meal-input';
import {
  foodUntilHarvestKg,
  seedKeepKg,
  settleSowingSeed,
  sowableSeedKg,
  sowingSeedDay,
  sowingWindowCrop,
  uneatenSeedKg,
  windowSeedNeedKg,
  workSeedKg,
} from '../seed';
import { advanceVillage } from '../../core/simulate';
import type { Dwelling, VillageState } from '../../types';
import { villageYearRow } from '../../core/year-log';
import { withoutSmallGame } from '../../__tests__/village-fixtures';
import { createCropWork, seasonCrops, sownShare } from '../../core/year-plan';

// Osev má přednost (fields.md – Úroda, Osivo ze zásob; Martin 6. 11. 2026: „Musí zasít – jinak by
// si prožrala budoucnost.“): ves si do žní nechá jen přežívací zásobu (`seedKeepKg`) a ostatní zrno
// je osivo – oře a seje, dokud trvá okno, dokud není osetá plocha v plánu, nebo dokud nedojde
// osivo; zbytek zůstane v zásobách.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** Ves s 20 hotovými díly po 0,25 ha, bez staveb, osiva zakladatelů a mimo hájení. */
function village(storesKg: number): VillageState {
  const parts: PartInput[] = Array.from({ length: 20 }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = at(600, 8, 31);
  s.storesKg = storesKg;
  // mimo hájení (population.md) – hlad by jinak nezabíjel a test by nic neověřil
  s.foundedDay = at(500, 1, 1);
  delete s.reservedSeedKg;
  delete s.reservedSeedUntilDay;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Osivo, které plány hospodářského roku vzaly (kg obilí, bez lnu). */
function seedTakenKg(s: VillageState): number {
  let kg = 0;
  for (const { crop, work } of seasonCrops(s.season!)) {
    if (crop !== 'flax') kg += work.seedKg ?? 0;
  }
  return kg;
}

/** Nejnižší práh úmrtí hladem skupin ve vsi bez rezervy (dny). */
function hungerLimit(s: VillageState, day: number): number {
  const groups = s.people.map((p) => STARVATION.threshold[ageGroup(p, day)]);
  return Math.min(...groups) - SEED_STORES.marginDays;
}

describe('osev má přednost (fields.md – Osivo ze zásob; Martin 6. 11. 2026)', () => {
  const START = at(600, 9, 1);

  it('přežívací zásoba ze stravy: příděl do žní drží hlad pod prahem, víc s hladem a s osivem jen na setí', () => {
    const s = advanceVillage(village(50_000), START, null);
    const keep = seedKeepKg(s, START);
    expect(keep).toBeGreaterThan(0);
    // s přežívací zásobou dá výhled do žní (celá strava) příděl pod STARVATION.fedFrom – ves
    // hladoví, ale nahromaděný hlad do žní nedojde k prahu nejcitlivější skupiny bez rezervy
    const input = baseMealInput(s, START, craftCoverage(s, START).pottery, 1);
    const target = STARVATION.fedFrom * (1 - hungerLimit(s, START) / input.daysToHarvest);
    const ahead = grainAheadForOutlookKg(input, target);
    // obrácený výhled: s tímhle zrnem dá jídlo dne právě cílový příděl
    const grainKg = (ahead - (input.sheavesGrainKg ?? 0)) / grainKeepPerDay(input);
    expect(eatDiet({ ...input, grainKg }).outlook).toBeCloseTo(target, 6);
    // přežívací zásoba (zásoby ze včerejška) je větší o dnešní ztrátu skladováním – ztráty do žní
    // zná už výhled (fields.md – Přídělový systém): příděl pod plný, aspoň cílový (bez zaokrouhlení)
    expect(keep).toBeGreaterThan(ahead);
    const outlook = eatDiet({ ...input, grainKg: keep }).outlook;
    expect(outlook).toBeLessThan(1);
    expect(outlook).toBeGreaterThan(target - 1e-9);
    // nahromaděný hlad ves zná – s ním si nechá víc; s osivem jen na setí nejvýš do prahu, od
    // kterého by ho ves snědla (SEED_BUYING)
    expect(seedKeepKg({ ...s, starvationDays: 6 }, START)).toBeGreaterThan(keep);
    expect(seedKeepKg({ ...s, reservedSeedKg: 100 }, START)).toBeGreaterThan(keep);
    // ves bez lidí si nic nenechá
    expect(seedKeepKg({ ...s, people: [] }, START)).toBe(0);
  });

  it('ves s mlékem a masem si nechá méně zrna a oseje víc – hlad do žní pod prahem', () => {
    const s = advanceVillage(village(50_000), START, null);
    // bez stád a masa – jí jen z pole (a vejce nemá)
    const bare = structuredClone(s);
    delete bare.livestock;
    bare.meatKg = 0;
    const fed = structuredClone(s);
    fed.meatKg = 300;
    // bez hromady osiva okna (1. 9.) – jen zrno nad přežívací zásobu
    delete bare.sowingSeed;
    delete fed.sowingSeed;
    const keepBare = seedKeepKg(bare, START);
    const keepFed = seedKeepKg(fed, START);
    expect(keepFed).toBeLessThan(keepBare);
    // zrno nad přežívací zásobu smí do země – ves s mlékem a masem ho má víc
    const stores = keepBare + 200;
    expect(sowableSeedKg({ ...fed, storesKg: stores }, 'grain', keepFed)).toBeCloseTo(
      sowableSeedKg({ ...bare, storesKg: stores }, 'grain', keepBare) + keepBare - keepFed,
      6,
    );
    // ves s mlékem a masem a zrnem jen na přežívací zásobu a osivo dojde do žní bez úmrtí hladem
    const planned = advanceVillage({ ...village(0), meatKg: 300 }, START, null);
    const floor = windowSeedNeedKg(planned, 'winter');
    let v: VillageState = { ...planned, storesKg: seedKeepKg(planned, START) + floor };
    let maxHunger = 0;
    for (let day = START + 5; day <= at(601, 8, 31); day += 5) {
      v = advanceVillage(v, day, null);
      maxHunger = Math.max(maxHunger, v.starvationDays ?? 0);
    }
    expect(maxHunger).toBeLessThanOrEqual(hungerLimit(planned, START) + 1e-6);
    const deaths = v.chronicle.filter(
      (e) => e.day > START && e.kind === 'death' && e.cause === 'hunger',
    );
    expect(deaths).toEqual([]);
  }, 120_000);

  it('nezaseté osivo se na konci okna setí vrátí do zásob jako obyčejné zrno', () => {
    const s = village(5_000);
    const parts = s.parts.slice(0, 4);
    const work = createCropWork(parts, at(600, 9, 15), 0, false, undefined, 'winter');
    for (const p of parts) p.state = 'sown';
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    // zaseta polovina, osivo vzato jen na ni
    work.done.sow = work.required.sow / 2;
    work.seedKg = workSeedKg(work, byId, 'winter') / 2;
    s.season = { startDay: START, crops: [{ crop: 'winter', ...work }] };
    s.sowingSeed = { crop: 'winter', totalKg: 2 * work.seedKg, days: 61, kg: work.seedKg };
    // poslední den okna ozimu ves nezasetou polovinu nejí, po práci dne se vrátí do jídla
    const lastDay = at(600, 10, 31);
    expect(sowingWindowCrop(s, lastDay)).toBe('winter');
    expect(uneatenSeedKg(s)).toBeCloseTo(work.seedKg, 6);
    settleSowingSeed(s, lastDay);
    expect(uneatenSeedKg(s)).toBe(0);
    // den po okně drží ves zimní osivo na jarní díly (fields.md – Zimní osivo) – jí jen zbytek
    expect(sowingWindowCrop(s, lastDay + 1)).toBeNull();
    sowingSeedDay(s, lastDay + 1);
    expect(s.sowingSeed?.beforeWindow).toBe(true);
    expect(dayMealInput(s, lastDay + 1, 0, 1).grainKg).toBeCloseTo(
      s.storesKg - s.sowingSeed!.kg,
      6,
    );
    // jař: okno do konce dubna (bez dlouhé zimy), mimo okna nic
    expect(sowingWindowCrop(s, at(601, 4, 30))).toBe('spring');
    expect(sowingWindowCrop(s, at(601, 5, 1))).toBeNull();
    expect(sowingWindowCrop(s, at(601, 2, 28))).toBeNull();
    expect(sowingWindowCrop(s, at(600, 11, 1))).toBeNull();
  });

  it('ves s málem zrna oseje víc než dřív a nikdo do žní neumře hlady', () => {
    // plán bez zásob – osivo na třetinu dílů na řadě v okně ozimu (ves s málem zrna)
    const planned = advanceVillage(village(0), START, null);
    const floor = windowSeedNeedKg(planned, 'winter') / 3;
    expect(floor).toBeGreaterThan(0);
    // zásoby na rok do žní a osivo dílů na řadě – past osiva (dřív: osivo do roční potřeby z úrody
    // bez ztrát a nad ni jen zrno nad celý příděl do žní)
    const food = foodUntilHarvestKg(planned, START);
    const s: VillageState = { ...planned, storesKg: food + floor };
    const before = Math.max(s.storesKg - food, Math.min(floor, s.storesKg - 0.5 * food));
    const now = sowableSeedKg(s, 'grain', seedKeepKg(s, START));
    expect(now).toBeCloseTo(s.storesKg - seedKeepKg(s, START), 6);
    expect(now).toBeGreaterThan(before);
    let v = s;
    let maxHunger = 0;
    let sown = 0;
    for (let day = START + 5; day <= at(601, 8, 31); day += 5) {
      v = advanceVillage(v, day, null);
      maxHunger = Math.max(maxHunger, v.starvationDays ?? 0);
      if (v.season && v.season.startDay === START) sown = Math.max(sown, seedTakenKg(v));
    }
    // oseje víc, než dřív smělo do země
    expect(sown).toBeGreaterThan(before);
    // hladová, ale nikdo hlady neumřel – nahromaděný hlad pod prahem nejcitlivější skupiny
    expect(maxHunger).toBeLessThanOrEqual(hungerLimit(s, START) + 1e-6);
    const hungerDeaths = v.chronicle.filter(
      (e) => e.day > START && e.kind === 'death' && e.cause === 'hunger',
    );
    expect(hungerDeaths).toEqual([]);
  }, 120_000);

  it('ves s dostatkem zrna seje, dokud stačí práce a okno – osivo jen na zasetý podíl, zbytek zůstane', () => {
    const s = advanceVillage(village(50_000), at(601, 5, 2), null);
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    let plan = 0;
    let unsown = 0;
    for (const { crop, work } of seasonCrops(s.season!)) {
      if (crop === 'flax' || work.seedKg === undefined) continue;
      // jař (okno do konce dubna) zasetá, kolik stačila práce – ves bere všechny díly na řadě
      if (crop !== 'winter') expect(sownShare(work)).toBeGreaterThan(0.8);
      // osivo vzal jen zasetý podíl – ostatní zrno zůstalo v zásobách
      const total = workSeedKg(work, byId, crop);
      expect(work.seedKg).toBeCloseTo(sownShare(work) * total, 6);
      plan += work.seedKg;
      unsown += total - work.seedKg;
    }
    expect(plan).toBeGreaterThan(0);
    // osivo nebylo mezí – ves ho drží nejvýš na nezasetý podíl plánů, zbytek je jídlo
    const keep = seedKeepKg(s, at(601, 5, 2));
    expect(uneatenSeedKg(s)).toBeLessThanOrEqual(unsown + 1e-6);
    expect(s.storesKg - unsown).toBeGreaterThan(keep);
  }, 120_000);

  it('dopočet po kouscích dá totéž jako najednou (ves s málem zrna)', () => {
    const planned = advanceVillage(village(0), START, null);
    const food = foodUntilHarvestKg(planned, START);
    const s: VillageState = { ...planned, storesKg: food + windowSeedNeedKg(planned, 'winter') };
    const end = at(601, 5, 10);
    const whole = advanceVillage(s, end, null);
    let pieces = s;
    for (const day of [at(600, 9, 20), at(600, 10, 7), at(600, 12, 31), at(601, 3, 11), end]) {
      pieces = JSON.parse(JSON.stringify(advanceVillage(pieces, day, null))) as VillageState;
    }
    expect(pieces).toEqual(JSON.parse(JSON.stringify(whole)));
  }, 120_000);

  it('deník: oseto jen skutečně zasetý podíl, ne díly vybrané do plánu', () => {
    const s = village(0);
    const end = at(600, 12, 31);
    const parts = s.parts.slice(0, 4);
    const work = createCropWork(parts, at(600, 9, 15), 0, false, undefined, 'winter');
    for (const p of parts) p.state = 'sown';
    work.done.sow = work.required.sow / 2;
    s.season = { startDay: START, crops: [{ crop: 'winter', ...work }] };
    s.lastDay = end;
    // 4 díly po 0,25 ha ve stavu `sown`, zaseta polovina práce
    expect(villageYearRow(s).sownM2).toBe(5_000);
  });
});

/**
 * Ves s rodem vojvody ≈ 60 % potřeby jako Vlkov 904–905: `village` s dvorcem – zemnicí zakladatelů
 * (ve dvorci jsou všichni rod vojvody – `hungerSplit`) a v ní k zakladatelům tři dospělí – a se
 * zbytkem vsi (dva dospělí a tři děti) v druhé zemnici `home`.
 */
function tiered(storesKg: number): { s: VillageState; home: number } {
  const s = village(storesKg);
  const manor = s.people[0]!.dwellingId;
  s.manorId = manor;
  const home = s.nextId++;
  const dwelling = (id: number, type: 'polozemnice' | 'zemnice', x: number): Dwelling => ({
    id,
    type,
    builtDay: s.foundedDay,
    condition: 1,
    position: { x, z: 0, rotation: 0 },
  });
  s.dwellings.push(dwelling(manor, 'polozemnice', 0), dwelling(home, 'zemnice', 30));
  const add = (dwellingId: number, age: number, sex: 'male' | 'female'): void => {
    const bornDay = s.lastDay - Math.round((age + 0.5) * 365.25);
    s.people.push({ id: s.nextId++, bornDay, dwellingId, sex });
  };
  add(manor, 30, 'male');
  add(manor, 27, 'female');
  add(manor, 22, 'male');
  add(home, 32, 'male');
  add(home, 29, 'female');
  add(home, 8, 'female');
  add(home, 5, 'male');
  add(home, 2, 'female');
  return { s, home };
}

describe('přežívací zásoba podle zbytku vsi (návrh Clauda 18. 11. 2026 – Vlkov 904–905)', () => {
  const START = at(600, 9, 1);

  it('rod ≈ 60 % potřeby: zásoba větší než bez vrstev – zbytek vsi dostane cílový příděl', () => {
    const { s, home } = tiered(50_000);
    const v = advanceVillage(s, START, null);
    const { needs } = hungerSplit(v, START);
    const total = needs.reduce((sum, n) => sum + n, 0);
    expect(needs[0]! / total).toBeGreaterThan(0.55);
    expect(needs[0]! / total).toBeLessThan(0.7);
    expect(needs[3]!).toBeGreaterThan(0);
    // stejný stav bez vrstev – všichni v zemnici zbytku vsi (dvorec bez vojvody), potřeba stejná
    const flat = structuredClone(v);
    for (const p of flat.people) p.dwellingId = home;
    expect(hungerSplit(flat, START).needs[3]).toBeCloseTo(total, 9);
    const keep = seedKeepKg(v, START);
    const keepFlat = seedKeepKg(flat, START);
    expect(keep).toBeGreaterThan(keepFlat * 1.05);
    // cílový příděl zbytku vsi do žní – s přežívací zásobou ho zbytek vsi dostane
    const input = baseMealInput(v, START, craftCoverage(v, START).pottery, 1);
    const target = STARVATION.fedFrom * (1 - hungerLimit(v, START) / input.daysToHarvest);
    expect(target).toBeGreaterThan(HUNGER_PRIORITY.minimumShare);
    const outlook = eatDiet({ ...input, grainKg: keep }).outlook;
    expect(rationShares(outlook, needs)[3]).toBeGreaterThan(target - 1e-9);
    expect(rationShares(outlook, needs)[3]).toBeLessThan(target + 1e-6);
    // bez vrstev dá zásoba cílový příděl celé vsi – zbytek vsi by z něj dostal jen víc než minimum
    // o to, co nesní rod (dřív: jen 0,75)
    const outlookFlat = eatDiet({ ...input, grainKg: keepFlat }).outlook;
    expect(outlookFlat).toBeGreaterThan(target - 1e-9);
    expect(rationShares(outlookFlat, needs)[3]).toBeLessThan(target - 0.05);
  });

  it('ves drží osivo na jař jako Vlkov 904–905: hlad zbytku vsi do žní pod prahem dětí', () => {
    // od 1. 11. jen obilí (bez stád, ryb a ok); zbytek vsi už hladoví (6 dní – Vlkov v listopadu
    // 904 5,4), rod ne; zásoby = přežívací zásoba + osivo jaře, které ves přes zimu drží
    const NOV = at(600, 11, 1);
    const { s } = tiered(50_000);
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    s.livestock!.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    const autumn = advanceVillage(withoutSmallGame(s), NOV, null);
    autumn.starvationDays = 6;
    autumn.starvationGroups = [0, 0, 0];
    const spring = windowSeedNeedKg(autumn, 'spring');
    expect(spring).toBeGreaterThan(0);
    let v: VillageState = { ...autumn, storesKg: seedKeepKg(autumn, NOV) + spring };
    let maxRest = 0;
    let winterSeed = 0;
    let rationed = false;
    for (let day = NOV + 5; day <= at(601, 8, 31); day += 5) {
      v = advanceVillage(v, day, null);
      maxRest = Math.max(maxRest, v.starvationDays ?? 0);
      if (day < at(601, 3, 1)) {
        winterSeed = Math.max(winterSeed, uneatenSeedKg(v));
        rationed ||= v.ration !== undefined;
      }
    }
    // ves přes zimu šetřila a držela osivo, a přesto zbytek vsi nedošel k prahu dětí (dřív, se
    // zásobou na příděl celé vsi, zbytek vsi na 0,78: hlad 17,6 koncem ledna a úmrtí hladem)
    expect(winterSeed).toBeGreaterThan(spring / 2);
    expect(rationed).toBe(true);
    expect(maxRest).toBeLessThan(STARVATION.threshold.child);
    const deaths = v.chronicle.filter(
      (e) => e.day > NOV && e.kind === 'death' && e.cause === 'hunger',
    );
    expect(deaths).toEqual([]);
  }, 120_000);
});
