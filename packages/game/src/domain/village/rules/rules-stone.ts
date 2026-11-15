// Kámen a lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je
// na to nevhodný. Musíme zavést lom.“). Lom je rovná plocha u skal (Lom jako plocha u skal; Martin
// 14. 11. 2026 – schváleno): bloky se lámou u nejbližšího skalního výchozu a nosí na plochu, tam
// je kameník přisekává. Láme se na zakázku – když kámen potřebuje rozestavěná hradba nebo kostel,
// nebo když hráč zadá „nalámat do zásoby“. Z plochy se kámen nosí v nůších, nebo ho veze vůz
// (`CART_JOBS.stone`).

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
   * Vylomené bloky od výchozu na plochu lomu se nosí stejně, jen po `blockKg` (Lom jako plocha
   * u skal – Martin 14. 11. 2026: „…odnést třeba 40 kg těžký vylomený blok“): na m³ 4 m ≈ 0,12 čd,
   * 50 m ≈ 0,28 čd.
   */
  carry: { basketKg: 30, blockKg: 40, kgPerM3: 2500, loadS: 60 },
  /** Stavba lomu (Kámen; návrh Clauda): ≈ 20 čd – odkrýt a srovnat plochu a cestu ke skále, bez dřeva. */
  quarryLaborManDays: 20,
  /**
   * Plocha lomu (Lom jako plocha u skal; Martin 14. 11. 2026: „Má být v nějakém okruhu od skal –
   * tak aby člověk byl schopný odnést třeba 40 kg těžký vylomený blok“): čtverec `sizeM` (návrh
   * Clauda – hromady bloků a přisekaného kamene, kameník) na rovině – rozdíl výšek pod plochou
   * nejvýš `maxHeightDiffM` jako u humna – se středem nejvýš `rockReachM` od okraje skalního výchozu
   * (50 m návrh Clauda); výchoz je kruh `OUTCROP_RADIUS_M × velikost`.
   */
  quarryArea: { sizeM: 8, maxHeightDiffM: 1, rockReachM: 50 },
  /** Jedna zakázka „nalámat do zásoby“ (m³; návrh Clauda): nejméně 1, nejvýš 200. */
  stockOrderM3: { min: 1, max: 200 },
} as const;
