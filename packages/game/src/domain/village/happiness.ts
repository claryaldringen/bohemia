import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { DIET } from './diet';
import { isOvercrowded } from './dwellings';
import { foodNeedPerDay } from './people';
import {
  HAPPINESS,
  HAPPINESS_BONUS,
  HAPPINESS_LABOR,
  HAPPINESS_PENALTY,
  type WindowSegment,
} from './rules';
import { sacredHappiness } from './sacred';
import type { ChronicleEvent, HappinessState, VillageState } from './types';

// Štěstí obyvatel (happiness.md): cílová hodnota z hladu, úmrtí, přeplněnosti, dřiny, zásob
// a posvátných míst, skutečné štěstí se k ní posouvá pomalu (10 % rozdílu za měsíc) a násobí
// veškerou práci vsi (0 → × 0,8, 50 → × 1, 100 → × 1,1). Simulace ho vede den po dni.

const DAYS_PER_YEAR = 365.25;
const MONTHS_PER_YEAR = 12;
/** Denní podíl posunu – za 1/12 roku (po dnech) ubude HAPPINESS.monthlyShare rozdílu. */
const DAILY_SHARE = 1 - (1 - HAPPINESS.monthlyShare) ** (MONTHS_PER_YEAR / DAYS_PER_YEAR);

/** Štěstí vsi (vsi uložené před jeho zavedením výchozí 50). */
export function villageHappiness(state: Pick<VillageState, 'happiness'>): number {
  return state.happiness?.value ?? HAPPINESS.start;
}

/**
 * Násobek veškeré práce vsi podle štěstí (happiness.md – Účinek na práci): 0 → 0,8, 50 → 1,
 * 100 → 1,1, mezi tím lineárně. Násobí se s ostatními mezemi produktivity (řemesla – zatím
 * nejsou).
 */
export function happinessLaborFactor(happiness: number): number {
  const h = Math.min(HAPPINESS.max, Math.max(HAPPINESS.min, happiness));
  if (h <= HAPPINESS.base) {
    const t = (h - HAPPINESS.min) / (HAPPINESS.base - HAPPINESS.min);
    return HAPPINESS_LABOR.atMin + (HAPPINESS_LABOR.atBase - HAPPINESS_LABOR.atMin) * t;
  }
  const t = (h - HAPPINESS.base) / (HAPPINESS.max - HAPPINESS.base);
  return HAPPINESS_LABOR.atBase + (HAPPINESS_LABOR.atMax - HAPPINESS_LABOR.atBase) * t;
}

/** Násobek práce vsi dnes – podle štěstí na začátku dne. */
export function villageLaborFactor(state: Pick<VillageState, 'happiness'>): number {
  return happinessLaborFactor(villageHappiness(state));
}

/** Z čeho se skládá cílové štěstí – body (ubírající kladně). */
export interface HappinessFactors {
  /** Hlad – nasycení pod 0,9 ubere až 40. */
  hunger: number;
  /** Úmrtí posledního roku – nejvýš 20. */
  deaths: number;
  /** Přeplněnost – podíl lidí v přeplněných domácnostech × 15. */
  crowding: number;
  /** Dřina – podíl dní za posledních 60, kdy ves nestíhala polní práce, × 15. */
  toil: number;
  /** Zásoby obilí na víc než rok – +5. */
  stores: number;
  /** Lidé jedí ovoce – sladké, +5 (diet.md). */
  fruit: number;
  /** Posvátná místa – nejvýš +40. */
  sacred: number;
}

/**
 * Cílové štěstí = 50 + posvátná místa + zásoby + ovoce − hlad − úmrtí − přeplněnost − dřina
 * (0–100).
 */
export function happinessTarget(f: HappinessFactors): number {
  const value =
    HAPPINESS.base + f.sacred + f.stores + f.fruit - f.hunger - f.deaths - f.crowding - f.toil;
  return Math.min(HAPPINESS.max, Math.max(HAPPINESS.min, value));
}

/** Hlad: nasycení pod 0,9 ubere lineárně až 40 (při nulovém nasycení). */
export function hungerPenalty(satiation: number): number {
  const { hungerFrom, hungerMax } = HAPPINESS_PENALTY;
  const s = Math.min(1, Math.max(0, satiation));
  return s >= hungerFrom ? 0 : (hungerMax * (hungerFrom - s)) / hungerFrom;
}

/** Úmrtí za poslední rok: součet bodů, nejvýš 20. */
export function deathsPenalty(deaths: readonly { points: number }[]): number {
  const total = deaths.reduce((sum, d) => sum + d.points, 0);
  return Math.min(HAPPINESS_PENALTY.deathsMax, total);
}

/** Dřina: podíl dní za posledních 60, kdy ves nestíhala polní práce, × 15. */
export function toilPenalty(toil: readonly number[]): number {
  const days = toil.reduce((sum, v) => sum + v, 0);
  return (
    (HAPPINESS_PENALTY.toilMax * Math.min(days, HAPPINESS_PENALTY.toilWindowDays)) /
    HAPPINESS_PENALTY.toilWindowDays
  );
}

/** Podíl lidí v přeplněných domácnostech (0–1). */
export function crowdedShare(state: VillageState, day: number): number {
  if (state.people.length === 0) return 0;
  const crowded = new Set(
    state.dwellings.filter((d) => isOvercrowded(state, d.id, day)).map((d) => d.id),
  );
  if (crowded.size === 0) return 0;
  const inCrowded = state.people.filter((p) => crowded.has(p.dwellingId)).length;
  return inCrowded / state.people.length;
}

