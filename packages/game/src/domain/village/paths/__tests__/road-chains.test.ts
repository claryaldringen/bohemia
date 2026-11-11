import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { laborReport } from '../../core/labor-report';
import { roadChain, roadChainIds, roadChains, type ChainRoad } from '../road-chains';
import {
  chainAppleSpots,
  roadAppleSpots,
  roadApplesOption,
  roadApplesWorkRoad,
  startRoadApples,
} from '../../roads/road-apples';
import {
  roadUpgradeCost,
  roadUpgradeOptions,
  roadUpgradeProgress,
  roadWorkFront,
  startRoadUpgrade,
} from '../../roads/road-upgrades';
import { ROAD_APPLES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Dwelling, Person, Road, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Cesta pro hráče (roads.md – Cesta pro hráče; Martin, 19. 10. 2026, Vlkov: „tohle by rozhodně
// neměly být dvě cesty, ale měly by se spojit do jedné“): řetěz úseků mezi rozcestími a volnými
// konci bez ohledu na stupeň – výběr, panel, vylepšení a jabloně celé cesty.

const YEAR = 365.25;
const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const LAYER = obstaclesOf(LANDSCAPE);

const seg = (id: number, ...points: [number, number][]): ChainRoad => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
});

describe('řetěz úseků – cesta hráče', () => {
  // A (0,0)→(10,0), B (20,0)→(10,0) obráceně, C (20,0)→(30,0); D odbočka z (30,0)
  const a = seg(3, [0, 0], [10, 0]);
  const b = seg(1, [20, 0], [10, 0]);
  const c = seg(8, [20, 0], [30, 0]);

  it('navazující úseky (uzel dvou konců) jsou jedna cesta – stejná, ať se vybere kterýkoli', () => {
    const roads = [a, b, c];
    for (const id of [3, 1, 8]) expect(roadChainIds(roads, id)).toEqual([3, 1, 8]);
    expect(roadChain(roads, 1).map((l) => l.reversed)).toEqual([false, true, false]);
    expect(roadChains(roads).map((chain) => chain.map((l) => l.road.id))).toEqual([[3, 1, 8]]);
  });

  it('rozcestí (aspoň tři konce) cestu dělí, volný konec ji končí', () => {
    // odbočka D končí v uzlu (20, 0) – tři konce
    const d = seg(5, [20, 0], [20, 15]);
    const roads = [a, b, c, d];
    expect(roadChainIds(roads, 3)).toEqual([1, 3]);
    expect(roadChainIds(roads, 8)).toEqual([8]);
    expect(roadChainIds(roads, 5)).toEqual([5]);
    expect(roadChains(roads)).toHaveLength(3);
    expect(roadChainIds(roads, 99)).toEqual([]);
  });

  it('okruh začíná nejmenším id', () => {
    const roads = [seg(4, [0, 0], [10, 0]), seg(2, [10, 0], [10, 10]), seg(6, [10, 10], [0, 0])];
    for (const id of [4, 2, 6]) expect(roadChainIds(roads, id)).toEqual([2, 6, 4]);
  });
});

/** Ves čtyř obydlí kolem počátku, každá domácnost se čtyřmi dospělými. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const home = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: DAY - 2 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [home(1, 0, 0), home(2, 18, -4), home(3, -18, -4), home(4, 0, -22)];
  s.people = [1, 2, 3, 4].flatMap((d) =>
    [30, 28, 22, 20].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: DAY - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = DAY;
  return s;
}

/** Úsek stranou vsi po z = −120 (bez mokřiny). */
function road(id: number, from: number, to: number, extra: Partial<Road> = {}): Road {
  return {
    id,
    points: [
      { x: from, z: -120 },
      { x: to, z: -120 },
    ],
    bornDay: DAY - 20 * 365,
    grade: 'trodden',
    traffic: [5],
    spots: [],
    ground: { wet: [], fords: [] },
    ...extra,
  };
}

function withRoads(s: VillageState, roads: Road[]): VillageState {
  s.roads = {
    nextId: 50,
    roads,
    trees: [],
    labor: { from: DAY, days: 0, shares: [] },
  };
  return s;
}

