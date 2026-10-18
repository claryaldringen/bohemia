import { dateOfDayIndex } from '../../calendar';
import { length2, obstaclesNear, tileOfWorldPoint, type Landscape } from '../../landscape';
import type { ObstacleLayer } from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { villageCemeteries } from '../cemetery';
import { milirCenter } from '../crafts';
import { obstacleChangesAt, obstacleStatus, type ObstacleChanges } from '../obstacles';
import { villageOrchards } from '../orchard';
import { ROAD_TREE_ID_BASE, roadTreeLook } from '../road-trees';
import { MILIR, ROADS, ROAD_TREES, SACRED_BUILDINGS } from '../rules';
import type {
  ChronicleEvent,
  LaborDay,
  LaborTarget,
  Road,
  RoadPoint,
  RoadTreeSpecies,
  RoadTreeSpot,
  VillageRoads,
  VillageState,
} from '../types';
import {
  computePathNetwork,
  pathBounds,
  pathStrength,
  simplifyPathLine,
  type PathLine,
  type PathNetwork,
  type PathTraffic,
  type PathVillage,
} from './network';
import {
  PATH_FORD,
  PATH_WOODLAND,
  obstaclePosition,
  pathTerrainOf,
  pathWindowFor,
  withObstacles,
  type PathTerrain,
} from './terrain';
import { pathVillageOf } from './village';

// Pevné cesty (docs/design/roads.md – Dvě vrstvy cest, Stromy u pevných cest). Simulace vsi
// sčítá práci dne po místech a jednou za rok (1. 11.) spočítá stejnou funkcí jako pěšiny dne
// (`computePathNetwork`) síť z celoroční práce. Úsek, kudy se nad prahem chodí dva roky po sobě,
// se stane pevnou cestou: uloží se jeho osa a od té doby se nehýbe – nové trasy se k ní
// přimknou (sleva v síti), síť se jen rozrůstá. Nepoužívaná vyšlapaná cesta zaroste. U cesty se
// při vzniku určí místa na stromy; na volném místě se strom uchytí náhodou ze seedu vsi a roku,
// roste z keře a stojí, dokud neodumře. Vše je deterministické (jen přesná aritmetika – soubor
// hlídá ESLint jako síť pěšin) a počítá se jen jednou za rok.

const DAYS_PER_YEAR = 365.25;
/** Krok vzorkování os sítě (m) – úseky nad prahem a porovnání s loňskem. */
const SAMPLE_M = 2;
/** Loňské úseky nad prahem se ukládají po tolika metrech (na decimetry). */
const CANDIDATE_STEP_M = 4;
/** Letošní úsek nad prahem leží „tam, kde loni“, když je od loňského nejvýš tak daleko (m). */
const MATCH_M = 6;
/** Trasa vede po pevné cestě, když je od její osy nejvýš tak daleko (m) – buňka sítě 3,75 m. */
const ON_ROAD_M = 5;
/** Konec nové cesty u pevné cesty se k ní připojí, když je od ní nejvýš tak daleko (m). */
const ATTACH_M = 10;
/** Připojení blíž konci pevné cesty jde přímo do konce (cesta se nedělí) (m). */
const END_SNAP_M = 4;
/** Kratší úsek se pevnou cestou nestane (m). */
const MIN_ROAD_M = 15;
/** Zjednodušení osy nové cesty (m) – body po 2 m by stav zbytečně nafoukly. */
const SIMPLIFY_M = 0.25;
/** Provoz cesty se měří v bodech po tolika metrech (medián – jedno místo ho nezkreslí). */
const MEASURE_STEP_M = 3;
/** Strom nestojí blíž ose žádné pevné cesty (m) ani blíž konci cesty (rozcestí, brána). */
const ROAD_CLEAR_M = 2.2;
const END_CLEAR_M = 6;
/** Krok procházení osy při hledání míst na stromy (m). */
const SPOT_WALK_M = 1;
/** Strom u cesty nestojí kousek od překážky krajiny (kmen, keř, kámen) (m). */
const LAYER_CLEAR_M = 2.5;
/** Kolem čtverců (pole, sad, hřbitov, pozemek, háj) se nesází – jen podél okraje (m). */
const SQUARE_MARGIN_M = 1.5;
/** Ves: kolem obydlí se nesází (m od středu), kolem modly a svatyně, milíře a posvátného dubu. */
const HOMESTEAD_M = 16;
const SACRED_MARGIN_M = 3;
const MILIR_MARGIN_M = 1.5;
const SACRED_OAK_M = 6;
/** Kyblíky prostorového indexu os (m). */
const BUCKET_M = 10;

