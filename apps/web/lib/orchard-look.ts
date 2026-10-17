// Vzhled jabloňového sadu, který počítá server do pohledu na ves (orchard.md – Co hráč vidí):
// velikost mladých stromků podle stáří a jestli na stromech visí jablka. Čistý modul bez scény
// – smí ho importovat `village-view.ts` i scéna (orchard-layout.ts).

/** Sazenice má ≈ 30 % výšky dospělé jabloně, plnou velikost má strom za 12 let (návrh Clauda). */
export const SAPLING_GROWTH = 0.3;
export const TREE_GROWTH_YEARS = 12;
/** Mladý stromek je první 3 roky přivázaný ke kůlu. */
export const STAKE_YEARS = 3;
/** Jablka dozrávají v srpnu – před sklizní (září–říjen). */
export const FRUIT_RIPENING_MONTH = 8;

/** Velikost stromu 0–1 podle stáří (roky od výsadby). */
export function treeGrowth(ageYears: number): number {
  const t = Math.min(1, Math.max(0, ageYears / TREE_GROWTH_YEARS));
  return SAPLING_GROWTH + (1 - SAPLING_GROWTH) * t;
}

/** Strom u kůlu – mladší než STAKE_YEARS (podle velikosti). */
export function hasStake(growth: number): boolean {
  return growth < treeGrowth(STAKE_YEARS);
}

/**
 * Visí na stromech jablka? Plodící čtverec (`bearing` – `squareBearing` z jádra) od srpna
 * (dozrávají) a během sklizně, dokud se nesklidí – podzimní háček pro scénu; roční období (barva
 * listí, květ) přidá vlastní mechanika scény.
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
