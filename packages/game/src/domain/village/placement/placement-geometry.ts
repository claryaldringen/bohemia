// Geometrie obydlí a pozemků, rejstřík půdy (vlastní i cizí) a společné kontroly terénu.

import {
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type PlotSquare,
  type PlotVariant,
  type Position,
  type TileCell,
} from '../types';
import {
  DWELLING_FOOTPRINT_M,
  DWELLING_MAX_HEIGHT_DIFF_M,
  PLOT_HOUSE_OFFSET_M,
  PLOT_HOUSE_ROTATION,
  PLOT_SNAP_M,
  PLOT_VARIANTS,
} from '../rules';
import {
  type DwellingShape,
  dwellingShape,
  isPlainShape,
  shapedFootprint,
} from '../buildings/dwelling-shape';
import { type LandSquare, PolygonIndex, villageLandSquares } from './squares';
import {
  type Landscape,
  heightAtWorld,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
} from '../../landscape';
import { type Point, polygonsOverlap, rectangleCorners } from './polygon';
import { type Shape, plotShapes } from './plot-cells';
import { buildingLocalToWorld } from '../core/obstacles';
import { rotationTurn, squareLocalToWorld, turnRotation } from './square-grid';
import { workshopFootprints } from '../crafts/crafts';
import {
  FOOTPRINT_SAMPLE_STEP_M,
  OK,
  type PlacementCheck,
  type PlacementVillage,
  fail,
  formatNumber,
} from './placement-types';

/** Rohy půdorysu obydlí ve světě – s variantou rozměrů `shape` (`dwellingShape`). */
export function dwellingFootprint(
  type: DwellingType,
  position: Position,
  shape: DwellingShape,
): Point[] {
  if (isPlainShape(shape)) {
    const { width, depth } = DWELLING_FOOTPRINT_M[type];
    return rectangleCorners(position.x, position.z, width, depth, position.rotation);
  }
  const { width, depth, centerZ } = shapedFootprint(type, shape);
  const [x, z] = buildingLocalToWorld(position, 0, centerZ);
  return rectangleCorners(x, z, width, depth, position.rotation);
}

/**
 * Poloha domu na pozemku: střed políčka + posun varianty, vchodem k brance (`PLOT_HOUSE_*`).
 * Dvorec (pozemek se dvorem – trade.md): uprostřed políčka domu, vchodem ke dvoru.
 */
export function plotHousePosition(landscape: Landscape, plot: DwellingPlot): Position {
  const offset = PLOT_HOUSE_OFFSET_M[plot.variant];
  // natočený pozemek: posun varianty v osách pozemku, dům vchodem k brance (Martin – varianta a)
  if (plot.square && !plot.yard) {
    const [x, z] = squareLocalToWorld(plot.square, offset.x, offset.z);
    return { x, z, rotation: plotHouseRotation(plot.square.rotation) };
  }
  const center = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  if (plot.yard) {
    return { x: center.x, z: center.z, rotation: yardRotation(plot.cell, plot.yard) };
  }
  return { x: center.x + offset.x, z: center.z + offset.z, rotation: PLOT_HOUSE_ROTATION };
}

/** Natočení domu na pozemku natočeném o `rotation` – vchodem k brance (0 až 2π). */
export function plotHouseRotation(rotation: number): number {
  const full = Math.PI * 2;
  const turn = rotationTurn(rotation);
  const angle = turn === null ? rotation : turnRotation(turn);
  return (((angle + PLOT_HOUSE_ROTATION) % full) + full) % full;
}

/** Mnohoúhelník bez políčka (půdorys, vyklízená plocha). */
export function freeShape(corners: readonly Point[]): Shape {
  return { corners, tile: null };
}

/**
 * Pozemek ze vstupu hráče v ukládané podobě: natočený pozemek přes `rotatedPlot` (střed na cm,
 * natočení po 15°, políčko pod středem), pozemek na políčku jako kopie. Neplatné natočení → null.
 */
export function canonicalPlot(landscape: Landscape, plot: DwellingPlot): DwellingPlot | null {
  if (plot.square) return plot.yard ? null : rotatedPlot(landscape, plot.square, plot.variant);
  return {
    cell: { x: plot.cell.x, y: plot.cell.y },
    variant: plot.variant,
    ...(plot.yard ? { yard: { x: plot.yard.x, y: plot.yard.y } } : {}),
  };
}

