// Mřížka sítě pěšin: ceny buněk z terénu, domů, polí a cest, stavby a jejich vchody.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { detCos, detSin, length2, tileCenterWorld, type Landscape } from '../../landscape';
import { rotatedSquareCorners, rotationCosSin, rotationTurn } from '../square-grid';
import { dwellingFrame, shapeRect, shapeZ, type ShapeFrame } from '../dwelling-shape';
import { DWELLING_CLEARING_M, ROAD_WALK, SACRED_BUILDINGS } from '../rules';
import { type DwellingPlot, type DwellingType, type RoadGrade, type Position } from '../types';
import { terrainEditsFrom, withTerrainEdits } from './earthworks';
import { nearestPartFinder } from './nearest';
import { PATH_WATER, PATH_WETLAND, type PathTerrain } from './terrain';
import { isCropPart, partWalkSpeed, roadTreeSpeed, roadWalkSpeed } from './walk-speed';
import {
  CEMETERY_COST,
  GATE_M,
  HOUSE_MARGIN_M,
  ORCHARD_COST,
  OVERGROWN_COST,
  PEN_COST,
  type PathNetworkInput,
  type PathPoint,
  type PathVillage,
  ROAD_STRENGTH,
  SHRINE_COST,
  WOOD_COST,
  type Square,
} from './network-types';
import { penPathSquares } from './network-keys';

/**
 * Buňka pod osou pevné cesty stojí 1 / rychlost chůze po cestě (`roadWalkSpeed` – stupeň
 * a mokřina, ROAD_WALK; mimo mokřinu `dry` – i se stromy u cesty, roads.md – Stromy u cesty
 * zrychlí chůzi: trasy se ke stromořadí víc stahují) – bez ohledu na povrch pod ní (Martin,
 * 19. 10. 2026: „Když už někde
 * vyšlapaná cesta je, ať po ní lidé chodí bez ohledu na to, na čem ta stezka leží.“ – paths.md,
 * roads.md – Cesta je cesta): díl pole v jakémkoli stadiu, sad, les vsi i krajiny, křoviny, svah
 * ani překážky krajiny ji neprodraží, pěšina dne ji nezrychlí. Brod zůstává (cena brodu
 * z terénu), neprůchodná buňka (voda, sráz, balvan) neprůchodnou a ploty hřbitova a ohrady,
 * okrsek svatyně a stavby vsi zůstávají překážkou.
 */
function roadCellCost(grade: RoadGrade | undefined, flags: number, dry?: number): number {
  const wet = (flags & PATH_WETLAND) !== 0;
  if (!wet && dry !== undefined && dry > 0) return 1 / dry;
  return 1 / roadWalkSpeed(grade ?? 'trodden', wet);
}

export interface Grid {
  width: number;
  height: number;
  originX: number;
  originZ: number;
  cellM: number;
  /** Cena po vsi a překážkách (bez slevy za pěšiny). */
  base: Float32Array;
  flags: Uint8Array;
  /** Buňka patří stavbě vsi (pole, sad, hřbitov, dům) – pro dřevo a vodu se sem nechodí. */
  village: Uint8Array;
  /** Buňka leží pod osou pevné cesty (`roadMask`); bez pevných cest null. */
  road: Uint8Array | null;
  /**
   * Pěšina dne buňku nezrychlí (pevná cesta – jde se rychlostí cesty, díl pole v osevu – platí
   * cena pole); bez takových buněk null.
   */
  plain: Uint8Array | null;
}

/**
 * Terén pěšin a vozů s úpravami terénu vsi (`PathVillage.earthworks` – úvozy a náspy vozových
 * cest); bez zemních prací týž objekt.
 */
export function villageTerrain(village: PathVillage, terrain: PathTerrain): PathTerrain {
  if (!village.earthworks || village.earthworks.length === 0) return terrain;
  return withTerrainEdits(terrain, terrainEditsFrom(village.earthworks));
}

/** Okno mřížky – rozměry, počátek a krok (terén pěšin, mřížka sítě i vozů). */
export type GridWindow = Pick<Grid, 'width' | 'height' | 'originX' | 'originZ' | 'cellM'>;

export function cellX(grid: Grid, c: number): number {
  return grid.originX + (c % grid.width) * grid.cellM;
}

