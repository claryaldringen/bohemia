// VÝVOJOVÝ NÁSTROJ – ukázka vozové cesty na /dev/landscape (bez databáze a simulace; roads.md –
// Vozová cesta). Na louce mapy se najdou dvě místa: krátký prudký svah s rovinou kolem (stará
// vyšlapaná cesta přes něj rovně, po ní jezdí hodně vozů) a nejprudší dlouhý svah, který vozová
// cesta po staré ose ještě srovná (cesta rovně do kopce). Vozové cesty po starých naplánuje herní
// jádro (`planWagonRoad` – stejná funkce jako server při zahájení stavby): po ose staré cesty,
// sklon do 6 %, úvozy a náspy do 3 m. Stadia ukázky: náhled (vytyčení tras), stavba v půlce
// (hotové úseky jsou cesta a nahradily starou, terén upravený, zbytek vytyčený), hotová (čerstvá
// hlína na svazích), po letech (svahy zarostlé).
import {
  NO_OBSTACLE_CHANGES,
  WAGON_ROAD,
  planWagonRoad,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
  type WagonRoadPlan,
} from '@bohemia/game';
import type { SceneEarthwork, SceneRoad } from '@/lib/village-view';

/** Stadia ukázky. */
export const WAGON_DEMO_STAGES = [
  { label: 'náhled', progress: null, ageYears: 0 },
  { label: 'stavba 50 %', progress: 0.5, ageYears: 0 },
  { label: 'hotová', progress: 1, ageYears: 0 },
  { label: 'po 8 letech', progress: 1, ageYears: 8 },
] as const;

/** Jedna trasa ukázky – stará cesta, plán vozové cesty a kam se podívat. */
export interface WagonDemoRoute {
  plan: Extract<WagonRoadPlan, { ok: true }>;
  old: SceneRoad;
  focus: { x: number; z: number };
  /** Popis pro lištu – délky, sklon, úvoz a násep. */
  note: string;
}

export interface WagonDemo {
  stage: number;
  routes: WagonDemoRoute[];
}

/**
 * Místa ukázky: `notch` – krátký prudký svah (3–4 políčka) s největším převýšením a po 3
 * políčkách roviny kolem, obchodní cesta s `trips` jízdami vozů denně; `slope` – nejprudší dlouhý
 * svah (6–12 políček, převýšení aspoň `riseM`, louka i `side` políček do stran) bez vozů. Obojí jen
 * tak prudké, aby ho vozová cesta po staré ose srovnala (sklon 6 % a úvoz a násep do 3 m).
 */
const PLACES = {
  notch: { spans: [3, 4], flat: 3, side: 0, riseM: 4, trips: 80, by: 'rise' },
  slope: { spans: [6, 7, 8, 9, 10, 11, 12], flat: 1, side: 1, riseM: 6, trips: 0, by: 'grade' },
} as const;

type Place = (typeof PLACES)[keyof typeof PLACES];

function pct(v: number): string {
  return `${(v * 100).toFixed(1).replace('.', ',')} %`;
}

