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
import { HORSE_TRADE, NEIGHBOR_DIRECTIONS, NEIGHBOURS, TRADE, TRADE_GOOD_VALUES } from './rules';
import type {
  CattleGood,
  Direction8,
  HorseGood,
  NeighbourGood,
  NeighbourStock,
  TradeGood,
  TradeGoods,
  VillageState,
} from './types';

/** Druhy dobytka v obchodu v pořadí panelu (trade.md – Dobytek ve třech druzích). */
export const CATTLE_GOODS: readonly CattleGood[] = ['cows', 'youngOxen', 'trainedOxen'];

/** Je zboží dobytek (krávy, mladí nebo vycvičení voli)? */
export function isCattleGood(good: string): good is CattleGood {
  return (CATTLE_GOODS as readonly string[]).includes(good);
}

/** Druhy koní v obchodu v pořadí panelu (horses.md – Nákup a prodej). */
export const HORSE_GOODS: readonly HorseGood[] = ['foals', 'mares', 'ridingHorses'];

/** Je zboží kůň (hříbě, klisna nebo jezdecký kůň)? */
export function isHorseGood(good: string): good is HorseGood {
  return (HORSE_GOODS as readonly string[]).includes(good);
}

/** Jde zboží po svých s honákem (dobytek a koně) – nese ho nikdo? */
export function isLivestockGood(good: string): good is CattleGood | HorseGood {
  return isCattleGood(good) || isHorseGood(good);
}

/** Zboží obchodu v pořadí panelu (obilí a jídlo, dobytek, koně a dřevo, výrobky řemesel). */
export const TRADE_GOODS: readonly TradeGood[] = [
  'grain',
  'legumes',
  'meat',
  'cheese',
  ...CATTLE_GOODS,
  ...HORSE_GOODS,
  'logs',
  'pottery',
  'ironBars',
  'charcoal',
];

/**
 * Pořadí zboží v povaze souseda – jako TRADE_GOODS, dobytek vcelku (`cattle`) na místě krav, bez
 * koní (ti mají vlastní losy – `horseAmounts`). Podle něj se losují zásoby a poptávka
 * (`neighbourOf`), takže ostatní zboží souseda zůstalo, jaké bylo před dobytkem ve třech druzích
 * a před koňmi.
 */
const PROFILE_ORDER: readonly NeighbourGood[] = TRADE_GOODS.flatMap((g): NeighbourGood[] => {
  if (g === 'cows') return ['cattle'];
  return isLivestockGood(g) ? [] : [g];
});

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

/** Zboží povahy v pořadí PROFILE_ORDER. */
function orderedProfile(goods: readonly NeighbourGood[]): NeighbourGood[] {
  return PROFILE_ORDER.filter((g) => goods.includes(g));
}

/**
 * Roční množství zboží povahy `tokens` (v pořadí PROFILE_ORDER) v hodnotě od–do kg obilí: každé
 * zboží jedním losem z `rnd` jako dřív; dobytek vcelku (`cattle`) se rozloží na druhy dobytka
 * souseda (`cattle`) – krávy tímtéž losem (stejně kusů jako dřív dobytka), ostatní druhy losy
 * z `extra` (ostatní zboží souseda se tak nezměnilo). `alwaysCattle` – druhy dobytka i bez
 * `cattle` v povaze (pastevci nabízejí dobytek vždy), jen losy z `extra`.
 */
function amounts(
  tokens: readonly NeighbourGood[],
  range: { from: number; to: number },
  rnd: Random,
  extra: Random,
  cattle: readonly CattleGood[],
  alwaysCattle: boolean,
): TradeGoods {
  const out: TradeGoods = {};
  const value = (r: Random): number => range.from + (range.to - range.from) * r.next();
  for (const token of tokens) {
    const v = value(rnd);
    if (token !== 'cattle') {
      out[token] = amountWorth(token, v);
      continue;
    }
    cattle.forEach((good, i) => {
      out[good] = amountWorth(good, i === 0 ? v : value(extra));
    });
  }
  if (alwaysCattle && !tokens.includes('cattle')) {
    for (const good of cattle) out[good] = amountWorth(good, value(extra));
  }
  return out;
}

/**
 * Koně souseda podle povahy (horses.md – Nákup a prodej): roční množství každého druhu, který
 * nabízí (`supply`) a shání (`demand`), HORSE_TRADE.perYear kusů – losy z vlastního proudu, ať se
 * ostatní zboží souseda nezmění (jako `extra` u dobytka).
 */
function horseAmounts(
  seed: number,
  direction: Direction8,
  kind: NeighbourKind,
): { supply: TradeGoods; demand: TradeGoods } {
  const rnd = createRandom(deriveSeed(seed, `neighbour-horses:${direction}`));
  const { offers, demands } = NEIGHBOURS.horseKinds[kind];
  const roll = (): number => between(rnd, HORSE_TRADE.perYear.min, HORSE_TRADE.perYear.max);
  const supply: TradeGoods = {};
  const demand: TradeGoods = {};
  for (const good of offers) supply[good] = roll();
  for (const good of demands) demand[good] = roll();
  return { supply, demand };
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
  const offerTokens = orderedProfile(shuffled(profile.offers, rnd).slice(0, offerCount));
  const demandTokens = orderedProfile([
    profile.always,
    ...shuffled(profile.needs, rnd).slice(0, demandCount - 1),
  ]);
  // druhy dobytka souseda (trade.md – Dobytek ve třech druzích) – losy navíc zvlášť
  const cattle = NEIGHBOURS.cattleKinds[kind];
  const extra = createRandom(deriveSeed(seed, `neighbour-cattle:${direction}`));
  const always = (NEIGHBOURS.cattleAlways as readonly string[]).includes(kind);
  const horses = horseAmounts(seed, direction, kind);
  const supply = {
    ...amounts(offerTokens, NEIGHBOURS.supplyKg, rnd, extra, cattle, always),
    ...horses.supply,
  };
  const demand = {
    ...amounts(demandTokens, NEIGHBOURS.demandKg, rnd, extra, cattle, false),
    ...horses.demand,
  };
  const offers = ordered(Object.keys(supply) as TradeGood[]);
  const demands = ordered(Object.keys(demand) as TradeGood[]);
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
 * Zásoba souseda na rok obchodu `season` (doplnění 1. 11.): roční zásoba z povahy, jen jezdecké
 * koně mají pastevci jen některý rok (horses.md – Nákup a prodej; HORSE_TRADE.ridingYearChance) –
 * los z proudu koní souseda a roku. Nový objekt.
 */
export function seasonSupply(
  neighbour: Pick<Neighbour, 'direction' | 'supply'>,
  seed: number,
  season: number,
): TradeGoods {
  const supply = { ...neighbour.supply };
  if (supply.ridingHorses !== undefined) {
    const rnd = createRandom(deriveSeed(seed, `neighbour-horses:${neighbour.direction}:${season}`));
    if (rnd.next() >= HORSE_TRADE.ridingYearChance) supply.ridingHorses = 0;
  }
  return supply;
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
    supply: seasonSupply(neighbour, state.seed, season),
    demand: { ...neighbour.demand },
    people: neighbourPeople(state.seed, direction, season),
  };
}
