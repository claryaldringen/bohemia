import type { VillageState } from '../domain/village';

/** Uložená ves sídla – stav simulace s verzí pro optimistické zamykání. */
export interface VillageRecord {
  settlementId: string;
  name: string;
  state: VillageState;
  /** Roste o 1 s každým uložením. */
  version: number;
}

/** Port: úložiště vsí (jedna ves na sídlo). */
export interface VillageRepository {
  find(settlementId: string): Promise<VillageRecord | null>;
  /** Atomicky založí ves (verze 1); když už sídlo ves má, vrátí null a nic nezmění. */
  create(settlementId: string, name: string, state: VillageState): Promise<VillageRecord | null>;
  /**
   * Uloží nový stav, jen když je uložená verze `expectedVersion` (jinak ji mezitím změnil
   * jiný požadavek) – pak vrátí null a nic nezmění. Vrácený záznam nese předaný stav (ne kopii
   * z úložiště) s novou verzí.
   */
  save(
    settlementId: string,
    state: VillageState,
    expectedVersion: number,
  ): Promise<VillageRecord | null>;
  /** Přejmenuje ves (stav ani verzi nemění); false = sídlo ves nemá. */
  rename(settlementId: string, name: string): Promise<boolean>;
}

/**
 * Port: přestávka v dlouhém dopočtu vsi. Use-case se po každém odsimulovaném dni zeptá – slib =
 * počkat (server mezi tím obslouží jiné požadavky, běží v jednom vlákně), null = hned dál.
 * Výsledek dopočtu na přestávkách nezávisí.
 */
export type Pause = () => Promise<void> | null;

/** Výsledek herní akce nad vsí – ves po akci, nebo důvod odmítnutí česky pro hráče. */
export type VillageResult = { ok: true; village: VillageRecord } | { ok: false; reason: string };
