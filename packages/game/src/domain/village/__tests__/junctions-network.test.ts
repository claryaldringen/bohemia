import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstacleChangesAt } from '../obstacles';
import { cartGrid } from '../paths/cart';
import { inBuilding, type Building } from '../paths/network-grid';
import {
  bentFootprintWorse,
  drawLandmark,
  junctionArmDirs,
  junctionEntranceM,
  junctionEntrances,
  landmarkKey,
  updateJunctions,
  type JunctionRoads,
} from '../paths/junctions';
import { emptyRoads, mergeRoadChains } from '../paths/roads-form';
import { axisDistance, resample } from '../paths/roads-geometry';
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
    const draw = drawLandmark(SEED, landmarkKey(j!));
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

  it('ohyb konce přes neprůchodnou plochu se nedělá – cesta by se hned opustila (obilná jáma, Vlkov)', () => {
    // Vlkov 24. 10. 2026: krátký úsek mezi dvěma křižovatkami vede kolem obilné jámy; ohnuté konce
    // z něj udělaly tětivu přes jámu, měsíční kontrola ho opustila a z vyšlapanosti vznikl znovu
    const make = (): VillageRoads => roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
    const offLines = axisDistance(make().roads.map((r) => r.points));
    // všechno mimo původní osy (do 30 m od středu) je neprůchodné – jako jáma vedle cesty
    const blocked = (p: RoadPoint): boolean =>
      Math.hypot(p.x, p.z) < 30 && offLines(p.x, p.z) > 0.3;
    const blockedRun = (points: readonly RoadPoint[]): number => {
      let run = 0;
      let best = 0;
      for (const p of resample(points, null, 1).points) {
        run = blocked(p) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    };
    const free = make();
    updateJunctions(free, DAY, SEED, allLive);
    expect(Math.max(...free.roads.map((r) => blockedRun(r.points)))).toBeGreaterThanOrEqual(5);
    const roads = make();
    updateJunctions(roads, DAY, SEED, { ...allLive, blocked });
    expect(roads.junctions).toHaveLength(1);
    for (const r of roads.roads) expect(blockedRun(r.points)).toBeLessThan(5);
  });

  it('ohyb ramene přes stavbu se nedělá, i když ji mřížka nepozná (Vlkov – rameno 1060 přes dům)', () => {
    // Vlkov 26. 10. 2026: oblouk ramene vedl krajem polozemnice – buňka mřížky na kraji domu byla
    // průchodná (střed mimo dům), přesný obdélník domu ne
    const make = (): VillageRoads => roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
    const offLines = axisDistance(make().roads.map((r) => r.points));
    const free = make();
    updateJunctions(free, DAY, SEED, allLive);
    // dům (4 × 4 m) na místě, kudy vede oblouk mimo původní osy
    const spot = free.roads
      .flatMap((r) => resample(r.points, null, 1).points)
      .find((p) => offLines(p.x, p.z) > 1)!;
    expect(spot).toBeDefined();
    const house = (p: RoadPoint): boolean =>
      Math.abs(p.x - spot.x) < 2 && Math.abs(p.z - spot.z) < 2 && offLines(p.x, p.z) > 0.3;
    const inHouse = (r: Road): number =>
      resample(r.points, null, 1).points.filter((p) => house(p)).length;
    expect(Math.max(...free.roads.map(inHouse))).toBeGreaterThan(0);
    const roads = make();
    updateJunctions(roads, DAY, SEED, { ...allLive, footprint: house });
    expect(roads.junctions).toHaveLength(1);
    for (const r of roads.roads) expect(inHouse(r)).toBe(0);
    // ostatní ramena se ohnou dál – přes dům nevedou
    expect(roads.roads.some((r) => r.points.some((p) => offLines(p.x, p.z) > 0.5))).toBe(true);
  });

  it('ohyb ramene přes natočenou stavbu se nedělá (přesný obdélník `inBuilding`)', () => {
    const make = (): VillageRoads => roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
    const offLines = axisDistance(make().roads.map((r) => r.points));
    const free = make();
    updateJunctions(free, DAY, SEED, allLive);
    // dům 1,4 × 1,4 m natočený o 30° na oblouku, nejméně 1,6 m od původních os
    const spot = free.roads
      .flatMap((r) => resample(r.points, null, 0.5).points)
      .find((p) => offLines(p.x, p.z) > 1.6)!;
    expect(spot).toBeDefined();
    const house: Building = {
      position: { x: spot.x, z: spot.z, rotation: Math.PI / 6 },
      box: { minX: -0.7, maxX: 0.7, minZ: -0.7, maxZ: 0.7 },
    };
    const footprint = (p: RoadPoint): boolean => inBuilding(house, p.x, p.z, 0);
    const inHouse = (r: Road): number =>
      resample(r.points, null, 0.25).points.filter((p) => footprint(p)).length;
    expect(Math.max(...free.roads.map(inHouse))).toBeGreaterThan(0);
    const roads = make();
    updateJunctions(roads, DAY, SEED, { ...allLive, footprint });
    expect(roads.junctions).toHaveLength(1);
    for (const r of roads.roads) expect(inHouse(r)).toBe(0);
  });

  it('ohyb přes stavbu: rozhoduje podíl délky, ne počet vzorků (delší oblouk neprohraje délkou)', () => {
    // stavba = pás x ∈ (0,5; 3,5); neohnutá 10 m má v ní 2 vzorky z 11, oblouk 20 m 3 z 21
    const inBand = (p: RoadPoint): boolean => p.x > 0.5 && p.x < 3.5;
    const before: RoadPoint[] = [
      { x: -8, z: 0 },
      { x: 2, z: 0 },
    ];
    const after: RoadPoint[] = [
      { x: -17, z: 0 },
      { x: 3, z: 0 },
    ];
    expect(bentFootprintWorse(after, before, inBand)).toBe(false);
    // stejná délka, víc ve stavbě – horší
    expect(
      bentFootprintWorse(
        before.map((p) => ({ x: p.x + 1, z: p.z })),
        before,
        inBand,
      ),
    ).toBe(true);
    // neohnutá mimo stavbu – oblouk do ní nesmí ani kouskem
    const outside: RoadPoint[] = [
      { x: -20, z: 0 },
      { x: -10, z: 0 },
    ];
    expect(bentFootprintWorse(after, outside, inBand)).toBe(true);
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

  it('pět živých cest → dvě křižovatky 10 m od sebe a spojka (Martin, #6 bod 9)', () => {
    const roads = roadsOf([
      arm(1, 40, 0),
      arm(2, 12, 38),
      arm(3, -32, 24),
      arm(4, -32, -24),
      arm(5, 12, -38),
    ]);
    expect(updateJunctions(roads, DAY, SEED, allLive)).toBe(true);
    expect(roads.junctions).toHaveLength(2);
    const [a, b] = roads.junctions!;
    expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeCloseTo(JUNCTION.pairM, 1);
    const link = roads.roads.filter((r) => r.link);
    expect(link).toHaveLength(1);
    expect(link[0]!.points).toHaveLength(2);
    // spojka je rameno obou křižovatek, ostatní cesty každá právě jedné
    expect(a!.arms).toContain(link[0]!.id);
    expect(b!.arms).toContain(link[0]!.id);
    const used = [...a!.arms, ...b!.arms].filter((id) => id !== link[0]!.id);
    expect([...used].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(a!.arms.length + b!.arms.length).toBe(5 + 2);
    // podruhé nic
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 30, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('znamení podle místa: po zániku a novém vzniku v témže uzlu stejné, bez druhého stromu', () => {
    for (let seed = 1; seed < 60; seed++) {
      const roads = roadsOf([arm(1, 40, 0), arm(2, -40, 0), arm(3, 0, 40)]);
      updateJunctions(roads, DAY, seed, allLive);
      const first = json(roads.junctions![0]!);
      // jedna cesta osiřela → křižovatka zanikne, pak ožije
      const dead: JunctionRoads = { live: (r) => r.id !== 3, fixed: new Set() };
      updateJunctions(roads, DAY + 30, seed, dead);
      expect(roads.junctions).toBeUndefined();
      updateJunctions(roads, DAY + 60, seed, allLive);
      const again = roads.junctions![0]!;
      expect(again.id).not.toBe(first.id);
      expect(again.landmark.kind).toBe(first.landmark.kind);
      expect(again.landmark.look).toBe(first.landmark.look);
      expect(again.landmark.turn).toBe(first.landmark.turn);
      expect([again.landmark.x, again.landmark.z]).toEqual([first.landmark.x, first.landmark.z]);
      if (first.landmark.kind === 'tree') {
        expect(roads.trees).toHaveLength(1);
        expect(again.landmark.treeId).toBe(first.landmark.treeId);
      }
    }
  });
});
