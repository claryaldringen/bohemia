// Počasí roku pro scénu (disasters.md – Ve scéně): jen počasí, které už je vidět (`revealedWeather`),
// síla zlého léta a ochrana dílů po stupních – nikdy seed počasí ani budoucí rok.

import {
  dateOfDayIndex,
  FLOOD,
  protectionAgainst,
  revealedWeather,
  type ProtectionKind,
  type SummerWeather,
  type VillageState,
} from '@bohemia/game';
import type { SceneFlood, SceneHail, SceneTornado, SceneWeather } from './village-view-scene-types';

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

/**
 * Povodeň ve scéně (disasters.md – Povodeň potoka, Ve scéně; návrh Clauda): voda stojí
 * `FLOOD.standDays` dní, pak za `FLOOD_RECEDE_DAYS` ustoupí; bahno a naplavenina zůstanou
 * `FLOOD_MUD_DAYS` dní od ústupu vody a postupně zarostou.
 */
export const FLOOD_RECEDE_DAYS = 1;
export const FLOOD_MUD_DAYS = 14;

/** Poslední den, kdy scéna povodeň ještě ukazuje (od dne povodně). */
export const FLOOD_SCENE_DAYS = FLOOD.standDays + FLOOD_RECEDE_DAYS + FLOOD_MUD_DAYS;

/**
 * Krupobití pro scénu: jen v jeho den a po něm do konce téhož roku (potlučená pole do žní).
 * `disasters.hail` je vždy minulé – vynucené kroupy (`override.hail`) se do prohlížeče nedostanou.
 */
export function sceneHail(state: Pick<VillageState, 'disasters'>, day: number): SceneHail | null {
  const hail = state.disasters?.hail;
  if (!hail || hail.day > day) return null;
  if (dateOfDayIndex(hail.day).year !== dateOfDayIndex(day).year) return null;
  const { x, z, angle, offsetM } = hail.strip;
  return { day: hail.day, strip: { x, z, angle, offsetM } };
}

/**
 * Jak dlouho (herní dny) leží vyvrácené stromy smrště jako padlé kmeny, než je ves rozřeže na klády
 * (ty leží na hromadách u lesa už od smrště – `logStacks`) – jen vzhled (návrh Clauda).
 */
export const TORNADO_TRUNK_DAYS = 10;

/**
 * Smršť pro scénu (disasters.md – Smršť, Ve scéně): jen v její den a po něm do konce roku – den,
 * síla a stopa (`disasters.tornado` z jádra, nikdy rozpis `yearTornadoes`); prvních
 * `TORNADO_TRUNK_DAYS` dní i vývraty vrstvy překážek (pokácené v den smrště) pro padlé kmeny.
 */
export function sceneTornado(
  state: Pick<VillageState, 'disasters' | 'felledTrees'>,
  day: number,
): SceneTornado | null {
  const tornado = state.disasters?.tornado;
  if (!tornado || tornado.day > day) return null;
  if (dateOfDayIndex(tornado.day).year !== dateOfDayIndex(day).year) return null;
  const { x, z, angle, lengthM, widthM } = tornado.track;
  const trunks =
    day < tornado.day + TORNADO_TRUNK_DAYS
      ? (state.felledTrees ?? []).filter((f) => f.day === tornado.day).map((f) => f.id)
      : [];
  return {
    day: tornado.day,
    strength: tornado.strength,
    track: { x, z, angle, lengthM, widthM },
    ...(trunks.length > 0 ? { trunks } : {}),
  };
}

/** Povodeň pro scénu: od jejího dne do konce bahna (`FLOOD_SCENE_DAYS`), jinak null. */
export function sceneFlood(state: Pick<VillageState, 'disasters'>, day: number): SceneFlood | null {
  const flood = state.disasters?.flood;
  if (!flood || flood.day > day || day >= flood.day + FLOOD_SCENE_DAYS) return null;
  // jarní voda (tání) je v březnu, letní (bouřky) od poloviny června (FLOOD_WATER – okna)
  const season = dateOfDayIndex(flood.day).month <= 5 ? 'spring' : 'summer';
  return { day: flood.day, heightM: flood.heightM, season };
}
