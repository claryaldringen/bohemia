import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { DIET, meatEnergy, villageFoodNeed, villageMeatKg } from '../core/diet';
import { hungerSplit } from '../people/hunger-groups';
import { EMERGENCY_SLAUGHTER } from '../rules';
import {
  HERD_SPECIES,
  LIVESTOCK,
  addSlaughterWork,
  breedingFloor,
  cullingMeatKg,
  herdRecord,
  isSlaughterSeason,
  noteSlaughtered,
  slaughterSeasonDaysLeft,
  winterKeepTargets,
  type WinterInput,
} from './livestock';
import type { HerdSpecies, VillageState } from '../types';

// Porážka celý rok (diet.md – Strava po vrstvách a porážka celý rok; Martin 18. 11. 2026: „Mělo by
// se průběžně porážet celý rok (pokud je dost zvířat) v zimě jenom víc (kvůli stravě a kvůli tomu,
// že se maso pomaleji kazí). Proč by se mělo porážet celý rok – kníže a nobilita chce mít maso na
// stole nejlépe každý den.“). V létě (1. 4.–31. 10.) ves porazí jeden celý kus, jen když rodu
// vojvody (vrstva 1 – `hungerSplit`, skupina 0) na dnešek nestačí maso v zásobě; co z kusu rod
// nesní, sní týž den ostatní a zbytek se vyudí (`eatDiet`). Na maso jdou jen kusy, které by si ves
// 1. 11. stejně nenechala – staré kusy a kusy nad nosnost zimy (`winterKeepTargets`) –, bez letošních
// mláďat (kromě selat od 1. 9.) a nikdy pod chovné minimum (`breedingFloor`). Podrobnosti návrh
// Clauda; letní porážka nezapisuje kroniku (byla by denně). Zima – `winterSlaughterDay`.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Druhy od nejmenšího kusu (maso kusu `LIVESTOCK.meatKg`) – kozy, ovce, prasata, krávy. */
const SMALLEST_FIRST: readonly HerdSpecies[] = [...HERD_SPECIES].sort(
  (a, b) => LIVESTOCK.meatKg[a] - LIVESTOCK.meatKg[b],
);

/**
 * Co ves o zimě ví (`WinterInput`) – hotové, nebo až na požádání (sestavit ho stojí práci a letní
 * porážka ho potřebuje jen ve dny, kdy rodu chybí maso).
 */
export type WinterInputSource = WinterInput | (() => WinterInput);

function winterInputOf(source: WinterInputSource): WinterInput {
  return typeof source === 'function' ? source() : source;
}

/** Letní porážka – od jarních mláďat (1. 4.) do podzimní porážky (31. 10.), mimo zimní porážku. */
export function isSummerSlaughterSeason(day: number): boolean {
  return !isSlaughterSeason(day);
}

/** Smějí dnes na letní porážku letošní selata? Od 1. 9. (EMERGENCY_SLAUGHTER.pigletsFromMonth). */
function pigletsForMeat(day: number): boolean {
  return dateOfDayIndex(day).month >= EMERGENCY_SLAUGHTER.pigletsFromMonth;
}

/**
 * Kusy, které smějí v létě na maso (po druzích, i zlomky – diet.md, Porážka celý rok): co by si ves
 * 1. 11. přes zimu nenechala – staré kusy a kusy nad nosnost zimy, místa v ohradách, pasáky a místa
 * pro mláďata (`winterKeepTargets` dnešními daty, stejný výpočet jako 1. 11.) –, ale jen dospělé
 * kusy: letošní mláďata ne, kromě selat od 1. 9. (jako nouzová porážka); nikdy pod chovné minimum
 * (`breedingFloor` – chovný pár, krávy na mléko a voly, ovce na vlnu). Stav nemění.
 */
export function summerSlaughterCandidates(
  state: VillageState,
  day: number,
  input: WinterInput,
): Record<HerdSpecies, number> {
  const livestock = state.livestock;
  if (!livestock) return herdRecord(() => 0);
  const keep = winterKeepTargets(state, day, input);
  const floor = breedingFloor(input);
  const piglets = pigletsForMeat(day);
  return herdRecord((s) => {
    const herd = livestock.herds[s];
    const young = s === 'pig' && piglets ? 0 : livestock.young[s];
    return Math.max(0, Math.min(herd - keep[s], herd - young - floor[s]));
  });
}

/**
 * Kolik masa (kg) rodu vojvody dnes chybí: potřeba vrstvy 1 (`hungerSplit` – skupina 0) bez masa
 * v zásobě – uzeného i dnešního čerstvého (energie v kg obilí – `DIET.meatEnergy`). Ves bez rodu
 * ve vsi (vojvoda na výjezdu, ves správce) 0.
 */
export function lordMeatShortKg(state: VillageState, day: number): number {
  const need = hungerSplit(state, day).needs[0] ?? 0;
  if (need <= EPSILON) return 0;
  const stock = meatEnergy(villageMeatKg(state) + (state.freshMeatKg ?? 0));
  return Math.max(0, need - stock) / DIET.meatEnergy;
}

