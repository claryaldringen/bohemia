import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { taskPosition, taskSpans } from '../field-progress';
import { moveParts } from '../land-taken';
import { sowParts } from '../rotation';
import { advanceVillage } from '../simulate';
import type { CropWork, VillageState } from '../types';
import { NO_CRAFTS } from '../productivity';
import { createSeason, seasonCrop, seasonCrops, seasonPartIds, springCrop } from '../year-plan';

// Nutné díly den po dni (fields.md – Osevní postup po dílech a setí do konce okna, 25. 10. 2026):
// ves nemá plán k 1. 9. – díly na řadě přibývají k letošní práci podle potřeby úrody, ozim, který
// do konce října nezačal, jde do jaře, nezasetá jař 1. 5. z práce vypadne.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** Ves s `count` hotovými díly po 0,25 ha (od domu ven), bez staveb a bez hospodářského roku. */
function village(count: number, day = at(600, 8, 31)): VillageState {
  const parts: PartInput[] = Array.from({ length: count }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = day;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Díly plodiny, na kterých setí nezačalo. */
function unsown(s: VillageState, work: CropWork): number[] {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  const position = taskPosition(work, 'sow');
  return taskSpans(work, byId, 'sow', s.lastDay)
    .filter((span) => position <= span.start + 1e-9)
    .map((span) => span.id);
}

const doneSum = (s: VillageState, task: 'dig' | 'reclaim' | 'sow'): number =>
  seasonCrops(s.season!).reduce((sum, { work }) => sum + work.done[task], 0);

describe('nutné díly den po dni', () => {
  it('1. 9. přibudou díly na řadě podle potřeby úrody – ozim; bez potřeby nic', () => {
    const hungry = village(80);
    hungry.storesKg = 0;
    const s = advanceVillage(hungry, at(600, 9, 1), null);
    const winter = seasonCrop(s.season!, 'winter')!;
    expect(winter.partIds.length).toBeGreaterThan(0);
    for (const id of winter.partIds) {
      expect(s.parts.find((p) => p.id === id)).toMatchObject({ state: 'sown', crop: 'winter' });
    }
    // díly, které ves nepotřebuje, čekají na řadě
    const waiting = s.parts.filter((p) => !seasonPartIds(s.season!).includes(p.id));
    expect(waiting.every((p) => p.state === 'ready')).toBe(true);

    const full = village(80);
    full.storesKg = 1e6;
    const rich = advanceVillage(full, at(600, 9, 1), null);
    // obilí ne – len na oděv a luštěniny mají svou potřebu
    expect(seasonCrop(rich.season!, 'winter')).toBeUndefined();
    expect(springCrop(rich.season!).partIds).toEqual([]);
  });

  it('ozim, na kterém do konce října setí nezačalo, jde do jaře – každý zbylý díl ozimu je osetý', () => {
    const start = village(200);
    start.storesKg = 0;
    const october = advanceVillage(start, at(600, 10, 31), null);
    const before = seasonCrop(october.season!, 'winter')!;
    const late = unsown(october, before);
    expect(late.length).toBeGreaterThan(0);
    const november = advanceVillage(october, at(600, 11, 1), null);
    const winter = seasonCrop(november.season!, 'winter')!;
    expect(unsown(november, winter)).toEqual([]);
    const spring = springCrop(november.season!);
    for (const id of late) {
      expect(winter.partIds).not.toContain(id);
      expect(spring.partIds).toContain(id);
      expect(november.parts.find((p) => p.id === id)!.crop).toBe('spring');
    }
  });

  it('jař nezasetá do konce dubna z práce vypadne – díl čeká na další sezónu', () => {
    const start = village(200);
    start.storesKg = 0;
    const april = advanceVillage(start, at(601, 4, 30), null);
    const late = unsown(april, springCrop(april.season!));
    expect(late.length).toBeGreaterThan(0);
    const may = advanceVillage(april, at(601, 5, 1), null);
    const spring = springCrop(may.season!);
    expect(unsown(may, spring)).toEqual([]);
    for (const id of late) {
      expect(seasonPartIds(may.season!)).not.toContain(id);
      const part = may.parts.find((p) => p.id === id)!;
      expect(['ready', 'fallow']).toContain(part.state);
      expect(part.crop).toBeUndefined();
    }
  });

  it('velká zásoba: nezačaté nutné díly ves uvolní – vrátí se na řadu', () => {
    const s = village(40, at(600, 9, 1));
    s.season = createSeason({ winter: s.parts, spring: [] }, at(600, 9, 1), NO_CRAFTS.tools);
    sowParts(s.parts, 'winter');
    s.storesKg = 1e6;
    const next = advanceVillage(s, at(600, 9, 2), null);
    const kept = new Set(seasonPartIds(next.season!));
    expect(kept.size).toBeLessThan(40);
    for (const p of next.parts.filter((x) => !kept.has(x.id))) {
      expect(p.state).toBe('ready');
      expect(p.crop).toBeUndefined();
    }
  });

  it('po kouscích (1, 7 a 30 dní) dá stejný stav jako jedním voláním', () => {
    const start = village(120);
    start.storesKg = 200;
    const end = at(601, 6, 1);
    const whole = advanceVillage(start, end, null);
    for (const step of [1, 7, 30]) {
      let pieces = start;
      for (let day = start.lastDay + step; day < end; day += step) {
        pieces = advanceVillage(pieces, day, null);
      }
      expect(advanceVillage(pieces, end, null)).toEqual(whole);
    }
  }, 120_000);
});

describe('přesun dílů mezi plodinami (moveParts)', () => {
  it('díl si nese přípravu půdy – součet hotové práce se nezmění, setí podle nové plodiny', () => {
    const s = village(10, at(600, 10, 31));
    s.season = createSeason(
      { winter: s.parts.slice(0, 6), spring: s.parts.slice(6) },
      at(600, 9, 1),
      NO_CRAFTS.tools,
    );
    sowParts(s.parts.slice(0, 6), 'winter');
    sowParts(s.parts.slice(6), 'spring');
    const winter = seasonCrop(s.season, 'winter')!;
    const spring = springCrop(s.season);
    // ozim: zkopané 4 díly a půl pátého, zaseté 3 díly
    winter.done.dig = (winter.required.dig * 4.5) / 6;
    winter.done.sow = (winter.required.sow * 3) / 6;
    const digBefore = doneSum(s, 'dig');
    const requiredDig = winter.required.dig + spring.required.dig;
    const ids = unsown(s, winter);
    expect(ids).toEqual(winter.partIds.slice(3));
    moveParts(s, s.season, winter, spring, ids, s.lastDay, NO_CRAFTS.tools);
    expect(winter.partIds).toHaveLength(3);
    expect(spring.partIds.slice(0, 3)).toEqual(ids);
    expect(doneSum(s, 'dig')).toBeCloseTo(digBefore, 9);
    expect(winter.required.dig + spring.required.dig).toBeCloseTo(requiredDig, 9);
    // ozimu zůstaly zkopané a zaseté 3 díly, jař má napřed zbytek kopání (1,5 dílu)
    expect(taskPosition(winter, 'dig')).toBeCloseTo(1, 9);
    expect(taskPosition(winter, 'sow')).toBeCloseTo(1, 9);
    expect(spring.done.dig).toBeGreaterThan(0);
    expect(spring.done.dig).toBeCloseTo(digBefore - winter.done.dig, 9);
    expect(spring.done.sow).toBe(0);
  });
});
