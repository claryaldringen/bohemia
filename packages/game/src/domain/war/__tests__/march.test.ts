import { describe, expect, it } from 'vitest';
import { dayIndexOf, OFFICIAL_WORLD, TOTAL_GAME_DAYS } from '../../calendar';
import {
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
  TREE_KINDS,
  obstacleKind,
  type Landscape,
  type StreamPoint,
} from '../../landscape';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import type { FortKind, FortTop, Road, TileCell, VillageState } from '../../village/types';
import { village } from '../../village/__tests__/kin-fixtures';
import {
  MARCH_FORD,
  MARCH_FOREST,
  MARCH_GATE,
  MARCH_RAMPART,
  MARCH_ROAD,
  MARCH_WALL,
  MARCH_WATER,
  marchCellAt,
  marchGrid,
  type MarchGrid,
} from '../march-grid';
import {
  marchPath,
  marchPathToEdge,
  marchProgress,
  marchSeconds,
  marchSpeed,
  type GroupPace,
  type MarchPath,
} from '../march';
import { frostDay, isMarchWinter } from '../season';

// Pohyb vojska (war.md – Pohyb – mapu po mapě, Zima; fortifications.md – Prolomení).

const SIZE = 128;
const SUMMER = dayIndexOf({ year: 501, month: 7, day: 15 });
const WINTER = dayIndexOf({ year: 501, month: 1, day: 15 });
/** Skutečné sekundy herního dne (≈ 86 s). */
const DAY_S = (OFFICIAL_WORLD.endMs - OFFICIAL_WORLD.startMs) / 1000 / TOTAL_GAME_DAYS;
const FOOT: GroupPace = { onFoot: 20, riders: 0, woundedOnFoot: 0, herd: 0 };

/** Rovná krajina – louka, kde `forest` neříká jinak, bez překážek; volitelně potok. */
function flat(
  forest: (tx: number, ty: number) => boolean = () => false,
  stream: StreamPoint[] = [],
): Landscape {
  const surface = new Uint8Array(SIZE * SIZE);
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      surface[ty * SIZE + tx] = forest(tx, ty) ? SURFACE_CODES.forest : SURFACE_CODES.meadow;
    }
  }
  return {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface,
    fertility: new Uint8Array(SIZE * SIZE),
    villageSite: { x: 64, y: 64 },
    stream,
    obstacleLayer: null,
  };
}

/** Potok od jihu k severu ve sloupci políček 64 (svět x ≈ 7,5 m); brod v řádcích `ford`. */
function northStream(ford: [number, number] | null): StreamPoint[] {
  const points: StreamPoint[] = [];
  for (let y = 0; y < SIZE; y++) {
    const shallow = ford !== null && y >= ford[0] && y <= ford[1];
    const half = shallow ? 0.12 : 0.3;
    points.push({ x: 64, y, halfWidthLeft: half, halfWidthRight: half, level: 0, shallow });
  }
  return points;
}

const meadowOf = (p: MarchPath): number => p.meadowM[p.meadowM.length - 1]!;
const flagged = (g: MarchGrid, p: MarchPath, flag: number): number =>
  p.cells.filter((c) => (g.flags[c]! & flag) !== 0).length;

