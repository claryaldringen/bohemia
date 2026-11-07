// Typy stavu vsi – Trasy (paths.md – Kdy se trasy počítají a co se ukládá).
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

/**
 * Proč se trasou chodí: pro vodu, pro dřevo, za prací, na návštěvu (hřbitov, posvátná místa),
 * k sousedům, se stády na pastvu.
 */
export type RoutePurpose = 'water' | 'wood' | 'work' | 'visit' | 'neighbour' | 'herd';

/**
 * Uložená trasa (paths.md – Kdy se trasy počítají a co se ukládá): odkud kam se chodí a kudy –
 * buňky mřížky pěšin jako řetězový kód (počáteční buňka a kroky po 8 směrech, `paths/routes.ts`).
 */
export interface StoredRoute {
  /** Odkud – `d:<id obydlí>` (brána domu, i staveniště obydlí) nebo klíč stavby. */
  from: string;
  /** Kam – klíč cíle jako u práce (`field:<id>`, `water`, `wood`, `cemetery:<id>`, `d:<id>`…). */
  to: string;
  purpose: RoutePurpose;
  /** Cest za den v setinách (celé číslo) – trasy pod MIN_TRIP se neukládají. */
  trips: number;
  /** Počáteční buňka – buňka světa (index mřížky pěšin vůči krajině, ne vůči oknu). */
  start: [number, number];
  /** Kroky po 8 směrech, 3 bity na krok – dva kroky na znak base64, lichý konec s `=`. */
  steps: string;
  /**
   * Stálá část `trips` (setiny cest za den) – chůze na zavedené místo (pole, sad, ohrada, vchod
   * stavby), ne práce dne. Nese vyšlapanost i provoz; chybí = 0 (starší trasy). Nejvýš `trips`.
   */
  base?: number;
  /**
   * Podíl cest pochůzky, která se daleko chodí méně často (dřevo – `TripGroup.scale`): `trips` =
   * váha domácnosti × podíl; převážení (`reweighRoutes`) ho zachová. Chybí = 1.
   */
  scale?: number;
  /** Stavba, jejíž provoz trasa nese (`<druh>:<id>` – abandonment.md, `VillageRoads.visits`). */
  visit?: string;
}

/**
 * Trasy vsi – den výpočtu stálých tras, otisk mapy tras a míst (`VillageState.walkLayoutKey`),
 * pro který platí, a seznam stálých tras (trasy k práci dne se nehledají – paths.md, Stálé trasy,
 * pravidlo 5; vsi uložené s nimi je zahodí přepočtem `routes-v9`).
 */
export interface VillageRoutes {
  day: number;
  key: string;
  list: StoredRoute[];
  /**
   * Otisk obsazenosti (`routePlacesKey` – obydlené domácnosti, ohrady se zvířaty, otevřené jámy),
   * podle které jsou stálé trasy převážené. Změna jen převáží, nic se nehledá (Martin 31. 10. 2026
   * – paths.md, Stálé trasy, pravidlo 5). Chybí u tras uložených dřív.
   */
  placesKey?: string;
}
