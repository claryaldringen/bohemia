import { heightAtWorld, surfaceAt, tileOfWorldPoint, type Landscape } from '../landscape';
import type { PartInput } from './actions';
import { partFoundingCost } from './fields';
import {
  clipToRect,
  isSimplePolygon,
  normalizeOutline,
  polygonArea,
  polygonsOverlap,
  rectangleCorners,
  type Point,
} from './polygon';
import { DWELLING_FOOTPRINT_M, DWELLING_MAX_HEIGHT_DIFF_M, FIELD_LIMITS } from './rules';
import type { DwellingType, Position, TileCell } from './types';

// Umisťování obydlí a polí (population.md – Umístění obydlí, fields.md – Založení pole).
// Čisté funkce pro server i klienta (náhled při umisťování). Souřadnice = svět scény v metrech.

/** Výsledek kontroly umístění; důvod je česky pro hráče. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
}

/** Co z vsi potřebuje kontrola překryvu – VillageState ji splňuje, klient ji složí ze scény. */
export interface PlacementVillage {
  readonly dwellings: readonly { readonly type: DwellingType; readonly position: Position }[];
  readonly constructions: readonly {
    readonly dwellingType: DwellingType | null;
    readonly position: Position | null;
  }[];
  readonly fields: readonly { readonly outline: readonly Point[] }[];
}

/** Náhled pole z obrysu – díly pro `foundField` / `foundVillage` a souhrn pro hráče. */
export interface FieldPreview {
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  check: PlacementCheck;
}

/** Nejvíc bodů obrysu pole (ochrana serveru před obřím vstupem). */
export const MAX_OUTLINE_POINTS = 100;
/** Krok vzorkování půdorysu obydlí (m) – výšky a povrch políček pod ním. */
const FOOTPRINT_SAMPLE_STEP_M = 0.5;
/** Menší útržek obrysu v políčku (m²) se nepočítá jako díl. */
const MIN_PART_AREA_M2 = 1;
const M2_PER_HA = 10_000;

const OK: PlacementCheck = { ok: true, reason: null };

function fail(reason: string): PlacementCheck {
  return { ok: false, reason };
}

