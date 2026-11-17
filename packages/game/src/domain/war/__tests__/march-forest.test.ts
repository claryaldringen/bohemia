import { describe, expect, it } from 'vitest';
import {
  buildForestField,
  generateLandscape,
  obstaclesOf,
  packObstacles,
  skeletonFeaturesOf,
  SURFACE_CODES,
  type Landscape,
  type ObstaclePlacement,
} from '../../landscape';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import { dwellingGatePoint } from '../../village/paths/network-grid';
import { villageGate } from '../../village/people/departure';
import { obstacleBlockRadiusM } from '../../village/paths/terrain';
import { landscapeTrailLines } from '../../village/trade/premium-route';
import { dwelling, village } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, FortKind, Road, TileCell, VillageState } from '../../village/types';
import { trailExitsOf } from '../../village/trade/trail-exits';
import { gridOf, tickContext } from '../campaign-tick';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { MEADOW, SUMMER, world } from './campaign-fixtures';
import { port, westForest, withRoute } from './continuation-fixtures';
import { forestInterior } from '../dense-forest';
import {
  marchPath,
  marchPathToEdge,
  marchReachable,
  reachableGoal,
  type MarchPath,
} from '../march';
import {
  MARCH_BUILDING,
  MARCH_FORD,
  MARCH_FOREST,
  MARCH_GATE,
  MARCH_RAMPART,
  MARCH_ROAD,
  MARCH_ROCK,
  MARCH_STEEP,
  MARCH_WATER,
  marchCellAt,
  marchCellCenter,
  marchGrid,
  MarchGridMemo,
  NO_CONTINUATIONS,
  type MarchGrid,
  type Pos,
} from '../march-grid';
import { BASE_FORD, BASE_WATER, marchTerrain } from '../march-terrain';
import { WAR } from '../rules-war';
import { continuationsOf, trailContinuations, trailEntriesOf } from '../trail-continuation';
import { edgeCrossing } from '../world-route';

// Hustý les neprůchozí na jemné mřížce pochodu (forest.md – Hustý les; war.md – Pohyb – Terén;
// plán 2026-11-16-dense-forest – Rozhodnutí 1–4, Úloha 4).

const SIZE = 128;
const TILE = 15;

/** Rovná krajina 1 920 m – louka, kde `forest` neříká jinak, bez potoka. */
function flat(forest: (tx: number, ty: number) => boolean = () => false): Landscape {
  const surface = new Uint8Array(SIZE * SIZE);
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      surface[ty * SIZE + tx] = forest(tx, ty) ? SURFACE_CODES.forest : SURFACE_CODES.meadow;
    }
  }
  return {
    size: SIZE,
    cellSizeM: TILE,
    heights: new Float32Array(SIZE * SIZE),
    surface,
    fertility: new Uint8Array(SIZE * SIZE),
    villageSite: { x: 64, y: 64 },
    stream: [],
    obstacleLayer: null,
  };
}

/** Pruh lesa od jihu k severu přes celou mapu: políčka 44–83, svět x od −300 do 300 m. */
const band = (tx: number): boolean => tx >= 44 && tx < 84;

const road = (id: number, points: Pos[]): Road => ({
  id,
  points,
  bornDay: 0,
  grade: 'improved',
  traffic: [],
  spots: [],
});

/** Ves s pevnými cestami `roads` a obydlími `dwellings`. */
function withRoads(roads: Road[], dwellings: Dwelling[] = []): VillageState {
  return village([], dwellings, {
    roads: {
      nextId: roads.length + 1,
      roads,
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    },
  });
}

/** Buňky, kterými trasa vede – vzorky po 0,25 m podél úseků. */
function crossed(g: MarchGrid, p: MarchPath): number[] {
  const cells = new Set<number>();
  for (let k = 1; k < p.points.length; k++) {
    const a = p.points[k - 1]!;
    const b = p.points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let s = 0; s <= n; s++) {
      cells.add(marchCellAt(g, { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n }));
    }
  }
  return [...cells];
}

