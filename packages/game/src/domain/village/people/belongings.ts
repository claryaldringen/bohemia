import { cloneData } from '../core/clone';
import { villageCarts } from '../crafts/carts';
import { addLogs, woodLogs } from '../forest/wood';
import { addStone, stoneOnHand } from '../fortification/state/stone';
import { horseKind, villageHorses } from '../livestock/horses';
import { isTrained, oxenToEdit, villageOxen, villagePens } from '../livestock/oxen';
import { penSpecies } from '../livestock/pens';
import type { Cart, HayState, Horse, Ox, VillageState, WaresState } from '../types';

// Co si odnese celá ves (migration.md – Co si vezmou; Martin 25. 11. 2026: „Pokud se lidéí někam
// stěhují, berou si úplně vše.“): zásoby a vybavení, voli, koně, vozy, klády a kámen (Martin
// 26. 11. 2026: „ok“) – jídlo a osivo počítá departure.ts. Zásoby jsou jeden seznam
// `CARRIED_STOCKS`: nové zboží vsi (mince, zbroj) stačí přidat do něj, osadníci ho pak nesou přes
// celou cestu až do nové vsi. Klády a kámen jdou bez hromad (`takeHeaps`) – místa hromad patří staré
// vsi; v nové vsi se složí jako klády a kámen, které přišly odjinud (`addHeaps`). Co nejde odnést,
// zůstane (návrh Clauda): stavby i s materiálem, který už mají, pole, surovina u dílen a v milířích,
// med v brtích.

/**
 * Zásoby a vybavení vsi, které si celá ves odnese – části stavu mimo jídlo a osivo (`Settlers.food`,
 * `seedKg`), zvířata a vozy: nástroje domácností, rádla, zboží řemesel, kůže, kožešiny, med a vosk,
 * mince a zbroj, seno a sláma, snopy (nesou se nevymlácené, i s prací výmlatu). Jediný seznam – nové zboží sem.
 */
export const CARRIED_STOCKS = [
  'toolEquipmentKg',
  'ards',
  'crafts',
  'wares',
  'coins',
  'gold',
  'jewelleryG',
  'arms',
  'hay',
  'sheaves',
] as const satisfies readonly (keyof VillageState)[];

type CarriedStock = (typeof CARRIED_STOCKS)[number];

/** Zásoby a vybavení osadníků celé vsi – tytéž části stavu jako ve vsi; chybí = nic. */
export type CarriedStocks = { [K in CarriedStock]?: NonNullable<VillageState[K]> };

/** Co z části stavu odejde a co z ní zůstane na místě (chybí = nic, část ze stavu zmizí). */
interface PartSplit<T> {
  carried: T;
  stays?: T;
}

/** Části, ze kterých na místě něco zůstane – ostatní odejdou celé. */
const SPLITS: {
  [K in CarriedStock]?: (
    part: NonNullable<VillageState[K]>,
  ) => PartSplit<NonNullable<VillageState[K]>>;
} = {
  wares: splitWares,
  hay: splitHay,
  // prázdné snopy zůstanou – bez nich by je ves dostala převodem s odkladem (`withThreshingGrace`)
  sheaves: (carried) => ({ carried, stays: { grainKg: 0, legumesKg: 0 } }),
};

/** Med a vosk v brtích jsou v krajině, dokud je nikdo nevybere; várky a potřeba jdou s lidmi. */
function splitWares({ beeTrees, ...carried }: WaresState): PartSplit<WaresState> {
  if (!beeTrees) return { carried };
  return {
    carried,
    stays: { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0, beeTrees },
  };
}

/** Odejde seno a sláma ve stohu; seč, zima a výnosy roku patří loukám a polím staré vsi. */
function splitHay(hay: HayState): PartSplit<HayState> {
  const { straw } = hay;
  return {
    carried: { kg: hay.kg, mowing: null, ...(straw ? { straw: { kg: straw.kg, yearKg: 0 } } : {}) },
    stays: { ...hay, kg: 0, ...(straw ? { straw: { ...straw, kg: 0 } } : {}) },
  };
}

/** Není co odnést – nula, nebo část jen z nul. */
function isNothing(value: unknown): boolean {
  if (typeof value === 'number') return value <= 0;
  if (typeof value !== 'object' || value === null) return true;
  return Object.values(value).every(isNothing);
}

function takePart<K extends CarriedStock>(
  state: VillageState,
  carried: CarriedStocks,
  key: K,
): void {
  const part = state[key];
  if (part === undefined) return;
  const split = SPLITS[key]?.(part) ?? { carried: part };
  if (isNothing(split.carried)) return;
  carried[key] = split.carried;
  if (split.stays === undefined) delete state[key];
  else state[key] = split.stays;
}

/**
 * Celá ves si odnese zásoby a vybavení (`CARRIED_STOCKS`; mutuje jen horní úroveň stavu): vrátí je
 * a ve stavu nechá, co nejde odnést (`SPLITS`). Bez zásob prázdné.
 */
export function takeCarriedStocks(state: VillageState): CarriedStocks {
  const carried: CarriedStocks = {};
  for (const key of CARRIED_STOCKS) takePart(state, carried, key);
  return carried;
}

/** Zásoby a vybavení vsi na cestě (kopie – stav se nemění). */
export function carriedStocksOf(state: VillageState): CarriedStocks {
  return cloneData(takeCarriedStocks({ ...state }));
}

