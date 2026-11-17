import type { Landscape, ObstacleLayer } from '../landscape';
import { villageClearings } from '../village/core/cleared-forest';
import { NO_OBSTACLE_CHANGES, obstacleChangesAt, obstacleStatus } from '../village/core/obstacles';
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
import { FORTIFICATIONS } from '../village/rules/rules-fortifications';
import { ROAD_SWATH } from '../village/rules/rules-roads';
import { trailExitsOf } from '../village/trade/trail-exits';
import type { RoadPoint, VillageState } from '../village/types';
import { forestInterior, withoutClearings } from './dense-forest';
import {
  BASE_AXIS,
  BASE_FORD,
  BASE_STEEP,
  BASE_WATER,
  marchRocks,
  marchTerrain,
  supercover,
  swathCells,
} from './march-terrain';
import { WAR } from './rules-war';

// Mřížka pochodu vojska (war.md – Pohyb – mapu po mapě, Terén; fortifications.md – Prolomení; plán
// 2026-11-16-dense-forest – Rozhodnutí 1–4): buňky `WAR.march.cellM` (2,5 m) přes celou mapu.
// Hledání zná jen průchozí a neprůchozí (`pace` > 0) – neprůchozí je hustý les, voda mimo brody,
// sráz, skály, stavby s odstupem a hotové úseky plotu a palisády kromě bran a mezer (`fortGaps`).
// Tempo buňky platí jen pro chůzi: louka 1, průsek pevné cesty a zemské stezky × 1,5 (i hustým
// lesem), val podle výšky. Tažení počítá server i prohlížeč – jen det-math.

/** Buňka je hustý les (vnitřek lesa bez pasek vsi – forest.md – Hustý les); bez `MARCH_ROAD` neprůchodná. */
export const MARCH_FOREST = 1;
/** Buňka je brod – voda, kterou vojsko přejde. */
export const MARCH_FORD = 2;
/** Buňka je průsek pevné cesty nebo stezky (× 1,5, průchodná i hustým lesem). */
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
/** Buňka je skála – balvan nebo skalní výchoz vrstvy překážek (neprůchodná; Rozhodnutí 4). */
export const MARCH_ROCK = 512;

/**
 * Verze mřížky pochodu (plán 2026-11-16-dense-forest – Rozhodnutí 9): 2 = jemná mřížka s hustým
 * lesem. Tažení a výprava bez ní (`marchGridVersion` ve stavu) při prvním taktu zahodí rozjeté úseky
 * (`replanLegs`) – vedly by buňkami, které jsou dnes neprůchozí. Nová změna průchodnosti, se kterou
 * by uložené úseky neplatily, verzi zvýší.
 */
export const MARCH_GRID_VERSION = 2;

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

/** Rozměry mřížky pochodu (bez buněk) – k nim se vážou vrstvy po buňkách (hustý les…). */
export type MarchGeometry = Pick<MarchGrid, 'width' | 'height' | 'originX' | 'originZ' | 'cellM'>;

/** Bod ve světě mapy (m). */
export interface Pos {
  x: number;
  z: number;
}

/**
 * Volby mřížky: den stavu opevnění (výchozí `village.lastDay`), zavřené brány (indexy úseků)
 * a osy pokračování zemských stezek sousedních vsí na této mapě (`trailContinuations` – průsek
 * jako pevná cesta; plán 2026-11-16-dense-forest – Rozhodnutí 13). Prohlížeč osy dostane jako data.
 */
export interface MarchGridOptions {
  day?: number;
  closedGates?: ReadonlySet<number>;
  trailContinuations?: readonly (readonly RoadPoint[])[];
}

/** Žádné osy pokračování – prázdné a zmrazené, jeden objekt (klíč paměti mřížek). */
export const NO_CONTINUATIONS: readonly (readonly RoadPoint[])[] = Object.freeze([]);

/** Buňka mřížky, do které padne bod (mimo mapu nejbližší okrajová). */
export function marchCellAt(grid: MarchGeometry, p: Pos): number {
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
  // odstup stavby (Rozhodnutí 3): buňka se středem do `buildingClearanceM` od obdélníku stavby –
  // mezera mezi domy širší než dvojí odstup a buňka zůstane průchozí (D55)
  const reach = WAR.march.buildingClearanceM;
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

/** Neprůchozí příznaky, které ruší jen osa průseku (Rozhodnutí 2). */
const AXIS_CLEARS = MARCH_WATER | MARCH_STEEP | MARCH_ROCK;

/** Buňka osy průseku: průchodná × 1,5 i přes vodu (lávka, hať, brod), sráz a skálu. */
function openAxis(grid: MarchGrid, c: number): void {
  grid.pace[c] = WAR.pace.road;
  grid.flags[c] = (grid.flags[c]! & ~AXIS_CLEARS) | MARCH_ROAD;
}

/** Buňka pásu průseku: hustým lesem průchodná × 1,5; voda, sráz a skála zůstanou. */
function openSwath(grid: MarchGrid, c: number): void {
  if ((grid.flags[c]! & AXIS_CLEARS) !== 0) return;
  grid.pace[c] = WAR.pace.road;
  grid.flags[c] = grid.flags[c]! | MARCH_ROAD;
}

/** Průsek podél lomené čáry: pás `ROAD_SWATH.halfM`, osa (supercover) ruší vodu, sráz a skálu. */
function openLine(grid: MarchGrid, points: readonly Pos[]): void {
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k]!;
    const b = points[k + 1]!;
    swathCells(grid, a, b, ROAD_SWATH.halfM, (c) => openSwath(grid, c));
    supercover(grid, a, b, (c) => openAxis(grid, c));
  }
}