export function cellZ(grid: Grid, c: number): number {
  return grid.originZ + Math.floor(c / grid.width) * grid.cellM;
}

/** Buňky se středem v obdélníku světa (včetně okraje). */
export function cellsIn(
  grid: GridWindow,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  visit: (c: number, x: number, z: number) => void,
): void {
  const i0 = Math.max(0, Math.ceil((minX - grid.originX) / grid.cellM - 1e-6));
  const j0 = Math.max(0, Math.ceil((minZ - grid.originZ) / grid.cellM - 1e-6));
  const i1 = Math.min(grid.width - 1, Math.floor((maxX - grid.originX) / grid.cellM + 1e-6));
  const j1 = Math.min(grid.height - 1, Math.floor((maxZ - grid.originZ) / grid.cellM + 1e-6));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      visit(j * grid.width + i, grid.originX + i * grid.cellM, grid.originZ + j * grid.cellM);
    }
  }
}

/** Číselný klíč políčka (celá čísla do ±2^20 – krajina je o řády menší). */
function tileKey(x: number, y: number): number {
  return (x + TILE_KEY_OFFSET) * TILE_KEY_SPAN + (y + TILE_KEY_OFFSET);
}

const TILE_KEY_OFFSET = 1_048_576; // 2^20

const TILE_KEY_SPAN = 2_097_152; // 2^21

/**
 * Buňky čtverců (políček) jedné stavby: `inside` – střed uvnitř nebo na hraně mezi dvěma
 * čtverci (mezi díly pole meze nejsou), `edge` – střed na vnější hraně (tam vede pěšina podél
 * okraje). Vrátí obojí zvlášť.
 */
export function squareCells(
  grid: GridWindow,
  squares: readonly Square[],
): { inside: number[]; edge: number[] } {
  if (squares.length === 0) return { inside: [], edge: [] };
  const { inUnion, spread } = squareUnion(squares);
  const seen = new Set<number>();
  const inside: number[] = [];
  const edge: number[] = [];
  const probe = 0.2;
  for (const s of squares) {
    const half = (s.size / 2) * spread;
    cellsIn(grid, s.x - half, s.z - half, s.x + half, s.z + half, (c, x, z) => {
      if (seen.has(c)) return;
      seen.add(c);
      let count = 0;
      if (inUnion(x + probe, z + probe)) count++;
      if (inUnion(x - probe, z + probe)) count++;
      if (inUnion(x + probe, z - probe)) count++;
      if (inUnion(x - probe, z - probe)) count++;
      if (count === 4) inside.push(c);
      else if (count > 0) edge.push(c);
    });
  }
  return { inside, edge };
}

/**
 * Sjednocení čtverců jedné stavby jako test bodu světa (`inUnion`), natočení mřížky (`cos`, `sin`)
 * a `spread` – násobek poloviny strany, o který obdélník kolem natočeného čtverce přesahuje.
 */
function squareUnion(squares: readonly Square[]): {
  inUnion: (x: number, z: number) => boolean;
  cos: number;
  sin: number;
  spread: number;
} {
  const first = squares[0]!;
  const tiles = new Set(squares.map((s) => tileKey(s.cell.x, s.cell.y)));
  const left = first.x - first.size / 2;
  const top = first.z - first.size / 2;
  // natočená stavba (fields.md – Natočené stavby): bod do souřadnic její mřížky
  const turn = first.rotation === undefined ? 0 : (rotationTurn(first.rotation) ?? 0);
  const [c, sn] = rotationCosSin(first.rotation ?? 0);
  const inUnion =
    turn === 0
      ? (x: number, z: number): boolean =>
          tiles.has(
            tileKey(
              first.cell.x + Math.floor((x - left) / first.size),
              first.cell.y + Math.floor((z - top) / first.size),
            ),
          )
      : (x: number, z: number): boolean => {
          const dx = x - first.x;
          const dz = z - first.z;
          const lx = (dx * c - dz * sn) / first.size;
          const lz = (dx * sn + dz * c) / first.size;
          return tiles.has(
            tileKey(first.cell.x + Math.floor(lx + 0.5), first.cell.y + Math.floor(lz + 0.5)),
          );
        };
  // obdélník kolem natočeného čtverce je větší (|cos| + |sin| násobek)
  const spread = turn === 0 ? 1 : Math.abs(c) + Math.abs(sn);
  return { inUnion, cos: c, sin: sn, spread };
}

