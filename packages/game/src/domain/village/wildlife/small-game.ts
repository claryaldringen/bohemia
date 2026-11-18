// Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami; Odpovědi Martina
// 26. 10. 2026): z práce, která zbude po polní práci, stavbách a seči navíc, chytají vesničané
// duben–listopad ryby a prosinec–březen zajíce do ok – vždy, kdy je volná práce (diet.md – Ryby a drobná zvěř).
// Maso se jí čerstvé (bez práce porážky). Bez náhody: ubývá biomasa ryb a zajíci, nejvýš do roční
// kvóty podle přírůstku.

import { dateOfDayIndex } from '../../calendar';
import { foxCount } from './fox-eggs';
import { addWildFurs } from '../wares/wares';
import { SMALL_GAME, WILDLIFE_CAPS, WILDLIFE_YEAR } from '../rules/rules-wildlife';
import type { LaborActivity, LaborTarget, SmallGameState, VillageState } from '../types';

const EPSILON = 1e-9;

/** Podíl práce na rybolov nebo oka (rozdělení práce – scéna ukáže rybáře u tůně s prutem). */
export interface SmallGameShare {
  activity: Extract<LaborActivity, 'fish' | 'snare'>;
  target: LaborTarget;
  manDays: number;
}

/** Dnešní chytání: člověkodny a podíly práce po tůních. */
export interface SmallGameResult {
  manDays: number;
  shares: SmallGameShare[];
}

const NONE: SmallGameResult = { manDays: 0, shares: [] };

/** Co se dnes chytá: ryby (duben–listopad), jinak oka (prosinec–březen). */
function kindOf(day: number): 'fish' | 'snare' {
  const month = dateOfDayIndex(day).month;
  return month >= SMALL_GAME.fish.fromMonth && month <= SMALL_GAME.fish.toMonth ? 'fish' : 'snare';
}

/** Zásoba dnešní zvěře (ryby: biomasa, oka: zajíci) a její strop. */
function stockOf(state: VillageState, kind: 'fish' | 'snare'): { stock: number; cap: number } {
  const w = state.wildlife;
  if (!w) return { stock: 0, cap: 0 };
  return kind === 'fish'
    ? { stock: w.fishKg, cap: w.land.waterHa * WILDLIFE_CAPS.fishKgPerHa }
    : { stock: w.hares, cap: (w.land.openHa * WILDLIFE_CAPS.haresPer100Ha) / 100 };
}

/** Lišky dnes a jejich strop (chybí stav = strop). */
function foxStock(w: NonNullable<VillageState['wildlife']>): { stock: number; cap: number } {
  const cap = foxCount(w.land);
  return { stock: w.foxes ?? cap, cap };
}

/**
 * Roční kvóta (kg ryb, kusy zajíců): jen tolik, kolik za rok přiroste (návrh Clauda). Ryby: zásoba
 * nad polovinou stropu, nejvýš čtvrtina stropu (vrchol logistického přírůstku). Zajíci: zásoba nad
 * polovinou stropu a nad tím, co za rok zdvojnásobí. Lišky: zásoba nad polovinou stropu.
 */
export function yearlyQuota(
  w: NonNullable<VillageState['wildlife']>,
  fishKg: number,
  hares: number,
  foxes: number,
): { fishKg: number; hares: number; foxes: number } {
  const fishCap = w.land.waterHa * WILDLIFE_CAPS.fishKgPerHa;
  const hareCap = (w.land.openHa * WILDLIFE_CAPS.haresPer100Ha) / 100;
  const fish = Math.min(
    fishCap * SMALL_GAME.fishMaxYieldShare,
    fishKg - fishCap * SMALL_GAME.minStockShare,
  );
  const hareKeep = Math.max(hareCap * SMALL_GAME.minStockShare, hares / WILDLIFE_YEAR.haresGrowth);
  const foxKeep = foxCount(w.land) * SMALL_GAME.minStockShare;
  return {
    fishKg: Math.max(0, fish),
    hares: Math.max(0, hares - hareKeep),
    foxes: Math.max(0, foxes - foxKeep),
  };
}

/** Roční kvóta stavu vsi (stará uložená kvóta bez lišek se dopočte). */
function quotaOf(w: NonNullable<VillageState['wildlife']>): {
  fishKg: number;
  hares: number;
  foxes: number;
} {
  const sg = w.smallGame;
  const caught = sg?.year ?? { fishKg: 0, hares: 0 };
  const foxesCaught = sg?.year.foxes ?? 0;
  const computed = yearlyQuota(
    w,
    w.fishKg + caught.fishKg,
    w.hares + caught.hares,
    foxStock(w).stock + foxesCaught,
  );
  const q = sg?.quota;
  return q ? { fishKg: q.fishKg, hares: q.hares, foxes: q.foxes ?? computed.foxes } : computed;
}

/** Kolik se letos ještě smí chytit (kg ryb, kusy zajíců, kusy lišek): kvóta roku bez chycených. */
function quotaLeft(state: VillageState, kind: 'fish' | 'hares' | 'foxes'): number {
  const w = state.wildlife;
  if (!w) return 0;
  const caught = w.smallGame?.year ?? { fishKg: 0, hares: 0 };
  const quota = quotaOf(w);
  if (kind === 'fish') return quota.fishKg - caught.fishKg;
  if (kind === 'hares') return quota.hares - caught.hares;
  return quota.foxes - (w.smallGame?.year.foxes ?? 0);
}

