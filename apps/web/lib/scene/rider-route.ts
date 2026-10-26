// Jezdci a objížďka (horses.md – Kdy a kam se jezdí, dokud není lov; Ve scéně): trasa jízdy dne –
// objížďka okraje polí, v zimě kratší okruh kolem vsi, jízda po zemské stezce k hranici mapy – a kde
// je jezdec ve vzdálenosti s. Čisté funkce bez Babylonu; poloha je čistá funkce skutečného času
// (`rideDistance`) jako u ostatních postav. Kdo, kdy a na kterém koni jede, určuje jádro.
import { inSquare, squareCorners } from './villager-plan-geometry';
import type { Point, Square } from './villager-plan-types';

/**
 * Tempo (m/s skutečného času, postavy chodí 1 m/s – horses.md, návrh Clauda): krokem, na louce kus
 * klusem.
 */
export const RIDE_PACE = { walk: 1.5, trot: 3 } as const;
/** Jezdci jezdí pohromadě – skupina nejvýš tolika (horses.md). */
export const RIDE_GROUP = 4;
/** Objížďka vede tak daleko za krajními poli (m) – po mezi a louce, ne přes osetý čtverec. */
export const RING_MARGIN_M = 5;
/** V zimě se sněhem kratší okruh kolem vsi – tak daleko od obydlí (m; návrh Clauda). */
export const WINTER_RING_M = 14;
/** Krok kontroly trasy (m). */
const CHECK_M = 1;
/** Rezerva kontroly – trasa nesmí blíž k čtverci pole (m). */
const FIELD_CLEAR_M = 0.3;
/** Kolikrát se okruh nejvýš rozšíří o pole, které by protnul. */
const RING_PASSES = 24;
/** Kolik nejbližších vrcholů okruhu se zkusí jako vjezd od kůlu u brány. */
const ENTRY_TRIES = 16;

/** Trasa jízdy – od kůlu u brány a zpět k němu; po `period` s jede znovu. */
export interface RideRoute {
  points: readonly Point[];
  /** Tempo úseku z bodu i do i + 1 (m/s). */
  pace: readonly number[];
  /** Vzdálenost od začátku k bodu i (m). */
  lengths: readonly number[];
  /** Čas od začátku k bodu i (s). */
  times: readonly number[];
  /** Délka (m) a doba (s) celé jízdy. */
  length: number;
  period: number;
}

/** Kde je jezdec: poloha, směr jízdy a tempo úseku (m/s). */
export interface RideSpot {
  x: number;
  z: number;
  headingX: number;
  headingZ: number;
  pace: number;
}

/** Úsek cesty od a do b (body od a do b – po pěšinách, kolem domů), nebo null. */
export type RideLeg = (a: Point, b: Point) => readonly Point[] | null;

/** Rovně – bez pěšin (ukázky, testy). */
export const straightLeg: RideLeg = (a, b) => [a, b];

/** Jezdci po skupinách nejvýš `RIDE_GROUP` – v pořadí, vojvoda vede první. */
export function rideGroups<T>(riders: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < riders.length; i += RIDE_GROUP) groups.push(riders.slice(i, i + RIDE_GROUP));
  return groups;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/** Konvexní obal (monotónní řetězec) proti směru hodinových ručiček. */
function hull(points: readonly Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (p.length < 3) return p;
  const chain = (list: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) {
        out.pop();
      }
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...chain(p), ...chain([...p].reverse())];
}

/** Osmiúhelník o poloměru r kolem bodu – obal z nich je obal bodů rozšířený o ≈ r. */
function around(p: Point, r: number): Point[] {
  return Array.from({ length: 8 }, (_, k) => ({
    x: p.x + Math.cos((k * Math.PI) / 4) * r,
    z: p.z + Math.sin((k * Math.PI) / 4) * r,
  }));
}

/** Body lomené čáry po `CHECK_M` (i koncové); `closed` – i úsek z posledního do prvního. */
function samples(points: readonly Point[], closed: boolean): Point[] {
  const list = closed && points.length > 0 ? [...points, points[0]!] : points;
  const out: Point[] = list.length > 0 ? [list[0]!] : [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]!;
    const b = list[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / CHECK_M));
    for (let k = 1; k <= steps; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
    }
  }
  return out;
}

/** Vede lomená čára přes některé pole (čtverec dílu)? `closed` – i úsek zpět k prvnímu bodu. */
export function crossesField(
  points: readonly Point[],
  fields: readonly Square[],
  closed = false,
): boolean {
  return samples(points, closed).some((p) =>
    fields.some((f) => inSquare(f, p.x, p.z, FIELD_CLEAR_M)),
  );
}

/**
 * Okruh objížďky (horses.md – Denní objížďka): obal bodů `seeds` (rohy polí a obydlí; v zimě jen
 * obydlí) rozšířený o `margin` – po mezi a louce za krajními poli. Pole, které by okruh protnul, se
 * přidá do obalu, takže okruh nikdy nevede přes pole. Bez bodů prázdný.
 */