/** Pevné cesty prázdné vsi – práce se začne sčítat od dne `day`. */
function emptyRoads(day: number): VillageRoads {
  return {
    nextId: 1,
    roads: [],
    trees: [],
    candidates: [],
    labor: { from: day, days: 0, shares: [] },
  };
}

function isRoadYearDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === ROADS.yearDay.month && date.day === ROADS.yearDay.day;
}

/**
 * Krok dne pro pevné cesty (mutuje stav – volá simulace na konci dne): 1. 11. roční kontrola
 * (`updateRoads`) a nový rok cest, pak práce dne do ročního součtu. Bez krajiny (kalibrace, testy)
 * nic – pevné cesty se počítají jen s krajinou sídla. Vsi bez pevných cest (starší) začnou sčítat.
 */
export function roadsDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (!landscape) return;
  const roads = (state.roads ??= emptyRoads(day));
  if (isRoadYearDay(day) && roads.labor.from < day) {
    state.chronicle.push(...updateRoads(state, day, landscape, obstacles));
    roads.labor = { from: day, days: 0, shares: [] };
  }
  addRoadLabor(roads, state.labor, day);
}

/** Klíč místa práce (pole bez dílů). */
function laborKey(target: LaborTarget): string {
  if (target.kind === 'trees') return `trees:${target.ids.join('.')}`;
  return target.kind === 'village' ? 'village' : `${target.kind}:${target.id}`;
}

/** Práce dne `day` (rozdělení práce vsi) do součtu roku cest (mutuje). */
export function addRoadLabor(roads: VillageRoads, labor: LaborDay | undefined, day: number): void {
  roads.labor.days++;
  if (!labor || labor.day !== day) return;
  const index = new Map(roads.labor.shares.map((s, i) => [laborKey(s.target), i]));
  for (const share of labor.shares) {
    if (share.target.kind === 'village' || share.manDays <= 0) continue;
    const key = laborKey(share.target);
    const at = index.get(key);
    if (at !== undefined) {
      roads.labor.shares[at]!.manDays += share.manDays;
    } else {
      const target: LaborTarget =
        share.target.kind === 'field'
          ? { kind: 'field', id: share.target.id }
          : share.target.kind === 'trees'
            ? { kind: 'trees', ids: [...share.target.ids] }
            : { ...share.target };
      index.set(key, roads.labor.shares.length);
      roads.labor.shares.push({ target, manDays: share.manDays });
    }
  }
}

/** Síť z celoroční práce a terén, ze kterého vznikla; ves bez obydlí null. */
interface AnnualNetwork {
  network: PathNetwork;
  terrain: PathTerrain;
}

/**
 * Roční síť (roads.md): ves v den `day` s průměrnými člověkodny na den za rok cest (místo práce
 * dne), dřevo podle průměru roku a sleva za pevné cesty – stejná funkce jako pěšiny dne.
 */