/**
 * Kusy hotových stezek vsi ke kraji mapy (Rozhodnutí 13): úsečka konec osy → bod okraje každého
 * výstupu (`trailExitsOf` – ten existuje jen u stezky, jejíž konec leží v pásu `TRAIL_END_BAND_M`
 * u kraje) dostavěného před dnem `day` – stezka končí kus před krajem (`TRAIL.edgeBandM`) a hustý
 * les v pásu u kraje by ji jinak zavřel.
 */
function edgePieces(village: VillageState, day: number): Pos[][] {
  return trailExitsOf(village)
    .filter((exit) => exit.builtDay < day)
    .map(({ end, edge }) => [end, edge]);
}

/**
 * Mřížka pochodu mapy (war.md – Pohyb – Terén; plán 2026-11-16-dense-forest – Rozhodnutí 1–4):
 * krajina, její vrstva překážek a ves na mapě (null = prázdné políčko). Pořadí:
 * 1. terén krajiny (`marchTerrain` – voda, brody, sráz);
 * 2. hustý les (`MARCH_FOREST`, neprůchodný) – vnitřek lesa (`forestInterior`) bez pasek vsi
 *    (`villageClearings` – i pás opevnění; jen s vrstvou překážek a vsí, bez vrstvy celý vnitřek
 *    krajiny); voda, brod a sráz v něm mají tempo podle terénu a `MARCH_FOREST` navíc;
 * 3. skály vrstvy překážek (`MARCH_ROCK`) kromě těch, které ves odstranila;
 * 4. průseky (`MARCH_ROAD`, × 1,5): stezka krajiny (`landscapeTrailLines` – i na mapě bez vsi),
 *    pevné cesty vsi (i úseky zemské stezky), kusy hotových stezek vsi ke kraji (`edgePieces`)
 *    a osy pokračování stezek sousedních vsí (`options.trailContinuations` – i na mapě bez vsi;
 *    Rozhodnutí 13) – pás `ROAD_SWATH.halfM` kolem osy je průchodný i hustým lesem, vodu, sráz
 *    a skálu ruší jen buňky osy (supercover); `MARCH_FOREST` zůstává;
 * 5. stavby vsi s odstupem `buildingClearanceM` (`MARCH_BUILDING`);
 * 6. opevnění (val, stěny, brány a mezery, vodní příkop) – val tempo buňky hustého lesa
 *    bez průseku nemění.
 * Stejný vstup → stejná mřížka; terén krajiny se počítá jednou.
 */
