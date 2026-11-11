import { dateOfDayIndex } from '../domain/calendar';
import type { Landscape } from '../domain/landscape';
import {
  FLOOD_WATER,
  type DisasterState,
  type FloodLevel,
  type SummerWeather,
  type VillageState,
  type WinterWeather,
} from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Vývojový režim (disasters.md – plán P10): vynucený zlý rok a vynucená místní pohroma pro
// skutečnou ves – zapisují `disasters.override` (jen testy a dev), los i ochranu nové vsi přebijí.

/** Vynutit zlý rok jde jen ve vývojovém režimu (příznak účtu). */
export const DEV_DISASTERS_ONLY = 'Pohromu jde vynutit jen ve vývojovém režimu.';
/** Požár potřebuje obydlí, které chytí. */
const NO_DWELLING_TO_BURN = 'Ves nemá obydlí, které by mohlo chytit.';

/** Zlý rok, který jde vynutit – léto, nebo zima letošního roku. */
export type BadYearKind =
  Exclude<SummerWeather, 'normal' | 'good'> | Exclude<WinterWeather, 'normal'>;
export const BAD_YEAR_KINDS: readonly BadYearKind[] = [
  'dry',
  'drought',
  'wet',
  'wetHarvest',
  'blackFrost',
  'long',
];
const WINTER_KINDS: ReadonlySet<BadYearKind> = new Set(['blackFrost', 'long']);

/** Místní pohroma, kterou jde vynutit na zítřek. */
export type ForcedDisasterKind = 'hail' | 'flood' | 'fire' | 'tornado';
export const FORCED_DISASTER_KINDS: readonly ForcedDisasterKind[] = [
  'hail',
  'flood',
  'fire',
  'tornado',
];

/** Vynucená povodeň – stoletá voda (návrh Clauda: zatopí nivu, stavby nad ní většinou ne). */
const FORCED_FLOOD: FloodLevel = 'hundred';

export interface DevDisasterInput {
  villageId: string;
  /** Hráč má vývojový režim (příznak účtu) – jinak akce nejde. */
  devMode: boolean;
  /** Dnešní herní den hráče (index dne). */
  today: number;
  landscape: Landscape;
}

type Override = NonNullable<DisasterState['override']>;

/** Kopie stavu s upraveným `disasters.override` (ostatní části pohrom beze změny). */
function withOverride(state: VillageState, change: (override: Override) => Override): VillageState {
  const next = cloneState(state);
  const disasters = next.disasters ?? {};
  next.disasters = { ...disasters, override: change(disasters.override ?? {}) };
  return next;
}

/**
 * Vývojový režim: letošní léto nebo zima vsi bude `kind` (`override.weather[rok]`) – ukáže se,
 * až bude vidět (`revealedWeather`: sucho od 1. 5., holomráz od 1. 2. …), a projeví se na úrodě,
 * seně, sousedech i zvěři jako los.
 */
export function forceBadYear(
  deps: { villages: VillageRepository },
  input: DevDisasterInput & { kind: BadYearKind },
): Promise<VillageResult> {
  if (!input.devMode) return Promise.resolve({ ok: false, reason: DEV_DISASTERS_ONLY });
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const year = dateOfDayIndex(state.lastDay).year;
      const part = WINTER_KINDS.has(input.kind)
        ? { winter: input.kind as WinterWeather }
        : { summer: input.kind as SummerWeather };
      return {
        ok: true,
        state: withOverride(state, (o) => ({
          ...o,
          weather: { ...o.weather, [year]: { ...o.weather?.[year], ...part } },
        })),
      };
    },
  );
}

/**
 * Vývojový režim: zítra vsi přijde místní pohroma `kind` – kroupy a smršť pruhem přes střed vsi,
 * stoletá voda kraje (jen pro tuto ves), požár prvního obydlí. Přebije los i ochranu nové vsi.
 */
export function forceDisaster(
  deps: { villages: VillageRepository },
  input: DevDisasterInput & { kind: ForcedDisasterKind },
): Promise<VillageResult> {
  if (!input.devMode) return Promise.resolve({ ok: false, reason: DEV_DISASTERS_ONLY });
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay + 1;
      if (input.kind === 'fire') {
        const dwelling = state.dwellings[0];
        if (!dwelling) return { ok: false, reason: NO_DWELLING_TO_BURN };
        return {
          ok: true,
          state: withOverride(state, (o) => ({ ...o, fire: { ...o.fire, [day]: dwelling.id } })),
        };
      }
      if (input.kind === 'hail') {
        return {
          ok: true,
          state: withOverride(state, (o) => ({
            ...o,
            hail: { ...o.hail, [day]: { angle: 0.7, offsetM: 0 } },
          })),
        };
      }
      if (input.kind === 'tornado') {
        return {
          ok: true,
          state: withOverride(state, (o) => ({
            ...o,
            tornado: { ...o.tornado, [day]: { strength: 'F2', angle: 0.9, offsetM: 0 } },
          })),
        };
      }
      const date = dateOfDayIndex(day);
      const heightM = FLOOD_WATER.levels.find((l) => l.level === FORCED_FLOOD)?.heightM ?? 2;
      const flood = {
        level: FORCED_FLOOD,
        heightM,
        season: date.month <= 5 ? ('spring' as const) : ('summer' as const),
        month: date.month,
        day: date.day,
      };
      return {
        ok: true,
        state: withOverride(state, (o) => ({
          ...o,
          weather: { ...o.weather, [date.year]: { ...o.weather?.[date.year], flood } },
        })),
      };
    },
  );
}
