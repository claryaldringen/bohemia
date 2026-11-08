// Čísla mapy z kostry světa (world-skeleton.md – Mapa z kostry – generátor krajiny). Tvar koryta,
// meandry, brody, hloubka a niva řek jsou z `RIVER` (premium/river.ts); čísla kostry světa
// (povodí, šířky v bodech okraje) z `SKELETON` (world/skeleton/rules-skeleton.ts). Návrh Clauda,
// doladí je pásmo a měření generátoru.

export const SKELETON_MAP = {
  /** Soutok přítoku s hlavním tokem aspoň tolik políček od okraje mapy. */
  junctionEdgeCells: 20,
  /** Ústí potoka mapy (jeho začátek u okraje) aspoň tolik políček od každého bodu řeky. */
  streamMouthPortCells: 20,
  /** Pramen: hlavní tok začíná tolik políček od výtoku směrem do mapy… */
  sourceCells: 40,
  /** …posunutý podél strany výtoku nejvýš o tolik políček (ze seedu). */
  sourceShiftCells: 12,
  /** Tok vtéká do mapy a vytéká z ní kolmo k okraji – rovný úsek tolika políček od bodu okraje. */
  portLeadCells: 6,
  /** Přítok vede vlastním údolím – v tomto pásu kolem hlavního toku je krok dražší (políčka). */
  courseGapCells: 9,
  /** Šířka toku se podél toku mění o ± tento podíl (v bodech okraje a u soutoku přesně). */
  widthWave: 0.1,
  /** Brod aspoň tolik políček od soutoku. */
  fordJunctionCells: 8,
} as const;
