import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { cloneState } from '../clone';
import { naturalHeightAt } from '../paths/earthworks';
import { DWELLING_PATH_BOX_M, inBuilding } from '../paths/network-grid';
import { emptyRoads } from '../paths/roads-form';
import { axisDistance, resample } from '../paths/roads-geometry';
import { rebuildRoads, withRoadsRebuilt } from '../paths/roads-rebuild';
import { routeLine } from '../paths/routes';
import { pathCellM } from '../paths/terrain';
import { refreshWalkDistances } from '../paths/village';
import { encodeWear, wearCellsOf } from '../paths/wear';
import { advanceVillage } from '../simulate';
import type { Road, RoadEarthwork, RoadPoint, VillageState } from '../types';
import {
  buildWagonRoadNow,
  planWagonRoad,
  startWagonRoad,
  wagonPlanInputOf,
  wagonRoadsDay,
} from '../wagon-road';
import { village } from './abandonment-fixtures';
import { LANDSCAPE } from './paths-fixtures';

// Jednorázová přestavba sítě (paths.md – Jednorázová přestavba sítě; Martin 24. 10. 2026,
// varianta A): cesty vzniknou znovu z vyšlapanosti dnešních tras, vylepšení se přenesou.

const START = dayIndexOf({ year: 601, month: 4, day: 10 });

function road(id: number, points: readonly RoadPoint[], grade: Road['grade'] = 'trodden'): Road {
  return {
    id,
    points: points.map((p) => ({ x: p.x, z: p.z })),
    bornDay: START - 3000,
    grade,
    traffic: [3],
    spots: [],
  };
}

/**
 * Ves se čtyřmi zemnicemi, trasami a vyšlapaností podél nich (jako by se tudy chodilo léta) a se
 * starými cestami: vyšlapaná přes dům 1, pahýl daleko od vsi a upravená bez hatě po nejsilnější trase.
 */
function oldVillage(): { state: VillageState; improved: RoadPoint[] } {
  const s = village(START);
  s.lastDay = START;
  const roads = emptyRoads(START);
  delete roads.rebuilt;
  roads.nextId = 100;
  s.roads = roads;
  refreshWalkDistances(s, START, LANDSCAPE, null);
  const cellM = pathCellM(LANDSCAPE);
  const cells = new Map<number, number>();
  for (const r of s.routes!.list) for (const c of wearCellsOf(r, cellM)) cells.set(c, 150_000);
  roads.wear = { day: START, cells: encodeWear(cells), labor: [] };
  const strongest = [...s.routes!.list].sort((a, b) => b.trips - a.trips)[0]!;
  const improved = routeLine(strongest, cellM);
  roads.roads.push(
    road(1, [
      { x: -12, z: 0 },
      { x: 12, z: 0 },
    ]),
    road(2, [
      { x: 150, z: 150 },
      { x: 172, z: 150 },
    ]),
    { ...road(3, improved, 'improved'), unbridged: true },
  );
  return { state: s, improved };
}

/** Délka živých os v půdorysech domů (m, po 0,25 m) – bez konců os (cesta končí u dveří). */
function inHouses(s: VillageState): number {
  let sum = 0;
  for (const d of s.dwellings) {
    const house = { position: d.position, box: DWELLING_PATH_BOX_M[d.type] };
    for (const r of s.roads!.roads.filter((x) => !x.abandoned)) {
      const ends = [r.points[0]!, r.points[r.points.length - 1]!];
      const inside = resample(r.points, null, 0.25).points.filter(
        (p) =>
          inBuilding(house, p.x, p.z, 0) &&
          ends.every((e) => Math.hypot(e.x - p.x, e.z - p.z) > END_M),
      );
      sum += inside.length * 0.25;
    }
  }
  return sum;
}

/** Konec osy smí ležet u dveří – tolik m od konce se nepočítá. */
const END_M = 3;

