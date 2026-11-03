import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { cloneState } from '../clone';
import { junctionSnap, updateJunctions, type JunctionRoads } from '../paths/junctions';
import { emptyRoads, formRoad, mergeRoadChains } from '../paths/roads-form';
import { type SpotContext } from '../paths/roads-trees';
import { trailTerrain } from '../paths/terrain';
import { ROAD_LAND } from '../rules';
import { advanceVillage } from '../simulate';
import type { Road, RoadGrade, RoadPoint, VillageRoads } from '../types';
import { village } from './abandonment-fixtures';
import { LANDSCAPE } from './paths-fixtures';

// Napojení blízko křižovatky (paths.md – Křižovatky; Martin 3. 11. 2026: „ano“ – nové napojení
// cesty blíž než rozestup křižovatek se přitáhne přímo do stávající křižovatky, pět ramen smí jedna
// křižovatka): při vzniku cesty se napojovaný úsek nerozdělí, stará dvojice (Vlkov 1131 + 1619) se
// v měsíčním úklidu sloučí do jedné hvězdy.

const DAY = dayIndexOf({ year: 601, month: 4, day: 10 });
const SEED = 4242;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Úsek z `from` do `to` – body po 4 m, na cm. */
function seg(id: number, from: RoadPoint, to: RoadPoint, grade: RoadGrade = 'improved'): Road {
  const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 4));
  const points: RoadPoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    points.push({
      x: Math.round((from.x + (to.x - from.x) * t) * 100) / 100,
      z: Math.round((from.z + (to.z - from.z) * t) * 100) / 100,
    });
  }
  return { id, points, bornDay: DAY - 3000, grade, traffic: [3], spots: [] };
}

const A = { x: 100, z: 100 };
const B = { x: 109.8, z: 100 };

/**
 * Jako Vlkov 2. 11. 2026: kříž A (vozová 1 zleva, upravené 3 a 4) a 9,8 m od něj napojení B –
 * vozová cesta rozdělená na spojku 2 (A–B) a pokračování 5, napojená upravená 6 ze severu.
 */
function vlkovLike(): Road[] {
  return [
    seg(1, { x: 60, z: 100 }, A, 'wagon'),
    seg(2, A, B, 'wagon'),
    seg(5, B, { x: 140, z: 100 }, 'wagon'),
    seg(3, A, { x: 100, z: 140 }),
    seg(4, A, { x: 100, z: 60 }),
    seg(6, { x: 135, z: 135 }, B),
  ];
}

function roadsOf(list: Road[]): VillageRoads {
  return { ...emptyRoads(DAY), nextId: 100, roads: list };
}

function netOf(roads: VillageRoads): JunctionRoads {
  return { fixed: new Set(), chain: () => mergeRoadChains(roads, []) };
}

const end = (road: Road, atStart: boolean): RoadPoint =>
  atStart ? road.points[0]! : road.points[road.points.length - 1]!;

describe('přitažení napojení do křižovatky (updateJunctions)', () => {
  it('Vlkov 1131 + 1619: napojení 9,8 m od kříže → jedna hvězda, vozová cesta zase jeden úsek', () => {
    const roads = roadsOf(vlkovLike());
    expect(updateJunctions(roads, DAY, SEED, netOf(roads))).toBe(true);
    expect(roads.junctions).toHaveLength(1);
    const j = roads.junctions![0]!;
    expect(j.shape).toBe('star');
    expect({ x: j.x, z: j.z }).toEqual(A);
    expect(j.arms).toHaveLength(5);
    // napojená cesta končí ve středu kříže, ne v B
    const joined = roads.roads.find((r) => r.id === 6)!;
    expect(end(joined, false)).toEqual(A);
    expect(end(joined, true)).toEqual({ x: 135, z: 135 });
    // vozová cesta A–B–dál je zase jeden úsek a B není uzel
    const wagon = roads.roads.filter((r) => r.grade === 'wagon');
    expect(wagon).toHaveLength(2);
    const through = wagon.find((r) => r.id !== 1)!;
    expect(through.points.some((p) => p.x === B.x && p.z === B.z)).toBe(true);
    expect([end(through, true), end(through, false)]).toContainEqual(A);
    expect([end(through, true), end(through, false)]).toContainEqual({ x: 140, z: 100 });
    expect([...j.arms].sort()).toEqual([1, 3, 4, 6, through.id].sort());
    // vozová cesta se nehnula (zemní práce na její ose)
    expect(through.points.every((p) => p.z === 100)).toBe(true);
    // podruhé nic – jednou a idempotentně
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 30, SEED, netOf(roads))).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('starší dvojice: z Y zůstane strom znamení jako strom u cesty, kříž si nechá id a znamení', () => {
    // dřív bez přitažení: obě křižovatky vznikly (cíl s pěti rameny tehdy neexistoval)
    const roads = roadsOf(vlkovLike());
    updateJunctions(roads, DAY, SEED, { fixed: new Set([6]) });
    expect(roads.junctions).toHaveLength(2);
    const cross = roads.junctions!.find((j) => j.shape === 'cross');
    const y = roads.junctions!.find((j) => j.shape === 'y');
    expect(cross!.shape).toBe('cross');
    expect(y!.shape).toBe('y');
    updateJunctions(roads, DAY + 30, SEED, netOf(roads));
    expect(roads.junctions).toHaveLength(1);
    expect(roads.junctions![0]!.id).toBe(cross!.id);
    expect(roads.junctions![0]!.landmark.kind).toBe(cross!.landmark.kind);
    if (y!.landmark.kind === 'tree') {
      expect(roads.trees.some((t) => t.id === y!.landmark.treeId)).toBe(true);
    }
  });

  it('nepřitáhne se do křižovatky s pěti rameny ani pevná napojená cesta', () => {
    const full = roadsOf([...vlkovLike(), seg(7, A, { x: 72, z: 72 })]);
    updateJunctions(full, DAY, SEED, netOf(full));
    expect(full.junctions).toHaveLength(2);
    expect(
      end(
        full.roads.find((r) => r.id === 6)!,
        false,
      ),
    ).toEqual(B);
    const fixed = roadsOf(vlkovLike());
    updateJunctions(fixed, DAY, SEED, { ...netOf(fixed), fixed: new Set([6]) });
    expect(fixed.junctions).toHaveLength(2);
  });

  it('nová osa by vedla neprůchodnou plochou víc než dosavadní → zůstane, jak je', () => {
    const roads = roadsOf(vlkovLike());
    const blocked = (p: RoadPoint): boolean => p.x > 101 && p.x < 107 && p.z > 103 && p.z < 120;
    updateJunctions(roads, DAY, SEED, { ...netOf(roads), blocked });
    expect(roads.junctions).toHaveLength(2);
  });

  it('místo a tvar nezávisí na pořadí úseků', () => {
    const a = roadsOf(vlkovLike());
    const b = roadsOf(vlkovLike().reverse());
    updateJunctions(a, DAY, SEED, netOf(a));
    updateJunctions(b, DAY, SEED, netOf(b));
    expect(json(a.junctions)).toEqual(json(b.junctions));
  });
});

