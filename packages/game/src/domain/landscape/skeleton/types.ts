// Výřez kostry světa – co z řek a dálkových stezek světa dostane jedna mapa (world-skeleton.md –
// Kostra jako čistá funkce světa, Body na okraji). Počítá ho `world/skeleton`, generátor krajiny
// ho čte jako vstup.

/** Strana mapy: sever = +y mřížky světa = +z mapy, východ = +x. */
export type MapSide = 'N' | 'E' | 'S' | 'W';

/**
 * Bod řeky na okraji mapy. `at` je políčko podél strany (24–103 ze 128), počítané od západu
 * (strany N, S) a od jihu (E, W) – sousední mapa čte na společné hraně stejné číslo.
 */
export interface SkeletonRiverPort {
  readonly side: MapSide;
  readonly at: number;
  /** Šířka řeky v bodě okraje – obě mapy ji berou z horního políčka hrany. */
  readonly widthM: number;
  /** Vtéká do mapy, nebo z ní vytéká. */
  readonly flow: 'in' | 'out';
}

/** Bod dálkové stezky na okraji mapy – `at` stejně jako u řeky. */
export interface SkeletonTrailPort {
  readonly side: MapSide;
  readonly at: number;
}

/**
 * Výřez kostry jedné mapy – body řek a stezek na okraji, seřazené podle strany (N, E, S, W)
 * a podle `at`. Mapa bez řeky i stezky má výřez null (suchá mapa).
 */
export interface SkeletonSlice {
  /** Verze grafu kostry – po ostrém spuštění se nesmí změnit (world-skeleton.md – Uložení). */
  readonly world: 1;
  readonly rivers: readonly SkeletonRiverPort[];
  readonly trails: readonly SkeletonTrailPort[];
}

/** Pořadí stran ve výřezu. */
export const MAP_SIDES: readonly MapSide[] = ['N', 'E', 'S', 'W'];

/** Řazení bodů na okraji – podle strany (N, E, S, W), pak podle `at`. */
export function comparePorts(
  a: { readonly side: MapSide; readonly at: number },
  b: { readonly side: MapSide; readonly at: number },
): number {
  return MAP_SIDES.indexOf(a.side) - MAP_SIDES.indexOf(b.side) || a.at - b.at;
}

/**
 * Stabilní řetězec výřezu – klíč mezipamětí krajin a zlatého otisku kostry. Stejný výřez dá vždy
 * stejný řetězec (body se řadí znovu), suchá mapa (null) dá ''.
 */
export function skeletonKey(slice: SkeletonSlice | null): string {
  if (slice === null) return '';
  const rivers = [...slice.rivers]
    .sort(comparePorts)
    .map((p) => `${p.side}${p.at}:${p.widthM}${p.flow === 'in' ? '<' : '>'}`)
    .join(',');
  const trails = [...slice.trails]
    .sort(comparePorts)
    .map((p) => `${p.side}${p.at}`)
    .join(',');
  return `w${slice.world};r${rivers};t${trails}`;
}
