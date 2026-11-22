import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../../calendar';
import type { ObstacleLayer } from '../../landscape';
import { churchHappiness } from './church-life';
import { christianShare } from './conversion';
import type { DietHappiness } from '../core/tier-meal';
import { isOvercrowded } from '../buildings/dwellings';
import { fieldFoodShare, fieldStoresKg } from '../fields/field-food';
import { linenUnhappiness } from '../fields/flax';
import { foodNeedPerDay } from './people';
import {
  HAPPINESS,
  HAPPINESS_BONUS,
  HAPPINESS_LABOR,
  HAPPINESS_PENALTY,
  type WindowSegment,
} from '../rules';
import { FAITH } from '../rules/rules-faith';
import { sacredHappiness } from './sacred';
import { woolUnhappiness } from '../livestock/wool';
import type { ChronicleEvent, HappinessState, VillageState } from '../types';

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
  /** Lidé jedí ovoce – sladké, +5 každému, kdo ho jedl, průměr po lidech (diet.md). */
  fruit: number;
  /**
   * Lidé jedí maso – až +3 podle podílu energie z masa, kterou kdo snědl, průměr po lidech
   * (diet.md – Luštěniny, Martin).
   */
  meat: number;
  /**
   * Lidé jedí med – sladký, +2 každému, kdo ho jedl, průměr po lidech (diet.md – Strava po vrstvách
   * a porážka celý rok, Spokojenost ze stravy).
   */
  honey: number;
  /** Posvátná místa pohanů – nejvýš +40 (křesťanům 0). */
  sacred: number;
  /** Nespokojenost pohanů se zničenými posvátnými místy (christianity.md), nejvýš 30; chybí = 0. */
  desecration?: number;
  /** Kostel s knězem přidá křesťanům štěstí (`churchHappiness`, nejvýš 45); chybí = 0. */
  church?: number;
  /** Podíl křesťanů mezi lidmi vsi (0–1); chybí = 0. */
  christianShare?: number;
  /** Chybí vlna na oděv – až 6 podle podílu, na který ovce vlnu nedají (diet.md – Oděv). */
  wool: number;
  /** Chybí len na oděv – až 4 podle podílu, na který lnu není (fields.md – Len, diet.md – Oděv). */
  linen: number;
}

/**
 * Cílové štěstí = vážený průměr cíle pohanů a křesťanů (jedna skupina = její cíl); cíl skupiny =
 * 50 + posvátná místa + zásoby + ovoce + maso + med − hlad − úmrtí − přeplněnost − dřina
 * − chybějící vlna a len (0–100).
 */
export function happinessTarget(f: HappinessFactors): number {
  const common =
    HAPPINESS.base +
    f.stores +
    f.fruit +
    f.meat +
    f.honey -
    f.hunger -
    f.deaths -
    f.crowding -
    f.toil -
    f.wool -
    f.linen;
  const clamp = (v: number): number => Math.min(HAPPINESS.max, Math.max(HAPPINESS.min, v));
  const pagan = clamp(common + f.sacred - (f.desecration ?? 0));
  const share = f.christianShare ?? 0;
  if (share <= 0) return pagan;
  // vážený průměr cíle pohanů a křesťanů podle počtu lidí (christianity.md – Štěstí)
  return (1 - share) * pagan + share * clamp(common + (f.church ?? 0));
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

/**
 * Zásoby z pole (obilí a luštěniny) vystačí na víc než rok toho, co ves jí z pole (dnešní potřeba
 * × podíl z pole – fields.md, Osev podle stravy a podle zásob)? Ves bez změřeného podílu proti
 * celé potřebě.
 */
export function hasGoodStores(state: VillageState, day: number): boolean {
  const need =
    state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0) * fieldFoodShare(state);
  return need > 0 && fieldStoresKg(state, day) > need * DAYS_PER_YEAR * HAPPINESS_BONUS.storesYears;
}

/** Složky víry: podíl křesťanů, nespokojenost pohanů a kostel křesťanů (jen když se liší od 0). */
function faithFactors(
  state: VillageState,
): Pick<HappinessFactors, 'desecration' | 'church' | 'christianShare'> {
  const d = state.faith?.desecrated;
  const desecration = d
    ? Math.min(
        FAITH.desecration.max,
        FAITH.desecration.oakOrGrove * d.oaksOrGroves + FAITH.desecration.cemetery * d.cemeteries,
      )
    : 0;
  const share = christianShare(state);
  const church = share > 0 ? churchHappiness(state) : 0;
  return {
    ...(desecration > 0 ? { desecration } : {}),
    ...(share > 0 ? { christianShare: share } : {}),
    ...(church > 0 ? { church } : {}),
  };
}

/** Bez štěstí ze stravy – nikdo nejí maso, ovoce ani med. */
const NO_DIET_HAPPINESS: DietHappiness = { fruit: 0, meat: 0, honey: 0 };

/**
 * Složky cílového štěstí vsi v den `day` při nasycení `satiation`; `diet` – štěstí z masa, ovoce
 * a medu průměrem po lidech podle toho, co kdo dnes snědl (`dietHappiness` – diet.md, Spokojenost
 * ze stravy); `obstacles` – vrstva překážek krajiny (stáří a život posvátných dubů – bez ní se
 * počítají jako nejmladší); `premiumSacred` – posvátné místo prémiové krajiny
 * (`premiumSacredHappiness`).
 */
