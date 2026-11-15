// Panel Kronika (absence.md – Návrat; Martin 8. 11. 2026: „může si přece sám zobrazit panel
// s notifikacemi a kroniku“): záznamy kroniky vsi od nejnovějších, po herních letech, po stránkách.
// Čisté funkce – server z nich skládá stránku (`chronicleForPlayer`), prohlížeč stránky spojuje.

import { CHRONICLE_MAX_EVENTS, dateOfDayIndex, type ChronicleEvent } from '@bohemia/game';
import { monthGenitive } from './game-date';
import { chronicleText, orchardRenewalText } from './village-view-chronicle';

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

function entryView(
  event: ChronicleEvent,
  villageName: string,
  seed: number | undefined,
): ChronicleEntryView {
  const date = dateOfDayIndex(event.day);
  return {
    day: event.day,
    kind: event.kind,
    dateLabel: `${date.day}. ${monthGenitive(date.month)}`,
    text: chronicleText(event, villageName, seed),
  };
}

/**
 * Zápisy, které panel neukazuje: začátek a konec hladu ze dne na den (návrh Clauda – kronika nese
 * trvalé stavy `notice-began` / `notice-ended`, absence.md – Upozornění vsi do kroniky; denní zápisy
 * hladu zůstávají pro deník vsí `year-log.ts`) a ústup pole či sadu stavbě nebo cestě (`land-taken`
 * – Martin 14. 11. 2026: „nicneříkající“; varování u kurzoru při stavbě zůstává).
 */
const HIDDEN_KINDS: ReadonlySet<ChronicleEvent['kind']> = new Set([
  'hunger-began',
  'hunger-ended',
  'land-taken',
]);

/**
 * Ukáže panel zápis? Skryté druhy (`HIDDEN_KINDS`) a návrat lidí z výjezdu domů (`people-back`
 * druhu `journey` – „1 člověk se vrátil domů z cesty.“; Martin 14. 11. 2026 ho v kronice nechce).
 * Jádro zápisy dál zapisuje – skryjí se i uložené starší (návrh Clauda).
 */
export function shownInChronicle(event: ChronicleEvent): boolean {
  if (HIDDEN_KINDS.has(event.kind)) return false;
  return !(event.kind === 'people-back' && event.away === 'journey');
}

/**
 * Stránka kroniky vsi `villageName`: roky před `ask.before`, od nejnovějšího, celé roky, dokud
 * stránka nemá aspoň CHRONICLE_PAGE_ENTRIES záznamů. Zápisy ze schránky a začátky trvalých stavů
 * mohou mít dřívější den než poslední zápis – řadí se podle dne (stejný den v pořadí zápisu).
 * `seed` – seed vsi pro jména sousedů v textech (`chronicleText`).
 */
export function chroniclePage(
  chronicle: readonly ChronicleEvent[],
  villageName: string,
  ask: ChronicleAsk,
  seed?: number,
): ChroniclePage {
  // obnovy sadů téhož dne jedním zápisem (Martin 15. 11. 2026): čtverce a sady dne dohromady
  const renewals = new Map<number, { squares: number; orchards: Set<number> }>();
  for (const event of chronicle) {
    if (event.kind !== 'orchard-renewal-started') continue;
    const day = renewals.get(event.day) ?? { squares: 0, orchards: new Set<number>() };
    day.squares += event.squares;
    day.orchards.add(event.orchardId);
    renewals.set(event.day, day);
  }
  const renewalShown = new Set<number>();
  const ordered = chronicle
    .map((event, index) => ({ event, index, year: dateOfDayIndex(event.day).year }))
    .filter((item) => shownInChronicle(item.event))
    .filter((item) => ask.before === null || item.year < ask.before)
    .sort((a, b) => b.event.day - a.event.day || b.index - a.index)
    .filter(({ event }) => {
      if (event.kind !== 'orchard-renewal-started') return true;
      if (renewalShown.has(event.day)) return false;
      renewalShown.add(event.day);
      return true;
    });
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
      const { event } = ordered[next]!;
      const entry = entryView(event, villageName, seed);
      const renewal =
        event.kind === 'orchard-renewal-started' ? renewals.get(event.day) : undefined;
      entries.push(
        renewal
          ? {
              ...entry,
              text: orchardRenewalText(villageName, renewal.squares, renewal.orchards.size),
            }
          : entry,
      );
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
