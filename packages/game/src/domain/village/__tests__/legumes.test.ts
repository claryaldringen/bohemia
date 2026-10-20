import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { DIET, PROTEIN, eatDiet, meatHappiness, proteinNeedPerDay } from '../diet';
import { endOfSeason, expectedNetKg } from '../fields';
import {
  daysUntilLegumeHarvest,
  expectedLegumeKg,
  legumeEnergy,
  legumeStorageLossPerYear,
} from '../legumes';
import { legumeNeedPerYear, meatNeedPerYear, proteinBudget } from '../livestock';
import { ageGroup } from '../people';
import { NO_CRAFTS } from '../productivity';
import { FERTILITY, FOOD_NEED_KG_PER_YEAR, LEGUMES } from '../rules';
import { advanceVillage } from '../simulate';
import { villageSheaves } from '../threshing';
import { withThreshingFloor } from './village-fixtures';
import { chooseCrops, orchardOnlyLoad, type CropChoiceInput } from '../sowing';
import type { ChronicleEvent, FieldPart, VillageState } from '../types';
import { cropGrossPerHa, harvestKg, partWork, planCrops } from '../year-plan';

// Luštěniny (diet.md a fields.md – Luštěniny; Martin 18. 10. 2026): plodina na poli podle
// bílkovin, které chybí po obilí, mléku a vejcích; obilí má přednost; zásoba se jí celý rok;
// díl s luštěninou se vyčerpá méně; maso mírně zvyšuje štěstí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 9, 1);
const NO_HERDS = { sheep: 0, goat: 0, pig: 0, cow: 0 };

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
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
const parts = (count: number): FieldPart[] => Array.from({ length: count }, (_, i) => part(i + 1));

const BIG = 1e6;
function input(over: Partial<CropChoiceInput>): CropChoiceInput {
  return {
    targetKg: BIG,
    startKg: 0,
    capacity: { autumnWinter: BIG, autumn: BIG, spring: BIG, july: BIG, august: BIG },
    load: orchardOnlyLoad(0),
    allowWinter: true,
    day: DAY,
    toolCoverage: NO_CRAFTS.tools,
    ...over,
  };
}

/** Ves čtyř dospělých bez dobytka – bílkoviny jen z obilí a vajec. */
function village(day = DAY): VillageState {
  const s = foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.livestock!.herds = { ...NO_HERDS };
  return s;
}

describe('kolik luštěnin ves chce (legumeNeedPerYear)', () => {
  it('bílkoviny, které chybí po obilí, mléku a vejcích, v luštěninách – nejvýš strop energie', () => {
    const s = village();
    const b = proteinBudget(s, DAY);
    const missing = b.need - b.grain - b.milk - b.eggs;
    expect(missing).toBeGreaterThan(0);
    const gain = LEGUMES.protein - PROTEIN.perKg.grain * LEGUMES.energy;
    const cap =
      (LEGUMES.energyCap *
        s.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)], 0)) /
      LEGUMES.energy;
    const need = legumeNeedPerYear(s, DAY);
    expect(need).toBeCloseTo(Math.min(missing / gain, cap), 6);
    // bez dobytka chybí bílkovin hodně – luštěniny narazí na strop
    expect(need).toBeCloseTo(cap, 6);
    // hodně mléka (krávy) – chybí méně, luštěnin je méně než strop
    s.livestock!.herds = { ...NO_HERDS, cow: 40, goat: 40, sheep: 40 };
    expect(legumeNeedPerYear(s, DAY)).toBeLessThan(cap);
  });

  it('zásoba luštěnin zmenší potřebu masa (bílkoviny, které zbudou)', () => {
    const s = village();
    const before = meatNeedPerYear(s, DAY);
    s.legumesKg = 30;
    const supply = (30 * 365) / daysUntilLegumeHarvest(DAY);
    const gain = LEGUMES.protein - PROTEIN.perKg.grain * LEGUMES.energy;
    expect(meatNeedPerYear(s, DAY)).toBeCloseTo(before - (supply * gain) / PROTEIN.perKg.meat, 6);
    // nad strop se luštěniny nepočítají
    s.legumesKg = 1e6;
    const capped = meatNeedPerYear(s, DAY);
    s.legumesKg = 2e6;
    expect(meatNeedPerYear(s, DAY)).toBeCloseTo(capped, 9);
  });
});

