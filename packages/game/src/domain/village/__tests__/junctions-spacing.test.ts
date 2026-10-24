import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { junctionSpacingM, updateJunctions, type JunctionRoads } from '../paths/junctions';
import { emptyRoads } from '../paths/roads-form';
import { ROAD_LAND } from '../rules';
import type { Road, RoadGrade, RoadPoint, VillageRoads } from '../types';

// Křižovatky blízko sebe (paths.md – Křižovatky; Martin 24. 10. 2026 „jo, pusť se do toho“ –
// plácky dvou křižovatek se nesmějí překrývat): dvě, které se vejdou do jedné, se sloučí; jinak se
// odsunou podél spojnice na nejmenší rozestup (`junctionSpacingM`).

const DAY = dayIndexOf({ year: 601, month: 4, day: 1 });
const SEED = 4242;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const allLive: JunctionRoads = { live: () => true, fixed: new Set() };

/** Úsek z `from` do `to` – body po 4 m, na cm. */
function seg(id: number, from: RoadPoint, to: RoadPoint, grade: RoadGrade = 'trodden'): Road {
  const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 4));
  const points: RoadPoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    points.push({
      x: Math.round((from.x + (to.x - from.x) * t) * 100) / 100,
      z: Math.round((from.z + (to.z - from.z) * t) * 100) / 100,
    });
  }
  return { id, points, bornDay: DAY - 400, grade, traffic: [3], spots: [] };
}

function roadsOf(list: Road[]): VillageRoads {
  return { ...emptyRoads(DAY), nextId: 100, roads: list };
}

const A = { x: 0, z: 0 };
const B = { x: 8, z: 0 };

/** Dvě Y 8 m od sebe spojené úsekem 9: vlevo cesty 1 a 2, vpravo 3 a 4. */
function twoYs(): VillageRoads {
  return roadsOf([
    seg(1, { x: -30, z: 24 }, A),
    seg(2, { x: -30, z: -24 }, A),
    seg(9, A, B),
    seg(3, B, { x: 38, z: 24 }),
    seg(4, B, { x: 38, z: -24 }),
  ]);
}

/** Kříž a Y 8 m od sebe spojené úsekem 9 – dohromady pět cest bez spojky. */
function crossAndY(): VillageRoads {
  return roadsOf([
    seg(1, { x: -30, z: 24 }, A),
    seg(2, { x: -30, z: -24 }, A),
    seg(5, { x: -36, z: 0 }, A),
    seg(9, A, B),
    seg(3, B, { x: 38, z: 24 }),
    seg(4, B, { x: 38, z: -24 }),
  ]);
}

function upgrade(roads: VillageRoads, grade: RoadGrade): void {
  for (const r of roads.roads) r.grade = grade;
}

function gap(roads: VillageRoads): number {
  const [a, b] = roads.junctions!;
  return Math.hypot(a!.x - b!.x, a!.z - b!.z);
}

describe('rozestup křižovatek (junctionSpacingM)', () => {
  it('součet dosahů plácků (vchod a půl šířky) a rezervy', () => {
    const trodden = ROAD_LAND.widthM.trodden;
    const wagon = ROAD_LAND.widthM.wagon;
    const reach = (w: number): number => Math.hypot(1.5 * w, w / 2);
    expect(junctionSpacingM([trodden], [trodden])).toBeCloseTo(2 * reach(trodden) + 1, 6);
    expect(junctionSpacingM([wagon, trodden], [wagon])).toBeCloseTo(2 * reach(wagon) + 1, 6);
    // vyšlapané ≈ 7 m, vozové ≈ 12,1 m
    expect(junctionSpacingM([1.9], [1.9])).toBeCloseTo(7.01, 2);
    expect(junctionSpacingM([3.5], [3.5])).toBeCloseTo(12.07, 2);
  });
});