describe('tempo vojska (war.md – Pohyb – Tempo)', () => {
  it('1 km po louce ≈ 4–5 min ≈ 3 herní dny', () => {
    const grid = marchGrid(flat(), null, null);
    const path = marchPath(grid, { x: -500, z: 0 }, { x: 500, z: 0 })!;
    expect(path.lengthM).toBeGreaterThan(999);
    expect(path.lengthM).toBeLessThan(1005);
    const seconds = marchSeconds(path, marchSpeed(FOOT, SUMMER));
    expect(seconds / 60).toBeGreaterThan(4);
    expect(seconds / 60).toBeLessThan(5);
    expect(seconds / DAY_S).toBeGreaterThan(2.8);
    expect(seconds / DAY_S).toBeLessThan(3.5);
  });

  it('hustý les čtyřikrát pomaleji', () => {
    const meadow = marchPath(marchGrid(flat(), null, null), { x: -500, z: 0 }, { x: 500, z: 0 })!;
    const grid = marchGrid(
      flat(() => true),
      null,
      null,
    );
    const forest = marchPath(grid, { x: -500, z: 0 }, { x: 500, z: 0 })!;
    expect(flagged(grid, forest, MARCH_FOREST)).toBe(forest.cells.length);
    expect(meadowOf(forest) / meadowOf(meadow)).toBeCloseTo(4, 2);
  });

  it('les obejde, když je to kratší než projít ho', () => {
    // pruh lesa 150 m napříč, s mezerou louky 600 m severně
    const strip = (tx: number, ty: number): boolean => tx >= 60 && tx < 70 && ty < 100;
    const grid = marchGrid(flat(strip), null, null);
    const path = marchPath(grid, { x: -400, z: 0 }, { x: 400, z: 0 })!;
    // 4 × 150 m lesem = 600 m louky navíc, oklika ≈ 2 × 600 m – vojsko jde lesem
    expect(flagged(grid, path, MARCH_FOREST)).toBeGreaterThan(10);
    const far = marchPath(grid, { x: -100, z: 500 }, { x: 100, z: 500 })!;
    expect(flagged(grid, far, MARCH_FOREST)).toBe(0);
  });

  it('skupina jde tempem nejpomalejšího, sníh × 0,75', () => {
    const foot = marchSpeed(FOOT, SUMMER);
    expect(foot).toBe(3.5);
    expect(marchSpeed({ ...FOOT, onFoot: 0, riders: 5 }, SUMMER)).toBeCloseTo(foot * 1.5);
    expect(marchSpeed({ ...FOOT, riders: 5 }, SUMMER)).toBe(foot);
    expect(marchSpeed({ ...FOOT, woundedOnFoot: 2 }, SUMMER)).toBeCloseTo(foot * 0.75);
    expect(marchSpeed({ ...FOOT, riders: 5, onFoot: 0, herd: 30 }, SUMMER)).toBeCloseTo(foot * 0.5);
    expect(marchSpeed(FOOT, WINTER)).toBeCloseTo(foot * 0.75);
  });

  it('poloha na trase podle ušlých metrů louky', () => {
    const grid = marchGrid(flat(), null, null);
    const path = marchPath(grid, { x: -500, z: 5 }, { x: 500, z: 5 })!;
    expect(marchProgress(path, 0)).toEqual({ x: -500, z: 5 });
    expect(marchProgress(path, 500).x).toBeCloseTo(0, 0);
    expect(marchProgress(path, 1e9)).toEqual({ x: 500, z: 5 });
  });
});

describe('voda jen přes brod (war.md – Pohyb – Terén)', () => {
  it('potok bez brodu vojsko nepřejde', () => {
    const grid = marchGrid(flat(undefined, northStream(null)), null, null);
    expect(marchPath(grid, { x: -300, z: 0 }, { x: 300, z: 0 })).toBeNull();
    // z vody (vojsko stojí v buňce u břehu) ven na bližší břeh
    expect(marchPath(grid, { x: 7.5, z: 0 }, { x: -300, z: 0 })).not.toBeNull();
  });

  it('přes potok jen brodem', () => {
    const grid = marchGrid(flat(undefined, northStream([100, 106])), null, null);
    const path = marchPath(grid, { x: -300, z: 0 }, { x: 300, z: 0 })!;
    expect(flagged(grid, path, MARCH_WATER)).toBe(0);
    expect(flagged(grid, path, MARCH_FORD)).toBeGreaterThan(0);
    // brod leží v řádcích políček 100–106 (svět z ≈ 547–637 m)
    const crossing = path.points.filter((p) => Math.abs(p.x - 7.5) < 10);
    for (const p of crossing) expect(p.z).toBeGreaterThan(530);
  });
});

/** Opevnění 4 × 4 políčka kolem středu (svět −30…30 m), úseky hotové ve dni 0. */
function fort(kind: FortKind, top?: FortTop, gate = false): Fortification {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: SIZE, cellSizeM: 15 });
  if ('error' in area) throw new Error(area.error);
  const outline = areaOutline(area, kind);
  const gates = gate ? addGate(outline, [], { x: 0, z: -30 }) : [];
  if (!Array.isArray(gates)) throw new Error(gates.error);
  return {
    id: 1,
    grid: null,
    cells,
    kind,
    ...(top ? { top } : {}),
    segments: fortSegments(outline).map((s) => ({
      index: s.index,
      builtDay: 0,
      state: 1,
      ...(top ? { topBuiltDay: 0 } : {}),
    })),
    gates,
  };
}

const fortVillage = (f: Fortification, extra: Partial<VillageState> = {}): VillageState =>
  village([], [], { fortifications: [f], lastDay: 10, ...extra });