/**
 * Natočený pozemek pro uložení: střed na cm a natočení po 15° (0 až 2π); políčko pod středem.
 * Pozemek natočený o 0° ve středu políčka natočení nepotřebuje – je to políčko jako dřív. Neplatný
 * (nekonečné číslo, natočení mimo 15°) → null.
 */
export function rotatedPlot(
  landscape: Landscape,
  square: PlotSquare,
  variant: PlotVariant,
): DwellingPlot | null {
  const turn = rotationTurn(square.rotation);
  if (turn === null || !Number.isFinite(square.x) || !Number.isFinite(square.z)) return null;
  const x = Math.round(square.x * 100) / 100;
  const z = Math.round(square.z * 100) / 100;
  const cell = tileOfWorldPoint(landscape, x, z);
  if (!cell) return null;
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  if (turn === 0 && Math.abs(center.x - x) < 1e-6 && Math.abs(center.z - z) < 1e-6) {
    return { cell, variant };
  }
  return { cell, variant, square: { x, z, rotation: turnRotation(turn) } };
}

/**
 * Natočení domu, jehož vchod (+z modelu) míří z políčka `cell` do sousedního `yard`: model +z
 * jde do (sin r, cos r) světa – dvůr na −z (vpředu jako u ostatních pozemků) π, na +z 0, na +x
 * π/2, na −x −π/2.
 */
