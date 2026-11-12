// Kámen a lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je
// na to nevhodný. Musíme zavést lom.“). Kámen se láme jen v lomu na skalním výchozu mapy, na
// zakázku – když ho potřebuje rozestavěná hradba nebo kostel, nebo když hráč zadá „nalámat do
// zásoby“. Kámen se nosí v nůších, nebo ho veze vůz (`CART_JOBS.stone`).

export const STONE = {
  /**
   * Lámání 1 m³ kamene v lomu bez nošení (Kámen; Martin 8. 11. 2026: hradba je „komplet“ a kámen
   * z hromady z ní ušetří právě 1 čd na m³, proto lámání 1 čd na m³): čd. Nošení na místo, kam se
   * kámen veze (ke středu stavby hradby, ke kostelu, do zásoby k hromadě u dvorce), je `carry`.
   */
  quarryManDaysPerM3: 1,
  /**
   * Nošení kamene v nůších (Kámen – Nošení kamene a vůz; Martin 12. 11. 2026: „A“ – nošení počítat
   * poctivě; čísla návrh Clauda): `basketKg` na cestu, kámen `kgPerM3` (≈ 83 cest na m³), chůze
   * tam i zpět po vzdušné vzdálenosti tempem `WATER_FETCHING.speedMps`, naložení a složení `loadS`
   * na cestu, den `WATER_FETCHING.dayHours`. Na m³ u lomu ≈ 0,14 čd, 100 m ≈ 0,6 čd, 300 m ≈ 1,5 čd.
   */
  carry: { basketKg: 30, kgPerM3: 2500, loadS: 60 },
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
