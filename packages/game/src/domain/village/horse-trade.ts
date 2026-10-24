// Koně v obchodu se sousedy ve třech druzích (docs/design/horses.md – Nákup a prodej; Martin 23. 10.
// 2026: koně jde nakupovat a prodávat jako ostatní zvířata; ceny a podrobnosti návrh Clauda):
// hříbata, chovné klisny a jezdečtí koně – kusy do ohrady koní. Ves prodá hříbata, klisny nad
// chovné a jezdecké koně bez jezdce – nikdy koně, na kterém někdo jezdí. Jezdecký kůň má cenu za
// kus podle výcviku (`horseValueKg`). Koupený kůň přijde se svým věkem a výcvikem (los ze seedu
// souseda a roku obchodu) a potřebuje místo v ohradě koní. Koně jdou po svých s honákem
// (trade.ts – honák na 4 koně). Vzor `cattle-trade.ts`. Čisté funkce bez I/O.
import { createRandom, deriveSeed } from '../landscape/random';
import { butcher } from './livestock';
import { horsesWanted } from './horse-breeding';
import {
  horsePens,
  horseRoom,
  horsesInPlaces,
  isFoalByAge,
  penHorses,
  villageHorses,
} from './horses';
import { HORSE_GOODS, neighbourOf, neighbourStock, seasonSupply, tradeSeason } from './neighbours';
import { builtPenSquares } from './pens';
import { HORSES, HORSE_TRADE, PEN_PLACES_PER_SQUARE, TRADE_GOOD_VALUES } from './rules';
import type { Direction8, Horse, HorseGood, TradeGoods, TradedHorse, VillageState } from './types';

const DAYS_PER_YEAR = 365.25;

export const NO_HORSE_ROOM = 'Tolik koní se do ohrady koní nevejde.';

/**
 * Hodnota jezdeckého koně v kg obilí (horses.md – Nákup a prodej): 2 400 nevycvičený – 3 600
 * vycvičený, lineárně podle výcviku.
 */
export function horseValueKg(horse: Pick<Horse, 'training'>): number {
  const share = horse.training / HORSES.trainingFull;
  return TRADE_GOOD_VALUES.ridingHorses.valueKg + HORSE_TRADE.ridingPerTrainingKg * share;
}

/** Druh koně v obchodu ke dni `day`: hříbě do 3 let, klisna, jezdecký kůň (samec). */
function tradeKind(horse: Pick<Horse, 'bornDay' | 'sex'>, day: number): HorseGood {
  if (isFoalByAge(horse, day)) return 'foals';
  return horse.sex === 'female' ? 'mares' : 'ridingHorses';
}

/**
 * Koně druhu `good`, které ves smí prodat, v pořadí prodeje – vždy jen bez jezdce: hříbata napřed
 * nejstarší; klisny nad chovné (nejmladší `horsesWanted.mares` zůstanou), napřed nejstarší;
 * jezdečtí koně napřed nejméně vycvičení – a když na žádném samci nikdo nejezdí a ves má klisnu,
 * nejlépe vycvičený zůstane jako chovný hřebec (návrh Clauda, jako chovný pár krav).
 */
function sellableHorses(state: VillageState, good: HorseGood, day: number): Horse[] {
  const all = villageHorses(state);
  const free = all.filter((h) => h.riderId === undefined && tradeKind(h, day) === good);
  if (good === 'foals') return free.sort((a, b) => a.bornDay - b.bornDay || a.id - b.id);
  if (good === 'mares') {
    const youngest = free.sort((a, b) => b.bornDay - a.bornDay || a.id - b.id);
    return youngest.slice(horsesWanted(state, day).mares).reverse();
  }
  const sorted = free.sort((a, b) => a.training - b.training || a.id - b.id);
  const ridden = all.some((h) => h.riderId !== undefined && tradeKind(h, day) === 'ridingHorses');
  const hasMare = all.some((h) => tradeKind(h, day) === 'mares');
  return !ridden && hasMare ? sorted.slice(0, -1) : sorted;
}

/** Kolik koní druhu `good` ves v den `day` prodá (`sellableHorses`). */
export function horsesForSale(state: VillageState, good: HorseGood, day: number): number {
  return sellableHorses(state, good, day).length;
}

/** Koně, které ves při prodeji `n` kusů druhu `good` dá – v pořadí prodeje. */
export function horsesToSell(
  state: VillageState,
  good: HorseGood,
  n: number,
  day: number,
): Horse[] {
  return sellableHorses(state, good, day).slice(0, Math.max(0, n));
}

/**
 * Za kolik kg obilí (hodnota) ves prodá `n` koní druhu `good`: jezdečtí koně za kus podle výcviku
 * (`horseValueKg`) – koně navíc nad prodejné za základ; ostatní druhy za hodnotu zboží.
 */
export function horsesSaleValues(
  state: VillageState,
  good: HorseGood,
  n: number,
  day: number,
): number[] {
  const base = TRADE_GOOD_VALUES[good].valueKg;
  if (good !== 'ridingHorses') return Array.from({ length: n }, () => base);
  const chosen = horsesToSell(state, good, n, day).map(horseValueKg);
  return [...chosen, ...Array.from({ length: n - chosen.length }, () => base)];
}

/** Koně, které výpravy na cestě teprve přivedou. */
function horsesComing(state: Pick<VillageState, 'trade'>): number {
  return (state.trade?.expeditions ?? []).reduce(
    (sum, e) => sum + HORSE_GOODS.reduce((n, g) => n + (e.get[g] ?? 0), 0),
    0,
  );
}