/** Počet rozdílných prvků dvou polí stejné délky. */
function differences(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length);
  let n = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++;
  return n;
}

describe('hustý les (forest.md – Hustý les)', () => {
  it('vnitřek lesa je neprůchozí, okraj lesa (pruh 10 m) ne', () => {
    const l = generateLandscape(1);
    const grid = marchGrid(l, obstaclesOf(l), null);
    expect(grid.cellM).toBe(WAR.march.cellM);
    const interior = forestInterior(l, grid);
    const field = buildForestField(l, { remember: false });
    const other = MARCH_WATER | MARCH_FORD | MARCH_STEEP;
    let dense = 0;
    let edge = 0;
    for (let c = 0; c < interior.length; c++) {
      const f = grid.flags[c]!;
      if ((f & other) !== 0) continue;
      if (interior[c] === 1) {
        dense++;
        if (grid.pace[c] !== 0 || (f & MARCH_FOREST) === 0) throw new Error(`buňka ${c}`);
        continue;
      }
      const p = marchCellCenter(grid, c);
      const d = field.distanceAt(p.x, p.z);
      if (d < 4.5 || d > 5.5 || (f & MARCH_ROCK) !== 0) continue;
      // okraj lesa ≈ 5 m od hranice – průchozí tempem louky, hustým lesem není
      edge++;
      expect(grid.pace[c]).toBe(1);
      expect(f & MARCH_FOREST).toBe(0);
    }
    expect(dense).toBeGreaterThan(10_000);
    expect(edge).toBeGreaterThan(1_000);
  });

  it('krajina bez lesního políčka nemá hustý les (pole lesa se nestaví)', () => {
    const meadow = flat();
    // pole lesa louky je všude mimo les – vnitřek bez pole lesa (zkratka) je tentýž
    expect(buildForestField(meadow, { remember: false }).distance.every((d) => d < 0)).toBe(true);
    const grid = marchGrid(meadow, null, null);
    expect(forestInterior(meadow, grid).every((v) => v === 0)).toBe(true);
    expect(grid.pace.every((p) => p === 1)).toBe(true);
  });

  it('stezka hustým lesem – průchozí jen průsekem, bez cesty cíl na téže straně lesa', () => {
    const land = flat(band);
    const W = { x: -500, z: 100 };
    const E = { x: 500, z: 100 };
    const lane = road(1, [
      { x: -600, z: 100 },
      { x: 600, z: 100 },
    ]);
    const grid = marchGrid(land, null, withRoads([lane]));
    const path = marchPath(grid, W, E)!;
    expect(path).not.toBeNull();
    for (const c of crossed(grid, path)) expect(grid.pace[c]).toBeGreaterThan(0);
    for (let x = -250; x <= 250; x += 0.5) {
      const f = grid.flags[marchCellAt(grid, { x, z: 100 })]!;
      expect(f & (MARCH_FOREST | MARCH_ROAD)).toBe(MARCH_FOREST | MARCH_ROAD);
    }
    // vedle průseku hustý les neprůchodný
    expect(grid.pace[marchCellAt(grid, { x: 0, z: 110 })]).toBe(0);
    const without = marchGrid(land, null, withRoads([]));
    expect(marchPath(without, W, E)).toBeNull();
    const goal = reachableGoal(without, W, E)!;
    expect(goal.x).toBeLessThan(-280);
    // opakovaný dotaz (paměť při mřížce) dá týž posun jako nový objekt; jiná buňka startu počítá
    // znovu a mřížka bez paměti (nový objekt) dá totéž
    const again = reachableGoal(without, { x: W.x + 0.5, z: W.z }, E)!;
    expect(again).toEqual(goal);
    expect(again).not.toBe(goal);
    expect(reachableGoal(marchGrid(land, null, withRoads([])), W, E)).toEqual(goal);
    expect(reachableGoal(without, W, W)).toBe(W);
  });
});

