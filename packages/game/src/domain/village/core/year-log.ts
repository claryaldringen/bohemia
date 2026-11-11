import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { ageGroup } from '../people/people';
import type { ConstructionKind } from '../types/types-construction';
import type { HerdSpecies } from '../types/types-livestock';
import type { VillageState } from '../types/types-state';
import { seasonCrops, sownShare } from './year-plan';

// Deník vsí (Martin 1. 11. 2026: „na tohle asi ser, podle mě bude stačit logovat hru“): za každý
// dokončený herní rok jeden řádek – čistá funkce nad stavem na konci roku. Počty událostí roku
// se čtou z kroniky (jen stav na konci roku, kronika se zkracuje po 500 událostech – řádek za
// rok s přetečenou kronikou je dolní odhad, `chronicleFull`).

/** Řádek deníku vsi za jeden herní rok. */
export interface VillageYearRow {
  /** Herní rok (např. 503). */
  year: number;
  /** Poslední den roku (index herního dne), do kterého je ves dopočtená. */
  day: number;
  adults: number;
  children: number;
  births: number;
  deaths: number;
  deathsHunger: number;
  /** Sklizeň obilí za rok (kg). */
  harvestKg: number;
  /**
   * Zásoby obilí na konci roku (kg) – vymlácené i zrno v nevymlácených snopech: výmlat běží do konce
   * února (fields.md – Pořadí důležitosti polních prací a výmlat do zimy), na konci roku je ve
   * snopech velký díl úrody.
   */
  storesKg: number;
  /** Dny roku, kdy ves hladověla (mezi `hunger-began` a `hunger-ended`). */
  hungryDays: number;
  /**
   * Výměra polí a z toho oseto (m²) – skutečně zasetý podíl prací hospodářského roku na konci roku
   * (ozim, jař připravená na podzim jen se zasetou částí); díly vybrané do plánu, na kterých setí
   * ještě nezačalo, se nepočítají (oprava 6. 11. 2026 – dřív díly ve stavu `sown` už od výběru).
   */
  fieldM2: number;
  sownM2: number;
  herds: Record<HerdSpecies, number>;
  stewardOn: boolean;
  /** Dostavěné stavby roku podle druhu (všechny, ne jen správcovy). */
  built: Partial<Record<ConstructionKind, number>>;
  /** Synové, kteří odešli na novou mapu. */
  sonsLeft: number;
  /** Pohromy roku podle druhu (hail, flood, fire, tornado). */
  disasters: Record<string, number>;
  /** Kronika měla 500 událostí – počty mohou být dolní odhad. */
  chronicleFull: boolean;
}

/** První den roku `year` (index herního dne). */
export function firstDayOfYear(year: number): number {
  return dayIndexOf({ year, month: 1, day: 1 });
}

/** Poslední den roku, ve kterém leží den `day`. */
export function lastDayOfYear(day: number): number {
  return firstDayOfYear(dateOfDayIndex(day).year + 1) - 1;
}

/**
 * Konec nejbližšího roku, který ještě není hotový po dni `lastDay`: kus dopočtu končí na
 * přelomu roku, ať je stav na konci roku k dispozici (výsledek nezávisí na kouscích).
 */
export function nextYearEnd(lastDay: number): number {
  return lastDayOfYear(lastDay + 1);
}

const CHRONICLE_FULL = 500;

/** Kusy dobytka (stáda drží i zlomky) na desetiny. */
function head(n: number | undefined): number {
  return Math.round((n ?? 0) * 10) / 10;
}
const DISASTERS = new Set(['hail', 'flood', 'fire', 'tornado']);

/**
 * Řádek deníku za rok, který končí dnem `end.lastDay` (musí být posledním dnem roku).
 */
export function villageYearRow(end: VillageState): VillageYearRow {
  const day = end.lastDay;
  const year = dateOfDayIndex(day).year;
  const from = firstDayOfYear(year);
  let adults = 0;
  let children = 0;
  for (const person of end.people) {
    if (ageGroup(person, day) === 'child') children++;
    else adults++;
  }
  let births = 0;
  let deaths = 0;
  let deathsHunger = 0;
  let harvestKg = 0;
  let sonsLeft = 0;
  let hungryDays = 0;
  const built: Partial<Record<ConstructionKind, number>> = {};
  const disasters: Record<string, number> = {};
  // hlad před začátkem roku: poslední hunger-began / hunger-ended před ním
  let hungrySince: number | null = null;
  for (const e of end.chronicle) {
    if (e.day < from) {
      if (e.kind === 'hunger-began') hungrySince = from;
      else if (e.kind === 'hunger-ended') hungrySince = null;
      continue;
    }
    if (e.day > day) continue;
    switch (e.kind) {
      case 'birth':
      case 'line-birth':
        births++;
        break;
      case 'death':
        deaths++;
        if (e.cause === 'hunger') deathsHunger++;
        break;
      case 'harvest':
        harvestKg += e.kg;
        break;
      case 'son-left-village':
        sonsLeft++;
        break;
      case 'construction-finished':
        built[e.constructionKind] = (built[e.constructionKind] ?? 0) + 1;
        break;
      case 'hunger-began':
        hungrySince ??= e.day;
        break;
      case 'hunger-ended':
        if (hungrySince !== null) hungryDays += e.day - hungrySince;
        hungrySince = null;
        break;
      default:
        if (DISASTERS.has(e.kind)) disasters[e.kind] = (disasters[e.kind] ?? 0) + 1;
    }
  }
  if (hungrySince !== null) hungryDays += day - hungrySince + 1;
  let fieldM2 = 0;
  const areaById = new Map<number, number>();
  for (const part of end.parts) {
    fieldM2 += part.areaM2;
    areaById.set(part.id, part.areaM2);
  }
  let sownM2 = 0;
  if (end.season) {
    for (const { work } of seasonCrops(end.season)) {
      let m2 = 0;
      for (const id of work.partIds) m2 += areaById.get(id) ?? 0;
      sownM2 += sownShare(work) * m2;
    }
  }
  const livestock = end.livestock?.herds;
  return {
    year,
    day,
    adults,
    children,
    births,
    deaths,
    deathsHunger,
    harvestKg: Math.round(harvestKg),
    storesKg: Math.round(end.storesKg + Math.max(0, end.sheaves?.grainKg ?? 0)),
    hungryDays,
    fieldM2: Math.round(fieldM2),
    sownM2: Math.round(sownM2),
    herds: {
      sheep: head(livestock?.sheep),
      goat: head(livestock?.goat),
      pig: head(livestock?.pig),
      cow: head(livestock?.cow),
    },
    stewardOn: end.steward?.on === true,
    built,
    sonsLeft,
    disasters,
    chronicleFull: end.chronicle.length >= CHRONICLE_FULL,
  };
}
