import {
  BANK_REACH_M,
  TREE_KINDS,
  buildForestField,
  heightAtWorld,
  length2,
  riversOf,
  watersCenterline,
  type Landscape,
  type ObstacleLayer,
} from '../landscape';
import {
  NO_OBSTACLE_CHANGES,
  obstacleChangesAt,
  obstacleStatus,
  type ObstacleChanges,
} from '../village/obstacles';
import {
  fortPincerArms,
  fortWalls,
  gatePartPieces,
  layerBuilt,
  moatDitchPieces,
  moatFrozen,
  rampartPace,
  segmentIsGap,
  segmentRampart,
  segmentState,
  segmentWall,
} from '../village/fortification';
import type { Fortification, FortSegment } from '../village/fortification/types';
import {
  buildingBounds,
  cellsIn,
  entranceCells,
  fencedCells,
  fortWallCells,
  inBuilding,
} from '../village/paths/network-grid';
import { penGateToward, penSquaresEntrance } from '../village/paths/entrances';
import { penPathSquares } from '../village/paths/network-keys';
import { villageBuildings } from '../village/paths/network-search';
import { pathVillageOf } from '../village/paths/village';
import { PEN_FENCE_INSET_M } from '../village/rules';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import { PATH_SLOPE_MAX } from '../village/paths/terrain';
import type { VillageState } from '../village/types';
import { WAR } from './rules-war';

// Mřížka pochodu vojska (war.md – Pohyb – mapu po mapě; fortifications.md – Prolomení): buňky
// 10 m přes celou mapu s násobkem tempa – louka 1, hustý les ¼, pevná cesta a zemská stezka vsi
// × 1,5, val čtvrtinovým tempem, voda jen po brodech, sráz a hotové úseky plotu a palisády
// neprůchodné kromě bran a mezer (`fortGaps`). Tažení počítá server i prohlížeč – jen det-math.

/** Buňka je hustý les (les krajiny se stromy kolem – `WAR.march.denseForestTrees`). */
export const MARCH_FOREST = 1;
/** Buňka je brod – voda, kterou vojsko přejde. */
export const MARCH_FORD = 2;
/** Pod buňkou vede pevná cesta nebo zemská stezka vsi. */
export const MARCH_ROAD = 4;
/** Buňka je pás valu – přechod čtvrtinovým tempem. */
export const MARCH_RAMPART = 8;
/** Buňka je průchod opevněním – otevřená brána nebo mezera (nedostavěný, shnilý, prolomený úsek). */
export const MARCH_GATE = 16;
/** Buňka je hluboká voda (neprůchodná). */
export const MARCH_WATER = 32;
/** Buňka je sráz (neprůchodná). */
export const MARCH_STEEP = 64;
/** Buňka je stěna opevnění – plot, palisáda, val s nástavbou (neprůchodná). */
export const MARCH_WALL = 128;

/** Buňka je stavba vsi – obydlí s pozemkem, dvorec, dílna, milíř, humno, hotová ohrada (neprůchodná). */
export const MARCH_BUILDING = 256;

/** Mřížka pochodu jedné mapy: buňka (i, j) má index `j * width + i`. */
export interface MarchGrid {
  readonly width: number;
  readonly height: number;
  /** Střed buňky (0, 0) ve světě mapy (m) a strana buňky (m). */
  readonly originX: number;
  readonly originZ: number;
  readonly cellM: number;
  /** Násobek tempa buňky proti louce (1); 0 = neprůchodná. */
  readonly pace: Float32Array;
  /** Příznaky `MARCH_*`. */
  readonly flags: Uint16Array;
}

/** Bod ve světě mapy (m). */
export interface Pos {
  x: number;
  z: number;
}

/** Volby mřížky: den stavu opevnění (výchozí `village.lastDay`) a zavřené brány (indexy úseků). */
export interface MarchGridOptions {
  day?: number;
  closedGates?: ReadonlySet<number>;
}

/** Terén mapy bez vsi – voda, brody, srázy a les krajiny; počítá se jednou na krajinu. */
interface MarchTerrain {
  width: number;
  originX: number;
  cellM: number;
  /** BASE_* po buňkách. */
  base: Uint8Array;
}

const BASE_WATER = 1;
const BASE_FORD = 2;
const BASE_STEEP = 4;
const BASE_WOODLAND = 8;

const terrainCache = new WeakMap<Landscape, MarchTerrain>();

