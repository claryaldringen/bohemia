import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { isSowableFertility } from '../fields';
import { fieldPartLooks, taskPosition, taskSpans } from '../field-progress';
import { moveParts } from '../land-taken';
import { reclaimedLogs, sowParts } from '../rotation';
import { advanceVillage } from '../simulate';
import { seasonDay } from '../simulate-plan';
import type { CropWork, VillageState } from '../types';
import { NO_CRAFTS } from '../productivity';
import {
  addToCropWork,
  createSeason,
  seasonCrop,
  seasonCrops,
  seasonPartIds,
  springCrop,
} from '../year-plan';

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
    start.storesKg = 600; // hladová ves, ale s osivem – osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)
    const october = advanceVillage(start, at(600, 10, 31), null);
    const before = seasonCrop(october.season!, 'winter')!;
    // ves bere díly po dávkách na čele – na konci okna přidáme tři nezačaté, ať je co přesunout
    const added = october.parts.filter((p) => p.state === 'ready').slice(0, 3);
    addToCropWork(before, added, october.lastDay, NO_CRAFTS.tools, undefined, 'winter');
    sowParts(added, 'winter');
    const late = unsown(october, before);
    expect(late).toEqual(expect.arrayContaining(added.map((p) => p.id)));
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
    const added = april.parts.filter((p) => p.state === 'ready').slice(0, 3);
    addToCropWork(springCrop(april.season!), added, april.lastDay, NO_CRAFTS.tools);
    sowParts(added, 'spring');
    const late = unsown(april, springCrop(april.season!));
    expect(late).toEqual(expect.arrayContaining(added.map((p) => p.id)));
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

/**
 * Hladová ves ze sondy recenze (Úloha 3): 133 dílů po 225 m², čtyři lidé, zásoby 0 – u domu
 * 60 nouzových přílohů (55 %), dál 73 odpočatých (97 %).
 */
function hungryVillage(): VillageState {
  const parts: PartInput[] = Array.from({ length: 133 }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / 132),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.lastDay = at(600, 8, 31);
  // hladová ves, ale s osivem – osivo ze zásob při setí nad přežívací zásobu do žní (fields.md
  // – Úroda, Osivo ze zásob)
  s.storesKg = 800;
  s.parts.forEach((p, i) => {
    p.foundingDone = p.foundingCost;
    p.state = 'fallow';
    p.fallowSinceDay = at(590, 9, 1);
    p.fertilityShare = i < 60 ? 0.55 : 0.97;
  });
  return s;
}

/** Díly plodiny, na kterých setí začalo. */
function sownIds(s: VillageState, work: CropWork): number[] {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  const position = taskPosition(work, 'sow');
  return taskSpans(work, byId, 'sow', s.lastDay)
    .filter((span) => position > span.start + 1e-9)
    .map((span) => span.id);
}

