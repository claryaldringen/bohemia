import { CARTS } from '../village/rules/rules-crafts';
import { TRADE, TRADE_GOOD_VALUES } from '../village/rules/rules-trade';
import { WORLD } from '../world/rules-world';

/**
 * Čísla pravidel vazalství – docs/design/vassalage.md, Čísla (návrh Clauda, kde není uvedeno
 * jinak). Pozvánky a místo na mapě světa jsou v `INVITES` a `WORLD` (world/rules-world.ts), pauza
 * po odmítnutí v `NEGOTIATION`. Doprava je stejná jako k sousedům (Doprava a cílová ves – „jako
 * k sousedům“), proto jen odkazuje na čísla obchodu (`TRADE`, `CARTS`).
 */
/**
 * Jídlo domény (hillfort.md – Jídlo domény; čísla návrh Clauda): ves je po žních připravená, když
 * jí zbývá vymlátit nejvýš `sheavesDoneKg` snopů, nejpozději `readyBy` (konec okna výmlatu,
 * `THRESH_END_DAY`); jídlo chybí od `minNeedKg` (jako výprava správce za obilím – aspoň jeden
 * nosič, `TRADE.porterKg`).
 */
export const DOMAIN_FOOD = {
  readyBy: { month: 10, day: 1 },
  sheavesDoneKg: 1,
  minNeedKg: TRADE.porterKg,
} as const;

export const VASSALAGE = {
  /** Roční dialog Odvody (Roční dialog 1. 11.; Martin: „1. listopad je ok“), čeká na vazala. */
  annualDialog: { month: 11, day: 1 },
  /** Pojistka ve výhledu: osivo a jídlo na tolik ročních potřeb (Dávky – Výhled). */
  reserveYears: 2,
  /** Měsíc, ve kterém ves dávky veze – volná práce, vozy a voly v listopadu (Dávky – Výhled). */
  transportMonth: 11,
  /** Cesta dávky, lidí, služby a pomoci: herní dny na políčko vzdálenosti (Doprava a cílová ves). */
  travelDaysPerCell: WORLD.travelDaysPerCell,
  /**
   * Doprava (Doprava a cílová ves): nosič 25 kg, kláda 100 kg = dva nosiči, vůz 400 / 800 kg
   * s voly a vozkou, honák na 10 kusů dobytka – koně na ohlávce po 4 (horses.md – Nákup a prodej,
   * jako v obchodě). Uvnitř políčka (vzdálenost 0) trvá cesta tam a zpět jako nejkratší k sousedovi.
   */
  transport: {
    porterKg: TRADE.porterKg,
    logCarriers: TRADE.logCarriers,
    logKg: TRADE_GOOD_VALUES.logs.carryKg,
    /**
     * Kámen (vassalage.md – Makrokomodity; návrh Clauda): 1 m³ lomového kamene váží ≈ 2 500 kg, takže
     * ho nosič neunese a jede jen vozem (400 / 800 kg → m³ se počítají z celkového nákladu vozů).
     */
    stoneKgPerM3: TRADE_GOOD_VALUES.stone.carryKg,
    headsPerDrover: TRADE.headsPerDrover,
    horsesPerDrover: TRADE.horsesPerDrover,
    cartKg: CARTS.loadKg,
    cartCrew: CARTS.tradeCrew,
    sameCellTripDays: TRADE.tripDays.min,
  },
  /**
   * Robota (Lidé a robota): dospělí od 16 let (Martin), ne muži rodu; jeden člověk odpracuje
   * nejvýš měsíc, víc člověkodní = víc lidí; když ves tolik lidí nemá, déle – ale nejvýš rok
   * (návrh Clauda). Cesta se do dní nepočítá.
   */
  corvee: { fromAge: 16, maxStintDays: 30, maxDaysPerPerson: 365 },
  /** Služba: muž rodu od 16 let (Martin), dny za herní rok podle dohody. */
  serviceFromAge: 16,
  /** Povýšení vesničana: muž od 16 let, nejvýš 1 za herní rok (Martin). */
  ennoble: { fromAge: 16, perYear: 1 },
  /**
   * Meze řádků podmínek (Podmínky dohody; návrh Clauda – jen proti překlepům a nesmyslům, skutečný
   * strop dává výhled vsi): největší dohodnutá dávka nebo odměna za rok a služba.
   */
  termLimits: {
    maxKg: 10_000_000,
    maxHeads: 10_000,
    maxPeople: 10_000,
    maxLaborDays: 1_000_000,
    maxServiceMen: 100,
    maxServiceDays: 365,
  },
  /**
   * Půjčka (Pomoc na žádost – dar nebo půjčka; návrh Clauda): splátky se počítají v kg obilí podle
   * `TRADE_GOOD_VALUES`; seno má cenu čtvrtiny obilí (krmivo, ne jídlo), kůň (jednoho druhu pro
   * účty splátek) cenu chovné klisny. Nejvýš 40 splátek v kalendáři, rok splátky v rozumných mezích.
   */
  loan: {
    hayValueKg: 0.25,
    horseValueKg: TRADE_GOOD_VALUES.mares.valueKg,
    maxInstallments: 40,
    maxYear: 100_000,
  },
  /** Do jaké hloubky sítě (kroků od obou stran) upozornění na vypovězení dojde (návrh Clauda). */
  noticeDepth: 12,
  /** Kolik pater vazalů pod hráčem panel ukáže (Přehled pána – strom pod sebou; návrh Clauda). */
  panelTreeDepth: 6,
  /** Rozsudek bez vyjádření: po 1 skutečném dni (ms). */
  verdictAfterMs: 86_400_000,
  /** Rozsudek „mír“ platí tolik herních let (návrh Clauda – „mír na dobu“). */
  judgmentPeaceYears: 5,
} as const;
