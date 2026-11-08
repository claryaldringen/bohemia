import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type Landscape } from '../../../landscape';
import { MARCH_GATE, MARCH_WATER, marchCellAt, marchGrid } from '../../../war/march-grid';
import { foundVillage } from '../../actions';
import { cancelConstruction } from '../../cancel-construction';
import {
  addGateToFortification,
  finishFortification,
  FORT_BUSY,
  outlineOf,
  startFortification,
  villageFortifications,
} from '../../fortifications';
import {
  FORT_MOAT_DONE,
  FORT_MOAT_NO_RAMPART,
  FORT_MOAT_NO_WATER,
  startMoatFill,
  startRampartAddition,
} from '../../fortification-rampart';
import { FORTIFICATIONS } from '../../rules-fortifications';
import type { Construction, FortKind, Fortification, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { assaultSteps, crossingLayers } from '../assault';
import { bandLine } from '../band';
import { squarePoints } from '../convert';
import { gateChord } from '../gates';
import { segmentRampart } from '../life';
import { moatAxisOffsetM, moatSegments, moatSource } from '../moat';
import { fortSegments } from '../segments';

// Vodní příkop (fortifications.md – Hradby a obrana, Druhy; Martin 8. 11. 2026: „Další možnost
// bude napojení příkopu na vodní zdroj. Pak nelze příkopem projít, pokud se nezasype.“, v zimě
// „Má zamrznout“). Krajina 16 × 16 políček po 15 m, opevnění na políčkách 8–11 (svět 0–60 m),
// voda – sloupec políček na východě.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const WINTER = dayIndexOf({ year: 601, month: 1, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const AREA = block(8, 8, 4, 4);

/**
 * Krajina s vodou ve sloupci políček `waterX` (střed políčka x = −120 + 15 × (waterX + 0,5) m)
 * a výškami sloupců `heightOf` (m).
 */
function land(waterX: number, heightOf: (x: number) => number = () => 0): Landscape {
  return makeLandscape({
    surface: (x) => (x === waterX ? 'water' : 'meadow'),
    height: (x) => heightOf(x),
  });
}

/** Hotové opevnění `kind` (všechny díly dostavěné ke `DAY`). */
function built(landscape: Landscape, kind: FortKind): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 20000;
  const r = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, 'chamber')!,
    kind,
  });
  if (!r.ok) throw new Error(r.reason);
  const next = r.state;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY;
    seg.state = 1;
  }
  next.lastDay = DAY;
  return next;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const works = (s: VillageState): Construction[] =>
  s.constructions.filter((c) => c.kind === 'fortification');

/** Díl, jehož střed je nejdál ve směru (dx, dz). */
function sideSegment(landscape: Landscape, s: VillageState, dx: number, dz: number): number {
  const shapes = fortSegments(outlineOf(landscape, fortOf(s))!);
  let best = 0;
  for (const sh of shapes) {
    const b = shapes[best]!;
    if (sh.mid[0] * dx + sh.mid[1] * dz > b.mid[0] * dx + b.mid[1] * dz) best = sh.index;
  }
  return best;
}

function ok(r: { ok: true; state: VillageState } | { ok: false; reason: string }): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const fill = (landscape: Landscape, s: VillageState, segment: number) =>
  startMoatFill(s, DAY, landscape, { fortificationId: fortOf(s).id, segment });

/** Dokončí stavbu `c` (všechna práce odvedená). */
function finish(s: VillageState, c: Construction, day = DAY + 10): void {
  c.done = c.cost;
  finishFortification(s, c, day);
  s.constructions = s.constructions.filter((x) => x.id !== c.id);
}

/** Vzdálenost středu políčka ve sloupci `waterX` od osy příkopu dílu (v ose x). */
function axisDistance(landscape: Landscape, s: VillageState, segment: number, waterX: number) {
  const fort = fortOf(s);
  const seg = fort.segments.find((x) => x.index === segment)!;
  const line = bandLine(outlineOf(landscape, fort)!, segment, moatAxisOffsetM(fort, seg));
  const waterCenter = -120 + 15 * (waterX + 0.5);
  return Math.min(...line.map(([x]) => Math.abs(waterCenter - x)));
}

