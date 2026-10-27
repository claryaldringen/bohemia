// Místní pohromy vsi – rámec (disasters.md – Místní pohromy – jedna ves). Kroupy, povodeň, požár
// a smršť přidají další úlohy; tady je zatím ochrana nové vsi a ztráty dílů při sklizni.

import { LOCAL_DISASTERS } from './rules-disasters';
import type { Crop } from './types-land';
import type { VillageState } from './types-state';
import {
  cropWeatherOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from './weather-effects';
import { seasonCrop, type PartLosses } from './year-plan';

/** Průměrná délka roku kalendáře (přestupný každý čtvrtý rok – calendar.ts). */
const DAYS_PER_YEAR = 365.25;

/**
 * Ochrana nové vsi (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou
 * ochranu“): prvních 5 let od založení žádné kroupy, povodeň, požár ani smršť. Počasí kraje
 * platí naplno.
 */
export function inDisasterProtection(foundedDay: number, day: number): boolean {
  return day - foundedDay < LOCAL_DISASTERS.protectionYears * DAYS_PER_YEAR;
}

/**
 * Ztráty dílů plodiny dne (disasters.md – Dopady na existující mechaniky, Úroda): hrubá úroda
 * dílu × počasí dílu (s ochranou – `partWeatherFactor`) × (1 − škoda zvěře `base`). Při sklizni
 * celé počasí roku sklizně, pro odhad (`estimate`) jen co už je vidět. Ves bez počasí a rok, kdy
 * počasí plodinu nemění, vrací `base` beze změny (bez nového objektu).
 */
export function dayPartLosses(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
  crop: Crop,
  partIds: readonly number[],
  base: PartLosses | undefined,
  estimate = false,
): PartLosses | undefined {
  if (!hasWeather(state)) return base;
  const weather = cropWeatherOf(state, day, estimate);
  if (!weatherChangesCrop(weather, crop)) return base;
  const parts = state.disasters?.protection?.parts;
  const losses: Record<string, { share: number }> = {};
  for (const id of partIds) {
    const key = String(id);
    const kept = partWeatherFactor(weather, crop, parts?.[key]) * (1 - (base?.[key]?.share ?? 0));
    losses[key] = { share: 1 - kept };
  }
  return losses;
}

/**
 * Ztráty ozimu pro odhad přídělu (`daysUntilFoodHarvest` – diet.md, Ozim a jař): škoda zvěře
 * a počasí, které už je vidět. Bez nesklizeného ozimu jen škoda zvěře.
 */
export function winterEstimateLosses(
  state: Pick<VillageState, 'weatherSeed' | 'disasters' | 'season' | 'wildlife'>,
  day: number,
): PartLosses | undefined {
  const base = state.wildlife?.damage?.parts;
  const winter = state.season ? seasonCrop(state.season, 'winter') : undefined;
  if (!winter || winter.harvestedKg !== null) return base;
  return dayPartLosses(state, day, 'winter', winter.partIds, base, true);
}
