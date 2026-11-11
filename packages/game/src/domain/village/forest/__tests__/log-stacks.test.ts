import { describe, expect, it } from 'vitest';
import { logPilePlace } from '../log-piles';
import { withRoadLogPiles } from '../log-piles-migration';
import { LOG_PILES } from '../../rules';
import type { Road, VillageRoads, VillageState } from '../../types';
import { addLogs, pileLogs, rotLogs, takeLogs, woodLogs } from '../wood';
import { makeLandscape } from '../../__tests__/placement-fixtures';

// Hromady klád u cesty (forest.md – Mýcení a hromada klád): klády z mýcení leží u cesty nejblíž
// místu kácení, bez cesty v dosahu u místa kácení; celková zásoba je `woodLogs`.

function emptyState(roads: Road[] = []): VillageState {
  return {
    nextId: 1,
    dwellings: [],
    constructions: [],
    ...(roads.length > 0 ? { roads: roadsOf(roads) } : {}),
  } as unknown as VillageState;
}

function roadsOf(roads: Road[]): VillageRoads {
  return { nextId: 100, roads, trees: [], labor: { from: 0, days: 0, shares: [] } };
}

function road(id: number, points: [number, number][], extra: Partial<Road> = {}): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: 0,
    grade: 'trodden',
    traffic: [],
    spots: [],
    ...extra,
  };
}

function stackSum(state: VillageState): number {
  return (state.logStacks ?? []).reduce((sum, s) => sum + s.logs, 0);
}

/** Vodorovná cesta z = 0 od x = −200 do 200. */
const EAST_WEST = road(1, [
  [-200, 0],
  [200, 0],
]);

describe('místo hromady klád', () => {
  it('u nejbližší cesty, roadSideM od osy na straně místa kácení', () => {
    const far = road(2, [
      [-200, 50],
      [200, 50],
    ]);
    const state = emptyState([far, EAST_WEST]);
    expect(logPilePlace(state, { x: 10, z: -30 })).toEqual({
      x: 10,
      z: -LOG_PILES.roadSideM,
      road: { x: 10, z: 0 },
    });
    // blíž k druhé cestě – na její jižní straně
    expect(logPilePlace(state, { x: 10, z: 40 })).toEqual({
      x: 10,
      z: 50 - LOG_PILES.roadSideM,
      road: { x: 10, z: 50 },
    });
  });

  it('místo kácení na ose – vlevo od směru úseku; konec osy – za koncem', () => {
    const state = emptyState([EAST_WEST]);
    expect(logPilePlace(state, { x: 0, z: 0 })).toEqual({
      x: 0,
      z: LOG_PILES.roadSideM,
      road: { x: 0, z: 0 },
    });
    expect(logPilePlace(state, { x: 230, z: 0 })).toEqual({
      x: 200 + LOG_PILES.roadSideM,
      z: 0,
      road: { x: 200, z: 0 },
    });
  });

  it('bez cesty v dosahu (i opuštěné) leží u místa kácení', () => {
    const reach = LOG_PILES.roadReachM;
    expect(logPilePlace(emptyState(), { x: 5, z: 7 })).toEqual({ x: 5, z: 7 });
    expect(logPilePlace(emptyState([EAST_WEST]), { x: 5, z: reach + 1 })).toEqual({
      x: 5,
      z: reach + 1,
    });
    expect(logPilePlace(emptyState([EAST_WEST]), { x: 5, z: reach })).toMatchObject({
      road: { x: 5, z: 0 },
    });
    const abandoned = road(1, [
      [-200, 0],
      [200, 0],
    ]);
    abandoned.abandoned = true;
    expect(logPilePlace(emptyState([abandoned]), { x: 5, z: 7 })).toEqual({ x: 5, z: 7 });
  });

  it('při shodě vzdálenosti vyhraje dřívější cesta', () => {
    const north = road(2, [
      [-200, 20],
      [200, 20],
    ]);
    const south = road(3, [
      [-200, -20],
      [200, -20],
    ]);
    expect(logPilePlace(emptyState([north, south]), { x: 0, z: 0 }).road).toEqual({ x: 0, z: 20 });
    expect(logPilePlace(emptyState([south, north]), { x: 0, z: 0 }).road).toEqual({
      x: 0,
      z: -20,
    });
  });
});