/**
 * Terén pochodu: buňka do půl úhlopříčky (≈ 7 m) od vody je voda – krok mezi sousedními středy
 * (i úhlopříčný) tak vodu nepřeskočí; brod je mělčina potoka nebo řeky (`StreamPoint.shallow`
 * nejbližšího místa osy – široký mělký úsek, u řeky 1–2 brody). Sráz jako u pěšin
 * (`PATH_SLOPE_MAX`), les z pole lesa.
 */
function marchTerrain(l: Landscape): MarchTerrain {
  const cached = terrainCache.get(l);
  if (cached) return cached;
  const cellM = WAR.march.cellM;
  const extent = l.size * l.cellSizeM;
  const width = Math.round(extent / cellM);
  const originX = -extent / 2 + cellM / 2;
  const base = new Uint8Array(width * width);
  // potok a všechny řeky – řeky kostry i řeka prémie (`watersCenterline` – bez řeky přesně osa
  // potoka); mapa bez potoka s řekou má vodu jen z řek
  const stream = l.stream.length >= 2 || riversOf(l).length > 0 ? watersCenterline(l) : null;
  const field = buildForestField(l, { remember: false });
  const reach = (cellM * Math.SQRT2) / 2;
  const d = cellM / 2;
  for (let j = 0; j < width; j++) {
    for (let i = 0; i < width; i++) {
      const c = j * width + i;
      const x = originX + i * cellM;
      const z = originX + j * cellM;
      if (stream) {
        const sample = stream.nearest(x, z, BANK_REACH_M);
        if (sample.bankDistance < reach) {
          base[c] = sample.shallow >= WAR.march.fordShallow ? BASE_FORD : BASE_WATER;
          continue;
        }
      }
      const gx = (heightAtWorld(l, x + d, z) - heightAtWorld(l, x - d, z)) / cellM;
      const gz = (heightAtWorld(l, x, z + d) - heightAtWorld(l, x, z - d)) / cellM;
      if (length2(gx, gz) > PATH_SLOPE_MAX) {
        base[c] = BASE_STEEP;
        continue;
      }
      if (field.distanceAt(x, z) > 0) base[c] = BASE_WOODLAND;
    }
  }
  const terrain = { width, originX, cellM, base };
  terrainCache.set(l, terrain);
  return terrain;
}

/** Stromy po buňkách (stojící podle změn vsi – vykácená paseka stromy nemá). */
function treeCounts(t: MarchTerrain, layer: ObstacleLayer, changes: ObstacleChanges): Uint16Array {
  const counts = new Uint16Array(t.width * t.width);
  const status = obstacleStatus(changes);
  const half = t.originX - t.cellM / 2;
  for (let k = 0; k < layer.count; k++) {
    const kind = status.kindOf(layer, k);
    if (kind === null || !TREE_KINDS.includes(kind)) continue;
    const i = Math.floor((layer.x[k]! - half) / t.cellM);
    const j = Math.floor((layer.z[k]! - half) / t.cellM);
    if (i < 0 || j < 0 || i >= t.width || j >= t.width) continue;
    const c = j * t.width + i;
    counts[c] = counts[c]! + 1;
  }
  return counts;
}

/** Stromů v okolí 3 × 3 buněk. */
function treesAround(t: MarchTerrain, counts: Uint16Array, i: number, j: number): number {
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= t.width || jj >= t.width) continue;
      sum += counts[jj * t.width + ii]!;
    }
  }
  return sum;
}

/** Buňka mřížky, do které padne bod (mimo mapu nejbližší okrajová). */
export function marchCellAt(grid: MarchGrid, p: Pos): number {
  const i = Math.min(grid.width - 1, Math.max(0, Math.round((p.x - grid.originX) / grid.cellM)));
  const j = Math.min(grid.height - 1, Math.max(0, Math.round((p.z - grid.originZ) / grid.cellM)));
  return j * grid.width + i;
}

/**
 * Zasypaný kus vodního příkopu v boji (fortifications.md – Přechod hradby – S valem): pruh široký
 * jako průlom (4 m) od `from` (kde zasypávající stál – za vodou) přes hradbu dál dovnitř po `to`.
 */
export interface MoatFill {
  from: Pos;
  to: Pos;
}

/** Čtverec vzdálenosti bodu `p` od úsečky a → b. */
function segmentDist2(p: Pos, a: Pos, b: Pos): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 <= 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  const qx = a.x + dx * t - p.x;
  const qz = a.z + dz * t - p.z;
  return qx * qx + qz * qz;
}

/**
 * Tempo v bodě `p` se zasypanými kusy vodního příkopu: voda v pruhu zasypání se přejde jako suchý
 * příkop s plným valem (`rampartPace(1)` – čtvrtinově); jinak tempo buňky. Mřížka se nemění –
 * zasypání je stav boje, ne vsi.
 */
