// Jabloňový sad ve scéně bez Babylonu (orchard.md – Co hráč vidí): jabloně v řadách po
// čtvercích, mladé stromky rostou do plné velikosti, výsadba po fázích (kolíky → sazenice),
// u mladých stromků kůl. Souřadnice světa scény v metrech (x, z), čtverce jako u pole
// (field-cells.ts).
import type { CellSquare } from './field-cells';
import { seededRandom } from './village-layout';

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
/** Sazenice má ≈ 30 % výšky dospělé jabloně, plnou velikost má strom za 12 let (návrh Clauda). */
export const SAPLING_GROWTH = 0.3;
export const TREE_GROWTH_YEARS = 12;
/** Mladý stromek je první 3 roky přivázaný ke kůlu. */
export const STAKE_YEARS = 3;
/** Výsadba: do poloviny průběhu se zatloukají kůly, pak se sázejí stromky. */
export const PLANTING_PHASES = [
  { from: 0, to: 0.5, label: 'Kůly' },
  { from: 0.5, to: 1, label: 'Sazenice' },
] as const;
/** Rozházení stromu v řadě (m) a velikosti (±). */
const JITTER_M = 0.5;
const SCALE_JITTER = 0.08;

/** Velikost stromu 0–1 podle stáří (roky od výsadby). */
export function treeGrowth(ageYears: number): number {
  const t = Math.min(1, Math.max(0, ageYears / TREE_GROWTH_YEARS));
  return SAPLING_GROWTH + (1 - SAPLING_GROWTH) * t;
}

/** Strom u kůlu – mladší než STAKE_YEARS (podle velikosti). */
export function hasStake(growth: number): boolean {
  return growth < treeGrowth(STAKE_YEARS);
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
 * stojí pořád na stejném místě). Pořadí po řadách – v tomto pořadí se sází.
 */
export function orchardTreeSpots(square: CellSquare): OrchardTreeSpot[] {
  const random = seededRandom(square.cell.x * 73_856_093 + square.cell.y * 19_349_663 + 7);
  const step = square.size / TREES_PER_SIDE;
  const spots: OrchardTreeSpot[] = [];
  for (let row = 0; row < TREES_PER_SIDE; row++) {
    for (let column = 0; column < TREES_PER_SIDE; column++) {
      // čtverec má sudý počet míst na stranu – šachovnice navazuje přes sousední čtverce
      if ((row + column) % 2 !== 0) continue;
      spots.push({
        x: square.x - square.size / 2 + (column + 0.5) * step + (random() - 0.5) * 2 * JITTER_M,
        z: square.z - square.size / 2 + (row + 0.5) * step + (random() - 0.5) * 2 * JITTER_M,
        rotationY: random() * Math.PI * 2,
        scale: 1 + (random() - 0.5) * 2 * SCALE_JITTER,
        variant: Math.floor(random() * APPLE_VARIANTS) % APPLE_VARIANTS,
      });
    }
  }
  return spots;
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

/** Jablka dozrávají v srpnu – před sklizní (září–říjen). */
export const FRUIT_RIPENING_MONTH = 8;

/**
 * Visí na stromech jablka? Plodící sad (`bearing`) od srpna (dozrávají) a během sklizně, dokud
 * se nesklidí – podzimní háček pro scénu; roční období (barva listí, květ) přidá vlastní
 * mechanika scény.
 */
export function fruitVisible(input: {
  bearing: boolean;
  month: number;
  harvestWindow: boolean;
  harvested: boolean;
}): boolean {
  if (!input.bearing) return false;
  if (input.month === FRUIT_RIPENING_MONTH) return true;
  return input.harvestWindow && !input.harvested;
}