export function happinessFactors(
  state: VillageState,
  day: number,
  satiation: number,
  diet: DietHappiness = NO_DIET_HAPPINESS,
  obstacles: ObstacleLayer | null = null,
  premiumSacred = 0,
): HappinessFactors {
  const memory = state.happiness;
  return {
    hunger: hungerPenalty(satiation),
    deaths: deathsPenalty(memory?.deaths ?? []),
    crowding: HAPPINESS_PENALTY.crowdingMax * crowdedShare(state, day),
    toil: toilPenalty(memory?.toil ?? []),
    stores: hasGoodStores(state, day) ? HAPPINESS_BONUS.stores : 0,
    fruit: diet.fruit,
    meat: diet.meat,
    honey: diet.honey,
    sacred: sacredHappiness(state, day, obstacles, premiumSacred),
    ...faithFactors(state),
    wool: woolUnhappiness(state),
    linen: linenUnhappiness(state),
  };
}

/**
 * Body za jedno úmrtí (happiness.md): max(0,5; 5 − 0,06 × věk v letech); událost bez věku
 * (starší uložená ves) dítě 5, dospělý a starší 3.
 */
export function deathPointsFor(e: { group: 'child' | 'adult' | 'elder'; age?: number }): number {
  if (e.age === undefined) return HAPPINESS_PENALTY.deathPoints[e.group];
  return Math.max(
    HAPPINESS_PENALTY.deathPointsMin,
    HAPPINESS_PENALTY.deathPointsAtBirth - HAPPINESS_PENALTY.deathPointsPerYear * e.age,
  );
}

/** Body za úmrtí v kronice dne. */
function deathPoints(events: readonly ChronicleEvent[]): { day: number; points: number }[] {
  return events.flatMap((e) =>
    e.kind === 'death' ? [{ day: e.day, points: deathPointsFor(e) }] : [],
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
    /** Štěstí ze stravy po lidech (`dietHappiness`); chybí = nikdo nejí maso, ovoce ani med. */
    diet?: DietHappiness;
    /** Vrstva překážek – stáří a život posvátných dubů (bez ní nejmladší). */
    obstacles?: ObstacleLayer | null;
    /** Štěstí posvátného místa prémiové krajiny (`premiumSacredHappiness`); chybí = 0. */
    premiumSacred?: number;
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
    happinessFactors(
      state,
      day,
      input.satiation,
      input.diet ?? NO_DIET_HAPPINESS,
      input.obstacles ?? null,
      input.premiumSacred ?? 0,
    ),
  );
  state.happiness.value = memory.value + (target - memory.value) * DAILY_SHARE;
}

/** Polní úloha, která dnes běží: kolik práce zbývá po dnešku a kolik dní okna jí ještě zbývá. */
export interface SeasonTask {
  remaining: number;
  /** Dny okna po dnešku, v nichž se ještě smí pracovat (zimní mezera mezi úseky se nepočítá). */
  daysLeft: number;
}

/**
 * Dny okna po dnešku (D113): kolik dní úlohy v úsecích okna zbývá do konce jejího posledního úseku
 * – kopání pod jař počítá na podzim i březen a duben, mezeru mezi nimi ne (úsek, který začíná
 * dřív v roce než předchozí, patří do dalšího roku; výmlat přes Nový rok tak pokračuje lednem).
 * Mimo okno null.
 */
export function taskWindowDaysLeft(segments: readonly WindowSegment[], day: number): number | null {
  const { year, month } = dateOfDayIndex(day);
  const index = segments.findIndex(([from, to]) => month >= from && month <= to);
  if (index < 0) return null;
  const firstDay = (y: number, m: number): number => {
    // první den měsíce; za koncem světa poslední den světa + 1
    try {
      return dayIndexOf({ year: y, month: m, day: 1 });
    } catch {
      return TOTAL_GAME_DAYS;
    }
  };
  let total = 0;
  let segYear = year;
  let previousEnd = 0;
  for (let k = index; k < segments.length; k++) {
    const [from, to] = segments[k] as WindowSegment;
    if (k > index && from <= previousEnd) segYear++;
    previousEnd = to;
    const start = firstDay(segYear, from);
    const after = to === MONTHS_PER_YEAR ? firstDay(segYear + 1, 1) : firstDay(segYear, to + 1);
    total += Math.max(0, after - Math.max(start, day + 1));
  }
  return total;
}

/**
 * Dnešní tempo polní práce pro dřinu: práce polních úloh, výmlatu a seče s otavou plus práce lidí
 * na cestách (`away` v člověkodnech – výpravy, nákupy u sousedů, cesty pro kování; po návratu by
 * šla na pole). Práce venku se dává do rozdělení dne před násobkem světla dne, proto se `away`
 * násobí `daylight` – jinak by tempo v zimě nadsazovalo (D113, kolo 1).
 */
export function toilPace(
  fieldWork: readonly number[],
  threshing: number,
  mowLabor: number,
  away: number,
  daylight: number,
): number {
  return fieldWork.reduce((sum, amount) => sum + amount, threshing + mowLabor + away * daylight);
}

/**
 * Dřina (happiness.md – „ves nestihla práci v období“): ves dnes nestíhá polní práce, když by je
 * dnešním tempem (`pace` – `toilPace`: práce polních úloh, výmlatu, seče a lidí na cestách)
 * nedodělala do konce jejich oken (dny, které jim v úsecích okna zbývají – `taskWindowDaysLeft`).
 * Úlohy se řadí podle zbývajících dní a zbývající práce se sčítá – co končí dřív, musí být hotové
 * dřív (zkouška rozvrhu podle nejbližšího termínu; u úloh s různou mezerou jen přiblížení).
 */
export function isToilDay(tasks: readonly SeasonTask[], pace: number): boolean {
  const open = tasks.filter((t) => t.remaining > 1e-9).sort((a, b) => a.daysLeft - b.daysLeft);
  let cumulative = 0;
  for (const task of open) {
    cumulative += task.remaining;
    if (cumulative > pace * task.daysLeft + 1e-9) return true;
  }
  return false;
}
