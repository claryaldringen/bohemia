// Zánik kusů cest: zarostlé kusy (stav na nule) a kus pod hotovou stavbou (paths.md – Zarůstání,
// Stavba přes cestu). Stav kusů a jeho sčítání: `road-condition.ts`.

import { ROADS, ROAD_TREES } from '../rules';
import {
  type ChronicleEvent,
  type Construction,
  type Road,
  type Trail,
  type VillageRoads,
} from '../types';
import { conditionOf, fixedRoadIds, roadPieces } from './road-condition';
import {
  MIN_ROAD_M,
  axisDistance,
  axisSlice,
  groundPart,
  lengthsAlong,
  resample,
} from './roads-geometry';

/** Úsek osy a co s ním: žije, je opuštěný (pod stavbou), nebo zmizel. */
interface Segment {
  a: number;
  b: number;
  kind: 'alive' | 'abandoned' | 'gone';
}

/** Sousední úseky téhož druhu se spojí. */
function mergeSegments(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind) last.b = s.b;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Rozřízne úsek na `segments` (celá osa, mutuje): živé a opuštěné zbytky zůstanou úseky (první
 * živý se starým id a dnem vzniku, další s novým id), zmizelé kusy pryč. Místa na stromy a jabloně
 * jdou k nejbližšímu živému zbytku (místa zmizelého a opuštěného kusu pryč – stromy na nich stojí
 * dál), stav kusů a mokřina s brody po kusech. Konce živého zbytku u řezu jsou volné (`openEnds`,
 * `VillageRoads.cutEnds`). Vrátí id zmizelých kusů (nová id – pro kroniku).
 */
function reshapeRoad(roads: VillageRoads, road: Road, segments: readonly Segment[]): number[] {
  const length = segments[segments.length - 1]!.b;
  const gone: number[] = [];
  const kept: Segment[] = [];
  for (const s of segments) {
    if (s.kind === 'gone') gone.push(roads.nextId++);
    else kept.push(s);
  }
  // první živý zbytek si nechá id cesty, jinak (jen opuštěné) první zbytek
  const heir = kept.findIndex((s) => s.kind === 'alive');
  const made: Road[] = kept.map((s, k) => {
    const points = axisSlice(road.points, s.a, s.b);
    const openEnds: [boolean, boolean] = [
      s.a > 0 ? true : (road.openEnds?.[0] ?? false),
      s.b < length ? true : (road.openEnds?.[1] ?? false),
    ];
    return {
      id: k === (heir >= 0 ? heir : 0) ? road.id : roads.nextId++,
      points,
      bornDay: road.bornDay,
      grade: road.grade,
      traffic: [...road.traffic],
      spots: [],
      ...(road.ground ? { ground: groundPart(road.ground, s.a, s.b) } : {}),
      openEnds,
      ...(s.kind === 'abandoned' ? { abandoned: true as const } : {}),
      ...(road.cart ? { cart: true as const } : {}),
      ...(road.swath ? { swath: true as const } : {}),
      ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
    };
  });
  const living = made.filter((r) => !r.abandoned);
  const axes = new Map(living.map((r) => [r, axisDistance([r.points])]));
  const nearest = (x: number, z: number, within: number, among: readonly Road[]): Road | null => {
    let best: Road | null = null;
    let bestD = within;
    for (const r of among) {
      const d = (axes.get(r) ?? axisDistance([r.points]))(x, z);
      if (d <= bestD) {
        best = r;
        bestD = d;
      }
    }
    return best;
  };
  for (const spot of road.spots) {
    nearest(spot.x, spot.z, ROAD_TREES.offsetM.to + 1, living)?.spots.push(spot);
  }
  for (const piece of road.condition ?? []) {
    const owner = nearest(piece.x, piece.z, ROADS.pieceM / 2, made);
    if (owner) (owner.condition ??= []).push(piece);
  }
  for (const apple of roads.apples ?? []) {
    if (apple.roadId !== road.id) continue;
    const owner = nearest(apple.x, apple.z, Infinity, living);
    if (owner) apple.roadId = owner.id;
  }
  // konce živých zbytků u řezu
  const cuts = kept.flatMap((s, k) =>
    s.kind === 'alive'
      ? [
          ...(s.a > 0 ? [{ ...made[k]!.points[0]! }] : []),
          ...(s.b < length ? [{ ...made[k]!.points[made[k]!.points.length - 1]! }] : []),
        ]
      : [],
  );
  if (cuts.length > 0) roads.cutEnds = [...(roads.cutEnds ?? []), ...cuts];
  roads.roads.splice(roads.roads.indexOf(road), 1, ...made);
  return gone;
}

