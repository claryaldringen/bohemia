import { ROAD_LAND, roadLandWidthM } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneRoad, SceneVillage } from '../../village-view';
import { dayStints } from '../plough-day';
import { MIN_ROW_PIECE_M, roadPieces, villageRoadCapsules } from '../plough-roads';
import {
  ardReach,
  pathAt,
  ploughPath,
  ploughRoute,
  routeFurrows,
  stintRowCount,
  type PloughField,
  type RouteTrack,
} from '../plough-team';

// Brázdy končí na cestě (oxen.md – Brázdy končí na cestě; Martin, 19. 10. 2026: „pokud oráč
// narazí na cestu, tak spřežení otočí“): řady pruhu přes pás pevné cesty se lámou, spřežení se
// na cestě otočí a přes ni neorá; kousek oddělený cestou se neorá.

const CELL = 15;
const road = (id: number, points: [number, number][]): SceneRoad => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  grade: 'trodden',
});
const HALF = roadLandWidthM({ grade: 'trodden' }) / 2;

/** Pás tří dílů podél x (x 0–45 m, z 0–15 m), pruh napříč 0–6 m od z = 0. */
const strip = (): PloughField => ({
  x: 22.5,
  z: 7.5,
  size: CELL,
  length: 3 * CELL,
  dirX: 1,
  dirZ: 0,
  rows: 8,
  from: -7.5,
  to: -1.5,
  acrossX: 0,
  acrossZ: 1,
});

