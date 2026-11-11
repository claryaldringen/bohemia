import type { MapSide } from '../../landscape/skeleton/types';
import type { GridCell } from '../../village/people/world-grid';
import { cellUnit, SKELETON_SALT, skeletonBase } from './hash';
import { SKELETON } from './rules-skeleton';

// Stezky – síť uzlů v blocích (world-skeleton.md – Stezky – síť uzlů). Uzel bloku, existence
// spojení na východ a na sever a tvar spojení jsou čisté funkce seedu světa a souřadnic.

/** Blok, do kterého políčko patří (dělení k −∞). */
function blockOf(v: number): number {
  return Math.floor(v / SKELETON.trail.block);
}

/** Uzel stezky v bloku `block` (souřadnice bloku): políčko aspoň `nodeMargin` od kraje bloku. */
export function trailNode(worldSeed: number, block: GridCell): GridCell {
  const { block: size, nodeMargin } = SKELETON.trail;
  return trailNodeAtBase(skeletonBase(worldSeed), block, size, nodeMargin);
}

function trailNodeAtBase(base: number, block: GridCell, size: number, margin: number): GridCell {
  const span = size - 2 * margin;
  const dx = margin + Math.floor(cellUnit(base, SKELETON_SALT.trailNodeX, block.x, block.y) * span);
  const dy = margin + Math.floor(cellUnit(base, SKELETON_SALT.trailNodeY, block.x, block.y) * span);
  return { x: block.x * size + dx, y: block.y * size + dy };
}

/** Existuje spojení uzlu bloku `block` se sousedním uzlem na východě (`E`) či severu (`N`)? */
export function trailEdgeExists(worldSeed: number, block: GridCell, dir: 'E' | 'N'): boolean {
  return trailEdgeAtBase(skeletonBase(worldSeed), block, dir);
}

function trailEdgeAtBase(base: number, block: GridCell, dir: 'E' | 'N'): boolean {
  const salt = dir === 'E' ? SKELETON_SALT.trailEdgeE : SKELETON_SALT.trailEdgeN;
  return cellUnit(base, salt, block.x, block.y) < SKELETON.trail.edgeShare;
}

/** Úsek spojení – vodorovný nebo svislý, oba konce včetně. */
interface Segment {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function segment(a: GridCell, b: GridCell): Segment {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function inSegment(s: Segment, x: number, y: number): boolean {
  return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
}

/**
 * Tři úseky spojení z uzlu bloku `block` na východ (rovně k hranici bloků, ohyb, rovně do druhého
 * uzlu) či na sever (totéž s osami prohozenými).
 */
function edgeSegments(base: number, block: GridCell, dir: 'E' | 'N'): Segment[] {
  const { block: size, nodeMargin } = SKELETON.trail;
  const a = trailNodeAtBase(base, block, size, nodeMargin);
  if (dir === 'E') {
    const b = trailNodeAtBase(base, { x: block.x + 1, y: block.y }, size, nodeMargin);
    const m = (block.x + 1) * size;
    return [
      segment(a, { x: m, y: a.y }),
      segment({ x: m, y: a.y }, { x: m, y: b.y }),
      segment({ x: m, y: b.y }, b),
    ];
  }
  const c = trailNodeAtBase(base, { x: block.x, y: block.y + 1 }, size, nodeMargin);
  const r = (block.y + 1) * size;
  return [
    segment(a, { x: a.x, y: r }),
    segment({ x: a.x, y: r }, { x: c.x, y: r }),
    segment({ x: c.x, y: r }, c),
  ];
}

const SIDE_VECTORS: readonly (readonly [MapSide, number, number])[] = [
  ['N', 0, 1],
  ['E', 1, 0],
  ['S', 0, -1],
  ['W', -1, 0],
];

/**
 * Strany políčka, kterými vede stezka (pořadí N, E, S, W): soused leží na stejném úseku
 * některého existujícího spojení. Prázdné pole = políčko stezku nemá. Hledá spojení v 3 × 3
 * blocích kolem políčka.
 */
export function trailSides(worldSeed: number, cell: GridCell): MapSide[] {
  const base = skeletonBase(worldSeed);
  const bx = blockOf(cell.x);
  const by = blockOf(cell.y);
  const found = new Set<MapSide>();
  for (let ox = bx - 1; ox <= bx + 1; ox++) {
    for (let oy = by - 1; oy <= by + 1; oy++) {
      for (const dir of ['E', 'N'] as const) {
        const block = { x: ox, y: oy };
        if (!trailEdgeAtBase(base, block, dir)) continue;
        for (const seg of edgeSegments(base, block, dir)) {
          if (!inSegment(seg, cell.x, cell.y)) continue;
          for (const [side, dx, dy] of SIDE_VECTORS) {
            if (inSegment(seg, cell.x + dx, cell.y + dy)) found.add(side);
          }
        }
      }
    }
  }
  return SIDE_VECTORS.map(([side]) => side).filter((side) => found.has(side));
}