/**
 * Kusy na nule (`condition`) zmizí (mutuje; paths.md – Zarůstání): celá cesta pryč, nebo se
 * zbytky rozříznou (`reshapeRoad`). Cesta ve vylepšení se nemění. Vrátí události kroniky
 * (`road-overgrown` jen pro zaniklé kusy).
 */
export function cutDeadRoads(
  roads: VillageRoads,
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
  day: number,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const frozen = fixedRoadIds(constructions, trails);
  for (const road of [...roads.roads]) {
    if (!road.condition?.some((q) => q.c <= 0) || frozen.has(road.id) || road.points.length < 2) {
      continue;
    }
    const pieces = roadPieces(road.points);
    const dead = pieces.map((piece) => conditionOf(road.condition!, piece, 1) <= 0);
    if (dead.every(Boolean)) {
      roads.roads.splice(roads.roads.indexOf(road), 1);
      events.push({ day, kind: 'road-overgrown', roadId: road.id });
      continue;
    }
    const segments = mergeSegments(
      pieces.map((p, k): Segment => ({ a: p.from, b: p.to, kind: dead[k] ? 'gone' : 'alive' })),
    );
    // zbytek živé cesty kratší než MIN_ROAD_M by jen překážel – zmizí s ostatními
    for (const s of segments) {
      if (s.kind === 'alive' && s.b - s.a < MIN_ROAD_M) s.kind = 'gone';
    }
    for (const roadId of reshapeRoad(roads, road, mergeSegments(segments))) {
      events.push({ day, kind: 'road-overgrown', roadId });
    }
  }
  return events;
}

/** Krok vzorkování osy při hledání kusu pod stavbou (m). */
const BLOCK_STEP_M = 1;
/**
 * Nejkratší souvislý kus osy v neprůchodné ploše, který je „pod stavbou“ (m): cesta, která jen
 * zaklesne do rohu okraje plochy (vyhlazená objížďka), pod stavbou není.
 */
const BLOCK_MIN_RUN_M = 5;

/**
 * Kus pod hotovou stavbou je opuštěný (mutuje; paths.md – Stavba přes cestu, návrh Clauda – Vlkov
 * 23. 10. 2026): kus osy, který leží v neprůchodné ploše (`blocked`), se vyřízne jako opuštěný
 * úsek (`Road.abandoned`) – vypadne ze sítě a zaroste; zbytky po stranách žijí dál se starým id
 * (první) a novými. Zbytek kratší než MIN_ROAD_M se přidá k opuštěnému. Cesta ve vylepšení se
 * nemění, opuštěná se nehodnotí znovu. Vrátí, jestli se něco změnilo.
 */
export function abandonBlockedStretches(
  roads: VillageRoads,
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
  blocked: (x: number, z: number) => boolean,
): boolean {
  const frozen = fixedRoadIds(constructions, trails);
  let changed = false;
  for (const road of [...roads.roads]) {
    if (road.abandoned || frozen.has(road.id) || road.points.length < 2) continue;
    const samples = resample(road.points, null, BLOCK_STEP_M).points;
    const at = lengthsAlong(samples);
    const under = samples.map((p) => blocked(p.x, p.z));
    // krátké běhy v ploše (roh okraje) se nepočítají
    for (let k = 0; k < under.length;) {
      if (!under[k]) {
        k++;
        continue;
      }
      let end = k;
      while (end + 1 < under.length && under[end + 1]) end++;
      if (end - k + 1 < BLOCK_MIN_RUN_M / BLOCK_STEP_M) under.fill(false, k, end + 1);
      k = end + 1;
    }
    if (!under.some(Boolean)) continue;
    const length = at[at.length - 1]!;
    // řez leží o jeden vzorek (BLOCK_STEP_M) od stavby – opuštěný kus je o metr delší a živý zbytek
    // nekončí ve stavbě, takže se stavba v dalším měsíci znovu neřeže
    const cutBetween = (k: number): number =>
      under[k]! ? at[Math.max(0, k - 2)]! : at[Math.min(samples.length - 1, k + 1)]!;
    const segments: Segment[] = [];
    let start = 0;
    for (let k = 1; k <= samples.length; k++) {
      if (k < samples.length && under[k] === under[start]) continue;
      segments.push({
        a: start === 0 ? 0 : cutBetween(start),
        b: k === samples.length ? length : cutBetween(k),
        kind: under[start] ? 'abandoned' : 'alive',
      });
      start = k;
    }
    for (const s of segments) {
      if (s.kind === 'alive' && s.b - s.a < MIN_ROAD_M) s.kind = 'abandoned';
    }
    const merged = mergeSegments(segments);
    if (merged.every((s) => s.kind === 'abandoned')) {
      road.abandoned = true;
    } else {
      reshapeRoad(roads, road, merged);
    }
    changed = true;
  }
  return changed;
}