/**
 * Buňky pod plotem odsazeným `inset` od okraje čtverců (ohrada, hřbitov – oxen.md, cemetery.md):
 * střed buňky leží aspoň `inset` uvnitř sjednocení (v osách mřížky stavby), takže pruh `2 × inset`
 * u okraje zůstává volný – mezi dvěma sousedními ohradami (ulička 3 m) vede řada buněk na hranici
 * čtverců (mřížka vozů má krok 3,75 m a hranice čtverců leží na jejích řadách). Vozy a pěšiny jimi
 * jedou, ostatní buňky pod plotem nejsou průchodné.
 */
export function fencedCells(grid: GridWindow, squares: readonly Square[], inset: number): number[] {
  if (squares.length === 0) return [];
  const { inUnion, cos, sin, spread } = squareUnion(squares);
  // posun o (a, b) v osách mřížky stavby → svět
  const around = (x: number, z: number, a: number, b: number): boolean =>
    inUnion(x + a * cos + b * sin, z - a * sin + b * cos);
  const seen = new Set<number>();
  const cells: number[] = [];
  const eps = 1e-6;
  const r = inset - eps;
  // čtverec o poloviční straně `inset` kolem bodu celý uvnitř (rohy a středy stran)
  const offsets = [
    [0, 0],
    [r, r],
    [-r, r],
    [r, -r],
    [-r, -r],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ] as const;
  const boxInside = (x: number, z: number): boolean =>
    offsets.every(([a, b]) => around(x, z, a, b));
  // Natočení o násobek 90° nechává hranice čtverců na řadách mřížky vozů – stačí střed buňky. Jiné
  // natočení (po 15°) pruh 3 m u hranice nemusí trefit žádným středem a ulička by zmizela; tam
  // se buňka blokuje, jen když leží celá (všechny čtyři rohy) uvnitř plotu, takže každá buňka,
  // kterou pruh protíná, zůstane sjízdná a ulička je souvislá.
  const turn = squares[0]!.rotation === undefined ? 0 : rotationTurn(squares[0]!.rotation);
  const aligned = turn !== null && turn % 6 === 0;
  const h = grid.cellM / 2;
  for (const s of squares) {
    const half = (s.size / 2) * spread;
    cellsIn(grid, s.x - half, s.z - half, s.x + half, s.z + half, (c, x, z) => {
      if (seen.has(c)) return;
      seen.add(c);
      const blocked = aligned
        ? boxInside(x, z)
        : boxInside(x - h, z - h) &&
          boxInside(x + h, z - h) &&
          boxInside(x - h, z + h) &&
          boxInside(x + h, z + h);
      if (blocked) cells.push(c);
    });
  }
  return cells;
}

/** Obdélník v souřadnicích domu (x napříč, z k vchodu, m). */
export interface PathBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Stavba, kterou pěšiny obcházejí: dům (i se šíjí), pozemek, staveniště, modla. */
export interface Building {
  position: Position;
  box: PathBox;
}

/** Bod v souřadnicích domu (x napříč, z k vchodu) → svět (natočení jako `mesh.rotation.y`). */
function localToWorld(position: Position, lx: number, lz: number): [number, number] {
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  return [position.x + lx * c + lz * s, position.z - lx * s + lz * c];
}

export function inBuilding(b: Building, x: number, z: number, margin: number): boolean {
  const c = detCos(b.position.rotation);
  const s = detSin(b.position.rotation);
  const dx = x - b.position.x;
  const dz = z - b.position.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    lx > b.box.minX - margin &&
    lx < b.box.maxX + margin &&
    lz > b.box.minZ - margin &&
    lz < b.box.maxZ + margin
  );
}

export function buildingBounds(b: Building, margin: number): [number, number, number, number] {
  const corners = [
    localToWorld(b.position, b.box.minX - margin, b.box.minZ - margin),
    localToWorld(b.position, b.box.maxX + margin, b.box.minZ - margin),
    localToWorld(b.position, b.box.maxX + margin, b.box.maxZ + margin),
    localToWorld(b.position, b.box.minX - margin, b.box.maxZ + margin),
  ];
  return [
    Math.min(...corners.map((p) => p[0])),
    Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])),
  ];
}

