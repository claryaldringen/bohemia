// Dobytek v obchodu se sousedy ve třech druzích (docs/design/trade.md – Dobytek ve třech druzích;
// Martin 20. 10. 2026: „s dobytkem by také mělo jít obchodovat. Představuju si tři kategorie -
// krávy, mladé voly (musí se vycvičit) a vycvičené voly“; podrobnosti návrh Clauda): krávy jdou do
// stáda skotu a potřebují místo v ohradě skotu, mladí voli do ohrady volů na výcvik (za 2 roky
// táhnou), vycvičení voli do ohrady volů a táhnou hned (mají za sebou CATTLE_TRADE.servedYears let
// služby). Ves prodá krávy ze stáda (chovný pár zůstane), mladé voly z volů ve výcviku a vycvičené
// voly doma mimo posledních let služby. Dobytek jde po svých s honákem (trade.ts – `carriers`).
// Čisté funkce bez I/O.
import { ensureLivestock, roomForWinter } from './livestock';
import { CATTLE_GOODS, neighbourOf } from './neighbours';
import { isTrained, oxPens, oxPlaces, oxenComing, oxenHome, oxenToEdit, villageOxen } from './oxen';
import { builtPenSquares, herdRoom, oxenOf, oxTrainedDay, penCapacity, penSpecies } from './pens';
import { CATTLE_TRADE, OXEN, PEN_PLACES_PER_SQUARE, TRADE } from './rules';
import type { CattleGood, NeighbourStock, Ox, TradeGood, TradeGoods, VillageState } from './types';

const DAYS_PER_YEAR = 365.25;
const EPSILON = 1e-9;

export const NO_COW_ROOM = 'Tolik krav se do ohrady skotu nevejde.';
export const NO_OX_ROOM = 'Tolik volů se do ohrady volů nevejde.';

/** Krávy, které výpravy na cestě teprve přivedou. */
export function cowsComing(state: Pick<VillageState, 'trade'>): number {
  return (state.trade?.expeditions ?? []).reduce((sum, e) => sum + (e.get.cows ?? 0), 0);
}

/** Vycvičení voli, které ves smí prodat: mimo posledních OXEN.trainingYears let služby. */
function sellableTrained(ox: Ox, day: number): boolean {
  const lastYears = (OXEN.serviceYears - OXEN.trainingYears) * DAYS_PER_YEAR - EPSILON;
  return isTrained(ox, day) && day - ox.trainedDay < lastYears;
}

/**
 * Kolik dobytka druhu `good` ves v den `day` prodá: krávy ze stáda bez chovného páru
 * (TRADE.keepCows), mladé voly z volů ve výcviku, vycvičené voly doma (bez volů u vozů výprav)
 * mimo posledních let služby – dosluhující soused nekoupí.
 */
export function cattleForSale(state: VillageState, good: CattleGood, day: number): number {
  if (good === 'cows') {
    return Math.max(0, Math.floor(state.livestock?.herds.cow ?? 0) - TRADE.keepCows);
  }
  let n = 0;
  for (const pen of oxPens(state)) {
    for (const ox of oxenOf(pen)) {
      if (good === 'youngOxen' ? !isTrained(ox, day) : sellableTrained(ox, day)) n++;
    }
  }
  return good === 'trainedOxen' ? Math.min(n, oxenHome(state, day)) : n;
}

/**
 * Kolik dobytka druhu `good` se do vsi vejde (kusy): krávy do volných míst hotových ohrad skotu
 * tak, aby se i s jarními telaty vešly na noc (`roomForWinter` – ohrady skotu a u domů; 1. 11. ves
 * nad ně krávy porazí – oxen.md, Kapacita ohrady), voli do volných míst hotových ohrad volů – bez
 * dobytka, který výpravy na cestě teprve přivedou, a volů bez ohrady.
 */
export function cattleRoom(state: VillageState, good: CattleGood): number {
  if (good === 'cows') {
    const places = Math.min(penCapacity(state).cow, roomForWinter(herdRoom(state), 'cow'));
    const free = places - (state.livestock?.herds.cow ?? 0) - cowsComing(state);
    return Math.max(0, Math.floor(free + EPSILON));
  }
  const free =
    oxPlaces(state) - villageOxen(state) - oxenComing(state) - (state.looseOxen?.length ?? 0);
  return Math.max(0, free);
}

/** Dobytek ve výměně – kolik krav a volů (mladí a vycvičení dohromady). */
function cattleOf(goods: TradeGoods): { cows: number; oxen: number } {
  return { cows: goods.cows ?? 0, oxen: (goods.youngOxen ?? 0) + (goods.trainedOxen ?? 0) };
}

