// Pohyb divoké zvěře ve scéně (docs/design/wildlife.md – Ve scéně): skupina se pase a stěhuje
// po své trase jako stádo dobytka (livestock-motion.ts, skutečný čas), vzácní (vlci, medvěd,
// liška) jsou vidět jen v části úseků skutečného času a před člověkem blíž než 30 m skupina
// uteče během – rychlejší krok ze stejných klíčových póz, žádný nový vertex atribut. Útěk je
// jen scéna (stav útěku drží wildlife.ts), ostatní je čistá funkce času.

import {
  herdAnimalPose,
  herdArea,
  type Area,
  type HerdState,
  type LivestockClock,
  type LivestockPose,
} from './livestock-motion';
import type { WildGroup } from './wildlife-placement';
import type { WildlifeSpecies } from '../wildlife-view';
import { hash01 } from './smoke-schedule';

/**
 * Útěk: spustí ho člověk (jezdec, později pes) blíž než `triggerM` ke středu skupiny; skupina
 * uteče o `distanceM`, `calmS` stojí a pak se krokem (`returnMps`) vrátí na svou trasu.
 * Rozběh a zastavení `rampS`.
 */
export const FLEE = { triggerM: 30, distanceM: 45, calmS: 75, returnMps: 0.9, rampS: 0.5 } as const;

/** Délka kroku v běhu (m při měřítku 1) – krok morph targetů se točí rychleji. */
const RUN_STRIDE_M: Record<WildlifeSpecies, number> = {
  deer: 3,
  boar: 1.4,
  hare: 1.2,
  fox: 1.6,
  wolf: 2,
  bear: 2,
  fish: 1,
};
/** Krok při návratu je kratší než v běhu (násobek). */
const WALK_STRIDE = 0.55;

/** Úsek skutečného času (s), ve kterém je vzácná skupina vidět, nebo není. */
export const PRESENCE_SLOT_S = 1200;

/** Je skupina teď vidět? Vzácní jen v podílu úseků `presence` (deterministicky ze seedu). */
export function wildPresent(
  group: Pick<WildGroup, 'presence'> & { herd: Pick<WildGroup['herd'], 'seed' | 'phase'> },
  seconds: number,
): boolean {
  if (group.presence >= 1) return true;
  const slot = Math.floor(seconds / PRESENCE_SLOT_S + group.herd.phase);
  return hash01(group.herd.seed, slot, 611) < group.presence;
}

/** Útěk skupiny: posun středu skupiny (m) z `from` do `to` během, pak klid a návrat k 0. */
export interface Flight {
  startS: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  runS: number;
  returnS: number;
}

/** Okamžitý stav útěku: posun, běh / chůze (0–1), směr a ušlá dráha (m). */
export interface FlightState {
  x: number;
  z: number;
  run: number;
  walk: number;
  headingX: number;
  headingZ: number;
  travelled: number;
}

export function createFlightState(): FlightState {
  return { x: 0, z: 0, run: 0, walk: 0, headingX: 0, headingZ: 1, travelled: 0 };
}

/**
 * Nejbližší člověk ke bodu (x, z) do `maxM` – `spots` po trojicích x, y, z (NaN = není vidět,
 * jako poslední polohy postav ve villagers.ts). Nikdo – null.
 */
export function nearestThreat(
  x: number,
  z: number,
  spots: Float32Array,
  maxM: number = FLEE.triggerM,
): { x: number; z: number; d: number } | null {
  let best: { x: number; z: number; d: number } | null = null;
  for (let o = 0; o + 2 < spots.length; o += 3) {
    const sx = spots[o]!;
    if (Number.isNaN(sx)) continue;
    const sz = spots[o + 2]!;
    const d = Math.hypot(sx - x, sz - z);
    if (d <= maxM && (!best || d < best.d)) best = { x: sx, z: sz, d };
  }
  return best;
}

/**
 * Úhly odklonu od přímého směru od člověka (rad) – když je přímo voda nebo stavba; vždy ještě
 * od člověka, ne k němu.
 */
const FLEE_TURNS = [0, 0.5, -0.5, 1, -1, 1.4, -1.4];

/**
 * Začne útěk v čase `nowS`: skupina se středem `center` (už s posunem `offset`) uteče od
 * `threat` rychlostí `speed`. Cíl i půl cesty musí být volná zem (`free`); jinak se zkusí
 * odklon. Kam utéct není – null (skupina zůstane).
 */
