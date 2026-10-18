import { fallowYears, reclaimCostPerHa } from './fields';
import { withinBounds } from './productivity';
import type { Bounds, FieldPart } from './types';

// Orba rádlem – sazby a které díly rádlo zvládne (oxen.md – Účinek na práci). Samostatný list
// bez závislostí na plánu, aby ho mohl použít plán osevu (year-plan.ts) i ohrady (oxen.ts).

/**
 * oxen.md – Účinek na práci (návrh Clauda podle rešerše, Martin schválil): orba rádlem 10 → 6
 * člověkodní/ha podle pokrytí nástroji (nejhorší mez dřevěná radlice, nejlepší se železnou
 * špičkou od kováře – crafts.md) místo kopání motykou 100 → 50; spřežení zorá ≈ 0,3 ha za den
 * (orba křížem); orá oráč a honáček (2 lidé).
 */
export const PLOUGH_WORK_PER_HA: Bounds = { worst: 10, best: 6 };
export const PLOUGH_HA_PER_DAY = 0.3;
export const PLOUGH_CREW = 2;

/** Člověkodny orby hektaru podle pokrytí nástroji (železná špička rádla od kováře). */
export function ploughWorkPerHa(toolCoverage: number): number {
  return withinBounds(PLOUGH_WORK_PER_HA, toolCoverage);
}

/**
 * Zorá díl rádlo? Drn ne (oxen.md – rádla selhávala na panenském drnu): díl, který se letos vrací
 * z přílohu ve fázi pastviny (vrácení stojí práci navíc – motyka), kope dál motyka. Díl po
 * sklizni, mladý příloh a díl, kterému drn rozrušilo založení, rádlo zorá.
 */
export function isPloughable(part: FieldPart, day: number): boolean {
  return part.state !== 'fallow' || reclaimCostPerHa(fallowYears(part, day), 0) <= 0;
}
