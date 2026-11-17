import {
  OBSTACLE_KINDS,
  SURFACE_CODES,
  obstacleIndex,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import { forestClearingsOf } from '../placement/placement-land';
import type { Point } from '../placement/polygon';
import {
  rotatedSquareCorners,
  rotationCosSin,
  rotationTurn,
  squareCenter,
} from '../placement/square-grid';
import { workshopKilns, kilnCircle } from '../crafts/charcoal';
import { fortificationBand, type BandFortification } from '../fortification/band';
import { CLEARED_SHARE, KILN_SITE, MILIR } from '../rules';
import type {
  Craft,
  DwellingPlot,
  DwellingType,
  Position,
  SacredBuildingKind,
  TileCell,
  VillageState,
} from '../types';
import { obstacleChangesAt, type ObstacleChanges } from './obstacles';
import { partStage } from './summary';

// Vymýcený les v jádru (fields.md – Krajina sídla a scéna, forest.md – Les ustupuje, Hustý les):
// maska po políčkách krajiny z odstraněných, pokácených a dorůstajících stromů, založených dílů
// polí a pasek pod stavbami. Počítá ho scéna a minimapa (apps/web/lib/scene/cleared-forest.ts)
// i hledání cesty vojska (war/dense-forest.ts) – ze stejných funkcí.

/** Vymýcený les po políčkách krajiny. */
export interface ClearedForest {
  readonly size: number;
  readonly cellSizeM: number;
  /** Podíl vykácených dospělých stromů v políčku lesa 0–1 (index y × size + x); jinde 0. */
  readonly share: Float32Array;
  /** 1 = vymýcené políčko lesa (podíl aspoň CLEARED_SHARE, nebo založený díl pole). */
  readonly mask: Uint8Array;
  /** Vymýcená políčka vzestupně. */
  readonly tiles: readonly number[];
  /**
   * Paseky pod stavbami v lese menší než políčko (konvexní mnohoúhelníky ve světě, m) – plocha
   * korun zapadne nad nimi stejně jako nad vymýceným políčkem.
   */
  readonly areas: readonly (readonly Point[])[];
}

const TREE_KIND = OBSTACLE_KINDS.indexOf('tree');

/** Dospělé stromy (i vnitřek lesa – impostory) po políčkách – jednou na vrstvu. */
const treesPerTileCache = new WeakMap<ObstacleLayer, Uint16Array>();

function treesPerTile(layer: ObstacleLayer): Uint16Array {
  const cached = treesPerTileCache.get(layer);
  if (cached) return cached;
  const counts = new Uint16Array(layer.size * layer.size);
  for (let tile = 0; tile < counts.length; tile++) {
    for (let k = layer.tileStart[tile]!; k < layer.tileStart[tile + 1]!; k++) {
      if (layer.kind[layer.tileItems[k]!] === TREE_KIND) counts[tile] = counts[tile]! + 1;
    }
  }
  treesPerTileCache.set(layer, counts);
  return counts;
}

/** Políčko vrstvy, ve kterém leží pata překážky. */
function tileOf(layer: ObstacleLayer, index: number): number {
  const half = (layer.size * layer.cellSizeM) / 2;
  const at = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  return at(layer.z[index]!) * layer.size + at(layer.x[index]!);
}

/**
 * Vymýcený les vsi: v každém políčku lesa podíl dospělých stromů, které ves odstranila,
 * pokácela (pařez) nebo které teprve dorůstají z náletu; políčka `clearedSquares` (založené díly
 * polí) jsou vymýcená celá. Stromy, které už dorostly, mezi změnami nejsou – les se vrátí.
 */
export function clearedForest(
  l: Landscape,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  clearedSquares: readonly TileCell[] = [],
  areas: readonly (readonly Point[])[] = [],
): ClearedForest {
  const n = l.size * l.size;
  const trees = treesPerTile(layer);
  const gone = new Uint16Array(n);
  for (const list of [changes.removed, changes.stumps, changes.saplings]) {
    for (const id of list) {
      const index = obstacleIndex(layer, id);
      if (index < 0 || layer.kind[index] !== TREE_KIND) continue;
      const tile = tileOf(layer, index);
      gone[tile] = gone[tile]! + 1;
    }
  }
  const share = new Float32Array(n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (l.surface[i] !== SURFACE_CODES.forest || trees[i] === 0) continue;
    share[i] = Math.min(1, gone[i]! / trees[i]!);
    if (share[i]! >= CLEARED_SHARE) mask[i] = 1;
  }
  for (const { x, y } of clearedSquares) {
    if (x < 0 || y < 0 || x >= l.size || y >= l.size) continue;
    const i = y * l.size + x;
    if (l.surface[i] !== SURFACE_CODES.forest) continue;
    share[i] = 1;
    mask[i] = 1;
  }
  const tiles: number[] = [];
  for (let i = 0; i < n; i++) if (mask[i]) tiles.push(i);
  const inForest = areas.filter((area) => touchesForest(l, area));
  return { size: l.size, cellSizeM: l.cellSizeM, share, mask, tiles, areas: inForest };
}

/** Zasahuje mnohoúhelník (obdélníkem kolem něj) do políčka lesa krajiny? */
export function touchesForest(l: Landscape, polygon: readonly Point[]): boolean {
  const half = (l.size * l.cellSizeM) / 2;
  const at = (v: number): number =>
    Math.min(l.size - 1, Math.max(0, Math.floor((v + half) / l.cellSizeM)));
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  for (let y = at(Math.min(...zs)); y <= at(Math.max(...zs)); y++) {
    for (let x = at(Math.min(...xs)); x <= at(Math.max(...xs)); x++) {
      if (l.surface[y * l.size + x] === SURFACE_CODES.forest) return true;
    }
  }
  return false;
}

/** Je čtverec natočený mimo osy krajiny (ne o násobek 90°)? Bez údaje ne. */
export function turnedSquare(rotation: number | undefined): boolean {
  if (rotation === undefined) return false;
  const turn = rotationTurn(rotation);
  return turn === null || turn % 24 !== 0;
}

/** Čtverec pole (střed ve světě, strana, natočení) a stadium – vstup `clearedForestOf`. */
export interface ClearingPart {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  /** Natočení čtverce natočeného pole (rad); bez údaje políčko krajiny. */
  rotation?: number;
  /** Díl, který se teprve zakládá, má stromy ještě na sobě. */
  founding: boolean;
}

/** Obydlí nebo dílna (i rozestavěná) pro paseku. */
export interface ClearingDwelling {
  type: DwellingType;
  position: Position;
  craft?: Craft;
  plainShape?: true;
  /**
   * Obydlí s pozemkem: jen natočený čtverec pozemku (jinak pozemek pasekou není – leží na dílu
   * pole nebo na louce); bez údaje obydlí bez pozemku.
   */
  plot?: { x: number; z: number; size: number; rotation?: number } | null;
}

/**
 * Všechno, z čeho se skládá vymýcený les vsi – jádro ho skládá ze `VillageState`
 * (`villageClearings`), scéna z pohledu na ves (`villageClearedForest`), takže oba dávají totéž.
 */
export interface ClearingSources {
  obstacles: ObstacleChanges;
  parts: readonly ClearingPart[];
  dwellings: readonly ClearingDwelling[];
  sacred: readonly { kind: SacredBuildingKind; position: Position }[];
  /** Milíře a milířiště (střed ve světě). */
  kilns: readonly { x: number; z: number }[];
  /** Opevnění vsi – pás každého úseku je paseka (stromy v něm padnou už se zahájením stavby). */
  fortifications: readonly BandFortification[];
}

/**
 * Vymýcený les vsi ze všech zdrojů (fields.md – Krajina sídla a scéna): odstraněné a pokácené
 * stromy, založené díly polí (natočené: políčka, jejichž střed leží na dílu), paseky pod
 * stavbami v lese – vyklízené plochy obydlí a dílen i s pruhem pod korunami (i rozestavěných),
 * natočené pozemky, půdorysy model a svatyní s pruhem, milířiště s pruhem pod korunami a pás
 * opevnění – každého úseku, i rozestavěného či zbořeného, v šířce stojícího úseku
 * (`fortificationBand` celého obvodu): stromy v pásu se kácí už se zahájením stavby
 * (`startFortification`), takže pás je paseka a hustý les u něj končí (plán
 * 2026-11-16-dense-forest – Rozhodnutí 1, paseky pod stavbami v lese; návrh Clauda).
 */
export function clearedForestOf(
  l: Landscape,
  layer: ObstacleLayer,
  sources: ClearingSources,
): ClearedForest {
  const half = (l.size * l.cellSizeM) / 2;
  const squares = sources.parts.flatMap((part): TileCell[] => {
    if (part.founding) return [];
    if (!turnedSquare(part.rotation)) return [part.cell];
    // natočený díl (fields.md – Natočené stavby): políčka, jejichž střed na dílu leží
    const [c, s] = rotationCosSin(part.rotation!);
    const reach = Math.ceil(part.size / l.cellSizeM);
    const tx = Math.floor((part.x + half) / l.cellSizeM);
    const ty = Math.floor((part.z + half) / l.cellSizeM);
    const cells: TileCell[] = [];
    for (let y = ty - reach; y <= ty + reach; y++) {
      for (let x = tx - reach; x <= tx + reach; x++) {
        const dx = -half + (x + 0.5) * l.cellSizeM - part.x;
        const dz = -half + (y + 0.5) * l.cellSizeM - part.z;
        const h = part.size / 2;
        if (Math.abs(dx * c - dz * s) <= h && Math.abs(dx * s + dz * c) <= h) cells.push({ x, y });
      }
    }
    return cells;
  });
  const radius = MILIR.footprintM / 2 + KILN_SITE.clearAroundM;
  const areas: (readonly Point[])[] = [
    ...sources.dwellings.flatMap((d): (readonly Point[])[] =>
      d.plot
        ? turnedSquare(d.plot.rotation)
          ? [rotatedSquareCorners(d.plot.x, d.plot.z, d.plot.size, d.plot.rotation!)]
          : []
        : forestClearingsOf({
            type: d.type,
            position: d.position,
            ...(d.craft ? { craft: d.craft } : {}),
            ...(d.plainShape ? { plainShape: true as const } : {}),
          }),
    ),
    ...sources.sacred.flatMap((b) => forestClearingsOf({ sacred: b.kind, position: b.position })),
    ...sources.kilns.map((k) => kilnCircle(k, radius)),
    ...sources.fortifications.flatMap((f) => fortificationBand(l, f, true)),
  ];
  return clearedForest(l, layer, sources.obstacles, squares, areas);
}

/**
 * Vymýcený les ze stavu vsi k `day` – zdroje ze `VillageState` (díly polí, obydlí a rozestavěná
 * obydlí, modly a svatyně i rozestavěné, milíře a milířiště, opevnění) a `clearedForestOf`.
 */
export function villageClearings(
  l: Landscape,
  layer: ObstacleLayer,
  village: VillageState,
  day: number,
): ClearedForest {
  const parts: ClearingPart[] = [];
  for (const field of village.fields) {
    for (const part of village.parts) {
      if (part.fieldId !== field.id || part.cell === undefined) continue;
      const center = squareCenter(l, field.grid, part.cell);
      parts.push({
        cell: part.cell,
        x: center.x,
        z: center.z,
        size: l.cellSizeM,
        ...(field.grid ? { rotation: field.grid.rotation } : {}),
        founding: partStage(part, day) === 'founding',
      });
    }
  }
  const plotOf = (plot: DwellingPlot | undefined): ClearingDwelling['plot'] =>
    plot
      ? plot.square && !plot.yard
        ? { x: plot.square.x, z: plot.square.z, size: l.cellSizeM, rotation: plot.square.rotation }
        : { x: 0, z: 0, size: l.cellSizeM }
      : null;
  const dwellings: ClearingDwelling[] = [
    ...village.dwellings.map((d) => ({
      type: d.type,
      position: d.position,
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      ...(d.plainShape ? { plainShape: true as const } : {}),
      plot: plotOf(d.plot),
    })),
    ...village.constructions.flatMap((c): ClearingDwelling[] =>
      (c.kind === 'dwelling' || c.kind === 'rebuild') && c.dwellingType !== null && c.position
        ? [
            {
              type: c.dwellingType,
              position: c.position,
              ...(c.craft ? { craft: c.craft } : {}),
              ...(c.plainShape ? { plainShape: true as const } : {}),
              plot: plotOf(c.plot),
            },
          ]
        : [],
    ),
  ];
  const sacred = [
    ...(village.sacredBuildings ?? []).map((b) => ({ kind: b.kind, position: b.position })),
    ...village.constructions.flatMap((c) =>
      (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
        ? [{ kind: c.kind, position: c.position }]
        : [],
    ),
  ];
  const kilns = [
    ...village.dwellings.flatMap((d) =>
      workshopKilns(d.workshop).flatMap((k) => (k.site && k.id !== undefined ? [k.site] : [])),
    ),
    ...(village.kilnRemnants ?? []),
  ];
  return clearedForestOf(l, layer, {
    obstacles: obstacleChangesAt(village, day),
    parts,
    dwellings,
    sacred,
    kilns,
    fortifications: village.fortifications ?? [],
  });
}