/** Přinesené zásoby a vybavení do stavu nové vsi (mutuje stav; zásoby zkopíruje). */
export function addCarriedStocks(state: VillageState, stocks: CarriedStocks): void {
  Object.assign(state, cloneData(stocks));
}

/** Klády a kámen celé vsi bez hromad (Martin 26. 11. 2026); chybí = nic. */
export interface CarriedHeaps {
  /** Klády (`woodLogs` – hnijí, proto i neceločíselné). */
  logs?: number;
  /** Kámen v m³ (`stoneM3`). */
  stoneM3?: number;
}

/** Volné klády a kámen vsi – celá zásoba bez ohledu na hromady (kopie, stav se nemění). */
export function heapsOf(state: Pick<VillageState, 'woodLogs' | 'stoneM3'>): CarriedHeaps {
  const logs = woodLogs(state);
  const stoneM3 = stoneOnHand(state);
  return { ...(logs > 0 ? { logs } : {}), ...(stoneM3 > 0 ? { stoneM3 } : {}) };
}

/**
 * Celá ves vezme volné klády a kámen (mutuje stav): hromady ve staré vsi zmizí. Stavby si materiál,
 * který už mají (dřevo a kámen rozestavěných staveb), nechají – odchází jen volná zásoba.
 */
export function takeHeaps(state: VillageState): CarriedHeaps {
  const heaps = heapsOf(state);
  if (state.woodLogs !== undefined) state.woodLogs = 0;
  delete state.logStacks;
  delete state.stoneM3;
  delete state.stoneStacks;
  return heaps;
}

/**
 * Klády a kámen na cestě nesou lidé – ve vsi na cestě bez hromad (mutuje stav). Ves na cestě se
 * nesimuluje, takže klády na cestě nehnijí – jako ostatní zásoby osadníků.
 */
export function carryHeaps(state: VillageState, heaps: CarriedHeaps): void {
  if (heaps.logs) state.woodLogs = heaps.logs;
  if (heaps.stoneM3) state.stoneM3 = heaps.stoneM3;
}

/**
 * Přinesené klády a kámen do nové vsi (mutuje stav): hromada klád a hromada kamene tam, kam se
 * skládá, co přišlo odjinud (`addLogs`, `addStone` bez místa – u cesty nejblíž dvorci, bez něj
 * u prvního staveniště obydlí; volné místo pro klády dohledá scéna).
 */
export function addHeaps(state: VillageState, heaps: CarriedHeaps): void {
  addLogs(state, heaps.logs ?? 0, null);
  addStone(state, heaps.stoneM3 ?? 0, null);
}

/** Kolik volů ves má – v ohradách i bez ohrady, i telata ve výcviku. */
export function ownedOxen(state: Pick<VillageState, 'pens' | 'looseOxen'>): number {
  return villageOxen(state) + (state.looseOxen?.length ?? 0);
}

/** Kolik koní ves má – v ohradách koní i bez ohrady, i hříbata. */
export function ownedHorses(state: Pick<VillageState, 'pens' | 'looseHorses'>): number {
  return villageHorses(state).length + (state.looseHorses?.length ?? 0);
}

/**
 * Všichni voli vsi odejdou (mutuje stav) – z ohrad volů i bez ohrady, i telata ve výcviku; ohrady
 * zůstanou prázdné. Pořadí, ve kterém na novém místě půjdou do ohrady (`looseOxenDay`): vycvičení
 * s nejdelší zbývající službou, pak telata nejblíž konci výcviku.
 */
export function takeAllOxen(state: VillageState, day: number): Ox[] {
  const oxen: Ox[] = [];
  for (const pen of villagePens(state)) {
    if (penSpecies(pen) !== 'team') continue;
    oxen.push(...oxenToEdit(pen));
    pen.oxen = [];
  }
  oxen.push(...(state.looseOxen ?? []));
  delete state.looseOxen;
  const trained = (ox: Ox): boolean => isTrained(ox, day);
  return oxen.sort((a, b) => {
    if (trained(a) !== trained(b)) return trained(a) ? -1 : 1;
    return trained(a) ? b.trainedDay - a.trainedDay : a.trainedDay - b.trainedDay;
  });
}

/**
 * Všichni koně vsi odejdou (mutuje stav) – z ohrad koní i bez ohrady, i hříbata; ohrady zůstanou
 * prázdné (`horses: []` – ohrada už koně měla, zdarma další nedostane, `withHorsePenStock`).
 * Pořadí, ve kterém na novém místě půjdou do ohrady (`looseHorsesDay`): kůň vůdce, ostatní dospělí
 * a hříbata do roku, která místo nezabírají.
 */
export function takeAllHorses(state: VillageState, day: number, leaderHorseId?: number): Horse[] {
  const horses: Horse[] = [];
  for (const pen of villagePens(state)) {
    if (!pen.horses || pen.horses.length === 0) continue;
    horses.push(...pen.horses);
    pen.horses = [];
  }
  horses.push(...(state.looseHorses ?? []));
  delete state.looseHorses;
  const rank = (h: Horse): number =>
    h.id === leaderHorseId ? 0 : horseKind(h, day) === 'foal' ? 2 : 1;
  return horses.sort((a, b) => rank(a) - rank(b));
}

/** Všechny vozy vsi odejdou (mutuje stav) – i bez volů a i ty, které jsou s výpravou na cestě. */
export function takeAllCarts(state: VillageState): Cart[] {
  const carts = [...villageCarts(state)];
  delete state.carts;
  return carts;
}
