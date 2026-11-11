import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { grossYieldPerHa } from '../fields';
import { NO_CRAFTS } from '../../core/productivity';
import { LEGUMES } from '../../rules';
import { harvest, harvestWinter } from '../../core/simulate-food';
import { dayTaskOrder, fieldTasks } from '../../core/simulate-work';
import type { Crop, SeasonCrop, VillageState } from '../../types';
import { villageSheaves } from '../threshing';
import { createCropWork, seasonCrop } from '../../core/year-plan';

// Žně i v srpnu (fields.md; Martin 9. 11. 2026: „Ať sklízí i v srpnu“): ozim, luštěniny a len,
// které červenec nedosklidí, se žnou v srpnu – co je sklizené do 31. 7., jde 31. 7. do snopů,
// zbytek 31. 8. s jaří; v srpnu napřed nedosklizené plodiny, pak jař (CROP_ORDER, návrh Clauda).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const PART_HA = 0.25;
/** Dílů na plodinu. */
const PER_CROP = 4;
const CROPS: readonly Crop[] = ['winter', 'legume', 'flax', 'spring'];

/**
 * Ves s hospodářským rokem 600/601: každá plodina na PER_CROP dílech po 0,25 ha (úrodnost 70),
 * všechna práce hotová kromě žně – ta má hotový podíl `reaped` plodiny (chybí = 0).
 */