export function fieldRing(
  fields: readonly Square[],
  seeds: readonly Point[],
  margin = RING_MARGIN_M,
): Point[] {
  const base: Point[] = [...seeds];
  const added = new Set<number>();
  let ring: Point[] = [];
  for (let pass = 0; pass < RING_PASSES; pass++) {
    ring = hull(base.flatMap((p) => around(p, margin)));
    if (ring.length < 3) return [];
    const ringSamples = samples(ring, true);
    const hit = fields
      .map((f, i) => ({ f, i }))
      .filter(
        ({ f, i }) =>
          !added.has(i) && ringSamples.some((p) => inSquare(f, p.x, p.z, FIELD_CLEAR_M)),
      );
    if (hit.length === 0) return ring;
    for (const { f, i } of hit) {
      added.add(i);
      for (const [x, z] of squareCorners(f)) base.push({ x, z });
    }
  }
  return ring;
}

/** Trasa z bodů a temp úseků – nulové úseky vynechá. */
function buildRoute(points: readonly Point[], pace: readonly number[]): RideRoute | null {
  const kept: Point[] = [];
  const keptPace: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const last = kept[kept.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 1e-6) continue;
    if (last) keptPace.push(pace[i - 1] ?? RIDE_PACE.walk);
    kept.push(p);
  }
  if (kept.length < 2) return null;
  const lengths = [0];
  const times = [0];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1]!;
    const b = kept[i]!;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    lengths.push(lengths[i - 1]! + d);
    times.push(times[i - 1]! + d / keptPace[i - 1]!);
  }
  return {
    points: kept,
    pace: keptPace,
    lengths,
    times,
    length: lengths[lengths.length - 1]!,
    period: times[times.length - 1]!,
  };
}

/** Tam a zpět: body `way` (od kůlu), pak `middle`, pak `way` pozpátku; tempa úseků. */
function outAndBack(
  way: readonly Point[],
  middle: readonly Point[],
  middlePace: readonly number[],
): RideRoute | null {
  const back = [...way].reverse();
  const points = [...way, ...middle.slice(1), ...back.slice(1)];
  const pace = [
    ...way.slice(1).map(() => RIDE_PACE.walk),
    ...middlePace,
    ...back.slice(1).map(() => RIDE_PACE.walk),
  ];
  return buildRoute(points, pace);
}

/**
 * Denní objížďka (horses.md – Kdy a kam se jezdí): od kůlu u brány k nejbližšímu vrcholu okruhu,
 * kam vede cesta mimo pole (`leg` – po pěšinách), kolem dokola a stejnou cestou zpět. Krokem, na
 * nejdelším rovném úseku okruhu (louka za poli) klusem. Bez okruhu nebo cesty k němu null.
 */