describe('pruh orby přes pevnou cestu', () => {
  it('bez cesty pruh beze změny; cesta napříč ho rozdělí na dva kusy, řady končí u pásu', () => {
    const field = strip();
    expect(roadPieces(field, [])).toEqual([field]);
    // cesta mimo pruh (z 40 m) ho nedělí
    expect(
      roadPieces(
        field,
        villageRoadCapsules({
          roads: [
            road(1, [
              [0, 40],
              [45, 40],
            ]),
          ],
        }),
      ),
    ).toEqual([field]);
    // cesta x = 30 m napříč přes pruh
    const capsules = villageRoadCapsules({
      roads: [
        road(1, [
          [30, -20],
          [30, 40],
        ]),
      ],
    });
    const pieces = roadPieces(field, capsules);
    expect(pieces).toHaveLength(2);
    const rows = stintRowCount(field);
    for (const piece of pieces) {
      expect(piece.rows).toBe(rows);
      expect(piece.rowRuns).toHaveLength(rows);
      expect(piece.rowRuns!.every((r) => r !== null)).toBe(true);
    }
    // podél řad od středu pruhu (x 22,5): první kus do 7,5 − pás, druhý od 7,5 + pás
    for (const r of pieces[0]!.rowRuns!) {
      expect(r!.lo).toBeCloseTo(-22.5, 9);
      expect(r!.hi).toBeCloseTo(7.5 - HALF, 9);
    }
    for (const r of pieces[1]!.rowRuns!) {
      expect(r!.lo).toBeCloseTo(7.5 + HALF, 9);
      expect(r!.hi).toBeCloseTo(22.5, 9);
    }
  });

  it('spřežení přes cestu neorá – brázda jen mimo pás, obrat na cestě obloukem', () => {
    const capsules = villageRoadCapsules({
      roads: [
        road(1, [
          [30, -20],
          [30, 40],
        ]),
      ],
    });
    const pieces = roadPieces(strip(), capsules);
    const route = ploughRoute(pieces.map((field) => ({ fieldId: 1, partId: 1, field })));
    expect(route.stints).toHaveLength(2);
    // řady rádla v zemi: žádná nezasahuje do pásu cesty (x 30 ± půl šířky)
    for (const planned of route.stints) {
      for (const row of planned.rows) {
        const lo = planned.stint.field.x + row.lo;
        const hi = planned.stint.field.x + row.hi;
        expect(hi <= 30 - HALF + 1e-9 || lo >= 30 + HALF - 1e-9).toBe(true);
      }
    }
    // jho dojede o dosah rádla za konec řady – na cestu (otáčí se na ní)
    const first = route.stints[0]!;
    const turnU = Math.max(
      ...first.rows.map((row) => {
        const seg = route.segments[row.segment]!;
        return seg.kind === 'line' ? Math.max(seg.x, seg.x + seg.dx * seg.length) : -Infinity;
      }),
    );
    expect(turnU).toBeCloseTo(30 - HALF + ardReach(), 6);
    // brázda za rádlem na konci dne – jen mimo pás cesty
    const track: RouteTrack = { route, startMs: 0, endMs: 1000 };
    for (const band of routeFurrows(track, 1000)) {
      const ends = [band.x + band.along[0] * band.from, band.x + band.along[0] * band.to];
      const lo = Math.min(...ends);
      const hi = Math.max(...ends);
      expect(hi <= 30 - HALF + 1e-6 || lo >= 30 + HALF - 1e-6).toBe(true);
    }
  });

  it('šikmá cesta: rádlo jede po ose řady, brázda po projetí řady po celé šířce až k cestě', () => {
    // cesta pod 45° (x − z = 10) – osa řady ve výšce z ji kříží v x = z + 10
    const capsules = villageRoadCapsules({
      roads: [
        road(1, [
          [-10, -20],
          [50, 40],
        ]),
      ],
    });
    const field = strip();
    const pieces = roadPieces(field, capsules);
    expect(pieces).toHaveLength(2);
    const spacing = (field.to! - field.from!) / stintRowCount(field);
    const across = HALF * Math.SQRT2;
    pieces[0]!.rowRuns!.forEach((r, k) => {
      const z = field.z + field.from! + (k + 0.5) * spacing;
      // osa řady končí u pásu cesty, horní okraj řady (dál od cesty) o půl řady dál
      expect(r!.hi).toBeCloseTo(z + 10 - across - field.x, 6);
      expect(r!.fillHi).toBeCloseTo(r!.hi + spacing / 2, 6);
    });
    // na konci dne sahá brázda každé řady až k cestě
    const route = ploughRoute(pieces.map((f) => ({ fieldId: 1, partId: 1, field: f })));
    const bands = routeFurrows({ route, startMs: 0, endMs: 1000 }, 1000);
    const first = bands.filter((b) => b.to < 0);
    expect(first).toHaveLength(stintRowCount(field));
    for (const [k, band] of first.entries()) {
      expect(band.to).toBeCloseTo(pieces[0]!.rowRuns![k]!.fillHi!, 6);
    }
  });

  it('cesta končí uprostřed pruhu – řady za koncem cesty jdou celé; kus kratší než minimum ne', () => {
    // cesta x = 30 m jen do z = 3 (pruh z 0–6) – kulatý konec pásu
    const capsules = villageRoadCapsules({
      roads: [
        road(1, [
          [30, -20],
          [30, 3],
        ]),
      ],
    });
    const pieces = roadPieces(strip(), capsules);
    const runs = pieces.flatMap((p) => p.rowRuns!.flatMap((r, k) => (r ? [{ k, ...r }] : [])));
    // každá řada je pokryta (celá, nebo dvěma kusy kolem cesty)
    const rows = stintRowCount(strip());
    for (let k = 0; k < rows; k++) {
      const mine = runs.filter((r) => r.k === k);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r.hi - r.lo >= MIN_ROW_PIECE_M)).toBe(true);
    }
    // řada daleko za koncem cesty (z ≈ 5,6) celá
    const top = runs.filter((r) => r.k === rows - 1);
    expect(top).toHaveLength(1);
    expect(top[0]!.hi - top[0]!.lo).toBeCloseTo(45, 9);
  });

  it('lichý počet řad v kusu – uzavřená dráha se vrátí na začátek první řady', () => {
    // jen tři spodní řady pruhu (nad nimi cesta podél řad)
    const run = { lo: -20, hi: 5 };
    const field: PloughField = {
      ...strip(),
      rowRuns: [run, run, run, null, null, null, null, null],
    };
    const path = ploughPath(field);
    const start = pathAt(path, 0, { x: 0, z: 0, hx: 0, hz: 1 });
    const end = pathAt(path, path.length - 1e-6, { x: 0, z: 0, hx: 0, hz: 1 });
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(1e-3);
    expect(end.hx * start.hx + end.hz * start.hz).toBeCloseTo(1, 3);
    // otevřená trasa dne s lichým počtem řad končí na protější straně
    const route = ploughRoute([{ fieldId: 1, partId: 1, field }]);
    expect(route.stints[0]!.rows).toHaveLength(3);
    expect(route.stints[0]!.rows.map((r) => r.dir)).toEqual([1, -1, 1]);
  });

  it('kousek pole oddělený cestou (roadCut) se neorá', () => {
    const capsules = villageRoadCapsules({
      roads: [
        road(1, [
          [37.5, -20],
          [37.5, 40],
        ]),
      ],
    });
    // třetí díl (x 30–45): buňky za cestou (x > 37,5) oddělené – celé sloupce za cestou
    const n = ROAD_LAND.cells;
    const cutRow = (1 << n) - (1 << Math.ceil(n / 2));
    const part = (cx: number, extra: Partial<SceneFieldPart> = {}): SceneFieldPart => ({
      id: 10 + cx,
      cell: { x: cx, y: 0 },
      x: cx * CELL + CELL / 2,
      z: CELL / 2,
      size: CELL,
      stage: 'sown',
      ...extra,
    });
    const parts = [part(0), part(1), part(2, { roadCut: Array.from({ length: n }, () => cutRow) })];
    const pieces = roadPieces(strip(), capsules, parts);
    // zbude jen kus před cestou
    expect(pieces).toHaveLength(1);
    for (const r of pieces[0]!.rowRuns!) expect(r!.hi).toBeCloseTo(15 - HALF, 9);
  });
});

