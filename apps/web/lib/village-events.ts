import type { ServerEvents } from './server-events/protocol';
import type { VillageView } from './village-view';

// Událost `village` (docs/code/server-events.md – Klient; plán 2026-11-15 – Rozhodnutí 5): pohled
// nese verze vsí hráče (`VillageView.versions`), z nichž je složený. Událost s verzí, kterou
// prohlížeč už má, se zahodí – vlastní akce tak nevyvolá druhý dotaz. Čistý modul.

/**
 * Stojí událost za dotaz na ves? Ne jen u vsi, jejíž verzi pohled zná, s verzí nejvýš touto.
 * Změna sídla (`villageId` null), pohled bez verzí (spravovaná ves) i bez pohledu – vždy ano.
 * Změna samotného jména vsi verzi nemění – přijde s nejbližší novou verzí.
 */
export function villageEventIsNews(
  view: VillageView | null,
  event: ServerEvents['village'],
): boolean {
  if (view === null || event.villageId === null || event.version === null) return true;
  const known = view.versions?.[event.villageId];
  return known === undefined || event.version > known;
}