describe('rebuildRoads – jednorázová přestavba sítě', () => {
  it('cesta přes dům a pahýl zmizí, nové cesty vedou po trasách, upravená se přenese', () => {
    const { state, improved } = oldVillage();
    const before = JSON.stringify(state);
    expect(inHouses(state)).toBeGreaterThan(5);
    const next = rebuildRoads(state, LANDSCAPE, null);
    // vstup se nemění, kronika taky ne
    expect(JSON.stringify(state)).toBe(before);
    expect(next.chronicle).toHaveLength(state.chronicle.length);
    const roads = next.roads!.roads;
    expect(roads.length).toBeGreaterThan(0);
    // stará cesta přes dům zmizela; osa nové cesty smí zjednodušením seříznout roh domu (vznik
    // za běhu, `roadAxisOf`) a konec u křižovatky, který se do domu neohne (`bendEnd`) – skrz dům
    // nevede
    expect(inHouses(next)).toBeLessThan(3);
    expect(roads.some((r) => r.points.some((p) => p.x > 140 && p.z > 140))).toBe(false);
    expect(roads.some((r) => r.id < 100)).toBe(false);
    // upravená: nový úsek po staré ose je upravený i s hatí a lávkou
    const old = axisDistance([improved]);
    const upgraded = roads.filter((r) => r.grade === 'improved');
    expect(upgraded.length).toBeGreaterThan(0);
    for (const r of upgraded) {
      expect(r.unbridged).toBeUndefined();
      const near = resample(r.points, null, 2).points.filter((p) => old(p.x, p.z) <= 4);
      expect(near.length / resample(r.points, null, 2).points.length).toBeGreaterThanOrEqual(0.6);
    }
    // vyšlapané nové cesty od staré upravené osy vedou jinudy
    for (const r of roads.filter((x) => x.grade === 'trodden')) {
      const pts = resample(r.points, null, 2).points;
      expect(pts.filter((p) => old(p.x, p.z) <= 4).length / pts.length).toBeLessThan(0.6);
    }
  }, 120_000);

  it('příznak jednou a idempotentně, nová ves ho má od začátku', () => {
    const { state } = oldVillage();
    state.roads!.v2 = true;
    const once = withRoadsRebuilt(state, LANDSCAPE, null);
    expect(once).not.toBe(state);
    expect(once.roads!.rebuilt).toBe(1);
    expect(withRoadsRebuilt(once, LANDSCAPE, null)).toBe(once);
    expect(emptyRoads(START).rebuilt).toBe(1);
    // ves bez tras nebo bez převodu na nový systém se nemění
    const plain = oldVillage().state;
    delete plain.roads!.v2;
    expect(withRoadsRebuilt(plain, LANDSCAPE, null)).toBe(plain);
  }, 120_000);

  it('dopočet po přestavbě po kouscích = vcelku', () => {
    const { state } = oldVillage();
    const rebuilt = rebuildRoads(state, LANDSCAPE, null);
    const to = START + 40;
    const whole = advanceVillage(cloneState(rebuilt), to, null, LANDSCAPE);
    const pieces = advanceVillage(
      advanceVillage(cloneState(rebuilt), START + 13, null, LANDSCAPE),
      to,
      null,
      LANDSCAPE,
    );
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    // přestavba je deterministická
    expect(JSON.stringify(rebuildRoads(oldVillage().state, LANDSCAPE, null))).toBe(
      JSON.stringify(rebuilt),
    );
  }, 120_000);
});

/**
 * Ves s hotovou vozovou cestou po nejsilnější trase (zemní práce, stará cesta pod ní zmizela),
 * se starou vozovou cestou daleko od tras (její zemní práce nová síť nepoužije) a s rozestavěnou
 * vozovou cestou, jejíž první úsek je hotový.
 */
function wagonVillage(): {
  state: VillageState;
  oldAxis: RoadPoint[];
  unused: number;
  building: RoadEarthwork;
} {
  const { state } = oldVillage();
  const road3 = state.roads!.roads.find((r) => r.id === 3)!;
  delete road3.unbridged;
  const plan = planWagonRoad(wagonPlanInputOf(state, START - 200, 3, LANDSCAPE, null));
  if (!plan.ok) throw new Error(plan.reason);
  buildWagonRoadNow(state, plan, START - 200, LANDSCAPE, null);
  const axis = [
    { x: 100, z: -120 },
    { x: 130, z: -120 },
  ];
  state.roads!.roads.push(road(4, axis, 'wagon'));
  const unused: RoadEarthwork = {
    id: state.nextId++,
    profile: axis.map((p) => ({ ...p, y: naturalHeightAt(LANDSCAPE, p.x, p.z) })),
    pieces: [{ toM: 30, manDays: 5, builtDay: START - 300 }],
    startedDay: START - 310,
  };
  state.roads!.earthworks!.push(unused);
  state.roads!.roads.push(
    road(
      5,
      [
        { x: -80, z: -125 },
        { x: 80, z: -125 },
      ],
      'improved',
    ),
  );
  const next = startWagonRoad(state, START - 100, 5, LANDSCAPE, null);
  const c = next.constructions[next.constructions.length - 1]!;
  const building = next.roads!.earthworks!.find((e) => e.constructionId === c.id)!;
  c.done = building.pieces[0]!.manDays + 0.01;
  wagonRoadsDay(next, START - 99, LANDSCAPE, null);
  return {
    state: next,
    oldAxis: plan.profile,
    unused: unused.id,
    building: JSON.parse(JSON.stringify(building)) as RoadEarthwork,
  };
}

