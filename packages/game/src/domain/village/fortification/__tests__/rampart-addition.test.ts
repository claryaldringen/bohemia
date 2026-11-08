import { describe, expect, it } from 'vitest';
import { gatePartView } from '../gate-parts';
import { sectionPieces, type SectionPiece } from '../section-spans';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { MARCH_RAMPART, MARCH_WALL, marchCellAt, marchGrid } from '../../../war/march-grid';
import { foundVillage } from '../../actions';
import { applyBuildIntent } from '../../build-intent';
import { cancelConstruction } from '../../cancel-construction';
import {
  addGateToFortification,
  finishFortification,
  FORT_BUSY,
  outlineOf,
  startFortification,
  villageFortifications,
  workFortification,
} from '../../fortifications';
import {
  FORT_RAMPART_DONE,
  FORT_RAMPART_NO_WALL,
  startRampartAddition,
} from '../../fortification-rampart';
import { startSectionUpgrade } from '../../fortification-upgrade';
import { FORT_OVER_BUILDING } from '../../placement-fortifications';
import type { Construction, FortKind, Fortification, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { segmentBand } from '../band';
import { fortificationCost } from '../cost';
import { squarePoints } from '../convert';
import { segmentIsGap } from '../defense';
import { segmentRampart, segmentStands, segmentWall } from '../life';
import { sectionOf } from '../sections';
import { fortSegments } from '../segments';
import { fortWalls, insideQuad } from '../walls';

// Val pod stojící hradbou (fortifications.md – Hradby a obrana, Druhy; Martin 8. 11. 2026: „Polský
// plot, palisádu a obě hradby sice mohu postavit samostatně, ale pak bych měl mít možnost doplnit
// to o val s příkopem.“): val vně hradby po úsecích, hradba stojí a brání dál. Krajina 16 × 16
// políček po 15 m, opevnění na políčkách 8–11 (svět 0–60 m).

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

/** Hotové opevnění `kind` (všechny díly dostavěné ke `DAY`) na vsi `base`. */
function built(kind: FortKind, base?: VillageState): VillageState {
  const s =
    base ?? withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
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
const outlineFor = (s: VillageState) => outlineOf(landscape, fortOf(s))!;
const shapesOf = (s: VillageState) => fortSegments(outlineFor(s));
const works = (s: VillageState): Construction[] =>
  s.constructions.filter((c) => c.kind === 'fortification');
const segOf = (s: VillageState, i: number) => fortOf(s).segments.find((x) => x.index === i)!;

/** Opevnění se dvěma branami naproti sobě – úseky A (od první brány) a B. */
function twoSections(kind: FortKind): VillageState {
  const s = built(kind);
  const n = fortOf(s).segments.length;
  const shape = shapesOf(s)[(fortOf(s).gates[0]!.segment + Math.floor(n / 2)) % n]!;
  const r = addGateToFortification(s, landscape, fortOf(s).id, {
    x: shape.mid[0],
    z: shape.mid[1],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Díly úseku A bez dílů s branou. */
function sectionA(s: VillageState): number[] {
  const fort = fortOf(s);
  const gates = fort.gates.map((g) => g.segment);
  return sectionOf(fort, gates[0]!)!.segments.filter((i) => !gates.includes(i));
}

/** Kusy úseku A přesně mezi okraji bran (`sectionPieces`). */
function piecesA(s: VillageState): SectionPiece[] {
  const fort = fortOf(s);
  const lengths = shapesOf(s).map((x) => x.lengthM);
  return sectionPieces(lengths, fort.gates, fort.gates[0]!.segment);
}

function ok(r: { ok: true; state: VillageState } | { ok: false; reason: string }): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const addRampart = (s: VillageState, segment: number | null) =>
  startRampartAddition(s, DAY, landscape, EMPTY, { fortificationId: fortOf(s).id, segment });

/** Bod `outM` m vně křivky ve středu dílu `index`. */
function outsidePoint(s: VillageState, index: number, outM: number): [number, number] {
  const shape = shapesOf(s)[index]!;
  const [mx, mz] = shape.mid;
  // střed obvodu je uvnitř – ven je směr od středu plochy (30, 30) přes střed dílu
  const dx = mx - 30;
  const dz = mz - 30;
  const len = Math.sqrt(dx * dx + dz * dz);
  return [mx + (dx / len) * outM, mz + (dz / len) * outM];
}

const inWall = (s: VillageState, p: [number, number]): boolean =>
  fortWalls(landscape, fortOf(s), null).walls.some((w) => insideQuad(w, p[0], p[1]));

describe('val pod stojící hradbou (Hradby a obrana – Druhy)', () => {
  it('úsek A dostane val vně, palisáda během stavby stojí a brání', () => {
    const s = twoSections('palisade');
    const a = sectionA(s);
    const next = ok(addRampart(s, a[0]!));
    const c = works(next)[0]!;
    expect(c.fortWork).toBe('rampart');
    // úsek A přesně po okraj bran – celé díly a kusy dílů s branou (Martin 8. 11. 2026: „Hradba je
    // hradba, brána je brána.“)
    const pieces = piecesA(s);
    const key = (w: { index: number; part?: string }): string => `${w.index}${w.part ?? ''}`;
    expect(pieces.some((p) => p.part !== undefined)).toBe(true);
    expect(c.fortSegments!.map(key).sort()).toEqual(pieces.map(key).sort());
    const labor = pieces.reduce(
      (sum, p) => sum + fortificationCost('rampart', p.lengthM).laborManDays,
      0,
    );
    expect(c.cost).toBeCloseTo(labor);
    const fort = fortOf(next);
    for (const i of a) {
      const seg = segOf(next, i);
      // hradba stojí se svým dnem a stavem, val se staví – díl není mezera
      expect(segmentWall(fort, seg)).toEqual({ kind: 'palisade', builtDay: DAY, state: 1 });
      expect(segmentRampart(fort, seg)).toMatchObject({ builtDay: null, outside: true });
      expect(segmentIsGap(fort, seg, DAY)).toBe(false);
      expect(segmentStands(fort, seg)).toBe(true);
      expect(segmentBand(fort, seg)).toEqual({ inM: 3, outM: 7 });
    }
    // úsek B beze změny
    const b = fort.segments.filter((x) => !a.includes(x.index));
    for (const seg of b) expect(segmentRampart(fort, seg)).toBeNull();
    // val se už staví
    expect(addRampart(next, a[0]!)).toEqual({ ok: false, reason: FORT_RAMPART_DONE });
    // jiná stavba na dílech úseku – val počká
    const upgrading = ok(
      startSectionUpgrade(s, DAY, landscape, EMPTY, {
        fortificationId: fortOf(s).id,
        segment: a[0]!,
        target: 'walkway',
      }),
    );
    expect(addRampart(upgrading, a[0]!)).toEqual({ ok: false, reason: FORT_BUSY });
    c.done = c.cost;
    finishFortification(next, c, DAY + 10);
    next.constructions = next.constructions.filter((x) => x.id !== c.id);
    for (const i of a) {
      const seg = segOf(next, i);
      expect(segmentRampart(fortOf(next), seg)).toMatchObject({
        builtDay: DAY + 10,
        outside: true,
      });
      expect(segmentWall(fortOf(next), seg)).toEqual({ kind: 'palisade', builtDay: DAY, state: 1 });
    }
    // kusy dílů s branou na straně A mají val, brána ne
    for (const p of pieces.filter((x) => x.part !== undefined)) {
      const seg = segOf(next, p.index);
      expect(segmentRampart(fortOf(next), gatePartView(seg, p.part!))).toMatchObject({
        builtDay: DAY + 10,
        outside: true,
      });
      expect(segmentRampart(fortOf(next), seg)).toBeNull();
    }
    // opevnění zůstane palisádou (val vně není val na křivce)
    expect(fortOf(next).kind).toBe('palisade');
    expect(addRampart(next, a[0]!)).toEqual({ ok: false, reason: FORT_RAMPART_DONE });
  });

  it('stěny sahají od zahájení 7 m ven; brány přes celý pás; staré díly beze změny', () => {
    const s = twoSections('palisade');
    const a = sectionA(s);
    const before = fortWalls(landscape, fortOf(s), null);
    const mid = a[Math.floor(a.length / 2)]!;
    const out5 = outsidePoint(s, mid, 5);
    expect(inWall(s, out5)).toBe(false);
    const next = ok(addRampart(s, a[0]!));
    expect(inWall(next, out5)).toBe(true);
    expect(inWall(next, outsidePoint(next, mid, 8))).toBe(false);
    const after = fortWalls(landscape, fortOf(next), null);
    // díly s branou a úsek B beze změny – brány stejné, úsek B vně volný
    expect(after.gates).toEqual(before.gates);
    const b = fortOf(s).segments.find(
      (x) => !a.includes(x.index) && !fortOf(s).gates.some((g) => g.segment === x.index),
    )!;
    expect(inWall(next, outsidePoint(next, b.index, 5))).toBe(false);
    // objížďka leží vně valu – žádný její bod ve stěně
    for (const p of after.detour ?? []) {
      expect(after.walls.some((w) => insideQuad(w, p[0], p[1]))).toBe(false);
    }
  });

  it('pochod: val vně se stojící hradbou je stěna, shnilá hradba nechá val', () => {
    const s = twoSections('palisade');
    const a = sectionA(s);
    const next = ok(addRampart(s, a[0]!));
    const c = works(next)[0]!;
    c.done = c.cost;
    finishFortification(next, c, DAY + 10);
    next.constructions = [];
    next.lastDay = DAY + 10;
    const mid = a[Math.floor(a.length / 2)]!;
    const p = outsidePoint(next, mid, 4);
    const grid = marchGrid(landscape, null, next);
    expect(grid.flags[marchCellAt(grid, { x: p[0], z: p[1] })]! & MARCH_WALL).toBe(MARCH_WALL);
    // hradba úseku shnilá na nulu – val stojí dál, je pás pomalého tempa
    for (const i of a) segOf(next, i).state = 0;
    for (const i of a) segOf(next, i).topBuiltDay = DAY - 365 * 200;
    const rotten = marchGrid(landscape, null, next, { day: DAY + 11 });
    const cell = marchCellAt(rotten, { x: p[0], z: p[1] });
    expect(rotten.flags[cell]! & MARCH_RAMPART).toBe(MARCH_RAMPART);
    expect(rotten.flags[cell]! & MARCH_WALL).toBe(0);
  });

  it('zrušení na půli – hotové díly mají val, ostatní jsou zase palisáda se stejným stářím', () => {
    const s = twoSections('palisade');
    const a = sectionA(s);
    segOf(s, a[1]!).extraAgeDays = 12;
    const next = ok(addRampart(s, a[0]!));
    const c = works(next)[0]!;
    const first = c.fortSegments![0]!;
    c.done = first.cost + 1e-6;
    workFortification(next, c, DAY + 2);
    const cancelled = cancelConstruction(next, DAY + 3, c.id, landscape);
    expect(works(cancelled)).toEqual([]);
    const fort = fortOf(cancelled);
    const firstSeg = segOf(cancelled, first.index);
    const firstView = first.part === undefined ? firstSeg : gatePartView(firstSeg, first.part);
    expect(segmentRampart(fort, firstView)).toMatchObject({
      builtDay: DAY + 2,
      outside: true,
    });
    for (const i of a.filter((x) => x !== first.index)) {
      const seg = segOf(cancelled, i);
      const orig = segOf(s, i);
      // díl je přesně jako před zahájením – palisáda bez valu, týž den, stav i stárnutí
      expect(seg).toEqual(orig);
      expect(segmentRampart(fort, seg)).toBeNull();
      expect(segmentIsGap(fort, seg, DAY + 3)).toBe(false);
    }
    // stěny zrušených dílů zase jen dovnitř
    const mid = a.filter((x) => x !== first.index)[0]!;
    expect(inWall(cancelled, outsidePoint(cancelled, mid, 5))).toBe(false);
  });

  it('pás ven přes obydlí – důvod; mezera bez hradby – důvod', () => {
    const s = built('palisade');
    // obydlí těsně vně jižní strany (křivka ≈ z 60 m) – pás palisády ho nezasáhne, val vně ano
    const shapes = shapesOf(s);
    const south = shapes.reduce((best, x) => (x.mid[1] > best.mid[1] ? x : best));
    s.dwellings[0]!.position = { x: south.mid[0], z: south.mid[1] + 8, rotation: 0 };
    const r = addRampart(s, null);
    expect(r).toEqual({ ok: false, reason: FORT_OVER_BUILDING });
    // celé opevnění zbořené – není pod čím val doplnit
    const gone = built('palisade');
    for (const seg of fortOf(gone).segments) seg.demolishedDay = DAY;
    expect(addRampart(gone, null)).toEqual({ ok: false, reason: FORT_RAMPART_NO_WALL });
  });

  it('val vezme díl pole venku', () => {
    const base = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
    const field = applyBuildIntent(base, base.lastDay, landscape, EMPTY, {
      kind: 'field',
      cells: block(12, 8, 2, 4),
    });
    if (!field.ok) throw new Error(field.reason);
    const s = built('palisade', field.state);
    const area = (x: VillageState): number => x.parts.reduce((sum, p) => sum + p.areaM2, 0);
    const next = ok(addRampart(s, null));
    expect(area(next)).toBeLessThan(area(s));
    expect(next.chronicle.some((e) => e.kind === 'land-taken' && e.by === 'fortification')).toBe(
      true,
    );
  });

  it('vylepšení hradby na valu vně – pás dovnitř jen šířkou hradby', () => {
    const s = twoSections('palisade');
    const a = sectionA(s);
    const next = ok(addRampart(s, a[0]!));
    const c = works(next)[0]!;
    c.done = c.cost;
    finishFortification(next, c, DAY + 10);
    next.constructions = [];
    const up = ok(
      startSectionUpgrade(next, DAY + 10, landscape, EMPTY, {
        fortificationId: fortOf(next).id,
        segment: a[0]!,
        target: 'walkway',
      }),
    );
    const w = works(up)[0]!;
    expect(w.fortWork).toBe('top');
    w.done = w.cost;
    finishFortification(up, w, DAY + 20);
    const seg = segOf(up, a[0]!);
    expect(segmentWall(fortOf(up), seg)?.kind).toBe('walkway');
    expect(segmentBand(fortOf(up), seg)).toEqual({ inM: 5.5, outM: 7 });
  });
});
