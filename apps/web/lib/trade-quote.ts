// Náhled výměny v panelu obchodu (trade.md – Obchod): bilance pro souseda, nosiči, dny a práce –
// stejné ceny, nosiči a kontroly jako na serveru (`tradeQuote`, i se stejnými důvody česky), jen
// z dat pohledu na ves – i s lidmi (trade.md – Výměna lidí: rodiny a svobodní muži a ženy nic
// nenesou a nosiče nepotřebují). Nejvýš kolik jde v každém řádku dát a dostat (`tradeLimits`) a výběr
// ořezaný na ně (`clampSelection` – nový pohled, nový rok obchodu). Čistý modul.
import {
  EXPEDITION_AWAY,
  NOTHING_TO_TRADE,
  NOT_OFFERED,
  NOT_WANTED,
  NO_COW_ROOM,
  NO_HORSE_ROOM,
  NO_EMIGRANTS,
  NO_OX_ROOM,
  NO_PEOPLE_OFFERED,
  NO_PEOPLE_WANTED,
  OVER_DEMAND,
  OVER_PEOPLE_DEMAND,
  OVER_PEOPLE_SUPPLY,
  OVER_STOCK,
  OVER_SUPPLY,
  UNFAIR,
  expeditionTransport,
  isHorseGood,
  tradePeopleCount,
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
  /** Kolikrát vozy pojedou tam a zpět (jen zbytek nákladu nesou lidé); `days` jsou všechny jízdy. */
  trips: number;
  days: number;
  manDays: number;
  /** Kolik člověkodní vozy ušetří proti nosičům bez vozů (wagons.md – Obchod). */
  savedManDays: number;
  /** Proč výprava nejde – stejné kontroly a důvody jako server (`tradeQuote`); jinak null. */
  blocked: string | null;
}

/** Lidé ve výměně – co ves dá a co dostane (rodiny, svobodní muži a ženy). */
export interface PreviewPeople {
  give: TradePeople;
  get: TradePeople;
}

/** Výběr v panelu obchodu – zboží, které ves dá a dostane, a lidé. */
export interface TradeSelection {
  give: TradeGoods;
  get: TradeGoods;
  people: PreviewPeople;
}

const NOBODY: PreviewPeople = {
  give: { families: 0, men: 0, women: 0 },
  get: { families: 0, men: 0, women: 0 },
};

/** Prázdný výběr. */
export const EMPTY_SELECTION: TradeSelection = { give: {}, get: {}, people: NOBODY };

/**
 * Kolik kusů dobytka druhu `good` se do vsi vejde (trade.md – Dobytek ve třech druzích): krávy do
 * ohrad skotu, voli do ohrad volů (mladí i vycvičení sdílejí místa), koně do ohrad koní; jiné zboží bez meze.
 */
function roomFor(neighbour: VillageNeighbour, good: TradeGood): number {
  if (good === 'cows') return neighbour.room.cows;
  if (good === 'youngOxen' || good === 'trainedOxen') return neighbour.room.oxen;
  if (isHorseGood(good)) return neighbour.room.horses;
  return Infinity;
}

/**
 * Nejvýš kolik jde se sousedem v každém řádku vyměnit: dát nejvýš, co soused letos ještě vezme
 * a co ves má (u lidí koho smí dát – výběr jádra), dostat nejvýš, co soused letos ještě má
 * a u dobytka kolik se do ohrad vejde.
 */
export function tradeLimits(neighbour: VillageNeighbour): TradeSelection {
  const { offers, takes, have } = neighbour.people;
  return {
    give: Object.fromEntries(neighbour.demands.map((r) => [r.good, Math.min(r.left, r.have)])),
    get: Object.fromEntries(
      neighbour.offers.map((r) => [r.good, Math.min(r.left, roomFor(neighbour, r.good))]),
    ),
    people: {
      give: {
        families: Math.min(takes.families, have.families.length),
        men: Math.min(takes.men, have.men),
        women: Math.min(takes.women, have.women),
      },
      get: { families: offers.families.length, men: offers.men, women: offers.women },
    },
  };
}

/** Zboží ořezané na meze – jen řádky panelu, nenulové. */
function clampGoods(goods: TradeGoods, limits: TradeGoods): TradeGoods {
  const out: TradeGoods = {};
  for (const [good, max] of Object.entries(limits) as [TradeGood, number][]) {
    const n = Math.min(goods[good] ?? 0, Math.max(0, max));
    if (n > 0) out[good] = n;
  }
  return out;
}

function clampPeople(people: TradePeople, limits: TradePeople): TradePeople {
  const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));
  return {
    families: clamp(people.families, limits.families),
    men: clamp(people.men, limits.men),
    women: clamp(people.women, limits.women),
  };
}

/**
 * Výběr ořezaný na dnešní meze souseda (`tradeLimits`) – nový pohled na ves (dotaz po herním dni,
 * nový rok obchodu od 1. 11.) může meze snížit; odeslat jde jen to, co panel ukazuje. Když se nic
 * nemění, vrátí tentýž objekt.
 */
export function clampSelection(
  neighbour: VillageNeighbour,
  selection: TradeSelection,
): TradeSelection {
  const limits = tradeLimits(neighbour);
  const next: TradeSelection = {
    give: clampGoods(selection.give, limits.give),
    get: clampGoods(selection.get, limits.get),
    people: {
      give: clampPeople(selection.people.give, limits.people.give),
      get: clampPeople(selection.people.get, limits.people.get),
    },
  };
  return JSON.stringify(next) === JSON.stringify(selection) ? selection : next;
}