/**
 * Proč se dobytek, který ves dostane (`get`), do vsi nevejde (`cattleRoom` – krávy a voli zvlášť,
 * mladí a vycvičení voli sdílejí místa), nebo null.
 */
export function cattleRoomBlocked(state: VillageState, get: TradeGoods): string | null {
  const { cows, oxen } = cattleOf(get);
  if (cows > cattleRoom(state, 'cows')) return NO_COW_ROOM;
  if (oxen > cattleRoom(state, 'youngOxen')) return NO_OX_ROOM;
  return null;
}

/**
 * Voli, které ves prodá, ze seznamů volů ohrad `lists` – mladí napřed ti, které výcvik čeká
 * nejdéle, vycvičení napřed ti, kteří slouží nejdéle (mimo dosluhující).
 */
function oxenToSell(
  lists: readonly (readonly Ox[])[],
  good: CattleGood,
  n: number,
  day: number,
): Set<Ox> {
  const all = lists.flat();
  const chosen =
    good === 'youngOxen'
      ? all.filter((ox) => !isTrained(ox, day)).sort((a, b) => b.trainedDay - a.trainedDay)
      : all.filter((ox) => sellableTrained(ox, day)).sort((a, b) => a.trainedDay - b.trainedDay);
  return new Set(chosen.slice(0, n));
}

/**
 * Prodaný dobytek odejde (mutuje stav): krávy ze stáda, voli z ohrad volů (`oxenToSell`). Volá se
 * až po kontrole (`cattleForSale`).
 */
export function removeCattle(state: VillageState, good: CattleGood, n: number, day: number): void {
  if (n <= 0) return;
  if (good === 'cows') {
    const livestock = ensureLivestock(state);
    livestock.herds.cow = Math.max(0, livestock.herds.cow - n);
    return;
  }
  // ohrady uložené dřív dostanou voly napřed (`oxenToEdit`), ať se vybírá z týchž kusů
  const pens = oxPens(state);
  const lists = pens.map((pen) => oxenToEdit(pen));
  const sold = oxenToSell(lists, good, n, day);
  pens.forEach((pen, i) => {
    const oxen = lists[i]!;
    if (oxen.some((ox) => sold.has(ox))) pen.oxen = oxen.filter((ox) => !sold.has(ox));
  });
}

/** Den vycvičení vola od souseda, který přišel v den `day` (trade.md – Dobytek ve třech druzích). */
export function boughtOxTrainedDay(good: 'youngOxen' | 'trainedOxen', day: number): number {
  if (good === 'youngOxen') return oxTrainedDay(day);
  return day - Math.round(CATTLE_TRADE.servedYears * DAYS_PER_YEAR);
}

/**
 * Koupený dobytek přišel (mutuje stav): krávy do stáda skotu, voli do hotových ohrad volů s místem
 * v pořadí id – mladí s výcvikem 2 roky od příchodu, vycvičení se službou za sebou. Kdo se už
 * nevejde (místa mezitím zabral výcvik), zůstane bez ohrady (`looseOxen`) a přejde do ní, až se
 * místo uvolní (`looseOxenDay`).
 */
export function addCattle(state: VillageState, good: CattleGood, n: number, day: number): void {
  if (n <= 0) return;
  if (good === 'cows') {
    ensureLivestock(state).herds.cow += n;
    return;
  }
  const trainedDay = boughtOxTrainedDay(good, day);
  let left = n;
  const pens = oxPens(state)
    .filter((pen) => pen.builtDay !== null)
    .sort((a, b) => a.id - b.id);
  for (const pen of pens) {
    const oxen = oxenToEdit(pen);
    const free = builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.team - oxen.length;
    for (let k = 0; k < free && left > 0; k++, left--) oxen.push({ trainedDay });
  }
  if (left > 0) {
    const loose = (state.looseOxen ??= []);
    for (let k = 0; k < left; k++) loose.push({ trainedDay });
  }
}

/**
 * Ves bez vycvičených volů, které prodává (`give`) – jen pro výběr vozů výpravy (`tradeCarts` –
 * prodaní voli vůz netáhnou). Bez prodeje vycvičených vrátí týž stav; jinak mělkou kopii s novými
 * seznamy volů (stav nemění).
 */
