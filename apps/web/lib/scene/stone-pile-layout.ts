import type { SceneVillage } from '../village-view';

// Rozložení hromad kamení a lomů ve scéně (fortifications.md – Hradby a obrana, Kámen): hromada
// u cesty se složí z dílů `stone-pile-b` (≈ 3 m³) a `stone-pile-a` (≈ 1 m³) ze `siege.glb`, lom je
// vylomená stěna na výchozu s hromádkami kamení před ní. Jen čistá geometrie – bez Babylonu.

/** Kámen dílu modelu (m³) – `tools/blender/siege.py`. */
export const PILE_M3 = { a: 1, b: 3 } as const;
/** Nejvíc dílů na jednu hromadu – větší hromada se už nekreslí větší (návrh Clauda). */
export const MAX_PILES_PER_STACK = 9;
/** Rozestup dílů hromady (m) – díl b má půdorys ≈ 2,9 m. */
const SPACING_M = 2.6;
/** Vylomená stěna lomu: šířka, výška a tloušťka (m); stojí za středem výchozu. */
export const QUARRY_FACE_M = { width: 5, height: 2.4, depth: 0.8, back: 2 } as const;
/** Poloměr půdorysu dílu modelu (m) – `tools/blender/siege.py` (`stone_pile`). */
export const PILE_RADIUS_M = { a: 0.95, b: 1.45 } as const;
/**
 * Hromádky před stěnou lomu v místních osách lomu (m, stěna v −z): `broken` – nalámaný kámen
 * u stěny (díl a), `heap` – hromada u lomu (díl b, rozestavěný lom ji nemá).
 */
export const QUARRY_PILES = {
  broken: { lx: 1.4, lz: 1.2, scale: 0.8 },
  heap: { lx: -1.3, lz: 0.8, scale: 0.9 },
} as const;

/** Díl v rovině – střed, natočení kolem svislé osy a svislé měřítko. */
export interface PileSpot {
  x: number;
  z: number;
  rotation: number;
  scale: number;
  scaleY?: number;
}

export interface StoneLayout {
  /** Díly `stone-pile-a`. */
  a: PileSpot[];
  /** Díly `stone-pile-b`. */
  b: PileSpot[];
  /** Vylomené stěny lomů (rozestavěný lom poloviční výšky). */
  faces: PileSpot[];
}

/** Bod v souřadnicích modelu natočeného o `rotation` (jako `Position.rotation` obydlí) ve světě. */
export function toWorld(
  cx: number,
  cz: number,
  rotation: number,
  lx: number,
  lz: number,
): [number, number] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
}

/** Pevné „náhodné“ natočení dílu podle id hromady a pořadí (rad). */
function turn(id: number, k: number): number {
  return (((id * 1.7 + k * 2.3) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Díly hromady `m3`: napřed velké (b), zbytek malými (a, poslední zmenšený podle zbytku); nejvýš
 * `MAX_PILES_PER_STACK` dílů. Vrátí druhy v pořadí rozložení.
 */
export function stackPieces(m3: number): { kind: 'a' | 'b'; scale: number }[] {
  if (!(m3 > 0)) return [];
  const pieces: { kind: 'a' | 'b'; scale: number }[] = [];
  let left = m3;
  while (left >= PILE_M3.b - 1e-9 && pieces.length < MAX_PILES_PER_STACK) {
    pieces.push({ kind: 'b', scale: 1 });
    left -= PILE_M3.b;
  }
  while (left > 0.05 && pieces.length < MAX_PILES_PER_STACK) {
    const share = Math.min(1, left / PILE_M3.a);
    // menší hromádka – objem roste se třetí mocninou měřítka
    pieces.push({ kind: 'a', scale: Math.max(0.5, Math.cbrt(share)) });
    left -= PILE_M3.a;
  }
  return pieces;
}

/** Poloměr kruhu, do kterého se vejdou díly hromady `m3` (m; `stoneLayout`); prázdná 0. */
export function stackRadius(m3: number): number {
  const n = stackPieces(m3).length;
  if (n === 0) return 0;
  const cols = Math.min(3, n);
  const rows = Math.ceil(n / 3);
  return Math.hypot((cols - 1) / 2, (rows - 1) / 2) * SPACING_M + PILE_RADIUS_M.b;
}

/** Hromady kamení u cest a lomy vsi jako díly modelu. */
export function stoneLayout(village: Pick<SceneVillage, 'stoneStacks' | 'quarries'>): StoneLayout {
  const out: StoneLayout = { a: [], b: [], faces: [] };
  for (const stack of village.stoneStacks ?? []) {
    const pieces = stackPieces(stack.m3);
    const cols = Math.min(3, pieces.length);
    const rows = Math.ceil(pieces.length / 3);
    pieces.forEach((piece, k) => {
      const col = k % 3;
      const row = Math.floor(k / 3);
      const x = stack.x + (col - (cols - 1) / 2) * SPACING_M;
      const z = stack.z + (row - (rows - 1) / 2) * SPACING_M;
      out[piece.kind].push({ x, z, rotation: turn(stack.id, k), scale: piece.scale });
    });
  }
  for (const quarry of village.quarries ?? []) {
    const { x, z, rotation } = quarry;
    const [fx, fz] = toWorld(x, z, rotation, 0, -QUARRY_FACE_M.back);
    out.faces.push({
      x: fx,
      z: fz,
      rotation,
      scale: 1,
      ...(quarry.building ? { scaleY: 0.5 } : {}),
    });
    const { broken, heap } = QUARRY_PILES;
    const [ax, az] = toWorld(x, z, rotation, broken.lx, broken.lz);
    out.a.push({ x: ax, z: az, rotation: turn(quarry.outcropId, 0), scale: broken.scale });
    if (!quarry.building) {
      const [bx, bz] = toWorld(x, z, rotation, heap.lx, heap.lz);
      out.b.push({ x: bx, z: bz, rotation: turn(quarry.outcropId, 1), scale: heap.scale });
    }
  }
  return out;
}