const OUT = { x: 0, z: -200 };
const IN = { x: 0, z: 0 };

describe('do opevněné vsi (fortifications.md – Obrana, Prolomení)', () => {
  it('palisáda jen branou', () => {
    const grid = marchGrid(flat(), null, fortVillage(fort('palisade', undefined, true)));
    const path = marchPath(grid, OUT, IN)!;
    expect(flagged(grid, path, MARCH_GATE)).toBeGreaterThan(0);
    expect(flagged(grid, path, MARCH_WALL)).toBe(0);
    // ze severu taky jen jižní branou – oklikou kolem obvodu
    const north = marchPath(grid, { x: 0, z: 200 }, IN)!;
    expect(flagged(grid, north, MARCH_GATE)).toBeGreaterThan(0);
    expect(north.lengthM).toBeGreaterThan(260);
  });

  it('bez brány nebo se zavřenou bránou se dovnitř nedojde', () => {
    expect(marchPath(marchGrid(flat(), null, fortVillage(fort('palisade'))), OUT, IN)).toBeNull();
    const f = fort('fence', undefined, true);
    const closed = new Set(f.gates.map((g) => g.segment));
    expect(
      marchPath(marchGrid(flat(), null, fortVillage(f), { closedGates: closed }), OUT, IN),
    ).toBeNull();
  });

  it('mezerou – prolomený a nedostavěný úsek', () => {
    const breached = fort('palisade');
    breached.segments[0] = { ...breached.segments[0]!, breachedDay: 5 };
    expect(marchPath(marchGrid(flat(), null, fortVillage(breached)), OUT, IN)).not.toBeNull();
    const unfinished = fort('palisade');
    unfinished.segments[2] = { ...unfinished.segments[2]!, builtDay: null };
    expect(marchPath(marchGrid(flat(), null, fortVillage(unfinished)), OUT, IN)).not.toBeNull();
  });

  it('přes val čtvrtinovým tempem, val s palisádou ne', () => {
    const grid = marchGrid(flat(), null, fortVillage(fort('rampart')));
    const path = marchPath(grid, OUT, IN)!;
    const rampart = flagged(grid, path, MARCH_RAMPART);
    expect(rampart).toBeGreaterThan(0);
    // každý metr pásu stojí 4 metry louky
    expect(meadowOf(path) - path.lengthM).toBeGreaterThan(rampart * 10 * 2);
    expect(
      marchPath(marchGrid(flat(), null, fortVillage(fort('rampart', 'palisade'))), OUT, IN),
    ).toBeNull();
  });
});

describe('pevné cesty a zemská stezka vsi (war.md – Pohyb – Terén)', () => {
  it('po cestě × 1,5, i lesem', () => {
    const road: Road = {
      id: 1,
      points: [
        { x: -600, z: 100 },
        { x: 600, z: 100 },
      ],
      bornDay: 0,
      grade: 'improved',
      traffic: [],
      spots: [],
    };
    const v = village([], [], {
      roads: { nextId: 2, roads: [road], trees: [], labor: { from: 0, days: 0, shares: [] } },
    });
    const grid = marchGrid(
      flat(() => true),
      null,
      v,
    );
    const path = marchPath(grid, { x: -500, z: 100 }, { x: 500, z: 100 })!;
    expect(flagged(grid, path, MARCH_ROAD)).toBe(path.cells.length);
    expect(Math.abs(meadowOf(path) - 1000 / 1.5)).toBeLessThan(5);
  });
});

describe('zima a únava z mrazu (war.md – Zima)', () => {
  it('zima od prosince do konce února', () => {
    expect(isMarchWinter(dayIndexOf({ year: 501, month: 12, day: 1 }))).toBe(true);
    expect(isMarchWinter(dayIndexOf({ year: 502, month: 2, day: 28 }))).toBe(true);
    expect(isMarchWinter(dayIndexOf({ year: 502, month: 3, day: 1 }))).toBe(false);
    expect(isMarchWinter(dayIndexOf({ year: 501, month: 11, day: 30 }))).toBe(false);
  });

  it('venku v zimě −3 zdraví a −2 % síly, ve vsi se zotaví', () => {
    let man = { health: 100, vigor: 1 };
    for (let d = 0; d < 10; d++) {
      const delta = frostDay(man, true, WINTER + d);
      man = { health: man.health + delta.health, vigor: man.vigor + delta.vigor };
    }
    expect(man.health).toBe(70);
    expect(man.vigor).toBeCloseTo(0.8);
    // zastávka ve vsi mráz zastaví – +10 zdraví a +5 % síly za den až do plných
    for (let d = 10; d < 15; d++) {
      const delta = frostDay(man, false, WINTER + d);
      man = { health: man.health + delta.health, vigor: man.vigor + delta.vigor };
    }
    expect(man).toEqual({ health: 100, vigor: 1 });
    expect(frostDay(man, true, SUMMER)).toEqual({ health: 0, vigor: 0 });
    expect(frostDay({ health: 2, vigor: 0.01 }, true, WINTER)).toEqual({
      health: -2,
      vigor: -0.01,
    });
  });
});