/**
 * Obdélník obydlí pro pěšiny: na pozemku celé oplocené políčko (brána = branka na přední
 * straně proti vchodu), volné obydlí jako dům se šíjí, rozestavěné jako staveniště.
 */
export function dwellingBox(
  d: Pick<PathVillage['dwellings'][number], 'type' | 'position' | 'built' | 'plot' | 'plainShape'>,
): PathBox {
  if (d.plot) return plotPathBox(d.position, d.plot);
  // varianta rozměrů (population.md – Varianty rozměrů): dům i staveniště podle tvaru domu
  const frame = dwellingFrame({
    type: d.type,
    position: d.position,
    ...(d.plainShape ? { plainShape: true } : {}),
  });
  return d.built ? shapeRect(frame, DWELLING_PATH_BOX_M[d.type]) : sitePathBox(d.type, frame);
}

/**
 * Dům se střechou a šíjí v souřadnicích domu (x napříč, z k vchodu) – stejný obdélník jako
 * u slepic a postav ve scéně (`chickenBox` + `houseBox` ve webu, hlídá test).
 */
export const DWELLING_PATH_BOX_M: Record<DwellingType, PathBox> = {
  zemnice: { minX: -2.9, maxX: 2.9, minZ: -3.3, maxZ: 4.2 },
  polozemnice: { minX: -3.4, maxX: 3.4, minZ: -3.8, maxZ: 3.8 },
  dvorec: { minX: -3.8, maxX: 3.8, minZ: -5.9, maxZ: 5.9 },
};

/** Staveniště sahá s hromadou hlíny a nářadím před dům nejméně tak daleko (m). */
const SITE_FRONT_M = 5;

/** Staveniště: celá vyklízená plocha (jako `siteBox` postav ve scéně). */
function sitePathBox(type: DwellingType, frame: ShapeFrame): PathBox {
  const clearance = shapeRect(frame, DWELLING_CLEARING_M[type]);
  return {
    minX: clearance.minX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(shapeZ(frame, DWELLING_PATH_BOX_M[type].maxZ), SITE_FRONT_M),
  };
}

/** Oplocený pozemek v osách domu (jako `plotBox` postav ve scéně) – u dvorce i se dvorem. */
function plotPathBox(
  position: Position,
  plot: {
    x: number;
    z: number;
    size: number;
    rotation?: number;
    yard?: { x: number; z: number };
  },
): PathBox {
  const h = plot.size / 2;
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  const minX = Math.min(plot.x, plot.yard?.x ?? plot.x) - h;
  const maxX = Math.max(plot.x, plot.yard?.x ?? plot.x) + h;
  const minZ = Math.min(plot.z, plot.yard?.z ?? plot.z) - h;
  const maxZ = Math.max(plot.z, plot.yard?.z ?? plot.z) + h;
  // natočený pozemek (fields.md – Natočené stavby): rohy natočeného čtverce
  const corners: readonly (readonly [number, number])[] =
    plot.rotation !== undefined && !plot.yard
      ? rotatedSquareCorners(plot.x, plot.z, plot.size, plot.rotation)
      : [
          [minX, minZ],
          [maxX, minZ],
          [maxX, maxZ],
          [minX, maxZ],
        ];
  const local = corners.map(([x, z]) => {
    const dx = x! - position.x;
    const dz = z! - position.z;
    return [dx * c - dz * s, dx * s + dz * c] as const;
  });
  return {
    minX: Math.min(...local.map((p) => p[0])),
    maxX: Math.max(...local.map((p) => p[0])),
    minZ: Math.min(...local.map((p) => p[1])),
    maxZ: Math.max(...local.map((p) => p[1])),
  };
}

/** Pozemek obydlí v síti pěšin (`PathVillage.dwellings[].plot`). */
export type PathPlot = NonNullable<PathVillage['dwellings'][number]['plot']>;

/**
 * Pozemek obydlí ze stavu (`DwellingPlot`) pro síť pěšin: střed políčka, u natočeného pozemku
 * střed a natočení čtverce (fields.md – Natočené stavby), u dvorce i střed dvora (trade.md).
 */
