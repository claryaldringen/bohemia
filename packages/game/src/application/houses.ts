import type { PersonRef } from '../domain/village';
import type { LanguageGroup } from '../domain/world';

/** Odkaz na osobu ve vsi: ves a číslo osoby v jejím stavu (tvar z domény – i hosté vsí). */
export type { PersonRef };

/**
 * Rod – záznam hráčova (`player`) nebo NPC (`npc`) rodu. Hráč má nejvýš jeden živý rod;
 * začít znovu = rod skončí (`endedAt`, `endedDay`) a vznikne nový. `lord` = hlava rodu.
 */
export interface House {
  id: string;
  playerId: string | null;
  kind: 'player' | 'npc';
  createdAt: Date;
  endedAt: Date | null;
  endedDay: number | null;
  lord: PersonRef | null;
  /** Naposledy zapsaný senior rodu (seniorate.md – Seniorát); null před prvním zápisem. */
  senior: PersonRef | null;
  /** Den smrti hráčova muže, pro který už bylo nástupnictví rozhodnuto; null – dosud žádné. */
  successionDay: number | null;
  /** Odchod vylosovaného mladšího syna, na jehož volbu hráč čeká; null – nic nečeká. */
  pendingDeparture: PendingDeparture | null;
  /** Herní rok posledního povýšení vesničana (vassalage.md – Povýšení vesničana); null – dosud žádné. */
  lastEnnobleYear: number | null;
  /** Jazyková skupina rodu – z účtu při založení, nemění se (newcomers.md – Jazyková skupina). */
  language: LanguageGroup;
  /**
   * Kdy rod dostal místo na mapě světa (newcomers.md – Odříznutá krajina); null – odříznutý
   * nováček čeká na pána, nikdo ho nevidí. Ochrana nováčka běží od umístění.
   */
  placedAt: Date | null;
  /** Kdy odříznutý nováček poprvé požádal o pána (začátek týdne na odpověď); null – dosud ne. */
  newcomerSince: Date | null;
}

/**
 * Odchod mladšího syna po pohřbu (seniorate.md – Nástupnictví hráče, bod 4): syn `sonId` ve vsi
 * `villageId`, po smrti otce ve dni `deathDay`; hráč má na volbu směru do dne `deadlineDay`, pak
 * výprava vyrazí sama.
 */
export interface PendingDeparture {
  villageId: string;
  sonId: number;
  deathDay: number;
  deadlineDay: number;
}

/** Port repozitáře rodů. */
export interface HouseRepository {
  /** Živý rod hráče, nebo null. */
  activeOf(playerId: string): Promise<House | null>;
  byId(id: string): Promise<House | null>;
  /**
   * Založí rod. Hráč, který už živý rod má, dostane ten existující (souběžná volání dají
   * jediný rod).
   */
  create(input: {
    playerId: string | null;
    kind: House['kind'];
    createdAt: Date;
    /** Jazyk rodu; bez něj čeština. */
    language?: LanguageGroup;
    /** Umístění na mapu světa; bez něj `createdAt`, null – odříznutý nováček (newcomers.md). */
    placedAt?: Date | null;
  }): Promise<House>;
  /** Ukončí rod; true jen když rod byl živý (z více souběžných volání uspěje jedno). */
  end(houseId: string, at: Date, day: number): Promise<boolean>;
  /** Zapíše, nebo (null) vymaže hlavu rodu. */
  setLord(houseId: string, lord: PersonRef | null): Promise<void>;
  /** Změní jazyk rodu (jen při volbě před založením vsi – languages.ts). */
  setLanguage(houseId: string, language: LanguageGroup): Promise<void>;
  /** Zapíše, nebo (null) vymaže naposledy hlášeného seniora rodu. */
  setSenior(houseId: string, senior: PersonRef | null): Promise<void>;
  /**
   * Podmíněný zápis nástupnictví hráče po smrti muže ve dni `deathDay` – jediný příkaz: jen když
   * `successionDay` je null nebo menší než `deathDay`, nastaví `successionDay`, hlavu rodu
   * `lord` a `pendingDeparture` (null – žádný). Vrací, zda zapsal (ze souběžných volání
   * uspěje jedno).
   */
  commitSuccession(
    houseId: string,
    input: { deathDay: number; lord: PersonRef; pendingDeparture: PendingDeparture | null },
  ): Promise<boolean>;
  /**
   * Smaže čekající odchod syna `sonId` (podmíněně – jen když je to ten odchod); true jen když
   * smazal (ze souběžných volání uspěje jedno).
   */
  clearPendingDeparture(houseId: string, sonId: number): Promise<boolean>;
  /**
   * Zapíše povýšení ve herním roce `year` (nejvýš jedno za rok): podmíněně – jen když rod letos
   * ještě nepovýšil; true jen když zapsal (ze souběžných volání uspěje jedno).
   */
  claimEnnoble(houseId: string, year: number): Promise<boolean>;
  /** Živé hráčovy rody založené po `since` (ochrana nováčka – upozornění na konec). */
  playerHousesSince(since: Date): Promise<House[]>;
  /**
   * Zapíše první žádost nováčka o pána (podmíněně – jen když ještě žádná nebyla a rod není
   * umístěný); vrací platný začátek týdne (zapsaný, nebo dřívější), null – rod je umístěný.
   */
  markNewcomerSince(houseId: string, at: Date): Promise<Date | null>;
  /** Živé odříznuté rody hráčů, které už požádaly o pána (`newcomerSince` není null). */
  waitingNewcomers(): Promise<House[]>;
}