describe('zdroj vody a díly příkopu', () => {
  it('potok do 30 m od osy je zdroj, 40 m ne – důvod', () => {
    const near = land(13);
    const s = built(near, 'rampart');
    const east = sideSegment(near, s, 1, 0);
    expect(axisDistance(near, s, east, 13)).toBeLessThan(FORTIFICATIONS.moat.reachM);
    expect(moatSource(near, fortOf(s), east)).toMatchObject({ levelM: 0 });
    const far = land(14);
    const t = built(far, 'rampart');
    // osa příkopu valu na křivce leží 2 m uvnitř – políčko 14 je ≈ 40 m od ní
    expect(axisDistance(far, t, east, 14)).toBeGreaterThan(FORTIFICATIONS.moat.reachM);
    expect(moatSource(far, fortOf(t), east)).toBeNull();
    expect(fill(far, t, east)).toEqual({ ok: false, reason: FORT_MOAT_NO_WATER });
  });

  it('dno nad hladinou je suché; voda jen do souvislých dílů od zdroje', () => {
    // hřbet uprostřed (sloupce 9 a 10 – 4 m): západ i východ nízko, sever a jih přes hřbet
    const ridge = land(13, (x) => (x === 9 || x === 10 ? 4 : 0));
    const s = built(ridge, 'rampart');
    const east = sideSegment(ridge, s, 1, 0);
    const west = sideSegment(ridge, s, -1, 0);
    const north = sideSegment(ridge, s, 0, -1);
    const wet = moatSegments(ridge, fortOf(s), east);
    expect(wet).toContain(east);
    // přes hřbet voda nepřeteče – sever suchý, západ nízko, ale nesouvisí
    expect(wet).not.toContain(north);
    expect(wet).not.toContain(west);
    expect(moatSource(ridge, fortOf(s), west)).toBeNull();
    // souvislý úsek dílů
    const n = fortOf(s).segments.length;
    const sorted = new Set(wet);
    const breaks = wet.filter((i) => !sorted.has((i + 1) % n)).length;
    expect(breaks).toBe(1);
  });

  it('napuštění: cena ¼ čd na 1 m, voda až s koncem stavby; zrušení nic nenapustí', () => {
    const near = land(13);
    const s = built(near, 'rampart');
    const east = sideSegment(near, s, 1, 0);
    const wet = moatSegments(near, fortOf(s), east);
    const next = ok(fill(near, s, east));
    const c = works(next)[0]!;
    expect(c.fortWork).toBe('moat');
    const shapes = fortSegments(outlineOf(near, fortOf(s))!);
    const length = wet.reduce((sum, i) => sum + shapes[i]!.lengthM, 0);
    expect(c.cost).toBeCloseTo(0.25 * length);
    expect(fill(near, next, east)).toEqual({ ok: false, reason: FORT_BUSY });
    const cancelled = cancelConstruction(next, DAY + 1, c.id, near);
    expect(fortOf(cancelled).segments.every((x) => x.moatDay === undefined)).toBe(true);
    finish(next, c);
    for (const i of wet) {
      const seg = fortOf(next).segments.find((x) => x.index === i)!;
      expect(seg.moatDay).toBe(DAY + 10);
      expect(segmentRampart(fortOf(next), seg)?.water).toBe(true);
    }
    expect(fill(near, next, east)).toEqual({ ok: false, reason: FORT_MOAT_DONE });
  });

  it('jen na hotovém valu – palisáda bez valu důvod', () => {
    const near = land(13);
    const s = built(near, 'palisade');
    expect(fill(near, s, sideSegment(near, s, 1, 0))).toEqual({
      ok: false,
      reason: FORT_MOAT_NO_RAMPART,
    });
  });

  it('val doplněný vně palisády – osa příkopu vně, potok blíž', () => {
    const near = land(13);
    const s = built(near, 'palisade');
    const east = sideSegment(near, s, 1, 0);
    const added = ok(
      startRampartAddition(s, DAY, near, EMPTY, { fortificationId: fortOf(s).id, segment: null }),
    );
    finish(added, works(added)[0]!);
    // osa příkopu 5 m vně křivky – potok ve sloupci 13 ≈ 17,5 m
    expect(axisDistance(near, added, east, 13)).toBeLessThan(20);
    expect(moatSegments(near, fortOf(added), east)).toContain(east);
    const next = ok(fill(near, added, east));
    finish(next, works(next)[0]!);
    expect(fortOf(next).segments.find((x) => x.index === east)!.moatDay).toBe(DAY + 10);
  });
});

