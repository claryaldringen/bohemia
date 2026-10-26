// Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami; Odpovědi Martina
// 26. 10. 2026): z práce, která zbude po dílech nad potřebu a po seči navíc, chytají vesničané
// duben–listopad ryby a prosinec–březen zajíce do ok – když ves chce víc bílkovin, nebo hladoví.
// Maso se jí čerstvé (bez práce porážky). Bez náhody: ubývá biomasa ryb a zajíci s podílem kusu.

import { dateOfDayIndex } from '../calendar';
import { HERD_SPECIES, meatNeedPerYear, villageHerds, yearlyMeatPerHead } from './livestock';
import { SMALL_GAME, WILDLIFE_CAPS } from './rules-wildlife';
import type { LaborActivity, LaborTarget, SmallGameState, VillageState } from './types';

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

/** Loviště dne: tůně do 1 km (mělčina, když tůně nejsou, ale voda ano). */
function pools(state: VillageState): number {
  const w = state.wildlife;
  if (!w) return 0;
  return w.land.pools > 0 ? w.land.pools : w.land.waterHa > 0 ? 1 : 0;
}

/**
 * Kolik člověkodní dnes dá chytání nejvýš (0 = dnes nemá smysl): nejvýš 3 rybáři na tůň, oka
 * stejně; pod čtvrtinou stropu se nechytá.
 */
export function smallGameCapacity(state: VillageState, day: number): number {
  const kind = kindOf(day);
  const { stock, cap } = stockOf(state, kind);
  if (cap <= EPSILON || stock <= cap * SMALL_GAME.minStockShare + EPSILON) return 0;
  return pools(state) * SMALL_GAME.fish.maxPerPool;
}

/**
 * Chce ves víc bílkovin? Roční potřeba masa (po obilí, mléku, vejcích a luštěninách) je větší než
 * maso, které dají stáda, a loňský úlovek zvěře (návrh Clauda).
 */
export function wantsProtein(state: VillageState, day: number): boolean {
  if (state.hungry) return true;
  const herds = villageHerds(state);
  const herdMeat = HERD_SPECIES.reduce((sum, s) => sum + herds[s] * yearlyMeatPerHead(s), 0);
  const wild = state.wildlife?.smallGame?.lastWildMeatKg ?? 0;
  return meatNeedPerYear(state, day) > herdMeat + wild + EPSILON;
}

function ensureState(w: NonNullable<VillageState['wildlife']>): SmallGameState {
  return (w.smallGame ??= {
    today: null,
    year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
  });
}

/**
 * Chytání dne z volné práce `labor` (člověkodny; mutuje stav): kdo chytá, jde po tůních (nejvýš 3
 * na tůň), úlovek podle stavu zvěře (× zásoba ÷ strop), biomasa a zajíci ubydou, maso jde rovnou
 * do zásoby bez práce porážky. `urgent` = ves hladoví (chytá se, i když by jinak ne). Vrací, kolik
 * práce spotřebovalo a jak se rozdělila po tůních.
 */
export function smallGameDay(
  state: VillageState,
  day: number,
  labor: number,
  urgent: boolean,
): SmallGameResult {
  const w = state.wildlife;
  if (!w || labor <= EPSILON) return NONE;
  const capacity = smallGameCapacity(state, day);
  if (capacity <= EPSILON) return NONE;
  if (!urgent && !wantsProtein(state, day)) return NONE;
  const kind = kindOf(day);
  const { stock, cap } = stockOf(state, kind);
  const manDays = Math.min(labor, capacity);
  const hours = manDays * SMALL_GAME.hoursPerManDay;
  const share = Math.min(1, stock / cap);
  const sg = ensureState(w);
  let meat: number;
  let kg: number;
  if (kind === 'fish') {
    // loví se jen do čtvrtiny stropu – vodu ves nevyloví
    kg = Math.min(
      hours * SMALL_GAME.fish.kgPerHour * share,
      stock - cap * SMALL_GAME.minStockShare,
    );
    w.fishKg -= kg;
    meat = kg * SMALL_GAME.fish.edible;
    sg.year.fishKg += kg;
  } else {
    kg = Math.min(
      hours * SMALL_GAME.snares.perHour * share,
      stock - cap * SMALL_GAME.minStockShare,
    );
    w.hares -= kg;
    meat = kg * SMALL_GAME.snares.meatKg;
    sg.year.hares += kg;
  }
  state.meatKg = (state.meatKg ?? 0) + meat;
  sg.year.meatKg += meat;
  sg.year.days += 1;
  // rybáři po tůních (nejvýš 3 na tůň, nejbližší ke vsi napřed); oka po tůních stejně
  const count = Math.min(capacity, Math.max(1, Math.ceil(manDays - EPSILON)));
  const perPool: number[] = [];
  for (let left = count, i = 0; left > 0; i++, left -= SMALL_GAME.fish.maxPerPool) {
    perPool[i] = Math.min(SMALL_GAME.fish.maxPerPool, left);
  }
  sg.today = { day, kind, pools: perPool, kg };
  const shares: SmallGameShare[] = perPool.map((n, index) => ({
    activity: kind,
    target: kind === 'fish' ? { kind: 'pool', index } : { kind: 'village' },
    manDays: (manDays * n) / count,
  }));
  return { manDays, shares };
}
