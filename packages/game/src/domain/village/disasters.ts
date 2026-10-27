// Místní pohromy vsi (disasters.md – Místní pohromy – jedna ves): ochrana nové vsi, rozpis roku
// a ztráty dílů při sklizni. Pořadí pohrom dne je v `local-disasters.ts` (`localDisastersDay`) –
// zvlášť, ať tento soubor (čte ho strava) nenatahuje požár, kroupy a seno (cyklus importů).

import type { Crop } from './types-land';
import type { VillageState } from './types-state';
import {
  cropWeatherOf,
  harvestYearOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from './weather-effects';
import { seasonCrop, type PartLosses } from './year-plan';

export { inDisasterProtection, yearSchedule } from './disaster-schedule';

/** Ztráty dílů z krupobití za rok sklizně dne (`disasters.losses.hail`); jiný rok nic. */
function hailLossesOf(
  state: Pick<VillageState, 'disasters'>,
  day: number,
): Readonly<Record<string, number>> | undefined {
  const losses = state.disasters?.losses;
  return losses?.hail && losses.year === harvestYearOf(day) ? losses.hail : undefined;
}

/**
 * Ztráty dílů plodiny dne (disasters.md – Dopady na existující mechaniky, Úroda): hrubá úroda
 * dílu × počasí dílu (s ochranou – `partWeatherFactor`) × (1 − škoda zvěře `base`) × (1 − kroupy).
 * Při sklizni celé počasí roku sklizně, pro odhad (`estimate`) jen co už je vidět (kroupy, které
 * už padly, vidět jsou). Ves bez počasí a bez krupobití dílů a rok, kdy počasí plodinu nemění,
 * vrací `base` beze změny (bez nového objektu).
 */
export function dayPartLosses(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
  crop: Crop,
  partIds: readonly number[],
  base: PartLosses | undefined,
  estimate = false,
): PartLosses | undefined {
  const all = hailLossesOf(state, day);
  const hail = all && partIds.some((id) => all[String(id)] !== undefined) ? all : undefined;
  const weather = hasWeather(state) ? cropWeatherOf(state, day, estimate) : undefined;
  const weatherOn = weather !== undefined && weatherChangesCrop(weather, crop);
  if (!weatherOn && !hail) return base;
  const parts = state.disasters?.protection?.parts;
  const losses: Record<string, { share: number }> = {};
  for (const id of partIds) {
    const key = String(id);
    const weatherKept = weatherOn ? partWeatherFactor(weather, crop, parts?.[key]) : 1;
    const kept = weatherKept * (1 - (base?.[key]?.share ?? 0)) * (1 - (hail?.[key] ?? 0));
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
