// Čísla pravidel opevnění – každé s odkazem na sekci návrhu `docs/design/fortifications.md`
// (tabulka Čísla). Horizonty správce jsou v `rules-steward.ts` (STEWARD).

import type { FenceCorners } from '../paths/entrances';
import type { FortKind, WallKind } from '../types/types-fortifications';

/** Cena na 100 m obvodu – práce (člověkodny), klády a kámen (m³; chybí = bez kamene). */
export interface FortCostPer100M {
  laborManDays: number;
  wood: number;
  stoneM3?: number;
}

export const FORTIFICATIONS = {
  /**
   * Ochrana druhu pro správce (Hradby a obrana – Správce; návrh Clauda – nahrazuje násobek, zrušený
   * 8. 11. 2026): podíl ztráty nájezdu, který opevnění ušetří = ochrana × obsazenost
   * (`fortOccupancy`) – jen s obránci, pasivní část se ruší (Martin 9. 11. 2026: „Hradba je prostě
   * jen fyzická překážka“, „Ano, jen s obránci“). Plot 0,04 (probodne se z obou stran – obránce
   * získá jen na lezci), palisáda 0,4 (druhý žebřík dolů – lezce po jednom berou obránci u paty),
   * s ochozem 0,5 (druhý žebřík odpadá, obránce bojuje shora), roštová a komorová 0,55 (z koruny
   * jako z ochozu); val s příkopem přidá 0,1.
   */
  protection: {
    fence: 0.04,
    palisade: 0.4,
    walkway: 0.5,
    crib: 0.55,
    chamber: 0.55,
    rampart: 0.1,
  } satisfies Record<WallKind | 'rampart', number>,
  /**
   * Vodní příkop přidá ochranu 0,1 × obsazenost (Hradby a obrana – Správce; návrh Clauda): kdo
   * příkop zasypává, nebojuje – bez obránců ho jen zasypou a projdou.
   */
  protectionMoat: 0.1,
  /**
   * Měřítko přínosu ochrany v odhadu správce (Hradby a obrana – Správce; návrh Clauda – návrh číslo
   * nedává): s hrozbou 1 (nájezd každý rok) a ztrátou nájezdu v tisících čd (dobytek, kořist,
   * lidé) by se bez měřítka vyplatila vsi 60 lidí i palisáda a hradby. 0,2 splní Martinovy cíle
   * (8. 11. 2026) na typických vsích – ves 60 lidí nic, ves 150 lidí palisádu, plot nikdy, roštová
   * a komorová běžné vsi ne (Martin 9. 11. 2026: měření nájezdů NPC se nedělá).
   */
  protectionScale: 0.2,
  /**
   * Cena komplet na 100 m obvodu – včetně kácení a odvozu (Hradby a obrana – Cena; Martin 8. 11.
   * 2026): plot 35 čd + 15 klád (20 čd + kácení, Martin 3. 11.), palisáda 430 čd + 200 klád
   * (Martin 9. 11. 2026 – kmen ≈ 10 m dá dva kůly, 2 kmeny na 1 m; práce bez kácení zůstává
   * 230 čd), palisáda s ochozem 580 čd + 210 klád, roštová 1 050 čd + 330 klád + 100 m³ kamene, komorová
   * 1 450 čd + 350 klád + 320 m³ (klády a kámen návrh Clauda), val 150 čd (jen hlína, Martin
   * 3. 11.). Vylepšení stojí cenu cílového (nižší stupeň nic nevrací), hradba na valu jako
   * samotná; z hromady ušetří `pileSaves`. Cena roste s délkou úměrně.
   */
  costPer100M: {
    fence: { laborManDays: 35, wood: 15 },
    palisade: { laborManDays: 430, wood: 200 },
    walkway: { laborManDays: 580, wood: 210 },
    crib: { laborManDays: 1050, wood: 330, stoneM3: 100 },
    chamber: { laborManDays: 1450, wood: 350, stoneM3: 320 },
    rampart: { laborManDays: 150, wood: 0 },
  } satisfies Record<FortKind, FortCostPer100M>,
  /**
   * Ochoz – přístavba palisády na 100 m (Hradby a obrana – Cena; návrh Clauda): násyp, fošny
   * a schůdky 150 čd + 10 klád.
   */
  walkwayAddPer100M: { laborManDays: 150, wood: 10 },
  /**
   * Co ušetří surovina z hromady (Hradby a obrana – Cena; návrh Clauda): kláda 1 čd (kácení
   * a svoz stromu), kámen 1 čd na m³ (lámání a vození).
   */
  pileSaves: { logManDays: 1, stoneManDaysPerM3: 1 },
  /**
   * Od kterého herního roku jde hradba stavět (Hradby a obrana – Druhy): roštová od roku 790,
   * komorová od roku 830.
   */
  wallFromYear: { crib: 790, chamber: 830 },
  /**
   * Životnost hradby v letech (Životnost a oprava; Martin 3. 11. 2026: plot 15, palisáda 20;
   * Hradby a obrana – Životnost a údržba, návrh Clauda: ochoz s palisádou 20, roštová 30,
   * komorová 50) – val nehnije.
   */
  lifeYears: {
    fence: 15,
    palisade: 20,
    walkway: 20,
    crib: 30,
    chamber: 50,
  } satisfies Record<WallKind, number>,
  /** Chátrání za životností bez dřeva: stav 100 → 0 % za 5 let (Životnost a oprava; návrh Clauda). */
  decayYears: 5,
  /**
   * Val bez údržby (Životnost a oprava; Martin 3. 11. 2026): za 50 let výška 0,5 (polovina přínosu
   * valu).
   */
  rampartNeglect: { years: 50, height: 0.5 },
  /**
   * Údržba valu (Životnost a oprava; návrh Clauda): 2 čd na 100 m ročně; obnova, když výška
   * klesne pod 0,75, za polovinu ceny valu.
   */
  rampartUpkeep: { manDaysPer100MYear: 2, renewBelowHeight: 0.75, renewCostShare: 0.5 },
  /**
   * Údržba po úsecích (Hradby a obrana – Životnost a údržba; návrh Clauda): čd na 100 m hotového
   * úseku ročně – plot 1, palisáda 1, s ochozem 2 (+1 za fošny), roštová a komorová 5, val 2
   * (shoduje se s `rampartUpkeep.manDaysPer100MYear`). Hradba na valu platí svůj druh a val zvlášť.
   */
  upkeepPer100MYear: {
    fence: 1,
    palisade: 1,
    walkway: 2,
    crib: 5,
    chamber: 5,
    rampart: 2,
  } satisfies Record<FortKind, number>,
  /**
   * Přestavba dožilé hradby (Hradby a obrana – Životnost a údržba; návrh Clauda): roštová
   * a komorová stojí třetinu práce a klád, kámen (rošt, plenta) zůstane; palisáda s ochozem cenu
   * palisády a k tomu fošny ochozu 2 h na 1 m (20 čd na 100 m) a 10 klád, násyp zůstane.
   */
  rebuild: {
    crib: 1 / 3,
    chamber: 1 / 3,
    walkwayPlanksPer100M: { laborManDays: 20, wood: 10 },
  },
  /**
   * Útočiště (Obrana – Útočiště; návrh Clauda): 10 m² na člověka, 20 m² na kus dobytka (kráva,
   * vůl, kůň); ovce, koza a prase jsou čtvrt kusu.
   */
  refuge: {
    m2PerPerson: 10,
    m2PerHead: 20,
    smallStockHead: 0.25,
    /** Zásoby, které přinese do útočiště člověk zvenku: dospělý 25 kg, dítě 7–15 let 10 kg (návrh Clauda). */
    carryKgAdult: 25,
    carryKgChild: 10,
  },
  /**
   * Šířka pásu uvnitř plochy podél okraje (Obvod; Hradby a obrana – Druhy; návrh Clauda) – m:
   * plot 1, palisáda 1,5, s ochozem 5,5, roštová 7, komorová 8, val 10.
   */
  bandM: {
    fence: 1,
    palisade: 1.5,
    walkway: 5.5,
    crib: 7,
    chamber: 8,
    rampart: 10,
  } satisfies Record<FortKind, number>,
  /**
   * Pás hradby na valu (Hradby a obrana – Druhy; návrh Clauda) – m: plot a palisáda 10 jako
   * samotný val, s ochozem 12,5, roštová 14, komorová 15.
   */
  wallOnRampartBandM: {
    fence: 10,
    palisade: 10,
    walkway: 12.5,
    crib: 14,
    chamber: 15,
  } satisfies Record<WallKind, number>,
  /**
   * Val doplněný vně stojící hradby (Hradby a obrana – Druhy; návrh Clauda): pás sahá 7 m ven
   * (příkop 4 m + vnější svah 3 m) a dovnitř aspoň 3 m (víc, je-li hradba širší).
   */
  rampartOutside: { outM: 7, minInM: 3 },
  /**
   * Pás valu (Obvod, Ve scéně; návrh Clauda): příkop 4 m vně a 1,5 m hluboký, val 6 m u paty (m).
   * Hloubka příkopu určuje i dno vodního příkopu (Hradby a obrana – Druhy, `moatSegments`).
   */
  rampartBand: { ditchM: 4, footM: 6, ditchDepthM: 1.5 },
  /**
   * Poloměr vnějšího a vnitřního rohu (Obvod; návrh Clauda): plot 1,25 a 0,5 m jako pletený
   * plot pozemků, palisáda 3 m a val 8 m, vnitřní roh u nich polovina vnějšího; vyšší stupně
   * hradby vnější roh = nejmenší ohyb (s ochozem 4, roštová 8, komorová 10 m – Hradby a obrana,
   * Druhy).
   */
  cornerM: {
    fence: { outer: 1.25, inner: 0.5 },
    palisade: { outer: 3, inner: 1.5 },
    walkway: { outer: 4, inner: 2 },
    crib: { outer: 8, inner: 4 },
    chamber: { outer: 10, inner: 5 },
    rampart: { outer: 8, inner: 4 },
  } satisfies Record<FortKind, FenceCorners>,
  /** Úsek = strana okrajového čtverce (Obvod – Úseky; návrh Clauda) – jen převod starých opevnění. */
  segmentSquareSides: 1,
  /** Plocha souvislá stranou, nejméně 2 × 2 čtverce (Obvod; návrh Clauda) – jen převod starých opevnění. */
  minAreaSquares: 2,
  /**
   * Nejmenší poloměr ohybu na vnějším okraji v obou směrech (Obvod – tabulka pásu; návrh Clauda):
   * plot 1,25 m (jako pozemek), palisáda 3 m, val 8 m; s ochozem 4 m, roštová 8 m, komorová 10 m
   * (Hradby a obrana – Druhy).
   */
  minBendM: {
    fence: 1.25,
    palisade: 3,
    walkway: 4,
    crib: 8,
    chamber: 10,
    rampart: 8,
  } satisfies Record<FortKind, number>,
  /**
   * Obvod z bodů (Obvod, Pro implementaci – Obvod z bodů; návrh Clauda): body nejvýš ≈ 15 m od sebe,
   * nejméně 4 (strop bodů hlídá server); křivka navzorkovaná krokem ≈ 1,5 m; úseky stejně dlouhé
   * ≈ 15 m (délka ÷ zaokrouhlený počet); plocha uvnitř obvodu nejméně 900 m².
   */
  outline: {
    pointGapM: 15,
    minPoints: 4,
    maxPoints: 400,
    /** Bližší body se sloučí (m). */
    minPointGapM: 0.1,
    sampleStepM: 1.5,
    segmentM: 15,
    minAreaM2: 900,
  },
  /**
   * Návrh obvodu (Obvod, Správce – Obvod správce; návrh Clauda): odstup od jádra = šířka pásu
   * + 3 m; neprojde-li kontrolou, odstup po 1 m víc (nejvýš o 20 m); správce po 5 m, dokud se
   * nevejde útočiště. Bez jádra kruh o poloměru 20 m.
   */
  proposal: {
    clearanceM: 3,
    growStepM: 1,
    maxGrowM: 20,
    stewardGrowStepM: 5,
    circleRadiusM: 20,
  },
  /** Brána 4 m – projde vůz se spřežením, nic navíc nestojí, nejvýš 1 na úsek (Brány; návrh Clauda). */
  gate: { widthM: 4, perSegment: 1 },
  /**
   * Klešťová brána (Hradby a obrana – Brány; návrh Clauda): ulička 4 m široká a 12 m dlouhá od
   * vnitřního okraje pásu, k vratům nejvýš 4 muži; ramena 2 × 12 = 24 m hradby druhu úseku
   * s ochozem, za vnitřním okrajem pásu 12 m volného místa podél cesty. Jen u hradby s ochozem
   * (`walls`; Martin 9. 11. 2026: „Pokud budeme mít obyčejnou palisádu bez ochozu, nemůže tam stát
   * klešťová brána, ale jen obyč“).
   */
  pincerGate: {
    alleyWidthM: 4,
    alleyLengthM: 12,
    maxMen: 4,
    wallM: 24,
    clearM: 12,
    walls: ['walkway', 'crib', 'chamber'],
  },
  /**
   * Dřevěná věž nad branou (Hradby a obrana – Brány, Životnost a údržba; návrh Clauda): nejvýš
   * 4 obránci, dohled 250 m, luk do 80 m; 120 čd komplet + 30 klád; životnost 20 let, přestavba
   * plnou cenou, údržba 1 čd za věž ročně.
   */
  tower: {
    defenders: 4,
    sightM: 250,
    bowMaxM: 80,
    laborManDays: 120,
    wood: 30,
    lifeYears: 20,
    upkeepManDaysYear: 1,
  },
  /** Brány se zavřou, když je první útočník do 30 m od brány (Obrana; návrh Clauda). */
  gatesCloseWithinM: 30,
  /**
   * Průlom je 4 m široký (Prolomení; návrh Clauda) – i zasypaný kus vodního příkopu; práce
   * a nejvýš 4 muži na místo jsou v `assault` (Přechod hradby).
   */
  breach: { widthM: 4 },
  /**
   * Hrozba vsi (Správce – Hrozba; návrh Clauda): váhy signálů (nájezd na ves 1, nájezd na jinou
   * ves rodu do 3 políček 0,5, cizí vojsko 0,3, válka s nepřítelem do 5 políček 0,5), poločas
   * 10 herních let a paměť 50 let.
   */
  threat: {
    raid: 1,
    kinRaid: 0.5,
    kinRaidTiles: 3,
    army: 0.3,
    war: 0.5,
    warTiles: 5,
    halfLifeYears: 10,
    memoryYears: 50,
  },
  /**
   * Ztráta nájezdu pro správce (Správce – Hrozba; návrh Clauda): kořist 25 kg na muže, odhad
   * 20 mužů, a 10 % dospělých.
   */
  raidLoss: { men: 20, kgPerMan: 25, adultShare: 0.1 },
  /** Útočiště správce: lidé a dobytek vsi + 20 % (Správce – Hrozba; návrh Clauda). */
  stewardRefugeMargin: 0.2,
  /**
   * Přechod hradby (Hradby a obrana – Přechod hradby; návrh Clauda podle Martina 8. 11. 2026):
   * práce v mužohodinách (brána plotu a závora valu 0, plot 2, brána palisády 12, brány roštové
   * a komorové 24, palisáda 96), oheň otepi + hoření (brána 8 + 4 h, palisáda 16 + 8 h, 2
   * přikládají, otepi do 100 m, dál úměrně), odkopat palisádu 80, podkop roštové 480 a komorové 720
   * (1,5 ×; pod zemí po pětině), zasypat val 80 a vodní příkop 48, žebřík 4. Pohyb jednoho muže
   * ve skutečných sekundách; únava po valu 0,85 a návrat za 120 taktů.
   */
  assault: {
    maxMen: 4,
    manHours: {
      cutFence: 2,
      cutGate: { fence: 0, palisade: 12, walkway: 12, crib: 24, chamber: 24 },
      cutPalisade: 96,
      dig: 80,
      mine: { crib: 480, chamber: 720 },
      fillRampart: 80,
      fillMoat: 48,
      ladder: 4,
    },
    burn: {
      gate: { fuelManHours: 8, burnHours: 4 },
      palisade: { fuelManHours: 16, burnHours: 8 },
      lighters: 2,
      fuelM: 100,
    },
    undergroundShare: 0.2,
    climbSeconds: {
      fence: 2,
      lean: 2,
      up: { palisade: 4, walkway: 4, crib: 5, chamber: 6 },
      overLadder: 4,
      down: { palisade: 4, walkway: 2, crib: 3, chamber: 3 },
      /**
       * Hradba na koruně valu (Martin 9. 11. 2026: „Pokud se jedná o palisádu nebo polský plot, má
       * stát na koruně valu“; číslo návrh Clauda): žebřík od paty na vnějším svahu je o výšku valu
       * (2 m) delší – výstup o 2 s déle při plném valu (poměrně s výškou valu).
       */
      upRampart: 2,
    },
    rampartSlowdown: 3,
    rampartFatigue: 0.15,
    fatigueTicks: 120,
  },
  /**
   * Vodní příkop (Hradby a obrana – Druhy, Cena; návrh Clauda): napustí se strouhou od vody do
   * 30 m od osy příkopu (potok, řeka, tůň) za ¼ čd na 1 m napouštěných dílů; v zimě zamrzne
   * (Přechod hradby – S valem; Martin 8. 11. 2026: „Má zamrznout“) – měsíce 12, 1, 2.
   */
  moat: { frozenMonths: [12, 1, 2] as readonly number[], reachM: 30, manDaysPerM: 0.25 },
  /**
   * Obrana bez násobku (Obrana bez násobku 1; návrh Clauda): obránců na m ochozu 1 na 5 m, bránu
   * brání 2, hod na 15 m s polovinou účinku každé 4 s, kámen u paty na 3 m každé 2 s, shození
   * žebříku (s lezcem třetina, prázdný polovina), pád 20 zranění, lezec bojuje na půl síly,
   * žebříky nejméně 1 m od sebe, pohyb po ochozu poloviční. Obsazení (Obrana bez násobku 6; plán
   * hradeb Úloha 12): stanoviště 1 m za čarou hradby – na ochozu a koruně, nebo na zemi za stěnou.
   */
  defense: {
    perDefenderM: 5,
    postInsideM: 1,
    gateMen: 2,
    throwM: 15,
    throwFactor: 0.5,
    throwSeconds: 4,
    footStoneM: 3,
    footStoneSeconds: 2,
    push: { withClimber: 1 / 3, empty: 1 / 2 },
    fallDamage: 20,
    climberStrength: 0.5,
    ladderGapM: 1,
    walkwayPace: 0.5,
    /**
     * Kryt pod palbou (Obrana bez násobku 3; Martin 9. 11. 2026, číslo návrh Clauda): obránci
     * mimo místo útoku se kryjí, dokud na opevnění dopadají šípy, a ještě 30 s po posledním.
     */
    coverSeconds: 30,
    /**
     * Obránce na koruně valu pod hradbou (Hradby a obrana – Druhy, Pás s valem; Martin 9. 11.
     * 2026 – hradba na koruně valu; čísla návrh Clauda): stojí o 2 m výš – dohlédne o 25 m dál,
     * lukem dostřelí o 5 m dál a z ochozu dohodí o 2 m dál (hod 15 → 17 m jako vrh z 2 m výšky).
     */
    crest: { sightM: 25, bowM: 5, throwM: 2 },
  },
} as const;