export function yardRotation(cell: TileCell, yard: TileCell): number {
  const dx = yard.x - cell.x;
  const dy = yard.y - cell.y;
  if (dy < 0) return Math.PI;
  if (dy > 0) return 0;
  return dx > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Dvůr sousedí s políčkem domu stranou. */
export function yardTouches(cell: TileCell, yard: TileCell): boolean {
  return Math.abs(yard.x - cell.x) + Math.abs(yard.y - cell.y) === 1;
}

/**
 * Obydlí, jak ho zná kontrola překryvu – na pozemku (`plot`), nebo volně (jen půdorys); řemeslná
 * dílna s řemeslem (`craft`).
 */
export interface PlacedDwelling {
  readonly type: DwellingType;
  readonly position: Position;
  readonly plot?: DwellingPlot;
  readonly craft?: Craft;
  readonly plainShape?: boolean;
}

/**
 * Co obydlí zabírá: celé políčko pozemku i s půdorysem domu (dům převedené starší polozemnice
 * může z políčka vyčnívat – `withPlots`), u volného obydlí (zemnice, starší polozemnice bez
 * pozemku) jen půdorys, u dílny půdorys s přístřeškem a milířem (crafts.md) – nic z toho se
 * nesmí překrývat.
 */
export function dwellingPlot(landscape: Landscape, d: PlacedDwelling): Point[][] {
  const shape = dwellingShape(d);
  if (d.craft) return workshopFootprints(d.craft, d.position, shape, d.type);
  const footprint = dwellingFootprint(d.type, d.position, shape);
  return d.plot
    ? [...plotShapes(landscape, d.plot).map((shape) => [...shape.corners]), footprint]
    : [footprint];
}

/** Obydlí vsi pro kontrolu překryvu (řemeslo dílny jako `craft`). */
export function placedDwelling(d: PlacementVillage['dwellings'][number]): PlacedDwelling {
  return {
    type: d.type,
    position: d.position,
    ...(d.plot ? { plot: d.plot } : {}),
    ...(d.workshop ? { craft: d.workshop.craft } : {}),
    ...(d.plainShape ? { plainShape: true } : {}),
  };
}

/**
 * Varianta pozemku podle toho, kde na políčku `cell` dům stojí: ta, jejíž poloha domu je nejblíž
 * (uprostřed, nebo v rohu, kam se dům zřetelně posunul). `snapped` = poloha domu přesunutá na
 * místo varianty (natočení zůstane), když je blíž než PLOT_SNAP_M, jinak null – dům zůstane.
 */
export function nearestPlotVariant(
  landscape: Landscape,
  cell: TileCell,
  position: Position,
): { variant: PlotVariant; snapped: Position | null } {
  let best: { variant: PlotVariant; distance: number; x: number; z: number } | null = null;
  for (const variant of PLOT_VARIANTS) {
    const at = plotHousePosition(landscape, { cell, variant });
    const distance = Math.hypot(at.x - position.x, at.z - position.z);
    if (!best || distance < best.distance - 1e-9) best = { variant, distance, x: at.x, z: at.z };
  }
  const chosen = best!;
  return {
    variant: chosen.variant,
    snapped:
      chosen.distance <= PLOT_SNAP_M
        ? { x: chosen.x, z: chosen.z, rotation: position.rotation }
        : null,
  };
}

/** Rohy políčka (čtverce pole) ve světě. */
export function cellCorners(landscape: Landscape, cell: TileCell): Point[] {
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  return rectangleCorners(center.x, center.z, landscape.cellSizeM, landscape.cellSizeM, 0);
}

export function cellIndex(landscape: Landscape, cell: TileCell): number {
  return cell.y * landscape.size + cell.x;
}

/** Políčka, jejichž vnitřek se překrývá s mnohoúhelníkem (dotyk hranou překryv není). */
export function cellsUnderPolygon(landscape: Landscape, polygon: readonly Point[]): number[] {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const toTile = (v: number): number =>
    Math.min(landscape.size - 1, Math.max(0, Math.floor((v + half) / landscape.cellSizeM)));
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const out: number[] = [];
  for (let y = toTile(Math.min(...zs)); y <= toTile(Math.max(...zs)); y++) {
    for (let x = toTile(Math.min(...xs)); x <= toTile(Math.max(...xs)); x++) {
      if (polygonsOverlap(cellCorners(landscape, { x, y }), polygon)) {
        out.push(cellIndex(landscape, { x, y }));
      }
    }
  }
  return out;
}

/** Rejstřík čtverců staveb vsi – staví se jednou pro tytéž seznamy staveb a krajinu. */
interface CachedLandIndex {
  landscape: Landscape;
  lists: readonly unknown[];
  /** Počty čtverců (díly, čtverce sadů a hřbitovů, ohrady, les) – pojistka proti změně na místě. */
  counts: string;
  index: PolygonIndex<LandSquare>;
}

/** Počty čtverců staveb vsi – změní se, když stavba čtverec přidá nebo ubere na místě. */
function squareCounts(village: PlacementVillage | null): string {
  if (!village) return '';
  const inner = (list: readonly { squares: readonly unknown[] }[] | undefined): string =>
    (list ?? []).map((item) => item.squares.length).join(',');
  return [
    village.parts.length,
    inner(village.orchards),
    inner(village.cemeteries),
    (village.pens ?? []).map((p) => 1 + (p.extraSquares?.length ?? 0)).join(','),
    village.woods?.length ?? 0,
    village.fields?.length ?? 0,
  ].join('|');
}
const landIndexCache = new WeakMap<object, CachedLandIndex>();
const NO_VILLAGE = {};

/**
 * Čtverce staveb vsi ve světě (díly polí, sady, hřbitovy, ohrady, les vsi – i natočené) v rejstříku
 * po políčkách (`PolygonIndex`). Kontrola umístění běží při každém pohybu kurzoru nad stejnou
 * vsí – rejstřík se pamatuje podle seznamů staveb.
 */
export function landIndex(
  landscape: Landscape,
  village: PlacementVillage | null,
): PolygonIndex<LandSquare> {
  const lists = village
    ? [
        village.fields,
        village.parts,
        village.orchards,
        village.cemeteries,
        village.pens,
        village.woods,
      ]
    : [];
  const key = village?.parts ?? NO_VILLAGE;
  const counts = squareCounts(village);
  const cached = landIndexCache.get(key);
  if (
    cached &&
    cached.landscape === landscape &&
    cached.counts === counts &&
    cached.lists.length === lists.length &&
    cached.lists.every((list, i) => list === lists[i])
  ) {
    return cached.index;
  }
  const index = new PolygonIndex(landscape, village ? villageLandSquares(landscape, village) : []);
  landIndexCache.set(key, { landscape, lists, counts, index });
  return index;
}

/** Čtverce staveb vsi, které tvar překrývá (dotyk hranou ne). */
export function squaresUnder(
  landscape: Landscape,
  village: PlacementVillage | null,
  shape: Shape,
): LandSquare[] {
  return landIndex(landscape, village).overlapping(shape.corners, shape.tile);
}

/**
 * Test bodu „pata překážky leží na čtverci stavby druhu `kinds`“ (políčko podle políčka bodu,
 * natočený čtverec podle mnohoúhelníku) – překážky tam patří té stavbě. Bez takových čtverců
 * null.
 */
export function ownedAt(
  landscape: Landscape,
  village: PlacementVillage | null,
  kinds: readonly LandSquare['kind'][],
): ((x: number, z: number) => boolean) | null {
  const index = landIndex(landscape, village);
  if (index.empty) return null;
  const wanted = new Set(kinds);
  return (x, z) => index.containing(x, z).some((s) => wanted.has(s.kind));
}

/**
 * Kde překážky na vyklízené ploše patří jiné stavbě: čtverce staveb druhu `kinds` a políčka hájů
 * `groveTiles` (index y × size + x).
 */
export function ownedLand(
  landscape: Landscape,
  village: PlacementVillage | null,
  kinds: readonly LandSquare['kind'][],
  groveTiles: readonly number[],
): (x: number, z: number, tile: number) => boolean {
  const owned = ownedAt(landscape, village, kinds);
  const groves = new Set(groveTiles);
  return (x, z, tile) => groves.has(tile) || (owned !== null && owned(x, z));
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený půdorys obydlí, včetně okrajů. */
export function footprintSamples(
  type: DwellingType,
  position: Position,
  shape: DwellingShape,
): Point[] {
  if (isPlainShape(shape)) {
    const { width, depth } = DWELLING_FOOTPRINT_M[type];
    return rectangleSamples(width, depth, position);
  }
  const { width, depth, centerZ } = shapedFootprint(type, shape);
  const [x, z] = buildingLocalToWorld(position, 0, centerZ);
  return rectangleSamples(width, depth, { x, z, rotation: position.rotation });
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený obdélník se středem v `position`. */
export function rectangleSamples(width: number, depth: number, position: Position): Point[] {
  const stepsX = Math.ceil(width / FOOTPRINT_SAMPLE_STEP_M);
  const stepsZ = Math.ceil(depth / FOOTPRINT_SAMPLE_STEP_M);
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  const samples: Point[] = [];
  for (let i = 0; i <= stepsX; i++) {
    for (let j = 0; j <= stepsZ; j++) {
      const lx = -width / 2 + (width * i) / stepsX;
      const lz = -depth / 2 + (depth * j) / stepsZ;
      samples.push([position.x + lx * cos + lz * sin, position.z - lx * sin + lz * cos]);
    }
  }
  return samples;
}

/**
 * Půdorys celý v krajině, ne ve vodě a dost rovný – na louce i v lese (les osadníci vyklučí –
 * `ForestUse`); bez `clearForest` jen na louce. `what` = co se staví (důvod česky – obydlí, nebo
 * milíř uhlíře).
 */
export function checkFootprintTerrain(
  landscape: Landscape,
  samples: readonly Point[],
  what: 'Obydlí' | 'Milíř' | 'Kostel' = 'Obydlí',
  clearForest = true,
): PlacementCheck {
  let lowest = Infinity;
  let highest = -Infinity;
  let offMeadow = false;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail(`${what} musí stát uvnitř krajiny sídla.`);
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail(`${what} nemůže stát ve vodě.`);
    if (surface !== 'meadow') offMeadow = true;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (offMeadow && !clearForest) return fail(`Roste tu les – ${what.toLowerCase()} sem nepatří.`);
  const difference = highest - lowest;
  if (difference > DWELLING_MAX_HEIGHT_DIFF_M) {
    return fail(
      `${what === 'Milíř' ? 'Pod milířem je země' : 'Země je tu'} příliš nerovná – rozdíl ` +
        `${formatNumber(difference, 1)} m, nejvýš ${formatNumber(DWELLING_MAX_HEIGHT_DIFF_M, 1)} m.`,
    );
  }
  return OK;
}

// --- branka obydlí ------------------------------------------------------------------------------

/** Krajina pod natočeným čtvercem (body vzorkování a rohy): mimo krajinu, voda, les. */
export interface SampledGround {
  /** Některý bod leží mimo krajinu sídla. */
  outside: boolean;
  /** Některý bod leží ve vodě – stavba nesmí zasahovat do vody. */
  water: boolean;
  /** Většina bodů leží v lese – povrch čtverce je les. */
  forest: boolean;
  /** Úrodnost – průměr políček pod body. */
  fertility: number;
}
