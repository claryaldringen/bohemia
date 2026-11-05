import type { FenceArc, FenceSegment } from '../paths/entrances';
import type { TileCell } from '../types';
import { cornerArc, type FortOutline } from './outline';

// Úseky opevnění (fortifications.md – Obvod, Úseky): úsek je jedna strana okrajového čtverce
// (15 m), oblouk rohu patří k úseku, ve kterém začíná. Úsek je jednotka stavby, stáří, přestavby
// i průlomu. Pořadí po směru hodin od severu je pevné (`fortificationOutline`).

/** Tvar úseku ve světě. */
export interface FortSegmentShape {
  /** Pořadí po směru hodin od severu (0, 1, …). */
  index: number;
  /** Okrajový čtverec a jeho strana v mřížce (0 −z, 1 +x, 2 +z, 3 −x). */
  cell: TileCell;
  side: number;
  /** Rovná část úseku – bez tečen oblouků na začátku a na konci. */
  line: FenceSegment;
  /** Oblouk rohu na konci úseku; strana bez rohu na konci null. */
  arc: FenceArc | null;
  /** Délka úseku po vnějším okraji (m) – rovná část a oblouk. */
  lengthM: number;
}

/** Úseky obvodu v pevném pořadí – součet délek = délka obvodu. */
export function fortSegments(outline: FortOutline): FortSegmentShape[] {
  const size = outline.area.geo.cellSizeM;
  const sides = outline.sides;
  return sides.map((s, index) => {
    const prev = sides[(index + sides.length - 1) % sides.length]!;
    const next = sides[(index + 1) % sides.length]!;
    const ta = prev.endRadius;
    const tb = s.endRadius;
    const length = size - ta - tb;
    const arc =
      s.end === null
        ? null
        : cornerArc(s.x + s.dx * size, s.z + s.dz * size, [s.dx, s.dz], [next.dx, next.dz], tb);
    return {
      index,
      cell: s.cell,
      side: s.side,
      line: { x: s.x + s.dx * ta, z: s.z + s.dz * ta, dx: s.dx, dz: s.dz, length },
      arc,
      lengthM: length + (arc ? (Math.PI / 2) * arc.r : 0),
    };
  });
}
