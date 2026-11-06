import { CARTS } from '../village/rules-crafts';
import { TRADE, TRADE_GOOD_VALUES } from '../village/rules-trade';
import { WORLD } from '../world/rules-world';

/**
 * Čísla pravidel vazalství – docs/design/vassalage.md, Čísla (návrh Clauda, kde není uvedeno
 * jinak). Pozvánky a místo na mapě světa jsou v `INVITES` a `WORLD` (world/rules-world.ts), pauza
 * po odmítnutí v `NEGOTIATION`. Doprava je stejná jako k sousedům (Doprava a cílová ves – „jako
 * k sousedům“), proto jen odkazuje na čísla obchodu (`TRADE`, `CARTS`).
 */
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
    headsPerDrover: TRADE.headsPerDrover,
    horsesPerDrover: TRADE.horsesPerDrover,
    cartKg: CARTS.loadKg,
    cartCrew: CARTS.tradeCrew,
    sameCellTripDays: TRADE.tripDays.min,
  },
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
  /** Do jaké hloubky sítě (kroků od obou stran) upozornění na vypovězení dojde (návrh Clauda). */
  noticeDepth: 12,
  /** Kolik pater vazalů pod hráčem panel ukáže (Přehled pána – strom pod sebou; návrh Clauda). */
  panelTreeDepth: 6,
  /** Rozsudek bez vyjádření: po 1 skutečném dni (ms). */
  verdictAfterMs: 86_400_000,
} as const;