export function moatFillPace(grid: MarchGrid, p: Pos, fills: readonly MoatFill[]): number {
  const c = marchCellAt(grid, p);
  const pace = grid.pace[c]!;
  if (pace > 0 || (grid.flags[c]! & MARCH_WATER) === 0) return pace;
  const r = FORTIFICATIONS.breach.widthM / 2;
  for (const f of fills) if (segmentDist2(p, f.from, f.to) <= r * r) return rampartPace(1);
  return pace;
}

/** Střed buňky ve světě. */
export function marchCellCenter(grid: MarchGrid, c: number): Pos {
  const i = c % grid.width;
  return {
    x: grid.originX + i * grid.cellM,
    z: grid.originZ + ((c - i) / grid.width) * grid.cellM,
  };
}

/** Buňky pod osami pevných cest vsi (i úseky zemské stezky – jsou mezi pevnými cestami). */
function roadCells(grid: MarchGrid, village: VillageState): Set<number> {
  const cells = new Set<number>();
  const step = grid.cellM / 4;
  for (const road of village.roads?.roads ?? []) {
    for (let k = 0; k + 1 < road.points.length; k++) {
      const a = road.points[k]!;
      const b = road.points[k + 1]!;
      const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / step));
      for (let s = 0; s <= n; s++) {
        cells.add(
          marchCellAt(grid, { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n }),
        );
      }
    }
  }
  return cells;
}

/**
 * Úsek opevnění bez průlomu a zboření – val se neprolamuje, prolomená nástavba ho nechá valem;
 * pás mezery (i zbořeného dílu) se kreslí jako stojící úsek.
 */
function withoutBreach(seg: FortSegment): FortSegment {
  const copy = { ...seg };
  delete copy.breachedDay;
  delete copy.demolishedDay;
  return copy;
}

/**
 * Buňky opevnění pro pochod (fortifications.md – Obrana, Prolomení): stěny hotových úseků plotu
 * a palisády a valu se stojící nástavbou jsou neprůchodné; val bez nástavby (i s prolomenou či
 * shnilou) je pás čtvrtinového tempa. Průchozí jsou otevřené brány a mezery – nedostavěný, shnilý,
 * prolomený nebo zbořený úsek (i srovnaný val; `segmentIsGap`, jako `fortGaps`) celým pásem; buňka, které se dotkne
 * průchod, stěnou není (jako brána u pěšin – `fortWallCells`), takže mezera úzká jako úsek vede
 * i mřížkou 10 m. Val doplněný vně hradby zabírá pás přes křivku ven (`fortWalls`); napuštěný
 * a nezamrzlý příkop (`moatDitchPieces`) je voda – neprůchodný mimo bránu.
 */