export function withoutSoldOxen(state: VillageState, give: TradeGoods, day: number): VillageState {
  const n = give.trainedOxen ?? 0;
  if (n <= 0) return state;
  const pens = state.pens ?? [];
  const lists = pens.map((pen) => (penSpecies(pen) === 'team' ? oxenOf(pen) : []));
  const sold = oxenToSell(lists, 'trainedOxen', n, day);
  return {
    ...state,
    pens: pens.map((pen, i) => {
      const oxen = lists[i]!;
      return oxen.some((ox) => sold.has(ox))
        ? { ...pen, oxen: oxen.filter((ox) => !sold.has(ox)) }
        : pen;
    }),
  };
}

// --- převod starých vsí ----------------------------------------------------------------------

/** Zboží s jedním druhem dobytka `cattle` (uložené před třemi druhy) – krávy. */
type LegacyGoods = TradeGoods & { cattle?: number };

/** Zboží s `cattle` přejmenovaným na krávy (nový objekt); bez něj týž objekt. */
function renamedCattle(goods: TradeGoods): TradeGoods {
  const legacy = goods as LegacyGoods;
  if (legacy.cattle === undefined) return goods;
  const out: LegacyGoods = { ...legacy };
  delete out.cattle;
  out.cows = (out.cows ?? 0) + legacy.cattle;
  return out;
}

/**
 * Zbytek roku souseda s druhy dobytka podle jeho dnešní povahy: druhy, které soused nově nabízí
 * nebo shání (pastevci dobytek vždy, mladí a vycvičení voli), dostanou plné roční množství,
 * druhy, které už nemá, zmizí; ostatní zboží beze změny. Bez změny týž objekt.
 */
function stockWithCattleKinds(stock: NeighbourStock, seed: number): NeighbourStock {
  const neighbour = neighbourOf(seed, stock.direction);
  const fit = (goods: TradeGoods, wanted: readonly TradeGood[], full: TradeGoods): TradeGoods => {
    const renamed = renamedCattle(goods);
    const out: TradeGoods = { ...renamed };
    let changed = renamed !== goods;
    for (const good of CATTLE_GOODS) {
      const has = out[good] !== undefined;
      if (wanted.includes(good) && !has) {
        out[good] = full[good] ?? 0;
        changed = true;
      } else if (!wanted.includes(good) && has) {
        delete out[good];
        changed = true;
      }
    }
    return changed ? out : goods;
  };
  const supply = fit(stock.supply, neighbour.offers, neighbour.supply);
  const demand = fit(stock.demand, neighbour.demands, neighbour.demand);
  return supply === stock.supply && demand === stock.demand ? stock : { ...stock, supply, demand };
}

/**
 * Dobytek ve třech druzích ve vsi uložené dřív (trade.md – Dobytek ve třech druzích): dobytek
 * `cattle` (krávy) v uloženém zbytku roku sousedů, ve výpravách na cestě a v kronice výprav se
 * přejmenuje na krávy; zbytek roku souseda dostane druhy dobytka podle jeho dnešní povahy (nové
 * druhy plné roční množství – `stockWithCattleKinds`). Bez čeho převádět, vrátí tentýž objekt;
 * idempotentní (jako `withoutForeignGoods`, který běží po něm).
 */
export function withCattleKinds(state: VillageState): VillageState {
  const trade = state.trade;
  const neighbours = trade?.neighbours.map((n) => stockWithCattleKinds(n, state.seed));
  const neighboursChanged = neighbours?.some((n, i) => n !== trade!.neighbours[i]) ?? false;
  const expeditions = trade?.expeditions.map((e) => {
    const give = renamedCattle(e.give);
    const get = renamedCattle(e.get);
    return give === e.give && get === e.get ? e : { ...e, give, get };
  });
  const expeditionsChanged = expeditions?.some((e, i) => e !== trade!.expeditions[i]) ?? false;
  // kronika výprav – projde se jen, když v ní dobytek `cattle` je (kronika bývá dlouhá)
  const legacyEvent = (event: VillageState['chronicle'][number]): boolean =>
    (event.kind === 'trade-departed' && 'cattle' in event.give) ||
    (event.kind === 'trade-returned' && 'cattle' in event.get);
  const chronicleChanged = state.chronicle.some(legacyEvent);
  const chronicle = chronicleChanged
    ? state.chronicle.map((event) => {
        if (event.kind === 'trade-departed') return { ...event, give: renamedCattle(event.give) };
        if (event.kind === 'trade-returned') return { ...event, get: renamedCattle(event.get) };
        return event;
      })
    : state.chronicle;
  if (!neighboursChanged && !expeditionsChanged && !chronicleChanged) return state;
  return {
    ...state,
    ...(trade && (neighboursChanged || expeditionsChanged)
      ? { trade: { ...trade, neighbours: neighbours!, expeditions: expeditions! } }
      : {}),
    ...(chronicleChanged ? { chronicle } : {}),
  };
}