describe('vylepšení celé cesty hráče', () => {
  it('upravená + vyšlapaná (Vlkov 103 a 183): úprava jen vyšlapaného úseku, z kteréhokoli úseku', () => {
    const s = withRoads(village(), [
      road(103, -60, 40, { grade: 'improved' }),
      // obráceně – navazuje koncem osy
      road(183, 140, 40),
    ]);
    const from103 = roadUpgradeOptions(s, 103, DAY, null);
    const from183 = roadUpgradeOptions(s, 183, DAY, null);
    expect(from103).toEqual(from183);
    expect(from103.map((o) => o.upgrade)).toEqual(['improved']);
    expect(from103[0]!.laborManDays).toBe(roadUpgradeCost(s.roads!.roads[1]!).manDays);
    const started = startRoadUpgrade(s, DAY, 103, 'improved', null);
    expect(started.constructions.at(-1)).toMatchObject({ roadIds: [183], roadGrade: 'improved' });
    // jiný úsek téže cesty se už vylepšuje
    expect(() => startRoadUpgrade(started, DAY, 103, 'improved', null)).toThrow(/vylepšuje/);
    // po dokončení stejný stupeň – navazující úseky se spojí do jednoho
    const done = advanceVillage(started, DAY + 90, null);
    expect(done.roads!.roads).toHaveLength(1);
    expect(done.roads!.roads[0]).toMatchObject({ id: 103, grade: 'improved' });
  });

  it('dva vyšlapané úseky (vozová a pěší část): jedna stavba, cena za oba, práce po úsecích', () => {
    const s = withRoads(village(), [road(7, -60, 40, { cart: true }), road(9, 40, 140)]);
    const option = roadUpgradeOptions(s, 9, DAY, null)[0]!;
    expect(option.laborManDays).toBe(30);
    const started = startRoadUpgrade(s, DAY, 9, 'improved', null);
    const c = started.constructions.at(-1)!;
    expect(c.roadIds).toEqual([7, 9]);
    expect(c.cost).toBe(30);
    // průběh po úsecích v pořadí cesty – čelo práce na prvním, pak na druhém
    expect([...roadUpgradeProgress(started, c, 0.25)]).toEqual([
      [7, 0.5],
      [9, 0],
    ]);
    expect([...roadUpgradeProgress(started, c, 0.75)]).toEqual([
      [7, 1],
      [9, 0.5],
    ]);
    expect(roadWorkFront(started, c)).toBe(7);
    c.done = 20;
    expect(roadWorkFront(started, c)).toBe(9);
    // rozdělení práce dne míří na úsek čela práce
    const next = advanceVillage(started, DAY + 1, null);
    const shares = laborReport(next)?.shares ?? [];
    expect(shares.some((x) => x.target.kind === 'road' && x.target.id === 9)).toBe(true);
    expect(shares.some((x) => x.target.kind === 'road' && x.target.id === 7)).toBe(false);
    const done = advanceVillage(started, DAY + 120, null);
    expect(done.roads!.roads.map((r) => r.grade)).toEqual(['improved', 'improved']);
  });
});

describe('jabloně podél celé cesty hráče', () => {
  it('místa po úsecích za sebou s rozestupem i přes navázání; zadat jde z kteréhokoli úseku', () => {
    const s = withRoads(village(), [road(5, -60, 40, { grade: 'improved' }), road(6, 40, 130)]);
    const spots = chainAppleSpots(s, 6, DAY, LANDSCAPE, LAYER);
    const own5 = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    expect(spots.filter((p) => p.roadId === 5)).toEqual(own5.map((p) => ({ roadId: 5, ...p })));
    expect(spots.some((p) => p.roadId === 6)).toBe(true);
    for (const [k, p] of spots.entries()) {
      for (const q of spots.slice(k + 1)) {
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(ROAD_APPLES.gapM - 1e-9);
      }
    }
    const option = roadApplesOption(s, 5, DAY, LANDSCAPE, LAYER)!;
    expect(option).toEqual(roadApplesOption(s, 6, DAY, LANDSCAPE, LAYER));
    expect(option.trees).toBe(spots.length);
    const started = startRoadApples(s, DAY, 6, LANDSCAPE, LAYER);
    const c = started.constructions.at(-1)!;
    expect(c.roadIds).toEqual([5, 6]);
    expect(started.roads!.apples!.map((a) => a.roadId)).toEqual(spots.map((p) => p.roadId));
    // výsadba jde po řadě podél cesty – u prvního úseku, pak u druhého
    expect(roadApplesWorkRoad(started, c)).toBe(5);
    for (const a of started.roads!.apples!) if (a.roadId === 5) a.plantedDay = DAY;
    expect(roadApplesWorkRoad(started, c)).toBe(6);
    // druhý úsek téže cesty už sází
    expect(roadApplesOption(started, 6, DAY, LANDSCAPE, LAYER)!.blocked).toMatch(/sázejí/);
    // výsadba jabloní vylepšení cesty nebrání
    expect(roadUpgradeOptions(started, 6, DAY, null)[0]!.blocked).toBeNull();
  });
});
