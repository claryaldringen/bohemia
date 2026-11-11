// Dopady počasí roku na úrodu, seno, pastvu, krmení a osev (disasters.md – Léto, Zima, Ochrana
// dílu, Dopady na existující mechaniky). Čisté funkce – stav nemění.

import { dateOfDayIndex } from '../../calendar';
import { PLANNING_DAY } from '../rules';
import {
  PROTECTION,
  WEATHER,
  WEATHER_EFFECTS,
  type MonthDay,
  type SummerEffect,
} from '../rules/rules-disasters';
import type {
  PartProtection,
  ProtectionKind,
  SummerWeather,
  WinterWeather,
} from '../types/types-disasters';
import type { HayMowing } from '../types';
import type { Crop } from '../types/types-land';
import type { VillageState } from '../types/types-state';
import { isCruelYear, revealedWeather, weatherOf } from './weather';

type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Ochrana dílu pro daný druh počasí (disasters.md – Ochrana dílu). Čistá funkce složek – P3
 * a P5 ji jen násobí do ztráty: `1 − lossShare × ochrana`.
 * - sucho: zeleň + u vody +0,2 − vyvýšené 0,2, oříznuto na 0–1;
 * - holomráz: zeleň − vyvýšené 0,2, oříznuto na 0–1 (voda se nepočítá);
 * - deštivé léto: niva −0,2, svah +0,2, zeleň se nepočítá (rozsah −0,2 až +0,2);
 * - kroupy: zeleň × 0,4 (rozptýlená pole), oříznuto na 0–1.
 * Díl bez údaje (nový od 1. 4., ves bez krajiny) má typickou zeleň 0,25.
 */
export function protectionAgainst(part: PartProtection | undefined, kind: ProtectionKind): number {
  const p = part ?? { green: PROTECTION.noLandscapeGreen };
  switch (kind) {
    case 'dry':
      return clamp01(
        p.green +
          (p.nearWater ? PROTECTION.waterBonus : 0) -
          (p.raised ? PROTECTION.raisedPenalty : 0),
      );
    case 'frost':
      return clamp01(p.green - (p.raised ? PROTECTION.raisedPenalty : 0));
    case 'wet':
      return (p.slope ? PROTECTION.wetShift : 0) - (p.lowland ? PROTECTION.wetShift : 0);
    case 'hail':
      return clamp01(p.green) * PROTECTION.hailGreenShare;
  }
}

/** Ochrana dílu `partId` ve vsi (uložená 1. 4.); bez údaje typická ves. */
export function partProtectionOf(
  state: Pick<VillageState, 'disasters'>,
  partId: number,
  kind: ProtectionKind,
): number {
  return protectionAgainst(state.disasters?.protection?.parts[String(partId)], kind);
}

/** Léto a zima roku, se kterými se počítá (chybějící = normální – ještě není vidět). */
export interface CropWeather {
  summer?: SummerWeather;
  winter?: WinterWeather;
}

const DRY: ReadonlySet<SummerWeather> = new Set(WEATHER_EFFECTS.drySummers);
const WET: ReadonlySet<SummerWeather> = new Set(WEATHER_EFFECTS.wetSummers);

/**
 * Má ves počasí kraje (kopii seedu mapy nebo vynucené počasí)? Bez něj jsou všechny roky normální
 * a nic z tohoto souboru se neuplatní (unit testy, kalibrace, zlaté otisky).
 */
export function hasWeather(state: WeatherState): boolean {
  return state.weatherSeed !== undefined || state.disasters?.override?.weather !== undefined;
}

/**
 * Ztráta násobku `factor` zmenšená ochranou dílu (disasters.md – Ochrana dílu): 1 − (1 − násobek)
 * × (1 − 0,5 × ochrana). Záporná ochrana (mokro v nivě) ztrátu zvětší.
 */
export function protectedFactor(factor: number, protection: number): number {
  return 1 - (1 - factor) * (1 - PROTECTION.lossShare * protection);
}

/** Proti čemu díl v létě chrání – sucho, mokro; dobré a normální léto bez ochrany. */
function summerProtection(summer: SummerWeather): ProtectionKind | null {
  if (DRY.has(summer)) return 'dry';
  if (WET.has(summer)) return 'wet';
  return null;
}

/** Násobek léta (`pick` z tabulky) s ochranou dílu. */
function summerFactor(
  summer: SummerWeather | undefined,
  pick: (effect: SummerEffect) => number,
  part: PartProtection | undefined,
): number {
  if (summer === undefined) return 1;
  const factor = pick(WEATHER.summerEffects[summer]);
  const kind = summerProtection(summer);
  return kind ? protectedFactor(factor, protectionAgainst(part, kind)) : factor;
}

