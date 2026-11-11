import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { type GridWindow } from '../network-grid';
import { roadsMonth } from '../roads';
import { emptyRoads } from '../roads-form';
import { ATTACH_M, nearestOnRoads } from '../roads-geometry';
import { encodeRoute, routeLine } from '../routes';
import { encodeWear, wearCellAt } from '../wear';
import type { Road, StoredRoute, VillageState } from '../../types';
import { village } from '../../__tests__/abandonment-fixtures';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';

// Stavba přes cestu (paths.md – Stavba přes cestu, Vlkov 23. 10. 2026): kus pod hotovou stavbou
// je hned opuštěný, z vyšlapané objížďky vznikne cesta napojená na zbytky staré a obojí přežije.

const CELL = 3.75;
const WINDOW: GridWindow = { width: 200, height: 200, originX: -375, originZ: -375, cellM: CELL };
const START = dayIndexOf({ year: 601, month: 4, day: 1 });

/** Trasa pro vodu od x = 60 na sever k potoku, kolem domu v (60, 30) východním obloukem (x ≈ 71). */
function detourRoute(): StoredRoute {
  const cells: [number, number][] = [
    ...[1, 2, 3].map((z): [number, number] => [16, z]),
    [17, 4],
    [18, 5],
    ...[6, 7, 8, 9, 10, 11, 12].map((z): [number, number] => [19, z]),
    [18, 13],
    [17, 14],
    ...[15, 16, 17, 18, 19].map((z): [number, number] => [16, z]),
  ];
  return {
    from: 'd:1',
    to: 'water',
    purpose: 'water',
    trips: 1000,
    ...encodeRoute(
      cells.map(([x, z]) => (z + 100) * WINDOW.width + (x + 100)),
      WINDOW,
    ),
  };
}

/** Ves se starou cestou x = 60 přes pozemek nového domu a s vyšlapanou objížďkou kolem něj. */
function blockedVillage(): VillageState {
  const s = village(START - 1);
  s.dwellings.push({
    id: 5,
    type: 'zemnice',
    builtDay: START - 400,
    condition: 1,
    position: { x: 60, z: 30, rotation: 0 },
  });
  s.roads = emptyRoads(START);
  s.roads.nextId = 10;
  const old: Road = {
    id: 1,
    points: [
      { x: 60, z: 3.75 },
      { x: 60, z: 71.25 },
    ],
    bornDay: START - 3000,
    grade: 'trodden',
    traffic: [3],
    spots: [
      { id: 501, x: 63, z: 10 },
      { id: 502, x: 63, z: 65 },
    ],
  };
  s.roads.roads.push(old);
  s.routes = { day: START, key: 'test-detour', list: [detourRoute()] };
  // celá trasa je vyšlapaná na cestu
  const hot = new Map<number, number>();
  const line = routeLine(detourRoute(), CELL);
  line.slice(1).forEach((b, k) => {
    const a = line[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let i = 0; i <= n; i++) {
      hot.set(wearCellAt(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n), 120_000);
    }
  });
  s.roads.wear = { day: START, cells: encodeWear(hot), labor: [] };
  return s;
}

const monthDay = (m: number): number =>
  dayIndexOf({ year: 601 + Math.floor((3 + m) / 12), month: 1 + ((3 + m) % 12), day: 1 });

describe('stavba přes cestu – objížďka (Vlkov, polozemnice 2630)', () => {
  it('kus pod domem je opuštěný, zbytky žijí a objížďka vznikne, drží se 12 měsíců se stejným id', () => {
    const s = blockedVillage();
    roadsMonth(s, monthDay(1), LANDSCAPE, null);
    const roads = s.roads!.roads;
    const abandoned = roads.filter((r) => r.abandoned);
    expect(abandoned.length).toBeGreaterThan(0);
    expect(abandoned.every((r) => r.points.every((p) => p.z > 15 && p.z < 45))).toBe(true);
    const living = roads.filter((r) => !r.abandoned);
    // zbytky staré cesty po obou stranách se s objížďkou spojily do jedné cesty se starým id
    // (úklid – pahýly u pozemku zmizely, falešná rozcestí se spojila; Úloha 8)
    expect(living.some((r) => r.id === 1)).toBe(true);
    expect(living.some((r) => r.points.some((p) => p.z > 60))).toBe(true);
    expect(living.some((r) => r.points.some((p) => p.z < 10))).toBe(true);
    // objížďka vznikla (leží východně od domu) a navazuje na zbytky
    const detour = living.find((r) => r.points.some((p) => p.x > 66));
    expect(detour).toBeDefined();
    // úklid pahýlů neodřízne napojení objížďky: oba její konce dál leží na cestě (do ATTACH_M)
    // nebo u kotvy (brána domu, voda) – díra nevznikne
    const others = living.filter((r) => r !== detour);
    for (const end of [detour!.points[0]!, detour!.points[detour!.points.length - 1]!]) {
      const hit = nearestOnRoads(others, end.x, end.z);
      const atAnchor = end.z <= 4 || end.z >= 70;
      expect(atAnchor || (hit !== null && hit.distance <= ATTACH_M)).toBe(true);
    }
    // zbytek staré cesty u domu bez trasy (pahýl) zmizel – žádný živý konec u pozemku
    for (const r of living) {
      for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
        expect(p.z > 15 && p.z < 45 && Math.abs(p.x - 60) < 2).toBe(false);
      }
    }
    const nextId = s.roads!.nextId;
    const snapshot = JSON.stringify(
      living.map((r) => ({ id: r.id, spots: r.spots, points: r.points })),
    );
    const ids = living.map((r) => r.id).sort((a, b) => a - b);
    for (let m = 2; m <= 13; m++) roadsMonth(s, monthDay(m), LANDSCAPE, null);
    const after = s.roads!.roads.filter((r) => !r.abandoned);
    expect(after.map((r) => r.id).sort((a, b) => a - b)).toEqual(ids);
    expect(s.roads!.nextId).toBe(nextId);
    expect(JSON.stringify(after.map((r) => ({ id: r.id, spots: r.spots, points: r.points })))).toBe(
      snapshot,
    );
  }, 60_000);
});