export function annualPathNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  changes: ObstacleChanges = obstacleChangesAt(state, day),
): AnnualNetwork | null {
  const base = pathVillageOf(state, day, landscape);
  const roads = state.roads;
  const days = Math.max(1, roads?.labor.days ?? 1);
  const shares = (roads?.labor.shares ?? []).map((s) => ({
    target: s.target,
    manDays: s.manDays / days,
  }));
  const village: PathVillage = base.labor ? { ...base, labor: { ...base.labor, shares } } : base;
  const bounds = pathBounds(village);
  if (!bounds) return null;
  const window = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  const terrain = obstacles ? withObstacles(window, obstacles, changes) : window;
  const network = computePathNetwork({
    village,
    terrain,
    annual: true,
    ...(obstacles ? { tree: (id: number) => obstaclePosition(obstacles, id) } : {}),
  });
  return { network, terrain };
}

/**
 * Roční kontrola pevných cest v den `day` (1. 11.; mutuje stav): provoz cest za uplynulý rok,
 * zarůstání, nové pevné cesty z úseků nad prahem i loni, letošní úseky nad prahem na příští rok
 * a stromy u cest (konec pařezů, odstraněné stavbou, uchycení nových). Vrátí události kroniky.
 */
export function updateRoads(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): ChronicleEvent[] {
  const roads = (state.roads ??= emptyRoads(day));
  const changes = obstacleChangesAt(state, day);
  const annual = annualPathNetwork(state, day, landscape, obstacles, changes);
  const events: ChronicleEvent[] = [];
  const blocked = plantingBlocker(state, landscape);
  if (annual) {
    const { network, terrain } = annual;
    for (const road of roads.roads) {
      road.traffic = [...road.traffic, roadTraffic(road.points, network.traffic)].slice(
        -ROADS.overgrowYears,
      );
    }
    // zarůstání vyšlapané cesty (upravená a hať nezarůstají) – stromy u ní stojí dál
    roads.roads = roads.roads.filter((road) => {
      if (!isOvergrown(road)) return true;
      events.push({ day, kind: 'road-overgrown', roadId: road.id });
      return false;
    });
    const runs = hotRuns(network.lines);
    const context: SpotContext = {
      terrain,
      blocked,
      layer: obstacles,
      changes,
      seed: state.seed,
    };
    for (const road of formRoads(roads, runs, day, network.traffic, context)) {
      events.push({ day, kind: 'road-formed', roadId: road.id });
    }
    roads.candidates = runs.map((run) =>
      resample(run, null, CANDIDATE_STEP_M).points.map((p) => ({ x: dm(p.x), z: dm(p.z) })),
    );
  } else {
    roads.candidates = [];
  }
  // stromy: pařez zmizel, nebo strom odstranila stavba – místo je volné
  const removed = new Set(changes.removed);
  roads.trees = roads.trees.filter((t) => !removed.has(t.id) && roadTreeLook(t, day) !== null);
  rootTrees(state, roads, day, blocked);
  return events;
}

/** Vyšlapaná cesta, kudy se ROADS.overgrowYears let po sobě chodí pod polovinou prahu. */
function isOvergrown(road: Road): boolean {
  return (
    road.grade === 'trodden' &&
    road.traffic.length >= ROADS.overgrowYears &&
    road.traffic.every((t) => t < ROADS.tripsPerDay * ROADS.overgrowShare)
  );
}

function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

function dm(v: number): number {
  return Math.round(v * 10) / 10;
}

// --- geometrie os ------------------------------------------------------------------------------

/** Délky po lomené čáře (kumulativně od začátku). */
function lengthsAlong(points: readonly RoadPoint[]): number[] {
  const at = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    at.push(at[k - 1]! + length2(b.x - a.x, b.z - a.z));
  }
  return at;
}

