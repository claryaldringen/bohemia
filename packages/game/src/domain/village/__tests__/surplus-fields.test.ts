import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { taskPosition, taskSpans } from '../field-progress';
import { NO_CRAFTS } from '../productivity';
import { advanceVillage } from '../simulate';
import { seasonDay } from '../simulate-plan';
import type { Construction, CropWork, SeasonCrop, VillageState } from '../types';
import { seasonCrop, seasonCrops, seasonPartIds, surplusCrop } from '../year-plan';

// Díly nad potřebu (fields.md – Osevní postup po dílech a setí do konce okna, bod 3; Martin
// 25. 10. 2026: „stavby mají pořád přednost, ale vesničané neví dopředu že budou něco stavět,
// takže ve chvíli, kdy stavba přijde, prostě vesnice o část úrody přijde.“): nutné díly proti
// hladu jdou před stavbami, všechna práce dílů nad potřebu až po stavbách a opravách obydlí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole z `count` dílů po `areaM2` (úrodnost 70) od domu ven. */
const field = (count: number, areaM2: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves s polem, na kterém letos roste jař jako první osev oběhu (1. 9. čeká na ozim), a se zásobou
 * obilí na roky – nutné obilí k 1. 9. 600 je nulové, všechno obilí je nad potřebu. Bez staveb, dopočítaná
 * do 31. 8. 600.
 */
function richVillage(count = 133, areaM2 = 225): VillageState {
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field(count, areaM2) },
  });
  s.constructions = [];
  s.lastDay = at(600, 8, 31);
  s.storesKg = 20_000;
  s.meatKg = 300;
  s.parts.forEach((p) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 0;
  });
  return s;
}

/** Ves s hotovými díly bez hospodářského roku – zásoba obilí `storesKg`, bez staveb. */
function readyVillage(count: number, areaM2: number, storesKg: number): VillageState {
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field(count, areaM2) },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = at(600, 8, 31);
  s.storesKg = storesKg;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Stavba, která spotřebuje všechnu společnou práci (modla s nedostižnou cenou). */
const bigBuild = (day: number): Construction => ({
  id: 999,
  kind: 'idol',
  startedDay: day,
  cost: 1e6,
  done: 0,
  dwellingType: null,
  position: { x: 30, z: 30, rotation: 0 },
  dwellingId: null,
  fieldId: null,
});

/** Díly plodiny, na kterých setí nezačalo / začalo. */
function sowSplit(s: VillageState, work: CropWork): { sown: number[]; unsown: number[] } {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  const position = taskPosition(work, 'sow');
  const spans = taskSpans(work, byId, 'sow', s.lastDay);
  return {
    sown: spans.filter((span) => position > span.start + 1e-9).map((span) => span.id),
    unsown: spans.filter((span) => position <= span.start + 1e-9).map((span) => span.id),
  };
}

/** Hotová práce plodin (všechny úlohy i orba). */
const doneOf = (works: readonly (SeasonCrop | undefined)[]): number =>
  works.reduce(
    (sum, w) =>
      sum + (w ? Object.values(w.done).reduce((a, b) => a + b, 0) + (w.plough?.done ?? 0) : 0),
    0,
  );

/** Nutné plodiny hospodářského roku – hotová práce po plodinách. */
const neededDone = (s: VillageState): Record<string, Record<string, number>> =>
  Object.fromEntries(
    seasonCrops(s.season!)
      .filter(({ work }) => !work.surplus)
      .map(({ crop, work }) => [crop, work.done]),
  );

