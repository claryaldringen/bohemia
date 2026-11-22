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
  /** Měsíce, kdy zvěř škodí (červen–srpen) – mimo ně denní hrozba 0. */
  windowMonths: { from: 6, to: 8 },
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

/** Obrana polí (wildlife.md – Obrana polí; čísla návrh Clauda, noční hlídka Martin 24. 10. 2026: „Kombinace“). */
export const FIELD_GUARD = {
  /** Jezdecká hlídka (červen–říjen): `min(max; share × Σ sil × psi)`, psi `1 + perDog × psi`, nejvýš `dogMax`. */
  rider: { fromMonth: 6, toMonth: 10, share: 0.25, max: 0.6, perDog: 0.1, dogMax: 1.5 },
  /** Úlovek prasat z hlídky za den: `huntPerPower × Σ sil × prasata ÷ strop`. */
  huntPerPower: 0.01,
  /** Noční hlídka: díly od této hrozby škody za sezónu (podíl úrody), 1 hlídač na `haPerGuard` ha. */
  night: { threat: 0.1, haPerGuard: 5, adultManDays: 0.3, effect: 0.6, fromMonth: 6, toMonth: 8 },
} as const;

/** Šelmy na dobytku a slepicích (wildlife.md – Vlci na dobytku, Liška na slepicích). */
export const PREDATION = {
  /** Nepřestupný referenční rok pro délky měsíců (denní podíly nezávisí na přestupném dni). */
  referenceYear: 501,
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
  /**
   * Upozornění „Vlci strhávají dobytek“ (wildlife.md – Co hráč vidí): aspoň tolik dní se strhnutým
   * kusem za posledních `killDaysKept` dní (dřív i podmínka lovu vlků).
   */
  noticeKillDays: 2,
} as const;

/** Psi dvorce (wildlife.md – Psi – smečka dvorce). */
export const MANOR_DOGS = {
  /** Chce 1 psa na lovce rodu a 1 navíc, nejvýš `max`. */
  perHunter: 1,
  extra: 1,
  max: 8,
  /** 1. 5. přibudou nejvýš tolik štěňat do chtěného počtu (psi nic nespotřebovávají). */
  puppiesPerYear: 2,
  /** Úbytek smečky ročně (pes žije ≈ 10 let). */
  lossPerYear: 0.1,
} as const;

/** Lov na tlačítko dvorce (hunting.md – Pravidla 2, 4, 7). */
export const HUNT = {
  /**
   * Lovec dvorce od 14 let; děti na lov nechodí (Martin 27. 10. 2026) – podle lovců rodu chová
   * dvorec psy (`huntPool`, `dogsWanted`).
   */
  riderFromAge: 14,
  /** Na zvíře jdou muži od 14 let, ženy a děti ne (hunting.md – Pravidla 4; Martin 22. 11. 2026). */
  minAge: 14,
  /**
   * Maso do zásoby (kg; wildlife.md – Kolik): kanec a bachyně, sele (úlovek z hlídky), jelen, laň,
   * medvěd; vlk bez masa.
   */
  meatKg: { boar: 45, sow: 45, piglet: 15, stag: 90, hind: 50, bear: 100, wolf: 0 },
  /** Hájení březen až květen – lov nejde vyhlásit (hunting.md – Pravidla 2; Martin „ok“). */
  closedMonths: { from: 3, to: 5 },
  /** Honci: tolik mužů celý den mimo práci vsi (hunting.md – Pravidla 2, 3). */
  beaters: { men: 6 },
} as const;

/**
 * Vyhnaná zvěř v souboji (`hunt-fight.ts`; návrh Clauda – hunting.md, Pravidla 4–6; plán
 * 2026-11-22-hunting – Rozhodnutí 5, 9): zdraví, síla rány (`hitDamage`), tempo (m/s), výdrž útěku
 * (s), zotavení výdrže (s za sekundu bez útěku) a pozornost (útěk před lovcem do tolika m) – jen
 * jelen a laň; útok na lovce do `chargeM` m – kanec, bachyně, vlk a medvěd; viditelná plocha
 * pro šíp (m², `aim.ts`). Null = druh to nemá.
 */
