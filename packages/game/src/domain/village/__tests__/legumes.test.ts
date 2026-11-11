import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { DIET, PROTEIN, eatDiet, meatHappiness, proteinNeedPerDay } from '../diet';
import { endOfSeason } from '../fields';
import { daysUntilLegumeHarvest, legumeEnergy, legumeStorageLossPerYear } from '../legumes';
import { meatNeedPerYear } from '../livestock';
import { NO_CRAFTS } from '../productivity';
import { FERTILITY, LEGUMES } from '../rules';
import { advanceVillage } from '../simulate';
import { villageSheaves } from '../threshing';
import { withThreshingFloor } from './village-fixtures';

import type { ChronicleEvent, FieldPart, SeasonCrop, VillageState } from '../types';
import { withoutFieldLegumes } from '../field-legumes';
import { moveParts } from '../land-taken';
import {
  createCropWork,
  cropGrossPerHa,
  nearestFirst,
  partWork,
  putSeasonCrop,
  seasonCrop,
  seasonCrops,
  springCrop,
} from '../year-plan';

// Luštěniny (diet.md a fields.md – Luštěniny; Martin 18. 10. 2026): zásoba se jí celý rok, maso
// mírně zvyšuje štěstí. Z polí je Martin 9. 11. 2026 vyřadil – zůstávají zbožím; zasetá luštěnina
// starší vsi doroste (díl s ní se vyčerpá méně), nezasetý díl přejde do jaře (`withoutFieldLegumes`).

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

/** Ves čtyř dospělých bez dobytka – bílkoviny jen z obilí a vajec. */
function village(day = DAY): VillageState {
  const s = foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.livestock!.herds = { ...NO_HERDS };
  return s;
}

describe('luštěniny ze zásoby (zboží)', () => {
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
  it('úroda podíl úrody obilí při stejné úrodnosti', () => {
    expect(cropGrossPerHa('legume', 70)).toBeCloseTo(
      cropGrossPerHa('spring', 70) * LEGUMES.yieldShare,
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
    expect(legume.weed).toBeCloseTo(10 * 0.0225, 9);
    expect(legume.harvest).toBeCloseTo(55 * 0.0225, 9);
    expect(legume.thresh).toBeCloseTo(10 * 0.0225, 9);
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

/**
 * Starší ves s luštěninami v plánu (před 9. 11. 2026): prvních `count` dílů jaře přejde do
 * luštěnin i s hotovou přípravou půdy – jako je dřív ves plánovala; s `sown` je luštěniny zasejí
 * (osivo z jejich zásoby).
 */
function withLegacyLegumes(s: VillageState, count: number, sown = false): VillageState {
  const next = structuredClone(s);
  const season = next.season!;
  const spring = springCrop(season);
  const day = next.lastDay;
  const plough = spring.plough !== undefined;
  const legume: SeasonCrop = {
    crop: 'legume',
    ...createCropWork([], day, NO_CRAFTS.tools, plough, nearestFirst, 'legume'),
  };
  putSeasonCrop(season, legume);
  const ids = spring.partIds.slice(0, count);
  moveParts(next, season, spring, legume, ids, day, NO_CRAFTS.tools);
  for (const p of next.parts) if (ids.includes(p.id)) p.crop = 'legume';
  if (sown) {
    for (const task of ['reclaim', 'dig', 'sow'] as const)
      legume.done[task] = legume.required[task];
    if (legume.plough) legume.plough.done = legume.plough.required;
    legume.seedKg = ids.length * 225 * (LEGUMES.seedKgPerHa / 10_000);
  }
  return next;
}

/** Hotová práce úlohy přes všechny plodiny hospodářského roku. */
const doneOf = (s: VillageState, task: 'dig' | 'reclaim'): number =>
  seasonCrops(s.season!).reduce((sum, c) => sum + c.work.done[task], 0);

describe('luštěniny z polí vyřazené (Martin 9. 11. 2026)', () => {
  it('ves luštěniny na poli nezaseje – 3 roky bez dílu s luštěninami, zásoba z pole nepřibude', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(603, 3, 1), null);
    expect(s.parts.some((p) => p.crop === 'legume')).toBe(false);
    expect(s.chronicle.some((e) => e.kind === 'harvest' && e.crop === 'legume')).toBe(false);
    expect(s.legumesKg ?? 0).toBe(0);
  });

  it('převod: nezasetý díl luštěnin přejde do jaře i s přípravou půdy; jednou, idempotentně', () => {
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 11, 30), null);
    const legacy = withLegacyLegumes(planned, 3);
    const legume = seasonCrop(legacy.season, 'legume')!;
    expect(legume.partIds).toHaveLength(3);
    const dig = doneOf(legacy, 'dig');
    const copy = structuredClone(legacy);
    const converted = withoutFieldLegumes(legacy);
    expect(legacy).toEqual(copy); // vstup nemění
    expect(seasonCrop(converted.season, 'legume')).toBeUndefined();
    const spring = seasonCrop(converted.season, 'spring')!;
    expect(legume.partIds.every((id) => spring.partIds.includes(id))).toBe(true);
    const byId = new Map(converted.parts.map((p) => [p.id, p]));
    expect(legume.partIds.every((id) => byId.get(id)?.crop === 'spring')).toBe(true);
    expect(doneOf(converted, 'dig')).toBeCloseTo(dig, 6); // příprava půdy nepropadne
    // podruhé nic
    expect(withoutFieldLegumes(converted)).toBe(converted);
    // advanceVillage převede při načtení – dál jako ves bez luštěnin
    const next = advanceVillage(legacy, at(602, 9, 2), null);
    expect(next.chronicle.some((e) => e.kind === 'harvest' && e.crop === 'legume')).toBe(false);
    expect(next.parts.some((p) => p.crop === 'legume')).toBe(false);
  });

  it('převod: výběr dílů z paměti s luštěninami propadne, ves vybere znovu', () => {
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 3, 10), null);
    const legacy = structuredClone(planned);
    const id = legacy.parts.find((p) => p.state !== 'sown')?.id ?? 0;
    legacy.season!.selection = {
      window: 'x',
      waiting: [{ id, crop: 'legume' }],
    };
    const converted = withoutFieldLegumes(legacy);
    expect(converted.season!.selection).toBeUndefined();
  });

  it('zasetá luštěnina starší vsi doroste, sklidí se do snopů a vymlátí do zásoby', () => {
    const spring = advanceVillage(found(at(600, 3, 1)), at(602, 5, 10), null);
    const legacy = withLegacyLegumes(spring, 4, true);
    // zasetou část převod nechá
    expect(withoutFieldLegumes(legacy)).toBe(legacy);
    const harvested = advanceVillage(legacy, at(602, 9, 30), null);
    const events = harvested.chronicle.filter(
      (e): e is HarvestEvent => e.kind === 'harvest' && e.crop === 'legume',
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.kg).toBeGreaterThan(0);
    expect(villageSheaves(harvested).legumesKg).toBe(0);
    expect(harvested.legumesKg).toBeGreaterThan(0);
    // díl po luštěninách dál s obilím – nová luštěnina nepřibude
    const later = advanceVillage(harvested, at(603, 6, 1), null);
    expect(later.parts.some((p) => p.crop === 'legume')).toBe(false);
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