describe('napojení nové cesty blízko křižovatky (junctionSnap, formRoad)', () => {
  const cross = (): Road[] => [
    seg(1, { x: 60, z: 100 }, A),
    seg(2, A, { x: 140, z: 100 }),
    seg(3, A, { x: 100, z: 140 }),
    seg(4, A, { x: 100, z: 60 }),
  ];
  const context = (): SpotContext => ({
    terrain: trailTerrain(LANDSCAPE, null),
    blocked: () => false,
    layer: null,
    changes: { removed: [], stumps: [], saplings: [] },
    seed: 7,
    split: () => {},
  });
  const trodden = ROAD_LAND.widthM.trodden;

  it('bod úseku blíž než rozestup od křižovatky na jeho konci → střed křižovatky', () => {
    const roads = roadsOf(cross());
    const east = roads.roads[1]!;
    // upravené ≈ 4,7 m dosah, vyšlapaná ≈ 3 m → rozestup ≈ 8,7 m
    expect(junctionSnap(roads, east, { x: 108, z: 100 }, trodden)).toEqual(A);
    expect(junctionSnap(roads, east, { x: 112, z: 100 }, trodden)).toBeNull();
    // uzel se dvěma cestami (bez křižovatky) nepřitahuje
    const two = roadsOf([seg(1, { x: 60, z: 100 }, A), seg(2, A, { x: 140, z: 100 })]);
    expect(junctionSnap(two, two.roads[1]!, { x: 104, z: 100 }, trodden)).toBeNull();
    // pět ramen už má – nepřitahuje
    const five = roadsOf([...cross(), seg(5, A, { x: 72, z: 72 })]);
    expect(junctionSnap(five, five.roads[1]!, { x: 104, z: 100 }, trodden)).toBeNull();
  });

  it('nová cesta z vyšlapanosti se napojí do středu křižovatky a úsek se nerozdělí', () => {
    const roads = roadsOf(cross());
    const points = [
      { x: 106, z: 130 },
      { x: 106, z: 116 },
      { x: 106, z: 104 },
    ];
    const road = formRoad(roads, points, false, 10, DAY, () => 1, context());
    expect(road).not.toBeNull();
    expect(end(road!, false)).toEqual(A);
    expect(roads.roads).toHaveLength(5);
    expect(roads.roads.find((r) => r.id === 2)!.points).toEqual(cross()[1]!.points);
    // daleko od křižovatky se úsek rozdělí jako dřív
    const far = roadsOf(cross());
    const other = formRoad(
      far,
      [
        { x: 125, z: 130 },
        { x: 125, z: 104 },
      ],
      false,
      10,
      DAY,
      () => 1,
      context(),
    );
    expect(end(other!, false)).toEqual({ x: 125, z: 100 });
    expect(far.roads).toHaveLength(6);
  });
});

describe('přitažení v dopočtu vsi', () => {
  it('po kouscích = vcelku; z dvojice je jedna hvězda a vozová cesta jeden úsek', () => {
    const s = village(DAY);
    s.lastDay = DAY;
    s.roads = { ...emptyRoads(DAY), nextId: 100, roads: vlkovLike() };
    const to = DAY + 40;
    const whole = advanceVillage(cloneState(s), to, null, LANDSCAPE);
    const pieces = advanceVillage(
      advanceVillage(cloneState(s), DAY + 13, null, LANDSCAPE),
      to,
      null,
      LANDSCAPE,
    );
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    const near = (whole.roads?.junctions ?? []).filter(
      (j) => Math.hypot(j.x - A.x, j.z - A.z) < 20,
    );
    expect(near).toHaveLength(1);
    expect(near[0]!.shape).toBe('star');
    expect(
      end(
        whole.roads!.roads.find((r) => r.id === 6)!,
        false,
      ),
    ).toEqual(A);
  }, 120_000);
});