/** Body lomené čáry po `step` m (s koncem) a hodnoty v nich (lineárně mezi body). */
function resample(
  points: readonly RoadPoint[],
  values: readonly number[] | null,
  step: number,
): { points: RoadPoint[]; values: number[] } {
  const out: RoadPoint[] = [];
  const outValues: number[] = [];
  if (points.length === 0) return { points: out, values: outValues };
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const n = Math.max(1, Math.ceil(length / step - 1e-9));
  let segment = 1;
  for (let s = 0; s <= n; s++) {
    const d = s === n ? length : s * step;
    while (segment < points.length - 1 && at[segment]! < d) segment++;
    if (points.length === 1) {
      out.push({ ...points[0]! });
      outValues.push(values?.[0] ?? 0);
      break;
    }
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = at[segment]! - at[segment - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[segment - 1]!) / span)) : 1;
    out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
    if (values) {
      outValues.push(values[segment - 1]! + (values[segment]! - values[segment - 1]!) * u);
    }
  }
  return { points: out, values: outValues };
}

/** Vzdálenost bodu od úsečky a–b a parametr nejbližšího bodu (0–1). */
function toSegment(
  x: number,
  z: number,
  a: RoadPoint,
  b: RoadPoint,
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return { distance: length2(x - (a.x + dx * t), z - (a.z + dz * t)), t };
}

/** Vzdálenost od nejbližší osy (přesně do BUCKET_M, dál Infinity) – úsečky po kyblících. */
function axisDistance(
  polylines: readonly (readonly RoadPoint[])[],
): (x: number, z: number) => number {
  const buckets = new Map<string, [RoadPoint, RoadPoint][]>();
  for (const line of polylines) {
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1]!;
      const b = line[k]!;
      const x0 = Math.floor(Math.min(a.x, b.x) / BUCKET_M);
      const x1 = Math.floor(Math.max(a.x, b.x) / BUCKET_M);
      const z0 = Math.floor(Math.min(a.z, b.z) / BUCKET_M);
      const z1 = Math.floor(Math.max(a.z, b.z) / BUCKET_M);
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const key = `${bx},${bz}`;
          const list = buckets.get(key);
          if (list) list.push([a, b]);
          else buckets.set(key, [[a, b]]);
        }
      }
    }
  }
  return (x, z) => {
    let best = Infinity;
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [a, b] of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
          best = Math.min(best, toSegment(x, z, a, b).distance);
        }
      }
    }
    return best;
  };
}

/** Nejbližší bod na pevných cestách: index cesty, úsek, bod a vzdálenost. */
interface RoadHit {
  road: number;
  segment: number;
  point: RoadPoint;
  distance: number;
}

function nearestOnRoads(roads: readonly Road[], x: number, z: number): RoadHit | null {
  let best: RoadHit | null = null;
  roads.forEach((road, r) => {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const { distance, t } = toSegment(x, z, a, b);
      if (best === null || distance < best.distance) {
        best = {
          road: r,
          segment: k - 1,
          point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
          distance,
        };
      }
    }
  });
  return best;
}

// --- provoz a vznik cest ----------------------------------------------------------------------

/**
 * Provoz pevné cesty v roční síti (cest za den): medián bodů osy po MEASURE_STEP_M, v bodě
 * nejvyšší provoz buněk 3 × 3 kolem něj (trasa vede po cestě nebo těsně vedle). Na setiny.
 */
export function roadTraffic(points: readonly RoadPoint[], traffic: PathTraffic): number {
  const samples = resample(points, null, MEASURE_STEP_M).points;
  const values = samples.map((p) => {
    const ci = Math.round((p.x - traffic.originX) / traffic.cellM);
    const cj = Math.round((p.z - traffic.originZ) / traffic.cellM);
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= traffic.width || j >= traffic.height) continue;
        best = Math.max(best, traffic.raw[j * traffic.width + i]!);
      }
    }
    return best;
  });
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)]! * 100) / 100;
}

/**
 * Úseky roční sítě nad prahem (ROADS.tripsPerDay – síla pěšiny nad pathStrength prahu): osy po
 * SAMPLE_M rozdělené tam, kde provoz klesne pod práh.
 */
