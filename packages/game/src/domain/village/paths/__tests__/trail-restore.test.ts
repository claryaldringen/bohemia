import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { withMergedRoads } from '../roads';
import { mergeParallelRoads } from '../roads-tidy';
import type { Road, Trail, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Převod starší vsi: hotová zemská stezka, která přišla o úseky (neexistující id po starém
// spojování úseků), je znovu najde po síti pevných cest od dvorce ke kraji mapy (trade.md –
// Zemská stezka).

const Y1 = dayIndexOf({ year: 600, month: 11, day: 1 });
/** Krajina 200 × 200 m – kraj pro stezku je 70 m od středu (100 − 10 − 20). */
const LAND = { size: 20, cellSizeM: 10 };

function road(id: number, points: [number, number][], extra: Partial<Road> = {}): Road {
  return {
    id,
    grade: 'improved',
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: Y1 - 300,
    traffic: [],
    spots: [],
    ...extra,
  } as Road;
}

function trail(id: number, direction: Trail['direction'], ids: number[], built = true): Trail {
  return {
    id,
    direction,
    pieces: ids.map((roadId) => ({ roadId, grade: 'improved', manDays: 5 })),
    lengthM: 70,
    startedDay: Y1 - 200,
    builtDay: built ? Y1 - 100 : null,
  };
}

/** Ves s dvorcem v (0, 0) čelem k +z – stezka začíná kus před vchodem (0, ≈ 6). */
function village(roads: Road[], trails: Trail[]): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: Y1 - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.roads = {
    nextId: 100,
    roads,
    trees: [],
    labor: { from: Y1, days: 0, shares: [] },
  };
  s.trails = trails;
  return s;
}

/** Síť: od vsi na sever 10 → 11 → 12 (vozová) ke kraji, odbočka 13 k severnímu kraji dál od
 * směru, odbočka 16 na východ ke kraji; zkratky 14 (opuštěná) a 15 (vyšlapaná) se nepočítají. */
function network(): Road[] {
  return [
    road(10, [
      [0, 8],
      [0, 30],
    ]),
    road(11, [
      [0, 30],
      [5, 50],
    ]),
    road(
      12,
      [
        [5, 50],
        [10, 75],
      ],
      { grade: 'wagon' },
    ),
    road(13, [
      [0, 30],
      [-20, 40],
      [-40, 75],
    ]),
    road(
      14,
      [
        [0, 8],
        [10, 75],
      ],
      { abandoned: true },
    ),
    road(
      15,
      [
        [0, 30],
        [10, 75],
      ],
      { grade: 'trodden' },
    ),
    road(16, [
      [5, 50],
      [75, 50],
    ]),
  ];
}

describe('převod: stezka bez úseků je znovu najde po síti pevných cest', () => {
  it('hotová stezka s neexistujícími úseky dostane cestu od dvorce ke kraji, od vsi ven', () => {
    const s = village(network(), [trail(1, 'N', [98, 99]), trail(2, 'E', [10, 11, 16])]);
    const migrated = withMergedRoads(s, LAND);
    expect(migrated.trails![0]!.pieces).toEqual([
      { roadId: 10, grade: 'improved', manDays: 0 },
      { roadId: 11, grade: 'improved', manDays: 0 },
      { roadId: 12, grade: 'wagon', manDays: 0 },
    ]);
    // stezka s živými úseky se nemění, vstup taky ne
    expect(migrated.trails![1]).toEqual(s.trails![1]);
    expect(s.trails![0]!.pieces.map((p) => p.roadId)).toEqual([98, 99]);
    // druhý převod nic nezmění
    expect(withMergedRoads(migrated, LAND)).toBe(migrated);
  });

  it('prázdná hotová stezka se obnoví, rozestavěná ne (jen ztratí zmizelé úseky)', () => {
    const s = village(network(), [trail(1, 'N', []), trail(2, 'E', [98, 16], false)]);
    const migrated = withMergedRoads(s, LAND);
    expect(migrated.trails![0]!.pieces.map((p) => p.roadId)).toEqual([10, 11, 12]);
    expect(migrated.trails![1]!.pieces.map((p) => p.roadId)).toEqual([16]);
  });

  it('bez spojení ke kraji zůstane stezka, jak je (přijatý stav), a převod je klidný', () => {
    const roads = network().filter((r) => r.id !== 12 && r.id !== 13 && r.id !== 16);
    const s = village(roads, [trail(1, 'N', [98, 99])]);
    const migrated = withMergedRoads(s, LAND);
    expect(migrated.trails![0]!.pieces).toEqual([]);
    expect(withMergedRoads(migrated, LAND)).toBe(migrated);
  });

  it('bez krajiny se úseky jen vyřadí', () => {
    const s = village(network(), [trail(1, 'N', [98, 10])]);
    expect(withMergedRoads(s).trails![0]!.pieces.map((p) => p.roadId)).toEqual([10]);
  });
});

describe('obnova stezky je jednorázový převod', () => {
  it('stezka, která o úseky přišla za běhu, se po dalším načtení nevzkřísí', () => {
    const s = village(network(), [trail(1, 'N', [98, 99])]);
    const migrated = withMergedRoads(s, LAND);
    expect(migrated.roads!.trailsRestored).toBe(true);
    // za běhu o úseky přijde (opuštěný zbytek vypadne ze stezky)
    const later = structuredClone(migrated);
    later.trails![0]!.pieces = [];
    expect(withMergedRoads(later, LAND)).toBe(later);
    expect(later.trails![0]!.pieces).toEqual([]);
  });

  it('bez příznaku se převod provede i na vsi bez nalezené osy a pak se označí', () => {
    const roads = network().filter((r) => r.id !== 12 && r.id !== 13 && r.id !== 16);
    const migrated = withMergedRoads(village(roads, [trail(1, 'N', [98])]), LAND);
    expect(migrated.roads!.trailsRestored).toBe(true);
  });
});

describe('řez úseku stezky', () => {
  it('vyříznutí prostředního kusu nechá stezku vést po obou zbytcích', () => {
    const s = village(
      [
        road(
          1,
          [
            [60, 4],
            [140, 4],
          ],
          { grade: 'wagon' },
        ),
        road(
          2,
          [
            [0, 0],
            [200, 0],
          ],
          { grade: 'trodden' },
        ),
      ],
      [trail(1, 'E', [2])],
    );
    const roads = s.roads!;
    expect(mergeParallelRoads(roads, [], s.trails)).toBe(true);
    const ids = roads.roads.filter((r) => r.id !== 1).map((r) => r.id);
    expect(ids.length).toBe(2);
    expect(s.trails![0]!.pieces.map((p) => p.roadId)).toEqual(ids);
  });
});
