// Čísla správce vsi (steward.md). Každé číslo s odkazem na sekci návrhu; změna čísla = i text
// v návrhu.

/**
 * Rozmístění – mapa hodnot krajiny, plán sídla a výpočetní rozpočet (steward.md – Rozmístění
 * „absolutní skiller“; čísla návrh Clauda).
 */
export const STEWARD = {
  /** Mapa hodnot – Pole: podíl úrody, o který díl u okraje lesa přijde zvěří (× `edgeWeight`). */
  wildlifeEdgeLoss: 0.15,
  /**
   * Mapa hodnot – Pole: podíl úrody, o který díl za rok průměrně přijde počasím bez ochrany
   * zeleně; zeleň do `PROTECTION.fullGreenM` ho chrání celý, k `noGreenM` nic.
   */
  weatherLoss: 0.06,
  /**
   * Mapa hodnot – Pole: políčko jde do bloku pole, jen když má aspoň tolik z mediánu hodnoty
   * políček louky na území (horší nechá být – louka na seno, pastva).
   */
  fieldValueFloor: 0.5,
  /** Mapa hodnot – Dům: rozestup od ostatních domů (m mezi vyklízenými plochami – přeskok požáru). */
  houseSpacingM: 12,
  /** Mapa hodnot – Dům: největší rozdíl výšek políčka proti sousedům, kde se dům vůbec zkouší (m). */
  houseSlopeM: 1,
  /** Plán sídla – Hospodářství: lidé jedné domácnosti (≈ 6–8). */
  householdPeople: 7,
  /** Plán sídla – Rezervy pro růst: plán je na tolikanásobek dnešních lidí (nejvýš, co území uživí). */
  planPeopleFactor: 2,
  /** Plán sídla – plán aspoň na tolik domácností (nová ves s jednou rodinou). */
  minHouseholds: 4,
  /**
   * Plán sídla – Rezervy pro růst: blok pole domácnosti je o tolik větší, než dnešní úrodnost
   * bloku potřebuje (díly odpočívají, půda se vyčerpá).
   */
  blockReserve: 1.25,
  /**
   * Plán sídla – Šablony: hustší šablona (shluk před řadovou vsí, ta před samotami) vyhraje, pokud
   * řidší ušetří méně než tento podíl ceny – hustá ves má výhody, které cena nezachytí (hašení,
   * obrana, sousedská pomoc).
   */
  templateMargin: 0.1,
  /** Plán sídla – Šablony: řadová ves staví domy do tolika metrů od vody. */
  rowWaterM: 100,
  /** Plán sídla – Šablony: cesty ke dvorci – pochůzky na domácnost za den (tam a zpět). */
  centreTripsPerDay: 1,
  /** Plán sídla – Šablony: pro dřevo a palivo do lesa – pochůzky na domácnost za rok (tam a zpět). */
  woodTripsPerYear: 60,
  /** Kdy se plán přepočítá: víc změn staveb hráče než tolik od posledního plánu. */
  replanChanges: 3,
  /** Kdy se plán přepočítá: nejdřív po tolika letech. */
  replanYears: 5,
  /** Výběr místa pro jednu stavbu: nejvýš tolik dalších slotů za den správce. */
  slotTries: 5,
  /** Výpočetní rozpočet: kandidáti domů – nejvýš tolik kontrol umístění v celém plánu. */
  candidateChecks: 200,
  /** Výpočetní rozpočet: kontroly umístění v jedné etapě plánu (etapa ≤ 200 ms). */
  checksPerStage: 40,
  /** Plán sídla – Ostatní: slotů jednoho druhu (hřbitov, sad, ohrada, humno, dílna) nejvýš. */
  extraSlots: 8,

  // Den správce – rozhodování, režim a rozpočet (steward.md – Kde správce běží, Cíl „Růst se
  // zásobou“, Rozhodovací pořadí v den správce, Den správce – upřesnění; čísla návrh Clauda)

  /** Kde správce běží – Den správce: správce rozhoduje v den s indexem dělitelným tímto číslem. */
  everyDays: 10,
  /** Cíl – Režim správce: pojistka zásob (`bufferFill`) pod tímto podílem = Nouze. */
  emergencyFill: 0.5,
  /**
   * Cíl – Rozpočet práce: zbývající práce rozestavěných staveb nejvýš průměrná volná práce
   * posledních 30 dní × tolik dní.
   */
  laborHorizonDays: 120,
  /** Cíl – Cíl polí: pole mají uživit lidi, kteří ve vsi budou za tolik let. */
  fieldLeadYears: 2,
  /** Cíl – Cíl polí: rezerva nad cílem (díly nad potřebu na kruté roky). */
  fieldReserve: 1.1,
  /** Rozhodovací pořadí – 3. Pole: okna zakládání pole na louce a v křovinách. */
  meadowFieldWindows: [
    [
      { month: 9, day: 1 },
      { month: 2, day: 28 },
    ],
    [
      { month: 6, day: 15 },
      { month: 7, day: 31 },
    ],
  ] as readonly StewardWindow[],
  /** Rozhodovací pořadí – 3. Pole, Klučení lesa: okno zakládání pole v lese (kácení přes zimu). */
  forestFieldWindows: [
    [
      { month: 10, day: 1 },
      { month: 1, day: 31 },
    ],
  ] as readonly StewardWindow[],
  /**
   * Cíl – Režim správce, Nouze: konce oken setí (jař do 30. 4., ozim do 31. 10. – fields.md, Ozim
   * a jař) – pole v Nouzi jen, když se do nejbližšího konce stihne založit.
   */
  sowingEnds: [
    { month: 4, day: 30 },
    { month: 10, day: 31 },
  ] as readonly StewardMonthDay[],
  /** Rozhodovací pořadí – Obydlí, typ: polozemnice jen, když se dostaví do tohoto dne (zima). */
  winterStart: { month: 11, day: 1 } as StewardMonthDay,
  /** Den správce – upřesnění, Klučení: les pro pole nejvýš tolik políček od bloku hospodářství. */
  forestSearchTiles: 10,
  /** Den správce – upřesnění, Obydlí u dvorce: bez plánu domy nejvýš tolik políček od středu vsi. */
  centreHouseTiles: 6,
} as const;

/** Den v roce (měsíc a den) – hranice oken správce. */
export interface StewardMonthDay {
  readonly month: number;
  readonly day: number;
}

/** Okno roku od `from` do `to` včetně; `from` po `to` = okno přes Nový rok. */
export type StewardWindow = readonly [StewardMonthDay, StewardMonthDay];
