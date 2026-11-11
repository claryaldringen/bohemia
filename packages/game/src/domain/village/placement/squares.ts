import { pointInPolygon, polygonsOverlap, type Point } from './polygon';
import {
  squareCorners,
  squareCenter,
  squareTile,
  tilesAround,
  type GridGeometry,
} from './square-grid';
import type { SquareGrid, TileCell } from '../types';

// Čtverce staveb vsi ve světě (fields.md – Natočené stavby): díly polí, čtverce sadů, hřbitovů,
// ohrady a les vsi – každý se svou mřížkou (natočené stavby vlastní, ostatní mřížku krajiny).
// Kontroly umístění, zbytky jam, louky na seno a stromy u cest se ptají, co kde stojí, přes
// rejstřík po políčkách krajiny (`PolygonIndex`) – u dvou čtverců v mřížce krajiny rozhodne
// rovnost políček (jako dřív), jinak přesný překryv mnohoúhelníků.

/** Druh stavby po čtvercích. */
export type SquareKind = 'field' | 'orchard' | 'cemetery' | 'pen' | 'wood';

/** Čtverec stavby vsi ve světě. */
export interface LandSquare {
  readonly kind: SquareKind;
  /** Pole (id), sad (id, bez id pořadí), hřbitov (id, bez id pořadí), ohrada a les (pořadí). */
  readonly owner: number;
  /** Čtverec v mřížce stavby (`grid`; bez ní políčko krajiny). */
  readonly cell: TileCell;
  readonly grid?: SquareGrid;
  readonly corners: Point[];
  readonly center: { x: number; z: number };
  /** Políčko krajiny, které čtverec přesně zabírá (index y × size + x); natočený null. */
  readonly tile: number | null;
  /** Plocha dílu nebo čtverce sadu (m²); bez údaje celé políčko. */
  readonly areaM2?: number;
  /** Id dílu pole. */
  readonly partId?: number;
}

/** Co z vsi potřebují čtverce staveb – VillageState i ves pro kontrolu umístění ji splňují. */
export interface SquaresVillage {
  readonly fields?: readonly { readonly id: number; readonly grid?: SquareGrid }[];
  readonly parts: readonly {
    readonly id?: number;
    readonly cell?: TileCell;
    readonly fieldId?: number;
    readonly areaM2?: number;
  }[];
  readonly orchards?: readonly {
    readonly id?: number;
    readonly grid?: SquareGrid;
    readonly squares: readonly { readonly cell: TileCell; readonly areaM2?: number }[];
  }[];
  readonly cemeteries?: readonly {
    readonly id?: number;
    readonly grid?: SquareGrid;
    readonly squares: readonly { readonly cell: TileCell }[];
  }[];
  readonly pens?: readonly {
    readonly cell: TileCell;
    readonly grid?: SquareGrid;
    /** Další čtverce ohrady (oxen.md – Ohrady podle druhu). */
    readonly extraSquares?: readonly { readonly cell: TileCell }[];
  }[];
  readonly woods?: readonly { readonly cell: TileCell; readonly grid?: SquareGrid }[];
}

/** Mřížky polí podle id (pole bez mřížky v mapě nejsou). */
export function fieldGrids(
  village: Pick<SquaresVillage, 'fields'>,
): ReadonlyMap<number, SquareGrid> {
  const grids = new Map<number, SquareGrid>();
  for (const f of village.fields ?? []) if (f.grid) grids.set(f.id, f.grid);
  return grids;
}

/** Mřížka pole `fieldId` (pole bez mřížky i neznámé pole – mřížka krajiny). */
export function fieldGridOf(
  village: Pick<SquaresVillage, 'fields'>,
  fieldId: number,
): SquareGrid | undefined {
  return village.fields?.find((f) => f.id === fieldId)?.grid;
}

/** Čtverec stavby ve světě. */
export function landSquare(
  geo: GridGeometry,
  kind: SquareKind,
  owner: number,
  grid: SquareGrid | undefined,
  cell: TileCell,
  extra: { areaM2?: number; partId?: number } = {},
): LandSquare {
  return {
    kind,
    owner,
    cell,
    ...(grid ? { grid } : {}),
    corners: squareCorners(geo, grid, cell),
    center: squareCenter(geo, grid, cell),
    tile: squareTile(geo, grid, cell),
    ...(extra.areaM2 !== undefined ? { areaM2: extra.areaM2 } : {}),
    ...(extra.partId !== undefined ? { partId: extra.partId } : {}),
  };
}