describe('vodní příkop v pochodu a přechodu', () => {
  /** Ves s napuštěným příkopem a branou na východě. */
  function watered(): { landscape: Landscape; s: VillageState; east: number } {
    const landscape = land(13);
    const base = built(landscape, 'rampart');
    const east = sideSegment(landscape, base, 1, 0);
    const shape = fortSegments(outlineOf(landscape, fortOf(base))!)[east]!;
    const gated = ok(
      addGateToFortification(base, landscape, fortOf(base).id, {
        x: shape.mid[0],
        z: shape.mid[1],
      }),
    );
    const next = ok(fill(landscape, gated, (east + 1) % fortOf(gated).segments.length));
    finish(next, works(next)[0]!);
    next.lastDay = DAY + 10;
    return { landscape, s: next, east };
  }

  it('napuštěný příkop je v mřížce pochodu voda, 15. 1. zamrzlý ne; brána má hráz', () => {
    const { landscape, s, east } = watered();
    const fort = fortOf(s);
    const outline = outlineOf(landscape, fort)!;
    const shapes = fortSegments(outline);
    const watery = fort.segments.filter((x) => x.moatDay !== undefined).map((x) => x.index);
    expect(watery).toContain(east);
    // osa příkopu dílu vedle brány (2 m uvnitř křivky)
    const next = (east + 1) % fort.segments.length;
    const axis = bandLine(outline, next, 2);
    const p = axis[Math.floor(axis.length / 2)]!;
    const grid = marchGrid(landscape, null, s);
    const cell = marchCellAt(grid, { x: p[0], z: p[1] });
    expect(grid.flags[cell]! & MARCH_WATER).toBe(MARCH_WATER);
    expect(grid.pace[cell]).toBe(0);
    const winter = marchGrid(landscape, null, s, { day: WINTER });
    expect(winter.flags[marchCellAt(winter, { x: p[0], z: p[1] })]! & MARCH_WATER).toBe(0);
    // brána: hráz přes příkop – buňka otvoru brány průchozí, ne voda
    const gate = fort.gates.find((g) => g.segment === east)!;
    const chord = gateChord(outline, shapes[east]!, gate);
    const gx = (chord.a[0] + chord.b[0]) / 2 - 4;
    const gz = (chord.a[1] + chord.b[1]) / 2;
    const gateCell = marchCellAt(grid, { x: gx, z: gz });
    expect(grid.flags[gateCell]! & MARCH_GATE).toBe(MARCH_GATE);
    expect(grid.flags[gateCell]! & MARCH_WATER).toBe(0);
  });

  it('přechod: mimo bránu zasypat příkop, branou bez zasypání', () => {
    const { s, east } = watered();
    const fort = fortOf(s);
    const seg = fort.segments.find((x) => x.index === east)!;
    const atGate = assaultSteps(crossingLayers(fort, seg, DAY + 10, true));
    expect(atGate.every((x) => x.fill === null)).toBe(true);
    const beside = assaultSteps(crossingLayers(fort, seg, DAY + 10, false));
    expect(beside.every((x) => x.fill === 'moat')).toBe(true);
    // v zimě zamrzlý – ani mimo bránu
    const frozen = assaultSteps(crossingLayers(fort, seg, WINTER, false));
    expect(frozen.every((x) => x.fill === null)).toBe(true);
  });
});
