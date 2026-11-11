import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { DWELLING_PATH_BOX_M, inBuilding } from '../network-grid';
import { roadsMonth } from '../roads';
import { emptyRoads } from '../roads-form';
import { resample } from '../roads-geometry';
import type { Dwelling, DwellingType, Road, VillageState } from '../../types';
import { village } from '../../__tests__/abandonment-fixtures';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';

// Dům postavený na starší cestě (Vlkov 24. 10. 2026, Martin: „tenhle úsek vede skrz domy“ –
// upravená cesta 4, úsek zemské stezky, přes dvorec a polozemnici postavené po ní): kus pod domem
// se opustí podle pravidla Stavba přes cestu (paths.md) i u úseku zemské stezky a vozové cesty.

const START = dayIndexOf({ year: 601, month: 4, day: 1 });
const monthDay = (m: number): number =>
  dayIndexOf({ year: 601 + Math.floor((3 + m) / 12), month: 1 + ((3 + m) % 12), day: 1 });

/** Ves se starou cestou x = 60 (z 3,75–71,25) a domem `type` na ní v (60, 30). */
function houseOnRoad(type: DwellingType, grade: Road['grade']): VillageState {
  const s = village(START - 1);
  s.dwellings.push({
    id: 5,
    type,
    builtDay: START - 400,
    condition: 1,
    position: { x: 60, z: 30, rotation: 0 },
  });
  s.roads = emptyRoads(START);
  s.roads.nextId = 10;
  s.roads.roads.push({
    id: 1,
    points: [
      { x: 60, z: 3.75 },
      { x: 60, z: 71.25 },
    ],
    bornDay: START - 3000,
    grade,
    traffic: [3],
    spots: [],
  });
  return s;
}

/** Délka živých os v půdorysu domu (m, po 0,25 m). */
function livingInHouse(s: VillageState): number {
  const d = s.dwellings.find((x) => x.id === 5)! as Dwelling;
  const house = { position: d.position, box: DWELLING_PATH_BOX_M[d.type] };
  return s
    .roads!.roads.filter((r) => !r.abandoned)
    .reduce(
      (sum, r) =>
        sum +
        resample(r.points, null, 0.25).points.filter((p) => inBuilding(house, p.x, p.z, 0)).length *
          0.25,
      0,
    );
}

describe('dům postavený na starší cestě (Vlkov, úsek 4)', () => {
  it('kus zemské stezky pod dvorcem se opustí, stezka vede dál po živých zbytcích', () => {
    const s = houseOnRoad('dvorec', 'improved');
    s.trails = [
      {
        id: 7,
        direction: 'N',
        pieces: [{ roadId: 1, grade: 'improved', manDays: 12 }],
        lengthM: 67.5,
        startedDay: START - 2000,
        builtDay: START - 1900,
      },
    ];
    expect(livingInHouse(s)).toBeGreaterThan(10);
    roadsMonth(s, monthDay(1), LANDSCAPE, null);
    const roads = s.roads!.roads;
    const abandoned = roads.filter((r) => r.abandoned);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]!.points.every((p) => p.z > 15 && p.z < 45)).toBe(true);
    expect(livingInHouse(s)).toBe(0);
    // stezka vede po živých zbytcích od vsi ven (od jihu na sever), práce zůstala u prvního
    const pieces = s.trails[0]!.pieces;
    const byId = new Map(roads.map((r) => [r.id, r]));
    expect(
      pieces.map((p) => (byId.has(p.roadId) ? !byId.get(p.roadId)!.abandoned : 'chybí')),
    ).toEqual([true, true]);
    expect(pieces[0]).toMatchObject({ roadId: 1, grade: 'improved', manDays: 12 });
    expect(pieces[1]).toMatchObject({ grade: 'improved', manDays: 0 });
    expect(byId.get(pieces[0]!.roadId)!.points[0]!.z).toBeLessThan(10);
    expect(byId.get(pieces[1]!.roadId)!.points.at(-1)!.z).toBeGreaterThan(60);
    // idempotentně – další měsíc nic nemění
    const before = JSON.stringify([s.roads, s.trails]);
    roadsMonth(s, monthDay(2), LANDSCAPE, null);
    expect(JSON.stringify([s.roads, s.trails])).toBe(before);
  }, 60_000);

  it('vozová cesta pod polozemnicí se opustí, zemní práce zůstanou', () => {
    const s = houseOnRoad('polozemnice', 'wagon');
    const earthworks = JSON.stringify(s.roads!.earthworks ?? null);
    roadsMonth(s, monthDay(1), LANDSCAPE, null);
    expect(s.roads!.roads.filter((r) => r.abandoned)).toHaveLength(1);
    expect(livingInHouse(s)).toBe(0);
    expect(JSON.stringify(s.roads!.earthworks ?? null)).toBe(earthworks);
  }, 60_000);
});
