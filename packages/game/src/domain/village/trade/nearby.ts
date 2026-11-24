// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): snímek vsí na 8 sousedních mapách přijde
// událostí schránky `nearby` v pevné dny (zapíše ho dopočet – `application/nearby.ts`), další
// ho celý nahradí. Simulace nezná ostatní vsi ani své id – cíle výprav vesničanů a správce bere jen
// odsud, takže rozhodnutí zůstane uvnitř dne a nezávisí na kouscích dopočtu. O řemeslech sousedů
// ví ves jen ze zpráv na pivo (`news` – Rozhodnutí plánu 3, bod 2).
import type {
  ChronicleEvent,
  Craft,
  MarketTarget,
  NearbyVillage,
  VillageNearby,
  VillageState,
} from '../types';

/**
 * Událost schránky `nearby`: snímek nahradí starý celý, den je den události (schránka mohla zápis
 * posunout na nejbližší nespočtený den). Kronika nic. Mutuje stav jako kroky dne.
 */
export function applyNearby(
  state: VillageState,
  day: number,
  nearby: VillageNearby,
): ChronicleEvent[] {
  state.nearby = { ...structuredClone(nearby), day };
  return [];
}

/** Cíl výpravy na trh do vsi okolí `villageId` – domovská ves ze `self`; mimo okolí null. */
export function nearbyTarget(state: VillageState, villageId: string): MarketTarget | null {
  const nearby = state.nearby;
  const village = nearby?.villages.find((v) => v.villageId === villageId);
  if (!nearby || !village) return null;
  return {
    villageId: village.villageId,
    name: village.name,
    cells: village.cells,
    firstStep: village.firstStep,
    homeVillageId: nearby.self.villageId,
    homeName: nearby.self.name,
  };
}

/** Nejbližší ves okolí (první v pořadí okolí); bez okolí null. */
export function nearestNearby(state: VillageState): NearbyVillage | null {
  return state.nearby?.villages[0] ?? null;
}

/**
 * Nejbližší ves okolí, o jejímž řemeslníkovi `craft` ves ví ze zprávy na pivo (`news`,
 * `report.crafts`), kromě vsí, které `skip` vynechá (vesničané – ves, která zakázku nevzala, a jde se
 * k další; Rozhodnutí plánu 3, bod 6); bez okolí nebo bez takové zprávy null.
 */
export function nearestWith(
  state: VillageState,
  craft: Craft,
  skip?: (village: NearbyVillage) => boolean,
): NearbyVillage | null {
  const news = state.news ?? [];
  const known = (village: NearbyVillage): boolean =>
    !skip?.(village) &&
    news.some((n) => n.villageId === village.villageId && n.report.crafts.includes(craft));
  return state.nearby?.villages.find(known) ?? null;
}