/** Letní porážka dne – druh a maso jednoho celého kusu. */
export interface SummerSlaughter {
  species: HerdSpecies;
  kg: number;
}

/**
 * Co ves dnes v létě porazí (bez změny stavu – diet.md, Porážka celý rok, V létě): nic mimo léto,
 * bez rodu ve vsi a když rodu na dnešek stačí maso v zásobě (`lordMeatShortKg`). Jinak jeden celý kus
 * nejmenšího druhu, jehož maso chybějící maso pokryje a který má aspoň jeden celý kus na maso
 * (`summerSlaughterCandidates`); když nepokryje žádný, největšího z nich. Bez kusů na maso nic.
 */
export function summerSlaughterPlan(
  state: VillageState,
  day: number,
  input: WinterInputSource,
): SummerSlaughter | null {
  if (!isSummerSlaughterSeason(day) || !state.livestock) return null;
  const shortKg = lordMeatShortKg(state, day);
  if (shortKg <= EPSILON) return null;
  const candidates = summerSlaughterCandidates(state, day, winterInputOf(input));
  const able = SMALLEST_FIRST.filter((s) => candidates[s] >= 1 - EPSILON);
  const species = able.find((s) => LIVESTOCK.meatKg[s] >= shortKg - EPSILON) ?? able.at(-1);
  return species === undefined ? null : { species, kg: LIVESTOCK.meatKg[species] };
}

/**
 * Den letní porážky (mutuje stav – diet.md, Porážka celý rok): kus z `summerSlaughterPlan` ubude ze
 * stáda (od 1. 9. u prasat napřed letošní sele – „Selata první“, Martin 31. 10. 2026), maso jde do
 * dnešního čerstvého masa (`freshMeatKg` – jí se napřed, co se nesní, vyudí se), kůže a hlášení pro
 * scénu (`noteSlaughtered`) a práce porážky a uzení jako v zimě (1 člověkoden na
 * LIVESTOCK.slaughterKgPerManDay kg). Kronika ne. `input` – co ves o zimě ví (`WinterInput`, stačí
 * až na požádání).
 */
export function summerSlaughterDay(
  state: VillageState,
  day: number,
  input: WinterInputSource,
): void {
  const plan = summerSlaughterPlan(state, day, input);
  const livestock = state.livestock;
  if (!plan || !livestock) return;
  livestock.herds[plan.species] = Math.max(0, livestock.herds[plan.species] - 1);
  if (plan.species === 'pig' && pigletsForMeat(day)) {
    livestock.young.pig = Math.max(0, livestock.young.pig - 1);
  }
  state.freshMeatKg = (state.freshMeatKg ?? 0) + plan.kg;
  addSlaughterWork(state, plan.kg);
  noteSlaughtered(state, day, plan.species, 1);
}

/**
 * Letní dny výhledu: od zítřka do konce výhledu (`daysToHarvest` – dnešek je první den výhledu),
 * nejvýš do konce letošní letní porážky (31. 10.).
 */
function summerDaysAhead(day: number, daysToHarvest: number): number {
  const { year } = dateOfDayIndex(day);
  const lastSummerDay = dayIndexOf({ year, month: 11, day: 1 }) - 1;
  return Math.max(0, Math.min(daysToHarvest - 1, lastSummerDay - day));
}

/**
 * Čerstvé maso z porážky, které ves sní od zítřka do sklizně (energie v kg obilí – diet.md, Strava
 * po vrstvách a porážka celý rok, Výhled do sklizně) – výhled jídla do sklizně s ním počítá:
 * - v zimě maso kusů, které čekají na zimní porážku (`cullingMeatKg`), nejvýš celá potřeba vsi do
 *   konce zimy;
 * - v létě maso z letní porážky pro rod vojvody – potřeba vrstvy 1 za letní dny výhledu
 *   (`daysToHarvest`, nejvýš do 31. 10.), nejvýš maso celých kusů, které na maso smějí
 *   (`summerSlaughterCandidates`). Bez `input` (co ves o zimě ví) a bez rodu ve vsi 0.
 */
export function freshMeatAheadEnergy(
  state: VillageState,
  day: number,
  daysToHarvest = 0,
  input?: WinterInputSource,
): number {
  if (isSlaughterSeason(day)) {
    const days = slaughterSeasonDaysLeft(day) - 1;
    if (days <= 0) return 0;
    const kg = cullingMeatKg(state);
    if (kg <= EPSILON) return 0;
    return Math.min(meatEnergy(kg), villageFoodNeed(state, day) * days);
  }
  if (!input || !state.livestock) return 0;
  const days = summerDaysAhead(day, daysToHarvest);
  if (days <= 0) return 0;
  const need = hungerSplit(state, day).needs[0] ?? 0;
  if (need <= EPSILON) return 0;
  const candidates = summerSlaughterCandidates(state, day, winterInputOf(input));
  const kg = HERD_SPECIES.reduce(
    (sum, s) => sum + Math.floor(candidates[s] + EPSILON) * LIVESTOCK.meatKg[s],
    0,
  );
  return Math.min(need * days, meatEnergy(kg));
}
