import {
  DAILY_MIN_PER_HOUSEHOLD,
  FIELD_WORK_PER_HA,
  FOUNDING_COST_PER_HA,
  LEGUME_WORK_PER_HA,
  STORAGE_LOSS_PER_YEAR,
} from './rules';
import type { Bounds, CraftCoverage, Crop, FieldSurface, FieldTask } from './types';

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

/** Člověkodny polní práce na osetý hektar podle pokrytí nástroji (luštěniny – vlastní sazby). */
export function fieldWorkPerHa(
  task: FieldTask,
  toolCoverage: number,
  crop: Crop = 'spring',
): number {
  return withinBounds(
    (crop === 'legume' ? LEGUME_WORK_PER_HA : FIELD_WORK_PER_HA)[task],
    toolCoverage,
  );
}

/** Člověkodny založení hektaru pole podle povrchu a pokrytí nástroji. */
export function foundingCostPerHa(surface: FieldSurface, toolCoverage: number): number {
  return withinBounds(FOUNDING_COST_PER_HA[surface], toolCoverage);
}

/** Roční ztráta zásob obilí (podíl) podle pokrytí nádobami. */
export function storageLossPerYear(potteryCoverage: number): number {
  return withinBounds(STORAGE_LOSS_PER_YEAR, potteryCoverage);
}

/** Denní minimum domácnosti (člověkodny) podle pokrytí nádobami. */
export function dailyMinPerHousehold(potteryCoverage: number): number {
  return withinBounds(DAILY_MIN_PER_HOUSEHOLD, potteryCoverage);
}
