import {
  chickenPoint,
  type ChickenFlock,
  type Herd,
  type HerdKind,
  type LivestockSpecies,
} from './livestock-placement';
import { hash01 } from './smoke-schedule';

// Pohyb domácích zvířat jako čistá funkce času – scéna jen dosadí čas a přepíše instance.
// Každé zvíře žije po úsecích: na začátku úseku se otočí a dojde na nové místo (blízko
// předchozího – hladký šum), pak se pase / zobe nebo stojí. Stádo se během herních dní stěhuje
// po pastvinách své trasy. Nic se nepočítá postupně – stejný čas = stejná póza.

/** Čas pro zvířata. */
export interface LivestockClock {
  /** Skutečný čas (s) – chůze, pastva a zobání jednotlivých zvířat. */
  seconds: number;
  /** Herní den jako spojité číslo (gameDayAt) – kdy se stádo stěhuje na další pastvinu. */
  gameDay: number;
  /** Skutečná délka herního dne (s). */
  daySeconds: number;
}

/** Okamžitý stav zvířete pro vykreslení (výšku a náklon podle terénu doplní scéna). */
export interface LivestockPose {
  x: number;
  z: number;
  /** Kam zvíře míří (vodorovně, jednotkový vektor). */
  forwardX: number;
  forwardZ: number;
  /** Krok −1 … 1 (klíčové pózy nohou z animace chůze), 0 = stojí. */
  stride: number;
  /** Hlava 0 = nahoře, 1 = dole u země (pase se, zobe, ryje). */
  head: number;
}

/** Stav stáda: střed, jestli se právě stěhuje (0–1) a kam, kolik už ušlo (m). */
export interface HerdState {
  x: number;
  z: number;
  moving: number;
  headingX: number;
  headingZ: number;
  travelled: number;
}

/** Obdélník ve vodorovné rovině (m). */
export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Gait {
  /** Délka úseku (s) – jak často zvíře popojde. */
  slotS: { from: number; to: number };
  /** Rychlost chůze (m/s) a délka jednoho celého kroku (m při měřítku 1). */
  speed: number;
  strideM: number;
  /** Jak dlouho se otáčí (s) a jak dlouho zvedá / sklání hlavu (s). */
  turnS: number;
  headS: number;
  /** Podíl úseků, ve kterých se pase (zobe, ryje); jinak stojí s hlavou nahoře. */
  graze: number;
  /** Jak rychle se mění místo, kam zvíře jde (šum na úsek) – nová místa leží blízko předchozích. */
  wander: number;
}

/**
 * Chůze a pastva podle animací 0 A.D. (sheep_walk, goat_walk, bovidae_walk_relax,
 * animal_pig_walk_01, chicken_walk) a skutečných zvířat: ovce a kozy popojdou každých pár
 * sekund, kráva pomaleji a dál, slepice cupitá krátkými kroky.
 */
const GAIT: Record<LivestockSpecies, Gait> = {
  sheep: {
    slotS: { from: 8, to: 13 },
    speed: 0.55,
    strideM: 0.75,
    turnS: 0.8,
    headS: 0.8,
    graze: 0.75,
    wander: 0.3,
  },
  goat: {
    slotS: { from: 6, to: 10 },
    speed: 0.7,
    strideM: 0.8,
    turnS: 0.6,
    headS: 0.6,
    graze: 0.65,
    wander: 0.3,
  },
  cow: {
    slotS: { from: 11, to: 17 },
    speed: 0.6,
    strideM: 1.4,
    turnS: 1.1,
    headS: 1.1,
    graze: 0.75,
    wander: 0.25,
  },
  pig: {
    slotS: { from: 7, to: 11 },
    speed: 0.5,
    strideM: 0.6,
    turnS: 0.7,
    headS: 0.6,
    graze: 0.85,
    wander: 0.3,
  },
  chicken: {
    slotS: { from: 4, to: 7 },
    speed: 0.7,
    strideM: 0.22,
    turnS: 0.3,
    headS: 0.25,
    graze: 0.7,
    wander: 0.18,
  },
};

