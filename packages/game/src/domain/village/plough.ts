import { fallowStage } from './fields';
import { withinBounds } from './productivity';
import type { Bounds, FieldPart } from './types';

// Orba rádlem – sazby a drn (oxen.md – Účinek na práci). Samostatný list bez závislostí na plánu,
// aby ho mohl použít hospodářský rok (year-plan.ts) i ohrady (oxen.ts).

/**
 * oxen.md – Účinek na práci (návrh Clauda podle rešerše, Martin schválil): orba rádlem 10 → 6
 * člověkodní/ha podle pokrytí nástroji (nejhorší mez dřevěná radlice, nejlepší se železnou
 * špičkou od kováře – crafts.md) místo kopání motykou 100 → 50; spřežení zorá ≈ 0,3 ha za den
 * (orba křížem); orá oráč a honáček (2 lidé).
 */
export const PLOUGH_WORK_PER_HA: Bounds = { worst: 10, best: 6 };
export const PLOUGH_HA_PER_DAY = 0.3;
export const PLOUGH_CREW = 2;
/**
 * oxen.md – Jen rádlo (Martin, 19. 10. 2026: „Pokud je k dispozici rádlo, kopání motykou úplně
 * vynech.“; číslo návrh Clauda podle rešerše 2026-10-17-zemedelstvi-populace.md): drn – louka
 * založená rádlem a příloh ve fázi louky – rádlo rozruší až opakovanou orbou křížem (jedním
 * průchodem po drnu klouže – rádla na panenském drnu selhávala). Kolikrát víc práce, rešerše
 * přímo nemá; bere se poměr motyky – panenský drn motykou ≈ 2,5× pomaleji než lehká půda
 * (Semjonov). Drn tak stojí 25 → 15 člověkodní/ha orby a stejně tolik kapacity spřežení.
 */
export const PLOUGH_SOD_FACTOR = 2.5;

/** Člověkodny orby hektaru podle pokrytí nástroji (železná špička rádla od kováře). */
export function ploughWorkPerHa(toolCoverage: number): number {
  return withinBounds(PLOUGH_WORK_PER_HA, toolCoverage);
}

/**
 * Leží na dílu drn (oxen.md – Jen rádlo)? Louka založená rádlem, kterou ještě nikdo neoral
 * (`FieldPart.sod`), a příloh ve fázi louky (3+ roky ladem). Mladý příloh, díl po sklizni
 * i díl, kterému drn rozrušilo založení motykou, drn nemají; křoviny a mladý les se při vrácení
 * klučí ručně a drn s kořeny tím zmizí taky.
 */
export function hasSod(part: FieldPart, day: number): boolean {
  if (part.sod) return true;
  return part.state === 'fallow' && fallowStage(part, day) === 'meadow';
}
