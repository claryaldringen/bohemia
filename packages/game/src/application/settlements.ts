import type { Landscape, LayerVersions } from '../domain/landscape';
import type { OccupiedCell } from '../domain/world';

/** Políčko mřížky světa – sloupec x a řádek y (war.md – Svět, sousední mapy). */
export interface WorldCell {
  x: number;
  y: number;
}

/**
 * Sídlo (aglomerace) hráče – mapa s vlastní krajinou ze seedu. Na jedné mapě může stát víc vsí
 * hráče (migration.md – Víc vsí jednoho hráče).
 */
export interface Settlement {
  id: string;
  ownerId: string;
  /** Sídelní sídlo hráče – první sídlo, kde hráč začíná. */
  isSeat: boolean;
  landscapeSeed: number;
  layerVersions: LayerVersions;
  /**
   * Poloha mapy v mřížce světa (odchod na novou mapu vedle staré – migration.md, fáze 4);
   * sídelní sídla z doby před mřížkou ji nemají (null).
   */
  worldCell: WorldCell | null;
  createdAt: Date;
}

/**
 * Port: úložiště sídel. Sídla hráče jsou aktivní, dokud je restart hry neodloží do archivu
 * (population.md – Hlad a vymření); archivovaná sídla repozitář nevrací.
 */
export interface SettlementRepository {
  findSeat(ownerId: string): Promise<Settlement | null>;
  /** Aktivní sídlo podle id (zásilky a další akce mezi hráči); archivované nebo neznámé null. */
  find(settlementId: string): Promise<Settlement | null>;
  /** Aktivní sídla hráče – sídelní první, pak podle založení. */
  listActive(ownerId: string): Promise<Settlement[]>;
  /**
   * Odloží sídlo do archivu (restart hry): přestane být aktivní i sídelní, data zůstanou.
   * True, když ho archivovalo tohle volání; už archivované nebo neznámé → false.
   */
  archive(settlementId: string): Promise<boolean>;
  /**
   * Atomicky založí sídelní sídlo hráče na políčku `worldCell`; když už hráč sídelní sídlo má,
   * vrátí ho beze změny. Políčko obsazené mapou jiného hráče → null (nováček zkusí jiné).
   */
  createSeat(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    worldCell: WorldCell;
  }): Promise<Settlement | null>;
  /**
   * Založí další (nesídelní) sídlo hráče – novou mapu na políčku mřížky světa (odchod na novou
   * mapu, migration.md). Mřížka je společná všem hráčům: políčko je nejvýš jedno aktivní
   * sídlo kohokoli – obsazené → null.
   */
  create(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    worldCell: WorldCell;
  }): Promise<Settlement | null>;
  /** Aktivní mapy všech hráčů s polohou v mřížce světa – vstup umístění nového hráče. */
  occupiedCells(): Promise<OccupiedCell[]>;
  /**
   * Dá sídlu bez polohy políčko mřížky (sídelní sídlo z doby před mřížkou – (0, 0)); sídlo,
   * které polohu už má, nemění. Vrátí sídlo s polohou, neznámé nebo archivované null.
   */
  assignWorldCell(settlementId: string, cell: WorldCell): Promise<Settlement | null>;
  /**
   * 1. krok převodu držitele (odúmrť – vassalage.md): pod zámkem **starého** držitele `fromOwnerId`
   * sídlo dostane čekajícího držitele `toOwnerId` – od té chvíle ho nemá nikdo (`listActive` ho
   * nevrátí starému ani novému, worker ho počítá až u nového). Podmíněně: jen když sídlo drží
   * `fromOwnerId` a nic nečeká; true při změně.
   */
  transferHolder(settlementId: string, fromOwnerId: string, toOwnerId: string): Promise<boolean>;
  /**
   * 2. krok převodu: pod zámkem **nového** držitele převezme všechna sídla, která na něj čekají
   * (`owner_id` = on, sídelní nejsou). Idempotentní; vrací převzatá sídla.
   */
  acceptTransfers(ownerId: string): Promise<Settlement[]>;
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