/**
 * Násobek hrubé úrody dílu plodiny počasím roku (disasters.md – Léto, Zima, Ochrana dílu): léto
 * z tabulky – ozim, nebo jařiny (jař, luštěniny, len); sucho s ochranou `dry`, deštivé léto
 * s ochranou `wet` (niva −0,2, svah +0,2), dobré léto bez ochrany. Holomráz – ozim ×0,65
 * s ochranou `frost`.
 */
export function partWeatherFactor(
  weather: CropWeather,
  crop: Crop,
  part: PartProtection | undefined,
): number {
  const winterCrop = crop === 'winter';
  let factor = summerFactor(
    weather.summer,
    (e) => (winterCrop ? e.winterCrop : e.springCrop),
    part,
  );
  if (winterCrop && weather.winter === 'blackFrost') {
    factor *= protectedFactor(
      WEATHER_EFFECTS.blackFrostWinterCrop,
      protectionAgainst(part, 'frost'),
    );
  }
  return factor;
}

/** Mění počasí úrodu plodiny vůbec? Normální léto (a u ozimu zima bez holomrazu) ne. */
export function weatherChangesCrop(weather: CropWeather, crop: Crop): boolean {
  const summer = weather.summer !== undefined && weather.summer !== 'normal';
  return summer || (crop === 'winter' && weather.winter === 'blackFrost');
}

/** Násobek sena louky (disasters.md – Léto, Seno): seno roku s ochranou dílu louky. */
export function hayWeatherFactor(
  summer: SummerWeather | undefined,
  part: PartProtection | undefined,
): number {
  return summerFactor(summer, (e) => e.hay, part);
}

/** Násobek nosnosti pastvy (disasters.md – Léto, Pastva) – bez ochrany, pastva je celé vsi. */
export function pastureWeatherFactor(summer: SummerWeather | undefined): number {
  return summer === undefined ? 1 : WEATHER.summerEffects[summer].pasture;
}

/** Rok sklizně, ke kterému den patří – hospodářský rok začíná 1. 9. (`PLANNING_DAY`). */
export function harvestYearOf(day: number): number {
  const date = dateOfDayIndex(day);
  const afterPlanning =
    date.month > PLANNING_DAY.month ||
    (date.month === PLANNING_DAY.month && date.day >= PLANNING_DAY.day);
  return afterPlanning ? date.year + 1 : date.year;
}

/**
 * Počasí roku sklizně dne `day`: celé (sklizeň – `estimate` false), nebo jen co už je vidět
 * (odhad – disasters.md, „Kdy je vidět“; počasí příštího roku na podzim ještě vidět není).
 */
export function cropWeatherOf(state: WeatherState, day: number, estimate: boolean): CropWeather {
  const year = harvestYearOf(day);
  if (!estimate) {
    const weather = weatherOf(state, year);
    return { summer: weather.summer, winter: weather.winter };
  }
  if (year !== dateOfDayIndex(day).year) return {};
  const seen = revealedWeather(state, day);
  return {
    ...(seen.summer ? { summer: seen.summer } : {}),
    ...(seen.winter ? { winter: seen.winter } : {}),
  };
}

/** Léto roku dne – skutečné (`estimate` false), nebo jen vidět (plán seče). */
export function summerOf(
  state: WeatherState,
  day: number,
  estimate: boolean,
): SummerWeather | undefined {
  if (!hasWeather(state)) return undefined;
  if (!estimate) return weatherOf(state, dateOfDayIndex(day).year).summer;
  return revealedWeather(state, day).summer;
}

/** Je deštivé léto roku sklizně? Výmlat vlhkých snopů stojí víc práce (disasters.md – Léto). */
export function threshWorkFactor(state: WeatherState, day: number): number {
  if (!hasWeather(state)) return 1;
  const summer = weatherOf(state, harvestYearOf(day)).summer;
  return WET.has(summer) ? 1 + WEATHER_EFFECTS.wetThreshWork : 1;
}

/** Je zima roku dne dlouhá sněžná (disasters.md – Zima)? Prosinec patří k zimě příštího roku. */
export function isLongWinter(state: WeatherState, day: number): boolean {
  if (!hasWeather(state)) return false;
  const date = dateOfDayIndex(day);
  const year = date.month >= 11 ? date.year + 1 : date.year;
  return weatherOf(state, year).winter === 'long';
}

/**
 * Je dlouhá zima už vidět (disasters.md – „Kdy je vidět“; od 1. 3.)? Pro rozhodnutí vsi (porážka,
 * výcvik) – listopad a prosinec patří k příští zimě, ta vidět není.
 */
