// Bariéra ves × tažení (plán 2026-11-03 – rozhodnutí 13, Úloha 6.7; docs/code/war.md – Bariéra
// dopočtu): ves, na jejíž mapě (nebo políčko od ní) stojí tažení, se smí dopočítat jen do dne, do
// kterého je tažení spočítané; tažení na její mapě bere stav vsi ke konci předchozího dne
// (`CampaignWorld.villageAt`) a do té doby čeká. Obě strany se střídají – ves čeká jen na tažení na
// své mapě a tažení jen na ves ke dni `d − 1`, který ves smí spočítat – cyklus čekání nevznikne.

/** Port: do kterého dne se smí vsi dopočítat kvůli tažením u nich. */
export interface VillageHolds {
  /**
   * Mez každé z `villageIds`, u které stojí tažení (skupina nebo běžící posel na mapě vsi nebo
   * políčko od ní), nebo kterou tažení drží varováním (ves ve varování, kandidát hradiště, hradiště
   * skupiny uprchlíků – plán 2026-11-09, Úloha 3): nejmenší `holdDay` přes tato tažení. Ves bez
   * tažení ve výsledku chybí – dopočítá se jako dřív.
   */
  limitOf(villageIds: readonly string[]): Promise<Map<string, number>>;
}

/**
 * Mez vsi od jednoho tažení: poslední den, jehož takty má tažení v kontrolním bodu všechny
 * spočtené (`CampaignState.throughDay`; null – ves u tažení nestojí). Nedoručené události tažení do
 * vsi (`outboxDays` – dny událostí ve schránce, která po uložení bodu ještě čeká na doručení) mez
 * sníží pod svůj den – ves je dostane dřív, než ten den spočítá – i ves daleko od tažení (posel,
 * kronika domovské vsi). Nic nedrží – `Infinity`.
 */
export function holdDay(throughDay: number | null, outboxDays: readonly number[]): number {
  let day = throughDay ?? Infinity;
  for (const d of outboxDays) day = Math.min(day, d - 1);
  return day;
}

/**
 * Den, do kterého se ves dopočítá: `today`, s tažením u vsi nejvýš jeho mez – nikdy pod už
 * spočítaný `lastDay` (ves dopočtená dřív, než k ní tažení došlo, prostě počká).
 */
export function heldDay(today: number, lastDay: number, limit: number | undefined): number {
  return limit === undefined ? today : Math.max(lastDay, Math.min(today, limit));
}