export function startFlight(
  nowS: number,
  offset: { x: number; z: number },
  center: { x: number; z: number },
  threat: { x: number; z: number },
  speed: number,
  free: (x: number, z: number) => boolean,
): Flight | null {
  let ax = center.x - threat.x;
  let az = center.z - threat.z;
  const length = Math.hypot(ax, az);
  if (length < 1e-6) {
    ax = 0;
    az = 1;
  } else {
    ax /= length;
    az /= length;
  }
  const d = FLEE.distanceM;
  for (const turn of FLEE_TURNS) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const dx = ax * c - az * s;
    const dz = ax * s + az * c;
    if (!free(center.x + dx * d, center.z + dz * d)) continue;
    if (!free(center.x + dx * d * 0.5, center.z + dz * d * 0.5)) continue;
    const toX = offset.x + dx * d;
    const toZ = offset.z + dz * d;
    return {
      startS: nowS,
      fromX: offset.x,
      fromZ: offset.z,
      toX,
      toZ,
      runS: d / Math.max(0.5, speed),
      returnS: Math.hypot(toX, toZ) / FLEE.returnMps,
    };
  }
  return null;
}

/** Je útěk po klidu (skupina se už vrací nebo je zpět) – nový člověk ho může spustit znovu. */
export function flightCalming(flight: Flight, nowS: number): boolean {
  return nowS - flight.startS >= flight.runS;
}

/** Stav útěku v čase `nowS`; útěk skončil (skupina je zpět na trase) – false. */
export function flightAt(flight: Flight, nowS: number, out: FlightState): boolean {
  const t = nowS - flight.startS;
  const ramp = (a: number, b: number): number =>
    Math.max(0, Math.min(1, a / FLEE.rampS, b / FLEE.rampS));
  out.run = 0;
  out.walk = 0;
  if (t < 0) {
    out.x = flight.fromX;
    out.z = flight.fromZ;
    return true;
  }
  if (t < flight.runS) {
    const u = t / flight.runS;
    const dx = flight.toX - flight.fromX;
    const dz = flight.toZ - flight.fromZ;
    const distance = Math.hypot(dx, dz);
    out.x = flight.fromX + dx * u;
    out.z = flight.fromZ + dz * u;
    out.run = ramp(t, flight.runS - t);
    out.headingX = distance > 1e-6 ? dx / distance : 0;
    out.headingZ = distance > 1e-6 ? dz / distance : 1;
    out.travelled = u * distance;
    return true;
  }
  const back = t - flight.runS - FLEE.calmS;
  if (back < 0) {
    out.x = flight.toX;
    out.z = flight.toZ;
    return true;
  }
  if (back < flight.returnS) {
    const u = back / flight.returnS;
    const distance = Math.hypot(flight.toX, flight.toZ);
    out.x = flight.toX * (1 - u);
    out.z = flight.toZ * (1 - u);
    out.walk = ramp(back, flight.returnS - back);
    out.headingX = distance > 1e-6 ? -flight.toX / distance : 0;
    out.headingZ = distance > 1e-6 ? -flight.toZ / distance : 1;
    out.travelled = u * distance;
    return true;
  }
  out.x = 0;
  out.z = 0;
  return false;
}

/**
 * Kus `index` skupiny v čase: pastva a stěhování jako stádo (`herdAnimalPose` se stavem stáda
 * z `herdState` pro tentýž čas), k tomu posun útěku – během běží (rychlý krok), při návratu jde.
 */
export function wildAnimalPose(
  group: WildGroup,
  index: number,
  clock: LivestockClock,
  state: HerdState,
  flight: FlightState | null,
  out: LivestockPose,
): LivestockPose {
  herdAnimalPose(group.herd, index, clock, state, out);
  if (!flight) return out;
  out.x += flight.x;
  out.z += flight.z;
  const m = Math.max(flight.run, flight.walk);
  if (m <= 0) return out;
  const fx = out.forwardX * (1 - m) + flight.headingX * m;
  const fz = out.forwardZ * (1 - m) + flight.headingZ * m;
  const length = Math.hypot(fx, fz);
  if (length > 1e-6) {
    out.forwardX = fx / length;
    out.forwardZ = fz / length;
  }
  const animal = group.herd.animals[index]!;
  const step = RUN_STRIDE_M[group.species] * animal.scale * (flight.run > 0 ? 1 : WALK_STRIDE);
  const stride = Math.sin((2 * Math.PI * flight.travelled) / step + (animal.seed % 7));
  out.stride = out.stride * (1 - m) + stride * m;
  out.head *= 1 - m;
  return out;
}

/** Kde skupina je (obdélník) – oblast stáda posunutá útěkem. */
export function wildArea(group: WildGroup, state: HerdState, flight: FlightState | null): Area {
  const area = herdArea(group.herd, state);
  if (!flight) return area;
  return {
    minX: area.minX + flight.x,
    maxX: area.maxX + flight.x,
    minZ: area.minZ + flight.z,
    maxZ: area.maxZ + flight.z,
  };
}
