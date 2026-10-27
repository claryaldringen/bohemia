// Počasí roku kraje (disasters.md – Počasí roku – kraj): čistá funkce seedu počasí mapy a roku.
// Žádný sdílený stav mezi vsemi – každá ves nese kopii seedu své mapy a počítá totéž počasí sama.

import { dateOfDayIndex, monthLength } from '../calendar';
import { createRandom, deriveSeed } from '../landscape/random';
import { FLOOD_WATER, WEATHER, type MonthDay } from './rules-disasters';
import type { ChronicleEvent } from './types-chronicle';
import type {
  RegionFlood,
  RevealedWeather,
  SummerWeather,
  WinterWeather,
  YearWeather,
} from './types-disasters';
import type { VillageState } from './types-state';

/** Pevné pořadí losu – mění se jen s novou verzí pravidel (jinak se změní počasí všech map). */
const SUMMER_ORDER: readonly SummerWeather[] = [
  'good',
  'normal',
  'dry',
  'drought',
  'wet',
  'wetHarvest',
];
const WINTER_ORDER: readonly WinterWeather[] = ['normal', 'blackFrost', 'long'];

const BAD_SUMMERS: ReadonlySet<SummerWeather> = new Set(WEATHER.badSummers);
const CRUEL_SUMMERS: ReadonlySet<SummerWeather> = new Set(WEATHER.cruelSummers);
/** Zlé zimy – všechny kromě normální; po zlém létě se shlukují jako zlá léta. */
const BAD_WINTERS: ReadonlySet<WinterWeather> = new Set(['blackFrost', 'long']);

/** Dlouhodobý podíl zlých let (disasters.md – Léto, tabulka: 10 + 4 + 11 + 4 %). */
const BAD_SUMMER_SHARE = WEATHER.badSummers.reduce((sum, s) => sum + WEATHER.summerChances[s], 0);
/**
 * Násobek šancí zlých let v roce po létě, které zlé nebylo – s ×`clusterFactor` po zlém létě
 * dá dlouhodobě přesně četnosti z tabulky (návrh Clauda): p = t ÷ (1 + (k − 1) × podíl zlých).
 */
const CALM = 1 / (1 + (WEATHER.clusterFactor - 1) * BAD_SUMMER_SHARE);

/** Váhy losu: zlé položky × násobek, normální dorovná na 1. `afterBad` null = dlouhodobé. */
function weights<K extends string>(
  table: Record<K, number>,
  order: readonly K[],
  bad: ReadonlySet<K>,
  afterBad: boolean | null,
): number[] {
  const factor = afterBad === null ? 1 : CALM * (afterBad ? WEATHER.clusterFactor : 1);
  const list = order.map((k) => (bad.has(k) ? table[k] * factor : table[k]));
  const normal = order.indexOf('normal' as K);
  const others = list.reduce((sum, w, i) => (i === normal ? sum : sum + w), 0);
  list[normal] = 1 - others;
  return list;
}

type History = 'any' | 'afterBad' | 'afterCalm';
const historyKey = (afterBad: boolean | null): History =>
  afterBad === null ? 'any' : afterBad ? 'afterBad' : 'afterCalm';

function weightsByHistory<K extends string>(
  table: Record<K, number>,
  order: readonly K[],
  bad: ReadonlySet<K>,
): Record<History, number[]> {
  return {
    any: weights(table, order, bad, null),
    afterBad: weights(table, order, bad, true),
    afterCalm: weights(table, order, bad, false),
  };
}

const SUMMER_WEIGHTS = weightsByHistory(WEATHER.summerChances, SUMMER_ORDER, BAD_SUMMERS);
const WINTER_WEIGHTS = weightsByHistory(WEATHER.winterChances, WINTER_ORDER, BAD_WINTERS);
const FLOOD_WEIGHTS = FLOOD_WATER.levels.map((l) => l.chance);

/** Index podle kumulovaných vah (u z [0, 1)); zaokrouhlení na konci padne na poslední. */
function pick(u: number, list: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum += list[i] ?? 0;
    if (u < sum) return i;
  }
  return list.length - 1;
}

