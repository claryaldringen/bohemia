import type { VillageState } from '../domain/village';

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
 * dopočítaná (`state.lastDay`) – dotazování na ves podle toho pozná, že se nic nezměnilo.
 */
export interface VillageStamp {
  id: string;
  settlementId: string;
  name: string;
  version: number;
  lastDay: number;
}

/** Port: úložiště vsí. Sídlo (mapa) může mít víc vsí, každá má vlastní id. */
export interface VillageRepository {
  find(villageId: string): Promise<VillageRecord | null>;
  /** Vsi sídla v pořadí založení. */
  listBySettlement(settlementId: string): Promise<VillageRecord[]>;
  /**
   * Atomicky založí první ves sídla (verze 1); když už sídlo nějakou ves má, vrátí null a nic
   * nezmění (souběžná založení první zemnice).
   */
  create(settlementId: string, name: string, state: VillageState): Promise<VillageRecord | null>;
  /** Založí další ves sídla (víc vsí na téže mapě – migration.md). */
  add(settlementId: string, name: string, state: VillageState): Promise<VillageRecord>;
  /**
   * Uloží nový stav, jen když je uložená verze `expectedVersion` (jinak ji mezitím změnil
   * jiný požadavek) – pak vrátí null a nic nezmění. Vrácený záznam nese předaný stav (ne kopii
   * z úložiště) s novou verzí.
   */
  save(
    villageId: string,
    state: VillageState,
    expectedVersion: number,
  ): Promise<VillageRecord | null>;
  /** Přejmenuje ves (stav ani verzi nemění); false = ves neexistuje. */
  rename(villageId: string, name: string): Promise<boolean>;
  /** Otisky všech vsí sídel `settlementIds` – bez načtení stavu (levný dotaz). */
  stampsOf(settlementIds: readonly string[]): Promise<VillageStamp[]>;
}

/**
 * Port: přestávka v dlouhém dopočtu vsi. Use-case se po každém odsimulovaném dni zeptá – slib =
 * počkat (server mezi tím obslouží jiné požadavky, běží v jednom vlákně), null = hned dál.
 * Výsledek dopočtu na přestávkách nezávisí.
 */
export type Pause = () => Promise<void> | null;

/** Výsledek herní akce nad vsí – ves po akci, nebo důvod odmítnutí česky pro hráče. */
export type VillageResult = { ok: true; village: VillageRecord } | { ok: false; reason: string };
