import { WATER_FETCHING, woodErrandTrips } from '@bohemia/game';
import type { SceneLabor, SceneLaborHome } from '../village-view';

// Provoz na cestách (docs/design/villagers.md – Provoz na cestách; Martin 19. 10. 2026: „Chci
// vidět vesničany, jak chodí pro vodu nebo na pole.“): kolik lidí je teď na cestě pro vodu,
// k lesu pro dřevo a mezi domem a polem. Jen vzhled, žádná pravidla – počty z cest za den
// v simulaci (WATER_FETCHING, cesty pro dřevo sítě pěšin, práce na poli), čistá funkce.
//
// Herní den trvá ≈ 86 s, cesta k vodě skutečnou chůzí ≈ 10–15 minut – kdyby každá cesta dne šla
// celá, byla by na cestě stovka lidí. Provoz se proto počítá jako proud (Littlův zákon): cesty
// za den vycházejí rovnoměrně za TRAFFIC_DAY_S skutečných sekund, na cestě je tedy
// cesty × doba cesty ÷ TRAFFIC_DAY_S lidí – u vzdáleného potoka víc, u blízkého méně, počet
// úměrný cestám v simulaci. Celkem nejvýš MAX_TRAFFIC postav.

/**
 * Za kolik skutečných sekund vyjdou všechny cesty jednoho dne (návrh Clauda – proud lidí bez
 * davů: Vlkov s 28 lidmi a vodou ≈ 500 m chůze má na cestě k vodě ≈ 8 lidí, na každých ≈ 120 m
 * cesty tam a zpět jeden).
 */
export const TRAFFIC_DAY_S = 900;
/** Nejvýš tolik postav na cestách – víc se jich zmenší poměrně (výkon – villagers.md). */
export const MAX_TRAFFIC = 24;
/** Cest na pole a zpět za den na člověkoden polní práce (ráno tam, večer zpět = jedna). */
export const FIELD_TRIPS_PER_MAN_DAY = 1;

/** Druh cesty: pro vodu, k lesu pro dřevo, na pole. */
export type TrafficKind = 'water' | 'wood' | 'field';

/** Jeden proud lidí po jedné trase: kolik cest za den a jak dlouho trvá jedna (s, v pohybu). */
export interface TrafficStream {
  kind: TrafficKind;
  trips: number;
  activeS: number;
}

/**
 * Cesty pro vodu domácnosti za den: WATER_FETCHING.tripsPerPerson na člověka; co přivezl vůz
 * v sudech (`cartWater` 0–1), pěšky nikdo nenese.
 */
export function waterTrips(home: Pick<SceneLaborHome, 'people' | 'cartWater'>): number {
  const cart = Math.min(1, Math.max(0, home.cartWater ?? 0));
  return WATER_FETCHING.tripsPerPerson * Math.max(0, home.people) * (1 - cart);
}

/** Cesty k lesu pro dřevo domácnosti za den (léto / zima – jako síť pěšin). */
export function woodTrips(month: number): number {
  return woodErrandTrips(month);
}

/**
 * Domácnosti pro provoz: z rozdělení práce (`SceneLabor.homes`), u dřívějšího pohledu lidé vsi
 * rovným dílem na obydlí `homeIds`.
 */
export function trafficHomes(
  labor: Pick<SceneLabor, 'homes' | 'people'>,
  homeIds: readonly number[],
): SceneLaborHome[] {
  if (labor.homes) return labor.homes.filter((h) => homeIds.includes(h.id));
  if (homeIds.length === 0) return [];
  const all = labor.people.children + labor.people.adults + labor.people.elders;
  return homeIds.map((id) => ({ id, people: all / homeIds.length }));
}

/** Lidí na cestě v proudu (necelé číslo): cesty × doba cesty ÷ TRAFFIC_DAY_S. */
export function streamLoad(stream: Pick<TrafficStream, 'trips' | 'activeS'>): number {
  return (Math.max(0, stream.trips) * Math.max(0, stream.activeS)) / TRAFFIC_DAY_S;
}

/** Druh cesty s menším počtem lidí na cestě (všechny proudy) nemá nikoho – jen zaokrouhlení. */
export const MIN_STREAM_LOAD = 0.1;

/**
 * Kolik postav dostane který proud: lidé na cestě (`streamLoad`), celkem zaokrouhleně, nejvýš
 * `max` (pak poměrně méně), rozdělené metodou největších zbytků (při shodě dřívější proud). Každý
 * druh cesty, po které někdo chodí (všechny jeho proudy aspoň MIN_STREAM_LOAD), má na cestě aspoň
 * jednoho člověka – v nejvytíženějším proudu druhu (Martin chce vidět, kdo kam chodí); přes `max`
 * se ubere z proudu s nejvíc lidmi.
 */
export function trafficCounts(
  streams: readonly Pick<TrafficStream, 'kind' | 'trips' | 'activeS'>[],
  max: number = MAX_TRAFFIC,
): number[] {
  const loads = streams.map(streamLoad);
  const sum = loads.reduce((a, b) => a + b, 0);
  const total = Math.min(max, Math.round(sum));
  const counts = loads.map(() => 0);
  if (total > 0 && sum > 0) {
    const exact = loads.map((l) => (l * total) / sum);
    exact.forEach((e, i) => (counts[i] = Math.floor(e)));
    let left = total - counts.reduce((a, b) => a + b, 0);
    const order = exact
      .map((e, i) => ({ i, rest: e - Math.floor(e) }))
      .sort((a, b) => b.rest - a.rest || a.i - b.i);
    for (const { i } of order) {
      if (left <= 0) break;
      counts[i] = counts[i]! + 1;
      left--;
    }
  }
  for (const kind of ['water', 'wood', 'field'] as const) {
    let best = -1;
    let load = 0;
    streams.forEach((s, i) => {
      if (s.kind !== kind) return;
      load += loads[i]!;
      if (best < 0 || loads[i]! > loads[best]!) best = i;
    });
    if (best < 0 || load < MIN_STREAM_LOAD) continue;
    if (streams.some((s, i) => s.kind === kind && counts[i]! > 0)) continue;
    const used = counts.reduce((a, b) => a + b, 0);
    if (used >= max) {
      const donor = counts.reduce((d, c, i) => (c > 1 && (d < 0 || c > counts[d]!) ? i : d), -1);
      if (donor < 0) continue;
      counts[donor] = counts[donor]! - 1;
    }
    counts[best] = counts[best]! + 1;
  }
  return counts;
}

/** Zlatý řez – fáze lidí v proudu se rozestoupí rovnoměrně při jakémkoli počtu. */
const GOLDEN = 0.6180339887498949;

/**
 * Fáze `k`-tého člověka v proudu (0–1): posloupnost se zlatým řezem od `base` – přibude-li člověk,
 * ostatní zůstanou, kde byli, a rozestupy jsou i tak skoro stejné.
 */
export function streamPhase(k: number, base: number): number {
  const v = base + k * GOLDEN;
  return v - Math.floor(v);
}