/** Otisk trasy – počet buněk, metry louky a FNV-1a buněk. */
function stamp(path: MarchPath | null): string {
  if (!path) return 'null';
  let h = 2166136261;
  for (const c of path.cells) h = Math.imul(h ^ c, 16777619) >>> 0;
  return `${path.cells.length}:${meadowOf(path).toFixed(2)}:${h.toString(16)}`;
}

describe('zlatá cesta a determinismus (skutečné krajiny)', () => {
  // brodů na mapě | buněk trasy z jihozápadu na severovýchod : metry louky : otisk buněk
  const GOLDEN: Record<number, string> = {
    1: '133|247:5022.16:2fb666ec',
    2: '45|295:6076.18:31b8b50d',
    3: '49|261:5341.81:54706151',
  };

  it.each([1, 2, 3])('seed %i – otisk trasy přes mapu', (seed) => {
    const landscape = generateLandscape(seed);
    const grid = marchGrid(landscape, obstaclesOf(landscape), null);
    const path = marchPath(grid, { x: -900, z: -900 }, { x: 900, z: 900 });
    const fords = grid.flags.filter((f) => (f & MARCH_FORD) !== 0).length;
    expect(`${fords}|${stamp(path)}`).toBe(GOLDEN[seed]);
    if (path) expect(flagged(grid, path, MARCH_WATER)).toBe(0);
  });

  it('stejný vstup → stejná cesta bez ohledu na pořadí volání', () => {
    const a = generateLandscape(2);
    const b = generateLandscape(3);
    const first = stamp(
      marchPath(marchGrid(a, obstaclesOf(a), null), { x: -900, z: 0 }, { x: 900, z: 0 }),
    );
    marchPath(marchGrid(b, obstaclesOf(b), null), { x: 900, z: 0 }, { x: -900, z: 0 });
    const again = generateLandscape(2);
    const grid = marchGrid(again, obstaclesOf(again), null);
    marchPath(grid, { x: 0, z: -900 }, { x: 0, z: 900 });
    expect(stamp(marchPath(grid, { x: -900, z: 0 }, { x: 900, z: 0 }))).toBe(first);
  });

  it('vykácená paseka vsi hustým lesem není', () => {
    const landscape = generateLandscape(1);
    const layer = obstaclesOf(landscape);
    const grid = marchGrid(landscape, layer, null);
    const c = grid.flags.findIndex((f, k) => f === MARCH_FOREST && k > grid.width * 40);
    const i = c % grid.width;
    const center = { x: grid.originX + i * 10, z: grid.originZ + ((c - i) / grid.width) * 10 };
    const cleared: { id: number; day: number }[] = [];
    for (let k = 0; k < layer.count; k++) {
      if (!TREE_KINDS.includes(obstacleKind(layer, k))) continue;
      if (Math.abs(layer.x[k]! - center.x) < 40 && Math.abs(layer.z[k]! - center.z) < 40) {
        cleared.push({ id: layer.id[k]!, day: 0 });
      }
    }
    const v = village([], [], { clearedObstacles: cleared });
    const after = marchGrid(landscape, layer, v);
    expect(after.flags[marchCellAt(after, center)]! & MARCH_FOREST).toBe(0);
  });

  it('k okraji mapy a na opačný okraj', () => {
    const grid = marchGrid(flat(), null, null);
    const east = marchPathToEdge(grid, { x: 0, z: 0 }, 'E')!;
    const end = east.points[east.points.length - 1]!;
    expect(end.x).toBe(955);
    expect(east.lengthM).toBeCloseTo(955, -1);
    const ne = marchPathToEdge(grid, { x: 0, z: 0 }, 'NE')!;
    expect(ne.points[ne.points.length - 1]).toEqual({ x: 955, z: 955 });
  });
});