export function marchGrid(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: VillageState | null,
  options: MarchGridOptions = {},
): MarchGrid {
  const t = marchTerrain(landscape);
  const all = t.width * t.height;
  const grid: MarchGrid = {
    width: t.width,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    pace: new Float32Array(all),
    flags: new Uint16Array(all),
  };
  const { pace, flags } = grid;
  const base = t.base;
  const day = options.day ?? village?.lastDay ?? 0;
  // 1. terén a 2. hustý les (jedním průchodem): voda, brod a sráz uvnitř hustého lesa jsou
  // neprůchodné či průchodné podle terénu, ale nesou i `MARCH_FOREST` – průsek přes ně má dohled
  // hustého lesa a šelmy (Global Constraints – Dohled, Šelmy)
  const interior = forestInterior(landscape, grid);
  const dense =
    obstacles && village
      ? withoutClearings(interior, grid, villageClearings(landscape, obstacles, village, day))
      : interior;
  for (let c = 0; c < all; c++) {
    const b = base[c]!;
    const forest = dense[c] === 1 ? MARCH_FOREST : 0;
    if ((b & BASE_WATER) !== 0) flags[c] = MARCH_WATER | forest;
    else if ((b & BASE_STEEP) !== 0) flags[c] = MARCH_STEEP | forest;
    else if ((b & BASE_FORD) !== 0) {
      pace[c] = 1;
      flags[c] = MARCH_FORD | forest;
    } else if (forest !== 0) flags[c] = MARCH_FOREST;
    else pace[c] = 1;
  }
  // 3. skály
  if (obstacles) {
    const rocks = marchRocks(t, obstacles);
    const status = obstacleStatus(village ? obstacleChangesAt(village, day) : NO_OBSTACLE_CHANGES);
    for (let r = 0; r < rocks.index.length; r++) {
      if (status.kindOf(obstacles, rocks.index[r]!) === null) continue;
      for (let q = rocks.start[r]!; q < rocks.start[r + 1]!; q++) {
        const c = rocks.cells[q]!;
        pace[c] = 0;
        flags[c] = flags[c]! | MARCH_ROCK;
      }
    }
  }
  // 4. průseky – stezka krajiny z terénu, pak pevné cesty vsi, kusy stezek ke kraji a osy
  // pokračování (pořadí výsledek nemění – osa ruší, pás nepřepisuje)
  for (const c of t.trail) {
    if ((base[c]! & BASE_AXIS) !== 0) openAxis(grid, c);
    else openSwath(grid, c);
  }
  if (village) {
    for (const road of village.roads?.roads ?? []) openLine(grid, road.points);
    for (const piece of edgePieces(village, day)) openLine(grid, piece);
  }
  for (const axis of options.trailContinuations ?? NO_CONTINUATIONS) openLine(grid, axis);
  if (!village) return grid;
  // 5. stavby, 6. opevnění
  blockBuildings(grid, landscape, village, day);
  const closed = options.closedGates ?? new Set<number>();
  for (const fort of village.fortifications ?? []) {
    const cells = fortCells(grid, landscape, fort, day, closed);
    // tempo přes příkop a val podle výšky dílu: 1 ÷ (1 + 3 × v) – plný val čtvrtinové jako dřív;
    // buňka, která zůstala hustým lesem (pás valu je paseka – `villageClearings`; bez vrstvy
    // překážek pasek není), tempo nedostane – val průchod hustým lesem neotevře
    for (const { cell: c, height } of cells.rampart) {
      if ((grid.flags[c]! & (MARCH_FOREST | MARCH_ROAD)) !== MARCH_FOREST) {
        grid.pace[c] = rampartPace(height);
      }
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

/**
 * Kolik naposledy použitých dní mřížek drží paměť na krajinu, překážky a ves. Tažení čte den
 * a další; čtyři dny pokryjí dvě tažení nad touž mapou posunutá až o dva dny (jedno dohání).
 */
const MEMO_DAYS = 4;
/** Zástupný klíč za chybějící vrstvu překážek nebo ves (WeakMap nebere null). */
const NONE: object = {};

/**
 * Mřížky pochodu napříč voláními `stepCampaign` (worker – docs/code/worker.md, Výkon – Tažení).
 * Klíč je identita krajiny, vrstvy překážek a stavu vsi a den: `marchGrid` je čistá a stav vsi
 * neměnný, takže tentýž objekt a den = tatáž mřížka. Objekty drží slabě (zahozená ves uvolní své
 * mřížky), na jednu trojici nejvýš `MEMO_DAYS` naposledy použitých dnů – vyhazuje se nejdéle
 * nepoužitý den, ne nejmenší: tažení o den pozadu by jinak svou mřížku stavělo při každém dotazu
 * znovu (měřeno 13. 11. 2026: dvě tažení o den posunutá, 800 dotazů – 205 staveb mřížky, takhle 6).
 * Mřížka mapy bez vsi na dni nezávisí (den čtou jen stavby, opevnění, překážky a kusy stezek vsi;
 * osy pokračování dostavěných stezek přicházejí jako pole – `continuationsOf` je filtruje podle
 * `builtDay` a nový vstup dá nové pole), proto má den v klíči 0 – staví se jednou, ne každý den.
 */
export class MarchGridMemo {
  private readonly grids = new WeakMap<
    Landscape,
    WeakMap<object, WeakMap<object, WeakMap<object, Map<number, MarchGrid>>>>
  >();

  /**
   * Mřížka jako `marchGrid(landscape, obstacles, village, { day, trailContinuations })` – z paměti,
   * je-li tam. Osy pokračování jsou další úroveň klíče podle identity pole: paměť
   * `trailContinuations` vrací pro tentýž vstup tentýž objekt, bez os `NO_CONTINUATIONS`.
   */
  gridOf(
    landscape: Landscape,
    obstacles: ObstacleLayer | null,
    village: VillageState | null,
    day: number,
    continuations: readonly (readonly RoadPoint[])[] = NO_CONTINUATIONS,
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
    let byAxes = byVillage.get(village ?? NONE);
    if (!byAxes) {
      byAxes = new WeakMap();
      byVillage.set(village ?? NONE, byAxes);
    }
    let byDay = byAxes.get(continuations);
    if (!byDay) {
      byDay = new Map();
      byAxes.set(continuations, byDay);
    }
    // mapa bez vsi – mřížka na dni nezávisí (viz výše)
    const dayKey = village === null ? 0 : day;
    const known = byDay.get(dayKey);
    if (known) {
      // použitý den na konec pořadí vkládání – první v pořadí je pak nejdéle nepoužitý
      byDay.delete(dayKey);
      byDay.set(dayKey, known);
      return known;
    }
    const grid = marchGrid(landscape, obstacles, village, {
      day,
      trailContinuations: continuations,
    });
    byDay.set(dayKey, grid);
    if (byDay.size > MEMO_DAYS) {
      const unused = byDay.keys().next();
      if (!unused.done) byDay.delete(unused.value);
    }
    return grid;
  }
}