export function pathPlotOf(landscape: Landscape, plot: DwellingPlot): PathPlot {
  const cell = { x: plot.cell.x, y: plot.cell.y };
  if (plot.square && !plot.yard) {
    return {
      cell,
      x: plot.square.x,
      z: plot.square.z,
      size: landscape.cellSizeM,
      rotation: plot.square.rotation,
    };
  }
  const c = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  const yard = plot.yard ? tileCenterWorld(landscape, plot.yard.x, plot.yard.y) : null;
  return { cell, x: c.x, z: c.z, size: landscape.cellSizeM, ...(yard ? { yard } : {}) };
}

/**
 * Brána hotového obydlí – místo, odkud vychází síť pěšin (`gateOf`): kus před koncem šíje, na
 * pozemku 1 m před brankou proti vchodu, u dvorce za vzdálenou stranou dvora. Kontrola umístění
 * se ptá stejného místa (population.md – Umístění obydlí, paths.md – Vchody).
 */
export function dwellingGatePoint(
  landscape: Landscape,
  d: { type: DwellingType; position: Position; plot?: DwellingPlot; plainShape?: boolean },
): PathPoint {
  const plot = d.plot ? pathPlotOf(landscape, d.plot) : undefined;
  return gateOf({
    position: d.position,
    box: dwellingBox({
      type: d.type,
      position: d.position,
      built: true,
      ...(plot ? { plot } : {}),
      ...(d.plainShape ? { plainShape: true } : {}),
    }),
  });
}

/** Brána domu – kus před koncem šíje (odtud vychází pěšina). */
export function gateOf(b: Building): PathPoint {
  const [x, z] = localToWorld(b.position, 0, b.box.maxZ + GATE_M);
  return { x, z };
}

/**
 * Mřížka pro hledání: terén (i s překážkami krajiny), mokřina (ROAD_WALK.wetSpeed), k nim stavby
 * vsi (pole podle rychlosti chůze – `partWalkSpeed`, sad, hřbitov) a neprůchodné domy. Pod pevnou
 * cestou platí cena cesty (`roadCellCost`) místo terénu, mokřiny, pole, sadu a lesa vsi; ploty
 * hřbitova a ohrady, okrsek svatyně a domy platí i tam.
 */