/** Jak daleko od svého místa ve stádě se zvíře zatoulá (násobek poloměru stáda). */
const HERD_WANDER = 0.42;
/** Slepice obcházejí dům nejvýš o tolik (rad) na každou stranu od svého místa. */
const CHICKEN_WANDER_RAD = 1.2;
/** Nejvýš takový podíl úseku zvíře jde (dál přidá do kroku). */
const MAX_TRAVEL = 0.75;
/** Na kolik úseků se měří délka cesty. */
const PATH_SAMPLES = 6;
/** Kroky se zastaví, když je cesta kratší (m) – zvíře se jen otočí. */
const MIN_STEP_M = 0.05;

/** Stádo se stěhuje tolikrát za herní den, takhle rychle (m/s) a nejvýš takový podíl času. */
const HERD_MOVES_PER_DAY: Record<HerdKind, number> = { flock: 1.5, cattle: 1, swine: 2 };
const HERD_SPEED_MPS: Record<HerdKind, number> = { flock: 0.45, cattle: 0.4, swine: 0.35 };
const HERD_MAX_TRAVEL = 0.7;
/** Rozejití a zastavení stáda (s). */
const HERD_RAMP_S = 1.2;
/** Při stěhování se stádo stáhne k sobě (podíl poloměru). */
const HERD_GATHER = 0.5;

export function createLivestockPose(): LivestockPose {
  return { x: 0, z: 0, forwardX: 0, forwardZ: 1, stride: 0, head: 0 };
}

export function createHerdState(): HerdState {
  return { x: 0, z: 0, moving: 0, headingX: 0, headingZ: 1, travelled: 0 };
}

/** Pastvina `j` trasy – tam a zpět (po poslední zase zpět k první), i pro záporné `j`. */
export function routeAt(route: Herd['route'], j: number): { x: number; z: number } {
  const n = route.length;
  if (n <= 1) return route[0]!;
  const period = 2 * n - 2;
  const m = ((j % period) + period) % period;
  return route[m < n ? m : period - m]!;
}

/** Pořadí pastviny trasy, na které stádo v daném čase je (nebo ke které jde). */
export function herdRouteIndex(herd: Herd, clock: LivestockClock): number {
  const position = clock.gameDay * HERD_MOVES_PER_DAY[herd.kind] + herd.phase;
  return Math.floor(position) + herd.routeOffset;
}

/**
 * Nové stádo po přepočtu vsi (nová obydlí a pole mění trasu): když nová trasa obsahuje
 * pastvinu, na které je staré stádo právě teď, posune se v ní tak, aby tam zůstalo – stádo
 * po stavbě nepřeskočí jinam. Přednost má místo, kam se na novou pastvinu přichází ze stejné
 * předchozí (rozběhnutý přesun pak pokračuje plynule). Jinak se vrátí beze změny.
 */
export function keepRouteSpot(previous: Herd, next: Herd, clock: LivestockClock): Herd {
  if (previous.kind !== next.kind || next.route.length === 0) return next;
  const index = herdRouteIndex(previous, clock);
  const spot = routeAt(previous.route, index);
  const from = routeAt(previous.route, index - 1);
  const same = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
  // Celé kolo tam a zpět – pastvina může být na cestě tam i zpátky.
  const period = Math.max(1, 2 * next.route.length - 2);
  let found = -1;
  for (let j = 0; j < period; j++) {
    if (!same(routeAt(next.route, j), spot)) continue;
    if (same(routeAt(next.route, j - 1), from)) {
      found = j;
      break;
    }
    if (found < 0) found = j;
  }
  if (found < 0) return next;
  return { ...next, routeOffset: found - herdRouteIndex({ ...next, routeOffset: 0 }, clock) };
}

/**
 * Kde je stádo: herní den určí, na které pastvině trasy má být; na začátku každého období
 * k ní dojde z předchozí (rovnoměrně, s rozejitím a zastavením).
 */
