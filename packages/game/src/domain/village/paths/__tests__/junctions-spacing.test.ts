import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { junctionSpacingM, updateJunctions, type JunctionRoads } from '../junctions';
import { rebuildJunctionHints } from '../roads';
import { emptyRoads } from '../roads-form';
import { ROAD_LAND } from '../../rules';
import type { Road, RoadGrade, RoadPoint, Trail, VillageRoads } from '../../types';

// Křižovatky blízko sebe (paths.md – Křižovatky; Martin 24. 10. 2026 „jo, pusť se do toho“ –
// plácky dvou křižovatek se nesmějí překrývat): dvě, které se vejdou do jedné, se sloučí; jinak se
// odsunou podél spojnice na nejmenší rozestup (`junctionSpacingM`).

const DAY = dayIndexOf({ year: 601, month: 4, day: 1 });
const SEED = 4242;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const allLive: JunctionRoads = { fixed: new Set() };

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

/** Kříž a Y 8 m od sebe spojené úsekem 9 – dohromady pět cest bez spojky (vejdou se do hvězdy). */
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

/** Dva kříže 8 m od sebe spojené úsekem 9 – dohromady šest cest bez spojky (do jedné se nevejdou). */
function twoCrosses(): VillageRoads {
  const roads = crossAndY();
  roads.roads.push(seg(6, B, { x: 44, z: 0 }));
  return roads;
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

  it('kříž a Y (5 různých cest) blíž než rozestup → sloučí se do hvězdy, spojka zmizí', () => {
    const roads = crossAndY();
    updateJunctions(roads, DAY, SEED, allLive);
    const ids = roads.junctions!.map((j) => j.id);
    upgrade(roads, 'improved');
    expect(updateJunctions(roads, DAY + 30, SEED, allLive)).toBe(true);
    expect(roads.junctions).toHaveLength(1);
    const j = roads.junctions![0]!;
    expect(j.shape).toBe('star');
    expect([...j.arms].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(j.id).toBe(Math.min(...ids));
    expect({ x: j.x, z: j.z }).toEqual({ x: 4, z: 0 });
    expect(roads.roads.some((r) => r.id === 9)).toBe(false);
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 60, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('dva kříže (6 různých cest) blíž než rozestup → odsunou se podél spojky', () => {
    const roads = twoCrosses();
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
    expect(b!.arms.filter((id) => id !== null)).toHaveLength(4);
    const before = json(roads);
    expect(updateJunctions(roads, DAY + 60, SEED, allLive)).toBe(false);
    expect(json(roads)).toEqual(before);
  });

  it('šířka pro rozestup jiná než podle stupně (přestavba – budoucí vozová cesta) → odsunou se dál', () => {
    const roads = twoCrosses();
    const wagon = ROAD_LAND.widthM.wagon;
    expect(updateJunctions(roads, DAY, SEED, { ...allLive, width: () => wagon })).toBe(true);
    const min = junctionSpacingM([wagon], [wagon]);
    expect(gap(roads)).toBeGreaterThanOrEqual(min);
    expect(gap(roads)).toBeLessThan(min + 0.04);
  });

  it('pevná spojka (zemská stezka, cesta ve vylepšení) se neslučuje ani nehýbe – obě zůstanou', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    const net: JunctionRoads = { ...allLive, fixed: new Set([9]) };
    const before = JSON.stringify(roads.roads.find((r) => r.id === 9)!.points);
    updateJunctions(roads, DAY + 30, SEED, net);
    expect(roads.junctions).toHaveLength(2);
    expect(JSON.stringify(roads.roads.find((r) => r.id === 9)!.points)).toBe(before);
  });

  it('přestavba: úsek stezky (`loose`) uzel nedrží – spojka se sloučí jako volná', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    const net: JunctionRoads = { ...allLive, fixed: new Set([9]), loose: new Set([9]) };
    updateJunctions(roads, DAY + 30, SEED, net);
    expect(roads.junctions).toHaveLength(1);
    expect(roads.roads.some((r) => r.id === 9)).toBe(false);
  });

  it('přestavba: pevná ramena stezky v obou uzlech – rozestup platí (Vlkov J1130–J1356)', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    const stuck = json(roads);
    updateJunctions(stuck, DAY + 30, SEED, { ...allLive, fixed: new Set([1, 3]) });
    const min = junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]);
    expect(gap(stuck)).toBeLessThan(min);
    const fixed = new Set([1, 3]);
    updateJunctions(roads, DAY + 30, SEED, { ...allLive, fixed, loose: fixed });
    expect(roads.junctions!.length === 1 || gap(roads) >= min).toBe(true);
  });

  it('přestavba: budoucí vozová je pro rozestup křižovatek široká jako vozová (rebuildJunctionHints)', () => {
    const road = seg(1, { x: -30, z: 0 }, A, 'improved');
    const plain = rebuildJunctionHints(undefined, []);
    expect(plain.loose).toBeUndefined();
    expect(plain.width).toBeUndefined();
    const trail = { pieces: [{ roadId: 7 }] } as unknown as Trail;
    const soon = rebuildJunctionHints({ wagon: (r) => r.id === 1 }, [trail]);
    expect(soon.width?.(road)).toBe(ROAD_LAND.widthM.wagon);
    expect([...(soon.loose ?? [])]).toEqual([7]);
    // mimo budoucí vozovou beze změny
    const other = seg(2, { x: 30, z: 0 }, A, 'improved');
    expect(soon.width?.(other)).toBeUndefined();
  });

  it('křižovatka v kotvě (vchod) stojí – odsune se jen druhá, sloučí se do kotvy', () => {
    const atA = (p: RoadPoint): boolean => p.x === 0 && p.z === 0;
    const pushed = twoCrosses();
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
    const shapes = [twoCrosses(), twoCrosses()].map((roads, k) => {
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

  /** Body všech úseků jako text – k porovnání, že se pevné úseky nepohnuly. */
  const axes = (roads: VillageRoads, ids: number[]): string =>
    JSON.stringify(roads.roads.filter((r) => ids.includes(r.id)).map((r) => r.points));

  it('vozová cesta (zemní práce na její ose) se nehýbe – odsune se jen druhá křižovatka', () => {
    const roads = twoCrosses();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    for (const id of [3, 4]) roads.roads.find((r) => r.id === id)!.grade = 'wagon';
    const before = axes(roads, [3, 4]);
    const net: JunctionRoads = { ...allLive, fixed: new Set() };
    updateJunctions(roads, DAY + 30, SEED, net);
    console.log(JSON.stringify(roads.junctions!.map((j) => [j.x, j.z, j.arms])));
    expect(axes(roads, [3, 4])).toBe(before);
    expect(roads.roads.some((r) => r.id === 9)).toBe(true);
    expect(roads.junctions).toHaveLength(2);
    expect(gap(roads)).toBeGreaterThan(9);
  });

  it('vozová spojka se neslučuje a nemaže', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    roads.roads.find((r) => r.id === 9)!.grade = 'wagon';
    updateJunctions(roads, DAY + 30, SEED, allLive);
    expect(roads.roads.some((r) => r.id === 9)).toBe(true);
    expect(roads.junctions).toHaveLength(2);
  });

  it('pevné rameno v obou uzlech – nic se neposune (přijatá výjimka)', () => {
    const roads = twoYs();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    const before = axes(roads, [1, 3, 9]);
    const net: JunctionRoads = { ...allLive, fixed: new Set([1, 3]) };
    updateJunctions(roads, DAY + 30, SEED, net);
    expect(axes(roads, [1, 3, 9])).toBe(before);
    expect(roads.junctions).toHaveLength(2);
  });

  it('zablokovaný cíl – uzel se nehýbe, druhý převezme celý posun', () => {
    const roads = twoCrosses();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    // vlevo (x < 0) stojí dům: levá křižovatka se nesmí posunout doleva
    const net: JunctionRoads = { ...allLive, blocked: (p) => p.x < -0.001 };
    updateJunctions(roads, DAY + 30, SEED, net);
    const left = roads.junctions!.find((j) => j.x < 4)!;
    expect(left.x).toBe(0);
    expect(gap(roads)).toBeGreaterThanOrEqual(
      junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]),
    );
    // obě strany zablokované – nic se nepohne
    const both = twoCrosses();
    updateJunctions(both, DAY, SEED, allLive);
    upgrade(both, 'improved');
    const centers = (r: VillageRoads): string =>
      JSON.stringify(r.junctions!.map((j) => [j.x, j.z]));
    const bBefore = centers(both);
    updateJunctions(both, DAY + 30, SEED, { ...allLive, blocked: () => true });
    expect(centers(both)).toBe(bBefore);
  });

  it('úsek se posunem nezkrátí pod nejmenší délku', () => {
    // krátké rameno 16 m: odsunem o ≈ 3 m by kleslo pod MIN_ROAD_M (15) – uzel se nehýbe
    const roads = roadsOf([
      seg(1, { x: -16, z: 0 }, A),
      seg(2, { x: -30, z: -24 }, A),
      seg(9, A, B),
      seg(3, B, { x: 38, z: 24 }),
      seg(4, B, { x: 38, z: -24 }),
    ]);
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    updateJunctions(roads, DAY + 30, SEED, allLive);
    const r1 = roads.roads.find((r) => r.id === 1)!;
    const len = Math.hypot(
      r1.points.at(-1)!.x - r1.points[0]!.x,
      r1.points.at(-1)!.z - r1.points[0]!.z,
    );
    expect(len).toBeGreaterThanOrEqual(15);
  });

  it('tři křižovatky v řadě: výsledek splní rozestup nebo se ustálí, druhý průchod nic nezmění', () => {
    const net = allLive;
    const mk = (): VillageRoads =>
      roadsOf([
        seg(1, { x: -30, z: 24 }, { x: 0, z: 0 }),
        seg(2, { x: -30, z: -24 }, { x: 0, z: 0 }),
        seg(8, { x: 0, z: 0 }, { x: 8, z: 0 }),
        seg(3, { x: 8, z: 0 }, { x: 8, z: 40 }),
        seg(9, { x: 8, z: 0 }, { x: 16, z: 0 }),
        seg(5, { x: 16, z: 0 }, { x: 40, z: 24 }),
        seg(6, { x: 16, z: 0 }, { x: 40, z: -24 }),
      ]);
    const roads = mk();
    updateJunctions(roads, DAY, SEED, net);
    upgrade(roads, 'improved');
    for (let m = 1; m <= 4; m++) updateJunctions(roads, DAY + 30 * m, SEED, net);
    const centers = (): string => JSON.stringify(roads.junctions!.map((j) => [j.id, j.x, j.z]));
    const after = centers();
    // osy se mohou lišit o cm (oblouk do vchodu se počítá znovu), křižovatky stojí
    updateJunctions(roads, DAY + 30 * 6, SEED, net);
    expect(centers()).toBe(after);
    const js = roads.junctions!;
    const min = junctionSpacingM([ROAD_LAND.widthM.improved], [ROAD_LAND.widthM.improved]);
    for (let i = 0; i < js.length; i++)
      for (let k = i + 1; k < js.length; k++)
        expect(Math.hypot(js[i]!.x - js[k]!.x, js[i]!.z - js[k]!.z)).toBeGreaterThanOrEqual(
          min - 0.01,
        );
  });

  it('druhý průchod po srovnání dvojice nic nemění', () => {
    const roads = twoCrosses();
    updateJunctions(roads, DAY, SEED, allLive);
    upgrade(roads, 'improved');
    updateJunctions(roads, DAY + 30, SEED, allLive);
    const once = JSON.stringify(roads);
    expect(updateJunctions(roads, DAY + 60, SEED, allLive)).toBe(false);
    expect(JSON.stringify(roads)).toBe(once);
  });
});