export function villageGrid(input: PathNetworkInput, buildings: readonly Building[]): Grid {
  // úpravy terénu vozových cest – ves bez nich beze změny (týž terén)
  const t = villageTerrain(input.village, input.terrain);
  const grid: Grid = {
    width: t.width,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    base: new Float32Array(t.cost),
    flags: t.flags,
    village: new Uint8Array(t.width * t.height),
    road: null,
    plain: null,
  };
  const all = t.width * t.height;
  const v = input.village;
  const road = roadMask(grid, v.roads);
  grid.road = road;
  const plain = new Uint8Array(all);
  let anyPlain = false;
  const onRoad = (c: number): boolean => road !== null && road[c] === 1;
  // rychlost chůze proti louce (walk-speed.ts): mokřina (bahno) a pole podle stadia – nejpomalejší
  // platí; pod pevnou cestou jen cesta
  const speed = new Float32Array(all).fill(1);
  for (let c = 0; c < all; c++) {
    if (t.flags[c]! & PATH_WETLAND) speed[c] = ROAD_WALK.wetSpeed;
  }
  for (const field of v.fields) {
    // hrana mezi díly téhož pole je uvnitř pole (meze nejsou) – cena podle nejbližšího dílu
    const nearestPart = nearestPartFinder(field.parts, field.parts[0]?.size ?? 0);
    for (const c of squareCells(grid, field.parts).inside) {
      grid.village[c] = 1;
      if (onRoad(c)) continue;
      const part = nearestPart(cellX(grid, c), cellZ(grid, c));
      speed[c] = Math.min(speed[c]!, partWalkSpeed(part));
      grid.base[c] = grid.base[c]! * (OVERGROWN_COST[part.stage] ?? 1);
      // pěšina dne přes díl v osevu nezrychlí – platí cena pole
      if (isCropPart(part)) {
        plain[c] = 1;
        anyPlain = true;
      }
    }
  }
  for (let c = 0; c < all; c++) {
    if (speed[c]! < 1 && !onRoad(c)) grid.base[c] = grid.base[c]! / speed[c]!;
  }
  if (road) {
    // brod (voda) a neprůchodné buňky zůstávají, jinak cena cesty podle stupně (roads.md);
    // v buňce víc cest – nejrychlejší
    const roads = roadGradeMask(grid, v.roads);
    const dry = roadTreeSpeedMask(grid, v.roads);
    for (let c = 0; c < road.length; c++) {
      if (road[c] && Number.isFinite(grid.base[c]!) && !(grid.flags[c]! & PATH_WATER)) {
        grid.base[c] = roadCellCost(ROAD_GRADES[roads[c]!], grid.flags[c]!, dry?.[c]);
        plain[c] = 1;
        anyPlain = true;
      }
    }
  }
  if (anyPlain) grid.plain = plain;
  for (const orchard of v.orchards ?? []) {
    for (const c of squareCells(grid, orchard.squares).inside) {
      grid.village[c] = 1;
      if (!onRoad(c)) grid.base[c] = grid.base[c]! * ORCHARD_COST;
    }
  }
  for (const cemetery of v.cemeteries ?? []) {
    for (const c of squareCells(grid, cemetery.squares).inside) {
      grid.base[c] = grid.base[c]! * CEMETERY_COST;
      grid.village[c] = 1;
    }
  }
  for (const pen of v.pens ?? []) {
    for (const c of squareCells(grid, penPathSquares(pen)).inside) {
      grid.base[c] = grid.base[c]! * PEN_COST;
      grid.village[c] = 1;
    }
  }
  const woods = (v.woods ?? []).filter((w) => w.surface !== 'forest');
  if (woods.length > 0) {
    for (const c of squareCells(grid, woods).inside) {
      if (!onRoad(c)) grid.base[c] = grid.base[c]! * WOOD_COST;
    }
  }
  for (const b of v.sacred?.buildings ?? []) {
    if (b.kind !== 'shrine') continue;
    const half = SACRED_BUILDINGS.shrine.footprintM / 2;
    cellsIn(
      grid,
      b.position.x - half,
      b.position.z - half,
      b.position.x + half,
      b.position.z + half,
      (c) => {
        grid.base[c] = grid.base[c]! * SHRINE_COST;
        grid.village[c] = 1;
      },
    );
  }
  for (const b of buildings) {
    const [x0, z0, x1, z1] = buildingBounds(b, HOUSE_MARGIN_M);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (!inBuilding(b, x, z, HOUSE_MARGIN_M)) return;
      grid.base[c] = Infinity;
      grid.village[c] = 1;
    });
  }
  return grid;
}

/** Nejbližší průchodná buňka k bodu (do `reach` buněk), nebo −1. */
export function passableNear(grid: Grid, x: number, z: number, reach: number): number {
  const ci = Math.round((x - grid.originX) / grid.cellM);
  const cj = Math.round((z - grid.originZ) / grid.cellM);
  let best = -1;
  let bestD = Infinity;
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) continue;
      const c = j * grid.width + i;
      if (!Number.isFinite(grid.base[c]!)) continue;
      const d = length2(grid.originX + i * grid.cellM - x, grid.originZ + j * grid.cellM - z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
  }
  return best;
}

/** Pás kolem obydlí (m), kde se hledá náhradní brána (`gateAround`). */
const GATE_RING_M = 7.5;

/**
 * Náhradní brána obydlí, jehož brána leží v neprůchodné zemi (Vlkov, 19. 10. 2026: branka
 * polozemnice vedla do pozemku dvorce a domácnost vypadla ze sítě – neměla žádnou pochůzku):
 * průchodná buňka v pásu GATE_RING_M kolem obdélníku obydlí nejblíž k bráně (při shodě první po
 * řádcích), nebo −1 (obydlí celé obestavěné).
 */
export function gateAround(grid: Grid, b: Building, gate: PathPoint): number {
  const [x0, z0, x1, z1] = buildingBounds(b, GATE_RING_M);
  let best = -1;
  let bestD = Infinity;
  cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
    if (!Number.isFinite(grid.base[c]!) || !inBuilding(b, x, z, GATE_RING_M)) return;
    const d = length2(x - gate.x, z - gate.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  });
  return best;
}

