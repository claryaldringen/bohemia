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
  /** Stavba, jejíž provoz trasa nese (`<druh>:<id>` – abandonment.md, `PathNetwork.visits`). */
  visit?: string;
}

/**
 * Trasy vsi – den výpočtu, otisk rozložení (`VillageState.walkLayoutKey`), pro které platí,
 * a seznam tras posledního kola sítě pěšin.
 */
export interface VillageRoutes {
  day: number;
  key: string;
  list: StoredRoute[];
}
