// Náhled výměny v panelu obchodu (trade.md – Obchod): bilance pro souseda, nosiči, dny a práce –
// stejné ceny a nosiči jako na serveru (`tradeQuote`), jen z dat pohledu na ves. Čistý modul.
import { expeditionPorters, type TradeGood, type TradeGoods } from '@bohemia/game';
import type { VillageNeighbour } from './manor-view';

export interface TradePreview {
  /** Kolik kg obilí soused připíše za dané zboží, kolik chce za své a rozdíl (≥ 0 = vezme). */
  credit: number;
  price: number;
  balance: number;
  porters: number;
  days: number;
  manDays: number;
  /** Proč výprava nejde – bez zboží, nevýhodná pro souseda, výprava na cestě; jinak null. */
  blocked: string | null;
}

const total = (goods: TradeGoods, rows: readonly { good: TradeGood; price: number }[]): number =>
  rows.reduce((sum, row) => sum + (goods[row.good] ?? 0) * row.price, 0);

/** Náhled výměny se sousedem – zboží, které ves dá (`give`) a dostane (`get`). */
export function tradePreview(
  neighbour: VillageNeighbour,
  give: TradeGoods,
  get: TradeGoods,
): TradePreview {
  const credit = total(give, neighbour.demands);
  const price = total(get, neighbour.offers);
  const porters = expeditionPorters(give, get);
  const empty = Object.values(give).every((n) => !n) && Object.values(get).every((n) => !n);
  const blocked = neighbour.expedition
    ? 'Výprava k tomuto sousedovi je ještě na cestě.'
    : empty
      ? 'Zatím se nic nevyměňuje.'
      : credit + 1e-9 < price
        ? 'Za to by soused prodělal – přidej, nebo uber.'
        : null;
  return {
    credit: Math.round(credit),
    price: Math.round(price),
    balance: Math.round(credit - price),
    porters,
    days: neighbour.tripDays,
    manDays: porters * neighbour.tripDays,
    blocked,
  };
}