describe('stezka krajiny – průsek i na mapě bez vsi (Rozhodnutí 2)', () => {
  it('průsek pod osami `landscapeTrailLines`, trasa mezi konci stezky', () => {
    const l = withRoute([port('S', 64), port('N', 64)]);
    const grid = marchGrid(l, obstaclesOf(l), null);
    const lines = landscapeTrailLines(l);
    expect(lines.length).toBeGreaterThan(0);
    let samples = 0;
    for (const line of lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const a = line[k]!;
        const b = line[k + 1]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
        for (let s = 0; s <= n; s++) {
          const p = { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n };
          const c = marchCellAt(grid, p);
          samples++;
          if ((grid.flags[c]! & MARCH_ROAD) === 0 || grid.pace[c] !== WAR.pace.road) {
            throw new Error(`osa bez průseku v (${p.x}; ${p.z})`);
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(1_000);
    // stezka vede i hustým lesem
    expect(grid.flags.some((f) => f === (MARCH_FOREST | MARCH_ROAD))).toBe(true);
    const ends = skeletonFeaturesOf(l)!.route!.ends;
    const [a, b] = ends.map((e) => ({ x: e.point[0], z: e.point[1] }));
    expect(marchPath(grid, a!, b!)).not.toBeNull();
  });
});

describe('ves v pasece uprostřed hustého lesa (Review Focus 1)', () => {
  const land = flat(band);
  const layer = packObstacles([], SIZE, TILE);
  const manor: Dwelling = { ...dwelling(1, 'dvorec'), position: { x: 0, z: 0, rotation: 0 } };
  const gate = dwellingGatePoint(land, manor);
  const edge = { x: -955, z: gate.z };

  it('s cestou k okraji mapy dojde vojsko od okraje k brance', () => {
    const lane = road(1, [gate, { x: -958, z: gate.z }]);
    const grid = marchGrid(land, layer, withRoads([lane], [manor]));
    expect(marchPath(grid, edge, gate)).not.toBeNull();
  });

  it('bez cesty je paseka ostrov – cíl u branky se posune mimo ni', () => {
    const grid = marchGrid(land, layer, withRoads([], [manor]));
    // paseka kolem dvorce je průchozí a hustým lesem není
    const inside = { x: 0, z: -12 };
    const c = marchCellAt(grid, inside);
    expect(grid.pace[c]).toBe(1);
    expect(grid.flags[c]! & MARCH_FOREST).toBe(0);
    expect(marchReachable(grid, inside, edge)).toBe(false);
    expect(marchReachable(grid, edge, gate)).toBe(false);
    const goal = reachableGoal(grid, edge, gate)!;
    expect(Math.hypot(goal.x - gate.x, goal.z - gate.z)).toBeGreaterThan(250);
  });

  it('z kotvy i od branky: bez cesty okraj ani cíl za lesem nedosažitelné, s cestou obojí (oprava Úlohy 5)', () => {
    // kotva vsi (střed dvorce) je buňka stavby – únik z ní jde jen do nejbližší průchodné buňky
    // (paseky), ne rovně lesem do oblasti za ním; od branky vyráží tažení i výprava (`villageGate`)
    const anchor = { x: manor.position.x, z: manor.position.z };
    const behind = { x: -500, z: 0 };
    const sealed = marchGrid(land, layer, withRoads([], [manor]));
    expect(sealed.flags[marchCellAt(sealed, anchor)]! & MARCH_BUILDING).not.toBe(0);
    expect(villageGate(village([], [manor]), land)).toEqual({ x: gate.x, z: gate.z });
    const lane = road(1, [gate, { x: -958, z: gate.z }]);
    const open = marchGrid(land, layer, withRoads([lane], [manor]));
    for (const from of [anchor, gate]) {
      for (const direction of ['N', 'E', 'S', 'W'] as const) {
        expect(marchPathToEdge(sealed, from, direction)).toBeNull();
      }
      expect(marchPath(sealed, from, behind)).toBeNull();
      expect(marchReachable(sealed, from, behind)).toBe(false);
      // cíl se posune na paseku, ne za les
      const goal = reachableGoal(sealed, from, behind)!;
      expect(Math.abs(goal.x)).toBeLessThan(100);
      // s cestou k západnímu okraji dojdou z kotvy i od branky stejně – k okraji i za les
      expect(marchPathToEdge(open, from, 'W')).not.toBeNull();
      expect(marchReachable(open, from, behind)).toBe(true);
      expect(marchPathToEdge(open, from, 'E')).toBeNull();
    }
  });
});

describe('paseky, mezery a skály', () => {
  it('vykácená paseka vsi hustým lesem není (≥ 50 % pokácených stromů políčka)', () => {
    const land = flat(band);
    // políčko (64, 64) uprostřed lesa – svět x i z od 0 do 15 m – se čtyřmi dospělými stromy
    const trees: ObstaclePlacement[] = [
      [3, 3],
      [11, 3],
      [3, 11],
      [11, 11],
    ].map(([x, z], k) => ({
      id: k + 1,
      kind: 'tree',
      look: 'beech-1',
      x: x!,
      z: z!,
      rotation: 0,
      scale: 1,
    }));
    const layer = packObstacles(trees, SIZE, TILE);
    const before = marchGrid(land, layer, village([], []));
    expect(before.flags[marchCellAt(before, { x: 7.5, z: 7.5 })]).toBe(MARCH_FOREST);
    const felled = village([], [], {
      clearedObstacles: [
        { id: 1, day: 0 },
        { id: 2, day: 0 },
      ],
    });
    const after = marchGrid(land, layer, felled);
    // středy buněk políčka leží v [1,25; 13,75]² – buňka do 10 m od nich hustým lesem není
    // (paseka je nový okraj lesa), o buňku dál ano
    const lo = 1.25;
    const hi = 13.75;
    let open = 0;
    for (let z = -20; z <= 35; z += WAR.march.cellM) {
      for (let x = -20; x <= 35; x += WAR.march.cellM) {
        const c = marchCellAt(after, { x: x + 1.25, z: z + 1.25 });
        const p = marchCellCenter(after, c);
        const d = Math.hypot(Math.max(0, lo - p.x, p.x - hi), Math.max(0, lo - p.z, p.z - hi));
        if (d <= WAR.march.denseForestM) {
          open++;
          expect(after.flags[c]).toBe(0);
          expect(after.pace[c]).toBe(1);
        } else if (d > WAR.march.denseForestM + WAR.march.cellM) {
          expect(after.flags[c]).toBe(MARCH_FOREST);
        }
      }
    }
    expect(open).toBeGreaterThan(36);
  });

  it('mezera 4 m mezi domy zůstane průchozí – trasa napříč řadou vede mezerou (D55)', () => {
    // zemnice zabírá x ± 2,9 m: mezera od −0,75 do 3,25 m, po odstupu 1 m volný pruh 0,25–2,25 m
    const house = (id: number, x: number): Dwelling => ({
      ...dwelling(id, 'zemnice'),
      position: { x, z: 0, rotation: 0 },
      plainShape: true,
    });
    const grid = marchGrid(flat(), null, village([], [house(1, -3.65), house(2, 6.15)]));
    expect(grid.pace[marchCellAt(grid, { x: -3.65, z: 0 })]).toBe(0);
    expect(grid.pace[marchCellAt(grid, { x: 1.25, z: 0 })]).toBe(1);
    // vzdušná čára přejde řadu uprostřed mezery (x = 1,25); objížďka kolem domu je i po buňkách
    // dražší (víc kroků napříč)
    const from = { x: -3, z: -40 };
    const to = { x: 5.5, z: 40 };
    const path = marchPath(grid, from, to)!;
    expect(path.lengthM).toBeLessThanOrEqual(1.15 * Math.hypot(to.x - from.x, to.z - from.z));
    // místo, kde trasa přejde řadu domů (z = 0)
    let crossing: number | null = null;
    for (let k = 1; k < path.points.length; k++) {
      const a = path.points[k - 1]!;
      const b = path.points[k]!;
      if ((a.z <= 0 && b.z >= 0) || (a.z >= 0 && b.z <= 0)) {
        crossing = b.z === a.z ? a.x : a.x + ((b.x - a.x) * (0 - a.z)) / (b.z - a.z);
        break;
      }
    }
    expect(crossing).not.toBeNull();
    expect(crossing!).toBeGreaterThan(-0.75);
    expect(crossing!).toBeLessThan(3.25);
  });

  it('balvan vrstvy je skála v poloměru jako u pěšin, odstraněný vsí neblokuje', () => {
    const land = flat();
    const at = { x: 1.25, z: 1.25 };
    const boulder: ObstaclePlacement = {
      id: 7,
      kind: 'boulder',
      look: 'boulder',
      ...at,
      rotation: 0,
      scale: 3,
    };
    const layer = packObstacles([boulder], SIZE, TILE);
    const radius = obstacleBlockRadiusM('boulder', 3)!;
    expect(radius).toBeCloseTo(3.6, 6);
    const grid = marchGrid(land, layer, null);
    const rock: number[] = [];
    grid.flags.forEach((f, c) => {
      if ((f & MARCH_ROCK) !== 0) rock.push(c);
    });
    const expected: number[] = [];
    for (let z = -5; z <= 5; z += WAR.march.cellM) {
      for (let x = -5; x <= 5; x += WAR.march.cellM) {
        const c = marchCellAt(grid, { x: at.x + x, z: at.z + z });
        const p = marchCellCenter(grid, c);
        if (Math.hypot(p.x - at.x, p.z - at.z) <= radius) expected.push(c);
      }
    }
    expect(rock.sort((a, b) => a - b)).toEqual([...new Set(expected)].sort((a, b) => a - b));
    expect(rock).toHaveLength(9);
    for (const c of rock) expect(grid.pace[c]).toBe(0);
    const cleared = marchGrid(
      land,
      layer,
      village([], [], { clearedObstacles: [{ id: 7, day: 0 }] }),
    );
    expect(cleared.flags.some((f) => (f & MARCH_ROCK) !== 0)).toBe(false);
    for (const c of rock) expect(cleared.pace[c]).toBe(1);
  });
});

describe('determinismus a předběžná síta terénu', () => {
  it('dvě stavby mřížky z téhož vstupu dají shodné `pace` i `flags`', () => {
    const a = generateLandscape(2);
    const b = generateLandscape(2);
    const lane = road(1, [
      { x: -400, z: -300 },
      { x: 0, z: 0 },
      { x: 500, z: 200 },
    ]);
    const v = withRoads(
      [lane],
      [{ ...dwelling(1, 'dvorec'), position: { x: 20, z: 20, rotation: 0 } }],
    );
    const first = marchGrid(a, obstaclesOf(a), v);
    const second = marchGrid(b, obstaclesOf(b), v);
    expect(differences(first.pace, second.pace)).toBe(0);
    expect(differences(first.flags, second.flags)).toBe(0);
  });

  it.each([1, 2, 3])('terén se sítem = terén bez síta – seed %i', (seed) => {
    const l = generateLandscape(seed);
    const sieved = marchTerrain(l);
    const exact = marchTerrain(l, true);
    expect(differences(sieved.base, exact.base)).toBe(0);
    // mapa má vodu i brody – síto se opravdu zkoušelo
    expect(exact.base.some((b) => (b & BASE_WATER) !== 0)).toBe(true);
    expect(exact.base.some((b) => (b & BASE_FORD) !== 0)).toBe(true);
  });
});

/** Hotové opevnění 4 × 4 políčka kolem středu (svět −30…30 m), volitelně s branou na jihu. */
function ring(kind: FortKind, gate = false): Fortification {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: SIZE, cellSizeM: TILE });
  if ('error' in area) throw new Error(area.error);
  const outline = areaOutline(area, kind);
  const gates = gate ? addGate(outline, [], { x: 0, z: -30 }) : [];
  if (!Array.isArray(gates)) throw new Error(gates.error);
  return {
    id: 1,
    grid: null,
    cells,
    kind,
    segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
    gates,
  };
}

/** Buňky hustého lesa bez průseku, které mají tempo (průchod hustým lesem). */
function openForest(g: MarchGrid): number {
  let n = 0;
  g.flags.forEach((f, c) => {
    if ((f & (MARCH_FOREST | MARCH_ROAD)) === MARCH_FOREST && g.pace[c]! > 0) n++;
  });
  return n;
}

describe('opevnění v hustém lese (oprava Úlohy 4 – pás opevnění je paseka)', () => {
  const land = flat(() => true);
  const empty = packObstacles([], SIZE, TILE);
  const fortified = (f: Fortification): VillageState =>
    village([], [], { fortifications: [f], lastDay: 10 });

  it('holý val bez pasek (bez vrstvy překážek) průchod hustým lesem neotevře', () => {
    const grid = marchGrid(land, null, fortified(ring('rampart')));
    let rampart = 0;
    grid.flags.forEach((f) => {
      if ((f & MARCH_RAMPART) !== 0) rampart++;
    });
    expect(rampart).toBeGreaterThan(100);
    expect(openForest(grid)).toBe(0);
  });

  it('pás valu je paseka – val průchodný tempem valu, hustý les jen dál než 10 m od pásu', () => {
    const grid = marchGrid(land, empty, fortified(ring('rampart')));
    expect(openForest(grid)).toBe(0);
    let rampart = 0;
    grid.flags.forEach((f, c) => {
      if ((f & MARCH_RAMPART) === 0) return;
      rampart++;
      expect(f & MARCH_FOREST).toBe(0);
      expect(grid.pace[c]!).toBeGreaterThan(0);
    });
    expect(rampart).toBeGreaterThan(100);
    // střed plochy je od křivky 30 m – od pásu valu (10 m) 20 m: hustý les zůstal
    expect(grid.flags[marchCellAt(grid, { x: 0, z: 0 })]).toBe(MARCH_FOREST);
    // paseka pásu vede kolem dokola – od jižní k severní straně vně valu
    expect(marchReachable(grid, { x: 0, z: -35 }, { x: 0, z: 35 })).toBe(true);
  });

  it('úzký pás plotu (1 m) je také paseka – brána v hustém lese je průchodná', () => {
    const grid = marchGrid(land, empty, fortified(ring('fence', true)));
    const gate: number[] = [];
    grid.flags.forEach((f, c) => {
      if ((f & MARCH_GATE) !== 0) gate.push(c);
    });
    expect(gate.length).toBeGreaterThan(0);
    for (const c of gate) {
      expect(grid.flags[c]! & MARCH_FOREST).toBe(0);
      expect(grid.pace[c]!).toBeGreaterThan(0);
    }
    expect(marchReachable(grid, { x: 0, z: -36 }, { x: 0, z: -24 })).toBe(true);
  });
});

describe('drobné opravy Úlohy 4', () => {
  it('voda, brod a sráz uvnitř hustého lesa nesou i `MARCH_FOREST` (dohled a šelmy průseku)', () => {
    let terrain = 0;
    for (const seed of [1, 2, 3]) {
      const l = generateLandscape(seed);
      const grid = marchGrid(l, null, null);
      const interior = forestInterior(l, grid);
      grid.flags.forEach((f, c) => {
        if ((f & (MARCH_WATER | MARCH_FORD | MARCH_STEEP)) === 0 || interior[c] !== 1) return;
        terrain++;
        expect(f & MARCH_FOREST).toBe(MARCH_FOREST);
      });
      // mimo hustý les terén `MARCH_FOREST` nedostane
      grid.flags.forEach((f, c) => {
        if (interior[c] === 0) expect(f & MARCH_FOREST).toBe(0);
      });
    }
    expect(terrain).toBeGreaterThan(0);
  });

  it('balvan s poloměrem 1,5 m na rohu buněk blokuje aspoň buňku, ve které stojí', () => {
    // rohy buněk jsou na násobcích 2,5 m – středy čtyř okolních buněk 1,77 m daleko
    const boulder: ObstaclePlacement = {
      id: 1,
      kind: 'boulder',
      look: 'boulder',
      x: 0,
      z: 0,
      rotation: 0,
      scale: 1.25,
    };
    expect(obstacleBlockRadiusM('boulder', 1.25)).toBeCloseTo(1.5, 6);
    const grid = marchGrid(flat(), packObstacles([boulder], SIZE, TILE), null);
    const rock: number[] = [];
    grid.flags.forEach((f, c) => {
      if ((f & MARCH_ROCK) !== 0) rock.push(c);
    });
    expect(rock).toEqual([marchCellAt(grid, { x: 0, z: 0 })]);
    expect(grid.pace[rock[0]!]).toBe(0);
  });
});

/** Buňky pod lomenou čarou – vzorky po 0,5 m. */
function underLine(g: MarchGrid, line: readonly Pos[]): number[] {
  const cells = new Set<number>();
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k]!;
    const b = line[k + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
    for (let s = 0; s <= n; s++) {
      cells.add(marchCellAt(g, { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n }));
    }
  }
  return [...cells];
}

