import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstacleChangesAt } from '../obstacles';
import { cartGrid } from '../paths/cart';
import {
  drawLandmark,
  junctionArmDirs,
  junctionEntranceM,
  junctionEntrances,
  updateJunctions,
  type JunctionRoads,
} from '../paths/junctions';
import { emptyRoads, mergeRoadChains } from '../paths/roads-form';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { JUNCTION, ROAD_LAND } from '../rules';
import type { Road, RoadGrade, RoadPoint, VillageRoads } from '../types';
import { pathTestTerrain } from './paths-fixtures';

// Křižovatky v síti (paths.md – Křižovatky; Martin, #6: „Křižovatka vznikne, jen když se opravdu
// potkají tři nebo čtyři cesty, po kterých se chodí. Na jednom místě se nesmí potkat několik kusů
// cesty, které jsou pro hráče jedna a táž cesta.“).

const DAY = dayIndexOf({ year: 601, month: 4, day: 1 });
const SEED = 4242;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Úsek od (x, z) do středu (0, 0) – body po 4 m. */
function arm(id: number, x: number, z: number, grade: RoadGrade = 'trodden'): Road {
  const steps = Math.round(Math.hypot(x, z) / 4);
  const points: RoadPoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = 1 - k / steps;
    points.push({ x: Math.round(x * t * 100) / 100, z: Math.round(z * t * 100) / 100 });
  }
  return { id, points, bornDay: DAY - 400, grade, traffic: [3], spots: [] };
}

function roadsOf(list: Road[]): VillageRoads {
  return { ...emptyRoads(DAY), nextId: 100, roads: list };
}

const allLive: JunctionRoads = { live: () => true, fixed: new Set() };

/** Konec osy u středu: [předposlední, poslední]. */
function nodeEnd(road: Road): [RoadPoint, RoadPoint] {
  const p = road.points;
  const atStart = p[0]!.x === 0 && p[0]!.z === 0;
  return atStart ? [p[1]!, p[0]!] : [p[p.length - 2]!, p[p.length - 1]!];
}

