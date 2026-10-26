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
  /** Ves, které převod krajiny selhal: bez zvěře (bez lišek a medvěda), vlci jako dřív (návrh Clauda). */
  failedLand: { forestHa: 0, openHa: 0, waterHa: 0, pools: 0 },
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

/** Škody na polích (wildlife.md – Škody, Prasata a jeleni na polích; Odpovědi Martina 26. 10. 2026). */
export const FIELD_DAMAGE = {
  /** Okno škod začíná 1. 6. (měsíc, den). */
  windowStart: { month: 6, day: 1 },
  /** Kg obilí za den na kus: prase, sele, jelen, laň, kolouch. */
  kgPerDay: { adult: 1, piglet: 0.3, stag: 0.6, hind: 0.5, calf: 0.15 },
  /** Váha dílu 1 do `fullM` od okraje lesa, k `zeroM` klesá lineárně na 0. */
  weight: { fullM: 50, zeroM: 250 },
  /** Díl přijde za sezónu nejvýš o tento podíl úrody; zbytek zvěř spásla v lese. */
  maxShare: 0.5,
  /** Vrány: podíl úrody nehlídaného osetého dílu za celé okno plodiny. */
  crowShare: 0.02,
  /** Délka okna plodiny od 1. 6. do sklizně (dny): ozim do 31. 7., jař do 31. 8. */
  windowDays: { winter: 61, spring: 92 },
  /** Malá ves: škoda se násobí min(1; Σ plocha × váha polí u lesa ÷ tolik ha) (Martin 26. 10. 2026). */
  fullAreaHa: 10,
  /** Vzdálenost od lesa dílu bez krajiny a mimo les (m) – typická ves (návrh Clauda). */
  defaultEdgeM: 120,
} as const;

/** Šelmy na dobytku a slepicích (wildlife.md – Vlci na dobytku, Liška na slepicích). */
export const PREDATION = {
  /** Smečka, při které jsou ztráty stáda jako dřív (vlčí díl platí pro tolik vlků). */
  fullPack: 5,
  /** Vlčí díl ročních ztrát při plné smečce; základ `LIVESTOCK.lossPerYear` je o něj nižší. */
  wolfShare: { sheep: 0.03, goat: 0.03, pig: 0.02, cow: 0.01 },
  /** Ovce, kozy a skot jsou venku (a vlci je berou) od `from` do `to` včetně (měsíce). */
  pastureMonths: { from: 4, to: 10 },
  /** Prasata v lese: celý rok. */
  pigsAllYear: true,
  /**
   * Medvěd: prasat ročně z lesa a měsíce, kdy nespí (duben–listopad). Bere jen z prasat nad
   * chovný pár `keepPigs` (návrh Clauda: malá ves o poslední prasata nepřijde).
   */
  bear: { pigsPerYear: 2, fromMonth: 4, toMonth: 11, keepPigs: 2 },
  /** Liška ubere tento podíl vajec, všechny lišky nejvýš `eggMax`. */
  fox: { eggShare: 0.02, eggMax: 0.08 },
  /** Kolik dní zpět se pamatují dny, kdy šelmy strhly celý kus. */
  killDaysKept: 30,
} as const;