/** Čtverce, které ves zabírá – díly polí (s políčkem), sady, hřbitovy, ohrady a les vsi. */
export function villageLandSquares(
  geo: GridGeometry,
  village: SquaresVillage,
  kinds: readonly SquareKind[] = ['field', 'orchard', 'cemetery', 'pen', 'wood'],
): LandSquare[] {
  const want = new Set(kinds);
  const out: LandSquare[] = [];
  if (want.has('field')) {
    const grids = fieldGrids(village);
    for (const part of village.parts) {
      if (!part.cell) continue;
      const grid = part.fieldId === undefined ? undefined : grids.get(part.fieldId);
      out.push(
        landSquare(geo, 'field', part.fieldId ?? -1, grid, part.cell, {
          ...(part.areaM2 !== undefined ? { areaM2: part.areaM2 } : {}),
          ...(part.id !== undefined ? { partId: part.id } : {}),
        }),
      );
    }
  }
  if (want.has('orchard')) {
    (village.orchards ?? []).forEach((o, index) => {
      for (const s of o.squares) {
        out.push(
          landSquare(geo, 'orchard', o.id ?? index, o.grid, s.cell, {
            ...(s.areaM2 !== undefined ? { areaM2: s.areaM2 } : {}),
          }),
        );
      }
    });
  }
  if (want.has('cemetery')) {
    (village.cemeteries ?? []).forEach((c, index) => {
      for (const s of c.squares)
        out.push(landSquare(geo, 'cemetery', c.id ?? index, c.grid, s.cell));
    });
  }
  if (want.has('pen')) {
    (village.pens ?? []).forEach((p, index) => {
      out.push(landSquare(geo, 'pen', index, p.grid, p.cell));
      for (const q of p.extraSquares ?? []) out.push(landSquare(geo, 'pen', index, p.grid, q.cell));
    });
  }
  if (want.has('wood')) {
    (village.woods ?? []).forEach((w, index) => {
      out.push(landSquare(geo, 'wood', index, w.grid, w.cell));
    });
  }
  return out;
}

/** Položka rejstříku – mnohoúhelník a políčko krajiny, které přesně zabírá (nebo null). */
export interface Placed {
  readonly corners: readonly Point[];
  readonly tile: number | null;
}

/**
 * Rejstřík mnohoúhelníků po políčkách krajiny: položka je v políčku, které přesně zabírá, jinak
 * ve všech políčkách pod svým obdélníkem. Dotaz projde jen políčka pod dotazem.
 */
export class PolygonIndex<T extends Placed> {
  private readonly buckets = new Map<number, T[]>();

  constructor(
    private readonly geo: GridGeometry,
    items: readonly T[],
  ) {
    for (const item of items) {
      for (const tile of item.tile !== null ? [item.tile] : tilesAround(geo, item.corners)) {
        const list = this.buckets.get(tile);
        if (list) list.push(item);
        else this.buckets.set(tile, [item]);
      }
    }
  }

  /** Je rejstřík prázdný? */
  get empty(): boolean {
    return this.buckets.size === 0;
  }

  /**
   * Položky, jejichž vnitřek se překrývá s mnohoúhelníkem (dotyk hranou ani rohem překryv není).
   * `tile` – políčko krajiny, které dotaz přesně zabírá: s položkou na políčku rozhodne rovnost
   * políček (bit po bitu jako dřívější kontroly po políčkách).
   */
  overlapping(polygon: readonly Point[], tile: number | null = null): T[] {
    if (this.buckets.size === 0) return [];
    const seen = new Set<T>();
    const out: T[] = [];
    for (const t of tile !== null ? [tile] : tilesAround(this.geo, polygon)) {
      for (const item of this.buckets.get(t) ?? []) {
        if (seen.has(item)) continue;
        seen.add(item);
        const hit =
          tile !== null && item.tile !== null
            ? item.tile === tile
            : polygonsOverlap(polygon, item.corners);
        if (hit) out.push(item);
      }
    }
    return out;
  }

  /**
   * Položky, ve kterých leží bod (x, z) – položka na políčku podle políčka bodu (jako
   * `obstaclesInTile` vrstvy), natočená podle mnohoúhelníku (bod na hraně uvnitř není).
   */
  containing(x: number, z: number): T[] {
    if (this.buckets.size === 0) return [];
    const half = (this.geo.size * this.geo.cellSizeM) / 2;
    const toTile = (v: number): number =>
      Math.min(this.geo.size - 1, Math.max(0, Math.floor((v + half) / this.geo.cellSizeM)));
    const tile = toTile(z) * this.geo.size + toTile(x);
    return (this.buckets.get(tile) ?? []).filter((item) =>
      item.tile !== null ? item.tile === tile : pointInPolygon([x, z], item.corners),
    );
  }
}

/**
 * Políčka krajiny (indexy, vzestupně), jejichž vnitřek se překrývá s mnohoúhelníkem – políčko,
 * které mnohoúhelník přesně zabírá (`tile`), je jen ono samo.
 */
export function tilesUnder(
  geo: GridGeometry,
  polygon: readonly Point[],
  tile: number | null = null,
): number[] {
  if (tile !== null) return [tile];
  return tilesAround(geo, polygon).filter((index) => {
    const cell = { x: index % geo.size, y: Math.floor(index / geo.size) };
    return polygonsOverlap(squareCorners(geo, undefined, cell), polygon);
  });
}
