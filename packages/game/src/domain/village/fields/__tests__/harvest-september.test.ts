import { describe, expect, it } from 'vitest';
import { THRESH_CALIBRATION_FERTILITY } from '../../rules';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { grossYieldPerHa } from '../fields';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { harvest, harvestLateSpring } from '../../core/simulate-food';
import { type DayTask } from '../../core/simulate-plan';
import { dayTaskOrder, fieldTasks } from '../../core/simulate-work';
import { villageSheaves } from '../threshing';
import type { SeasonCrop, VillageState } from '../../types';
import {
  createCropWork,
  cropGrossPerHa,
  lateSpringCrop,
  seasonCrop,
  seasonCrops,
} from '../../core/year-plan';

// Žeň jaře i v září (fields.md; Martin 9. 11. 2026: „Ano, ať se jař sklízí i v září“): co srpen
// sklidil, jde 31. 8. do snopů, zbytek jaře zůstává na poli a dožne se v září – do snopů jde, až je
// dožatá, nejpozději 30. 9.; její díly do té doby nejdou pod ozim. Žeň má přednost před orbou
// a setím (Martin 9. 11. 2026: „Je lepší za každou cenu sklidit to, co už vyrostlo, než začínat
// pěstování úplně od začátku“).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const PART_HA = 0.25;
const PARTS = 8;
/** Hrubá úroda obilí všech dílů při úrodnosti 70 (kg). */
const GRAIN_KG = grossYieldPerHa(70) * PARTS * PART_HA;
// výmlat podle kg snopů (production-chains.md – Humno, Práce výmlatu podle snopů; D95): úrodnost 70
// dá o 6,5 % víc než běžná úroda – o tolik víc práce výmlatu než sazba na hektar
const THRESH_SCALE = grossYieldPerHa(70) / cropGrossPerHa('spring', THRESH_CALIBRATION_FERTILITY);

/**
 * Ves s hospodářským rokem 600/601: jař na PARTS dílech po 0,25 ha (úrodnost 70, první osev oběhu),
 * všechna práce hotová kromě žně – ta má hotový podíl `reaped`. Poslední den 30. 8. 601.
 */
