// Sousedé bez simulace (docs/design/trade.md – Sousedé, varianta a): v každém z 8 směrů za krajem
// mapy je ves se stálou povahou – něčím se živí (obilnáři, pastevci, lesní ves, řemeslníci), to
// nabízí, a shání, čeho sama nemá dost; obchoduje se jen zbožím, které má i ves (Martin 19. 10.
// 2026: „Nech jen společné suroviny, nezaváděj nové.“). Povaha je čistá funkce seedu a směru;
// ukládá se jen, kolik ze zásob a poptávky roku zbývá (`NeighbourStock`) – 1. 11. se doplní. Až
// budou skutečné vsi NPC vojvodů (war.md), obchod převezmou ony.
import { dateOfDayIndex } from '../calendar';
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { suggestVillageName } from './names';
import { neighbourPeople, storedNeighbourPeople } from './people-trade';
import { NEIGHBOR_DIRECTIONS, NEIGHBOURS, TRADE, TRADE_GOOD_VALUES } from './rules';
import type { Direction8, NeighbourStock, TradeGood, TradeGoods, VillageState } from './types';

/** Zboží obchodu v pořadí panelu (obilí a jídlo, dobytek a dřevo, výrobky řemesel). */
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
];

/** Čím se soused živí (trade.md – Sousedé): obilnáři, pastevci, lesní ves, řemeslníci. */
export type NeighbourKind = keyof typeof NEIGHBOURS.kinds;

/** Druhy sousedů v pořadí tabulky NEIGHBOURS.kinds. */
const NEIGHBOUR_KINDS = Object.keys(NEIGHBOURS.kinds) as NeighbourKind[];

/** Stálá povaha souseda – jméno vsi, co nabízí a shání a roční zásoby a poptávka (kg / kusy). */
export interface Neighbour {
  direction: Direction8;
  name: string;
  kind: NeighbourKind;
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
 * Čím se živí soused ve směru `direction`: kolem vsi je každý druh dvakrát, rozdaný do směrů
 * deterministicky ze seedu (co ves potřebuje, to některý soused nabízí).
 */
export function neighbourKind(seed: number, direction: Direction8): NeighbourKind {
  const rnd = createRandom(deriveSeed(seed, 'neighbour-kinds'));
  const kinds = shuffled([...NEIGHBOUR_KINDS, ...NEIGHBOUR_KINDS], rnd);
  return kinds[NEIGHBOR_DIRECTIONS.indexOf(direction)]!;
}

/**
 * Povaha souseda ve směru `direction` – deterministicky ze seedu (`seed` = seed vsi, dokud mapy
 * nemají polohu ve světě – trade.md) a směru: podle druhu (`neighbourKind`) nabízí 2–3 druhy své
 * nabídky a shání 2–3 druhy – `always` vždy, zbytek ze svých potřeb; roční zásoba každého
 * nabízeného zboží v hodnotě NEIGHBOURS.supplyKg kg obilí, poptávka NEIGHBOURS.demandKg.
 */
export function neighbourOf(seed: number, direction: Direction8): Neighbour {
  const kind = neighbourKind(seed, direction);
  const profile = NEIGHBOURS.kinds[kind];
  const rnd = createRandom(deriveSeed(seed, `neighbour:${direction}`));
  const offerCount = between(rnd, NEIGHBOURS.offers.min, NEIGHBOURS.offers.max);
  const demandCount = between(rnd, NEIGHBOURS.demands.min, NEIGHBOURS.demands.max);
  const offers = ordered(shuffled(profile.offers, rnd).slice(0, offerCount));
  const demands = ordered([
    profile.always,
    ...shuffled(profile.needs, rnd).slice(0, demandCount - 1),
  ]);
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
  return { direction, name, kind, offers, demands, supply, demand };
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
 * soused, se kterým ves ještě neobchodovala) plné roční zásoby a poptávka, i lidé roku
 * (`neighbourPeople` – trade.md, Výměna lidí; zbytek roku uložený před výměnou lidí je nemá – pak
 * platí celý rok).
 */
export function neighbourStock(
  state: Pick<VillageState, 'seed' | 'trade'>,
  direction: Direction8,
  day: number,
): NeighbourStock {
  const season = tradeSeason(day);
  const stored = state.trade?.neighbours.find((n) => n.direction === direction);
  if (stored && stored.season === season) {
    if (!stored.people)
      return { ...stored, people: neighbourPeople(state.seed, direction, season) };
    // zbytek roku uložený před muži a ženami zvlášť – dospělí se převedou (trade.md)
    const people = storedNeighbourPeople(stored.people, state.seed, direction, season);
    return people === stored.people ? stored : { ...stored, people };
  }
  const neighbour = neighbourOf(state.seed, direction);
  return {
    direction,
    season,
    supply: { ...neighbour.supply },
    demand: { ...neighbour.demand },
    people: neighbourPeople(state.seed, direction, season),
  };
}
