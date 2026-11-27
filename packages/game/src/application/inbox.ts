import type { NewVillageEvent, VillageEvent } from '../domain/village';

/**
 * Druhy událostí, které úklid schránky po použití maže (`VillageInbox.pruneUsed`): snímky okolí
 * a zprávy bez nákladu plánu 3 – dotaz na partnera (`kin-ask`), dotaz na kováře (`smith-ask`)
 * a ohlášení hotové zakázky (`order-ready`). Jejich `ref` je ze dne a id a po dni použití se znovu
 * nezapisuje (snímek obnova okolí, zprávu krok dne, který je odeslal – jen jednou); ostatní
 * události (zboží, lidé, nájezdy) drží `ref` proti dvojímu zápisu, proto zůstávají – vyřízené příjezdy
 * a výsledky výprav uklidí zvlášť `pruneSettledMail` (`SETTLED_MAIL_KINDS`).
 */
export const PRUNED_INBOX_KINDS = ['nearby', 'kin-ask', 'smith-ask', 'order-ready'] as const;

/**
 * Druhy zpráv výprav na trh, jejichž vyřízené řádky maže úklid `pruneSettledMail` – příjezd a výsledek.
 * Lidé, mince a zlato zpět hostiteli (`stranded-people`) mezi nimi nejsou a nesmějí být: jejich `ref` je jediná
 * ochrana proti druhému vrácení.
 */
export const SETTLED_MAIL_KINDS = ['market-arrive', 'market-result'] as const;

/** Použitý příjezd nebo výsledek výpravy ve schránce vsi bez těla (`VillageInbox.settledMail`). */
export interface SettledMail {
  id: string;
  ref: string;
  day: number;
  kind: (typeof SETTLED_MAIL_KINDS)[number];
  /** Odesílatel (id vsi) – pole `from` těla, u příjezdu bez něj domovská ves z `ref`; neznámý = null. */
  sender: string | null;
}

/**
 * Kdo vydal zprávu výpravy `kind` s `ref`: `from` z těla (doplňuje ho pošta), starší příjezd bez něj
 * domovská ves z `ref` (`market:<domov>:<id>:in`); starší výsledek neví – null.
 */
export function senderOfMail(
  kind: SettledMail['kind'],
  ref: string,
  from: string | null | undefined,
): string | null {
  if (from) return from;
  return kind === 'market-arrive' ? (/^market:([^:]+):/.exec(ref)?.[1] ?? null) : null;
}

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
   * Použité příjezdy a výsledky výprav vsi (`SETTLED_MAIL_KINDS`) se dnem ≤ `upToDay` – lehké řádky bez
   * těl, seřazené podle dne a `seq`, bez meze počtu. Pro úklid `pruneSettledMail`.
   */
  settledMail(villageId: string, upToDay: number): Promise<SettledMail[]>;
  /**
   * Smaže řádky `eventIds` schránky vsi – jen příjezdy a výsledky výprav (`SETTLED_MAIL_KINDS`); verzi
   * vsi nemění (stav vsi se nemění). Vrací počet smazaných. Smazaný `ref` jde zapsat znovu, proto jen
   * řádky, které odesílatel znovu poslat nemůže (`pruneSettledMail`).
   */
  dropSettledMail(villageId: string, eventIds: readonly string[]): Promise<number>;
  /**
   * Výsledky trhu s lidmi (`market-result` s `people` nebo `newcomers`) nebo mincemi
   * (`unsold.coins` > 0) nebo zlatem (`unsold.gold` + `bought.gold` > 0) ve schránkách zaniklých vsí – ves spí (vymřela, opuštěná), nebo má sídlo
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
  settledMail: () => Promise.resolve([]),
  dropSettledMail: () => Promise.resolve(0),
  strandedResults: () => Promise.resolve([]),
  dropStranded: () => Promise.resolve(0),
};
