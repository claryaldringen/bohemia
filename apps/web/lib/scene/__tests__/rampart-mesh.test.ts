import { describe, expect, it } from 'vitest';
import {
  RAMPART,
  crownLift,
  ditchCuts,
  fortStakingLines,
  moatIceOn,
  moatWaterLine,
  moatWaterRuns,
  palisadeLayout,
  segmentBuild,
} from '../fortification-layout';
import type { SceneFortification } from '../../fort-view';
import { demoFortification, type DemoFort, SHOWCASE_FORT_GEO } from '../fortification-showcase';
import { moatWaterMeshData, rampartMeshData } from '../rampart-mesh';

// Val vně hradby a vodní příkop ve scéně (plán hradeb Úloha 18; fortifications.md – Hradby
// a obrana, Druhy – val doplněný vně, vodní příkop; Martin 8. 11. 2026: led „Má zamrznout“).

const fort = (o: Partial<DemoFort> = {}): SceneFortification =>
  demoFortification(
    {
      id: 3,
      kind: 'palisade',
      cells: { x: 8, y: 8, w: 6, h: 6 },
      gates: [{ segment: 1 }],
      age: () => 3,
      ...o,
    },
    SHOWCASE_FORT_GEO,
  );
const flat = (): number => 0;

/** Vzdálenost bodu od uzavřené lomené čáry `line`. */
function distanceTo(line: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/** Leží bod uvnitř mnohoúhelníku `poly` (paprsek)? */
function inside(poly: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Úsek, k jehož lomené čáře má bod nejblíž. */
function nearestSegment(f: SceneFortification, x: number, z: number): number {
  let best = { index: -1, d: Infinity };
  for (const shape of f.shapes) {
    const d = distanceTo(shape.path, x, z);
    if (d < best.d) best = { index: shape.index, d };
  }
  return best.index;
}

describe('val vně hradby', () => {
  it('osa příkopu leží 5 m vně křivky (val vně posunutý o 7 m ven)', () => {
    const f = fort({ outside: {} });
    const cuts = ditchCuts(f);
    expect(cuts.length).toBeGreaterThan(0);
    for (const c of cuts) {
      for (const [x, z] of [
        [c.ax, c.az],
        [c.bx, c.bz],
      ] as const) {
        expect(inside(f.outline, x, z)).toBe(false);
        expect(distanceTo(f.outline, x, z)).toBeGreaterThan(4.6);
        expect(distanceTo(f.outline, x, z)).toBeLessThan(5.4);
      }
    }
  });

  it('palisáda stojí na místě a zvedne se na korunu valu', () => {
    const plain = fort();
    const outside = fort({ outside: {} });
    const before = palisadeLayout(plain, crownLift(plain)).stakes;
    const after = palisadeLayout(outside, crownLift(outside)).stakes;
    expect(after.length).toBe(before.length);
    after.forEach((s, i) => {
      expect(s.x).toBeCloseTo(before[i]!.x, 6);
      expect(s.z).toBeCloseTo(before[i]!.z, 6);
    });
    expect(before.every((s) => s.lift === 0)).toBe(true);
    const lifts = after.map((s) => s.lift).sort((a, b) => a - b);
    expect(lifts[Math.floor(lifts.length / 2)]).toBeCloseTo(RAMPART.heightM, 1);
  });

  it('síť valu leží před křivkou, bez valu vně palisáda žádnou nemá', () => {
    expect(rampartMeshData(fort(), flat).earth.indices).toHaveLength(0);
    const f = fort({ outside: {} });
    const mesh = rampartMeshData(f, flat);
    expect(mesh.earth.indices.length + mesh.grass.indices.length).toBeGreaterThan(0);
    // nejnižší bod (dno příkopu) leží vně křivky
    const pos = mesh.earth.positions;
    let low = 0;
    for (let i = 1; i < pos.length; i += 3) if (pos[i]! < pos[low * 3 + 1]!) low = (i - 1) / 3;
    expect(inside(f.outline, pos[low * 3]!, pos[low * 3 + 2]!)).toBe(false);
    expect(pos[low * 3 + 1]!).toBeLessThan(-RAMPART.ditchDepthM + 0.1);
  });

  it('hradba pod dosypávaným valem stojí dál, val roste s prací', () => {
    const f = fort({
      age: () => null,
      outside: {},
      work: { kind: 'rampart', progress: (s) => (s === 0 ? 0.5 : 0) },
    });
    const b = segmentBuild(f, 0);
    expect(b.top?.layer).toBe('palisade');
    expect(b.rampart).toMatchObject({ earth: 0.5, outside: true });
    expect(segmentBuild(f, 2).top?.layer).toBe('palisade');
    // vytyčení nehotového valu vně – před křivkou
    const lines = fortStakingLines(f);
    expect(lines.length).toBeGreaterThan(0);
    expect(
      lines.flat().some(([x, z]) => !inside(f.outline, x, z) && distanceTo(f.outline, x, z) > 6),
    ).toBe(true);
  });
});

describe('vodní příkop', () => {
  it('voda jen v dílech s napuštěným příkopem, ne v průchodu brány', () => {
    expect(moatWaterLine(fort({ outside: {} }))).toEqual([]);
    const water = [0, 2, 3];
    const f = fort({ outside: { water } });
    const lines = moatWaterLine(f);
    expect(lines.length).toBeGreaterThan(0);
    const starts = f.shapes.map((s) => s.path[0]!);
    for (const [x, z] of lines.flat()) {
      // u hranice dílů se úseky prolnou (osa 5 m vně) – bod kousek od ní se nepočítá
      if (starts.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 7)) continue;
      expect(water).toContain(nearestSegment(f, x, z));
    }
    const gate = f.gates[0]!;
    for (const [x, z] of lines.flat())
      expect(Math.hypot(x - gate.x, z - gate.z)).toBeGreaterThan(2);
  });

  it('hladina je v příkopu pod okrajem, celý obvod s vodou bez brány je jeden kus', () => {
    const all = fort({
      gates: [],
      outside: { water: Array.from({ length: 60 }, (_, i) => i) },
    });
    const runs = moatWaterRuns(all);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run[0]!.axis).toEqual(run[run.length - 1]!.axis);
    for (const w of run) {
      expect(w.below).toBeGreaterThan(0.3);
      expect(w.below).toBeLessThan(RAMPART.ditchDepthM);
    }
    const mesh = moatWaterMeshData(all, flat);
    expect(mesh.indices.length).toBe((run.length - 1) * 6);
    for (let i = 1; i < mesh.positions.length; i += 3) expect(mesh.positions[i]!).toBeLessThan(0);
  });

  it('led od 1. 12. do konce února (jako moatFrozen v jádru)', () => {
    expect(moatIceOn(334)).toBe(false);
    expect(moatIceOn(335)).toBe(true);
    expect(moatIceOn(1)).toBe(true);
    expect(moatIceOn(59.5)).toBe(true);
    expect(moatIceOn(60)).toBe(false);
    expect(moatIceOn(196)).toBe(false);
  });
});
