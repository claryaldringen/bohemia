import type { Landscape, LayerVersions } from '../domain/landscape';

/** Sídlo (aglomerace) hráče – každé má vlastní krajinu ze seedu. */
export interface Settlement {
  id: string;
  ownerId: string;
  /** Sídelní sídlo hráče – první sídlo, kde hráč začíná. */
  isSeat: boolean;
  landscapeSeed: number;
  layerVersions: LayerVersions;
  createdAt: Date;
}

/**
 * Port: úložiště sídel. Sídla hráče jsou aktivní, dokud je restart hry neodloží do archivu
 * (population.md – Hlad a vymření); archivovaná sídla repozitář nevrací.
 */
export interface SettlementRepository {
  findSeat(ownerId: string): Promise<Settlement | null>;
  /** Aktivní sídla hráče – sídelní první, pak podle založení. */
  listActive(ownerId: string): Promise<Settlement[]>;
  /**
   * Odloží sídlo do archivu (restart hry): přestane být aktivní i sídelní, data zůstanou.
   * True, když ho archivovalo tohle volání; už archivované nebo neznámé → false.
   */
  archive(settlementId: string): Promise<boolean>;
  /** Atomicky založí sídelní sídlo hráče; když už existuje, vrátí existující beze změny. */
  createSeat(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
  }): Promise<Settlement>;
}

/** Port: zdroj nových seedů krajiny – náhoda přichází zvenku, doména je deterministická. */
export interface SeedSource {
  /** Celé číslo 0 … 2^31 − 1. */
  nextSeed(): number;
}

/**
 * Port: krajina uloženého sídla ze seedu přijatého pokusu. Generování trvá desítky až stovky
 * ms – vstupní bod ji může držet v mezipaměti (krajina se pro daný seed a verze nemění).
 */
export interface LandscapeSource {
  landscapeOf(attemptSeed: number, versions: LayerVersions): Landscape;
}
