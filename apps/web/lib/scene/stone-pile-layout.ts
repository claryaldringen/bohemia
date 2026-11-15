import type { SceneVillage } from '../village-view';

// Rozložení hromad kamení a lomů ve scéně (fortifications.md – Hradby a obrana, Kámen): hromada
// u cesty se složí z dílů `stone-pile-b` (≈ 3 m³) a `stone-pile-a` (≈ 1 m³) ze `siege.glb`. Lom je
// plocha u skal (Lom jako plocha u skal; Martin 14. 11. 2026 – „Lom vypadá divně. Měla by to být
// prostě jen plocha blízko skal…“): na ploše hromádka donesených bloků, hromada přisekaného kamene
// a bloky v zásobě, u výchozu hromádka vylomených bloků za lamači. Jen čistá geometrie – bez
// Babylonu.

/** Kámen dílu modelu (m³) – `tools/blender/siege.py`. */
export const PILE_M3 = { a: 1, b: 3 } as const;
/** Nejvíc dílů na jednu hromadu – větší hromada se už nekreslí větší (návrh Clauda). */
export const MAX_PILES_PER_STACK = 9;
/** Rozestup dílů hromady (m) – díl b má půdorys ≈ 2,9 m. */
const SPACING_M = 2.6;
/** Poloměr půdorysu dílu modelu (m) – `tools/blender/siege.py` (`stone_pile`). */
export const PILE_RADIUS_M = { a: 0.95, b: 1.45 } as const;
/**
 * Hromádky na ploše lomu v místních osách plochy (m; návrh Clauda): `broken` – donesené vylomené
 * bloky, které kameník přisekává (díl a), `heap` – hromada přisekaného kamene (díl b), `spare` –
 * bloky v zásobě (díl a). Rozestavěný lom má jen `broken`.
 */
export const QUARRY_PILES = {
  broken: { lx: 1.4, lz: 1.2, scale: 0.8 },
  heap: { lx: -1.3, lz: 0.8, scale: 0.9 },
  spare: { lx: 1.9, lz: -2.1, scale: 0.6 },
} as const;
/**
 * Hromádka vylomených bloků u výchozu (díl a; návrh Clauda) – za řadou lamačů od skály `back` m
 * a stranou `side` m (osy u bodu lámání `SceneQuarry.rock`: dopředu do skály, stranou doleva).
 */
export const QUARRY_ROCK_PILE = { back: 1.9, side: -1.9, scale: 0.7 } as const;

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

/**
 * Bod u místa lámání `rock` (osy: `forward` m do skály, `side` m stranou – doleva od směru do
 * skály) ve světě.
 */
export function rockToWorld(
  rock: { x: number; z: number; hx: number; hz: number },
  forward: number,
  side: number,
): [number, number] {
  return [rock.x + rock.hx * forward - rock.hz * side, rock.z + rock.hz * forward + rock.hx * side];
}

/** Hromádka vylomených bloků u výchozu lomu (`QUARRY_ROCK_PILE`) – střed ve světě. */
export function quarryRockPileAt(rock: {
  x: number;
  z: number;
  hx: number;
  hz: number;
}): [number, number] {
  return rockToWorld(rock, -QUARRY_ROCK_PILE.back, QUARRY_ROCK_PILE.side);
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
  const out: StoneLayout = { a: [], b: [] };
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
    const { broken, heap, spare } = QUARRY_PILES;
    const [ax, az] = toWorld(x, z, rotation, broken.lx, broken.lz);
    out.a.push({ x: ax, z: az, rotation: turn(quarry.outcropId, 0), scale: broken.scale });
    // rozestavěný lom – plocha se teprve srovnává, láme se až v hotovém
    if (quarry.building) continue;
    const [bx, bz] = toWorld(x, z, rotation, heap.lx, heap.lz);
    out.b.push({ x: bx, z: bz, rotation: turn(quarry.outcropId, 1), scale: heap.scale });
    const [sx, sz] = toWorld(x, z, rotation, spare.lx, spare.lz);
    out.a.push({ x: sx, z: sz, rotation: turn(quarry.outcropId, 2), scale: spare.scale });
    const [rx, rz] = quarryRockPileAt(quarry.rock);
    out.a.push({
      x: rx,
      z: rz,
      rotation: turn(quarry.outcropId, 3),
      scale: QUARRY_ROCK_PILE.scale,
    });
  }
  return out;
}
