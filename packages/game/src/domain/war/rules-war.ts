// Čísla války (docs/design/war.md – Čísla). Změna čísla = i text v návrhu. Čísla opevnění tu
// nejsou – jsou ve `FORTIFICATIONS` (fortifications.md – Hradby a obrana).

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
  /**
   * war.md – Zásoby tažení: Živé vedení bez rozkazu (Martin 14. 11. 2026; číslo návrh Clauda –
   * „Jo zkusme to takto“): tažení vedené živě, kterému jídlo klesne pod jídlo na cestu domů, ztrácí
   * denně ≈ 5 % mužů (vůdce ne); u nuceného se přičte k jeho dezerci (jeden los na muže a den).
   */
  hungerDesertPerDay: 0.05,
  /** war.md – Čísla: hráč mimo tažení vydrží 1 herní den, pak zástupce, nebo rozpad. */
  absentLeaderDays: 1,
  /**
   * war.md – Velení a příprava tažení, Čísla (návrh Clauda): NPC velitel napadne skupinu domů,
   * jen má-li aspoň 1,5 × sílu jejích obránců (bez násobku – 8. 11. 2026); obránce za hradbou jen
   * s postupem přes ni nejvýš 1 herní den (24 h – fortifications.md – Obrana bez násobku, NPC
   * velitel); obrátí se, když padne, je zajata nebo uteče aspoň polovina vojska.
   */
  npc: { attackRatio: 1.5, lostShare: 0.5, maxAssaultHours: 24 },
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
  /**
   * war.md – Boj – Souboj mužů: zdraví 100, zásah 10 × síla (násobek obrany zrušen 8. 11. 2026 –
   * Martin), luk polovina; rány v sekundách, luk na 20–60 m. Dosah zblízka (oštěp, sekera – i přes
   * palisádu) 3 m a los zblízka, zda rána padne, 1 : 1 jsou návrh Clauda (war.md – Čísla).
   */
  combat: {
    health: 100,
    hitPerStrength: 10,
    bowFactor: 0.5,
    meleeSeconds: 2,
    bowSeconds: 4,
    bowMinM: 20,
    bowMaxM: 60,
    meleeM: 3,
    /** Los zblízka 1 : 1; na dálku rozhoduje `aim`. */
    hitChance: 0.5,
    /**
     * Střelba podle dovednosti (fortifications.md – Střelba a viditelná plocha; Martin 8. 11. 2026,
     * čísla návrh Clauda): kruh rozptylu `r = (2 − 1,5 × dovednost ÷ 100) × vzdálenost ÷ 30` m,
     * vesničan hází pevně jako dovednost 20; viditelná plocha stojícího 0,5 × 1,7 m, obránce za
     * předprsní 0,5 × 0,5 m, lezec na žebříku celý (m²).
     */
    aim: {
      baseM: 2,
      skillM: 1.5,
      refM: 30,
      villagerSkill: 20,
      /**
       * Obránce v krytu pod palbou (fortifications.md – Obrana bez násobku 3, Kryt pod palbou;
       * Martin 9. 11. 2026, číslo návrh Clauda): skrčený za předprsní nebo pod ochozem – desetina
       * plochy za předprsní, tj. los 1 : 10 proti obránci, který z ochozu brání.
       */
      visibleM2: { standing: 0.85, parapet: 0.25, climbing: 0.85, cover: 0.025 },
    },
  },
  /** war.md – Mlha války: dohled ≈ 150 m (18. 10.), v hustém lese 50 m (návrh Clauda). */
  sight: { openM: 150, forestM: 50 },
  /** war.md – Boj – Dům od domu: domy blíž než 40 m tvoří skupinu domů (Martin 18. 10.). */
  houseGroupM: 40,
  /** war.md – Boj – Skupiny: držet místo – nevzdálí se od něj víc než ≈ 30 m (návrh Clauda). */
  holdPlaceM: 30,
  /**
   * war.md – Síla (návrh Clauda): obránci – muži vsi 16–44 let silou vesničana; ženy, starší
   * a chlapci od 14 let `strength.defenderOther` jen u domu.
   */
  defenderAges: { boyFrom: 14, manFrom: 16 },
  /** war.md – Boj: na nule zdraví padlý / raněný 1 : 1, muž rodu raněný 2 ze 3 (návrh Clauda). */
  downed: { killedShare: 0.5, lineWoundedShare: 2 / 3 },
  /** war.md – Boj: bod zlomu = padlí a ranění ÷ muži skupiny (Martin 3. 11.). */
  breakpoint: { attacker: 0.3, defender: 0.45 },
  /**
   * Bod zlomu za hradbou = chaos (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení;
   * Martin 9. 11. 2026, čísla návrh Clauda): kdo má méně než polovinu zdraví, neuteče a vzdá se;
   * v útočišti se vzdají děti do 16 let, matky dětí do 7 let, staří od 60 let a ranění či nemocní,
   * zdraví dospělí utečou.
   */
  rout: { fleeMinHealth: 50, motherOfChildUnderYears: 7, elderFromYears: 60 },
  /**
   * Probíjení – rozkaz velitele obrany (tamtéž, návrh Clauda): při 30 % ztrát v útoku, je-li brána
   * volná nebo slabě hlídaná – do 30 m od ní stojí nejvýš polovina útočníků proti počtu
   * probíjejících; skupina se shromáždí do 6 m od brány (nejvýš 60 s), pak vyrazí do lesa.
   */
  breakout: { lossShare: 0.3, gateWatchM: 30, weakGuardShare: 0.5, gatherM: 6, gatherSeconds: 60 },
  /** war.md – Přesila: útočníků víc než 1,5× obránců (útěk bez lesa, dostižení uprchlíků); muž rodu se vzdá s 80 %. */
  surrenderRatio: 1.5,
  lineSurrenderChance: 0.8,
  /** war.md – Čísla: jáma po 1 herním dni ve skupině domů se najde s 30 %. */
  pitFoundChance: 0.3,
  /**
   * war.md – Obránci – včasný útěk (Martin 2. 11. 2026; čísla návrh Clauda): dospělý nese 25 kg,
   * dítě 7–15 let 10 kg, mladší nic, dobytek jde celý; lidé se vrátí 1 herní den po odchodu vojska.
   */
  flight: {
    adultKg: 25,
    childKg: 10,
    childFromYears: 7,
    adultFromYears: 16,
    returnDays: 1,
    defaultStance: 'flee' as const,
  },
  /**
   * war.md – Varování, poslové a útěk do hradiště (schváleno Martinem 9. 11. 2026; čísla návrh
   * Clauda – plán 2026-11-09, Otevřené 1–6): vesničan i posel běží 2× pěším tempem vojska; vojsko
   * dostihne posla nebo skupinu uprchlíků do 30 m (jako nález v lese); ~~hráč bez správce má na
   * volbu 1 herní den (344 taktů)~~ – od 14. 11. 2026 zrušeno, rozhoduje `deciderOf`; hradiště se hledá do 8 políček; odhad cesty = vzdušná čára × 1,3;
   * hradiště varuje vsi domény do 3 políček od místa spatření, nejvýš 4 posly; hosté uprchlíků
   * odejdou jen návratem (`openUntilDay` – den, který nepřijde).
   * war.md – Hráč ve vsi a mimo ni (návrh Clauda, plán 2026-11-14 – Rozhodnutí plánu 2): dokud je
   * hráč u hry, worker obnoví přítomnost u varované vsi s vojvodou doma každou ¼ herního dne
   * (`presenceRefreshTicks` – 86 taktů ≈ 22 s); hráč bez přítomnosti déle než 1 herní den je pryč
   * (`absentTicks`).
   */
  alarm: {
    runFactor: 2,
    catchM: 30,
    presenceRefreshTicks: 86,
    refugeMaxCells: 8,
    routeFactor: 1.3,
    domainRadiusCells: 3,
    hillfortMessengers: 4,
    openUntilDay: 999_999_999,
  },
  /** war.md – Ztráty: ranění 60 dní bez práce a výcviku, 1 z 5 do 30 dní zemře (Martin 2. 11.). */
  wounded: { days: 60, deathShare: 0.2, deathWithinDays: 30 },
  /** war.md – Čísla: poslední muž rodu doma neklesne pod 10 zdraví. */
  lastLineManMinHealth: 10,
  /** war.md – Čísla: doslech rozkazu (m). */
  orderHearingMeters: 30,
  /**
   * war.md – Pro implementaci, plán 2026-11-03 – rozhodnutí 12: tažení po taktech – 4 takty za
   * sekundu, záměr hráče platí od taktu teď + 2 (≈ 0,5 s), kontrolní bod každých 40 taktů (10 s).
   */
  campaign: { ticksPerSecond: 4, intentLeadTicks: 2, checkpointTicks: 40 },
  /**
   * war.md – Pohyb: Průchod územím neutrálního rodu – nejvýš tolik map v jednom ohlášení (mez
   * vstupu, návrh Clauda).
   */
  passage: { maxCells: 24 },
} as const;

/**
 * Čísla výjezdu vojvody (docs/design/lord-control.md – Čísla). Změna čísla = i text v návrhu.
 * Tempo, dohled a věk mužů bere výjezd z `WAR` (jako vojsko).
 */
export const JOURNEY = {
  /**
   * lord-control.md – Na místě a návrat: po dojetí skupina stojí; nepřijde-li do tolika herních dní
   * nový rozkaz, jede domů sama (Martin 12. 11. 2026).
   */
  waitDays: 3,
  /** lord-control.md – Nebezpečí: šelmy hrozí jen skupině nejvýš tolika mužů (Martin 13. 11. 2026). */
  predatorGroupMax: 2,
  /**
   * Plán 2026-11-13 – Global Constraints (návrh Clauda): krok stopy odkrytého za jízdy (m) – po
   * tolika metrech si skupina zapíše další bod, od kterého viděla.
   */
  trailStepM: 20,
} as const;