/** Dá se dnes chytit aspoň něco z daného druhu (nad polovinou stropu a v kvótě)? */
function catchable(state: VillageState, kind: 'fish' | 'hares' | 'foxes'): boolean {
  const w = state.wildlife;
  if (!w) return false;
  const { stock, cap } =
    kind === 'fish'
      ? stockOf(state, 'fish')
      : kind === 'hares'
        ? stockOf(state, 'snare')
        : foxStock(w);
  if (cap <= EPSILON || stock <= cap * SMALL_GAME.minStockShare + EPSILON) return false;
  return quotaLeft(state, kind) > EPSILON;
}

/** Loviště dne: tůně do 1 km (mělčina, když tůně nejsou, ale voda ano). */
function pools(state: VillageState): number {
  const w = state.wildlife;
  if (!w) return 0;
  return w.land.pools > 0 ? w.land.pools : w.land.waterHa > 0 ? 1 : 0;
}

/**
 * Kolik člověkodní dnes dá chytání nejvýš (0 = dnes nemá smysl): nejvýš 3 rybáři na tůň, oka
 * stejně; pod polovinou stropu a po vyčerpání roční kvóty se nechytá (oka: zajíci ani lišky).
 */
export function smallGameCapacity(state: VillageState, day: number): number {
  const can =
    kindOf(day) === 'fish'
      ? catchable(state, 'fish')
      : catchable(state, 'hares') || catchable(state, 'foxes');
  return can ? pools(state) * SMALL_GAME.maxPerPool : 0;
}

function ensureState(w: NonNullable<VillageState['wildlife']>): SmallGameState {
  return (w.smallGame ??= {
    today: null,
    year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
  });
}

/**
 * Chytání dne z volné práce `labor` (člověkodny; mutuje stav): kdo chytá, jde po tůních (nejvýš 3
 * na tůň), úlovek podle stavu zvěře (× zásoba ÷ strop), biomasa a zajíci ubydou, maso jde jako čerstvé
 * (`freshMeatKg`, jí se dnes napřed) bez práce porážky; chytá se jen do roční kvóty. Ryby i oka se chytají vždy (diet.md – Ryby a drobná zvěř). Vrací, kolik
 * práce spotřebovalo a jak se rozdělila po tůních.
 */
export function smallGameDay(state: VillageState, day: number, labor: number): SmallGameResult {
  const w = state.wildlife;
  if (!w || labor <= EPSILON) return NONE;
  const capacity = smallGameCapacity(state, day);
  if (capacity <= EPSILON) return NONE;
  const kind = kindOf(day);
  // ryby i oka se chytají vždy, kdykoli je čas (diet.md – Ryby a drobná zvěř; kožešiny hides-honey.md)
  const manDays = Math.min(labor, capacity);
  const hours = manDays * SMALL_GAME.hoursPerManDay;
  const sg = ensureState(w);
  sg.quota = { ...quotaOf(w) };
  let meat = 0;
  let kg = 0;
  if (kind === 'fish') {
    const { stock, cap } = stockOf(state, 'fish');
    const share = Math.min(1, stock / cap);
    // loví se jen do roční kvóty a nad polovinu stropu – vodu ves nevyloví
    kg = Math.min(
      hours * SMALL_GAME.fish.kgPerHour * share,
      stock - cap * SMALL_GAME.minStockShare,
      quotaLeft(state, 'fish'),
    );
    w.fishKg -= kg;
    meat = kg * SMALL_GAME.fish.edible;
    sg.year.fishKg += kg;
  } else {
    // oka chytají zajíce i lišky ze stejných hodin, každý druh svým vzorcem a do své kvóty
    let hares = 0;
    if (catchable(state, 'hares')) {
      const { stock, cap } = stockOf(state, 'snare');
      hares = Math.min(
        hours * SMALL_GAME.snares.perHour * Math.min(1, stock / cap),
        stock - cap * SMALL_GAME.minStockShare,
        quotaLeft(state, 'hares'),
      );
      w.hares -= hares;
      sg.year.hares += hares;
    }
    let foxes = 0;
    if (catchable(state, 'foxes')) {
      const { stock, cap } = foxStock(w);
      foxes = Math.min(
        hours * SMALL_GAME.snares.foxPerHour * Math.min(1, stock / cap),
        stock - cap * SMALL_GAME.minStockShare,
        quotaLeft(state, 'foxes'),
      );
      w.foxes = stock - foxes;
      sg.year.foxes = (sg.year.foxes ?? 0) + foxes;
    }
    kg = hares;
    meat = hares * SMALL_GAME.snares.meatKg;
    addWildFurs(state, hares + foxes);
  }
  state.freshMeatKg = (state.freshMeatKg ?? 0) + meat;
  sg.year.meatKg += meat;
  sg.year.days += 1;
  // rybáři po tůních (nejvýš 3 na tůň, nejbližší ke vsi napřed); oka po tůních stejně
  const count = Math.min(capacity, Math.max(1, Math.ceil(manDays - EPSILON)));
  const perPool: number[] = [];
  for (let left = count, i = 0; left > 0; i++, left -= SMALL_GAME.maxPerPool) {
    perPool[i] = Math.min(SMALL_GAME.maxPerPool, left);
  }
  sg.today = { day, kind, pools: perPool, kg };
  const shares: SmallGameShare[] = perPool.map((n, index) => ({
    activity: kind,
    target: kind === 'fish' ? { kind: 'pool', index } : { kind: 'village' },
    manDays: (manDays * n) / count,
  }));
  return { manDays, shares };
}