/** Číslo s desetinnou čárkou. */
function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Rohy půdorysu obydlí ve světě. */
export function dwellingFootprint(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  return rectangleCorners(position.x, position.z, width, depth, position.rotation);
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený půdorys, včetně okrajů. */
function footprintSamples(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
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

/** Půdorys celý v krajině, ne ve vodě, jen na louce a dost rovný. */
function checkFootprintTerrain(landscape: Landscape, samples: readonly Point[]): PlacementCheck {
  let lowest = Infinity;
  let highest = -Infinity;
  let offMeadow = false;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail('Obydlí musí stát uvnitř krajiny sídla.');
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail('Obydlí nemůže stát ve vodě.');
    if (surface !== 'meadow') offMeadow = true;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (offMeadow) return fail('Obydlí jde zatím stavět jen na louce.');
  const difference = highest - lowest;
  if (difference > DWELLING_MAX_HEIGHT_DIFF_M) {
    return fail(
      `Země je tu příliš nerovná – rozdíl ${formatNumber(difference, 1)} m, ` +
        `nejvýš ${formatNumber(DWELLING_MAX_HEIGHT_DIFF_M, 1)} m.`,
    );
  }
  return OK;
}

/** Půdorys se nepřekrývá s obydlím, rozestavěným obydlím ani polem. */
function checkFootprintFree(village: PlacementVillage | null, footprint: Point[]): PlacementCheck {
  if (village === null) return OK;
  for (const d of village.dwellings) {
    if (polygonsOverlap(footprint, dwellingFootprint(d.type, d.position))) {
      return fail('Překrývá se s jiným obydlím.');
    }
  }
  for (const c of village.constructions) {
    if (c.dwellingType === null || c.position === null) continue;
    if (polygonsOverlap(footprint, dwellingFootprint(c.dwellingType, c.position))) {
      return fail('Překrývá se s rozestavěným obydlím.');
    }
  }
  if (village.fields.some((f) => polygonsOverlap(footprint, f.outline))) {
    return fail('Překrývá se s polem.');
  }
  return OK;
}

/**
 * Smí obydlí stát na místě? Rozdíl výšek pod půdorysem nejvýš 0,5 m, všechna políčka pod ním
 * louka (ne voda, zatím ani les), žádný překryv s obydlími, rozestavěnými obydlími a poli.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
): PlacementCheck {
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return fail('Neplatná poloha obydlí.');
  }
  const terrain = checkFootprintTerrain(landscape, footprintSamples(type, position));
  if (!terrain.ok) return terrain;
  return checkFootprintFree(village, dwellingFootprint(type, position));
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
export function villageDwellingPositions(village: PlacementVillage | null): Position[] {
  if (village === null) return [];
  const built = village.dwellings.map((d) => d.position);
  const planned = village.constructions.flatMap((c) =>
    c.dwellingType !== null && c.position !== null ? [c.position] : [],
  );
  return [...built, ...planned];
}

/** Obrys je mnohoúhelník rozumné velikosti uvnitř krajiny. */
function checkOutlineShape(landscape: Landscape, points: readonly Point[]): PlacementCheck {
  if (!points.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))) {
    return fail('Neplatné souřadnice obrysu pole.');
  }
  if (points.length < 3) return fail('Obrys pole potřebuje aspoň 3 body.');
  if (points.length > MAX_OUTLINE_POINTS) {
    return fail(`Obrys pole může mít nejvýš ${MAX_OUTLINE_POINTS} bodů.`);
  }
  if (!isSimplePolygon(points)) return fail('Obrys pole se nesmí křížit.');
  if (points.some(([x, z]) => tileOfWorldPoint(landscape, x, z) === null)) {
    return fail('Pole musí ležet uvnitř krajiny sídla.');
  }
  return OK;
}

interface CellPiece {
  cell: TileCell;
  areaM2: number;
}

/** Průnik obrysu s políčky krajiny po řádcích (y, pak x); útržky pod 1 m² se zahodí. */
function clipToCells(landscape: Landscape, points: readonly Point[]): CellPiece[] {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const cell = landscape.cellSizeM;
  const toTile = (v: number): number =>
    Math.min(landscape.size - 1, Math.max(0, Math.floor((v + half) / cell)));
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const pieces: CellPiece[] = [];
  for (let y = toTile(Math.min(...zs)); y <= toTile(Math.max(...zs)); y++) {
    for (let x = toTile(Math.min(...xs)); x <= toTile(Math.max(...xs)); x++) {
      const minX = -half + x * cell;
      const minZ = -half + y * cell;
      const areaM2 = polygonArea(clipToRect(points, minX, minZ, minX + cell, minZ + cell));
      if (areaM2 >= MIN_PART_AREA_M2) pieces.push({ cell: { x, y }, areaM2 });
    }
  }
  return pieces;
}

/** Vzdálenost středu políčka k nejbližšímu obydlí (bez obydlí nekonečno). */
function distanceToNearest(landscape: Landscape, cell: TileCell, positions: Position[]): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const cx = -half + (cell.x + 0.5) * landscape.cellSizeM;
  const cz = -half + (cell.y + 0.5) * landscape.cellSizeM;
  return positions.reduce((best, p) => Math.min(best, Math.hypot(p.x - cx, p.z - cz)), Infinity);
}

/** Díly pole z kusů na louce: přirozená úrodnost z krajiny, zatím bez překážek. */
function meadowParts(
  landscape: Landscape,
  pieces: CellPiece[],
  dwellingPositions: Position[],
): PartInput[] {
  return pieces
    .filter((p) => surfaceAt(landscape, p.cell.x, p.cell.y) === 'meadow')
    .map((p) => ({
      areaM2: p.areaM2,
      distanceM: distanceToNearest(landscape, p.cell, dwellingPositions),
      naturalFertility: landscape.fertility[p.cell.y * landscape.size + p.cell.x]!,
      surface: 'meadow',
      obstacleCost: 0,
      cell: p.cell,
    }));
}

