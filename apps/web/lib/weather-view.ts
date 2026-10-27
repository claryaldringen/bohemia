// Počasí roku pro scénu (disasters.md – Ve scéně): jen počasí, které už je vidět (`revealedWeather`),
// síla zlého léta a ochrana dílů po stupních – nikdy seed počasí ani budoucí rok.

import {
  protectionAgainst,
  revealedWeather,
  type ProtectionKind,
  type SummerWeather,
  type VillageState,
} from '@bohemia/game';
import type { SceneWeather } from './village-view-scene-types';

/** Síla zlého léta pro vzhled scény 0–1 (jen vzhled – pravidla jsou v jádru). */
const SUMMER_STRENGTH: Partial<Record<SummerWeather, number>> = {
  dry: 0.6,
  drought: 1,
  wet: 0.6,
  wetHarvest: 1,
};

/** Proti čemu chrání díl v létě daného druhu – barvu dílu mění jen sucho a mokro. */
const SUMMER_PROTECTION: Partial<Record<SummerWeather, ProtectionKind>> = {
  dry: 'dry',
  drought: 'dry',
  wet: 'wet',
  wetHarvest: 'wet',
};

/** Stupně ochrany dílu ve scéně (0–4) – barva dílu se mění po stupních, ne plynule. */
export const PROTECTION_LEVELS = 4;

/**
 * Ochrana 0–1 jako stupeň 0–4. Mokro má ochranu −0,2 až +0,2 (niva, svah) – převede se na 0–1
 * (0,5 = rovina mimo nivu).
 */
export function protectionLevel(kind: ProtectionKind, protection: number): number {
  const share = kind === 'wet' ? (protection + 0.2) / 0.4 : protection;
  return Math.round(Math.min(1, Math.max(0, share)) * PROTECTION_LEVELS);
}

/** Počasí roku dne `day` pro scénu; normální rok (nic zlého ani dobrého není vidět) null. */
export function sceneWeather(
  state: Pick<VillageState, 'weatherSeed' | 'disasters' | 'parts'>,
  day: number,
): SceneWeather | null {
  const seen = revealedWeather(state, day);
  const summer = seen.summer !== undefined && seen.summer !== 'normal' ? seen.summer : undefined;
  const winter = seen.winter !== undefined && seen.winter !== 'normal' ? seen.winter : undefined;
  if (!summer && !winter) return null;
  const strength = summer ? SUMMER_STRENGTH[summer] : undefined;
  const kind = summer ? SUMMER_PROTECTION[summer] : undefined;
  let parts: Record<string, number> | undefined;
  if (kind) {
    const saved = state.disasters?.protection?.parts ?? {};
    for (const part of state.parts) {
      if (part.cell === undefined) continue;
      const level = protectionLevel(kind, protectionAgainst(saved[String(part.id)], kind));
      if (level > 0) (parts ??= {})[String(part.id)] = level;
    }
  }
  return {
    year: seen.year,
    ...(summer ? { summer } : {}),
    ...(winter ? { winter } : {}),
    ...(strength !== undefined ? { strength } : {}),
    ...(parts ? { parts } : {}),
  };
}