export const HUNT_QUARRY = {
  stag: {
    health: 60,
    strength: 0,
    paceMS: 4.5,
    staminaS: 30,
    recoverPerS: 0.2,
    alertM: 60,
    chargeM: null,
    areaM2: 1.0,
  },
  hind: {
    health: 45,
    strength: 0,
    paceMS: 4.5,
    staminaS: 30,
    recoverPerS: 0.2,
    alertM: 60,
    chargeM: null,
    areaM2: 0.8,
  },
  boar: {
    health: 30,
    strength: 1.5,
    paceMS: 4.0,
    staminaS: null,
    recoverPerS: null,
    alertM: null,
    chargeM: 12,
    areaM2: 0.5,
  },
  sow: {
    health: 26,
    strength: 1.2,
    paceMS: 4.0,
    staminaS: null,
    recoverPerS: null,
    alertM: null,
    chargeM: 12,
    areaM2: 0.45,
  },
  wolf: {
    health: 30,
    strength: 0.8,
    paceMS: 4.5,
    staminaS: null,
    recoverPerS: null,
    alertM: null,
    chargeM: 15,
    areaM2: 0.4,
  },
  bear: {
    health: 160,
    strength: 3.0,
    paceMS: 3.5,
    staminaS: null,
    recoverPerS: null,
    alertM: null,
    chargeM: 10,
    areaM2: 1.2,
  },
} as const;

/**
 * Souboj se zvěří (`hunt-fight.ts`; návrh Clauda – hunting.md, Pravidla 4–7; plán
 * 2026-11-22-hunting – Rozhodnutí 4, 5, 7): zvíře vyběhne `emergeM` m z lesa ke dvorci; nikdo na ně
 * nejde `idleS` sekund skutečného času → uteče do lesa (Martin: „když se dlouho nic neděje“);
 * uštvaný jelen či laň stojí, dokud nenabere tento podíl výdrže; výcvik nejvýš `maxHours` herních
 * hodin za lov.
 */
export const HUNT_FIGHT = {
  emergeM: 40,
  idleS: 60,
  spentUntil: 0.5,
  maxHours: 6,
  /**
   * Brána umu na kance a bachyni (Martin: „nováček to nezvládne, protože je potřeba trefit se
   * kanci shora přímo za krk“, z koně „ještě náročnější“): rána zblízka pod ní vždy mine – pěšky
   * boj, z koně boj i jízda (čísla návrh Clauda – hunting.md, Pravidla 4–6).
   */
  boarGate: { foot: { combat: 60 }, mounted: { combat: 60, riding: 70 } },
  /**
   * Kůň jezdce (hunting.md – Pravidla 6: „kůň může v boji s kancem nebo medvědem utrpět také“):
   * tolikátý díl zásahů kance, bachyně a medvěda do jezdce jde do koně, a zdraví koně (návrh Clauda
   * – hunting.md, Pravidla 4–6).
   */
  horseHitShare: 0.5,
  horseHealth: 100,
  /**
   * Dva honci se zabitým zvířetem na tyči jdou do dvorce tímto dílem tempa pochodu (hunting.md –
   * Pravidla 7: „honci ho odnesou do dvorce na tyči mezi sebou“; číslo návrh Clauda).
   */
  carryPaceShare: 0.7,
} as const;

/**
 * Šelmy na výjezdu (journey-predators.ts; wildlife.md – Nebezpečí pro lidi; hunting.md – Pravidla
 * 10 – čísla bývalého lovu beze změny): na muže a den zranění `injury` (u medvěda × (1 − boj ÷ 200))
 * a smrt `death` × (2 − boj ÷ 100), pěšky × `footDeathFactor`; vlci čísly prasat. Zraněný
 * nepracuje, necvičí ani neloví `injuryDays` dní.
 */
export const PREDATOR_RISK = {
  injuryDays: 60,
  boar: { injury: 0.005, death: 0.0002 },
  bear: { injury: 0.05, death: 0.003 },
  footDeathFactor: 2,
} as const;

/** Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami). */
export const SMALL_GAME = {
  /** Hodin práce na člověkoden. */
  hoursPerManDay: 10,
  /** Ryby (duben–listopad): kg za hodinu při plném stropu (× biomasa ÷ strop) a jedlý podíl. */
  fish: { kgPerHour: 0.4, edible: 0.6, fromMonth: 4, toMonth: 11 },
  /**
   * Oka (prosinec–březen, bez podmínky – Martin 14. 11. 2026: „V létě se neloví – jednak je spousta
   * práce s jinými věcmi a jednak nejsou kožešiny tak kvalitní jako v zimě“; hides-honey.md):
   * zajíců za hodinu při plném stropu, kg masa na zajíce a lišek za hodinu při plném stropu.
   */
  snares: { perHour: 0.05, meatKg: 2, foxPerHour: 0.02 },
  /** Nejvýš tolik rybářů (i okařů) na tůň. */
  maxPerPool: 3,
  /**
   * Roční kvóta (návrh Clauda, review W7): ryby a zajíci se loví jen tolik, kolik za rok přiroste.
   * Pod tímto podílem stropu se nechytá; ryby nejvýš na vrcholu křivky přírůstku (čtvrtina stropu
   * ročně – logistický přírůstek `ryba·(1 − ryba/strop)` je nejvyšší na polovině stropu).
   */
  minStockShare: 0.5,
  fishMaxYieldShare: 0.25,
} as const;
