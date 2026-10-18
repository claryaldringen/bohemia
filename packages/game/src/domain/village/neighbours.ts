// Sousedé bez simulace (docs/design/trade.md – Sousedé, varianta a): v každém z 8 směrů za krajem
// mapy je ves se stálou povahou – 2–3 druhy zboží nabízí (přebytek), 2–3 shání. Povaha je čistá
// funkce seedu a směru; ukládá se jen, kolik ze zásob a poptávky roku zbývá (`NeighbourStock`) –
// 1. 11. se doplní. Až budou skutečné vsi NPC vojvodů (war.md), obchod převezmou ony.
import { dateOfDayIndex } from '../calendar';
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { suggestVillageName } from './names';
import { NEIGHBOURS, TRADE, TRADE_GOOD_VALUES } from './rules';
import type { Direction8, NeighbourStock, TradeGood, TradeGoods, VillageState } from './types';

/** Zboží obchodu v pořadí panelu (obilí a jídlo, dobytek a dřevo, výrobky, zboží zvenku). */
export const TRADE_GOODS: readonly TradeGood[] = [
  'grain',
  'legumes',
  'meat',
  'cheese',
  'cattle',
  'logs',
  'pottery',
  'tools',
  'charcoal',
  'salt',
  'iron',
  'honey',
  'furs',
];

/** Zboží zvenku – ves si ho sama nevyrobí (trade.md – Zboží zvenku ve vsi). */
export const FOREIGN_GOODS_LIST: readonly TradeGood[] = ['salt', 'iron', 'honey', 'furs'];

/** Zboží, které ves sama umí (soused shání jen to). */
const HOME_GOODS = TRADE_GOODS.filter((g) => !FOREIGN_GOODS_LIST.includes(g));

/** Stálá povaha souseda – jméno vsi, co nabízí a shání a roční zásoby a poptávka (kg / kusy). */
export interface Neighbour {
  direction: Direction8;
  name: string;
  offers: TradeGood[];
  demands: TradeGood[];
  /** Zásoba nabízeného zboží na rok (doplní se 1. 11.). */
  supply: TradeGoods;
  /** Kolik sháněného zboží za rok vezme. */
  demand: TradeGoods;
}

/** Celé číslo v rozmezí od–do včetně. */
function between(rnd: Random, from: number, to: number): number {
  return from + Math.floor(rnd.next() * (to - from + 1));
}

/** Zamíchané pole (Fisher–Yates) – nový objekt. */
function shuffled<T>(items: readonly T[], rnd: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd.next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Množství zboží v hodnotě `valueKg` kg obilí – celé, aspoň 1. */
function amountWorth(good: TradeGood, valueKg: number): number {
  return Math.max(1, Math.round(valueKg / TRADE_GOOD_VALUES[good].valueKg));
}

/** V pořadí TRADE_GOODS. */
function ordered(goods: readonly TradeGood[]): TradeGood[] {
  return TRADE_GOODS.filter((g) => goods.includes(g));
}

/**
 * Povaha souseda ve směru `direction` – deterministicky ze seedu (`seed` = seed vsi, dokud mapy
 * nemají polohu ve světě – trade.md) a směru: jedno zboží zvenku a 1–2 další nabízí, 2–3 druhy
 * zboží, které ves sama umí, shání; roční zásoba každého nabízeného zboží v hodnotě
 * NEIGHBOURS.supplyKg kg obilí, poptávka NEIGHBOURS.demandKg.
 */
export function neighbourOf(seed: number, direction: Direction8): Neighbour {
  const rnd = createRandom(deriveSeed(seed, `neighbour:${direction}`));
  const offerCount = between(rnd, NEIGHBOURS.offers.min, NEIGHBOURS.offers.max);
  const demandCount = between(rnd, NEIGHBOURS.demands.min, NEIGHBOURS.demands.max);
  const foreign = FOREIGN_GOODS_LIST[Math.floor(rnd.next() * FOREIGN_GOODS_LIST.length)]!;
  const others = shuffled(
    TRADE_GOODS.filter((g) => g !== foreign),
    rnd,
  ).slice(0, offerCount - 1);
  const offers = ordered([foreign, ...others]);
  const demands = ordered(
    shuffled(
      HOME_GOODS.filter((g) => !offers.includes(g)),
      rnd,
    ).slice(0, demandCount),
  );
  const supply: TradeGoods = {};
  for (const good of offers) {
    const { from, to } = NEIGHBOURS.supplyKg;
    supply[good] = amountWorth(good, from + (to - from) * rnd.next());
  }
  const demand: TradeGoods = {};
  for (const good of demands) {
    const { from, to } = NEIGHBOURS.demandKg;
    demand[good] = amountWorth(good, from + (to - from) * rnd.next());
  }
  const name = suggestVillageName(deriveSeed(seed, `neighbour-name:${direction}`));
  return { direction, name, offers, demands, supply, demand };
}

/** Rok obchodu – herní rok posledního doplnění zásob sousedů (1. 11.) do dne `day` včetně. */
export function tradeSeason(day: number): number {
  const date = dateOfDayIndex(day);
  const { month, day: restock } = TRADE.restockDay;
  const after = date.month > month || (date.month === month && date.day >= restock);
  return after ? date.year : date.year - 1;
}

/**
 * Co soused v den `day` ještě letos dá a vezme: uložený zbytek roku, nebo (nový rok obchodu,
 * soused, se kterým ves ještě neobchodovala) plné roční zásoby a poptávka.
 */
export function neighbourStock(
  state: Pick<VillageState, 'seed' | 'trade'>,
  direction: Direction8,
  day: number,
): NeighbourStock {
  const season = tradeSeason(day);
  const stored = state.trade?.neighbours.find((n) => n.direction === direction);
  if (stored && stored.season === season) return stored;
  const neighbour = neighbourOf(state.seed, direction);
  return { direction, season, supply: { ...neighbour.supply }, demand: { ...neighbour.demand } };
}