describe('křižovatky blízko sebe (updateJunctions)', () => {
  it('vyšlapané 8 m od sebe – plácky se nepřekrývají, zůstanou dvě', () => {
    const roads = twoYs();
    expect(updateJunctions(roads, DAY, SEED, allLive)).toBe(true);
    expect(roads.junctions).toHaveLength(2);
    expect(gap(roads)).toBeCloseTo(8, 6);
  });

  it('dvě Y (4 různé cesty) blíž než rozestup → sloučí se do kříže, spojka zmizí', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    const [ya, yb] = roads.junctions!;
    // upravené cesty – plácky narostou (rozestup ≈ 10,5 m) a překryly by se
    upgrade(roads, 'improved');
    expect(updateJunctions(roads, DAY + 30, SEED, allLive)).toBe(true);
    expect(roads.junctions).toHaveLength(1);
    const j = roads.junctions![0]!;
    expect(j.shape).toBe('cross');
    expect([...j.arms].sort()).toEqual([1, 2, 3, 4]);
    expect({ x: j.x, z: j.z }).toEqual({ x: 4, z: 0 });
    // starší křižovatka zůstane i se znamením, spojka zmizela
    expect(j.id).toBe(Math.min(ya!.id, yb!.id));
    expect(j.landmark.kind).toBe((ya!.id < yb!.id ? ya : yb)!.landmark.kind);
    expect(roads.roads.find((r) => r.id === 9)).toBeUndefined();
    // podruhé nic
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 60, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('kříž a Y (5 různých cest) blíž než rozestup → odsunou se podél spojky', () => {
    const roads = crossAndY();
    updateJunctions(roads, DAY, SEED, allLive);
    const ids = roads.junctions!.map((j) => j.id);
    upgrade(roads, 'improved');
    expect(updateJunctions(roads, DAY + 30, SEED, allLive)).toBe(true);
    expect(roads.junctions!.map((j) => j.id)).toEqual(ids);
    const min = junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]);
    expect(gap(roads)).toBeGreaterThanOrEqual(min);
    expect(gap(roads)).toBeLessThan(min + 0.04);
    // souměrně po spojnici, spojka zůstala a vede ze středu do středu
    const [a, b] = roads.junctions!;
    expect(a!.z).toBe(0);
    expect(b!.z).toBe(0);
    expect(a!.x + b!.x).toBeCloseTo(8, 1);
    const link = roads.roads.find((r) => r.id === 9)!;
    const ends = [link.points[0]!, link.points[link.points.length - 1]!].map((p) => p.x).sort();
    expect(ends).toEqual([a!.x, b!.x].sort());
    expect(a!.arms.filter((id) => id !== null)).toHaveLength(4);
    expect(b!.arms.filter((id) => id !== null)).toHaveLength(3);
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 60, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('pevná spojka (zemská stezka, cesta ve vylepšení) se neslučuje – křižovatky se odsunou', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    const net: JunctionRoads = { ...allLive, fixed: new Set([9]) };
    expect(updateJunctions(roads, DAY + 30, SEED, net)).toBe(true);
    expect(roads.junctions).toHaveLength(2);
    expect(roads.roads.some((r) => r.id === 9)).toBe(true);
    const min = junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]);
    expect(gap(roads)).toBeGreaterThanOrEqual(min);
  });

  it('křižovatka v kotvě (vchod) stojí – odsune se jen druhá, sloučí se do kotvy', () => {
    const atA = (p: RoadPoint): boolean => p.x === 0 && p.z === 0;
    const pushed = crossAndY();
    updateJunctions(pushed, DAY, SEED, allLive);
    upgrade(pushed, 'improved');
    updateJunctions(pushed, DAY + 30, SEED, { ...allLive, anchor: atA });
    const xs = pushed.junctions!.map((j) => j.x).sort((p, q) => p - q);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThanOrEqual(
      junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]),
    );
    const merged = twoYs();
    updateJunctions(merged, DAY, SEED, allLive);
    upgrade(merged, 'improved');
    updateJunctions(merged, DAY + 30, SEED, { ...allLive, anchor: atA });
    expect(merged.junctions!.map((j) => ({ x: j.x, z: j.z }))).toEqual([{ x: 0, z: 0 }]);
  });

  it('místo a tvar nezávisí na pořadí úseků', () => {
    const shapes = [crossAndY(), crossAndY()].map((roads, k) => {
      if (k === 1) roads.roads.reverse();
      updateJunctions(roads, DAY, SEED, allLive);
      upgrade(roads, 'improved');
      updateJunctions(roads, DAY + 30, SEED, allLive);
      return roads
        .junctions!.map((j) => ({ x: j.x, z: j.z, shape: j.shape, arms: [...j.arms].sort() }))
        .sort((p, q) => p.x - q.x);
    });
    expect(shapes[0]).toEqual(shapes[1]);
  });
});
