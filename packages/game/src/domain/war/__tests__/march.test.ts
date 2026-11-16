import { describe, expect, it } from 'vitest';
import { dayIndexOf, OFFICIAL_WORLD, TOTAL_GAME_DAYS } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  riverCenterlines,
  SURFACE_CODES,
  type Landscape,
  type StreamPoint,
} from '../../landscape';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import type { FortKind, FortTop, Road, TileCell, VillageState } from '../../village/types';
import { dwellingGatePoint } from '../../village/paths/network-grid';
import { dwelling, village } from '../../village/__tests__/kin-fixtures';
import { horsePen } from '../../village/__tests__/horse-fixtures';
import {
  MARCH_BUILDING,
  MARCH_FORD,
  MARCH_FOREST,
  MARCH_GATE,
  MARCH_RAMPART,
  MARCH_ROAD,
  MARCH_WALL,
  MARCH_WATER,
  marchCellAt,
  marchCellCenter,
  marchGrid,
  MarchGridMemo,
  type MarchGrid,
  type Pos,
} from '../march-grid';
import {
  marchPath,
  marchPathToEdge,
  marchProgress,
  marchReachable,
  marchSeconds,
  marchSpeed,
  nearestPassable,
  reachableGoal,
  type GroupPace,
  type MarchPath,
} from '../march';
import { lineOfSight } from '../march-smooth';
import { WAR } from '../rules-war';
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
/** Buňky, kterými trasa vede – vzorky po 0,25 m podél jejích úseků (trasa má jen body zlomu). */
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
const flagged = (g: MarchGrid, p: MarchPath, flag: number): number =>
  crossed(g, p).filter((c) => (g.flags[c]! & flag) !== 0).length;

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

  it('hustý les je neprůchozí – trasa ho obejde, chůze tempem louky', () => {
    const sealed = marchGrid(
      flat(() => true),
      null,
      null,
    );
    expect(marchPath(sealed, { x: -500, z: 0 }, { x: 500, z: 0 })).toBeNull();
    // pruh lesa 150 m napříč od jižního okraje po z ≈ 540 m – vojsko ho obejde severně, hledání
    // tempo nezná a les sám neprůchozí je
    const strip = (tx: number, ty: number): boolean => tx >= 60 && tx < 70 && ty < 100;
    const striped = marchGrid(flat(strip), null, null);
    const path = marchPath(striped, { x: -400, z: 0 }, { x: 400, z: 0 })!;
    for (const c of crossed(striped, path)) expect(striped.pace[c]).toBeGreaterThan(0);
    expect(flagged(striped, path, MARCH_FOREST)).toBe(0);
    expect(Math.max(...path.points.map((p) => p.z))).toBeGreaterThan(500);
    expect(path.lengthM).toBeGreaterThan(1300);
    expect(meadowOf(path)).toBeCloseTo(path.lengthM, 2);
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
    // z vody (vojsko stojí v buňce u západního břehu) ven na bližší břeh
    expect(marchPath(grid, { x: 2, z: 0 }, { x: -300, z: 0 })).not.toBeNull();
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

/**
 * Řeka kostry jako přímka od `from` do `to` (políčka) – 30 m široká; brod v bodech, jejichž
 * řádek políček leží v `ford`.
 */
function riverLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ford: [number, number] | null = null,
): StreamPoint[] {
  const n = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return Array.from({ length: n + 1 }, (_, k) => {
    const y = from.y + ((to.y - from.y) * k) / n;
    return {
      x: from.x + ((to.x - from.x) * k) / n,
      y,
      halfWidthLeft: 1,
      halfWidthRight: 1,
      level: 5 - k / n,
      shallow: ford !== null && y >= ford[0] && y <= ford[1],
      bankLeft: 0,
      bankRight: 0,
    };
  });
}

describe('řeky kostry jen přes brod (war.md – Pohyb – Terén, world-skeleton.md)', () => {
  // Hlavní tok od severu k jihu ve sloupci políček 80 (svět x ≈ 247,5 m), přítok od západu
  // v řádku 30 (svět z ≈ −502,5 m) do osy hlavního toku – mapa bez potoka.
  const main = (ford: [number, number] | null): StreamPoint[] =>
    riverLine({ x: 80, y: 127 }, { x: 80, y: 0 }, ford);
  const tributary = riverLine({ x: 0, y: 30 }, { x: 80, y: 30 });

  it('řeka kostry bez brodu vojsko nepřejde', () => {
    const grid = marchGrid({ ...flat(), rivers: [main(null)] }, null, null);
    expect(marchPath(grid, { x: 0, z: 0 }, { x: 500, z: 0 })).toBeNull();
    expect(marchPath(grid, { x: 0, z: 0 }, { x: -300, z: 300 })).not.toBeNull();
  });

  it('přes hlavní tok jen brodem, přes přítok bez brodu vůbec', () => {
    const grid = marchGrid({ ...flat(), rivers: [main([100, 106]), tributary] }, null, null);
    const path = marchPath(grid, { x: 0, z: 0 }, { x: 500, z: 0 })!;
    expect(path).not.toBeNull();
    expect(flagged(grid, path, MARCH_WATER)).toBe(0);
    expect(flagged(grid, path, MARCH_FORD)).toBeGreaterThan(0);
    // brod leží v řádcích políček 100–106 (svět z ≈ 547–637 m)
    const crossing = path.points.filter((p) => Math.abs(p.x - 247.5) < 10);
    for (const p of crossing) expect(p.z).toBeGreaterThan(530);
    // jih pod přítokem: přítok brod nemá a hlavní tok jde přejít jen severně od soutoku
    expect(marchPath(grid, { x: 0, z: 0 }, { x: 0, z: -800 })).toBeNull();
    expect(grid.flags[marchCellAt(grid, { x: -300, z: -502.5 })]! & MARCH_WATER).toBe(MARCH_WATER);
  });

  it('cíl ve vodě se posune na nejbližší dosažitelný břeh (jako v 0 A.D.)', () => {
    const grid = marchGrid({ ...flat(), rivers: [main(null)] }, null, null);
    const from = { x: 0, z: 0 };
    const click = { x: 247.5, z: 0 };
    expect(grid.flags[marchCellAt(grid, click)]! & MARCH_WATER).toBe(MARCH_WATER);
    expect(marchPath(grid, from, click)).toBeNull();
    const goal = reachableGoal(grid, from, click)!;
    // západní břeh, na kterém vojsko stojí – ne východní za řekou bez brodu
    expect(goal.x).toBeLessThan(247.5);
    expect(Math.hypot(goal.x - click.x, goal.z - click.z)).toBeLessThan(40);
    expect(grid.pace[marchCellAt(grid, goal)]!).toBeGreaterThan(0);
    expect(marchPath(grid, from, goal)).not.toBeNull();
    // z východního břehu (přes řeku se nedostane) na východní břeh
    expect(reachableGoal(grid, { x: 500, z: 0 }, click)!.x).toBeGreaterThan(247.5);
    // determinismus – stejný vstup, stejný cíl
    expect(reachableGoal(grid, from, click)).toEqual(goal);
  });

  it('průchodný cíl za řekou bez brodu se posune na nejbližší dosažitelný břeh', () => {
    const grid = marchGrid({ ...flat(), rivers: [main(null)] }, null, null);
    const from = { x: 0, z: 0 };
    const across = { x: 500, z: 0 };
    expect(grid.pace[marchCellAt(grid, across)]!).toBeGreaterThan(0);
    expect(marchPath(grid, from, across)).toBeNull();
    const goal = reachableGoal(grid, from, across)!;
    // západní břeh, kde vojsko stojí – co nejblíž cíli za řekou
    expect(goal.x).toBeLessThan(247.5);
    expect(goal.x).toBeGreaterThan(200);
    expect(Math.abs(goal.z - across.z)).toBeLessThan(10);
    expect(marchPath(grid, from, goal)).not.toBeNull();
    // z východního břehu je týž cíl dosažitelný – beze změny
    expect(reachableGoal(grid, { x: 600, z: 0 }, across)).toBe(across);
  });

  it('průchodný cíl a cíl, kde vojsko stojí, se nemění', () => {
    const grid = marchGrid({ ...flat(), rivers: [main(null)] }, null, null);
    const from = { x: 0, z: 0 };
    const meadow = { x: -300, z: 300 };
    expect(reachableGoal(grid, from, meadow)).toBe(meadow);
    const water = { x: 247.5, z: 0 };
    expect(reachableGoal(grid, water, water)).toBe(water);
  });

  it('mapa se soutokem řek kostry: osy obou řek jsou voda, kromě brodů', () => {
    const landscape = generateLandscape(1, { ...CURRENT_LAYER_VERSIONS, skeleton: 1 }, undefined, {
      world: 1,
      rivers: [
        { side: 'N', at: 50, widthM: 40, flow: 'in' },
        { side: 'E', at: 64, widthM: 25, flow: 'in' },
        { side: 'S', at: 80, widthM: 45, flow: 'out' },
      ],
      trails: [],
    });
    // bez lesa – hustý les by trasu přes mapu zavřel, test hlídá řeky a brody
    const open: Landscape = {
      ...landscape,
      surface: landscape.surface.map((s) =>
        s === SURFACE_CODES.forest ? SURFACE_CODES.meadow : s,
      ),
    };
    const grid = marchGrid(open, null, null);
    const rivers = riverCenterlines(landscape);
    expect(rivers).toHaveLength(2);
    let fords = 0;
    for (const river of rivers) {
      for (const p of river.points) {
        const flags = grid.flags[marchCellAt(grid, p)]!;
        if (p.shallow === 0) expect(flags & (MARCH_WATER | MARCH_FORD)).not.toBe(0);
        if (flags & MARCH_FORD) fords++;
      }
    }
    expect(fords).toBeGreaterThan(0);
    // přes řeku jen brodem – žádná cesta po buňkách hluboké vody
    const path = marchPath(grid, { x: -900, z: 0 }, { x: 900, z: -300 })!;
    expect(path).not.toBeNull();
    expect(flagged(grid, path, MARCH_WATER)).toBe(0);
    expect(flagged(grid, path, MARCH_FORD)).toBeGreaterThan(0);
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

describe('cíl v neprůchodné buňce (war.md – Pohyb – Cíl v neprůchodné buňce)', () => {
  /** Mřížka 5 × 5 buněk po 10 m od (0, 0); `blocked` = neprůchodné buňky (sloupec, řádek). */
  const tiny = (blocked: (i: number, j: number) => boolean): MarchGrid => {
    const pace = new Float32Array(25);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) pace[j * 5 + i] = blocked(i, j) ? 0 : 1;
    return {
      width: 5,
      height: 5,
      originX: 0,
      originZ: 0,
      cellM: 10,
      pace,
      flags: new Uint16Array(25),
    };
  };

  it('remíza vzdáleností – buňka s nejmenším indexem', () => {
    const grid = tiny((i, j) => i === 2 && j === 2);
    // čtyři sousedé cíle stejně daleko: (2, 1) má index 7, (1, 2) 11, (3, 2) 13, (2, 3) 17
    expect(reachableGoal(grid, { x: 0, z: 0 }, { x: 20, z: 20 })).toEqual({ x: 20, z: 10 });
  });

  it('vojsko sevřené v neprůchodných buňkách unikne do nejbližší průchodné (Rozhodnutí 7)', () => {
    const grid = tiny((i, j) => !(i === 4 && j === 4));
    expect(reachableGoal(grid, { x: 0, z: 0 }, { x: 20, z: 20 })).toEqual({ x: 40, z: 40 });
    expect(reachableGoal(grid, { x: 40, z: 40 }, { x: 20, z: 20 })).toEqual({ x: 40, z: 40 });
    const out = marchPath(grid, { x: 0, z: 0 }, { x: 40, z: 40 })!;
    expect(out.points).toEqual([
      { x: 0, z: 0 },
      { x: 40, z: 40 },
    ]);
    // mapa bez průchodné buňky – dosažitelné místo není žádné
    const sealed = tiny(() => true);
    expect(reachableGoal(sealed, { x: 0, z: 0 }, { x: 20, z: 20 })).toBeNull();
    expect(marchPath(sealed, { x: 0, z: 0 }, { x: 20, z: 20 })).toBeNull();
    expect(marchPathToEdge(sealed, { x: 20, z: 20 }, 'E')).toBeNull();
  });

  it('únik z neprůchodné buňky – rovně do středu nejbližší průchodné, pak trasa na dohled', () => {
    const open = marchGrid(flat(), null, null);
    // blok 3 × 3 buňky kolem startu je neprůchodný (stavba, dorostlý les, palisáda)
    const grid: MarchGrid = { ...open, pace: Float32Array.from(open.pace) };
    const from = { x: 3, z: -2 };
    const at = marchCellAt(grid, from);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) grid.pace[at + dj * grid.width + di] = 0;
    }
    // nejbližší průchodné jsou o dvě buňky rovně – remíza, nižší index je jižní
    const escape = at - 2 * grid.width;
    expect(nearestPassable(grid, at, Infinity)).toBe(escape);
    expect(nearestPassable(grid, at, grid.cellM)).toBe(-1);
    const to = { x: 300, z: 200 };
    expect(marchReachable(grid, from, to)).toBe(true);
    expect(reachableGoal(grid, from, to)).toBe(to);
    const path = marchPath(grid, from, to)!;
    expect(path.points[0]).toEqual(from);
    expect(path.points[1]).toEqual(marchCellCenter(grid, escape));
    expect(path.points[path.points.length - 1]).toEqual(to);
    for (let k = 2; k < path.points.length; k++) {
      expect(lineOfSight(grid, path.points[k - 1]!, path.points[k]!)).toBe(true);
    }
    // úniková buňka nese tempo louky – první úsek stojí svou délku
    const out = marchCellCenter(grid, escape);
    expect(path.meadowM[1]).toBeCloseTo(Math.hypot(out.x - from.x, out.z - from.z), 2);
    // i k okraji
    const edge = marchPathToEdge(grid, from, 'N')!;
    expect(edge.points[1]).toEqual(marchCellCenter(grid, escape));
  });

  /** Hustý les (2r + 1)² buněk kolem `from`; v něm paseka o jedné buňce dvě buňky na východ. */
  const woods = (r: number): { grid: MarchGrid; at: number; pocket: number } => {
    const open = marchGrid(flat(), null, null);
    const grid: MarchGrid = {
      ...open,
      pace: Float32Array.from(open.pace),
      flags: Uint16Array.from(open.flags),
    };
    const at = marchCellAt(grid, { x: 3, z: -2 });
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) grid.pace[at + dj * grid.width + di] = 0;
    }
    grid.pace[at + 2] = 1;
    return { grid, at, pocket: at + 2 };
  };

  it('únik do oblasti cíle nebo přechodu okraje, ne do izolované paseky (Úloha 5)', () => {
    const from = { x: 3, z: -2 };
    // les 33 × 33 buněk: velká oblast 17 buněk (42,5 m) – do 40 m za pasekou (5 m)
    const { grid, at, pocket } = woods(16);
    expect(nearestPassable(grid, at, Infinity)).toBe(pocket);
    // nejbližší buňka velké oblasti: 17 buněk rovně, remíza – nižší index (jih)
    const escape = marchCellCenter(grid, at - 17 * grid.width);
    const to = { x: 300, z: 200 };
    expect(marchReachable(grid, from, to)).toBe(true);
    expect(reachableGoal(grid, from, to)).toBe(to);
    expect(marchPath(grid, from, to)!.points[1]).toEqual(escape);
    // domů přes okraj – z paseky by okraj dosažitelný nebyl
    expect(marchPathToEdge(grid, from, 'E')?.points[1]).toEqual(escape);
    // cíl v lese u severního kraje lesa – posune se na kraj velké oblasti, ne do paseky
    const inWoods = marchCellCenter(grid, at + 14 * grid.width);
    expect(reachableGoal(grid, from, inWoods)).toEqual(marchCellCenter(grid, at + 17 * grid.width));
    // cíl v pasece samé – oblast cíle je paseka
    expect(marchReachable(grid, from, marchCellCenter(grid, pocket))).toBe(true);
    expect(marchPath(grid, from, marchCellCenter(grid, pocket))!.points[1]).toEqual(
      marchCellCenter(grid, pocket),
    );
  });

  it('únik nejvýš 40 m za nejbližší průchodnou buňku a ze stavby jen do ní (oprava Úlohy 5)', () => {
    const from = { x: 3, z: -2 };
    const to = { x: 300, z: 200 };
    // les 41 × 41 buněk: velká oblast 21 buněk (52,5 m) – dál než 40 m za pasekou (5 m)
    const far = woods(20);
    expect(marchReachable(far.grid, from, to)).toBe(false);
    expect(marchPath(far.grid, from, to)).toBeNull();
    expect(marchPathToEdge(far.grid, from, 'E')).toBeNull();
    expect(reachableGoal(far.grid, from, to)).toEqual(marchCellCenter(far.grid, far.pocket));
    // start ve stavbě – jen nejbližší průchodná buňka (paseka), i když velká oblast je v mezi
    const house = woods(16);
    house.grid.flags[house.at] = MARCH_BUILDING;
    expect(marchReachable(house.grid, from, to)).toBe(false);
    expect(marchPathToEdge(house.grid, from, 'E')).toBeNull();
    expect(reachableGoal(house.grid, from, to)).toEqual(marchCellCenter(house.grid, house.pocket));
  });
});