function village(reaped: number): VillageState {
  const parts: PartInput[] = Array.from({ length: PARTS }, (_, i) => ({
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
  s.lastDay = at(601, 8, 30);
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 0;
  }
  const work = createCropWork(s.parts, at(601, 3, 1), NO_CRAFTS.tools, false, undefined, 'spring');
  const done = { ...work.required, thresh: 0, harvest: work.required.harvest * reaped };
  const spring: SeasonCrop = { crop: 'spring', ...work, done, seedKg: 0 };
  s.season = { startDay: at(600, 9, 1), crops: [spring] };
  return s;
}

const springOf = (s: VillageState): SeasonCrop =>
  seasonCrop(s.season ?? s.threshingSeason, 'spring')!;

describe('žeň jaře i v září (fields.md – Žeň jaře i v září)', () => {
  it('jař nedosklizená 31. 8.: srpnová žeň do snopů, zbytek na poli; dožatá jde do snopů v září', () => {
    const s = village(0.4);
    const spring = springOf(s);
    harvest(s, at(601, 8, 31));
    expect(s.season).toBeNull();
    expect(spring.harvestedKg).toBeNull();
    expect(spring.sheaved!.kg).toBeCloseTo(0.4 * GRAIN_KG, 6);
    expect(villageSheaves(s).grainKg).toBeCloseTo(0.4 * GRAIN_KG, 6);
    expect(lateSpringCrop(s)).toBe(spring);
    // do kroniky srpnová žeň
    expect(s.chronicle.filter((e) => e.kind === 'harvest')).toHaveLength(1);
    // díly zůstávají osetou jaří
    expect(s.parts.every((p) => p.state === 'sown' && p.crop === 'spring')).toBe(true);

    // v září: dokud není dožatá, do snopů nic nejde
    harvestLateSpring(s, at(601, 9, 5), false);
    expect(spring.harvestedKg).toBeNull();
    // dožatá – do snopů zářijová žeň, díly končí hospodářský rok (osévají se dál – díly v osevu)
    spring.done.harvest = spring.required.harvest;
    harvestLateSpring(s, at(601, 9, 12), false);
    expect(spring.harvestedKg).toBeCloseTo(GRAIN_KG, 6);
    expect(villageSheaves(s).grainKg).toBeCloseTo(GRAIN_KG, 6);
    expect(villageSheaves(s).work!.spring).toBeCloseTo(spring.required.thresh * THRESH_SCALE, 9);
    expect(lateSpringCrop(s)).toBeUndefined();
    expect(s.parts.every((p) => p.state === 'ready' && p.sownYears === 1)).toBe(true);
    const reaps = s.chronicle.filter((e) => e.kind === 'harvest');
    expect(reaps.map((e) => e.day)).toEqual([at(601, 8, 31), at(601, 9, 12)]);
    // podruhé nic
    harvestLateSpring(s, at(601, 9, 30), true);
    expect(villageSheaves(s).grainKg).toBeCloseTo(GRAIN_KG, 6);
  });

  it('30. 9. jde do snopů, co září dožalo – nesklizené propadne', () => {
    const s = village(0.4);
    const spring = springOf(s);
    harvest(s, at(601, 8, 31));
    spring.done.harvest = 0.7 * spring.required.harvest;
    harvestLateSpring(s, at(601, 9, 30), true);
    expect(spring.harvestedKg).toBeCloseTo(0.7 * GRAIN_KG, 6);
    expect(villageSheaves(s).grainKg).toBeCloseTo(0.7 * GRAIN_KG, 6);
    expect(villageSheaves(s).work!.spring).toBeCloseTo(
      0.7 * spring.required.thresh * THRESH_SCALE,
      9,
    );
  });

  it('jař sklizená do 31. 8. jde do snopů celá jako dřív', () => {
    const s = village(1);
    harvest(s, at(601, 8, 31));
    expect(springOf(s).harvestedKg).toBeCloseTo(GRAIN_KG, 6);
    expect(springOf(s).sheaved).toBeUndefined();
    expect(lateSpringCrop(s)).toBeUndefined();
  });

  it('v září se ves dožne jař: díl na poli se neorá pod ozim, dokud není sklizený', () => {
    let s = village(0.1);
    s = advanceVillage(s, at(601, 8, 31), null);
    expect(springOf(s).harvestedKg).toBeNull();
    const ids = new Set(s.parts.map((p) => p.id));
    let reapedDay: number | null = null;
    while (s.lastDay < at(601, 10, 31)) {
      s = advanceVillage(s, s.lastDay + 1, null);
      const late = lateSpringCrop(s);
      if (late) {
        // dosklizeň v září: díly na poli, v novém hospodářském roce nejsou
        expect(dateOfDayIndex(s.lastDay).month).toBe(9);
        for (const { work } of seasonCrops(s.season!)) {
          for (const id of work.partIds) expect(ids.has(id)).toBe(false);
        }
        expect(s.parts.every((p) => p.state === 'sown' && p.crop === 'spring')).toBe(true);
      } else reapedDay ??= s.lastDay;
    }
    // ves jař v září dožala a dala úrodu
    expect(reapedDay).not.toBeNull();
    expect(dateOfDayIndex(reapedDay!).month).toBe(9);
    const reaps = s.chronicle.filter((e) => e.kind === 'harvest' && e.day >= at(601, 9, 1));
    expect(reaps).toHaveLength(1);
    expect(reaps[0]!.kind === 'harvest' && reaps[0]!.kg).toBeGreaterThan(0);
    // po sklizni díly přišly na řadu – ozim je na nich zasetý
    const winter = seasonCrop(s.season!, 'winter');
    expect(winter?.partIds.some((id) => ids.has(id))).toBe(true);
  });

  it('po kouscích stejně jako jedním voláním (determinismus)', () => {
    const start = village(0.1);
    const end = at(601, 10, 20);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 3, 17, 1, 9, 30];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
  });
});

describe('pořadí práce dne (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)', () => {
  const task = (name: DayTask['name'], end: number, extra: Partial<DayTask> = {}): DayTask => ({
    name,
    remaining: 10,
    end,
    tie: 1,
    rank: 0,
    ...extra,
  });
  const thresh = (extra: Partial<NonNullable<DayTask['thresh']>> = {}): DayTask =>
    task('thresh', 12, {
      rank: 30,
      thresh: { crop: 'winter', remaining: 1, floor: 1, end: 12, overdue: false, ...extra },
    });

  it('výmlat na jídlo → porážka → žeň → len → seč → jablka → pletí → výmlat na osivo → orba a setí → hlídka → výmlat', () => {
    const field = (name: DayTask['name'], crop: 'winter' | 'flax', end: number): DayTask =>
      task(name, end, { field: { crop } as DayTask['field'] });
    const ordered = [
      thresh({ urgent: true, end: -1 }),
      task('slaughter', 9, { tie: 0, rank: 1 }),
      field('harvest', 'winter', 9),
      field('harvest', 'flax', 8),
      task('mow', Infinity, { tie: 3, rank: 1 }),
      task('orchard-harvest', 10, { tie: 0 }),
      task('weed', 5),
      thresh({ seed: true, end: -1 }),
      task('plough', 10, { rank: -0.5 }),
      task('reclaim', 9),
      task('sow', 10, { rank: 2 }),
      task('watch', Infinity, { tie: 4, rank: 2 }),
      thresh(),
      task('grain-pit', 11),
      task('herding', Infinity, { tie: 4, rank: 3 }),
    ];
    const shuffled = [...ordered].reverse().sort(dayTaskOrder);
    expect(shuffled).toEqual(ordered);
  });

  it('žeň v září před orbou i výmlatem, v přípravě půdy orba první, uvnitř skupiny konec okna', () => {
    const plough = task('plough', 11, { rank: -0.5 });
    const reap = task('harvest', 9, { rank: 4 });
    const sow = task('sow', 10, { rank: 2 });
    const dig = task('dig', 10, { rank: 3 });
    expect([sow, dig, thresh(), plough, reap].sort(dayTaskOrder).map((t) => t.name)).toEqual([
      'harvest',
      'plough',
      'sow',
      'dig',
      'thresh',
    ]);
    // dosklizeň ozimu (konec okna srpen) před žní jaře
    const winter = task('harvest', 8, { rank: 10 });
    expect([reap, winter].sort(dayTaskOrder)[0]).toBe(winter);
  });
  it('v září je žeň jaře, kterou srpen nedosklidil, mezi úlohami dne s koncem okna září', () => {
    const s = village(0.4);
    harvest(s, at(601, 8, 31));
    const empty = createCropWork([], at(601, 9, 1), NO_CRAFTS.tools, false, undefined, 'spring');
    s.season = { startDay: at(601, 9, 1), crops: [{ crop: 'spring', ...empty }] };
    const tasks = fieldTasks(s, at(601, 9, 3), 0).filter((t) => t.name === 'harvest');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.work).toBe(lateSpringCrop(s));
    expect(tasks[0]!.end).toBe(9);
  });
});