export function herdState(herd: Herd, clock: LivestockClock, out: HerdState): HerdState {
  const perDay = HERD_MOVES_PER_DAY[herd.kind];
  const position = clock.gameDay * perDay + herd.phase;
  const j = Math.floor(position) + herd.routeOffset;
  const periodS = clock.daySeconds / perDay;
  const elapsed = (position - Math.floor(position)) * periodS;
  const from = routeAt(herd.route, j - 1);
  const to = routeAt(herd.route, j);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const travelS = Math.min(distance / HERD_SPEED_MPS[herd.kind], periodS * HERD_MAX_TRAVEL);
  const u = travelS > 0 ? clamp01(elapsed / travelS) : 1;
  out.x = from.x + dx * u;
  out.z = from.z + dz * u;
  out.travelled = u * distance;
  const ramp = Math.min(HERD_RAMP_S, travelS / 2);
  out.moving =
    travelS > 0
      ? Math.min(smoothstep(0, ramp, elapsed), smoothstep(0, ramp, travelS - elapsed))
      : 0;
  out.headingX = distance > 1e-6 ? dx / distance : 0;
  out.headingZ = distance > 1e-6 ? dz / distance : 1;
  return out;
}

/** Zvíře `index` stáda v čase (stav stáda z `herdState` pro tentýž čas). */
export function herdAnimalPose(
  herd: Herd,
  index: number,
  clock: LivestockClock,
  state: HerdState,
  out: LivestockPose,
): LivestockPose {
  const animal = herd.animals[index]!;
  const reach = herd.radiusM;
  const amp = reach * HERD_WANDER;
  const offsetTarget = (k: number, p: Point): Point => {
    const t = k * GAIT[animal.species].wander;
    let x = animal.homeX + amp * valueNoise(animal.seed, t, 0);
    let z = animal.homeZ + amp * valueNoise(animal.seed, t, 1);
    const r = Math.hypot(x, z);
    if (r > reach) {
      x *= reach / r;
      z *= reach / r;
    }
    p.x = x;
    p.z = z;
    return p;
  };
  const path = (k: number, u: number, p: Point): Point => {
    offsetTarget(k - 1, A);
    offsetTarget(k, B);
    p.x = A.x + (B.x - A.x) * u;
    p.z = A.z + (B.z - A.z) * u;
    return p;
  };
  wander(animal.species, animal.seed, animal.scale, clock.seconds, path, out);
  // Při stěhování jde celé stádo v hloučku za vedoucím směrem.
  const m = state.moving;
  const gather = 1 - HERD_GATHER * m;
  out.x = state.x + out.x * gather;
  out.z = state.z + out.z * gather;
  if (m > 0) {
    const fx = out.forwardX * (1 - m) + state.headingX * m;
    const fz = out.forwardZ * (1 - m) + state.headingZ * m;
    const length = Math.hypot(fx, fz);
    if (length > 1e-6) {
      out.forwardX = fx / length;
      out.forwardZ = fz / length;
    }
    const step = GAIT[animal.species].strideM * animal.scale;
    const herdStride = Math.sin((2 * Math.PI * state.travelled) / step + animal.seed);
    out.stride = out.stride * (1 - m) + herdStride * m;
    out.head *= 1 - m;
  }
  return out;
}

/** Slepice `index` u svého obydlí: obchází dům, zobe, chvíli stojí. */
export function chickenPose(
  flock: ChickenFlock,
  index: number,
  clock: LivestockClock,
  out: LivestockPose,
): LivestockPose {
  const chicken = flock.chickens[index]!;
  const arc = flock.arc;
  const reach = flock.reachM;
  // Místo kolem domu jako (úhel, odstup) – mezi dvěma místy jde slepice kolem domu, ne skrz.
  const target = (k: number, p: Point): Point => {
    const t = k * GAIT.chicken.wander;
    const swing = valueNoise(chicken.seed, t, 0);
    if (arc) {
      const span = arc.to - arc.from;
      const home = span > 0 ? (chicken.home - arc.from) / span : 0.5;
      p.x = arc.from + span * clamp01(home + 0.6 * swing);
    } else {
      p.x = chicken.home + CHICKEN_WANDER_RAD * swing;
    }
    p.z = reach.from + (reach.to - reach.from) * (0.5 + 0.5 * valueNoise(chicken.seed, t, 1));
    return p;
  };
  const path = (k: number, u: number, p: Point): Point => {
    target(k - 1, A);
    target(k, B);
    const [x, z] = chickenPoint(flock, A.x + (B.x - A.x) * u, A.z + (B.z - A.z) * u);
    p.x = x;
    p.z = z;
    return p;
  };
  return wander('chicken', chicken.seed, chicken.scale, clock.seconds, path, out);
}

