// Jabloňový sad ve scéně bez Babylonu (orchard.md – Co hráč vidí): jabloně v řadách po
// čtvercích (mimo skalní výchozy), výsadba po fázích (kůly → sazenice). Velikost stromků
// a jablka počítá server (`lib/orchard-look.ts`). Souřadnice světa scény v metrech (x, z),
// čtverce jako u pole (field-cells.ts).
import type { CellSquare } from './field-cells';
import { seededRandom } from './village-layout';

export {
  SAPLING_GROWTH,
  STAKE_YEARS,
  TREE_GROWTH_YEARS,
  hasStake,
  treeGrowth,
} from '../orchard-look';

/**
 * Mřížka míst pro stromy po 7,5 m (2 × 2 na čtverec 15 × 15 m), stromy jen na každém druhém
 * místě do šachovnice (sponem „do pětky“, quincunx): 2 jabloně na čtverec, nejbližší soused
 * ≈ 10,6 m – ≈ 90 vysokokmenů na hektar, koruny dospělých stromů (≈ 6 m) se nedotýkají. Ve
 * větším sadu tak vznikne pravidelný spon přes všechny čtverce.
 */
export const TREES_PER_SIDE = 2;
/** Stromů ve čtverci – polovina míst mřížky (šachovnice). */
export const TREES_PER_SQUARE = (TREES_PER_SIDE * TREES_PER_SIDE) / 2;
/** Varianty modelu jabloně (apple-1 … apple-4, s plody apple-fruit-1 … apple-fruit-4). */
export const APPLE_VARIANTS = 4;
/** Výsadba: do poloviny průběhu se zatloukají kůly, pak se sázejí stromky. */
export const PLANTING_PHASES = [
  { from: 0, to: 0.5, label: 'Kůly' },
  { from: 0.5, to: 1, label: 'Sazenice' },
] as const;
/** Rozházení stromu v řadě (m) a velikosti (±). */
const JITTER_M = 0.5;
const SCALE_JITTER = 0.08;
/** Kmen stojí aspoň tolik (m) od okraje skalního výchozu a od okraje čtverce. */
const OUTCROP_CLEARANCE_M = 1;
const EDGE_MARGIN_M = 0.5;

/** Skalní výchoz – střed (m) a poloměr (m); stromy ho obejdou. */
export interface Outcrop {
  x: number;
  z: number;
  radius: number;
}

export interface OrchardTreeSpot {
  x: number;
  z: number;
  rotationY: number;
  /** Násobek velikosti (drobné rozdíly mezi stromy). */
  scale: number;
  /** Varianta modelu 0 … APPLE_VARIANTS − 1. */
  variant: number;
}

/**
 * Místa stromů ve čtverci – šachovnice na mřížce TREES_PER_SIDE × TREES_PER_SIDE s drobným
 * rozházením, natočením, velikostí a variantou modelu (deterministicky podle políčka – strom
 * stojí pořád na stejném místě). Pořadí po řadách – v tomto pořadí se sází. Místo ve skalním
 * výchozu (`outcrops`, i z vedlejšího políčka) se odsune ven z výchozu; když by pak leželo mimo
 * čtverec nebo v jiném výchozu, strom tam není (jádro plochu pod výchozem do sadu nepočítá).
 */
export function orchardTreeSpots(
  square: CellSquare,
  outcrops: readonly Outcrop[] = [],
): OrchardTreeSpot[] {
  const random = seededRandom(square.cell.x * 73_856_093 + square.cell.y * 19_349_663 + 7);
  const step = square.size / TREES_PER_SIDE;
  const spots: OrchardTreeSpot[] = [];
  for (let row = 0; row < TREES_PER_SIDE; row++) {
    for (let column = 0; column < TREES_PER_SIDE; column++) {
      // čtverec má sudý počet míst na stranu – šachovnice navazuje přes sousední čtverce
      if ((row + column) % 2 !== 0) continue;
      const spot = {
        x: square.x - square.size / 2 + (column + 0.5) * step + (random() - 0.5) * 2 * JITTER_M,
        z: square.z - square.size / 2 + (row + 0.5) * step + (random() - 0.5) * 2 * JITTER_M,
        rotationY: random() * Math.PI * 2,
        scale: 1 + (random() - 0.5) * 2 * SCALE_JITTER,
        variant: Math.floor(random() * APPLE_VARIANTS) % APPLE_VARIANTS,
      };
      const placed = clearOfOutcrops(square, spot, outcrops);
      if (placed) spots.push({ ...spot, ...placed });
    }
  }
  return spots;
}

/** Místo stromu mimo skalní výchozy (odsunuté ven z prvního zasaženého), nebo null. */
function clearOfOutcrops(
  square: CellSquare,
  spot: { x: number; z: number },
  outcrops: readonly Outcrop[],
): { x: number; z: number } | null {
  const reach = (o: Outcrop): number => o.radius + OUTCROP_CLEARANCE_M;
  const hit = outcrops.find((o) => Math.hypot(spot.x - o.x, spot.z - o.z) < reach(o));
  if (!hit) return spot;
  const dx = spot.x - hit.x;
  const dz = spot.z - hit.z;
  const length = Math.hypot(dx, dz);
  // přesně ve středu výchozu – odsunout k nejbližšímu okraji čtverce ve směru x
  const [ux, uz] = length > 1e-6 ? [dx / length, dz / length] : [1, 0];
  const moved = { x: hit.x + ux * reach(hit), z: hit.z + uz * reach(hit) };
  const half = square.size / 2 - EDGE_MARGIN_M;
  const inside = Math.abs(moved.x - square.x) <= half && Math.abs(moved.z - square.z) <= half;
  const blocked = outcrops.some((o) => Math.hypot(moved.x - o.x, moved.z - o.z) < reach(o) - 1e-9);
  return inside && !blocked ? moved : null;
}

/** Co z výsadby čtverce stojí: kolik míst má kůl a kolik už sazenici (počty stromů). */
export function plantingProgress(
  progress: number,
  trees: number,
): { stakes: number; saplings: number } {
  const p = Math.min(1, Math.max(0, progress));
  const [staking, planting] = PLANTING_PHASES;
  const stakes = Math.round(trees * Math.min(1, (p - staking.from) / (staking.to - staking.from)));
  const saplings = Math.round(
    trees * Math.min(1, Math.max(0, (p - planting.from) / (planting.to - planting.from))),
  );
  return { stakes: Math.max(0, stakes), saplings };
}

/** Fáze výsadby pro vývojový náhled. */
export function plantingPhase(progress: number): (typeof PLANTING_PHASES)[number] {
  return (
    PLANTING_PHASES.find((p) => progress < p.to) ?? PLANTING_PHASES[PLANTING_PHASES.length - 1]!
  );
}