describe('do opevněné vsi (fortifications.md – Obrana, Prolomení)', () => {
  it('skupina ve stěně palisády (postavené pod ní) unikne jen do nejbližší buňky, ne dovnitř (re-revize Úlohy 5)', () => {
    // zavřená palisáda bez brány; skupina stojí v nejvzdálenější buňce stěny na jih od středu
    const grid = marchGrid(flat(), null, fortVillage(fort('palisade')));
    let wall = -1;
    for (let z = 0; z > -200; z -= grid.cellM) {
      const c = marchCellAt(grid, { x: 0, z });
      if ((grid.flags[c]! & MARCH_WALL) !== 0) wall = c;
      else if (wall >= 0) break;
    }
    expect(wall).toBeGreaterThanOrEqual(0);
    expect(grid.pace[wall]).toBe(0);
    const from = marchCellCenter(grid, wall);
    // dovnitř zavřeného opevnění únik nevede – dřív vedl do „užitečné“ oblasti cíle uvnitř
    expect(marchPath(grid, from, IN)).toBeNull();
    expect(marchReachable(grid, from, IN)).toBe(false);
    // cíl se posune na nejbližší místo vně palisády (dosažitelné zvenku)
    expect(marchReachable(grid, OUT, reachableGoal(grid, from, IN)!)).toBe(true);
    // ven ano – nejbližší průchodná buňka je vně
    expect(marchReachable(grid, from, OUT)).toBe(true);
  });

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
    expect(meadowOf(path) - path.lengthM).toBeGreaterThan(rampart * grid.cellM * 2);
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
    expect(flagged(grid, path, MARCH_ROAD)).toBe(crossed(grid, path).length);
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

/** Otisk trasy – počet bodů, metry louky a FNV-1a buněk a bodů (po 1/1024 m). */
function stamp(path: MarchPath | null): string {
  if (!path) return 'null';
  let h = 2166136261;
  for (const c of path.cells) h = Math.imul(h ^ c, 16777619) >>> 0;
  for (const p of path.points) {
    h = Math.imul(h ^ Math.round(p.x * 1024), 16777619) >>> 0;
    h = Math.imul(h ^ Math.round(p.z * 1024), 16777619) >>> 0;
  }
  return `${path.points.length}:${meadowOf(path).toFixed(2)}:${h.toString(16)}`;
}

/** Trasa z `from` k místu nejblíž `to`, kam skupina dojde (`reachableGoal`). */
function toward(grid: MarchGrid, from: Pos, to: Pos): MarchPath | null {
  const goal = reachableGoal(grid, from, to);
  return goal ? marchPath(grid, from, goal) : null;
}

describe('zlatá cesta a determinismus (skutečné krajiny)', () => {
  // brodů na mapě | buněk hustého lesa | trasy ze středu mapy k nejbližšímu dosažitelnému místu
  // u severovýchodního a jihozápadního rohu (bodů : metry louky : otisk buněk a bodů) – jemná
  // mřížka 2,5 m s neprůchozím hustým lesem (plán 2026-11-16-dense-forest, Úloha 4); brodů
  // přibylo zhruba s (10 ÷ 2,5)², trasy les obcházejí; seed 3 má o buňku hustého lesa méně od
  // opravy Úlohy 4 – skála blokuje vždy buňku, ve které stojí (balvan s poloměrem 1,25–1,77 m)
  const GOLDEN: Record<number, string> = {
    1: '1638|319837|2:503.86:a3ed6ded|3:475.93:24e5a7a1',
    2: '519|341471|5:229.68:dba38811|6:980.52:a8e8c103',
    3: '583|352507|15:876.14:11c88dc8|3:989.88:914d587',
  };

  it.each([1, 2, 3])('seed %i – otisk trasy přes mapu', (seed) => {
    const landscape = generateLandscape(seed);
    const grid = marchGrid(landscape, obstaclesOf(landscape), null);
    const ne = toward(grid, { x: 0, z: 0 }, { x: 900, z: 900 })!;
    const sw = toward(grid, { x: 0, z: 0 }, { x: -900, z: -900 })!;
    const fords = grid.flags.filter((f) => (f & MARCH_FORD) !== 0).length;
    const dense = grid.flags.filter((f) => f === MARCH_FOREST).length;
    expect(`${fords}|${dense}|${stamp(ne)}|${stamp(sw)}`).toBe(GOLDEN[seed]);
    expect(ne.lengthM + sw.lengthM).toBeGreaterThan(500);
    for (const path of [ne, sw]) {
      expect(flagged(grid, path, MARCH_WATER)).toBe(0);
      expect(flagged(grid, path, MARCH_FOREST)).toBe(0);
    }
  });

  it('stejný vstup → stejná cesta bez ohledu na pořadí volání', () => {
    const a = generateLandscape(2);
    const b = generateLandscape(3);
    const first = stamp(
      toward(marchGrid(a, obstaclesOf(a), null), { x: 0, z: 0 }, { x: 900, z: 0 }),
    );
    toward(marchGrid(b, obstaclesOf(b), null), { x: 900, z: 0 }, { x: -900, z: 0 });
    const again = generateLandscape(2);
    const grid = marchGrid(again, obstaclesOf(again), null);
    toward(grid, { x: 0, z: -900 }, { x: 0, z: 900 });
    expect(first).not.toBe('null');
    expect(stamp(toward(grid, { x: 0, z: 0 }, { x: 900, z: 0 }))).toBe(first);
  });

  it('k okraji mapy a na opačný okraj', () => {
    const grid = marchGrid(flat(), null, null);
    const east = marchPathToEdge(grid, { x: 0, z: 0 }, 'E')!;
    const end = east.points[east.points.length - 1]!;
    // střed okrajové buňky: 960 − půl buňky
    const edge = 960 - WAR.march.cellM / 2;
    expect(end.x).toBe(edge);
    expect(east.lengthM).toBeCloseTo(edge, -1);
    const ne = marchPathToEdge(grid, { x: 0, z: 0 }, 'NE')!;
    expect(ne.points[ne.points.length - 1]).toEqual({ x: edge, z: edge });
  });
});

describe('stavby vsi pochod blokují (war.md – Pohyb – Terén)', () => {
  const W = { x: -60, z: 0 };
  const E = { x: 60, z: 0 };

  it('dvorec vojsko obejde, dílna s dvorem také', () => {
    const house = { ...dwelling(1, 'dvorec'), position: { x: 0, z: 0, rotation: 0 } };
    const grid = marchGrid(flat(), null, village([], [house]));
    expect(grid.flags[marchCellAt(grid, { x: 0, z: 0 })]! & MARCH_BUILDING).toBeTruthy();
    const path = marchPath(grid, W, E)!;
    for (const c of crossed(grid, path)) expect(grid.flags[c]! & MARCH_BUILDING).toBe(0);
    // bez vsi přímo, se stavbou oklikou
    const straight = marchPath(marchGrid(flat(), null, null), W, E)!.lengthM;
    expect(path.lengthM).toBeGreaterThan(straight + 3);
    const smith = { ...house, workshop: { craft: 'smith' as const } };
    const withYard = marchGrid(flat(), null, village([], [smith as typeof house]));
    expect(marchPath(withYard, W, E)).not.toBeNull();
  });

  it('cíl i start uvnitř domu se přesunou k nejbližší volné buňce', () => {
    const house = { ...dwelling(1, 'dvorec'), position: { x: 0, z: 0, rotation: 0 } };
    const grid = marchGrid(flat(), null, village([], [house]));
    const into = marchPath(grid, W, { x: 0, z: 0 });
    expect(into).not.toBeNull();
    expect(into!.points[into!.points.length - 1]).toEqual({ x: 0, z: 0 });
    expect(marchPath(grid, { x: 0, z: 0 }, E)).not.toBeNull();
  });

  it('z branky dvorce k místu 42 m za dvorem rovně, ze středu domu únikem a obloukem (D49)', () => {
    // dvorec s dvorem jako Vlkov: dům uprostřed políčka vchodem ke dvoru, branka za dvorem (+x)
    const land = flat();
    const manor = {
      ...dwelling(1, 'dvorec'),
      position: { x: 7.5, z: 7.5, rotation: Math.PI / 2 },
      plot: { cell: { x: 64, y: 64 }, variant: 'center' as const, yard: { x: 65, y: 64 } },
    };
    const grid = marchGrid(land, null, village([], [manor]));
    const center = { x: 7.5, z: 7.5 };
    const gate = dwellingGatePoint(land, manor);
    expect(gate.x).toBeCloseTo(center.x + 23.5, 6);
    const goal = { x: center.x + 42, z: center.z + 2.4 };
    const air = (a: Pos, b: Pos): number => Math.hypot(b.x - a.x, b.z - a.z);
    // příčina: ze středu domu vede trasa únikem do nejbližší volné buňky a kolem pozemku (na
    // mřížce 2,5 m s odstupem 1 m už jen ≈ 1,2× vzdušné čáry – dřív 10 m buňky přes 1,25×)
    const inside = marchPath(grid, center, goal)!;
    expect(inside.points[0]).toEqual(center);
    expect(inside.points[1]).toEqual(
      marchCellCenter(grid, nearestPassable(grid, marchCellAt(grid, center), Infinity)),
    );
    for (let k = 2; k < inside.points.length; k++) {
      expect(lineOfSight(grid, inside.points[k - 1]!, inside.points[k]!)).toBe(true);
    }
    expect(inside.lengthM).toBeGreaterThan(1.15 * air(center, goal));
    // z branky rovně – jediný úsek; i celá cesta od domu dvorem a brankou je ≈ vzdušná čára
    const out = marchPath(grid, gate, goal)!;
    expect(out.points).toEqual([gate, goal]);
    expect(out.lengthM).toBeCloseTo(air(gate, goal), 9);
    expect(air(center, gate) + out.lengthM).toBeLessThanOrEqual(1.01 * air(center, goal));
  });

  it('ohrada je neprůchodná, pole průchozí tempem louky', () => {
    const pen = village([], [], { pens: [horsePen(90, [], 3)] });
    const grid = marchGrid(flat(), null, pen);
    const blocked = [...grid.flags].filter((f) => (f & MARCH_BUILDING) !== 0).length;
    expect(blocked).toBeGreaterThan(0);
    const around = marchPath(grid, { x: -20, z: 0 }, { x: 80, z: 0 })!;
    for (const c of crossed(grid, around)) expect(grid.flags[c]! & MARCH_BUILDING).toBe(0);
  });

  it('opevnění: branou projde, jinak obejde (stavby ho nerozbijí)', () => {
    const grid = marchGrid(flat(), null, fortVillage(fort('palisade', undefined, true)));
    expect(marchPath(grid, OUT, IN)).not.toBeNull();
  });
});

describe('mřížky pochodu napříč voláními (worker – Výkon – Tažení)', () => {
  const same = (a: MarchGrid, b: MarchGrid): void => {
    const { pace: ap, flags: af, ...ra } = a;
    const { pace: bp, flags: bf, ...rb } = b;
    expect(ra).toEqual(rb);
    // jemná mřížka má 590 tisíc buněk – porovnání po prvcích bez rozbalení do polí
    expect(ap.length).toBe(bp.length);
    expect(ap.every((p, c) => p === bp[c] && af[c] === bf[c])).toBe(true);
  };

  it('mřížka z paměti = nově postavená; tentýž vstup = tatáž mřížka', () => {
    const land = flat();
    const fortified = fortVillage(fort('palisade', undefined, true));
    const memo = new MarchGridMemo();
    const first = memo.gridOf(land, null, fortified, SUMMER);
    same(first, marchGrid(land, null, fortified, { day: SUMMER }));
    expect(memo.gridOf(land, null, fortified, SUMMER)).toBe(first);
    const empty = memo.gridOf(land, null, null, SUMMER);
    same(empty, marchGrid(land, null, null, { day: SUMMER }));
    expect(empty === first).toBe(false);
  });

  it('jiný stav vsi, jiný den nebo jiná krajina = nová mřížka', () => {
    const land = flat();
    const fortified = fortVillage(fort('palisade', undefined, true));
    const memo = new MarchGridMemo();
    const first = memo.gridOf(land, null, fortified, SUMMER);
    // nová verze vsi (jiný objekt stavu) – brána zavřená zbořením: mřížka se staví znovu
    const without = { ...fortified, fortifications: [] };
    const rebuilt = memo.gridOf(land, null, without, SUMMER);
    expect(rebuilt === first).toBe(false);
    same(rebuilt, marchGrid(land, null, without, { day: SUMMER }));
    expect(memo.gridOf(flat(), null, fortified, SUMMER) === first).toBe(false);
    const next = memo.gridOf(land, null, fortified, SUMMER + 1);
    expect(next === first).toBe(false);
    expect(memo.gridOf(land, null, fortified, SUMMER)).toBe(first);
  });

  it('starší den, než jsou držené, v paměti zůstane (dvě tažení o den posunutá)', () => {
    const land = flat();
    const memo = new MarchGridMemo();
    const later = memo.gridOf(land, null, null, SUMMER + 1);
    const older = memo.gridOf(land, null, null, SUMMER);
    expect(memo.gridOf(land, null, null, SUMMER)).toBe(older);
    expect(memo.gridOf(land, null, null, SUMMER + 1)).toBe(later);
  });

  it('drží dva dny; třetí vytlačí nejdéle nepoužitý, ne nejmenší', () => {
    const land = flat();
    const memo = new MarchGridMemo();
    const grids = [0, 1].map((d) => memo.gridOf(land, null, null, SUMMER + d));
    // den 0 se použil naposledy – nejdéle nepoužitý je teď den 1
    expect(memo.gridOf(land, null, null, SUMMER)).toBe(grids[0]);
    memo.gridOf(land, null, null, SUMMER + 2);
    expect(memo.gridOf(land, null, null, SUMMER)).toBe(grids[0]);
    // vytlačený den se postaví znovu – stejná mřížka, jiný objekt
    const again = memo.gridOf(land, null, null, SUMMER + 1);
    expect(again === grids[1]).toBe(false);
    same(again, grids[1]!);
  });
});