interface Point {
  x: number;
  z: number;
}

// Pomocné body – pohyb v každém snímku nic nealokuje.
const A: Point = { x: 0, z: 0 };
const B: Point = { x: 0, z: 0 };
const P: Point = { x: 0, z: 0 };
const Q: Point = { x: 0, z: 0 };
const START: Point = { x: 0, z: 0 };
const PREV: Point = { x: 0, z: 0 };
const NEXT: Point = { x: 0, z: 0 };

/**
 * Úseky zvířete: `path(k, u)` je cesta úseku `k` (u = 0 začátek, 1 cíl). Na začátku úseku
 * se otočí po cestě, dojde do cíle a pak se pase nebo stojí; před dalším úsekem zvedne hlavu.
 */
function wander(
  species: LivestockSpecies,
  seed: number,
  scale: number,
  timeS: number,
  path: (k: number, u: number, out: Point) => Point,
  out: LivestockPose,
): LivestockPose {
  const gait = GAIT[species];
  const slotS = gait.slotS.from + (gait.slotS.to - gait.slotS.from) * hash01(seed, 0, 81);
  const local = timeS + hash01(seed, 1, 81) * slotS;
  const k = Math.floor(local / slotS);
  const tau = local - k * slotS;

  // Délka cesty po úsecích – slepice obchází dům obloukem, ne přímo.
  let distance = 0;
  path(k, 0, START);
  for (let i = 1; i <= PATH_SAMPLES; i++) {
    const sx = START.x;
    const sz = START.z;
    path(k, i / PATH_SAMPLES, START);
    distance += Math.hypot(START.x - sx, START.z - sz);
  }
  const startS = gait.turnS * 0.5;
  const travelS = distance > MIN_STEP_M ? Math.min(distance / gait.speed, slotS * MAX_TRAVEL) : 0;
  const walked = tau - startS;
  const u = travelS > 0 ? clamp01(walked / travelS) : 1;
  path(k, u, P);
  out.x = P.x;
  out.z = P.z;

  // Směr: tečna cesty; na začátku úseku se zvíře otočí z konce předchozí cesty.
  tangent(path, k, u, seed, NEXT);
  if (tau < gait.turnS) {
    tangent(path, k - 1, 1, seed, PREV);
    const turn = smoothstep(0, gait.turnS, tau);
    const fx = PREV.x * (1 - turn) + NEXT.x * turn;
    const fz = PREV.z * (1 - turn) + NEXT.z * turn;
    const length = Math.hypot(fx, fz);
    // Obrat o 180° – přes kolmý směr, ať se nezastaví v nule.
    out.forwardX = length > 1e-3 ? fx / length : -PREV.z;
    out.forwardZ = length > 1e-3 ? fz / length : PREV.x;
  } else {
    out.forwardX = NEXT.x;
    out.forwardZ = NEXT.z;
  }

  const walking =
    travelS > 0 ? Math.min(smoothstep(0, 0.25, walked), smoothstep(0, 0.25, travelS - walked)) : 0;
  out.stride =
    Math.sin((2 * Math.PI * u * distance) / (gait.strideM * scale) + (seed % 7)) * walking;

  const arrived = startS + travelS;
  let head = 0;
  if (tau > arrived) {
    const lowered = smoothstep(arrived, arrived + gait.headS, tau);
    const grazes = hash01(seed, k, 82) < gait.graze;
    head = lowered * (grazes ? grazeHead(species, seed, k, tau) : 0);
  }
  out.head = head * (1 - smoothstep(slotS - gait.headS, slotS, tau));
  return out;
}

