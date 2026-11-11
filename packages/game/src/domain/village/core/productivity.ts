import {
  CARPENTER_TOOLS_WORK,
  DAILY_MIN_PER_HOUSEHOLD,
  FIELD_WORK_PER_HA,
  FLAX_WORK_PER_HA,
  FOUNDING_COST_PER_HA,
  HARVEST_WORK_PER_HA,
  HAY_WORK_PER_HA,
  LEGUME_WORK_PER_HA,
  STORAGE_LOSS_PER_YEAR,
  WOODWORK_LABOR,
  WOOD_TOOLS_LABOR,
  WINTER_WORK_PER_HA,
} from '../rules';
import type { Bounds, CraftCoverage, Crop, FieldSurface, FieldTask } from '../types';

// Meze produktivity (Martin, fields.md – Meze produktivity, crafts.md – Účinek): práce a ztráty
// s rozpětím v literatuře leží mezi `worst` (ves bez řemesel) a `best` (plně pokrytá potřeba
// výrobků řemeslníků). Pokrytí přichází parametrem – ze zásob vsi ho počítá `craftCoverage`
// (crafts.ts).

/** Ves bez výrobků řemeslníků – pokrytí 0, platí horní meze práce a ztrát. */
export const NO_CRAFTS: CraftCoverage = { tools: 0, pottery: 0 };

/** Hodnota mezi mezemi podle pokrytí 0–1 (0 = `worst`, 1 = `best`); pokrytí mimo 0–1 se ořízne. */
export function withinBounds(bounds: Bounds, coverage: number): number {
  const share = Math.min(1, Math.max(0, coverage));
  return bounds.worst + (bounds.best - bounds.worst) * share;
}

/** Sazby polní práce plodiny – luštěniny a len vlastní, obilí společné (ozim bez pletí). */
const CROP_WORK_PER_HA: Record<Crop, Record<FieldTask, Bounds>> = {
  winter: WINTER_WORK_PER_HA,
  spring: FIELD_WORK_PER_HA,
  legume: LEGUME_WORK_PER_HA,
  flax: FLAX_WORK_PER_HA,
};

/**
 * Člověkodny polní práce na osetý hektar podle pokrytí nástroji (luštěniny a len – vlastní
 * sazby).
 */
export function fieldWorkPerHa(
  task: FieldTask,
  toolCoverage: number,
  crop: Crop = 'spring',
): number {
  return withinBounds(CROP_WORK_PER_HA[crop][task], toolCoverage);
}

/** Člověkodny založení hektaru pole podle povrchu a pokrytí nástroji. */
export function foundingCostPerHa(surface: FieldSurface, toolCoverage: number): number {
  return withinBounds(FOUNDING_COST_PER_HA[surface], toolCoverage);
}

/** Člověkodny seče, sušení a svozu sena na hektar louky podle pokrytí nástroji (oxen.md – Seno). */
export function hayWorkPerHa(toolCoverage: number): number {
  return withinBounds(HAY_WORK_PER_HA, toolCoverage);
}

/**
 * Podíl odnosu na práci sklizně podle pokrytí nástroji (srp s železem žne rychleji – meze;
 * fields.md – Práce) – rozdělení práce pro postavy a svoz snopů vozem (wagons.md).
 */
export function harvestCarryShare(toolCoverage: number): number {
  const carry = withinBounds(HARVEST_WORK_PER_HA.carry, toolCoverage);
  return carry / (withinBounds(HARVEST_WORK_PER_HA.reap, toolCoverage) + carry);
}

/** Roční ztráta zásob obilí (podíl) podle pokrytí nádobami. */
export function storageLossPerYear(potteryCoverage: number): number {
  return withinBounds(STORAGE_LOSS_PER_YEAR, potteryCoverage);
}

/** Denní minimum domácnosti (člověkodny) podle pokrytí nádobami. */
export function dailyMinPerHousehold(potteryCoverage: number): number {
  return withinBounds(DAILY_MIN_PER_HOUSEHOLD, potteryCoverage);
}

/**
 * Násobek práce vsi podle pokrytí dřevěným nářadím od tesaře (wagons.md – Tesař, Účinek): práce
 * stojí `WOOD_TOOLS_LABOR` (1 → 0,95) – stejná práce jde o tolik rychleji. Bez tesaře 1.
 */
export function woodToolsLaborFactor(woodToolsCoverage: number): number {
  return 1 / withinBounds(WOOD_TOOLS_LABOR, woodToolsCoverage);
}

/**
 * Podíl práce dřevěné části stavby podle pokrytí tesařem (wagons.md – Tesař, Účinek): 1 bez
 * tesaře, s plným pokrytím 0,6.
 */
export function woodworkLabor(carpentryCoverage: number): number {
  return withinBounds(WOODWORK_LABOR, carpentryCoverage);
}

/**
 * Práce tesaře na jednotku výroby i pomoci stavbám podle pokrytí nástroji od kováře (wagons.md –
 * Tesař): bez nástrojů 1,5×, s plným pokrytím 1×.
 */
export function carpenterWorkFactor(toolCoverage: number): number {
  return withinBounds(CARPENTER_TOOLS_WORK, toolCoverage);
}