/** Ves s hotovou (nebo rozestavěnou) stezkou `direction` po jedné cestě `from` → `to`. */
function trailVillage(
  direction: 'E' | 'W',
  from: Pos,
  to: Pos,
  builtDay: number | null,
): VillageState {
  return village([], [], {
    roads: {
      nextId: 2,
      roads: [road(1, [from, to])],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    },
    trails: [
      {
        id: 1,
        direction,
        pieces: [{ roadId: 1, grade: 'improved', manDays: 1 }],
        lengthM: Math.abs(to.x - from.x),
        startedDay: 0,
        builtDay,
      },
    ],
  });
}

describe('pokračování zemské stezky a kus ke kraji (Úloha 4b – Rozhodnutí 13)', () => {
  it('osa pokračování je průsek – i hustým lesem; ze vstupu se dojde na konec osy', () => {
    const { landscape: l, entry } = westForest();
    const o = obstaclesOf(l);
    const axis = trailContinuations(l, o, [entry], null)[0]!;
    const end = axis.at(-1)!;
    const grid = marchGrid(l, o, null, { trailContinuations: [axis] });
    const without = marchGrid(l, o, null);
    let forest = 0;
    for (const c of underLine(grid, axis)) {
      const f = grid.flags[c]!;
      if ((f & MARCH_ROAD) === 0 || !(grid.pace[c]! > 0)) throw new Error(`osa bez průseku ${c}`);
      if ((without.flags[c]! & MARCH_FOREST) === 0) continue;
      forest++;
      expect(f & (MARCH_FOREST | MARCH_ROAD)).toBe(MARCH_FOREST | MARCH_ROAD);
    }
    expect(forest).toBeGreaterThan(0);
    expect(marchPath(grid, entry, end)).not.toBeNull();
    // bez osy je vstup hustým lesem – únik nejvýš 40 m za nejbližší průchodnou buňku (oprava
    // Úlohy 5) do oblasti cíle nevede, cíl se posune
    const goal = reachableGoal(without, entry, end);
    expect(goal === null || Math.hypot(goal.x - end.x, goal.z - end.z) > WAR.march.cellM).toBe(
      true,
    );
  });

  it('kus ke kraji: hotová stezka s koncem do 30 m od kraje má průsek až k okraji', () => {
    const { landscape: l, entry } = westForest();
    const z = entry.z;
    const from = { x: -600, z };
    const edgeCell = marchCellAt(marchGrid(l, null, null), entry);
    const near = marchGrid(l, null, trailVillage('W', from, { x: -935, z }, 3));
    for (const c of underLine(near, [
      { x: -935, z },
      { x: -960, z },
    ])) {
      expect(near.flags[c]! & MARCH_ROAD).toBe(MARCH_ROAD);
      expect(near.pace[c]).toBeGreaterThan(0);
    }
    // konec 80 m od kraje nebo stezka ve stavbě – hustý les u kraje zůstane neprůchozí
    const far = marchGrid(l, null, trailVillage('W', from, { x: -880, z }, 3));
    const building = marchGrid(l, null, trailVillage('W', from, { x: -935, z }, null));
    for (const [g, endX] of [
      [far, -880],
      [building, -935],
    ] as const) {
      let dense = 0;
      for (const c of underLine(g, [
        { x: endX - 5, z },
        { x: -960, z },
      ])) {
        if ((g.flags[c]! & MARCH_FOREST) === 0) continue;
        dense++;
        expect(g.pace[c]).toBe(0);
      }
      expect(dense).toBeGreaterThan(0);
      expect(g.pace[edgeCell]).toBe(0);
    }
  });

  it('paměť mřížek podle pole os – tentýž objekt, bez os jiný', () => {
    const { landscape: l, entry } = westForest();
    const o = obstaclesOf(l);
    const memo = new MarchGridMemo();
    const axes = trailContinuations(l, o, [entry], null);
    const first = memo.gridOf(l, o, null, SUMMER, axes);
    expect(memo.gridOf(l, o, null, SUMMER, axes)).toBe(first);
    const plain = memo.gridOf(l, o, null, SUMMER, NO_CONTINUATIONS);
    expect(plain).not.toBe(first);
    expect(memo.gridOf(l, o, null, SUMMER)).toBe(plain);
  });

  it('mapa bez vsi: další den tatáž mřížka, dostavěná stezka souseda – nová', () => {
    const { landscape: l, entry } = westForest();
    const o = obstaclesOf(l);
    const memo = new MarchGridMemo();
    // stezka souseda dostavěná v den SUMMER + 1 – osa platí od dalšího dne (`builtDay < den`)
    const map = {
      landscape: l,
      obstacles: o,
      trailEntries: [{ point: entry, builtDay: SUMMER + 1 }],
    };
    const on = (day: number): MarchGrid =>
      memo.gridOf(l, o, null, day, continuationsOf(map, null, day));
    const before = on(SUMMER);
    expect(on(SUMMER + 1)).toBe(before);
    const after = on(SUMMER + 2);
    expect(after).not.toBe(before);
    expect(on(SUMMER + 3)).toBe(after);
    const passable = (g: MarchGrid): number => g.pace.reduce((n, p) => (p > 0 ? n + 1 : n), 0);
    expect(passable(after)).toBeGreaterThan(passable(before));
  });

  it('přechod u konce stezky: okrajová buňka sousední mapy je průchozí jen s pokračováním', () => {
    const { landscape: l, entry } = westForest();
    const home = trailVillage('E', { x: 500, z: entry.z }, { x: 935, z: entry.z }, 3);
    const exits = trailExitsOf(home);
    expect(exits).toEqual([
      { direction: 'E', end: { x: 935, z: entry.z }, edge: { x: 960, z: entry.z }, builtDay: 3 },
    ]);
    const trailEntries = trailEntriesOf({ x: 1, y: 0 }, [{ cell: { x: 0, y: 0 }, exits }]);
    const next: CampaignMap = { landscape: l, obstacles: obstaclesOf(l), villageIds: [] };
    const worldWith = (map: CampaignMap): CampaignWorld => ({
      clock: world,
      landscapeOf: (c) =>
        c.x === 0 && c.y === 0 ? { ...MEADOW, villageIds: ['home'] } : c.x === 1 ? map : null,
      villageAt: (id) => (id === 'home' ? home : null),
      grids: new MarchGridMemo(),
    });
    const crossing = edgeCrossing({ x: 0, y: 0 }, { x: 1, y: 0 }, exits[0]!.edge);
    const open = gridOf({ x: 1, y: 0 }, SUMMER, tickContext(worldWith({ ...next, trailEntries })));
    expect(open.pace[marchCellAt(open, crossing)]).toBeGreaterThan(0);
    const closed = gridOf({ x: 1, y: 0 }, SUMMER, tickContext(worldWith(next)));
    expect(closed.pace[marchCellAt(closed, crossing)]).toBe(0);
  });
});