const total = (goods: TradeGoods, rows: readonly { good: TradeGood; price: number }[]): number =>
  rows.reduce((sum, row) => sum + (goods[row.good] ?? 0) * row.price, 0);

/** Kolik kg obilí soused připíše za lidi, které ves dá (prvních n rodin výběru jádra). */
function peopleCredit(neighbour: VillageNeighbour, give: TradePeople): number {
  const { have } = neighbour.people;
  return (
    have.families.slice(0, give.families).reduce((sum, f) => sum + f.credit, 0) +
    (give.men + give.women) * have.adultCredit
  );
}

/** Kolik kg obilí soused chce za své lidi (rodiny od první). */
function peoplePrice(neighbour: VillageNeighbour, get: TradePeople): number {
  const { offers } = neighbour.people;
  return (
    offers.families.slice(0, get.families).reduce((sum, f) => sum + f.price, 0) +
    (Math.min(get.men, offers.men) + Math.min(get.women, offers.women)) * offers.adultPrice
  );
}

/** Zboží s kladným množstvím. */
const positive = (goods: TradeGoods): [TradeGood, number][] =>
  (Object.entries(goods) as [TradeGood, number][]).filter(([, n]) => n > 0);

/** Proč lidé ve výměně nejdou (jako `peopleBlocked` jádra), nebo null. */
function peopleBlocked(neighbour: VillageNeighbour, people: PreviewPeople): string | null {
  const { offers, takes, have } = neighbour.people;
  const { give, get } = people;
  if (tradePeopleCount(give) > 0) {
    if (tradePeopleCount(takes) === 0) return NO_PEOPLE_WANTED;
    if (give.families > takes.families || give.men > takes.men || give.women > takes.women) {
      return OVER_PEOPLE_DEMAND;
    }
    if (give.families > have.families.length || give.men > have.men || give.women > have.women) {
      return NO_EMIGRANTS;
    }
  }
  if (tradePeopleCount(get) > 0) {
    if (offers.families.length + offers.men + offers.women === 0) return NO_PEOPLE_OFFERED;
    if (get.families > offers.families.length || get.men > offers.men || get.women > offers.women) {
      return OVER_PEOPLE_SUPPLY;
    }
  }
  return null;
}

/**
 * Proč se koupený dobytek do vsi nevejde (jako `cattleRoomBlocked` jádra – krávy a voli zvlášť,
 * mladí a vycvičení voli dohromady, koně všech druhů dohromady), nebo null.
 */
function roomBlocked(neighbour: VillageNeighbour, get: TradeGoods): string | null {
  if ((get.cows ?? 0) > neighbour.room.cows) return NO_COW_ROOM;
  if ((get.youngOxen ?? 0) + (get.trainedOxen ?? 0) > neighbour.room.oxen) return NO_OX_ROOM;
  // koně všech tří druhů sdílejí místa v ohradách koní (horses.md – Nákup a prodej)
  const horses = (get.foals ?? 0) + (get.mares ?? 0) + (get.ridingHorses ?? 0);
  if (horses > neighbour.room.horses) return NO_HORSE_ROOM;
  return null;
}

/**
 * Náhled výměny se sousedem – zboží, které ves dá (`give`) a dostane (`get`), a lidé. Kontroly
 * v pořadí serveru (`tradeQuote`): výprava na cestě, prázdná výměna, lidé, sháněné zboží (soused
 * vezme, ves má), nabízené zboží (soused má), místo pro koupený dobytek, bilance pro souseda ≥ 0.
 */
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
  const withoutCarts = expeditionTransport(give, get, []);
  const blocked = ((): string | null => {
    if (neighbour.expedition) return EXPEDITION_AWAY;
    const nobody = tradePeopleCount(people.give) + tradePeopleCount(people.get) === 0;
    if (positive(give).length === 0 && positive(get).length === 0 && nobody) {
      return NOTHING_TO_TRADE;
    }
    const peopleBlock = peopleBlocked(neighbour, people);
    if (peopleBlock) return peopleBlock;
    for (const [good, n] of positive(give)) {
      const row = neighbour.demands.find((r) => r.good === good);
      if (!row) return NOT_WANTED;
      if (n > row.left) return OVER_DEMAND;
      if (n > row.have) return OVER_STOCK;
    }
    for (const [good, n] of positive(get)) {
      const row = neighbour.offers.find((r) => r.good === good);
      if (!row) return NOT_OFFERED;
      if (n > row.left) return OVER_SUPPLY;
    }
    const room = roomBlocked(neighbour, get);
    if (room) return room;
    if (credit + 1e-9 < price) return UNFAIR;
    return null;
  })();
  return {
    credit: Math.round(credit),
    price: Math.round(price),
    balance: Math.round(credit - price),
    porters,
    carts: transport.carts,
    trips: transport.trips,
    days: neighbour.tripDays * transport.trips,
    manDays: porters * neighbour.tripDays * transport.trips,
    savedManDays:
      Math.max(0, withoutCarts.porters - porters * transport.trips) * neighbour.tripDays,
    blocked,
  };
}
