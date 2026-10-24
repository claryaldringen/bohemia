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
// předchozího – hladký šum), pak se pase / zobe nebo stojí. Stádo je na pastvině pár minut
// a pak se krokem přestěhuje na další pastvinu své trasy. Všechno běží ve skutečném čase, ne
// v herním – ve zrychleném světě (herní den ≈ 3 s) by zvířata jinak běhala (Martin). Nic se
// nepočítá postupně – stejný okamžik = stejná póza.

/** Počátek času zvířat (skutečný čas, ms) – menší čísla než od roku 1970. */
export const LIVESTOCK_EPOCH_MS = Date.UTC(2026, 0, 1);

/** Čas pro zvířata. */
export interface LivestockClock {
  /** Skutečný čas (s od LIVESTOCK_EPOCH_MS) – chůze, pastva i stěhování stád. */
  seconds: number;
}

/** Čas zvířat ve skutečný okamžik `nowMs` (epoch ms) – nezávisí na herním světě. */
export function livestockClock(nowMs: number): LivestockClock {
  return { seconds: (nowMs - LIVESTOCK_EPOCH_MS) / 1000 };
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
  /**
   * Kolik sekund stádo celkem prošlo při stěhování – po tu dobu má každé zvíře vlastní pastvu
   * a popocházení zastavené (jde s hloučkem), takže se jeho chůze se stěhováním nesčítá.
   */
  pausedS: number;
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
 * animal_pig_walk_01, chicken_walk) a skutečných zvířat: ovce, kozy a krávy se desítky sekund
 * pasou a pak popojdou pár metrů krokem (≈ 0,8–1 m/s), prase pomalu ryje, slepice zobe
 * a cupitá o kousek častěji.
 */
const GAIT: Record<LivestockSpecies, Gait> = {
  sheep: {
    slotS: { from: 18, to: 40 },
    speed: 0.9,
    strideM: 0.8,
    turnS: 1.0,
    headS: 1.0,
    graze: 0.8,
    wander: 0.25,
  },
  goat: {
    slotS: { from: 14, to: 30 },
    speed: 1.0,
    strideM: 0.85,
    turnS: 0.8,
    headS: 0.8,
    graze: 0.7,
    wander: 0.28,
  },
  cow: {
    slotS: { from: 25, to: 50 },
    speed: 0.9,
    strideM: 1.5,
    turnS: 1.4,
    headS: 1.3,
    graze: 0.8,
    wander: 0.22,
  },
  horse: {
    slotS: { from: 25, to: 50 },
    speed: 1.0,
    strideM: 1.7,
    turnS: 1.2,
    headS: 1.1,
    graze: 0.8,
    wander: 0.22,
  },
  foal: {
    slotS: { from: 18, to: 36 },
    speed: 1.1,
    strideM: 1.1,
    turnS: 0.9,
    headS: 0.9,
    graze: 0.7,
    wander: 0.3,
  },
  pig: {
    slotS: { from: 20, to: 40 },
    speed: 0.6,
    strideM: 0.6,
    turnS: 1.0,
    headS: 0.8,
    graze: 0.88,
    wander: 0.25,
  },
  chicken: {
    slotS: { from: 8, to: 14 },
    speed: 0.6,
    strideM: 0.22,
    turnS: 0.35,
    headS: 0.3,
    graze: 0.7,
    wander: 0.15,
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

/**
 * Stádo zůstane na pastvině několik minut skutečného času (s) a pak k další dojde v hloučku
 * krokem – přesun trvá vždy stejně dlouho (s): sousední pastviny jsou nejvýš 22 m od sebe,
 * stádo tak jde nejvýš ≈ 0,8 m/s, k bližší pastvině pomaleji.
 */
const HERD_STAY_S: Record<HerdKind, { from: number; to: number }> = {
  flock: { from: 240, to: 420 },
  cattle: { from: 300, to: 540 },
  swine: { from: 180, to: 360 },
};
const HERD_TRAVEL_S: Record<HerdKind, number> = { flock: 28, cattle: 28, swine: 32 };
/** Rozejití a zastavení stáda (s). */
const HERD_RAMP_S = 2;

export function createLivestockPose(): LivestockPose {
  return { x: 0, z: 0, forwardX: 0, forwardZ: 1, stride: 0, head: 0 };
}

export function createHerdState(): HerdState {
  return { x: 0, z: 0, moving: 0, headingX: 0, headingZ: 1, travelled: 0, pausedS: 0 };
}

/** Pastvina `j` trasy – tam a zpět (po poslední zase zpět k první), i pro záporné `j`. */
export function routeAt(route: Herd['route'], j: number): { x: number; z: number } {
  const n = route.length;
  if (n <= 1) return route[0]!;
  const period = 2 * n - 2;
  const m = ((j % period) + period) % period;
  return route[m < n ? m : period - m]!;
}

/** Jak dlouho (s) je stádo na jedné pastvině i s přesunem k ní. */
export function herdPeriodS(herd: Pick<Herd, 'kind' | 'seed'>): number {
  const stay = HERD_STAY_S[herd.kind];
  return stay.from + (stay.to - stay.from) * hash01(herd.seed, 5, 87);
}

/** Pořadí pastviny trasy, na které stádo v daném čase je (nebo ke které jde). */
export function herdRouteIndex(herd: Herd, clock: LivestockClock): number {
  return Math.floor(clock.seconds / herdPeriodS(herd) + herd.phase) + herd.routeOffset;
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
 * Kde je stádo: čas určí, na které pastvině trasy má být (každá na pár minut); na začátku
 * období k ní dojde z předchozí krokem (rovnoměrně, s rozejitím a zastavením). Přesun trvá
 * vždy stejně dlouho, takže celkovou dobu stěhování (`pausedS`) jde spočítat bez historie.
 */
export function herdState(herd: Herd, clock: LivestockClock, out: HerdState): HerdState {
  const periodS = herdPeriodS(herd);
  const position = clock.seconds / periodS + herd.phase;
  const j = Math.floor(position) + herd.routeOffset;
  const elapsed = (position - Math.floor(position)) * periodS;
  const from = routeAt(herd.route, j - 1);
  const to = routeAt(herd.route, j);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  // Sousední pastviny trasy jsou vždy různé – jen stádo s jedinou pastvinou se nestěhuje.
  const travelS = herd.route.length > 1 ? Math.min(HERD_TRAVEL_S[herd.kind], periodS / 2) : 0;
  const u = travelS > 0 ? clamp01(elapsed / travelS) : 1;
  // Přesuny všech dřívějších období a dosavadní část současného (spojité – na konci období
  // je přesun dávno hotový, další začíná od nuly).
  out.pausedS = Math.floor(position) * travelS + Math.min(elapsed, travelS);
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
  // Vlastní čas zvířete stojí, dokud se stádo stěhuje – chůze se nesčítá s přesunem.
  wander(animal.species, animal.seed, animal.scale, clock.seconds - state.pausedS, path, out);
  // Při stěhování jde celé stádo v hloučku jedním směrem (cestu volnou v šířce stáda hlídá
  // livestock-placement.ts).
  const m = state.moving;
  out.x += state.x;
  out.z += state.z;
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
      // v širokém oblouku (dům omezuje jen kus kolem – soused, zahrádka) jako dokola: nejvýš
      // CHICKEN_WANDER_RAD od domova, jinak by obcházela skoro celý dům a utíkala
      const swingRad = Math.min(CHICKEN_WANDER_RAD, 0.6 * (arc.to - arc.from));
      p.x = Math.min(arc.to, Math.max(arc.from, chicken.home + swingRad * swing));
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