/** Odkazy na úseky, které ve vsi nejsou (křižovatky, stezky, stavby, jabloně). */
function dangling(s: VillageState): string[] {
  const ids = new Set(s.roads!.roads.map((r) => r.id));
  return [
    ...(s.roads!.junctions ?? []).flatMap((j) =>
      j.arms.filter((a) => a !== null && !ids.has(a)).map((a) => `křižovatka ${j.id}→${a}`),
    ),
    ...(s.trails ?? []).flatMap((t) =>
      t.pieces.filter((p) => !ids.has(p.roadId)).map((p) => `stezka ${t.id}→${p.roadId}`),
    ),
    ...s.constructions.flatMap((c) =>
      (c.roadIds ?? []).filter((id) => !ids.has(id)).map((id) => `stavba ${c.id}→${id}`),
    ),
    ...(s.roads!.apples ?? [])
      .filter((a) => !ids.has(a.roadId))
      .map((a) => `jabloň ${a.id}→${a.roadId}`),
  ];
}

describe('rebuildRoads – vozové cesty (R2, Martin 24. 10. 2026 – varianta A)', () => {
  it('vozová cesta se po nové ose přepočítá a je hned hotová i se zemními pracemi', () => {
    const { state, oldAxis, unused, building } = wagonVillage();
    const before = JSON.stringify(state);
    const oldIds = new Set(state.roads!.earthworks!.map((e) => e.id));
    const buildingRoads = state.roads!.roads.filter(
      (r) => r.grade === 'wagon' && r.points.every((p) => Math.abs(p.z + 125) < 0.5),
    );
    expect(buildingRoads.length).toBeGreaterThan(0);
    const next = rebuildRoads(state, LANDSCAPE, null);
    expect(JSON.stringify(state)).toBe(before);
    const earthworks = next.roads!.earthworks!;
    // staré hotové zemní práce zůstanou jen terénem a zarostou (i ta, kterou nová osa nepoužije)
    for (const e of earthworks.filter((x) => oldIds.has(x.id) && x.id !== building.id)) {
      expect(e.abandonedDay).toBe(START);
    }
    expect(earthworks.find((e) => e.id === unused)!.abandonedDay).toBe(START);
    // nové zemní práce: hotové v den přestavby, bez stavby a bez ceny
    const fresh = earthworks.filter((e) => !oldIds.has(e.id));
    expect(fresh.length).toBeGreaterThan(0);
    for (const e of fresh) {
      expect(e.constructionId).toBeUndefined();
      expect(e.abandonedDay).toBeUndefined();
      expect(e.startedDay).toBe(START);
      expect(e.pieces.every((p) => p.builtDay === START)).toBe(true);
    }
    expect(next.constructions).toHaveLength(state.constructions.length);
    // nové vozové úseky leží na nových zemních pracích u staré osy
    const onFresh = axisDistance(fresh.map((e) => e.profile));
    const near = axisDistance([oldAxis]);
    const wagon = next.roads!.roads.filter(
      (r) => r.grade === 'wagon' && !r.abandoned && !buildingRoads.some((b) => b.id === r.id),
    );
    expect(wagon.length).toBeGreaterThan(0);
    for (const r of wagon) for (const p of r.points) expect(onFresh(p.x, p.z)).toBeLessThan(0.3);
    const samples = wagon.flatMap((r) => resample(r.points, null, 2).points);
    expect(samples.filter((p) => near(p.x, p.z) <= 4).length / samples.length).toBeGreaterThan(0.6);
    // stará vozová cesta daleko od tras zmizela, zemní práce zůstala (terén)
    expect(next.roads!.roads.some((r) => r.points.some((p) => p.x > 95 && p.z < -110))).toBe(false);
    // rozestavěná vozová cesta beze změny i s hotovým úsekem
    expect(earthworks.find((e) => e.id === building.id)).toEqual(building);
    for (const r of buildingRoads) {
      expect(next.roads!.roads.find((x) => x.id === r.id)?.points).toEqual(r.points);
    }
    expect(dangling(next)).toEqual([]);
  }, 120_000);

  it('dopočet po přestavbě po kouscích = vcelku, přestavba deterministická a jednou', () => {
    const { state } = wagonVillage();
    state.roads!.v2 = true;
    const rebuilt = withRoadsRebuilt(state, LANDSCAPE, null);
    expect(rebuilt.roads!.rebuilt).toBe(1);
    expect(withRoadsRebuilt(rebuilt, LANDSCAPE, null)).toBe(rebuilt);
    expect(JSON.stringify(rebuildRoads(wagonVillage().state, LANDSCAPE, null))).toBe(
      JSON.stringify(rebuildRoads(wagonVillage().state, LANDSCAPE, null)),
    );
    const to = START + 40;
    const whole = advanceVillage(cloneState(rebuilt), to, null, LANDSCAPE);
    const pieces = advanceVillage(
      advanceVillage(cloneState(rebuilt), START + 13, null, LANDSCAPE),
      to,
      null,
      LANDSCAPE,
    );
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    // hotová vozová cesta po přestavbě dál stojí, zemní práce bez cesty dál zarůstají
    expect(whole.roads!.roads.some((r) => r.grade === 'wagon' && !r.abandoned)).toBe(true);
    expect(dangling(whole)).toEqual([]);
  }, 240_000);
});
