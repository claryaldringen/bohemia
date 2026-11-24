import type { NewVillageEvent, VillageEvent } from '../domain/village';

/**
 * Port: schránka vsi (docs/code/village-core.md – Schránka vsi) – jediná cesta, jak cizí věc
 * změní ves. Dopočet (`updateVillage`) si před simulací vyžádá události z dopočítávaných dnů
 * a použije je na začátku jejich dne.
 */
export interface VillageInbox {
  /**
   * Zapíše událost. Den zápisu = `max(event.day, lastDay + 1)` uložené vsi – už spočítaný den se
   * nepřepočítává, událost připadne na nejbližší nespočítaný. Zápis v téže transakci zvedne verzi
   * vsi: rozběhnutý dopočet té vsi narazí při uložení na konflikt verze a zopakuje se i s událostí.
   * `null` = událost se stejným `ref` už ve schránce je (nic se nezapíše). Neznámá ves → chyba.
   */
  post(event: NewVillageEvent): Promise<VillageEvent | null>;
  /** Události vsi s `afterDay < day ≤ toDay`, seřazené podle dne a `seq`. */
  pending(villageId: string, afterDay: number, toDay: number): Promise<VillageEvent[]>;
  /**
   * Smaže snímky okolí (`nearby`) vsi se dnem ≤ `upToDay` – jen tento druh: jeho `ref` se po dni
   * použití znovu nezapisuje (`nearby.ts` – `NEARBY_KEEP_DAYS`); ostatní události drží `ref`
   * proti dvojímu zápisu, proto zůstávají. Verzi vsi nemění (stav vsi se nemění). Vrací počet
   * smazaných.
   */
  pruneNearby(villageId: string, upToDay: number): Promise<number>;
}

/**
 * Prázdná schránka – nic nevydá a nic nezapíše (`post` → null). Pro úložiště bez schránky
 * (kalibrace, jedna ves v paměti).
 */
export const EMPTY_INBOX: VillageInbox = {
  post: () => Promise.resolve(null),
  pending: () => Promise.resolve([]),
  pruneNearby: () => Promise.resolve(0),
};