describe('postup práce po dílech od čela (fields.md – Postup práce po dílech)', () => {
  it('hladová ves zaseje ozim i jař – nejlepší díly napřed, nouzové u domu až po nich', () => {
    const start = hungryVillage();
    const emergency = new Set(start.parts.filter((p) => !isSowableFertility(p)).map((p) => p.id));
    const october = advanceVillage(start, at(600, 10, 31), null);
    const winter = seasonCrop(october.season!, 'winter')!;
    const sownWinter = sownIds(october, winter);
    expect(sownWinter.length).toBeGreaterThanOrEqual(10);
    expect(sownWinter.filter((id) => emergency.has(id))).toEqual([]);
    // v práci je jen čelo – nezasetých dílů ozimu nanejvýš pár
    expect(unsown(october, winter).length).toBeLessThanOrEqual(3);
    const april = advanceVillage(october, at(601, 4, 30), null);
    expect(sownIds(april, springCrop(april.season!)).length).toBeGreaterThanOrEqual(10);
    expect(unsown(april, springCrop(april.season!)).length).toBeLessThanOrEqual(3);
  }, 60_000);

  it('díly přibývají po dávkách, jak se čelo posouvá – ozim roste celý podzim', () => {
    const start = village(80);
    start.storesKg = 600; // hladová ves, ale s osivem – osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)
    const first = advanceVillage(start, at(600, 9, 1), null);
    const october = advanceVillage(first, at(600, 10, 31), null);
    const n1 = seasonCrop(first.season!, 'winter')!.partIds.length;
    const winter = seasonCrop(october.season!, 'winter')!;
    expect(n1).toBeGreaterThan(0);
    expect(winter.partIds.length).toBeGreaterThan(n1);
    // ves s málem práce zaseje, co stihne – všechno přibrané až na čelo
    expect(sownIds(october, winter).length).toBeGreaterThan(n1);
    expect(unsown(october, winter).length).toBeLessThanOrEqual(1);
  }, 60_000);

  it('uvolnění nezačatých dílů: čelo práce i vzhled zbylých dílů se nepohnou', () => {
    const start = village(80);
    start.storesKg = 0;
    const dug = advanceVillage(start, at(601, 3, 25), null);
    const day = at(601, 3, 26);
    const spring = springCrop(dug.season!);
    expect(spring.done.dig).toBeGreaterThan(0);
    // k jaři přibude pět nezačatých dílů, pak ves přijde k velké zásobě
    const added = dug.parts.filter((p) => p.state === 'ready').slice(0, 5);
    addToCropWork(spring, added, dug.lastDay, NO_CRAFTS.tools);
    sowParts(added, 'spring');
    dug.storesKg = 20_000;
    // pět dílů navíc čelo zaplní – s pamětí výběru by ves nový výběr nedělala a uvolnila by až
    // první den s místem na čele; tady výběr bez paměti
    delete dug.season!.selection;
    const before = structuredClone(springCrop(dug.season!));
    const looksBefore = fieldPartLooks(dug, day);
    seasonDay(dug, day, NO_CRAFTS);
    const after = springCrop(dug.season!);
    const removed = before.partIds.filter((id) => !after.partIds.includes(id));
    expect(removed.length).toBeGreaterThan(0);
    for (const id of removed) {
      expect(looksBefore.get(id)?.work ?? 0).toBe(0);
      expect(dug.parts.find((p) => p.id === id)!.state).toBe('ready');
    }
    expect(after.partIds).toEqual(before.partIds.filter((id) => !removed.includes(id)));
    expect(after.done.dig).toBe(before.done.dig);
    expect(after.done.sow).toBe(before.done.sow);
    const looksAfter = fieldPartLooks(dug, day);
    for (const id of after.partIds) expect(looksAfter.get(id)).toEqual(looksBefore.get(id));
  }, 60_000);

  it('klády jen za skácené stromy – uvolněný vyklučený díl je podruhé nedá', () => {
    const day = at(601, 4, 29);
    const forest = (felled: boolean): VillageState => {
      const s = village(3, day);
      for (const p of s.parts) {
        Object.assign(p, { state: 'fallow', fallowSinceDay: at(575, 9, 1), overgrowthYears: 25 });
      }
      s.woodLogs = 0;
      s.storesKg = 0;
      s.season = createSeason({ winter: [], spring: s.parts }, at(600, 9, 1), NO_CRAFTS.tools);
      sowParts(s.parts, 'spring');
      const work = springCrop(s.season);
      if (felled) work.done.reclaim = work.required.reclaim;
      return s;
    };
    // přibrání ani uvolnění klády nedá; nevyklučený díl je po uvolnění zase mladý les
    const standing = forest(false);
    seasonDay(standing, day + 1, NO_CRAFTS);
    seasonDay(standing, day + 2, NO_CRAFTS);
    expect(standing.woodLogs).toBe(0);
    expect(standing.parts.every((p) => p.state !== 'fallow' || p.overgrowthYears === 25)).toBe(
      true,
    );
    // vyklučený díl dá klády jednou; 1. 5. nezasetý vypadne – vrátí se bez lesa
    const felled = forest(true);
    seasonDay(felled, day + 1, NO_CRAFTS);
    const logs = felled.woodLogs ?? 0;
    expect(logs).toBeGreaterThan(0);
    seasonDay(felled, day + 2, NO_CRAFTS);
    expect(felled.woodLogs).toBe(logs);
    expect(felled.parts.every((p) => p.state === 'fallow' && p.overgrowthYears === undefined)).toBe(
      true,
    );
    expect(reclaimedLogs(felled.parts, day + 2)).toBe(0);
  });
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

describe('výběr dílů jen s místem na čele (fields.md – Postup práce po dílech)', () => {
  it('plné čelo – ves nový výběr nedělá a čekající díly bere z posledního dne s místem', () => {
    const start = village(80);
    start.storesKg = 600;
    let s = advanceVillage(start, at(600, 9, 1), null);
    let full = 0;
    let room = 0;
    for (let day = at(600, 9, 2); day <= at(600, 10, 15); day++) {
      // nový výběr bez paměti – kolik dílů dnes opravdu přibude
      const fresh = structuredClone(s);
      delete fresh.season!.selection;
      const before = seasonPartIds(fresh.season!).length;
      const waiting = seasonDay(fresh, day, NO_CRAFTS);
      const took = seasonPartIds(fresh.season!).length - before;
      // tentýž den s pamětí výběru, kterou ves sama vytvořit nemůže
      const held = structuredClone(s);
      const marker = [{ id: -1, crop: 'winter' as const }];
      held.season!.selection = { ...fresh.season!.selection!, waiting: marker, floorKg: 7 };
      const got = seasonDay(held, day, NO_CRAFTS);
      if (got === held.season!.selection.waiting) {
        // čelo bez místa: přeskočení nic nezměnilo – nový výběr by taky žádný díl nepřibral
        full++;
        expect(took).toBe(0);
      } else {
        room++;
        expect(got).toEqual(waiting);
        expect(held.season!.selection!.waiting).toEqual(
          waiting.map(({ id, crop }) => ({ id, crop })),
        );
      }
      s = advanceVillage(s, day, null);
    }
    expect(full).toBeGreaterThan(0);
    expect(room).toBeGreaterThan(0);
  }, 60_000);
});
