// Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami; Odpovědi Martina
// 26. 10. 2026): z práce, která zbude po dílech nad potřebu a po seči navíc, chytají vesničané
// duben–listopad ryby a prosinec–březen zajíce do ok – když ves chce víc bílkovin, nebo hladoví.
// Maso se jí čerstvé (bez práce porážky). Bez náhody: ubývá biomasa ryb a zajíci, nejvýš do roční
// kvóty podle přírůstku.

import { dateOfDayIndex } from '../calendar';
import { HERD_SPECIES, meatNeedPerYear, villageHerds, yearlyMeatPerHead } from './livestock';
import { SMALL_GAME, WILDLIFE_CAPS, WILDLIFE_YEAR } from './rules-wildlife';
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

/**
 * Roční kvóta (kg ryb, kusy zajíců): jen tolik, kolik za rok přiroste (návrh Clauda). Ryby: zásoba
 * nad polovinou stropu, nejvýš čtvrtina stropu (vrchol logistického přírůstku). Zajíci: zásoba nad
 * polovinou stropu a nad tím, co za rok zdvojnásobí.
 */
export function yearlyQuota(
  w: NonNullable<VillageState['wildlife']>,
  fishKg: number,
  hares: number,
): { fishKg: number; hares: number } {
  const fishCap = w.land.waterHa * WILDLIFE_CAPS.fishKgPerHa;
  const hareCap = (w.land.openHa * WILDLIFE_CAPS.haresPer100Ha) / 100;
  const fish = Math.min(
    fishCap * SMALL_GAME.fishMaxYieldShare,
    fishKg - fishCap * SMALL_GAME.minStockShare,
  );
  const hareKeep = Math.max(hareCap * SMALL_GAME.minStockShare, hares / WILDLIFE_YEAR.haresGrowth);
  return { fishKg: Math.max(0, fish), hares: Math.max(0, hares - hareKeep) };
}

/** Kolik se letos ještě smí chytit (kg ryb nebo kusů zajíců): kvóta roku bez toho, co už je chycené. */
function quotaLeft(state: VillageState, kind: 'fish' | 'snare'): number {
  const w = state.wildlife;
  if (!w) return 0;
  const sg = w.smallGame;
  const caught = sg?.year ?? { fishKg: 0, hares: 0 };
  const quota = sg?.quota ?? yearlyQuota(w, w.fishKg + caught.fishKg, w.hares + caught.hares);
  return kind === 'fish' ? quota.fishKg - caught.fishKg : quota.hares - caught.hares;
}

/** Loviště dne: tůně do 1 km (mělčina, když tůně nejsou, ale voda ano). */
function pools(state: VillageState): number {
  const w = state.wildlife;
  if (!w) return 0;
  return w.land.pools > 0 ? w.land.pools : w.land.waterHa > 0 ? 1 : 0;
}

/**
 * Kolik člověkodní dnes dá chytání nejvýš (0 = dnes nemá smysl): nejvýš 3 rybáři na tůň, oka
 * stejně; pod polovinou stropu a po vyčerpání roční kvóty se nechytá.
 */
export function smallGameCapacity(state: VillageState, day: number): number {
  const kind = kindOf(day);
  const { stock, cap } = stockOf(state, kind);
  if (cap <= EPSILON || stock <= cap * SMALL_GAME.minStockShare + EPSILON) return 0;
  if (quotaLeft(state, kind) <= EPSILON) return 0;
  return pools(state) * SMALL_GAME.maxPerPool;
}

/**
 * Chce ves víc bílkovin? Roční potřeba masa (po obilí, mléku, vejcích a luštěninách) je větší než
 * maso, které dají stáda, a loňský úlovek zvěře (návrh Clauda).
 */
export function wantsProtein(state: VillageState, day: number): boolean {
  if (state.hungry) return true;
  const herds = villageHerds(state);
  const herdMeat = HERD_SPECIES.reduce((sum, s) => sum + herds[s] * yearlyMeatPerHead(s), 0);
  // velký lov: loňský, nebo letošní, když je větší; drobná zvěř (ryby, oka) jen letošní –
  // loňské se neočekávají, chytá se podle poptávky (jinak by ves po dobrém roce přestala chytat)
  const w = state.wildlife;
  const bigGame = Math.max(w?.smallGame?.lastWildMeatKg ?? 0, w?.hunt?.year.meatKg ?? 0);
  const wild = bigGame + (w?.smallGame?.year.meatKg ?? 0);
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
 * na tůň), úlovek podle stavu zvěře (× zásoba ÷ strop), biomasa a zajíci ubydou, maso jde jako čerstvé
 * (`freshMeatKg`, jí se dnes napřed) bez práce porážky; chytá se jen do roční kvóty. `urgent` = ves hladoví (chytá se, i když by jinak ne). Vrací, kolik
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
  const left = quotaLeft(state, kind);
  sg.quota ??= yearlyQuota(w, w.fishKg + sg.year.fishKg, w.hares + sg.year.hares);
  let meat: number;
  let kg: number;
  if (kind === 'fish') {
    // loví se jen do roční kvóty a nad polovinu stropu – vodu ves nevyloví
    kg = Math.min(
      hours * SMALL_GAME.fish.kgPerHour * share,
      stock - cap * SMALL_GAME.minStockShare,
      left,
    );
    w.fishKg -= kg;
    meat = kg * SMALL_GAME.fish.edible;
    sg.year.fishKg += kg;
  } else {
    kg = Math.min(
      hours * SMALL_GAME.snares.perHour * share,
      stock - cap * SMALL_GAME.minStockShare,
      left,
    );
    w.hares -= kg;
    meat = kg * SMALL_GAME.snares.meatKg;
    sg.year.hares += kg;
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