/** Obrys se nepřekrývá s obydlími (i plánovanými – ty jako zemnice) ani s jinými poli. */
function checkFieldFree(
  village: PlacementVillage | null,
  outline: readonly Point[],
  dwellingPositions: Position[],
): PlacementCheck {
  const footprints = [
    ...(village?.dwellings.map((d) => dwellingFootprint(d.type, d.position)) ?? []),
    ...(village?.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null
        ? [dwellingFootprint(c.dwellingType, c.position)]
        : [],
    ) ?? []),
    // plánované obydlí bez typu (první obydlí vsi) je zemnice
    ...dwellingPositions.map((p) => dwellingFootprint('zemnice', p)),
  ];
  if (footprints.some((f) => polygonsOverlap(outline, f))) {
    return fail('Pole se překrývá s obydlím.');
  }
  if (village?.fields.some((f) => polygonsOverlap(outline, f.outline))) {
    return fail('Pole se překrývá s jiným polem.');
  }
  return OK;
}

/** Výměra a vzdálenost dílů podle FIELD_LIMITS. */
function checkFieldLimits(parts: PartInput[], areaM2: number): PlacementCheck {
  if (areaM2 < FIELD_LIMITS.minAreaM2) {
    return fail(
      `Pole musí mít aspoň ${formatNumber(FIELD_LIMITS.minAreaM2 / M2_PER_HA, 1)} ha louky ` +
        `(teď ${formatNumber(areaM2 / M2_PER_HA, 2)} ha).`,
    );
  }
  if (parts.some((p) => p.distanceM > FIELD_LIMITS.maxDistanceM)) {
    return fail(`Pole je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`);
  }
  return OK;
}

const EMPTY_PREVIEW = { parts: [], areaM2: 0, averageFertility: 0, foundingCost: 0 } as const;

/**
 * Pole z obrysu: průnik s políčky krajiny (15 m), díly jen na louce (les se zatím zahodí).
 * Vzdálenost dílu = od středu políčka k nejbližšímu z `dwellingPositions`. Kontrola: platný
 * jednoduchý obrys v krajině, nezasahuje do vody, nepřekrývá obydlí ani jiná pole, aspoň
 * 0,1 ha louky, žádný díl dál než 800 m. Náhled (díly, výměra…) se počítá i při neúspěchu
 * kontroly – kromě neplatného tvaru obrysu.
 */
export function fieldPartsFromOutline(
  landscape: Landscape,
  village: PlacementVillage | null,
  outline: readonly Point[],
  dwellingPositions: Position[],
): FieldPreview {
  const points = normalizeOutline(outline);
  const shape = checkOutlineShape(landscape, points);
  if (!shape.ok) return { ...EMPTY_PREVIEW, parts: [], check: shape };

  const pieces = clipToCells(landscape, points);
  const parts = meadowParts(landscape, pieces, dwellingPositions);
  const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const averageFertility =
    areaM2 > 0 ? parts.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2 : 0;
  const foundingCost = parts.reduce(
    (sum, p) => sum + partFoundingCost(p.surface, p.areaM2, p.obstacleCost),
    0,
  );
  const inWater = pieces.some((p) => surfaceAt(landscape, p.cell.x, p.cell.y) === 'water');
  const checks = [
    () => (inWater ? fail('Pole nesmí zasahovat do vody.') : OK),
    () => checkFieldFree(village, points, dwellingPositions),
    () => checkFieldLimits(parts, areaM2),
  ];
  let check = OK;
  for (const run of checks) {
    check = run();
    if (!check.ok) break;
  }
  return { parts, areaM2, averageFertility, foundingCost, check };
}