function drawSummer(weatherSeed: number, year: number, afterBad: boolean | null): SummerWeather {
  const u = createRandom(deriveSeed(weatherSeed, 'summer:' + year)).next();
  return SUMMER_ORDER[pick(u, SUMMER_WEIGHTS[historyKey(afterBad)])] ?? 'normal';
}

function drawWinter(weatherSeed: number, year: number, afterBad: boolean | null): WinterWeather {
  const u = createRandom(deriveSeed(weatherSeed, 'winter:' + year)).next();
  return WINTER_ORDER[pick(u, WINTER_WEIGHTS[historyKey(afterBad)])] ?? 'normal';
}

/** Pořadí dne v roce (1. 1. = 1). */
function ordinal(year: number, md: MonthDay): number {
  let n = md.day;
  for (let m = 1; m < md.month; m++) n += monthLength(year, m);
  return n;
}

/** Den okna `from`–`to` (včetně) podle `u` z [0, 1). */
function dayInWindow(year: number, from: MonthDay, to: MonthDay, u: number): MonthDay {
  const first = ordinal(year, from);
  let day = first + Math.floor(u * (ordinal(year, to) - first + 1));
  let month = 1;
  while (day > monthLength(year, month)) {
    day -= monthLength(year, month);
    month++;
  }
  return { month, day };
}

/**
 * Roční nejvyšší voda kraje (disasters.md – Povodeň potoka; Martin 27. 10. 2026: „Ano a ano“):
 * stupeň podle doby návratu, o stupeň výš po dlouhé zimě nebo v deštivém létě (obojí jen o jeden);
 * jarní po dlouhé zimě, letní v deštivém létě, jinak půl na půl; den v okně.
 */
function regionFlood(
  weatherSeed: number,
  year: number,
  summer: SummerWeather,
  winter: WinterWeather,
): RegionFlood | null {
  const random = createRandom(deriveSeed(weatherSeed, 'flood:' + year));
  const levelDraw = random.next();
  const seasonDraw = random.next();
  const dayDraw = random.next();
  const longWinter = winter === 'long';
  const wetSummer = summer === 'wet' || summer === 'wetHarvest';
  let index = pick(levelDraw, FLOOD_WEIGHTS);
  if (longWinter || wetSummer) index = Math.min(index + 1, FLOOD_WATER.levels.length - 1);
  const rule = FLOOD_WATER.levels[index];
  if (!rule || rule.level === null) return null;
  const season: RegionFlood['season'] =
    longWinter !== wetSummer
      ? longWinter
        ? 'spring'
        : 'summer'
      : seasonDraw < FLOOD_WATER.springShare
        ? 'spring'
        : 'summer';
  const window = season === 'spring' ? FLOOD_WATER.springWindow : FLOOD_WATER.summerWindow;
  const { month, day } = dayInWindow(year, window.from, window.to, dayDraw);
  return { level: rule.level, heightM: rule.heightM, season, month, day };
}

/** Počasí map podle seedu a roku – drží jen čisté výsledky, žádný stav vsi. */
const memo = new Map<string, YearWeather>();
const MEMO_MAX = 20_000;

/**
 * Počasí roku kraje – čistá funkce seedu počasí mapy a roku (disasters.md – Počasí roku – kraj).
 * Zlé roky se shlukují: po zlém létě jsou šance zlých lét a zim ×1,25. Historie sahá
 * `historyYears` let zpět (ten rok má dlouhodobé četnosti) – O(1) a stejné pro všechny vsi
 * kraje. Vrácený objekt je sdílený a zmrazený.
 */
