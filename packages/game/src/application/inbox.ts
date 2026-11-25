import type { NewVillageEvent, VillageEvent } from '../domain/village';

/**
 * Druhy událostí, které úklid schránky po použití maže (`VillageInbox.pruneUsed`): snímky okolí
 * a zprávy bez nákladu plánu 3 – dotaz na partnera (`kin-ask`), dotaz na kováře (`smith-ask`)
 * a ohlášení hotové zakázky (`order-ready`). Jejich `ref` je ze dne a id a po dni použití se znovu
 * nezapisuje (snímek obnova okolí, zprávu krok dne, který je odeslal – jen jednou); ostatní
 * události (zboží, lidé, nájezdy) drží `ref` proti dvojímu zápisu, proto zůstávají.
 */
export const PRUNED_INBOX_KINDS = ['nearby', 'kin-ask', 'smith-ask', 'order-ready'] as const;

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
   * Smaže použité události vsi druhů `PRUNED_INBOX_KINDS` (snímky okolí a zprávy bez nákladu) se
   * dnem ≤ `upToDay` – jen tyto druhy: jejich `ref` se po dni použití znovu nezapisuje (`nearby.ts`
   * – `NEARBY_KEEP_DAYS`); ostatní události drží `ref` proti dvojímu zápisu, proto zůstávají. Verzi
   * vsi nemění (stav vsi se nemění). Vrací počet smazaných.
   */
  pruneUsed(villageId: string, upToDay: number): Promise<number>;
  /**
   * Výsledky trhu s lidmi (`market-result` s `people` nebo `newcomers`) nebo mincemi
   * (`unsold.coins` > 0) ve schránkách zaniklých vsí – ves spí (vymřela, opuštěná), nebo má sídlo
   * v archivu (Začít znovu) –, použité i nepoužité (rozliší je stav vsi), seřazené podle dne
   * a `seq`. Pro úlohu světa `returnStrandedPeople`.
   */
  strandedResults(): Promise<VillageEvent[]>;
  /**
   * Smaže vyřízené výsledky `eventIds` ze schránek zaniklých vsí (ty je už nepoužijí) – událost
   * živé vsi ani jiný druh nesmaže. Verzi vsi nemění (stav vsi se nemění). Vrací počet smazaných.
   */
  dropStranded(eventIds: readonly string[]): Promise<number>;
}

/**
 * Prázdná schránka – nic nevydá a nic nezapíše (`post` → null). Pro úložiště bez schránky
 * (kalibrace, jedna ves v paměti).
 */
export const EMPTY_INBOX: VillageInbox = {
  post: () => Promise.resolve(null),
  pending: () => Promise.resolve([]),
  pruneUsed: () => Promise.resolve(0),
  strandedResults: () => Promise.resolve([]),
  dropStranded: () => Promise.resolve(0),
};