/** Jak nízko je hlava při pastvě: ovce a krávy jen pohybují hlavou, prase ryje, slepice zobe. */
function grazeHead(species: LivestockSpecies, seed: number, k: number, tau: number): number {
  const phase = (seed % 13) * 0.7;
  if (species === 'chicken') {
    // Klovnutí: v každém okně 0,7 s nejspíš jedno rychlé (0,3 s) dolů a nahoru.
    const window = Math.floor(tau / 0.7);
    if (hash01(seed, k * 64 + window, 85) >= 0.7) return 0.25;
    const start = window * 0.7 + hash01(seed, k * 64 + window, 86) * 0.35;
    const t = (tau - start) / 0.3;
    return 0.25 + (t > 0 && t < 1 ? 0.75 * Math.sin(Math.PI * t) : 0);
  }
  if (species === 'pig') return 0.7 + 0.3 * Math.abs(Math.sin(tau * 2.2 + phase));
  return 0.86 + 0.14 * Math.sin(tau * 1.6 + phase);
}

/** Směr cesty úseku `k` v bodě `u` (jednotkový); krátká cesta → náhodný směr úseku. */
function tangent(
  path: (k: number, u: number, out: Point) => Point,
  k: number,
  u: number,
  seed: number,
  out: Point,
): Point {
  const a = Math.max(0, u - 0.05);
  const b = Math.min(1, u + 0.05);
  path(k, a, Q);
  const qx = Q.x;
  const qz = Q.z;
  path(k, b, Q);
  const dx = Q.x - qx;
  const dz = Q.z - qz;
  const length = Math.hypot(dx, dz);
  if (length > MIN_STEP_M * 0.1) {
    out.x = dx / length;
    out.z = dz / length;
  } else {
    const angle = hash01(seed, k, 83) * Math.PI * 2;
    out.x = Math.sin(angle);
    out.z = Math.cos(angle);
  }
  return out;
}

/** Oblast, kde se stádo právě pase (střed ± poloměr a rezerva na velikost zvířat). */
export function herdArea(herd: Herd, state: Pick<HerdState, 'x' | 'z'>): Area {
  const r = herd.radiusM + 2.5;
  return { minX: state.x - r, maxX: state.x + r, minZ: state.z - r, maxZ: state.z + r };
}

/** Všechny pastviny trasy stáda – kam až se může dostat. */
export function routeArea(herd: Herd): Area {
  const r = herd.radiusM + 2.5;
  return {
    minX: Math.min(...herd.route.map((p) => p.x)) - r,
    maxX: Math.max(...herd.route.map((p) => p.x)) + r,
    minZ: Math.min(...herd.route.map((p) => p.z)) - r,
    maxZ: Math.max(...herd.route.map((p) => p.z)) + r,
  };
}

/** Kam až slepice od domu dojdou. */
export function chickenArea(flock: ChickenFlock): Area {
  const area = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < 16; i++) {
    const [x, z] = chickenPoint(flock, (i / 16) * Math.PI * 2, flock.reachM.to + 1);
    area.minX = Math.min(area.minX, x);
    area.maxX = Math.max(area.maxX, x);
    area.minZ = Math.min(area.minZ, z);
    area.maxZ = Math.max(area.maxZ, z);
  }
  // Rohy obdélníku leží mezi vzorky – rezerva.
  const pad = 1.5;
  return {
    minX: area.minX - pad,
    maxX: area.maxX + pad,
    minZ: area.minZ - pad,
    maxZ: area.maxZ + pad,
  };
}

/** Hladký šum −1 … 1 v jedné ose (hodnoty v celých číslech, mezi nimi plynule). */
export function valueNoise(seed: number, t: number, channel: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash01(seed, i, 90 + channel) * 2 - 1;
  const b = hash01(seed, i + 1, 90 + channel) * 2 - 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