export function loopRoute(
  hitch: Point,
  ring: readonly Point[],
  fields: readonly Square[],
  leg: RideLeg = straightLeg,
): RideRoute | null {
  if (ring.length < 3) return null;
  const order = ring
    .map((p, i) => ({ i, d: Math.hypot(p.x - hitch.x, p.z - hitch.z) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, ENTRY_TRIES);
  for (const { i } of order) {
    const found = leg(hitch, ring[i]!);
    if (!found || found.length < 2) continue;
    const way = [hitch, ...found.slice(1, -1), ring[i]!];
    if (crossesField(way, fields)) continue;
    const loop = [...ring.slice(i), ...ring.slice(0, i), ring[i]!];
    const lengths = loop.slice(1).map((q, k) => Math.hypot(q.x - loop[k]!.x, q.z - loop[k]!.z));
    const longest = lengths.indexOf(Math.max(...lengths));
    const pace = lengths.map((_, k) => (k === longest ? RIDE_PACE.trot : RIDE_PACE.walk));
    return outAndBack(way, loop, pace);
  }
  return null;
}

/**
 * Jízda k hranici a doprovod výpravy (horses.md – Kdy a kam se jezdí): od kůlu na začátek zemské
 * stezky (`leg`), po ní krokem ke kraji mapy a zpět. Bez stezky null.
 */
export function trailRoute(
  hitch: Point,
  trail: readonly Point[],
  fields: readonly Square[],
  leg: RideLeg = straightLeg,
): RideRoute | null {
  if (trail.length < 2) return null;
  const found = leg(hitch, trail[0]!);
  const way = found && found.length >= 2 ? [hitch, ...found.slice(1, -1), trail[0]!] : null;
  if (!way || crossesField(way, fields)) return null;
  const middle = [...trail, ...[...trail].reverse().slice(1)];
  return outAndBack(
    way,
    middle,
    middle.slice(1).map(() => RIDE_PACE.walk),
  );
}

/**
 * Tempo lovu (m/s; wildlife.md – Ve scéně, návrh Clauda): cesta k okraji lesa trvá nejvýš 70 %
 * půlky bloku lovu – den má 86 s, krokem by lovci les nikdy neviděli –, jezdci nejvýš cvalem,
 * pěší nejvýš poklusem (dál než ≈ 100 m les pěší nestihnou a v půlce bloku se otočí). V lese krokem (`sweep`); pěší se zastavují s oštěpem (`stop` – úsek
 * `HUNT_STOP_M` tak pomalu, že stojí, scéna hraje `spear-thrust`).
 */
export const HUNT_PACE = {
  ride: { min: RIDE_PACE.walk, max: 6, sweep: RIDE_PACE.walk },
  foot: { min: 1.0, max: 3.2, sweep: 0.9 },
  stop: 0.05,
} as const;
/** Podíl půlky bloku lovu na cestu k lesu. */
export const HUNT_WAY_SHARE = 0.7;
/** Lovci v lese chodí podél okraje tak daleko na každou stranu (m) a tak hluboko do lesa (m). */
export const HUNT_SWEEP_M = { along: 22, inward: 6 } as const;
/** Zastávka pěšího lovce (m úseku pomalým tempem `HUNT_PACE.stop` ≈ 6 s). */
export const HUNT_STOP_M = 0.3;

/**
 * Trasa lovu (wildlife.md – Ve scéně): `way` od kůlu u brány k okraji lesa (tempo, aby cesta trvala
 * `HUNT_WAY_SHARE` z `halfS` s, v mezích `HUNT_PACE`), pak sem a tam podél okraje lesa (`sweep` –
 * body A a B, krokem; pěší na krajích stojí s oštěpem), dokud trasa nepřesáhne `halfS` – jízda
 * v bloku (`rideState`) jede půlku bloku tam a pak po téže trase zpět, takže se nikdy nepřetočí
 * na začátek. Bez cesty null.
 */
export function huntRoute(
  way: readonly Point[],
  sweep: readonly [Point, Point] | null,
  foot: boolean,
  halfS: number,
): RideRoute | null {
  if (way.length < 2) return null;
  const pace = foot ? HUNT_PACE.foot : HUNT_PACE.ride;
  let length = 0;
  for (let i = 1; i < way.length; i++) {
    length += Math.hypot(way[i]!.x - way[i - 1]!.x, way[i]!.z - way[i - 1]!.z);
  }
  const speed = Math.min(
    pace.max,
    Math.max(pace.min, length / Math.max(1, HUNT_WAY_SHARE * halfS)),
  );
  const points: Point[] = [...way];
  const paces: number[] = way.slice(1).map(() => speed);
  const edge = way[way.length - 1]!;
  let time = length / speed;
  if (sweep) {
    const stop = (p: Point, to: Point): Point => {
      const d = Math.hypot(to.x - p.x, to.z - p.z) || 1;
      return {
        x: p.x + ((to.x - p.x) / d) * HUNT_STOP_M,
        z: p.z + ((to.z - p.z) / d) * HUNT_STOP_M,
      };
    };
    // A, (zastávka), okraj, B, (zastávka), okraj … dokud trasa nepokryje půlku bloku
    for (let k = 0; time < halfS && k < 64; k++) {
      const end = sweep[k % 2]!;
      const leg = Math.hypot(end.x - edge.x, end.z - edge.z);
      if (leg < 1e-3) break;
      points.push(end);
      paces.push(pace.sweep);
      time += leg / pace.sweep;
      if (foot) {
        points.push(stop(end, edge));
        paces.push(HUNT_PACE.stop);
        time += HUNT_STOP_M / HUNT_PACE.stop;
      }
      points.push(edge);
      paces.push(pace.sweep);
      time += leg / pace.sweep;
    }
  }
  return buildRoute(points, paces);
}

/** Kolik metrů trasy jezdec ujel v čase `t` (s skutečného času) – po celé jízdě znovu od kůlu. */
export function rideDistance(route: RideRoute, t: number): number {
  const tau = ((t % route.period) + route.period) % route.period;
  const { times, lengths, pace } = route;
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= tau) lo = mid;
    else hi = mid;
  }
  return lengths[lo]! + (tau - times[lo]!) * pace[lo]!;
}

/** Kde je jezdec ve vzdálenosti `s` (m, dokola po trase) – do `out`. */
export function rideSpot(route: RideRoute, s: number, out: RideSpot): RideSpot {
  const d = ((s % route.length) + route.length) % route.length;
  const { lengths, points } = route;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[lo + 1]!;
  const span = lengths[lo + 1]! - lengths[lo]!;
  const f = span > 0 ? (d - lengths[lo]!) / span : 0;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  const n = span > 0 ? span : 1;
  out.headingX = (b.x - a.x) / n;
  out.headingZ = (b.z - a.z) / n;
  out.pace = route.pace[lo]!;
  return out;
}
