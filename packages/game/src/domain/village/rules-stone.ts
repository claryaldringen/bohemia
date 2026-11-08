// Kámen a lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je
// na to nevhodný. Musíme zavést lom.“). Kámen se láme jen v lomu na skalním výchozu mapy, na
// zakázku – když ho potřebuje rozestavěná hradba, nebo když hráč zadá „nalámat do zásoby“.

export const STONE = {
  /**
   * Lámání a dovoz 1 m³ kamene z lomu (Kámen; Martin 8. 11. 2026: hradba je „komplet“ a kámen z hromady z ní ušetří právě 1 čd na m³, proto lámání 1 čd na m³): čd
   * × příplatek za vzdálenost (`distanceFactor`) od lomu k místu, kam se kámen veze – ke
   * středu stavby hradby, do zásoby k hromadě u dvorce.
   */
  quarryManDaysPerM3: 1,
  /** Stavba lomu (Kámen; návrh Clauda): ≈ 20 čd – odkrýt skálu a cestu k ní, bez dřeva. */
  quarryLaborManDays: 20,
  /**
   * Jak daleko za okrajem výchozu smí ještě hráč ukázat, aby lom padl na ten výchoz (m; návrh
   * Clauda) – výchoz je kruh `OUTCROP_RADIUS_M × velikost`.
   */
  pickSlackM: 1,
  /** Jedna zakázka „nalámat do zásoby“ (m³; návrh Clauda): nejméně 1, nejvýš 200. */
  stockOrderM3: { min: 1, max: 200 },
} as const;