export function yearWeather(weatherSeed: number, year: number): YearWeather {
  const key = `${weatherSeed}:${year}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let afterBad: boolean | null = null;
  for (let y = year - WEATHER.historyYears; y < year; y++) {
    afterBad = BAD_SUMMERS.has(drawSummer(weatherSeed, y, afterBad));
  }
  const summer = drawSummer(weatherSeed, year, afterBad);
  const winter = drawWinter(weatherSeed, year, afterBad);
  const flood = regionFlood(weatherSeed, year, summer, winter);
  const weather: YearWeather = Object.freeze({
    year,
    summer,
    winter,
    flood: flood && Object.freeze(flood),
  });
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(key, weather);
  return weather;
}

/** Zlé léto – sucho nebo déšť (disasters.md – Léto, Zlé roky se shlukují). */
export function isBadSummer(summer: SummerWeather): boolean {
  return BAD_SUMMERS.has(summer);
}

/** Krutý rok – kruté sucho, mokré žně, nebo holomráz se zlým létem (disasters.md – Co z toho plyne). */
export function isCruelYear(weather: Pick<YearWeather, 'summer' | 'winter'>): boolean {
  return (
    CRUEL_SUMMERS.has(weather.summer) ||
    (weather.winter === 'blackFrost' && BAD_SUMMERS.has(weather.summer))
  );
}

/**
 * Počasí roku vsi: z kopie seedu počasí mapy; ves bez `weatherSeed` (testy, kalibrace) má
 * normální rok bez vody. Vynucené počasí (`disasters.override` – jen testy a dev) přebije
 * uvedené části; shlukování dalších let se řídí losem, ne přepisem.
 */
export function weatherOf(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  year: number,
): YearWeather {
  const drawn: YearWeather =
    state.weatherSeed === undefined
      ? { year, summer: 'normal', winter: 'normal', flood: null }
      : yearWeather(state.weatherSeed, year);
  const forced = state.disasters?.override?.weather?.[year];
  return forced ? { ...drawn, ...forced, year } : drawn;
}

const seenBy = (date: MonthDay, md: MonthDay): boolean =>
  date.month > md.month || (date.month === md.month && date.day >= md.day);

/**
 * Počasí roku dne `day`, které už je vidět (disasters.md – Léto, Zima, „Kdy je vidět“) – klient
 * nikdy nedostane budoucí počasí ani seed. Mokré žně jsou do 15. 7. vidět jako deštivé léto.
 */
export function revealedWeather(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): RevealedWeather {
  const date = dateOfDayIndex(day);
  const weather = weatherOf(state, date.year);
  const seen: RevealedWeather = { year: date.year };
  if (seenBy(date, WEATHER.winterRevealed[weather.winter])) seen.winter = weather.winter;
  if (seenBy(date, WEATHER.summerRevealed[weather.summer])) {
    const wetHarvestSeen = seenBy(date, WEATHER.wetHarvestRevealed);
    seen.summer = weather.summer === 'wetHarvest' && !wetHarvestSeen ? 'wet' : weather.summer;
  }
  if (weather.flood && seenBy(date, weather.flood)) seen.flood = weather.flood;
  return seen;
}

/**
 * Den počasí (krok za `wildlifeYearDay`): v den odhalení zlé zimy nebo neobvyklého léta zápis
 * do kroniky (1. 2. holomráz, 1. 3. dlouhá zima, 1. 5. sucho, 1. 6. dobré nebo deštivé léto,
 * 15. 7. mokré žně). Stav nemění – kroniku přidá volající.
 */
export function weatherDay(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): ChronicleEvent[] {
  if (state.weatherSeed === undefined && state.disasters?.override?.weather === undefined) {
    return [];
  }
  const date = dateOfDayIndex(day);
  const weather = weatherOf(state, date.year);
  const isToday = (md: MonthDay): boolean => date.month === md.month && date.day === md.day;
  const events: ChronicleEvent[] = [];
  if (weather.winter !== 'normal' && isToday(WEATHER.winterRevealed[weather.winter])) {
    events.push({ day, kind: 'weather', winter: weather.winter });
  }
  if (weather.summer !== 'normal' && isToday(WEATHER.summerRevealed[weather.summer])) {
    events.push({
      day,
      kind: 'weather',
      summer: weather.summer === 'wetHarvest' ? 'wet' : weather.summer,
    });
  }
  if (weather.summer === 'wetHarvest' && isToday(WEATHER.wetHarvestRevealed)) {
    events.push({ day, kind: 'weather', summer: 'wetHarvest' });
  }
  return events;
}

/**
 * Ves dostane kopii seedu počasí své mapy (převod starších vsí a nová ves – disasters.md, Kraj).
 * Idempotentní; seed se řídí mapou (ves na jiné mapě dostane její seed). Bez seedu mapy (null –
 * testy, kalibrace) beze změny.
 */
export function withWeatherSeed(state: VillageState, weatherSeed: number | null): VillageState {
  if (weatherSeed === null || state.weatherSeed === weatherSeed) return state;
  return { ...state, weatherSeed };
}
