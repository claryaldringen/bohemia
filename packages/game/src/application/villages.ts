import type { VillageDigest, VillageState, VillageYearRow } from '../domain/village';

/** Uložená ves – stav simulace s verzí pro optimistické zamykání. */
export interface VillageRecord {
  /** Id vsi – sídlo (mapa) může mít víc vsí (migration.md – Víc vsí jednoho hráče). */
  id: string;
  /** Sídlo, na jehož krajině ves stojí. */
  settlementId: string;
  name: string;
  state: VillageState;
  /** Roste o 1 s každým uložením. */
  version: number;
}

/**
 * Co se o vsi dá zjistit bez načtení stavu: id, sídlo, jméno, verze a do kterého dne je
 * dopočítaná (`state.lastDay`) a jestli spí – dotazování na ves podle toho pozná, že se nic nezměnilo.
 */
export interface VillageStamp {
  id: string;
  settlementId: string;
  name: string;
  version: number;
  lastDay: number;
  /**
   * Ves spí – vymřela, nebo ji lidé opustili (`extinctDay` / `abandonedDay`): dál se nedopočítává
   * a worker ji přeskakuje. Pravidlo jako `isVillageExtinct` / `isVillageAbandoned`.
   */
  asleep: boolean;
}

/**
 * Ves jen se souhrnem (`VillageDigest`), bez stavu – ostatní vsi hráče pro přepínač vsí a konec
 * hry (`dynastyForVillage`). Souhrn je odvozený ze stavu uložené verze `version`.
 */
export interface VillageDigestRecord {
  id: string;
  settlementId: string;
  name: string;
  version: number;
  digest: VillageDigest;
}

/** Ves v pohledu rodu – celá (se stavem), nebo jen souhrn. */
export type DynastyVillage = VillageRecord | VillageDigestRecord;

/** Ves v pohledu rodu je celá (se stavem). */
export function isFullVillage(village: DynastyVillage): village is VillageRecord {
  return 'state' in village;
}

/**
 * Port: úložiště vsí. Sídlo (mapa) má nejvýš jednu ves – jedna ves, jedna mapa (Martin 1. 11.
 * 2026); ves má vlastní id.
 */
export interface VillageRepository {
  find(villageId: string): Promise<VillageRecord | null>;
  /** Ves sídla – nejvýš jedna (prázdný seznam = sídlo bez vsi). */
  listBySettlement(settlementId: string): Promise<VillageRecord[]>;
  /**
   * Atomicky založí ves sídla (verze 1); když už sídlo ves má, vrátí null a nic nezmění (jedna
   * ves, jedna mapa – i souběžná založení první zemnice).
   */
  create(settlementId: string, name: string, state: VillageState): Promise<VillageRecord | null>;
  /**
   * Ves s klíčem založení `origin` (`VillageState.origin` – schránka odchodu syna) v kterémkoli
   * sídle; žádná – null.
   */
  findByOrigin(origin: string): Promise<VillageRecord | null>;
  /**
   * Atomicky založí ves sídla se stavem nesoucím klíč `state.origin` (povinný): když ves s tímto
   * klíčem už existuje, vrátí ji a nic nezaloží (opakované i souběžné vybavení schránky se seřadí
   * na zámku řádku sídla). Neznámé sídlo, nebo sídlo, které už jinou ves má – null.
   */
  addOnce(settlementId: string, name: string, state: VillageState): Promise<VillageRecord | null>;
  /**
   * Uloží nový stav, jen když je uložená verze `expectedVersion` (jinak ji mezitím změnil
   * jiný požadavek) – pak vrátí null a nic nezmění. Vrácený záznam nese předaný stav (ne kopii
   * z úložiště) s novou verzí. `yearRows` = řádky deníku vsí za roky dokončené při dopočtu –
   * zapíšou se v témže uložení (jedna ves a rok = jeden řádek, opakovaný zápis ho přepíše).
   */
  save(
    villageId: string,
    state: VillageState,
    expectedVersion: number,
    yearRows?: readonly VillageYearRow[],
  ): Promise<VillageRecord | null>;
  /** Přejmenuje ves (stav ani verzi nemění); false = ves neexistuje. */
  rename(villageId: string, name: string): Promise<boolean>;
  /** Otisky všech vsí sídel `settlementIds` v pořadí založení – bez načtení stavu (levný dotaz). */
  stampsOf(settlementIds: readonly string[]): Promise<VillageStamp[]>;
  /**
   * Souhrny vsí `villageIds` bez stavu (levný dotaz – souhrn ukládá každé uložení vsi). Ves, která
   * souhrn současné verze nemá (uložená před ním, `isCurrentDigest`), ve výsledku chybí – volající
   * ji načte celou. Pořadí výsledku nehraje roli.
   */
  digestsOf(villageIds: readonly string[]): Promise<VillageDigestRecord[]>;
  /**
   * Seed počasí kraje – mapy (sídla), na které ves stojí (disasters.md – Kraj a ochrana nové vsi);
   * neznámé sídlo nebo úložiště bez počasí (testy, kalibrace) → null. Klientovi se nikdy neposílá.
   */
  weatherSeedOf(settlementId: string): Promise<number | null>;
}

/**
 * Port: přestávka v dlouhém dopočtu vsi. Use-case se po každém odsimulovaném dni zeptá (`day` =
 * index toho dne; u přestávek mimo dny, např. při přestavbě sítě cest, chybí) – slib = počkat
 * (server mezi tím obslouží jiné požadavky, běží v jednom vlákně), null = hned dál. Výsledek
 * dopočtu na přestávkách nezávisí.
 */
export type Pause = (day?: number) => Promise<void> | null;

/** Průběh dopočtu vsí rodu – dopočítané dny všech vsí dohromady z dnů, které jim chyběly. */
export interface ComputeProgress {
  doneDays: number;
  totalDays: number;
}

/**
 * Port: hlášení průběhu dlouhého dopočtu vsí (přeskok času – accounts.md, Vývojový režim). Jen
 * čte – výsledek dopočtu na hlášení nezávisí.
 */
export type ProgressReport = (progress: ComputeProgress) => void;

/** Výsledek herní akce nad vsí – ves po akci, nebo důvod odmítnutí česky pro hráče. */
export type VillageResult = { ok: true; village: VillageRecord } | { ok: false; reason: string };