export function isLongWinterRevealed(state: WeatherState, day: number): boolean {
  if (!hasWeather(state)) return false;
  const date = dateOfDayIndex(day);
  if (date.month >= 11) return false;
  return revealedWeather(state, day).winter === 'long';
}

/**
 * Dohra setí jařin 1.–14. 5. v odhalené dlouhé zimě (disasters.md – Zima; návrh Clauda): díly,
 * které už jsou v práci plodiny, se dosejí i po 30. 4. Ozim ne; ves bez počasí nikdy.
 */
export function springSowingExtended(state: WeatherState, day: number, crop: Crop): boolean {
  if (crop === 'winter') return false;
  const date = dateOfDayIndex(day);
  if (date.month !== 5 || date.day > WEATHER_EFFECTS.longWinterSpringSowExtraDays) return false;
  return isLongWinterRevealed(state, day);
}

const before = (date: MonthDay, md: MonthDay): boolean =>
  date.month < md.month || (date.month === md.month && date.day < md.day);

/**
 * Dlouhá zima drží setí jařin (jař, luštěniny, len) do 22. 3. (disasters.md – Zima; návrh
 * Clauda: začátek okna o 3 týdny později). Ozim ne.
 */
export function springSowingHeld(state: WeatherState, day: number, crop: Crop): boolean {
  if (crop === 'winter') return false;
  const date = dateOfDayIndex(day);
  if (date.month !== 3 || !before(date, WEATHER_EFFECTS.longWinterSpringSowFrom)) return false;
  return isLongWinter(state, day);
}

/**
 * Násobek osevu – plán počítá s průměrem let (disasters.md – Co z toho plyne: hrubá úroda ≈ 0,95);
 * ves bez počasí 1.
 */
export function sowingYieldFactor(state: WeatherState): number {
  return hasWeather(state) ? WEATHER.expectedYield : 1;
}

/** Pojistka zásob v ročních potřebách energie – po krutém roce paměť hladu (disasters.md – Dopady). */
export function bufferEnergyYearsOf(state: WeatherState, day: number, normal: number): number {
  const until = state.disasters?.famineMemoryUntilYear;
  if (until === undefined || dateOfDayIndex(day).year > until) return normal;
  return Math.max(normal, WEATHER_EFFECTS.famineBufferEnergyYears);
}

/**
 * 1. 9. na začátku hospodářského roku (mutuje stav): byl letošní rok krutý (kruté sucho, mokré žně, holomráz
 * se zlým létem – `isCruelYear`), drží ves 10 let vyšší pojistku – paměť hladu (disasters.md –
 * Dopady, Zásoby a pojistka). Rok paměti počítá od příštího roku sklizně.
 */
export function famineMemoryDay(state: VillageState, day: number): void {
  if (!hasWeather(state)) return;
  const date = dateOfDayIndex(day);
  if (date.month !== PLANNING_DAY.month || date.day !== PLANNING_DAY.day) return;
  if (!isCruelYear(weatherOf(state, date.year))) return;
  const until = date.year + WEATHER_EFFECTS.famineMemoryYears;
  if ((state.disasters?.famineMemoryUntilYear ?? -Infinity) >= until) return;
  state.disasters = { ...state.disasters, famineMemoryUntilYear: until };
}

/** Násobek sena seče – podle ploch luk (memo na objektu seče; ochrana dílů se mění jen 1. 4.). */
const mowingFactors = new WeakMap<HayMowing, { summer: SummerWeather; factor: number }>();

/**
 * Násobek sena dnešní seče (disasters.md – Léto, Seno): seno roku s ochranou každé louky (díly
 * podle ochrany, přirozené louky jako typická ves), vážené plochou. Normální léto a ves bez
 * počasí 1.
 */
export function mowingWeatherFactor(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
  mowing: HayMowing,
): number {
  const summer = summerOf(state, day, false);
  if (summer === undefined || summer === 'normal') return 1;
  const memo = mowingFactors.get(mowing);
  if (memo && memo.summer === summer) return memo.factor;
  const parts = state.disasters?.protection?.parts;
  let area = 0;
  let sum = 0;
  for (const square of mowing.squares ?? []) {
    const part = square.partId === undefined ? undefined : parts?.[String(square.partId)];
    area += square.areaM2;
    sum += square.areaM2 * hayWeatherFactor(summer, part);
  }
  const factor = area > 0 ? sum / area : hayWeatherFactor(summer, undefined);
  mowingFactors.set(mowing, { summer, factor });
  return factor;
}
