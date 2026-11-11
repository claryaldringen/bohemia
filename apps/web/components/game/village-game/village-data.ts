import type { VillageView } from '@/lib/village-view';

/** Stav vsi ze serveru: pohled na ves, ještě nezaložená (null), nebo chyba (svět neběží…). */
export type VillageData = VillageView | null | { error: string };

/** Odpověď akce nad vsí: nový pohled, nebo chyba pro hráče. */
export type ActionResult = VillageView | { error: string };

/** Hláška hráči, když server action neodpoví. */
export const CONNECTION_FAILED = 'Spojení se serverem selhalo.';

export function isVillageView(state: VillageData): state is VillageView {
  return state !== null && !('error' in state);
}

/** Pohled bez otisku – další dotaz pošle plný pohled. */
export function withoutStamp(view: VillageView): VillageView {
  const rest = { ...view };
  delete rest.stamp;
  // bez otisků kusů – další dotaz doručí celý pohled (view-pieces.ts)
  delete rest.pieces;
  return rest;
}