describe('křižovatky v síti (updateJunctions)', () => {
  it('tři živé cesty (T) → Y se znamením; osa vede přesně do vchodu a po rameni do středu', () => {
    const roads = roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
    expect(updateJunctions(roads, DAY, SEED, allLive)).toBe(true);
    const [j] = roads.junctions!;
    expect(roads.junctions).toHaveLength(1);
    expect(j!.shape).toBe('y');
    expect([j!.x, j!.z]).toEqual([0, 0]);
    expect([...j!.arms].sort()).toEqual([1, 2, 3]);
    expect(j!.bornDay).toBe(DAY);
    const dirs = junctionArmDirs(j!.shape, j!.rotation, j!.spread);
    const entrances = junctionEntrances(j!, dirs, junctionEntranceM([ROAD_LAND.widthM.trodden]));
    j!.arms.forEach((id, k) => {
      const [entrance, center] = nodeEnd(roads.roads.find((r) => r.id === id)!);
      expect(entrance).toEqual(entrances[k]);
      expect(center).toEqual({ x: 0, z: 0 });
    });
    const draw = drawLandmark(SEED, j!.id);
    expect(j!.landmark.kind).toBe(draw.kind);
    expect(j!.landmark.look).toBe(draw.look);
    // podruhé nic – žádná nová id, osy beze změny
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 30, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('čtyři živé cesty → kříž; znamení stejné po změně tvaru na Y', () => {
    const roads = roadsOf([arm(1, 40, 2), arm(2, -40, 0), arm(3, 0, 40), arm(4, 1, -40)]);
    updateJunctions(roads, DAY, SEED, allLive);
    const cross = json(roads.junctions![0]!);
    expect(cross.shape).toBe('cross');
    const nextId = roads.nextId;
    // jedna cesta osiřela (provoz pod udržovacím prahem) – kříž se změní na Y, znamení zůstane
    const live: JunctionRoads = { live: (r) => r.id !== 4, fixed: new Set() };
    expect(updateJunctions(roads, DAY + 30, SEED, live)).toBe(true);
    const y = roads.junctions![0]!;
    expect(y.shape).toBe('y');
    expect(y.id).toBe(cross.id);
    expect(y.bornDay).toBe(DAY);
    expect(y.arms).not.toContain(4);
    expect({ ...y.landmark, x: 0, z: 0 }).toEqual({ ...cross.landmark, x: 0, z: 0 });
    expect(roads.nextId).toBe(nextId);
  });

  it('pahýl ani opuštěná cesta rameno nejsou; dvě živá ramena → křižovatka zanikne a cesty se spojí', () => {
    const abandoned = { ...arm(4, 0, -40), abandoned: true as const };
    const roads = roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40), abandoned]);
    const live: JunctionRoads = { live: (r) => !r.abandoned, fixed: new Set() };
    updateJunctions(roads, DAY, SEED, live);
    expect(roads.junctions![0]!.shape).toBe('y');
    expect(roads.junctions![0]!.arms).not.toContain(4);
    // odbočka zarostla a opuštěná zmizela – zbydou dvě cesty
    roads.roads = roads.roads.filter((r) => r.id === 1 || r.id === 2);
    expect(updateJunctions(roads, DAY + 30, SEED, live)).toBe(true);
    expect(roads.junctions).toBeUndefined();
    mergeRoadChains(roads, []);
    expect(roads.roads).toHaveLength(1);
  });

  it('pevné rameno (vozová cesta) leží přesně ve směru cesty a osa se neohýbá', () => {
    const wagon = arm(1, 40, 6, 'wagon');
    const roads = roadsOf([wagon, arm(2, -40, 0), arm(3, 3, 40)]);
    const axis = json(wagon.points);
    updateJunctions(roads, DAY, SEED, allLive);
    const j = roads.junctions![0]!;
    const dirs = junctionArmDirs(j.shape, j.rotation, j.spread);
    const k = j.arms.indexOf(1);
    expect(dirs[k]).toBeCloseTo(Math.atan2(6, 40), 6);
    expect(roads.roads.find((r) => r.id === 1)!.points).toEqual(axis);
  });

  it('znamení: strom jako strom u cesty, kámen jako balvan, kůl jako keř', () => {
    const kinds = new Map<string, string>();
    for (let seed = 1; seed < 40 && kinds.size < 3; seed++) {
      const roads = roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
      updateJunctions(roads, DAY, seed, allLive);
      const j = roads.junctions![0]!;
      const changes = obstacleChangesAt({ roads } as never, DAY + 3650);
      const added = changes.added ?? [];
      if (j.landmark.kind === 'tree') {
        expect(roads.trees.map((t) => t.id)).toEqual([j.landmark.treeId]);
        expect(j.landmark.treeId! - ROAD_TREE_ID_BASE).toBeGreaterThanOrEqual(100);
        expect(added.map((o) => o.id)).toEqual([j.landmark.treeId]);
        kinds.set('tree', added[0]!.kind);
      } else {
        expect(roads.trees).toEqual([]);
        expect(added).toHaveLength(1);
        kinds.set(j.landmark.kind, added[0]!.kind);
        // zanikne-li křižovatka, kámen a kůl zmizí
        roads.roads = roads.roads.slice(0, 2);
        updateJunctions(roads, DAY + 30, seed, allLive);
        expect(obstacleChangesAt({ roads } as never, DAY + 3650).added ?? []).toEqual([]);
      }
    }
    expect(kinds.get('stone')).toBe('boulder');
    expect(kinds.get('post')).toBe('shrub');
    expect(kinds.get('tree')).toBe('youngTree');
  });

  it('ohnutý konec je pro vůz sjízdný – buňky pásu cesty navazují až do středu', () => {
    const roads = roadsOf([arm(1, 40, 7), arm(2, -40, 3), arm(3, 5, 40)]);
    updateJunctions(roads, DAY, SEED, allLive);
    const grid = cartGrid({
      village: { dwellings: [], fields: [], roads: roads.roads },
      terrain: pathTestTerrain(),
    });
    expect(grid.road).toBeTruthy();
    for (const road of roads.roads) {
      const p = road.points;
      for (let k = 1; k < p.length; k++) {
        const a = p[k - 1]!;
        const b = p[k]!;
        for (let t = 0; t <= 1; t += 0.1) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const i = Math.round((x - grid.originX) / grid.cellM);
          const j = Math.round((z - grid.originZ) / grid.cellM);
          expect(grid.road![j * grid.width + i], `${road.id}: ${x}, ${z}`).toBe(1);
        }
      }
    }
  });

  it('místa na stromy do 2,2 m od ohnuté osy zmizí, dál zůstanou', () => {
    const a = arm(1, 40, 0);
    a.spots = [
      { id: 50, x: 9, z: 2.5 },
      { id: 51, x: 30, z: 3 },
    ];
    const roads = roadsOf([a, arm(2, -40, 0), arm(3, 0, 40)]);
    updateJunctions(roads, DAY, SEED, allLive);
    const axis = roads.roads.find((r) => r.id === 1)!;
    // vzdálenost od os všech tří cest (po úsečkách)
    const far = (s: { x: number; z: number }): number =>
      Math.min(
        ...roads.roads.flatMap((r) =>
          r.points.slice(1).map((b, k) => {
            const a = r.points[k]!;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const t = Math.max(
              0,
              Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / (dx * dx + dz * dz)),
            );
            return Math.hypot(a.x + dx * t - s.x, a.z + dz * t - s.z);
          }),
        ),
      );
    for (const s of axis.spots) expect(far(s)).toBeGreaterThanOrEqual(2.2);
    expect(axis.spots.map((s) => s.id)).toContain(51);
    expect(JUNCTION.bendM).toBe(12);
  });
});
