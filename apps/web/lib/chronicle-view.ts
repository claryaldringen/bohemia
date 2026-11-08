// Panel Kronika (absence.md – Návrat; Martin 8. 11. 2026: „může si přece sám zobrazit panel
// s notifikacemi a kroniku“): záznamy kroniky vsi od nejnovějších, po herních letech, po stránkách.
// Čisté funkce – server z nich skládá stránku (`chronicleForPlayer`), prohlížeč stránky spojuje.

import { CHRONICLE_MAX_EVENTS, dateOfDayIndex, type ChronicleEvent } from '@bohemia/game';
import { monthGenitive } from './game-date';
import { chronicleText } from './village-view-chronicle';

/**
 * Kolik záznamů nejméně má stránka (návrh Clauda): stránka bere celé roky, dokud nemá aspoň
 * tolik záznamů – rok se mezi stránky nedělí.
 */
export const CHRONICLE_PAGE_ENTRIES = 40;

export interface ChronicleEntryView {
  day: number;
  kind: ChronicleEvent['kind'];
  /** Den a měsíc („12. března“) – rok nese nadpis roku. */
  dateLabel: string;
  text: string;
}

export interface ChronicleYearView {
  year: number;
  /** Záznamy roku, nejnovější první. */
  entries: ChronicleEntryView[];
}

/** Stránka kroniky – celé roky, nejnovější první. */
export interface ChroniclePage {
  years: ChronicleYearView[];
  /** Starší roky jsou – další stránka se ptá na roky před tímto; null = starší nejsou. */
  olderThan: number | null;
  /**
   * Nejstarší zápisy se nedochovaly (ves drží posledních CHRONICLE_MAX_EVENTS událostí –
   * population.md, Kronika); jen na poslední stránce.
   */
  lost: boolean;
}

/** Dotaz na stránku: roky před `before` (null = od nejnovějšího). */
export interface ChronicleAsk {
  before: number | null;
}

/** Dotaz ze vstupu server action (`{ villageId, before? }`); neplatný null. */
export function parseChronicleAsk(input: unknown): ChronicleAsk | null {
  if (typeof input !== 'object' || input === null) return null;
  const before = (input as { before?: unknown }).before;
  if (before === undefined || before === null) return { before: null };
  if (typeof before !== 'number' || !Number.isSafeInteger(before) || before < 0) return null;
  return { before };
}

function entryView(event: ChronicleEvent, villageName: string): ChronicleEntryView {
  const date = dateOfDayIndex(event.day);
  return {
    day: event.day,
    kind: event.kind,
    dateLabel: `${date.day}. ${monthGenitive(date.month)}`,
    text: chronicleText(event, villageName),
  };
}

/**
 * Stránka kroniky vsi `villageName`: roky před `ask.before`, od nejnovějšího, celé roky, dokud
 * stránka nemá aspoň CHRONICLE_PAGE_ENTRIES záznamů. Zápisy ze schránky mohou přijít s dřívějším
 * dnem než poslední zápis – řadí se podle dne (stejný den v pořadí zápisu).
 */
export function chroniclePage(
  chronicle: readonly ChronicleEvent[],
  villageName: string,
  ask: ChronicleAsk,
): ChroniclePage {
  const ordered = chronicle
    .map((event, index) => ({ event, index, year: dateOfDayIndex(event.day).year }))
    .filter((item) => ask.before === null || item.year < ask.before)
    .sort((a, b) => b.event.day - a.event.day || b.index - a.index);
  const years: ChronicleYearView[] = [];
  let count = 0;
  let next = 0;
  while (next < ordered.length) {
    const year = ordered[next]!.year;
    if (count >= CHRONICLE_PAGE_ENTRIES) {
      return { years, olderThan: years.at(-1)!.year, lost: false };
    }
    const entries: ChronicleEntryView[] = [];
    while (next < ordered.length && ordered[next]!.year === year) {
      entries.push(entryView(ordered[next]!.event, villageName));
      next++;
    }
    years.push({ year, entries });
    count += entries.length;
  }
  return {
    years,
    olderThan: null,
    lost:
      chronicle.length >= CHRONICLE_MAX_EVENTS &&
      !chronicle.some((event) => event.kind === 'village-founded'),
  };
}

/** Přidá starší stránku pod zobrazené roky. */
export function appendOlder(shown: ChroniclePage, older: ChroniclePage): ChroniclePage {
  const last = shown.years.at(-1)?.year;
  return {
    years: [...shown.years, ...older.years.filter((y) => last === undefined || y.year < last)],
    olderThan: older.olderThan,
    lost: older.lost,
  };
}

/**
 * Nová první stránka (přibyl zápis) nad už zobrazenými staršími roky: roky z nové stránky
 * nahradí tytéž roky, starší načtené roky zůstanou.
 */
export function mergeNewest(shown: ChroniclePage | null, fresh: ChroniclePage): ChroniclePage {
  const oldestFresh = fresh.years.at(-1)?.year;
  if (!shown || oldestFresh === undefined) return fresh;
  const older = shown.years.filter((y) => y.year < oldestFresh);
  if (older.length === 0) return fresh;
  return { years: [...fresh.years, ...older], olderThan: shown.olderThan, lost: shown.lost };
}