function hotRuns(lines: readonly PathLine[]): RoadPoint[][] {
  const threshold = pathStrength(ROADS.tripsPerDay) - 1e-9;
  const runs: RoadPoint[][] = [];
  for (const line of lines) {
    const { points, values } = resample(line.points, line.strength, SAMPLE_M);
    let run: RoadPoint[] = [];
    points.forEach((p, k) => {
      if (values[k]! >= threshold) {
        run.push(p);
        return;
      }
      if (run.length >= 2) runs.push(run);
      run = [];
    });
    if (run.length >= 2) runs.push(run);
  }
  return runs;
}

/**
 * Nové pevné cesty (mutuje `roads`): po bodech letošních úseků nad prahem – bod, který leží i na
 * loňském úseku (MATCH_M) a nevede po pevné cestě (ON_ROAD_M), patří nové cestě. Souvislý běh
 * takových bodů je nová cesta; kde navazuje na pevnou cestu, připojí se k ní (rozdělí ji
 * v rozcestí). Vrátí nové cesty.
 */
function formRoads(
  roads: VillageRoads,
  runs: readonly RoadPoint[][],
  day: number,
  traffic: PathTraffic,
  context: SpotContext,
): Road[] {
  const formed: Road[] = [];
  if (roads.candidates.length === 0) return formed;
  const lastYear = axisDistance(roads.candidates);
  for (const run of runs) {
    const onRoadAt = axisDistance(roads.roads.map((r) => r.points));
    const confirmed = run.map((p) => lastYear(p.x, p.z) <= MATCH_M);
    const onRoad = run.map((p) => onRoadAt(p.x, p.z) <= ON_ROAD_M);
    let i = 0;
    while (i < run.length) {
      if (!confirmed[i] || onRoad[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < run.length && confirmed[j + 1] && !onRoad[j + 1]) j++;
      const road = formRoad(
        roads,
        run.slice(i, j + 1),
        i > 0 && onRoad[i - 1]!,
        j < run.length - 1 && onRoad[j + 1]!,
        day,
        traffic,
        context,
      );
      if (road) formed.push(road);
      i = j + 1;
    }
  }
  return formed;
}

/** Jedna nová pevná cesta z bodů `points` – s připojením konců k pevné cestě. */
function formRoad(
  roads: VillageRoads,
  points: RoadPoint[],
  joinStart: boolean,
  joinEnd: boolean,
  day: number,
  traffic: PathTraffic,
  context: SpotContext,
): Road | null {
  const axis = points.map((p) => ({ x: cm(p.x), z: cm(p.z) }));
  // napojení na pevnou cestu (případné rozdělení cesty v rozcestí) – nejdřív začátek, pak konec
  const start = joinStart ? joinPoint(roads, axis[0]!) : null;
  if (start) axis.unshift(start);
  const end = joinEnd ? joinPoint(roads, axis[axis.length - 1]!) : null;
  if (end) axis.push(end);
  const simple = simplifyPathLine(axis, [], SIMPLIFY_M).points.filter(
    (p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z,
  );
  const along = lengthsAlong(simple);
  const length = along[along.length - 1] ?? 0;
  if (simple.length < 2 || length < MIN_ROAD_M) return null;
  const road: Road = {
    id: roads.nextId++,
    points: simple,
    bornDay: day,
    grade: 'trodden',
    traffic: [roadTraffic(simple, traffic)],
    spots: [],
  };
  roads.roads.push(road);
  // volná místa jiných cest, přes která nová cesta vede, zmizí (stromy na nich stojí dál)
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const alongNew = axisDistance([simple]);
  for (const other of roads.roads) {
    other.spots = other.spots.filter(
      (s) => occupied.has(s.id) || alongNew(s.x, s.z) >= ROAD_CLEAR_M,
    );
  }
  road.spots = spotsForRoad(roads, road, context);
  return road;
}

/**
 * Bod, kde se konec nové cesty připojí k pevné cestě (do ATTACH_M): u konce pevné cesty do jejího
 * konce, jinak do nejbližšího bodu osy – pevná cesta se tam rozdělí na dva úseky (rozcestí).
 */
function joinPoint(roads: VillageRoads, from: RoadPoint): RoadPoint | null {
  const hit = nearestOnRoads(roads.roads, from.x, from.z);
  if (!hit || hit.distance > ATTACH_M) return null;
  const road = roads.roads[hit.road]!;
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  if (length2(hit.point.x - first.x, hit.point.z - first.z) <= END_SNAP_M) return { ...first };
  if (length2(hit.point.x - last.x, hit.point.z - last.z) <= END_SNAP_M) return { ...last };
  return splitRoad(roads, hit);
}

/**
 * Rozdělí pevnou cestu v bodě `hit` na dva úseky (první si nechá id, druhý dostane nové); oba
 * zdědí den vzniku, stupeň a provoz, místa na stromy se rozdělí podle polohy. Vrátí bod rozcestí.
 */
function splitRoad(roads: VillageRoads, hit: RoadHit): RoadPoint {
  const road = roads.roads[hit.road]!;
  const at = { x: cm(hit.point.x), z: cm(hit.point.z) };
  const same = (p: RoadPoint): boolean => p.x === at.x && p.z === at.z;
  const head = road.points.slice(0, hit.segment + 1);
  const tail = road.points.slice(hit.segment + 1);
  const first = same(head[head.length - 1]!) ? head : [...head, at];
  const second = same(tail[0]!) ? tail : [at, ...tail];
  const firstAxis = axisDistance([first]);
  const secondAxis = axisDistance([second]);
  const rest: Road = {
    id: roads.nextId++,
    points: second,
    bornDay: road.bornDay,
    grade: road.grade,
    traffic: [...road.traffic],
    spots: road.spots.filter((s) => secondAxis(s.x, s.z) < firstAxis(s.x, s.z)),
  };
  road.spots = road.spots.filter((s) => secondAxis(s.x, s.z) >= firstAxis(s.x, s.z));
  road.points = first;
  roads.roads.splice(hit.road + 1, 0, rest);
  return at;
}

// --- místa na stromy a uchycení ---------------------------------------------------------------

/** Co potřebuje výběr míst na stromy u nové cesty. */
interface SpotContext {
  terrain: PathTerrain;
  /** Stavby vsi – tady strom nevyroste (`plantingBlocker`). */
  blocked: (x: number, z: number) => boolean;
  layer: ObstacleLayer | null;
  changes: ObstacleChanges;
  seed: number;
}

/**
 * Místa na stromy podél osy (roads.md – Stromy u pevných cest): po ROAD_TREES.spacingM střídavě
 * vlevo a vpravo ROAD_TREES.offsetM od osy, kousek nepravidelně podél, ne blíž END_CLEAR_M ke
 * koncům; kde místo nejde (`canPlant`), zkusí druhou stranu, jinak nic. Místa jsou od sebe
 * aspoň ROAD_TREES.gapM. Deterministicky ze seedu – los v pevném pořadí bez ohledu na to, která
 * místa projdou.
 */
export function roadTreeSpots(
  points: readonly RoadPoint[],
  seed: number,
  canPlant: (x: number, z: number) => boolean,
): RoadPoint[] {
  const out: RoadPoint[] = [];
  if (points.length < 2) return out;
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const random = createRandom(seed);
  const { spacingM, offsetM, gapM } = ROAD_TREES;
  const flip = random.next() < 0.5 ? 1 : 0;
  let next = END_CLEAR_M + random.next() * spacingM.from * 0.5;
  let k = 0;
  let segment = 1;
  for (let d = END_CLEAR_M; d <= length - END_CLEAR_M; d += SPOT_WALK_M) {
    if (d < next) continue;
    while (segment < points.length - 1 && at[segment]! < d) segment++;
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = Math.max(1e-6, at[segment]! - at[segment - 1]!);
    const u = Math.min(1, Math.max(0, (d - at[segment - 1]!) / span));
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const tx = (b.x - a.x) / span;
    const tz = (b.z - a.z) / span;
    const preferred = (k + flip) % 2 === 0 ? 1 : -1;
    const offset = offsetM.from + random.next() * (offsetM.to - offsetM.from);
    const along = (random.next() - 0.5) * 2;
    next = d + spacingM.from + random.next() * (spacingM.to - spacingM.from);
    k++;
    for (const side of [preferred, -preferred]) {
      const px = cm(x - tz * side * offset + tx * along);
      const pz = cm(z + tx * side * offset + tz * along);
      const free = out.every((s) => length2(s.x - px, s.z - pz) >= gapM);
      if (free && canPlant(px, pz)) {
        out.push({ x: px, z: pz });
        break;
      }
    }
  }
  return out;
}

/** Místa na stromy u nové cesty – terén, stavby, překážky krajiny, jiné cesty a jiná místa. */
function spotsForRoad(roads: VillageRoads, road: Road, context: SpotContext): RoadTreeSpot[] {
  const { terrain, layer } = context;
  const axes = axisDistance(roads.roads.map((r) => r.points));
  const taken = [
    ...roads.roads.flatMap((r) => r.spots),
    ...roads.trees.map((t) => ({ x: t.x, z: t.z })),
  ];
  const status = layer ? obstacleStatus(context.changes) : null;
  const terrainOk = (x: number, z: number): boolean => {
    const i = Math.round((x - terrain.originX) / terrain.cellM);
    const j = Math.round((z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
    const c = j * terrain.width + i;
    return (
      Number.isFinite(terrain.cost[c]!) && (terrain.flags[c]! & (PATH_WOODLAND | PATH_FORD)) === 0
    );
  };
  const nearObstacle = (x: number, z: number): boolean => {
    if (!layer || !status) return false;
    const r = LAYER_CLEAR_M;
    for (const index of obstaclesNear(layer, x - r, z - r, x + r, z + r)) {
      if (status.kindOf(layer, index) === null) continue;
      if (length2(layer.x[index]! - x, layer.z[index]! - z) < r) return true;
    }
    return false;
  };
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  const seed = deriveSeed(
    context.seed,
    `road:${Math.round(first.x)},${Math.round(first.z)}:${Math.round(last.x)},${Math.round(last.z)}`,
  );
  const spots = roadTreeSpots(road.points, seed, (x, z) => {
    if (taken.some((t) => length2(t.x - x, t.z - z) < ROAD_TREES.gapM)) return false;
    if (axes(x, z) < ROAD_CLEAR_M) return false;
    return terrainOk(x, z) && !context.blocked(x, z) && !nearObstacle(x, z);
  });
  return spots.map((p) => ({ id: roads.nextId++, x: p.x, z: p.z }));
}

/**
 * Stavby vsi, u kterých strom u cesty nevyroste (roads.md – ne ve vsi, na pozemcích, hřbitově,
 * v sadu ani na poli): čtverce dílů polí, sadů, hřbitovů, hájů a pozemků i s okrajem, okolí obydlí
 * a stavenišť, modly a svatyně, milíře a posvátných dubů. Mimo krajinu taky ne.
 */
export function plantingBlocker(
  state: VillageState,
  landscape: Landscape,
): (x: number, z: number) => boolean {
  const size = landscape.size;
  const tiles = new Set<number>();
  const addTile = (cell: { x: number; y: number }): void => {
    tiles.add(cell.y * size + cell.x);
  };
  for (const p of state.parts) if (p.cell) addTile(p.cell);
  for (const c of villageCemeteries(state)) for (const s of c.squares) addTile(s.cell);
  for (const o of villageOrchards(state)) for (const s of o.squares) addTile(s.cell);
  for (const g of state.groves ?? []) for (const cell of g.cells) addTile(cell);
  for (const d of state.dwellings) if (d.plot) addTile(d.plot.cell);
  for (const c of state.constructions) if (c.plot) addTile(c.plot.cell);
  const homes = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
  ];
  const sacred = [
    ...(state.sacredBuildings ?? []).map((b) => ({ kind: b.kind, position: b.position })),
    ...state.constructions.flatMap((c) =>
      (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
        ? [{ kind: c.kind, position: c.position }]
        : [],
    ),
  ].map((b) => ({
    x: b.position.x,
    z: b.position.z,
    half: SACRED_BUILDINGS[b.kind].footprintM / 2 + SACRED_MARGIN_M,
  }));
  const milirs = [
    ...state.dwellings.flatMap((d) => (d.workshop?.craft === 'burner' ? [d.position] : [])),
    ...state.constructions.flatMap((c) =>
      c.craft === 'burner' && c.position !== null ? [c.position] : [],
    ),
  ].map((p) => milirCenter(p));
  const oaks = state.sacredOaks ?? [];
  const m = SQUARE_MARGIN_M;
  const corners: readonly [number, number][] = [
    [0, 0],
    [-m, -m],
    [m, -m],
    [-m, m],
    [m, m],
  ];
  return (x, z) => {
    for (const [dx, dz] of corners) {
      const tile = tileOfWorldPoint(landscape, x + dx, z + dz);
      if (!tile || tiles.has(tile.y * size + tile.x)) return true;
    }
    if (homes.some((h) => length2(h.x - x, h.z - z) < HOMESTEAD_M)) return true;
    if (sacred.some((b) => Math.abs(b.x - x) < b.half && Math.abs(b.z - z) < b.half)) return true;
    const milirReach = MILIR.clearingRadiusM + MILIR_MARGIN_M;
    if (milirs.some(([mx, mz]) => length2(mx - x, mz - z) < milirReach)) return true;
    return oaks.some((o) => length2(o.x - x, o.z - z) < SACRED_OAK_M);
  };
}

/** Druh stromu z losu 0–1: polovina dubů, zbytek jilmy a topoly. */
function speciesOf(r: number): RoadTreeSpecies {
  const { oak, elm } = ROAD_TREES.speciesShare;
  if (r < oak) return 'oak';
  return r < oak + elm ? 'elm' : 'poplar';
}

/**
 * Uchycení stromů (mutuje): na každém volném místě u cesty starší ROAD_TREES.rootAfterYears, kde
 * nestojí stavba ani jiná cesta, se strom uchytí s pravděpodobností ROAD_TREES.rootChancePerYear –
 * los ze seedu vsi, roku a místa (nezávisí na ostatních místech). Druh a délka života se losují
 * při uchycení.
 */
function rootTrees(
  state: VillageState,
  roads: VillageRoads,
  day: number,
  blocked: (x: number, z: number) => boolean,
): void {
  const year = dateOfDayIndex(day).year;
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const axes = axisDistance(roads.roads.map((r) => r.points));
  for (const road of roads.roads) {
    if (day - road.bornDay < ROAD_TREES.rootAfterYears * DAYS_PER_YEAR) continue;
    for (const spot of road.spots) {
      if (occupied.has(spot.id)) continue;
      const random = createRandom(deriveSeed(state.seed, `road-tree:${year}:${spot.id}`));
      if (random.next() >= ROAD_TREES.rootChancePerYear) continue;
      if (blocked(spot.x, spot.z) || axes(spot.x, spot.z) < ROAD_CLEAR_M) continue;
      const species = speciesOf(random.next());
      const life = ROAD_TREES.lifeYears[species];
      const years = life.from + random.next() * (life.to - life.from);
      roads.trees.push({
        id: ROAD_TREE_ID_BASE + roads.nextId++,
        spot: spot.id,
        x: spot.x,
        z: spot.z,
        species,
        rootedDay: day,
        diesDay: day + Math.round(years * DAYS_PER_YEAR),
      });
      occupied.add(spot.id);
    }
  }
}
