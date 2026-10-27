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

/**
 * Ztráty dílů z místních pohrom (kroupy, povodeň) za rok sklizně dne (`disasters.losses`), jen
 * pro díly `partIds`; jiný rok nebo žádný zasažený díl nic.
 */
function disasterLossesOf(
  state: Pick<VillageState, 'disasters'>,
  day: number,
  partIds: readonly number[],
): ((key: string) => number) | undefined {
  const losses = state.disasters?.losses;
  if (!losses || losses.year !== harvestYearOf(day)) return undefined;
  const { hail, flood } = losses;
  const hit = (key: string): boolean => hail?.[key] !== undefined || flood?.[key] !== undefined;
  if (!partIds.some((id) => hit(String(id)))) return undefined;
  return (key) => 1 - (1 - (hail?.[key] ?? 0)) * (1 - (flood?.[key] ?? 0));
}

/**
 * Ztráty dílů plodiny dne (disasters.md – Dopady na existující mechaniky, Úroda): hrubá úroda
 * dílu × počasí dílu (s ochranou – `partWeatherFactor`) × (1 − škoda zvěře `base`) × (1 − kroupy)
 * × (1 − povodeň). Při sklizni celé počasí roku sklizně, pro odhad (`estimate`) jen co už je vidět
 * (kroupy a voda, které už přišly, vidět jsou). Ves bez počasí a bez pohrom dílů a rok, kdy počasí
 * plodinu nemění, vrací `base` beze změny (bez nového objektu).
 */
export function dayPartLosses(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
  crop: Crop,
  partIds: readonly number[],
  base: PartLosses | undefined,
  estimate = false,
): PartLosses | undefined {
  const disaster = disasterLossesOf(state, day, partIds);
  const weather = hasWeather(state) ? cropWeatherOf(state, day, estimate) : undefined;
  const weatherOn = weather !== undefined && weatherChangesCrop(weather, crop);
  if (!weatherOn && !disaster) return base;
  const parts = state.disasters?.protection?.parts;
  const losses: Record<string, { share: number }> = {};
  for (const id of partIds) {
    const key = String(id);
    const weatherKept = weatherOn ? partWeatherFactor(weather, crop, parts?.[key]) : 1;
    const kept = weatherKept * (1 - (base?.[key]?.share ?? 0)) * (1 - (disaster?.(key) ?? 0));
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