function fortCells(
  grid: MarchGrid,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  fort: Fortification,
  day: number,
  closed: ReadonlySet<number>,
): {
  wall: number[];
  rampart: { cell: number; height: number }[];
  crest: number[];
  open: Set<number>;
  water: number[];
} {
  const wall: FortSegment[] = [];
  // hradba na koruně valu – stěna, přes kterou útočník v boji napřed leze po valu (Martin 9. 11.)
  const crest: FortSegment[] = [];
  // holý val po výškách dílů (tempo podle výšky – `rampartPace`)
  const rampart = new Map<number, FortSegment[]>();
  const gaps: FortSegment[] = [];
  // díl s branou s kusy s vlastní hradbou po kusech – každý kus se čte podle své hradby
  for (const seg of fort.segments.flatMap((s) => gatePartPieces(s))) {
    const layer = segmentRampart(fort, seg);
    if (layer && layerBuilt(layer) && seg.demolishedDay === undefined) {
      const topStands =
        layerBuilt(segmentWall(fort, seg)) &&
        seg.breachedDay === undefined &&
        segmentState(fort, seg, day) > 0;
      if (topStands) {
        wall.push(withoutBreach(seg));
        crest.push(withoutBreach(seg));
      } else {
        const list = rampart.get(layer.height) ?? [];
        list.push(withoutBreach(seg));
        rampart.set(layer.height, list);
      }
    } else if (segmentIsGap(fort, seg, day)) {
      // pás mezery jako stojící úsek – jen kvůli tvaru průchodu
      gaps.push({ ...withoutBreach(seg), builtDay: seg.builtDay ?? day, state: 1 });
    } else {
      wall.push(seg);
    }
  }
  const gates = fort.gates.filter((g) => !closed.has(g.segment));
  const open = new Set<number>();
  const cellsOf = (segments: FortSegment[], withGates: boolean): number[] => {
    if (segments.length === 0) return [];
    const walls = fortWalls(geo, { ...fort, segments, gates: withGates ? gates : [] });
    const cells = fortWallCells(grid, walls);
    for (const c of cells.gate) open.add(c);
    return cells.wall;
  };
  for (const c of cellsOf(gaps, false)) open.add(c);
  const wallCells = cellsOf(wall, true);
  const crestCells = cellsOf(crest, true);
  const rampartCells = [...rampart].map(([height, segs]) => ({
    height,
    cells: cellsOf(segs, true),
  }));
  // napuštěný a nezamrzlý vodní příkop – neprojde nikdo, dokud ho nezasype (Hradby a obrana –
  // Druhy, Přechod hradby); brána má hráz či most, její buňky zůstanou průchozí
  const ditch = moatFrozen(day) ? [] : moatDitchPieces(geo, fort);
  const water =
    ditch.length === 0
      ? []
      : fortWallCells(grid, { walls: ditch, gates: [] }).wall.filter((c) => !open.has(c));
  // ramena klešťových bran blokují vždy – i u zavřené brány a prolomeného dílu (`fortPincerArms`;
  // plán hradeb Ú19): ulička je průchozí jen k vratům, otevřená brána ji má v `open`
  const arms = fortPincerArms(geo, fort);
  const armCells = arms.length === 0 ? [] : fortWallCells(grid, { walls: arms, gates: [] }).wall;
  const walls = armCells.length === 0 ? wallCells : [...new Set([...wallCells, ...armCells])];
  return {
    wall: walls.filter((c) => !open.has(c)),
    rampart: rampartCells.flatMap(({ height, cells }) =>
      cells.filter((c) => !open.has(c)).map((cell) => ({ cell, height })),
    ),
    crest: crestCells.filter((c) => !open.has(c)),
    open,
    water,
  };
}

/**
 * Stavby vsi vojsko neprojde (war.md – Pohyb – Terén): obydlí s pozemkem, dvorec a dílna s dvorem,
 * staveniště, milíř, modla a humno (stejné obdélníky jako pěšiny – `villageBuildings`) a hotová
 * ohrada celou plochou plotu kromě branky. Pole jsou průchozí beze změny tempa (spec jejich
 * zpomalení neuvádí). Vyšší přednost než cesta pod stavbou.
 */
function blockBuildings(
  grid: MarchGrid,
  landscape: Landscape,
  village: VillageState,
  day: number,
): void {
  const block = (c: number): void => {
    grid.pace[c] = 0;
    grid.flags[c] = (grid.flags[c]! & ~MARCH_ROAD) | MARCH_BUILDING;
  };
  const pathVillage = pathVillageOf(village, day, landscape);
  // blokuje se každá buňka, které se obdélník stavby dotkne (střed do půl buňky od obdélníku) –
  // dům užší než buňka 10 m by jinak proklouzl mezi středy buněk
  const reach = grid.cellM / 2;
  for (const b of villageBuildings(pathVillage).all) {
    const [x0, z0, x1, z1] = buildingBounds(b, reach);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (inBuilding(b, x, z, reach)) block(c);
    });
  }
  for (const pen of pathVillage.pens ?? []) {
    if (!pen.built) continue;
    const squares = penPathSquares(pen);
    const gate = entranceCells(
      grid,
      penSquaresEntrance(squares, penGateToward(squares, pathVillage.dwellings)),
    );
    for (const c of fencedCells(grid, squares, PEN_FENCE_INSET_M)) {
      if (!gate.has(c)) block(c);
    }
  }
}

/**
 * Mřížka pochodu mapy (war.md – Pohyb – Terén): krajina, její vrstva překážek (bez ní les jen
 * z pole lesa) a ves na mapě (null = prázdné políčko). Ves přidá pevné cesty a zemskou stezku
 * (× 1,5 – i lesem a přes brod či lávku, kudy vede), opevnění a paseky (pokácené stromy).
 * Stejný vstup → stejná mřížka; terén krajiny se počítá jednou.
 */