/** Zásoby obilí vystačí na víc než rok (při dnešní potřebě)? */
export function hasGoodStores(state: VillageState, day: number): boolean {
  const need = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  return need > 0 && state.storesKg > need * DAYS_PER_YEAR * HAPPINESS_BONUS.storesYears;
}

/**
 * Složky cílového štěstí vsi v den `day` při nasycení `satiation`; `fruit` – lidé dnes jedí ovoce
 * (diet.md); `obstacles` – vrstva překážek krajiny (stáří a život posvátných dubů – bez ní se
 * počítají jako nejmladší).
 */
export function happinessFactors(
  state: VillageState,
  day: number,
  satiation: number,
  fruit = false,
  obstacles: ObstacleLayer | null = null,
): HappinessFactors {
  const memory = state.happiness;
  return {
    hunger: hungerPenalty(satiation),
    deaths: deathsPenalty(memory?.deaths ?? []),
    crowding: HAPPINESS_PENALTY.crowdingMax * crowdedShare(state, day),
    toil: toilPenalty(memory?.toil ?? []),
    stores: hasGoodStores(state, day) ? HAPPINESS_BONUS.stores : 0,
    fruit: fruit ? DIET.fruitHappiness : 0,
    sacred: sacredHappiness(state, day, obstacles),
  };
}

/** Body za úmrtí v kronice dne (dítě 5, dospělý a starší 3). */
function deathPoints(events: readonly ChronicleEvent[]): { day: number; points: number }[] {
  return events.flatMap((e) =>
    e.kind === 'death' ? [{ day: e.day, points: HAPPINESS_PENALTY.deathPoints[e.group] }] : [],
  );
}

/**
 * Krok štěstí na konci dne (mutuje stav): zapamatuje úmrtí dne (`events`) a jestli ves dnes
 * nestíhala polní práce (`toil`), zapomene starší než rok / 60 dní a posune štěstí o denní
 * podíl k cílové hodnotě. Nezávisí na tom, po jakých kouscích se ves dopočítává.
 */
export function updateHappiness(
  state: VillageState,
  day: number,
  input: {
    satiation: number;
    events: readonly ChronicleEvent[];
    toil: boolean;
    fruit?: boolean;
    /** Vrstva překážek – stáří a život posvátných dubů (bez ní nejmladší). */
    obstacles?: ObstacleLayer | null;
  },
): void {
  const memory: HappinessState = state.happiness ?? {
    value: HAPPINESS.start,
    deaths: [],
    toil: [],
  };
  const deaths = [...memory.deaths, ...deathPoints(input.events)].filter(
    (d) => d.day > day - HAPPINESS_PENALTY.deathsWindowDays,
  );
  const toil = [...memory.toil, input.toil ? 1 : 0].slice(-HAPPINESS_PENALTY.toilWindowDays);
  state.happiness = { value: memory.value, deaths, toil };
  const target = happinessTarget(
    happinessFactors(state, day, input.satiation, input.fruit ?? false, input.obstacles ?? null),
  );
  state.happiness.value = memory.value + (target - memory.value) * DAILY_SHARE;
}

/** Polní úloha, která dnes běží: kolik práce zbývá po dnešku a kdy končí její okno (den). */
export interface SeasonTask {
  remaining: number;
  /** Poslední den okna (index dne). */
  endDay: number;
}

/**
 * Poslední den aktuálního úseku okna (index dne), nebo null mimo okno. Úsek do prosince
 * pokračuje lednem dalšího roku, když okno má úsek od ledna (výmlat do konce února).
 */
export function windowEndDay(segments: readonly WindowSegment[], day: number): number | null {
  const { year, month } = dateOfDayIndex(day);
  const current = segments.find(([from, to]) => month >= from && month <= to);
  if (!current) return null;
  let endYear = year;
  let endMonth = current[1];
  if (endMonth === MONTHS_PER_YEAR) {
    const next = segments.find(([from]) => from === 1);
    if (next) {
      endYear = year + 1;
      endMonth = next[1];
    }
  }
  // první den po okně − 1; za koncem světa poslední den světa
  const afterYear = endMonth === MONTHS_PER_YEAR ? endYear + 1 : endYear;
  const afterMonth = endMonth === MONTHS_PER_YEAR ? 1 : endMonth + 1;
  try {
    return dayIndexOf({ year: afterYear, month: afterMonth, day: 1 }) - 1;
  } catch {
    return TOTAL_GAME_DAYS - 1;
  }
}

/**
 * Dřina (happiness.md – „ves nestihla práci v období“): ves dnes nestíhá polní práce, když by je
 * dnešním tempem (`pace` – práce, kterou dnes dostaly polní úlohy) nedodělala do konce jejich
 * oken. Úlohy se řadí podle konce okna a zbývající práce se sčítá – co končí dřív, musí být
 * hotové dřív (zkouška rozvrhu podle nejbližšího termínu).
 */
export function isToilDay(tasks: readonly SeasonTask[], pace: number, day: number): boolean {
  const open = tasks.filter((t) => t.remaining > 1e-9).sort((a, b) => a.endDay - b.endDay);
  let cumulative = 0;
  for (const task of open) {
    cumulative += task.remaining;
    const daysLeft = Math.max(0, task.endDay - day);
    if (cumulative > pace * daysLeft + 1e-9) return true;
  }
  return false;
}