function village(reaped: Partial<Record<Crop, number>>): VillageState {
  const parts: PartInput[] = Array.from({ length: CROPS.length * PER_CROP }, (_, i) => ({
    areaM2: PART_HA * 10_000,
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
  s.storesKg = 5000;
  s.lastDay = at(601, 7, 30);
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
  }
  const crops: SeasonCrop[] = CROPS.map((crop, i) => {
    const own = s.parts.slice(i * PER_CROP, (i + 1) * PER_CROP);
    for (const p of own) p.crop = crop;
    const work = createCropWork(own, at(600, 9, 15), NO_CRAFTS.tools, false, undefined, crop);
    const done = { ...work.required, thresh: 0 };
    done.harvest = work.required.harvest * (reaped[crop] ?? 0);
    return { crop, ...work, done, seedKg: 0 };
  });
  s.season = { startDay: at(600, 9, 1), crops, flaxNeedKg: 1 };
  return s;
}

const crop = (s: VillageState, c: Crop): SeasonCrop => seasonCrop(s.season!, c)!;
/** Hrubá úroda obilí PER_CROP dílů při úrodnosti 70 (kg). */
const GRAIN_KG = grossYieldPerHa(70) * PER_CROP * PART_HA;

describe('žně i v srpnu (fields.md – Žně i v srpnu)', () => {
  it('ozim a luštěniny nedosklizené 31. 7.: do snopů jde červencová část, zbytek žatý v srpnu 31. 8.', () => {
    const s = village({ winter: 0.6, legume: 0.25, flax: 1 });
    const winter = crop(s, 'winter');
    const legume = crop(s, 'legume');
    harvestWinter(s, at(601, 7, 31));
    // plodiny zůstávají na poli – sklizené jsou až 31. 8.
    expect(winter.harvestedKg).toBeNull();
    expect(legume.harvestedKg).toBeNull();
    expect(winter.sheaved).toEqual({ harvest: winter.done.harvest, kg: expect.any(Number) });
    expect(winter.sheaved!.kg).toBeCloseTo(0.6 * GRAIN_KG, 6);
    expect(legume.sheaved!.kg).toBeCloseTo(0.25 * GRAIN_KG * LEGUMES.yieldShare, 6);
    const july = villageSheaves(s);
    expect(july.grainKg).toBeCloseTo(0.6 * GRAIN_KG, 6);
    expect(july.legumesKg).toBeCloseTo(0.25 * GRAIN_KG * LEGUMES.yieldShare, 6);
    // výmlat jen sklizené části
    expect(july.work!.winter).toBeCloseTo(0.6 * winter.required.thresh, 9);
    expect(july.work!.legume).toBeCloseTo(0.25 * legume.required.thresh, 9);
    // druhé volání 31. 7. nic nepřidá
    harvestWinter(s, at(601, 7, 31));
    expect(villageSheaves(s).grainKg).toBeCloseTo(july.grainKg, 9);

    // v srpnu se dožne ozim celý, luštěniny do 75 %; 31. 8. jde zbytek do snopů s jaří
    winter.done.harvest = winter.required.harvest;
    legume.done.harvest = 0.75 * legume.required.harvest;
    const plan = s.season!;
    harvest(s, at(601, 8, 31));
    expect(s.season).toBeNull();
    expect(s.threshingSeason).toBe(plan);
    expect(winter.harvestedKg).toBeCloseTo(GRAIN_KG, 6);
    expect(legume.harvestedKg).toBeCloseTo(0.75 * GRAIN_KG * LEGUMES.yieldShare, 6);
    const august = villageSheaves(s);
    // ozim celý a jař (nežatá – 0) v obilí, luštěniny 75 % – co srpen nesklidil, propadlo
    expect(august.grainKg).toBeCloseTo(GRAIN_KG, 6);
    expect(august.legumesKg).toBeCloseTo(0.75 * GRAIN_KG * LEGUMES.yieldShare, 6);
    expect(august.work!.winter).toBeCloseTo(winter.required.thresh, 9);
    expect(august.work!.legume).toBeCloseTo(0.75 * legume.required.thresh, 9);
    // kronika: červencová i srpnová žeň ozimu a luštěnin
    const reaps = s.chronicle.filter((e) => e.kind === 'harvest' && e.crop !== 'spring');
    expect(reaps.map((e) => [e.day, e.kind === 'harvest' && e.crop])).toEqual([
      [at(601, 7, 31), 'legume'],
      [at(601, 7, 31), 'winter'],
      [at(601, 8, 31), 'legume'],
      [at(601, 8, 31), 'winter'],
    ]);
  });

  it('plodina sklizená do 31. 7. jde do snopů celá jako dřív – v srpnu nic', () => {
    const s = village({ winter: 1, legume: 1, flax: 1 });
    harvestWinter(s, at(601, 7, 31));
    expect(crop(s, 'winter').harvestedKg).toBeCloseTo(GRAIN_KG, 6);
    expect(crop(s, 'winter').sheaved).toBeUndefined();
    const sheaves = villageSheaves(s);
    harvest(s, at(601, 8, 31));
    expect(villageSheaves(s).grainKg).toBeCloseTo(sheaves.grainKg, 9);
    expect(villageSheaves(s).legumesKg).toBeCloseTo(sheaves.legumesKg, 9);
  });

  it('len se trhá jen v srpnu: 31. 7. zůstává na poli, 31. 8. vytrhaná část k oděvu, zbytek propadne', () => {
    const s = village({ winter: 1, legume: 1, flax: 0 });
    s.linen = 0.3;
    const flax = crop(s, 'flax');
    harvestWinter(s, at(601, 7, 31));
    expect(flax.harvestedKg).toBeNull();
    // 31. 7. oděv beze změny (len je na poli, zahrádka len nedává – fields.md, Len)
    expect(s.linen).toBe(0.3);
    expect(s.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
    // úroda celého lnu (kopie s celým trháním)
    const full = structuredClone(s);
    crop(full, 'flax').done.harvest = crop(full, 'flax').required.harvest;
    harvest(full, at(601, 8, 31));
    // 31. 8. plán jde k výmlatu (`threshingSeason`)
    const fullKg = seasonCrop(full.threshingSeason!, 'flax')!.harvestedKg!;
    expect(fullKg).toBeGreaterThan(0);
    // srpen vytrhal polovinu – druhá propadne
    s.season!.flaxNeedKg = fullKg;
    flax.done.harvest = flax.required.harvest / 2;
    harvest(s, at(601, 8, 31));
    expect(flax.harvestedKg).toBeCloseTo(fullKg / 2, 6);
    expect(s.linen).toBeCloseTo(0.5, 6);
    expect(s.chronicle.filter((e) => e.kind === 'linen-short')).toHaveLength(1);
  });

  it('v srpnu se napřed dožne ozim a luštěniny, pak jař; len až za obilím (fields.md – Len)', () => {
    const s = village({ winter: 0.6, legume: 0.25, flax: 0 });
    harvestWinter(s, at(601, 7, 31));
    s.lastDay = at(601, 8, 9);
    // pořadí práce dne (`dayTaskOrder` – fields.md, Pořadí důležitosti polních prací): žeň obilí
    // podle konce okna, trhání lnu za ní
    const tasks = fieldTasks(s, at(601, 8, 10), 0)
      .filter((t) => t.name === 'harvest')
      .map((field) => ({ ...field, tie: 1, field }))
      .sort(dayTaskOrder)
      .map((t) => t.field);
    expect(tasks.map((t) => [t.crop, t.end])).toEqual([
      ['winter', 8],
      ['legume', 8],
      ['spring', 9],
      ['flax', 8],
    ]);
    // zbývá jen nesklizená část
    expect(tasks[0]!.remaining).toBeCloseTo(0.4 * crop(s, 'winter').required.harvest, 9);
  });
});
