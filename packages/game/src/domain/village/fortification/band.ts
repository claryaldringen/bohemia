import type { Point } from '../polygon';
import type { GridGeometry } from '../square-grid';
import type { FortKind, SquareGrid, TileCell } from '../types';
import { fortificationArea, fortificationOutline, type FortOutline } from './outline';

// Pás opevnění jako mnohoúhelníky (fortifications.md – Obvod: pás leží uvnitř plochy podél
// okraje) – podklad kontroly umístění (přes co pás smí), zabrané půdy valu a překážek v pásu.
// Pás každé strany okrajového čtverce je obdélník strana × šířka pásu dovnitř plochy; u vnitřního
// rohu (tvar L) přibude čtverec šířky pásu v rohu, kam pás obou stran nedosáhne (návrh Clauda).
// Obdélník u vnějšího rohu zahrne i špičku za obloukem – kontrola je tím o kus přísnější, ne
// volnější. Deterministická vrstva – jen sčítání a násobení.

/** Obdélník pásu strany obvodu `index` (podle `outline.sides`) – i s rohem uvnitř tvaru L. */
export interface FortBandPiece {
  /** Strana obvodu (`FortSide` / `FortSegmentShape.index`). */
  index: number;
  corners: Point[];
}

/** Pás opevnění po stranách obvodu – obdélník strany a u vnitřního rohu na konci strany i roh. */
export function fortBandPieces(outline: FortOutline): FortBandPiece[] {
  const size = outline.area.geo.cellSizeM;
  const band = Math.min(outline.bandM, size);
  const pieces: FortBandPiece[] = [];
  outline.sides.forEach((s, index) => {
    // plocha leží vpravo od směru obvodu (po směru hodin) – vpravo = směr otočený o −90°
    const rx = s.dz;
    const rz = -s.dx;
    const ax = s.x;
    const az = s.z;
    const bx = s.x + s.dx * size;
    const bz = s.z + s.dz * size;
    pieces.push({
      index,
      corners: [
        [ax, az],
        [bx, bz],
        [bx + rx * band, bz + rz * band],
        [ax + rx * band, az + rz * band],
      ],
    });
    if (s.end === 'inner') {
      // vnitřní roh: pás pokračuje za koncem strany do sousedního čtverce plochy
      pieces.push({
        index,
        corners: [
          [bx, bz],
          [bx + s.dx * band, bz + s.dz * band],
          [bx + s.dx * band + rx * band, bz + s.dz * band + rz * band],
          [bx + rx * band, bz + rz * band],
        ],
      });
    }
  });
  return pieces;
}

/** Mnohoúhelníky celého pásu (bez rozlišení stran). */
export function fortBandPolygons(outline: FortOutline): Point[][] {
  return fortBandPieces(outline).map((p) => p.corners);
}

/** Co pás stojícího opevnění potřebuje znát (`Fortification` ze stavu vsi i z pohledu na ves). */
export interface BandFortification {
  readonly grid: SquareGrid | null;
  readonly cells: readonly TileCell[];
  readonly kind: FortKind;
  readonly segments: readonly { readonly index: number; readonly builtDay: number | null }[];
}

/**
 * Pás opevnění, který zabírá místo jiným stavbám: hotové úseky, a dokud se opevnění staví
 * (`building`), celý obvod – nedostavěný úsek po zrušení stavby je mezera (fortifications.md –
 * Cena a stavba).
 */
export function fortificationBand(
  geo: GridGeometry,
  fort: BandFortification,
  building: boolean,
): Point[][] {
  const area = fortificationArea(fort.cells, fort.grid, geo);
  if ('error' in area) return [];
  const built = new Set(fort.segments.filter((s) => s.builtDay !== null).map((s) => s.index));
  return fortBandPieces(fortificationOutline(area, fort.kind))
    .filter((p) => building || built.has(p.index))
    .map((p) => p.corners);
}