describe('výnos a práce luštěnin', () => {
  it('úroda podíl úrody obilí při stejné úrodnosti, vlastní osivo', () => {
    expect(cropGrossPerHa('legume', 70)).toBeCloseTo(
      cropGrossPerHa('spring', 70) * LEGUMES.yieldShare,
      9,
    );
    const p = part(1);
    expect(expectedLegumeKg(p, DAY)).toBeCloseTo(
      (cropGrossPerHa('legume', 70) - LEGUMES.seedKgPerHa) * 0.0225,
      9,
    );
  });

  it('díl s luštěninou úrodnost neubere, ale trochu vrátí (nejvýš plná)', () => {
    const grain = part(1, { crop: 'spring', fertilityShare: 0.9 });
    const legume = part(2, { crop: 'legume', fertilityShare: 0.9 });
    const full = part(3, { crop: 'legume', fertilityShare: 0.99 });
    endOfSeason(grain, DAY);
    endOfSeason(legume, DAY);
    endOfSeason(full, DAY);
    expect(grain.fertilityShare).toBeCloseTo(0.9 - FERTILITY.sowDepletion, 9);
    expect(legume.fertilityShare).toBeCloseTo(0.9 + LEGUMES.fertilityGain, 9);
    expect(full.fertilityShare).toBe(1);
    expect(legume.sownYears).toBe(2);
  });

  it('práce luštěnin: pletí, sklizeň a výmlat vlastní sazbou (rešerše), kopání a setí jako jař', () => {
    const p = part(1);
    const grain = partWork(p, DAY, NO_CRAFTS.tools);
    const legume = partWork(p, DAY, NO_CRAFTS.tools, false, 'legume');
    expect(legume.dig).toBeCloseTo(grain.dig, 9);
    expect(legume.sow).toBeCloseTo(grain.sow, 9);
    expect(legume.weed).toBeCloseTo(40 * 0.0225, 9);
    expect(legume.harvest).toBeCloseTo(55 * 0.0225, 9);
    expect(legume.thresh).toBeCloseTo(10 * 0.0225, 9);
  });
});