function metres(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

/** Trasa ukázky na místě `place` (nejprudší vhodné, při shodě nejblíž vsi); bez místa null. */
function demoRoute(
  l: Landscape,
  layer: ObstacleLayer,
  roadId: number,
  place: Place,
  avoid: { x: number; z: number } | null,
): WagonDemoRoute | null {
  const height = (x: number, y: number): number => l.heights[y * l.size + x]!;
  const margin = Math.max(place.flat, place.side) + 1;
  const meadow = (x: number, y: number): boolean =>
    x >= margin &&
    y >= margin &&
    x < l.size - margin &&
    y < l.size - margin &&
    surfaceAt(l, x, y) === 'meadow';
  const site = l.villageSite;
  let best: { a: [number, number]; b: [number, number]; grade: number; distance: number } | null =
    null;
  for (let by = margin; by < l.size - margin; by++) {
    for (let bx = margin; bx < l.size - margin; bx++) {
      for (const [sx, sy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        for (const span of place.spans) {
          let clear = true;
          for (let k = -place.flat; k <= span + place.flat && clear; k++) {
            for (let q = -place.side; q <= place.side && clear; q++) {
              if (!meadow(bx + sx * k + sy * q, by + sy * k + sx * q)) clear = false;
            }
          }
          if (!clear) continue;
          const rise = Math.abs(height(bx + sx * span, by + sy * span) - height(bx, by));
          if (rise < place.riseM) continue;
          // vozová cesta po staré ose: převýšení srovná sklon 6 % po celé délce a úvoz a násep
          const reach =
            WAGON_ROAD.maxGrade * (span + 2 * place.flat) * l.cellSizeM +
            WAGON_ROAD.maxCutM +
            WAGON_ROAD.maxFillM;
          if (rise > reach * 0.9) continue;
          const grade = place.by === 'rise' ? rise : rise / (span * l.cellSizeM);
          const a: [number, number] = [bx - sx * place.flat, by - sy * place.flat];
          const b: [number, number] = [
            bx + sx * (span + place.flat),
            by + sy * (span + place.flat),
          ];
          if (avoid) {
            const mid = tileCenterWorld(l, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            if (Math.hypot(mid.x - avoid.x, mid.z - avoid.z) < 200) continue;
          }
          const distance = Math.abs(bx - site.x) + Math.abs(by - site.y);
          if (
            !best ||
            grade > best.grade + 1e-9 ||
            (grade > best.grade - 1e-9 && distance < best.distance)
          ) {
            best = { a, b, grade, distance };
          }
        }
      }
    }
  }
  if (!best) return null;
  const a = tileCenterWorld(l, best.a[0], best.a[1]);
  const b = tileCenterWorld(l, best.b[0], best.b[1]);
  const cm = (v: number): number => Math.round(v * 100) / 100;
  const old: SceneRoad = {
    id: roadId,
    points: [
      { x: cm(a.x), z: cm(a.z) },
      { x: cm((a.x + b.x) / 2 + 2), z: cm((a.z + b.z) / 2 + 2) },
      { x: cm(b.x), z: cm(b.z) },
    ],
    grade: 'improved',
    openEnds: [true, true],
    ...(place.trips > 0 ? { cartTrips: place.trips } : {}),
  };
  const plan = planWagonRoad({
    landscape: l,
    layer,
    changes: NO_OBSTACLE_CHANGES,
    village: { dwellings: [], fields: [] },
    roads: [{ ...old, ...(place.trips > 0 ? { cartTraffic: [place.trips] } : {}) }],
    earthworks: [],
    roadId,
    home: { x: a.x, z: a.z },
  });
  if (!plan.ok) return null;
  return {
    plan,
    old,
    focus: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
    note: `${Math.round(plan.oldLengthM)} → ${Math.round(plan.lengthM)} m, sklon ${pct(plan.oldMaxGrade)} → ${pct(plan.maxGrade)}, úvoz ${metres(plan.maxCutM)} m, násep ${metres(plan.maxFillM)} m`,
  };
}

/**
 * Ukázka: krátký prudký svah s obchodní cestou a nejprudší dlouhý svah – vozové cesty po staré ose
 * s úvozem a náspem naplánuje jádro. Bez vhodných míst prázdné.
 */
export function demoWagonRoads(
  l: Landscape,
  layer: ObstacleLayer,
  roadId: number,
): WagonDemoRoute[] {
  const notch = demoRoute(l, layer, roadId, PLACES.notch, null);
  const slope = demoRoute(l, layer, roadId + 10, PLACES.slope, notch?.focus ?? null);
  return [notch, slope].filter((r): r is WagonDemoRoute => r !== null);
}

/** Bod osy `d` m od začátku. */
function axisAt(points: readonly { x: number; z: number }[], d: number): { x: number; z: number } {
  let along = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (along + length >= d && length > 0) {
      const u = (d - along) / length;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
    along += length;
  }
  return points[points.length - 1]!;
}

/**
 * Cesty a zemní práce ukázky ve stadiu: hotové úseky vozových cest, za nimi zbytek staré cesty po
 * téže ose (hotový úsek starou cestu nahradí), profily.
 */
export function wagonDemoVillage(
  demo: WagonDemo,
  ids: { earthwork: number; road: number },
): {
  roads: SceneRoad[];
  earthworks: SceneEarthwork[];
  preview: { x: number; z: number }[][];
  /** Co stavba vykácela (hotové trasy celé, rozestavěné taky – ukázka). */
  removed: number[];
  stumps: number[];
} {
  const stage = WAGON_DEMO_STAGES[demo.stage]!;
  const roads: SceneRoad[] = [];
  const earthworks: SceneEarthwork[] = [];
  const preview: { x: number; z: number }[][] = [];
  const removed: number[] = [];
  const stumps: number[] = [];
  demo.routes.forEach((route, k) => {
    const { plan } = route;
    if (stage.progress === null) {
      roads.push(route.old);
      preview.push(plan.profile.map((p) => ({ x: p.x, z: p.z })));
      return;
    }
    const reachedM = plan.lengthM * stage.progress;
    removed.push(...plan.cleared);
    stumps.push(...plan.felled);
    // hotové úseky (od vsi ven) – jedna pevná cesta po hotovou délku
    let builtM = 0;
    for (const piece of plan.pieces) if (piece.toM <= reachedM + 1e-6) builtM = piece.toM;
    const axis: { x: number; z: number }[] = [];
    let along = 0;
    plan.profile.forEach((p, i) => {
      if (i > 0) along += Math.hypot(p.x - plan.profile[i - 1]!.x, p.z - plan.profile[i - 1]!.z);
      if (along < builtM - 1e-6) axis.push({ x: p.x, z: p.z });
    });
    axis.push(axisAt(plan.profile, builtM));
    if (axis.length >= 2 && builtM > 0) {
      roads.push({ id: ids.road + k, points: axis, grade: 'wagon', swath: true });
    }
    // zbytek staré cesty za hotovými úseky (vozová vede po její ose)
    const rest = [axisAt(plan.profile, builtM)];
    along = 0;
    plan.profile.forEach((p, i) => {
      if (i > 0) along += Math.hypot(p.x - plan.profile[i - 1]!.x, p.z - plan.profile[i - 1]!.z);
      if (along > builtM + 1e-6) rest.push({ x: p.x, z: p.z });
    });
    if (rest.length >= 2) roads.push({ ...route.old, points: rest });
    earthworks.push({
      id: ids.earthwork + k,
      profile: plan.profile,
      ...(plan.fords.length > 0 ? { fords: plan.fords } : {}),
      reachedM: builtM,
      shownM: reachedM,
      pieces: plan.pieces.map((p) => ({
        toM: p.toM,
        ageYears: p.toM <= reachedM + 1e-6 ? stage.ageYears : null,
      })),
      ...(stage.progress < 1 ? { building: true as const } : {}),
    });
  });
  return { roads, earthworks, preview, removed, stumps };
}
