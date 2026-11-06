// Čísla pravidel opevnění – každé s odkazem na sekci návrhu `docs/design/fortifications.md`
// (tabulka Čísla). Horizonty správce jsou v `rules-steward.ts` (STEWARD).

import type { FenceCorners } from './paths/entrances';
import type { FortKind, FortTop } from './types-fortifications';

/** Cena na 100 m obvodu – práce (člověkodny) a klády. */
export interface FortCostPer100M {
  laborManDays: number;
  wood: number;
}

export const FORTIFICATIONS = {
  /**
   * Násobek opevnění (Druhy, Obrana; Martin 3. 11. 2026): plot 1,25, palisáda 2, val 1,5, val
   * s plotem 2, val s palisádou 3.
   */
  multiplier: {
    fence: 1.25,
    palisade: 2,
    rampart: 1.5,
    rampartFence: 2,
    rampartPalisade: 3,
  },
  /** Obránce za opevněním: × 1,5 (zná místo) × násobek opevnění (Obrana; návrh Clauda). */
  defenderKnowsPlace: 1.5,
  /**
   * Cena na 100 m obvodu (Cena a stavba; Martin 3. 11. 2026): plot 20 čd + 15 klád, palisáda
   * 80 čd + 70 klád, val 150 čd (jen hlína). Vylepšení plotu na palisádu stojí jako nová palisáda
   * (plot nevrací nic), plot nebo palisáda na valu jako samotné. Cena roste s délkou úměrně.
   */
  costPer100M: {
    fence: { laborManDays: 20, wood: 15 },
    palisade: { laborManDays: 80, wood: 70 },
    rampart: { laborManDays: 150, wood: 0 },
  } satisfies Record<FortKind, FortCostPer100M>,
  /** Životnost úseku v letech (Životnost a oprava; Martin 3. 11. 2026) – val nehnije. */
  lifeYears: { fence: 15, palisade: 20 } satisfies Record<FortTop, number>,
  /** Chátrání za životností bez dřeva: stav 100 → 0 % za 5 let (Životnost a oprava; návrh Clauda). */
  decayYears: 5,
  /**
   * Val bez údržby (Životnost a oprava; Martin 3. 11. 2026): za 50 let výška 0,5 a násobek valu
   * 1,5 → 1,25 (polovina přínosu valu).
   */
  rampartNeglect: { years: 50, height: 0.5, multiplier: 1.25 },
  /**
   * Údržba valu (Životnost a oprava; návrh Clauda): 2 čd na 100 m ročně; obnova, když výška
   * klesne pod 0,75, za polovinu ceny valu.
   */
  rampartUpkeep: { manDaysPer100MYear: 2, renewBelowHeight: 0.75, renewCostShare: 0.5 },
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
   * Přínos výšky valu (Obrana – Násobek podle stavu; návrh Clauda): násobek holého valu
   * `1 + 0,5 × výška` (plná výška 1 = 1,5, bez údržby nejníž 0,5 = 1,25).
   */
  rampartHeightBonus: 0.5,
  /** Přesila, při které se skupina za opevněním vzdá: 1,5 × obránci × násobek (Postoje; návrh Clauda). */
  surrenderOddsPerDefender: 1.5,
  /** Šířka pásu uvnitř plochy podél okraje (Obvod; návrh Clauda) – m. */
  bandM: { fence: 1, palisade: 1.5, rampart: 10 } satisfies Record<FortKind, number>,
  /** Pás valu (Obvod; návrh Clauda): příkop 4 m vně, val 6 m u paty (m). */
  rampartBand: { ditchM: 4, footM: 6 },
  /**
   * Poloměr vnějšího a vnitřního rohu (Obvod; návrh Clauda): plot 1,25 a 0,5 m jako pletený
   * plot pozemků, palisáda 3 m a val 8 m, vnitřní roh u nich polovina vnějšího.
   */
  cornerM: {
    fence: { outer: 1.25, inner: 0.5 },
    palisade: { outer: 3, inner: 1.5 },
    rampart: { outer: 8, inner: 4 },
  } satisfies Record<FortKind, FenceCorners>,
  /** Úsek = strana okrajového čtverce (Obvod – Úseky; návrh Clauda). */
  segmentSquareSides: 1,
  /** Plocha souvislá stranou, nejméně 2 × 2 čtverce (Obvod; návrh Clauda). */
  minAreaSquares: 2,
  /** Brána 4 m – projde vůz se spřežením, nic navíc nestojí, nejvýš 1 na úsek (Brány; návrh Clauda). */
  gate: { widthM: 4, perSegment: 1 },
  /** Brány se zavřou, když je první útočník do 30 m od brány (Obrana; návrh Clauda). */
  gatesCloseWithinM: 30,
  /**
   * Prolomení v mužohodinách (Prolomení; návrh Clauda podle Martina 3. 11. 2026): brána plotu
   * (i závora ve valu) 0, plot mimo bránu 2, brána palisády 12, palisáda mimo bránu 96.
   */
  breachManHours: { fenceGate: 0, fence: 2, palisadeGate: 12, palisade: 96 },
  /** Na jedno místo prolomení nejvýš 4 muži, průlom 4 m (Prolomení; návrh Clauda). */
  breach: { maxMen: 4, widthM: 4 },
  /** Val útokem – čtvrtinové tempo přes pás (Prolomení; návrh Clauda). */
  rampartAssaultPace: 0.25,
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
} as const;