describe('plán osevu s luštěninami (chooseCrops)', () => {
  it('luštěniny dostanou díly od domu, obilí doplní energii – cíl obilí zůstane pokrytý', () => {
    const candidates = parts(200);
    const grainOnly = chooseCrops(candidates, input({ targetKg: 600 }));
    const target = 60;
    const both = chooseCrops(candidates, input({ targetKg: 600, legumeTargetKg: target }));
    expect(grainOnly.legume).toEqual([]);
    // luštěniny na prvních dílech v pořadí (od domu)
    expect(both.legume.map((p) => p.id)).toEqual(
      candidates.slice(0, both.legume.length).map((p) => p.id),
    );
    const legumeKg = both.legume.reduce((sum, p) => sum + expectedLegumeKg(p, DAY), 0);
    expect(legumeKg).toBeGreaterThanOrEqual(target - 1e-9);
    const grainKg = [...both.winter, ...both.spring].reduce(
      (sum, p) => sum + expectedNetKg(p, DAY),
      0,
    );
    expect(grainKg + legumeEnergy(legumeKg)).toBeGreaterThanOrEqual(600 - 1e-9);
    // každý díl jen jednou
    const ids = [...both.winter, ...both.spring, ...both.legume].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('obilí má přednost – když půda na doplnění obilí nestačí, luštěnin je méně (nebo žádné)', () => {
    const candidates = parts(40);
    const all = candidates.reduce((sum, p) => sum + expectedNetKg(p, DAY), 0);
    const tight = chooseCrops(candidates, input({ targetKg: all, legumeTargetKg: 100 }));
    expect(tight.legume).toEqual([]);
    expect(tight.winter.length + tight.spring.length).toBe(40);
  });

  it('bez cíle luštěnin stejný výběr jako dřív', () => {
    const candidates = parts(120);
    const a = chooseCrops(candidates, input({ targetKg: 500 }));
    const b = chooseCrops(candidates, input({ targetKg: 500, legumeTargetKg: 0 }));
    expect(b).toEqual(a);
  });
});

describe('jídlo s luštěninami (eatDiet)', () => {
  const NEED = 2;
  const base = {
    grainKg: 1000,
    meatKg: 0,
    fruitKg: 0,
    needPerDay: NEED,
    proteinNeedPerDay: 0.4,
    daysToHarvest: 100,
    daysToRot: 0,
    daysToMeatEnd: 100,
    potteryCoverage: NO_CRAFTS.pottery,
  };

  it('rovným dílem do příští sklizně, nejvýš strop; bílkoviny z luštěnin', () => {
    const plenty = eatDiet({ ...base, legumesKg: 1e5, daysToLegumeHarvest: 200 });
    expect(plenty.diet.shares.legumes).toBeCloseTo(DIET.caps.legumes, 9);
    const keep = (1 - legumeStorageLossPerYear(NO_CRAFTS.pottery)) ** (1 / 365);
    const few = eatDiet({ ...base, legumesKg: 20, daysToLegumeHarvest: 200 });
    expect(few.diet.shares.legumes! * NEED).toBeCloseTo(legumeEnergy((20 * keep) / 200), 9);
    expect(few.legumesKg).toBeCloseTo(20 * keep - (20 * keep) / 200 / LEGUMES.energy, 9);
    const none = eatDiet({ ...base });
    expect(few.diet.protein).toBeGreaterThan(none.diet.protein);
  });
});

describe('maso mírně zvyšuje štěstí (Martin)', () => {
  it('až +3 – plně od 20 % energie z masa, méně poměrně', () => {
    expect(meatHappiness(0)).toBe(0);
    expect(meatHappiness(0.1)).toBeCloseTo(1.5, 9);
    expect(meatHappiness(0.2)).toBeCloseTo(3, 9);
    expect(meatHappiness(0.4)).toBeCloseTo(3, 9);
  });
});

/** Startovní pole s rezervou půdy – 4 ha dílů po 225 m², úrodnost 70. */
const bigField = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((100 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

// ves s humnem – mlátí hned po žni (production-chains.md – Humno)
const found = (day: number): VillageState =>
  withThreshingFloor(
    foundVillage({
      seed: 7,
      day,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: bigField(),
      },
    }),
  );

type HarvestEvent = Extract<ChronicleEvent, { kind: 'harvest' }>;

describe('luštěniny v simulaci', () => {
  it('ves je k 1. 9. zaseje, 31. 7. sklidí do snopů, po žni vymlátí do zásoby a jí je celý rok', () => {
    // první rok jde všechna založená půda na obilí (obilí má přednost), luštěniny od druhého
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 9, 2), null);
    const legume = planned.plan?.legume;
    expect(legume).toBeDefined();
    expect(legume!.partIds.length).toBeGreaterThan(0);
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    expect(legume!.partIds.every((id) => byId.get(id)?.crop === 'legume')).toBe(true);
    const harvested = advanceVillage(planned, at(602, 8, 1), null);
    const events = harvested.chronicle.filter(
      (e): e is HarvestEvent => e.kind === 'harvest' && e.crop === 'legume',
    );
    expect(events.filter((e) => e.day > planned.lastDay)).toHaveLength(1);
    expect(events[0]!.kg).toBeGreaterThan(0);
    // sklizeň jde do snopů, mlátí se v srpnu na humně (production-chains.md – Humno)
    expect(villageSheaves(harvested).legumesKg).toBeGreaterThan(0);
    // luštěniny i obilí z plánu, ozim i jař dál
    expect(planCrops(harvested.plan!).map((c) => c.crop)).toContain('spring');
    // v srpnu má přednost žeň jaře – co výmlat v srpnu nestihne, vymlátí v září
    const threshed = advanceVillage(harvested, at(602, 9, 30), null);
    expect(villageSheaves(threshed).legumesKg).toBe(0);
    expect(threshed.legumesKg).toBeGreaterThan(0);
    const later = advanceVillage(threshed, at(602, 12, 1), null);
    expect(later.diet!.shares.legumes).toBeGreaterThan(0);
    expect(later.legumesKg!).toBeLessThan(threshed.legumesKg!);
  });

  it('úroda luštěnin podle jejich výnosu a osiva (harvestKg s plodinou)', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(602, 7, 30), null);
    const work = s.plan!.legume!;
    const kg = harvestKg(work, s.parts, s.lastDay, 'legume');
    const asGrain = harvestKg(work, s.parts, s.lastDay, 'spring');
    expect(kg).toBeGreaterThan(0);
    expect(kg).toBeLessThan(asGrain);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (3 roky)', () => {
    const start = found(at(600, 3, 1));
    const whole = advanceVillage(start, at(603, 3, 1), null);
    let chunked = start;
    for (const day of [
      at(600, 8, 31),
      at(600, 9, 1),
      at(601, 7, 31),
      at(602, 3, 1),
      at(603, 3, 1),
    ]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, day, null))) as VillageState;
    }
    expect(chunked).toEqual(JSON.parse(JSON.stringify(whole)));
  });

  it('ves uložená před luštěninami (bez zásoby, plán bez luštěnin, jídlo bez podílu) se dopočítá', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 6, 1), null);
    const old = JSON.parse(JSON.stringify(s)) as VillageState;
    delete old.legumesKg;
    if (old.diet) delete old.diet.shares.legumes;
    const next = advanceVillage(old, at(600, 6, 10), null);
    expect(next.legumesKg ?? 0).toBe(0);
    expect(next.diet!.shares.legumes).toBe(0);
    expect(proteinNeedPerDay(next.people[0]!, next.lastDay)).toBeGreaterThan(0);
  });
});
