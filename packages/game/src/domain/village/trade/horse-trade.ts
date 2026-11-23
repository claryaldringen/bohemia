// Koně ve třech druzích (docs/design/horses.md – Nákup a prodej; Martin 23. 10. 2026: koně jako
// ostatní zvířata; ceny a podrobnosti návrh Clauda): hříbata, chovné klisny a jezdečtí koně – kusy
// v ohradě koní. Ves dá hříbata, klisny nad chovné a jezdecké koně bez jezdce – nikdy koně, na
// kterém někdo jezdí (zásilky vazalů, platba koní nové ohrady). Jezdecký kůň má cenu za kus podle
// výcviku (`horseValueKg`). Koně, které přivede výprava na cestě (markets.md – Pravidla 10),
// přijdou do ohrad koní (`addHorses`). Vzor `cattle-trade.ts`. Čisté funkce bez I/O.
import { butcher } from '../livestock/livestock';
import { horsesWanted } from '../livestock/horse-breeding';
import {
  horsePens,
  horsesInPlaces,
  isFoalByAge,
  penHorses,
  villageHorses,
} from '../livestock/horses';
import { builtPenSquares } from '../livestock/pens';
import { HORSES, HORSE_TRADE, PEN_PLACES_PER_SQUARE, TRADE_GOOD_VALUES } from '../rules';
import type { Horse, HorseGood, TradedHorse, VillageState } from '../types';

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
 * jezdečtí koně napřed nejméně vycvičení – a když na žádném samci nikdo nejezdí, nejlépe
 * vycvičený zůstane jako hřebec (Martin 31. 10. 2026: „Hřebce držet vždy“; i bez klisny).
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
  return !ridden ? sorted.slice(0, -1) : sorted;
}

/** Kolik koní druhu `good` ves v den `day` prodá (`sellableHorses`). */
export function horsesForSale(state: VillageState, good: HorseGood, day: number): number {
  return sellableHorses(state, good, day).length;
}

/**
 * Kolik koní druhu `good` ves v den `day` má – v ohradách i pod jezdcem (druh podle věku a pohlaví
 * jako u `sellableHorses`). Prodat jde jen `horsesForSale`; tohle je počet pro porovnání s tím,
 * kolik koní ves chce (`horsesWanted`) – trh (markets.md – Rozhodnutí plánu 2, bod 5).
 */
export function horsesOf(state: VillageState, good: HorseGood, day: number): number {
  return villageHorses(state).filter((h) => tradeKind(h, day) === good).length;
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
