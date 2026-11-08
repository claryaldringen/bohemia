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
  /**
   * Meandry řek kostry – víc než u řeky prémie (Martin 8. 11. 2026: „řeka musí co nejvíce
   * meandrovat a být co nejpřirozenější“): amplituda (políčka); když by se tok sám dotkl, zkusí
   * se menší podíl amplitudy (`meanderFallback`), až nakonec rovně.
   */
  meanderAmplitude: [3, 5],
  meanderFallback: [0.65, 0.35, 0],
  /**
   * Délka dlouhé vlny meandrů roste se šířkou toku (užší přítok má kratší oblouky, asi 10–14
   * šířek toku): vlna `RIVER.wave` patří toku širokému `meanderWidthM`, užšímu úměrně kratší,
   * v mezích násobku.
   */
  meanderWidthM: 45,
  meanderWaveScale: [0.55, 1],
  /**
   * Pramen: řeka bez vtoku začíná v šířce potoka mapy, který do ní ústí (m), a k výtoku se plynule
   * rozšíří na šířku výřezu.
   */
  sourceWidthM: 15,
  /**
   * Soutok pod ostrým úhlem po proudu: přítok se posledních tolik políček stočí po proudu a vlévá
   * se rovně pod úhlem v těchto mezích (stupně, ze seedu) k ose hlavního toku.
   */
  junctionApproachCells: 10,
  junctionAngleDeg: [35, 50],
  /** Brod aspoň tolik políček od soutoku. */
  fordJunctionCells: 8,
  /**
   * Řeka první: terén se před trasami řek nakloní k výtoku – u vtoku (u pramene u jeho bodu)
   * o tolik metrů výš než u výtoku, mezi nimi plynule. Řeka tak má spád, i když vtok leží
   * v nejnižším místě terénu.
   */
  tiltM: 8,
  /** Rovina kolem místa pro vesnici mění terén až od tolika políček od vody řeky, plně od druhé meze. */
  villageFlattenRiverCells: [3, 11],
  /** Potok mapy: kolik nejlepších startů na okraji se zkusí, než pokus vzdá. */
  streamStartTries: 6,
} as const;