export function marchGrid(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: VillageState | null,
  options: MarchGridOptions = {},
): MarchGrid {
  const t = marchTerrain(landscape);
  const all = t.width * t.width;
  const grid: MarchGrid = {
    width: t.width,
    height: t.width,
    originX: t.originX,
    originZ: t.originX,
    cellM: t.cellM,
    pace: new Float32Array(all),
    flags: new Uint16Array(all),
  };
  const day = options.day ?? village?.lastDay ?? 0;
  const counts = obstacles
    ? treeCounts(t, obstacles, village ? obstacleChangesAt(village, day) : NO_OBSTACLE_CHANGES)
    : null;
  for (let c = 0; c < all; c++) {
    const base = t.base[c]!;
    if (base === BASE_WATER) {
      grid.flags[c] = MARCH_WATER;
      continue;
    }
    if (base === BASE_STEEP) {
      grid.flags[c] = MARCH_STEEP;
      continue;
    }
    if (base === BASE_FORD) grid.flags[c] = MARCH_FORD;
    let pace = 1;
    if (base === BASE_WOODLAND) {
      const i = c % t.width;
      const dense =
        counts === null ||
        treesAround(t, counts, i, (c - i) / t.width) >= WAR.march.denseForestTrees;
      if (dense) {
        grid.flags[c] = MARCH_FOREST;
        pace = WAR.pace.forest;
      }
    }
    grid.pace[c] = pace;
  }
  if (!village) return grid;
  for (const c of roadCells(grid, village)) {
    grid.pace[c] = WAR.pace.road;
    grid.flags[c] = (grid.flags[c]! & ~(MARCH_WATER | MARCH_STEEP)) | MARCH_ROAD;
  }
  blockBuildings(grid, landscape, village, day);
  const closed = options.closedGates ?? new Set<number>();
  for (const fort of village.fortifications ?? []) {
    const cells = fortCells(grid, landscape, fort, day, closed);
    // tempo přes příkop a val podle výšky dílu: 1 ÷ (1 + 3 × v) – plný val čtvrtinové jako dřív
    for (const { cell: c, height } of cells.rampart) {
      grid.pace[c] = rampartPace(height);
      grid.flags[c] = grid.flags[c]! | MARCH_RAMPART;
    }
    for (const c of cells.wall) {
      grid.pace[c] = 0;
      grid.flags[c] = grid.flags[c]! | MARCH_WALL;
    }
    // stěna s valem pod hradbou – pochod ji neprojde (tempo 0), útočník v boji po ní leze tempem
    // plného valu (`battle.ts` – `paceAt`) a po sestupu je unavený (`rampartFatigueStep`)
    for (const c of cells.crest) grid.flags[c] = grid.flags[c]! | MARCH_RAMPART;
    for (const c of cells.open) grid.flags[c] = grid.flags[c]! | MARCH_GATE;
    for (const c of cells.water) {
      grid.pace[c] = 0;
      grid.flags[c] = grid.flags[c]! | MARCH_WATER;
    }
  }
  return grid;
}

/** Kolik nejnovějších dní mřížek drží paměť na krajinu, překážky a ves (tažení čte den a další). */
const MEMO_DAYS = 2;
/** Zástupný klíč za chybějící vrstvu překážek nebo ves (WeakMap nebere null). */
const NONE: object = {};

/**
 * Mřížky pochodu napříč voláními `stepCampaign` (worker – docs/code/worker.md, Výkon – Tažení).
 * Klíč je identita krajiny, vrstvy překážek a stavu vsi a den: `marchGrid` je čistá a stav vsi
 * neměnný, takže tentýž objekt a den = tatáž mřížka. Objekty drží slabě (zahozená ves uvolní své
 * mřížky), na jednu trojici nejvýš `MEMO_DAYS` nejnovějších dnů.
 */
export class MarchGridMemo {
  private readonly grids = new WeakMap<
    Landscape,
    WeakMap<object, WeakMap<object, Map<number, MarchGrid>>>
  >();

  /** Mřížka jako `marchGrid(landscape, obstacles, village, { day })` – z paměti, je-li tam. */
  gridOf(
    landscape: Landscape,
    obstacles: ObstacleLayer | null,
    village: VillageState | null,
    day: number,
  ): MarchGrid {
    let byObstacles = this.grids.get(landscape);
    if (!byObstacles) {
      byObstacles = new WeakMap();
      this.grids.set(landscape, byObstacles);
    }
    let byVillage = byObstacles.get(obstacles ?? NONE);
    if (!byVillage) {
      byVillage = new WeakMap();
      byObstacles.set(obstacles ?? NONE, byVillage);
    }
    let byDay = byVillage.get(village ?? NONE);
    if (!byDay) {
      byDay = new Map();
      byVillage.set(village ?? NONE, byDay);
    }
    const known = byDay.get(day);
    if (known) return known;
    const grid = marchGrid(landscape, obstacles, village, { day });
    byDay.set(day, grid);
    if (byDay.size > MEMO_DAYS) byDay.delete(Math.min(...byDay.keys()));
    return grid;
  }
}
