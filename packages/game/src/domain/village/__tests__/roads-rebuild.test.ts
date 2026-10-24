import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { cloneState } from '../clone';
import { DWELLING_PATH_BOX_M, inBuilding } from '../paths/network-grid';
import { emptyRoads } from '../paths/roads-form';
import { axisDistance, resample } from '../paths/roads-geometry';
import { rebuildRoads, withRoadsRebuilt } from '../paths/roads-rebuild';
import { routeLine } from '../paths/routes';
import { pathCellM } from '../paths/terrain';
import { refreshWalkDistances } from '../paths/village';
import { encodeWear, wearCellsOf } from '../paths/wear';
import { advanceVillage } from '../simulate';
import type { Road, RoadPoint, VillageState } from '../types';
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
    // za běhu, `roadAxisOf`) – skrz dům nevede
    expect(inHouses(next)).toBeLessThan(2.5);
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
