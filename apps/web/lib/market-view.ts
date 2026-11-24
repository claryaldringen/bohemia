// Trh pro web (markets.md – Rozhodnutí plánu 2, body 2 a 9): výpravy na cestě pro panel a náhled
// výpravy. Náhled nemá vlastní pravidla – jen převede `checkMarketTrip` jádra se vstupem, který
// server složil z vsi do pohledu dvorce (`VillageManor.market`). Čistý modul.
import {
  checkMarketTrip,
  marketPreviewPeople,
  type MarketOrder,
  type MarketTripCheck,
  type VillageState,
} from '@bohemia/game';
import type { VillageManor } from './manor-view';

/** Fáze výpravy na trh: cesta tam, na trhu, cesta zpět, čeká na zboží (po termínu bez výsledku). */
export type MarketTripPhase = 'out' | 'market' | 'back' | 'waiting';

/** Výprava na trh na cestě pro panel. */
export interface MarketTripView {
  key: string;
  villageName: string;
  phase: MarketTripPhase;
  /** Dnů do návratu domů (`returnDay` − den), nejméně 0. */
  daysLeft: number;
}

/** Výpravy vsi na trh a kde jsou ve dni `day`. */
export function marketTripViews(state: VillageState, day: number): MarketTripView[] {
  const out: MarketTripView[] = [];
  for (const e of state.trade?.expeditions ?? []) {
    if (e.kind !== 'market' || !e.market) continue;
    const m = e.market;
    const phase: MarketTripPhase =
      day < m.arriveDay
        ? 'out'
        : day < m.arriveDay + m.stayDays
          ? 'market'
          : day < m.returnDay
            ? 'back'
            : 'waiting';
    out.push({
      key: m.key,
      villageName: m.name,
      phase,
      daysLeft: Math.max(0, m.returnDay - day),
    });
  }
  return out;
}

/** Náhled výpravy: lidé, vozy, dny pryč, nebo důvod, proč nejde. */
export interface MarketPreview {
  porters: number;
  carts: number;
  awayDays: number;
  reason: string | null;
}

/**
 * Jen převede `checkMarketTrip(order, { ...market, cells })` – žádná vlastní kontrola. `awayDays` je
 * počet dní pryč (`returnDay` − `departDay`); u odmítnuté výpravy 0.
 */
export function marketPreview(
  order: MarketOrder,
  market: VillageManor['market'],
  cells: number,
): MarketPreview {
  // lidé na prodej a volní nosiči stejně jako server (`planMarketTrip`) – výpočet je v jádru
  const people = market.people ? marketPreviewPeople(market.people, order.give) : null;
  const input: MarketTripCheck = {
    stock: people ? { ...market.stock, ...people.stock } : market.stock,
    homeCarts: market.homeCarts,
    oxenHome: market.oxenHome,
    adults: people ? people.adults : market.adults,
    day: market.day,
    cells,
  };
  const check = checkMarketTrip(order, input);
  if (!check.ok) return { porters: 0, carts: 0, awayDays: 0, reason: check.reason };
  return {
    porters: check.porters,
    carts: check.carts,
    awayDays: check.returnDay - check.departDay,
    reason: null,
  };
}
