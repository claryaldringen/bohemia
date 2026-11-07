import { PEACE_REASONS } from '@bohemia/game';

// Výběr vsí k postoupení v mírovém jednání (war.md – Konec války): postupující straně musí zůstat
// aspoň jedna živá ves na jiné mapě, než ze které se postupuje (poslední mapa rodu se
// nepostupuje). Server to ověřuje znovu (`checkCede`); tady jen zašedne volba s důvodem.

export interface CedeVillage {
  id: string;
  name: string;
  /** Mapa (sídlo) vsi. */
  settlementId: string;
  /** Ves vymřela nebo je opuštěná – nepočítá se jako zbylá. */
  asleep: boolean;
}

/**
 * Důvod, proč ves `candidate` nejde přidat k už vybraným `selected` (null = jde). Vybraná ves jde
 * vždy odebrat.
 */
export function cedeBlockReason(
  villages: readonly CedeVillage[],
  selected: ReadonlySet<string>,
  candidate: string,
): string | null {
  if (selected.has(candidate)) return null;
  const chosen = new Set([...selected, candidate]);
  const maps = new Set(villages.filter((v) => chosen.has(v.id)).map((v) => v.settlementId));
  const keeps = villages.some((v) => !maps.has(v.settlementId) && !v.asleep);
  return keeps ? null : PEACE_REASONS.lastVillage;
}
