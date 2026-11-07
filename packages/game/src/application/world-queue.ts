// Fronta workeru (docs/superpowers/plans/2026-10-31-worker.md – 1. Co worker dělá): hráči, kteří
// mají nespící ves pozadu za svým dneškem, nejvíc pozadu první. Adaptér (jeden dotaz nad sloupci
// `last_day` / `asleep`, bez JSON stavu) je v `packages/db`.

/** Hráč, jehož vsi jsou pozadu za jeho dneškem. */
export interface PlayerBehind {
  playerId: string;
  /** Dnešní den hráče – den světa + posun času, nejvýš poslední den světa (`playerDay`). */
  today: number;
  /**
   * Nejstarší `lastDay` jeho nespící vsi na aktivním sídle, která má co dopočítat (vždy < `today`;
   * ves na mezi bariéry se nepočítá).
   */
  oldestDay: number;
}

/** Port: kdo z hráčů je se svými vsemi nejvíc pozadu. */
export interface WorldQueue {
  /**
   * Nejvýš `limit` hráčů s nespící vsí aktivního sídla, jejíž `lastDay` je před dneškem hráče,
   * seřazených podle zpoždění (`today − oldestDay`) sestupně, pak podle id hráče (pořadí bajtů).
   * Spící vsi (vymřelé, opuštěné) a archivovaná sídla se nepočítají. `holds` = meze bariéry vsí
   * s tažením u nich (`VillageHolds.limitOf` přednostních vsí): ves na své mezi není pozadu a hráč
   * s přednostní vsí pod mezí jde před ostatními.
   */
  behind(
    worldDay: number,
    limit: number,
    holds?: ReadonlyMap<string, number>,
  ): Promise<PlayerBehind[]>;
  /**
   * Vsi, u kterých stojí tažení (skupina na mapě vsi nebo políčko od ní – `VillageHolds`): worker
   * je bere přednostně, ať tažení nečeká (plán 2026-11-03 – Úloha 6.7). Pořadí nehraje roli.
   */
  priorityVillages(): Promise<string[]>;
}