describe('orba dne přes cestu (dayStints)', () => {
  it('pás přes cestu – dva pruhy dne, oba s díly pásu', () => {
    const furrow = { axis: 'x' as const, sweep: 1 as const };
    const parts: SceneFieldPart[] = [0, 1, 2].map((cx) => ({
      id: 61 + cx,
      cell: { x: cx, y: 0 },
      x: cx * CELL + CELL / 2,
      z: CELL / 2,
      size: CELL,
      stage: 'sown',
      look: 'plowed',
      furrow,
      work: 0.5,
      before: 'stubble',
    }));
    const village: SceneVillage = {
      dwellings: [
        {
          id: 1,
          type: 'zemnice',
          position: { x: 0, z: -20, rotation: 0 },
          built: true,
          progress: 1,
        },
      ],
      fields: [{ id: 5, parts, ard: true }],
      roads: [
        road(1, [
          [30, -20],
          [30, 40],
        ]),
      ],
      labor: {
        day: 250,
        month: 9,
        people: { children: 0, adults: 4, elders: 0 },
        shares: [
          {
            activity: 'plough',
            target: { kind: 'field', id: 5 },
            manDays: 2,
            parts: [61, 62, 63],
            progress: [
              [0, 0.5],
              [0, 0.5],
              [0, 0.5],
            ],
          },
        ],
      },
    };
    const stints = dayStints(village);
    expect(stints).toHaveLength(2);
    for (const stint of stints) {
      expect(stint.partIds).toEqual([61, 62, 63]);
      expect(stint.field.rowRuns).toBeDefined();
    }
    const without = dayStints({ ...village, roads: [] });
    expect(without).toHaveLength(1);
    expect(without[0]!.field.rowRuns).toBeUndefined();
  });
});
