// Náhled výměny v panelu obchodu (trade.md – Obchod): bilance pro souseda, nosiči, dny a práce –
// stejné ceny a nosiči jako na serveru (`tradeQuote`), jen z dat pohledu na ves – i s lidmi
// (trade.md – Výměna lidí: rodiny a svobodní dospělí nic nenesou a nosiče nepotřebují). Čistý
// modul.
import {
  expeditionTransport,
  type TradeGood,
  type TradeGoods,
  type TradePeople,
} from '@bohemia/game';
import type { VillageNeighbour } from './manor-view';

export interface TradePreview {
  /** Kolik kg obilí soused připíše za dané zboží, kolik chce za své a rozdíl (≥ 0 = vezme). */
  credit: number;
  price: number;
  balance: number;
  porters: number;
  /** Kolik vozů pojede (wagons.md – Obchod: náklad na voze, s vozem 2 lidé). */
  carts: number;
  days: number;
  manDays: number;
  /** Proč výprava nejde – bez zboží, nevýhodná pro souseda, výprava na cestě; jinak null. */
  blocked: string | null;
}

/** Lidé ve výměně – co ves dá a co dostane (rodiny a svobodní dospělí). */
export interface PreviewPeople {
  give: TradePeople;
  get: TradePeople;
}

const NOBODY: PreviewPeople = {
  give: { families: 0, adults: 0 },
  get: { families: 0, adults: 0 },
};

const total = (goods: TradeGoods, rows: readonly { good: TradeGood; price: number }[]): number =>
  rows.reduce((sum, row) => sum + (goods[row.good] ?? 0) * row.price, 0);

/** Kolik kg obilí soused připíše za lidi, které ves dá (prvních n rodin výběru jádra). */
function peopleCredit(neighbour: VillageNeighbour, give: TradePeople): number {
  const { have } = neighbour.people;
  return (
    have.families.slice(0, give.families).reduce((sum, f) => sum + f.credit, 0) +
    give.adults * have.adultCredit
  );
}

/** Kolik kg obilí soused chce za své lidi (rodiny od první). */
function peoplePrice(neighbour: VillageNeighbour, get: TradePeople): number {
  const { offers } = neighbour.people;
  return (
    offers.families.slice(0, get.families).reduce((sum, f) => sum + f.price, 0) +
    get.adults * offers.adultPrice
  );
}

/** Náhled výměny se sousedem – zboží, které ves dá (`give`) a dostane (`get`), a lidé. */
export function tradePreview(
  neighbour: VillageNeighbour,
  give: TradeGoods,
  get: TradeGoods,
  people: PreviewPeople = NOBODY,
): TradePreview {
  const credit = total(give, neighbour.demands) + peopleCredit(neighbour, people.give);
  const price = total(get, neighbour.offers) + peoplePrice(neighbour, people.get);
  const transport = expeditionTransport(give, get, neighbour.carts);
  const porters = transport.porters;
  const nobody =
    people.give.families + people.give.adults + people.get.families + people.get.adults === 0;
  const empty =
    Object.values(give).every((n) => !n) && Object.values(get).every((n) => !n) && nobody;
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
    carts: transport.carts,
    days: neighbour.tripDays,
    manDays: porters * neighbour.tripDays,
    blocked,
  };
}