/** Průchodné buňky do `radius` m od bodu (aspoň nejbližší jedna). */
export function cellsAround(grid: Grid, p: PathPoint, radius: number): number[] {
  const out: number[] = [];
  cellsIn(grid, p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c, x, z) => {
    if (length2(x - p.x, z - p.z) <= radius && Number.isFinite(grid.base[c]!)) out.push(c);
  });
  if (out.length === 0) {
    const near = passableNear(grid, p.x, p.z, 3);
    if (near >= 0) out.push(near);
  }
  return out;
}

/**
 * Buňky pod osami pevných cest (1, jinak 0) – osy se projdou po třetinách buňky a označí se
 * nejbližší buňka, takže cesta je souvislá řada buněk. Bez cest null.
 */
export function roadMask(grid: GridWindow, roads: PathVillage['roads']): Uint8Array | null {
  if (!roads || roads.length === 0) return null;
  const mask = new Uint8Array(grid.width * grid.height);
  const step = grid.cellM / 3;
  const mark = (x: number, z: number): void => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return;
    mask[j * grid.width + i] = 1;
  };
  for (const road of roads) {
    const pts = road.points;
    if (pts.length === 1) mark(pts[0]!.x, pts[0]!.z);
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / step));
      for (let s = 0; s <= n; s++) mark(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n);
    }
  }
  return mask;
}

/** Stupně cest od nejpomalejšího – index v masce `roadGradeMask`. */
const ROAD_GRADES: readonly RoadGrade[] = ['trodden', 'improved', 'causeway', 'wagon'];

/**
 * Nejvyšší stupeň pevné cesty po buňkách (index v ROAD_GRADES) – buňky jako `roadMask`; mimo
 * cesty 0. Cesta bez stupně je vyšlapaná.
 */
function roadGradeMask(grid: GridWindow, roads: PathVillage['roads']): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (const road of roads ?? []) {
    const grade = Math.max(0, ROAD_GRADES.indexOf(road.grade ?? 'trodden'));
    eachRoadCell(grid, road.points, (c) => {
      if (grade > mask[c]!) mask[c] = grade;
    });
  }
  return mask;
}

/**
 * Rychlost chůze po pevných cestách mimo mokřinu po buňkách (buňky jako `roadMask`) – stupeň
 * a stromy u cesty (`roadWalkSpeed` s `roadTreeSpeed`, roads.md – Stromy u cesty zrychlí chůzi),
 * v buňce víc cest nejrychlejší. Jen když některá cesta stromy má – jinak null (rychlost podle
 * stupně z `roadGradeMask`, síť vsi bez stromů u cest beze změny).
 */
function roadTreeSpeedMask(grid: GridWindow, roads: PathVillage['roads']): Float64Array | null {
  if (!(roads ?? []).some((road) => roadTreeSpeed(road.lined) > 0)) return null;
  const mask = new Float64Array(grid.width * grid.height);
  for (const road of roads ?? []) {
    const speed = roadWalkSpeed(road.grade ?? 'trodden', false, roadTreeSpeed(road.lined));
    eachRoadCell(grid, road.points, (c) => {
      if (speed > mask[c]!) mask[c] = speed;
    });
  }
  return mask;
}

/** Buňky pod osou cesty – body osy po třetině buňky, nejbližší buňka (jako `roadMask`). */
function eachRoadCell(
  grid: GridWindow,
  pts: readonly PathPoint[],
  visit: (c: number) => void,
): void {
  const step = grid.cellM / 3;
  const mark = (x: number, z: number): void => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return;
    visit(j * grid.width + i);
  };
  if (pts.length === 1) mark(pts[0]!.x, pts[0]!.z);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / step));
    for (let s = 0; s <= n; s++) mark(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n);
  }
}

/**
 * Síla pevných cest po buňkách (ROAD_STRENGTH pod osou na průchodné buňce, jinak 0) – od začátku
 * jako plná pěšina. Bez cest null.
 */
export function roadCells(grid: Grid): Float32Array | null {
  const road = grid.road;
  if (!road) return null;
  const fixed = new Float32Array(grid.width * grid.height);
  for (let c = 0; c < road.length; c++) {
    if (road[c] && Number.isFinite(grid.base[c]!)) fixed[c] = ROAD_STRENGTH;
  }
  return fixed;
}

// --- cesty -----------------------------------------------------------------------------------
