import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { updateRoads } from '../roads';
import { withRoadsV2 } from '../roads-v2';
import { storedRoutes } from '../routes';
import { villagePathNetwork } from '../village';
import { advanceVillage } from '../../core/simulate';
import type { Dwelling, Person, Road, RoadGrade, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Díry mezi úseky pevných cest (roads.md – Úseky a rozcestí; Martin: pevná cesta má uprostřed
// mezeru – dva úseky na sebe navazují, ale konce se nepotkají). Krajina testu: louka 300 × 300 m,
// potok z ∈ (75, 90), les x < −90; ves čtyř obydlí kolem počátku.

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y1 = NOV1(600);
const LAYER = obstaclesOf(LANDSCAPE);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function road(id: number, points: [number, number][], grade: RoadGrade = 'improved'): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: Y1 - 10 * 365 + id,
    grade,
    traffic: [4, 4],
    spots: [],
    ground: { wet: [], fords: [] },
  };
}

/** Ves čtyř obydlí (zemnice čelem k +z – brána domu 1 je v (0, 5,2)). */
function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 30 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
  s.people = [1, 2, 3, 4].flatMap((d) =>
    [30, 28, 22, 20].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: day - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = day;
  return s;
}

/** Stranou vsi (z = −100) dva úseky s dírou 5 m mezi x = 0 a x = 5 (mimo pás kraje mapy). */
function withGap(s: VillageState): void {
  s.roads!.roads.push(
    road(500, [
      [-60, -100],
      [0, -100],
    ]),
    road(501, [
      [5, -100],
      [100, -100],
    ]),
  );
}

describe('díry mezi úseky pevných cest', () => {
  it('díra 5 m se v roční kontrole zacelí a úseky se spojí', () => {
    const s = village(Y1 - 30);
    updateRoads(s, Y1, LANDSCAPE, null);
    withGap(s);
    updateRoads(s, NOV1(601), LANDSCAPE, null);
    const side = s.roads!.roads.filter((r) => r.points.every((p) => p.z === -100));
    expect(side.map((r) => r.id)).toEqual([500]);
    expect(side[0]!.points.map((p) => p.x)).toEqual([-60, 0, 5, 100]);
    // konce v louce bez trasy – pás se tam nevytrácí jako u brány; stav je zkontrolovaný
    expect(side[0]!.openEnds).toEqual([false, false]);
  }, 60_000);

  it('napojení na osu jiného úseku ho v bodě rozdělí – vznikne rozcestí', () => {
    const s = village(Y1 - 30);
    updateRoads(s, Y1, LANDSCAPE, null);
    s.roads!.roads.push(
      road(500, [
        [-60, -120],
        [130, -120],
      ]),
      // odbočka k jihu končí 6 m od osy
      road(501, [
        [40, -126],
        [40, -200],
      ]),
    );
    updateRoads(s, NOV1(601), LANDSCAPE, null);
    const roads = s.roads!.roads.filter((r) => r.points.every((p) => p.z <= -120));
    const node = { x: 40, z: -120 };
    const ends = roads.flatMap((r) => [r.points[0]!, r.points.at(-1)!]);
    expect(ends.filter((p) => p.x === node.x && p.z === node.z)).toHaveLength(3);
    expect(roads.find((r) => r.id === 501)!.points[0]).toEqual(node);
  }, 60_000);

  it('brána domu zůstane volným koncem, i když jde kolem jiná cesta', () => {
    const s = village(Y1 - 30);
    s.roads = {
      nextId: 600,
      roads: [
        // od brány domu 1 (0; 5,2) na západ a 10 m od brány cesta k severu
        road(500, [
          [0, 5.2],
          [-50, 5.2],
        ]),
        road(501, [
          [10, -40],
          [10, 40],
        ]),
      ],
      trees: [],
      labor: { from: Y1 - 30, days: 30, shares: [] },
    };
    // konce cest určují kotvy z uložených tras (brána domu) – trasy vsi
    const network = villagePathNetwork(s, Y1, LANDSCAPE, null);
    s.routes = { day: Y1, key: 'test', list: network ? storedRoutes(network) : [] };
    const migrated = withRoadsV2(s, LANDSCAPE, LAYER);
    const atGate = migrated.roads!.roads.find((r) => r.id === 500)!;
    expect(atGate.points[0]).toEqual({ x: 0, z: 5.2 });
    expect(atGate.openEnds![0]).toBe(true);
    // cesta kolem se nerozdělila
    expect(migrated.roads!.roads.map((r) => r.id).sort()).toEqual([500, 501]);
  }, 60_000);

  it('starší ves se při načtení převede jednou – díra zmizí, pak týž objekt', () => {
    const s = village(Y1 - 30);
    s.roads = {
      nextId: 600,
      roads: [],
      trees: [],
      labor: { from: Y1 - 30, days: 30, shares: [] },
    };
    withGap(s);
    const migrated = withRoadsV2(s, LANDSCAPE, LAYER);
    expect(migrated).not.toBe(s);
    expect(s.roads.roads).toHaveLength(2);
    expect(migrated.roads!.roads.map((r) => r.id)).toEqual([500]);
    expect(migrated.roads!.v2).toBe(true);
    expect(withRoadsV2(migrated, LANDSCAPE, LAYER)).toBe(migrated);
  }, 60_000);

  it('výsledek nezávisí na kouscích dopočtu (i s JSON mezi kousky) přes 1. 11.', () => {
    const start = village(NOV1(601) - 12);
    updateRoads(start, Y1, LANDSCAPE, null);
    withGap(start);
    start.roads!.labor = { from: Y1, days: 365, shares: [] };
    const end = NOV1(601) + 9;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    expect(whole.roads!.roads.some((r) => r.id === 501)).toBe(false);
    const steps = [1, 3, 5, 2, 7];
    let chunked = json(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          LAYER,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(json(whole));
  }, 60_000);
});