describe('díly nad potřebu po stavbách', () => {
  it('ves bez staveb obdělá i díly nad potřebu – ozim na podzim, jař na jaře', () => {
    const october = advanceVillage(richVillage(), at(600, 10, 31), null);
    expect(seasonCrop(october.season!, 'winter')).toBeUndefined();
    const winter = surplusCrop(october.season!, 'winter')!;
    expect(winter.partIds.length).toBeGreaterThan(5);
    // díly nad potřebu po jednom – nezasetý nanejvýš ten na čele
    expect(sowSplit(october, winter).unsown.length).toBeLessThanOrEqual(1);
    const april = advanceVillage(october, at(601, 4, 30), null);
    const spring = surplusCrop(april.season!, 'spring')!;
    expect(sowSplit(april, spring).sown.length).toBeGreaterThan(0);
  }, 60_000);

  it('bohatá ves s volnou prací zaseje do konce října všechno, co je na řadě s ozimem', () => {
    const s = advanceVillage(readyVillage(30, 225, 3_800), at(600, 10, 31), null);
    const needed = seasonCrop(s.season!, 'winter')!;
    const surplus = surplusCrop(s.season!, 'winter')!;
    expect(needed.partIds.length).toBeGreaterThan(0);
    expect(surplus.partIds.length).toBeGreaterThan(0);
    // žádný díl nezůstal na řadě ladem; len a luštěniny se sejí na jaře, ozim je celý zasetý
    expect(s.parts.filter((p) => p.state === 'ready')).toEqual([]);
    const side = [seasonCrop(s.season!, 'legume'), seasonCrop(s.season!, 'flax')];
    const sideIds = side.flatMap((w) => w?.partIds ?? []);
    expect(new Set([...needed.partIds, ...surplus.partIds, ...sideIds]).size).toBe(s.parts.length);
    expect(sowSplit(s, needed).unsown).toEqual([]);
    expect(sowSplit(s, surplus).unsown).toEqual([]);
  }, 60_000);

  it('nutné díly před stavbou – stavba stojí, dokud nutná práce v okně zbývá', () => {
    const hungry = readyVillage(30, 2_500, 0);
    const free = advanceVillage(hungry, at(600, 10, 31), null);
    const building = readyVillage(30, 2_500, 0);
    building.constructions = [bigBuild(at(600, 9, 1))];
    const busy = advanceVillage(building, at(600, 10, 31), null);
    expect(seasonCrop(busy.season!, 'winter')!.partIds.length).toBeGreaterThan(0);
    // nutné díly beze ztráty – stejná práce jako ve vsi bez stavby; stavba nedostala nic
    expect(neededDone(busy)).toEqual(neededDone(free));
    expect(busy.constructions[0]!.done).toBe(0);
  }, 60_000);

  it('stavba uprostřed okna: v okně setí se zasejí nutné díly i díly nad potřebu před stavbou', () => {
    const october = advanceVillage(readyVillage(30, 225, 3_800), at(600, 10, 12), null);
    const free = advanceVillage(october, at(600, 10, 31), null);
    const building = structuredClone(october);
    building.constructions = [bigBuild(at(600, 10, 12))];
    const busy = advanceVillage(building, at(600, 10, 31), null);
    // nutný ozim zasetý celý jako bez stavby
    const needed = seasonCrop(busy.season!, 'winter')!;
    expect(sowSplit(busy, needed).unsown).toEqual([]);
    expect(neededDone(busy)).toEqual(neededDone(free));
    // v okně setí ves oře a seje všechny díly v plánu před stavbou (fields.md – Osevní postup po
    // dílech, bod 3; Martin 6. 11. 2026) – nad potřebu zaseto jako bez stavby
    const surplusSown = (s: VillageState): number => {
      const w = surplusCrop(s.season!, 'winter');
      return w ? sowSplit(s, w).sown.length : 0;
    };
    expect(surplusSown(free)).toBeGreaterThan(0);
    expect(surplusSown(busy)).toBe(surplusSown(free));
  }, 60_000);

  it('vše nad potřebu zaseto, pak stavba vezme všechnu volnou práci – ves nehladoví', () => {
    const sown = advanceVillage(readyVillage(30, 225, 3_800), at(600, 10, 31), null);
    expect(sowSplit(sown, surplusCrop(sown.season!, 'winter')!).unsown).toEqual([]);
    const busy = structuredClone(sown);
    busy.constructions = [bigBuild(at(600, 10, 31))];
    // přes žně a výmlat do dalšího podzimu – úrodu nad potřebu vzala stavba, nutné díly ves uživí
    const summer = advanceVillage(busy, at(601, 8, 31), null);
    // po žních je hospodářský rok na humně (`threshingSeason`)
    const reaped = summer.threshingSeason ?? summer.season;
    expect(surplusCrop(reaped, 'winter')!.harvestedKg ?? 0).toBe(0);
    expect(seasonCrop(reaped, 'winter')!.harvestedKg).toBeGreaterThan(0);
    const s = advanceVillage(summer, at(601, 10, 31), null);
    expect(s.constructions.map((c) => c.id)).toContain(999);
    expect(s.chronicle.filter((e) => e.kind === 'death' && e.cause === 'hunger')).toHaveLength(0);
    expect(s.starvationDays ?? 0).toBe(0);
  }, 120_000);

  it('stavba v květnu – jař nad potřebu bez pletí; v červenci – ozim nad potřebu bez žní', () => {
    const april = advanceVillage(richVillage(), at(601, 4, 30), null);
    expect(surplusCrop(april.season!, 'spring')!.partIds.length).toBeGreaterThan(0);
    const may = structuredClone(april);
    may.constructions = [bigBuild(at(601, 4, 30))];
    const weeded = advanceVillage(april, at(601, 5, 31), null);
    const unweeded = advanceVillage(may, at(601, 5, 31), null);
    expect(surplusCrop(weeded.season!, 'spring')!.done.weed).toBeGreaterThan(0);
    expect(surplusCrop(unweeded.season!, 'spring')!.done.weed).toBe(0);

    const june = advanceVillage(weeded, at(601, 6, 30), null);
    const july = structuredClone(june);
    july.constructions = [bigBuild(at(601, 6, 30))];
    const reaped = advanceVillage(june, at(601, 7, 31), null);
    const lost = advanceVillage(july, at(601, 7, 31), null);
    expect(surplusCrop(reaped.season!, 'winter')!.harvestedKg).toBeGreaterThan(0);
    // co červenec nesklidí, zůstane na poli a žne se v srpnu (fields.md – Žně i v srpnu)
    const standing = surplusCrop(lost.season!, 'winter')!;
    expect(standing.done.harvest).toBe(0);
    expect(standing.harvestedKg).toBeNull();
    expect(standing.sheaved).toEqual({ harvest: 0, kg: 0 });
    // co žně do konce okna (31. 8.) nesklidí, propadne
    const august = structuredClone(lost);
    august.constructions = [bigBuild(at(601, 7, 31))];
    const late = advanceVillage(august, at(601, 8, 31), null);
    const unreaped = surplusCrop(late.threshingSeason, 'winter')!;
    expect(unreaped.done.harvest).toBe(0);
    expect(unreaped.harvestedKg).toBe(0);
  }, 120_000);

  it('díl nad potřebu se stane nutným, když potřeba vzroste – hotová práce zůstane', () => {
    const october = advanceVillage(richVillage(30), at(600, 10, 15), null);
    const before = surplusCrop(october.season!, 'winter')!;
    const ids = [...before.partIds];
    expect(ids.length).toBeGreaterThan(1);
    const s = structuredClone(october);
    const all = (v: VillageState): (SeasonCrop | undefined)[] =>
      seasonCrops(v.season!).map((c) => c.work);
    const done = doneOf(all(s));
    // velká potřeba (zásoby pryč) – povýšení napřed
    s.storesKg = 0;
    seasonDay(s, at(600, 10, 16), NO_CRAFTS);
    const needed = seasonCrop(s.season!, 'winter')!;
    expect(needed.partIds).toEqual(expect.arrayContaining(ids));
    expect(surplusCrop(s.season!, 'winter')).toBeUndefined();
    expect(doneOf(all(s))).toBeCloseTo(done, 9);
    expect(seasonPartIds(s.season!)).toEqual(expect.arrayContaining(ids));
  }, 60_000);

  it('volná práce na seč a v liště počítá i práci dílů nad potřebu (strop stád se nezmenší)', () => {
    const s0 = advanceVillage(richVillage(30), at(600, 9, 20), null);
    const s1 = advanceVillage(s0, at(600, 9, 21), null);
    const surplus = (v: VillageState): number =>
      doneOf([surplusCrop(v.season!, 'winter'), surplusCrop(v.season!, 'spring')]);
    const worked = surplus(s1) - surplus(s0);
    expect(worked).toBeGreaterThan(0);
    expect(s1.commonLaborHistory.at(-1)!).toBeGreaterThanOrEqual(worked - 1e-9);
  }, 60_000);

  it('po kouscích dá stejný stav jako jedním voláním', () => {
    const s0 = richVillage();
    const end = at(601, 5, 10);
    const whole = advanceVillage(s0, end, null);
    let pieces = s0;
    const steps = [1, 13, 40, 2, 77];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces).toEqual(whole);
    for (const step of [1, 7, 30]) {
      let chunks = s0;
      for (let day = s0.lastDay + step; day < end; day += step) {
        chunks = advanceVillage(chunks, day, null);
      }
      expect(advanceVillage(chunks, end, null)).toEqual(whole);
    }
  }, 240_000);
});
