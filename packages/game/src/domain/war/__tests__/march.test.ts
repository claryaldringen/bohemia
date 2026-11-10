import { describe, expect, it } from 'vitest';
import { dayIndexOf, OFFICIAL_WORLD, TOTAL_GAME_DAYS } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  riverCenterlines,
  SURFACE_CODES,
  TREE_KINDS,
  obstacleKind,
  type Landscape,
  type StreamPoint,
} from '../../landscape';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import type { FortKind, FortTop, Road, TileCell, VillageState } from '../../village/types';
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
  marchGrid,
  MarchGridMemo,
  type MarchGrid,
} from '../march-grid';
import {
  marchPath,
  marchPathToEdge,
  marchProgress,
  marchSeconds,
  marchSpeed,
  reachableGoal,
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

  it('průchodný cíl a cíl, kde vojsko stojí, se nemění', () => {
    const grid = marchGrid({ ...flat(), rivers: [main(null)] }, null, null);
    const from = { x: 0, z: 0 };
    const meadow = { x: -300, z: 300 };
    expect(reachableGoal(grid, from, meadow)).toBe(meadow);
    // průchodný, ale za řekou bez brodu – beze změny (posouvá se jen cíl v neprůchodné buňce)
    const across = { x: 500, z: 0 };
    expect(reachableGoal(grid, from, across)).toBe(across);
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
    const grid = marchGrid(landscape, null, null);
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

  it('vojsko sevřené v neprůchodných buňkách – dosažitelné místo není žádné', () => {
    const grid = tiny((i, j) => !(i === 4 && j === 4));
    expect(reachableGoal(grid, { x: 0, z: 0 }, { x: 20, z: 20 })).toBeNull();
    // z volné buňky cíl dojde k ní samé
    expect(reachableGoal(grid, { x: 40, z: 40 }, { x: 20, z: 20 })).toEqual({ x: 40, z: 40 });
  });
});

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

describe('stavby vsi pochod blokují (war.md – Pohyb – Terén)', () => {
  const W = { x: -60, z: 0 };
  const E = { x: 60, z: 0 };

  it('dvorec vojsko obejde, dílna s dvorem také', () => {
    const house = { ...dwelling(1, 'dvorec'), position: { x: 0, z: 0, rotation: 0 } };
    const grid = marchGrid(flat(), null, village([], [house]));
    expect(grid.flags[marchCellAt(grid, { x: 0, z: 0 })]! & MARCH_BUILDING).toBeTruthy();
    const path = marchPath(grid, W, E)!;
    for (const c of path.cells) expect(grid.flags[c]! & MARCH_BUILDING).toBe(0);
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

  it('ohrada je neprůchodná, pole průchozí tempem louky', () => {
    const pen = village([], [], { pens: [horsePen(90, [], 3)] });
    const grid = marchGrid(flat(), null, pen);
    const blocked = [...grid.flags].filter((f) => (f & MARCH_BUILDING) !== 0).length;
    expect(blocked).toBeGreaterThan(0);
    const around = marchPath(grid, { x: -20, z: 0 }, { x: 80, z: 0 })!;
    for (const c of around.cells) expect(grid.flags[c]! & MARCH_BUILDING).toBe(0);
  });

  it('opevnění: branou projde, jinak obejde (stavby ho nerozbijí)', () => {
    const grid = marchGrid(flat(), null, fortVillage(fort('palisade', undefined, true)));
    expect(marchPath(grid, OUT, IN)).not.toBeNull();
  });
});

describe('mřížky pochodu napříč voláními (worker – Výkon – Tažení)', () => {
  const same = (a: MarchGrid, b: MarchGrid): void => {
    expect({ ...a, pace: [...a.pace], flags: [...a.flags] }).toEqual({
      ...b,
      pace: [...b.pace],
      flags: [...b.flags],
    });
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
    expect(empty).not.toBe(first);
  });

  it('jiný stav vsi, jiný den nebo jiná krajina = nová mřížka; drží jen dva dny', () => {
    const land = flat();
    const fortified = fortVillage(fort('palisade', undefined, true));
    const memo = new MarchGridMemo();
    const first = memo.gridOf(land, null, fortified, SUMMER);
    // nová verze vsi (jiný objekt stavu) – brána zavřená zbořením: mřížka se staví znovu
    const without = { ...fortified, fortifications: [] };
    const rebuilt = memo.gridOf(land, null, without, SUMMER);
    expect(rebuilt).not.toBe(first);
    same(rebuilt, marchGrid(land, null, without, { day: SUMMER }));
    expect(memo.gridOf(flat(), null, fortified, SUMMER)).not.toBe(first);
    const next = memo.gridOf(land, null, fortified, SUMMER + 1);
    expect(next).not.toBe(first);
    expect(memo.gridOf(land, null, fortified, SUMMER)).toBe(first);
    // třetí den vytlačí nejstarší (drží se dva nejnovější)
    memo.gridOf(land, null, fortified, SUMMER + 2);
    expect(memo.gridOf(land, null, fortified, SUMMER + 1)).toBe(next);
    const again = memo.gridOf(land, null, fortified, SUMMER);
    expect(again).not.toBe(first);
    same(again, first);
  });
});
