// Jabloňový sad ve scéně bez Babylonu (orchard.md – Co hráč vidí): jabloně v pravidelných
// řadách přes celý sad (mimo skalní výchozy), výsadba po fázích (vytyčení řad → kůly →
// sazenice) – i obnova starého sadu po čtvercích (Obnova sadu). Velikost stromků a jablka počítá
// server po čtvercích (`lib/orchard-look.ts`). Souřadnice světa scény v metrech (x, z), čtverce
// jako u pole (field-cells.ts).
import { rotationCosSin } from '@bohemia/game';
import { isRotatedSquare, type CellSquare } from './field-cells';
import { seededRandom, type Point } from './village-layout';

/**
 * Bod v osách čtverce (od středu) → svět – natočený čtverec natočeného sadu (fields.md –
 * Natočené stavby) jako rotation.y v Babylonu; čtverec v osách světa jen posun.
 */
function squarePoint(square: CellSquare): (lx: number, lz: number) => Point {
  if (!isRotatedSquare(square)) return (lx, lz) => [square.x + lx, square.z + lz];
  const [c, s] = rotationCosSin(square.rotation!);
  return (lx, lz) => [square.x + lx * c + lz * s, square.z - lx * s + lz * c];
}

export {
  SAPLING_GROWTH,
  STAKE_YEARS,
  TREE_GROWTH_YEARS,
  hasStake,
  treeGrowth,
} from '../orchard-look';

/**
 * Spon v pravidelných řadách (Martin, 18. 10. 2026: „Stromy v sadu by měly být zasazené
 * v pravidelných řadách.“): mřížka po 7,5 m podél os světa, 2 × 2 = 4 jabloně na čtverec
 * 15 × 15 m, stromy 3,75 m od okraje čtverce – řady tak rovně pokračují přes sousední čtverce
 * celého sadu (≈ 180 stromů na hektar; úroda se počítá na hektar, na počtu stromů nezávisí).
 */
export const TREES_PER_SIDE = 2;
/** Stromů ve čtverci – celá mřížka TREES_PER_SIDE × TREES_PER_SIDE. */
export const TREES_PER_SQUARE = TREES_PER_SIDE * TREES_PER_SIDE;
/** Varianty modelu jabloně (apple-1 … apple-4, s plody apple-fruit-1 … apple-fruit-4). */
export const APPLE_VARIANTS = 4;
/** Výsadba: do poloviny průběhu se zatloukají kůly, pak se sázejí stromky. */
export const PLANTING_PHASES = [
  { from: 0, to: 0.5, label: 'Kůly' },
  { from: 0.5, to: 1, label: 'Sazenice' },
] as const;
/** Drobný rozdíl velikosti stromů (±) – poloha v řadě je přesná. */
const SCALE_JITTER = 0.08;
/** Kmen stojí aspoň tolik (m) od okraje skalního výchozu – jinak tam strom není. */
const OUTCROP_CLEARANCE_M = 1;

/** Skalní výchoz – střed (m) a poloměr (m); místo stromu v něm zůstane prázdné. */
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
 * Místa stromů ve čtverci – mřížka TREES_PER_SIDE × TREES_PER_SIDE v rovných řadách (bez
 * rozházení), natočení, velikost a varianta modelu deterministicky podle políčka (strom stojí
 * pořád stejně). Pořadí po řadách (z, pak x) – v tomto pořadí se sází. Místo ve skalním výchozu
 * (`outcrops`, i z vedlejšího políčka) zůstane prázdné – strom se neodsouvá, řada zůstane rovná
 * (jádro plochu pod výchozem do sadu nepočítá). Stejně místo pod obydlím (`built` – vyklízená
 * plocha obydlí, kterou jádro ze čtverce odečetlo – population.md, Obydlí na poli a v sadu).
 */
export function orchardTreeSpots(
  square: CellSquare,
  outcrops: readonly Outcrop[] = [],
  built: (x: number, z: number) => boolean = () => false,
): OrchardTreeSpot[] {
  const random = seededRandom(square.cell.x * 73_856_093 + square.cell.y * 19_349_663 + 7);
  const step = square.size / TREES_PER_SIDE;
  // řady podél os čtverce – u natočeného sadu natočené
  const at = squarePoint(square);
  const spots: OrchardTreeSpot[] = [];
  for (let row = 0; row < TREES_PER_SIDE; row++) {
    for (let column = 0; column < TREES_PER_SIDE; column++) {
      const [x, z] = at(
        -square.size / 2 + (column + 0.5) * step,
        -square.size / 2 + (row + 0.5) * step,
      );
      const spot = {
        x,
        z,
        rotationY: random() * Math.PI * 2,
        scale: 1 + (random() - 0.5) * 2 * SCALE_JITTER,
        variant: Math.floor(random() * APPLE_VARIANTS) % APPLE_VARIANTS,
      };
      const blocked =
        outcrops.some(
          (o) => Math.hypot(spot.x - o.x, spot.z - o.z) < o.radius + OUTCROP_CLEARANCE_M,
        ) || built(spot.x, spot.z);
      if (!blocked) spots.push(spot);
    }
  }
  return spots;
}

/**
 * Čáry vytyčení řad sadu: v každém čtverci provázek podél každé řady stromů přes celý čtverec
 * (osa x) – u sousedních čtverců na sebe navazují v rovnou čáru přes celý sad.
 */
export function orchardRowLines(squares: readonly CellSquare[]): Point[][] {
  return squares.flatMap((square) => {
    const step = square.size / TREES_PER_SIDE;
    const at = squarePoint(square);
    return Array.from({ length: TREES_PER_SIDE }, (_, row): Point[] => {
      const lz = -square.size / 2 + (row + 0.5) * step;
      return [at(-square.size / 2, lz), at(square.size / 2, lz)];
    });
  });
}

/**
 * Čtverce sadu, které se vytyčují kolíky a provázkem: při výsadbě celý sad, dokud se nedosází;
 * při obnově (orchard.md – Obnova sadu) jen čtverce, které se sázejí znovu – staré stromy
 * zbytku sadu stojí dál. Vysazený sad nic.
 */
export function stakedSquares<T extends { planting: number; renewal?: true }>(
  squares: readonly T[],
): T[] {
  const planting = squares.filter((s) => s.planting < 1);
  if (planting.length === 0) return [];
  return planting.some((s) => s.renewal) ? planting.filter((s) => s.renewal) : [...squares];
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