/**
 * Kolik koní se do vsi vejde (kusy): volná místa hotových ohrad koní bez koní, které výpravy na
 * cestě teprve přivedou (koupený kůň má vlastní místo – hříbě od souseda je odstavené).
 */
export function horseTradeRoom(state: VillageState, day: number): number {
  return Math.max(0, horseRoom(state, day) - horsesComing(state));
}

/** Proč se koně, které ves dostane (`get`), do ohrad koní nevejdou, nebo null. */
export function horseRoomBlocked(state: VillageState, get: TradeGoods, day: number): string | null {
  const n = HORSE_GOODS.reduce((sum, g) => sum + (get[g] ?? 0), 0);
  return n > 0 && n > horseTradeRoom(state, day) ? NO_HORSE_ROOM : null;
}

/** Výcvik koně podle věku (horses.md – Výcvik koně): 0 % ve 3 letech – 100 % ve 12. */
function trainingAtAge(ageYears: number): number {
  const span = HORSES.trainedAtYears - HORSES.serviceFromYears;
  const share = Math.min(1, Math.max(0, (ageYears - HORSES.serviceFromYears) / span));
  return Math.round(share * HORSES.trainingFull);
}

/**
 * Kůň `index` druhu `good`, kterého soused ve směru prodává v roce obchodu `season` – věk ze seedu
 * souseda a roku (HORSE_TRADE.ages), den narození k `day`. Hříbě má pohlaví ze seedu, klisna je
 * klisna, jezdecký kůň samec s výcvikem podle věku.
 */
function neighbourHorse(
  seed: number,
  direction: Direction8,
  season: number,
  good: HorseGood,
  index: number,
  day: number,
): TradedHorse {
  const rnd = createRandom(
    deriveSeed(seed, `neighbour-horse:${direction}:${season}:${good}:${index}`),
  );
  const { from, to } = HORSE_TRADE.ages[good];
  const age = from + (to - from) * rnd.next();
  const sex: Horse['sex'] =
    good === 'mares' ? 'female' : good === 'ridingHorses' || rnd.next() < 0.5 ? 'male' : 'female';
  return {
    bornDay: day - Math.round(age * DAYS_PER_YEAR),
    sex,
    training: good === 'ridingHorses' ? trainingAtAge(age) : 0,
  };
}

/**
 * Dalších `n` koní druhu `good`, které soused ve směru v den `day` prodá – v pořadí, v jakém je ves
 * za rok obchodu kupuje (od prvního, kterého ještě nekoupila).
 */
export function offeredHorses(
  state: Pick<VillageState, 'seed' | 'trade'>,
  direction: Direction8,
  good: HorseGood,
  n: number,
  day: number,
): TradedHorse[] {
  const season = tradeSeason(day);
  const full = seasonSupply(neighbourOf(state.seed, direction), state.seed, season)[good] ?? 0;
  const left = neighbourStock(state, direction, day).supply[good] ?? 0;
  const first = Math.max(0, full - left);
  return Array.from({ length: Math.max(0, n) }, (_, k) =>
    neighbourHorse(state.seed, direction, season, good, first + k, day),
  );
}

/** Koně, které ves za `get` dostane (hříbata, klisny, jezdečtí koně), v den `day`. */
export function boughtHorses(
  state: Pick<VillageState, 'seed' | 'trade'>,
  direction: Direction8,
  get: TradeGoods,
  day: number,
): TradedHorse[] {
  return HORSE_GOODS.flatMap((g) => offeredHorses(state, direction, g, get[g] ?? 0, day));
}

/**
 * Prodaní koně odejdou (mutuje stav) – `horsesToSell`. Volá se až po kontrole (`horsesForSale`).
 */
export function removeHorses(state: VillageState, good: HorseGood, n: number, day: number): void {
  if (n <= 0) return;
  const sold = new Set(horsesToSell(state, good, n, day).map((h) => h.id));
  for (const pen of horsePens(state)) {
    const horses = penHorses(pen);
    if (horses.some((h) => sold.has(h.id))) pen.horses = horses.filter((h) => !sold.has(h.id));
  }
}

/**
 * Koupení koně přišli (mutuje stav): do hotových ohrad koní s volným místem v pořadí id, kdo se už
 * nevejde (místa mezitím zabrala hříbata), do první ohrady koní navíc – přebytek jde 1. 11. na maso
 * (`retireHorses`). Ves, která ohradu koní mezitím nemá, koně porazí (maso do uzení).
 */
export function addHorses(state: VillageState, horses: readonly TradedHorse[], day: number): void {
  if (horses.length === 0) return;
  const pens = horsePens(state).sort((a, b) => a.id - b.id);
  if (pens.length === 0) {
    butcher(state, horses.length * HORSES.meatKg);
    return;
  }
  let next = 0;
  const take = (k: number): Horse[] => {
    const out = horses.slice(next, next + k).map((h) => ({ id: state.nextId++, ...h }));
    next += out.length;
    return out;
  };
  for (const pen of pens) {
    const places = builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.horse;
    const free = Math.max(0, places - horsesInPlaces(penHorses(pen), day));
    if (free > 0 && next < horses.length) pen.horses = [...penHorses(pen), ...take(free)];
  }
  if (next < horses.length) pens[0]!.horses = [...penHorses(pens[0]!), ...take(horses.length)];
}
