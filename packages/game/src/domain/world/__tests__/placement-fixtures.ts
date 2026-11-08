import type { GridCell } from '../../village/world-grid';
import type { OccupiedCell } from '../placement';

/** Malý deterministický generátor (LCG) pro testy a měření – žádné Math.random. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Svět s `count` obsazenými buňkami rozptýlenými po čtverci o straně ≈ `spread`·√count. */
export function randomWorld(count: number, seed: number, spread = 3): OccupiedCell[] {
  const rng = makeRng(seed);
  const side = Math.ceil(Math.sqrt(count) * spread);
  const seen = new Set<string>();
  const out: OccupiedCell[] = [];
  while (out.length < count) {
    const x = Math.floor(rng() * side) - (side >> 1);
    const y = Math.floor(rng() * side) - (side >> 1);
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ cell: { x, y }, ownerId: `p${out.length}` });
  }
  return out;
}

/** Náhodný souvislý shluk 1–`size` buněk, první = (0, 0). */
export function randomCluster(rng: () => number, size: number): GridCell[] {
  const cells: GridCell[] = [{ x: 0, y: 0 }];
  const seen = new Set(['0,0']);
  while (cells.length < size) {
    const base = cells[Math.floor(rng() * cells.length)] as GridCell;
    const c = { x: base.x + Math.floor(rng() * 3) - 1, y: base.y + Math.floor(rng() * 3) - 1 };
    const k = `${c.x},${c.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push(c);
  }
  return cells;
}
