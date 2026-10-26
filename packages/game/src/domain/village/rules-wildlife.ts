// Čísla pravidel divoké zvěře – každé s odkazem na sekci návrhu `docs/design/wildlife.md`.

/** Krajina kolem vsi (wildlife.md – Kde zvěř žije a kolik jí je). */
export const WILDLIFE_LAND = {
  /** Dosah od středu vsi (m). */
  reachM: 1000,
  /** Les menší než tolik ha (háj v loukách) se nepočítá. */
  minPatchHa: 1,
  /** Tůně na stejném místě osy potoka bližší než tolik m se slučují. */
  poolMergeM: 60,
  /** Úsek osy potoka je tůní od této hodnoty `pool` (0–1). */
  poolMin: 0.5,
  /** Krajina vsi bez údajů o krajině (testy, kalibrace) – typická ves z návrhu. */
  defaultLand: { forestHa: 190, openHa: 120, waterHa: 2.5, pools: 2 },
} as const;

/** Stropy kusů (wildlife.md – Kde zvěř žije a kolik jí je, tabulka). */
export const WILDLIFE_CAPS = {
  /** Jelení zvěř na 100 ha lesa. */
  deerPer100Ha: 5,
  /** Divoká prasata na 100 ha lesa bez 1 ha na prase vsi (diet.md). */
  boarPer100Ha: 5,
  /** Zajíci na 100 ha luk, příloh a polí. */
  haresPer100Ha: 15,
  /** Lišky na 100 ha lesa a luk a nejvýš. */
  foxesPer100Ha: 1,
  foxesMax: 4,
  /** Vlci: 0 pod `none` ha lesa, `most` od `full` ha, mezi tím poměrně. */
  wolves: { noneBelowHa: 100, full: 5, fullFromHa: 200 },
  /** Medvěd je, když lesa je aspoň tolik ha. */
  bearForestHa: 150,
  /** Ryby: kg na ha vody. */
  fishKgPerHa: 300,
  /** Rozdělení jelení zvěře na stropu (jeleni : laně : kolouši). */
  deerShare: { stags: 2, hinds: 5, calves: 3 },
  /** Podíl dospělých prasat na stropu (zbytek selata). */
  boarAdultShare: 0.5,
} as const;

/** Roční přepočet 1. 5. (wildlife.md – Roční přepočet – 1. 5.). */
export const WILDLIFE_YEAR = {
  month: 5,
  day: 1,
  /** Nových kolouchů na laň. */
  calvesPerHind: 0.6,
  /** Úbytek dospělých jelenů a laní: základ a navíc za každého vlka. */
  deerLoss: 0.1,
  deerLossPerWolf: 0.01,
  /** Nových selat na dospělé prase a úbytek dospělých. */
  pigletsPerAdult: 1,
  boarLoss: 0.2,
  /** Zajíci za rok násobek (nejvýš strop). */
  haresGrowth: 2,
  /** Vlkům přibude tento podíl toho, co chybí do stropu. */
  wolfRefill: 0.5,
  /** Medvěd po úlovku přijde zpět za tolik let. */
  bearReturnYears: 3,
  /** Vybité ryby se při přepočtu osadí tímto podílem stropu (návrh Clauda). */
  fishRestock: 0.01,
} as const;

/** Hejna vran (wildlife.md – Kde zvěř žije, ptáci). */
export const CROWS = { base: 1, haPerFlock: 10, max: 5 } as const;
