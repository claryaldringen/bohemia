// Čísla války (docs/design/war.md – Čísla). Změna čísla = i text v návrhu. Násobky opevnění tu
// nejsou – jsou ve `FORTIFICATIONS` (fortifications.md – Obrana).

export const WAR = {
  /** war.md – Čísla: ochrana nového rodu (skutečné dny; končí vlastním útokem nebo opovědí – Martin). */
  newLineProtectionDays: 7,
  /** war.md – Čísla: ochrana nové vsi (herní roky). */
  newVillageProtectionYears: 5,
  /** war.md – Čísla: válka utichne po tolika letech bez střetu. */
  quietYears: 3,
  /**
   * war.md – Čísla: tempo vojska (m/s skutečného času, Martin: 3–4), terén (hustý les, pevná cesta
   * a zemská stezka) a skupina (jen jezdci, se stádem, s pěšími raněnými – Pohyb, Ztráty).
   */
  pace: { metersPerSecond: 3.5, forest: 1 / 4, road: 1.5, riders: 1.5, herd: 0.5, wounded: 0.75 },
  /**
   * war.md – Čísla: mřížka pochodu (strana buňky v m) a hustý les – les krajiny, kde v okolí
   * 3 × 3 buněk stojí aspoň tolik stromů (návrh Clauda; vykácená paseka vsi lesem není); brod je
   * mělčina potoka – místo osy aspoň z tolika mělké (`StreamPoint.shallow`, jako brod chodců).
   */
  march: { cellM: 10, denseForestTrees: 3, fordShallow: 0.55 },
  /** war.md – Zima (Martin 3. 11.; čísla návrh Clauda): sníh zpomalí pochod. */
  snowPace: 0.75,
  /**
   * war.md – Zima: únava z mrazu (návrh Clauda). Od `fromMonth` do konce února vojsko venku ztrácí
   * denně zdraví a podíl síly, ve vsi se zotavuje.
   */
  frost: {
    fromMonth: 12,
    toMonth: 2,
    healthLossPerDay: 3,
    strengthLossPerDay: 0.02,
    healthGainPerDay: 10,
    strengthGainPerDay: 0.05,
  },
  /** war.md – Čísla: jídlo (kg obilí na muže a den) a nosnost (kg). */
  foodKgPerManDay: 1,
  carryKg: { man: 25, horse: 80, cart: 400, child: 10 },
  /**
   * war.md – Vojsko: kdo smí na tažení (muži od 16 let; vesničané 16–44 let), kdo se přihlásí
   * (≈ 30 % + 0,5 % za bod štěstí nad 50, hladová ves víc – kořist, čerstvě vdovská domácnost méně)
   * a dezerce nucených (≈ 5 % denně, s příbuznými v cíli ≈ 15 %). Nařídit muži útok na jeho
   * příbuzné sníží štěstí vsi o 5 na rok za každého (Martin 18. 10. 2026; čísla návrh Clauda).
   */
  army: { minAge: 16, villagerMaxAge: 44, kinHappinessPoints: 5 },
  muster: {
    baseShare: 0.3,
    perHappinessPoint: 0.005,
    happinessBase: 50,
    hungryBonus: 0.15,
    widowFactor: 0.5,
    maxShare: 0.95,
  },
  desertion: { perDay: 0.05, withKinPerDay: 0.15 },
  /** war.md – Čísla: hráč mimo tažení vydrží 1 herní den, pak zástupce, nebo rozpad. */
  absentLeaderDays: 1,
  /** war.md – Síla: válka jako výcvik – hodiny luku a boje za herní den (stropy: `ARMS_CAPS.war`). */
  trainingHours: { campaignDay: 2, fightDay: 6 },
  strength: {
    /** war.md – Síla: muž rodu pěšky = 1 + 2 × zkušenost ÷ 100 (Martin 2. 11.). */
    lineBase: 1,
    linePerExperience: 2,
    /** war.md – Síla: kůň × (1 + 0,5 × jízda na koni ÷ 100), až × 1,5 (Martin 2. 11.). */
    horsePerRiding: 0.5,
    /** war.md – Síla: vesničan pevně 0,4, nucený × 0,5 (Martin 3. 11.; číslo návrh Clauda). */
    villager: 0.4,
    forcedFactor: 0.5,
    forcedWithKinFactor: 0.3,
    /** war.md – Síla: ženy, starší a chlapci 14–15 let v obraně (návrh Clauda). */
    defenderOther: 0.1,
    /** war.md – Síla: obrana u domu × 1,5 (18. 10.). */
    atHomeFactor: 1.5,
    /** war.md – Síla: výzbroj z kovárny až × 1,5 s plným pokrytím nástroji (Martin 2. 11.). */
    smithMax: 1.5,
  },
  /** war.md – Boj: zdraví 100, zásah 10 × síla ÷ násobek obrany, luk polovina; rány v sekundách. */
  combat: { health: 100, hitPerStrength: 10, bowFactor: 0.5, meleeSeconds: 2, bowSeconds: 4 },
  /** war.md – Boj: na nule zdraví padlý / raněný 1 : 1, muž rodu raněný 2 ze 3 (návrh Clauda). */
  downed: { killedShare: 0.5, lineWoundedShare: 2 / 3 },
  /** war.md – Boj: bod zlomu = padlí a ranění ÷ muži skupiny (Martin 3. 11.). */
  breakpoint: { attacker: 0.3, defender: 0.45 },
  /** war.md – Vzdaní: útočníků víc než 1,5× obránců, muž rodu se vzdá s 80 %. */
  surrenderRatio: 1.5,
  lineSurrenderChance: 0.8,
  /** war.md – Čísla: jáma po 1 herním dni ve skupině domů se najde s 30 %. */
  pitFoundChance: 0.3,
  /** war.md – Ztráty: ranění 60 dní bez práce, 1 z 5 zemře (Martin 2. 11.). */
  wounded: { days: 60, deathShare: 0.2 },
  /** war.md – Čísla: poslední muž rodu doma neklesne pod 10 zdraví. */
  lastLineManMinHealth: 10,
  /** war.md – Čísla: doslech rozkazu (m). */
  orderHearingMeters: 30,
  /**
   * war.md – Pro implementaci, plán 2026-11-03 – rozhodnutí 12: tažení po taktech – 4 takty za
   * sekundu, záměr hráče platí od taktu teď + 2 (≈ 0,5 s), kontrolní bod každých 40 taktů (10 s).
   */
  campaign: { ticksPerSecond: 4, intentLeadTicks: 2, checkpointTicks: 40 },
} as const;