describe('hromady klád', () => {
  it('addLogs založí hromadu u cesty; klučení pole doplňuje svou hromadu, i když kácí jinde', () => {
    const state = emptyState([EAST_WEST]);
    addLogs(state, 3, { x: 10, z: -30 }, 7);
    addLogs(state, 2, { x: 150, z: 40 }, 7);
    expect(state.logStacks).toEqual([
      { id: 1, fieldId: 7, x: 10, z: -LOG_PILES.roadSideM, road: { x: 10, z: 0 }, logs: 5 },
    ]);
    expect(woodLogs(state)).toBe(5);
    expect(pileLogs(state)).toBe(0);
  });

  it('jiné mýcení doplní hromadu do joinM od nového místa, dál založí novou', () => {
    const state = emptyState([EAST_WEST]);
    addLogs(state, 3, { x: 10, z: -30 });
    addLogs(state, 2, { x: 10 + LOG_PILES.joinM, z: -20 });
    addLogs(state, 4, { x: 10 + LOG_PILES.joinM + 1, z: -20 });
    expect(state.logStacks!.map((s) => [s.x, s.logs])).toEqual([
      [10, 5],
      [10 + LOG_PILES.joinM + 1, 4],
    ]);
  });

  it('klády odjinud (null) u cesty nejblíž dvorci či prvnímu obydlí', () => {
    const state = emptyState([EAST_WEST]);
    state.dwellings = [
      { id: 4, position: { x: 30, z: 20, rotation: 0 } },
    ] as VillageState['dwellings'];
    addLogs(state, 2, null);
    expect(state.logStacks![0]).toMatchObject({ x: 30, z: LOG_PILES.roadSideM, logs: 2 });
  });

  it('takeLogs bere od nejbližší hromady ke staveništi; prázdná hromada zmizí', () => {
    const state = emptyState();
    addLogs(state, 2, { x: 100, z: 0 }, 1);
    addLogs(state, 2, { x: 10, z: 0 }, 2);
    expect(takeLogs(state, 3, { x: 0, z: 0 })).toBe(3);
    expect(state.logStacks!.map((s) => [s.fieldId, s.logs])).toEqual([[1, 1]]);
    expect(woodLogs(state)).toBe(1);
    expect(takeLogs(state, 4, { x: 0, z: 0 })).toBe(1);
    expect(state.logStacks).toBeUndefined();
    expect(woodLogs(state)).toBe(0);
  });

  it('bez near bere od nejmenšího id a víc než je, nevezme', () => {
    const state = emptyState();
    addLogs(state, 1, { x: 100, z: 0 }, 1);
    addLogs(state, 1, { x: 0, z: 0 }, 2);
    expect(takeLogs(state, 1)).toBe(1);
    expect(state.logStacks!.map((s) => s.fieldId)).toEqual([2]);
    expect(takeLogs(state, 5)).toBe(1);
    expect(woodLogs(state)).toBe(0);
  });

  it('zbytek hromady pod půl klády přejde na nejbližší hromadu – klády bez hromady nepřibudou', () => {
    const state = emptyState();
    addLogs(state, 0.4, { x: 0, z: 0 }, 1);
    addLogs(state, 3, { x: 40, z: 0 }, 2);
    addLogs(state, 3, { x: 200, z: 0 }, 3);
    expect(takeLogs(state, 1, { x: 200, z: 0 })).toBe(1);
    expect(state.logStacks!.map((s) => [s.fieldId, s.logs])).toEqual([
      [2, 3.4],
      [3, 2],
    ]);
    expect(pileLogs(state)).toBeCloseTo(0, 9);
    // celé kusy, které hromady v celých kládách nepokryjí, vezme ze zbytků
    const split = emptyState();
    addLogs(split, 0.3, { x: 0, z: 0 }, 1);
    addLogs(split, 0.3, { x: 100, z: 0 }, 2);
    expect(takeLogs(split, 1)).toBe(1);
    expect(stackSum(split)).toBeCloseTo(0, 9);
    expect(woodLogs(split)).toBe(0);
  });

  it('invariant Σ hromad = zásoba po přidání, odběru a 365 dnech hnití', () => {
    const state = emptyState([EAST_WEST]);
    addLogs(state, 5, { x: 0, z: 30 });
    addLogs(state, 6, { x: 0, z: -30 }, 1);
    addLogs(state, 4, { x: 100, z: 100 }, 2);
    takeLogs(state, 3, { x: 4, z: 4 });
    for (let day = 0; day < 365; day++) {
      rotLogs(state);
      expect(stackSum(state)).toBeCloseTo(woodLogs(state), 9);
    }
    expect(woodLogs(state)).toBeLessThan(12);
    expect(pileLogs(state)).toBeCloseTo(0, 9);
  });
});

describe('převod starých vsí (withRoadLogPiles)', () => {
  // les od x ≥ 0 (políčka 8+ krajiny 16 × 15 m)
  const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });

  function oldVillage(): VillageState {
    const state = emptyState([EAST_WEST]);
    state.nextId = 50;
    state.dwellings = [
      { id: 3, position: { x: -90, z: 20, rotation: 0 } },
      { id: 5, position: { x: -20, z: 30, rotation: 0 } },
    ] as VillageState['dwellings'];
    state.woodLogs = 9.5;
    state.logStacks = [{ id: 7, fieldId: 2, x: 40, z: 40, logs: 2.5 }];
    return state;
  }

  it('hromada u vsi se stane hromadou u obydlí nejblíž lesu – na dnešním místě', () => {
    const next = withRoadLogPiles(oldVillage(), landscape);
    expect(next.logStacks).toEqual([
      { id: 7, fieldId: 2, x: 40, z: 40, logs: 2.5 },
      { id: 50, fieldId: 0, x: -20, z: 30, dwellingId: 5, logs: 7 },
    ]);
    expect(next.nextId).toBe(51);
    expect(woodLogs(next)).toBe(9.5);
    expect(pileLogs(next)).toBe(0);
  });

  it('je idempotentní a ves bez klád bez hromady vrací beze změny', () => {
    const once = withRoadLogPiles(oldVillage(), landscape);
    expect(withRoadLogPiles(once, landscape)).toBe(once);
    const none = emptyState();
    expect(withRoadLogPiles(none, landscape)).toBe(none);
  });

  it('převedená hromada se dál chová jako ostatní – odběr od nejbližší', () => {
    const next = withRoadLogPiles(oldVillage(), landscape);
    expect(takeLogs(next, 3, { x: -25, z: 30 })).toBe(3);
    expect(next.logStacks!.find((s) => s.dwellingId === 5)?.logs).toBe(4);
  });
});
