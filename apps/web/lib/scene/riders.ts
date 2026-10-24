// Jezdci ve scéně (horses.md – Ve scéně): jezdec je postava `man.glb` s klipem sedu (villagers.ts),
// kůň kus fauny s krokem a klusem (livestock.ts). Obojí počítá polohu z téhož plánu jízdy dne
// (`RidePlan`) a téže čisté funkce času (`rideState`) – jezdec sedí na koni bez vazby mezi meshi.
// Žádný nový vertex atribut: sed je klip, výška sedla jen posun matice instance (`VillagerPose.lift`).
// Kdo, kdy a na kterém koni jede, určuje jádro (`SceneLord.riders`, `lordRides`); scéna jen kreslí.
import type { SceneLord, SceneRide, SceneVillage } from '../village-view';
import type { DayWindow } from './caravan';
import { LIVESTOCK_EPOCH_MS, type Area, type LivestockPose } from './livestock-motion';
import {
  fieldRing,
  loopRoute,
  RIDE_PACE,
  rideDistance,
  rideGroups,
  rideSpot,
  trailRoute,
  WINTER_RING_M,
  type RideLeg,
  type RideRoute,
  type RideSpot,
} from './rider-route';
import type { TrainingSpot } from './training-ground-layout';
import type { PoseFn } from './villager-motion';
import { squareCorners } from './villager-plan-geometry';
import { WINTER_MONTHS, type Point, type Square } from './villager-plan-types';

/** Jezdci jsou venku ve dne (h herního dne) – v noci kůň stojí u kůlu a jezdec je doma. */
export const RIDE_HOURS: readonly [number, number] = [7, 19];
/** Velikost jezdeckého koně ve scéně (jako kůň na pastvě – 1,0–1,12). */
export const RIDE_HORSE_SCALE = 1.06;
/**
 * Výška sedu nad zemí (m) u koně velikosti 1 – o tolik se zvedne matice jezdce (klip sedu má
 * pánev v počátku jako jezdci 0 A.D. na bodu `rider`).
 */
export const RIDER_SEAT_M = 1.0;
/** Skupina jede po dvou: rozestup za sebou a do strany (m). */
const GAP_M = 3.6;
const SIDE_M = 0.9;
/** Krok koně (m na jeden cyklus) krokem a klusem – u koně velikosti 1. */
const STRIDE_M = { walk: 1.8, trot: 2.8 } as const;
/** Koně u kůlu stojí vedle sebe po tolika m. */
const HITCH_GAP_M = 1.6;
/** Kůň stojí tak daleko před kůlem (m). */
const HITCH_REACH_M = 1.2;

/** Plán jízdy jednoho jezdce na den. */
export interface RidePlan {
  riderId: number;
  horseId: number;
  /** Trasa dne; null – nejede se (není kudy), kůň stojí u kůlu. */
  route: RideRoute | null;
  /** Vzdálenost za čelem skupiny (m) a stranou od osy (m, vlevo kladně). */
  behind: number;
  side: number;
  /** Posun skupiny po trase (m) – víc skupin jede po okruhu rozestoupeně. */
  offset: number;
  /** Kde kůň stojí, když se nejede – u kůlu u brány dvorce, čelem ke kůlu. */
  hitch: TrainingSpot;
  window: DayWindow | null;
}

/** Kde jezdec s koněm je: poloha, směr, tempo (0 stojí), ujetá vzdálenost a jestli jede. */
export interface RideState extends RideSpot {
  riding: boolean;
  distance: number;
}

export function createRideState(): RideState {
  return { x: 0, z: 0, headingX: 0, headingZ: 1, pace: 0, riding: false, distance: 0 };
}

/** Hodina herního dne (0–24) v čase `t` (s – villagerSeconds); bez hodin světa null. */
export function hourOfDay(window: DayWindow | null, t: number): number | null {
  if (!window || window.endMs <= window.startMs) return null;
  const length = window.endMs - window.startMs;
  const ms = t * 1000 + LIVESTOCK_EPOCH_MS - window.startMs;
  return ((((ms % length) + length) % length) / length) * 24;
}

/** Vstup plánu jízd – ves, rodina dne, kůl u brány, obydlí a cesta mimo pole. */
export interface RidePlanInput {
  village: Pick<SceneVillage, 'fields' | 'trails' | 'labor'>;
  lord: SceneLord;
  hitch: TrainingSpot;
  homes: readonly Point[];
  leg: RideLeg;
  window: DayWindow | null;
}

/**
 * Plány jízd dne (horses.md – Kdy a kam se jezdí): jezdci (`SceneLord.riders`) po skupinách nejvýš
 * 4 – denní objížďka okraje polí (v zimě kratší okruh kolem vsi), nebo v den jízdy k hranici po
 * zemské stezce (`borderTrailId`); doprovod výpravy (`escort`) sám po její stezce. Víc skupin jede
 * po trase rozestoupeně. Koně stojí u kůlu vedle sebe.
 */
export function ridePlans(input: RidePlanInput): RidePlan[] {
  const { village, lord, hitch, homes, leg, window } = input;
  const riders = lord.riders ?? [];
  const all = [...riders, ...(lord.escort ? [lord.escort] : [])];
  if (all.length === 0) return [];
  const fields: Square[] = village.fields.flatMap((f) => f.parts);
  const trail = (id: number | undefined): readonly Point[] =>
    id === undefined ? [] : (village.trails?.find((t) => t.id === id && t.built)?.points ?? []);
  const winter = WINTER_MONTHS.includes(village.labor?.month ?? 0);
  const seeds = winter
    ? homes
    : [...fields.flatMap((f) => squareCorners(f).map(([x, z]) => ({ x, z }))), ...homes];
  const loop = (): RideRoute | null =>
    loopRoute(hitch, fieldRing(fields, seeds, winter ? WINTER_RING_M : undefined), fields, leg);
  const border = lord.borderTrailId;
  const patrol =
    riders.length === 0
      ? null
      : ((border !== undefined ? trailRoute(hitch, trail(border), fields, leg) : null) ?? loop());
  const plans: RidePlan[] = [];
  const at = (index: number): TrainingSpot => {
    // vedle sebe podél kůlu (kolmo na směr ke kůlu), střídavě vlevo a vpravo
    const k = Math.ceil(index / 2) * (index % 2 === 0 ? 1 : -1) * HITCH_GAP_M;
    return {
      x: hitch.x - hitch.headingX * HITCH_REACH_M - hitch.headingZ * k,
      z: hitch.z - hitch.headingZ * HITCH_REACH_M + hitch.headingX * k,
      headingX: hitch.headingX,
      headingZ: hitch.headingZ,
    };
  };
  const groups = rideGroups(riders);
  groups.forEach((group, g) => {
    group.forEach((ride: SceneRide, k) => {
      plans.push({
        riderId: ride.id,
        horseId: ride.horseId,
        route: patrol,
        behind: Math.floor(k / 2) * GAP_M,
        side: group.length === 1 ? 0 : (k % 2 === 0 ? 1 : -1) * SIDE_M,
        offset: patrol ? (g * patrol.length) / groups.length : 0,
        hitch: at(plans.length),
        window,
      });
    });
  });
  if (lord.escort) {
    plans.push({
      riderId: lord.escort.id,
      horseId: lord.escort.horseId,
      route: trailRoute(hitch, trail(lord.escort.trailId), fields, leg),
      behind: 0,
      side: 0,
      offset: 0,
      hitch: at(plans.length),
      window,
    });
  }
  return plans;
}

/**
 * Kde je jezdec s koněm v čase `t` (s skutečného času): ve dne (`RIDE_HOURS`, bez hodin světa
 * vždy) po trase – ujetá vzdálenost je čistá funkce času (`rideDistance`), skupina za čelem po
 * dvou; jinak (noc, bez trasy) kůň stojí u kůlu.
 */
export function rideState(plan: RidePlan, t: number, out: RideState): RideState {
  const hour = hourOfDay(plan.window, t);
  const day = hour === null || (hour >= RIDE_HOURS[0] && hour < RIDE_HOURS[1]);
  if (!plan.route || !day) {
    out.x = plan.hitch.x;
    out.z = plan.hitch.z;
    out.headingX = plan.hitch.headingX;
    out.headingZ = plan.hitch.headingZ;
    out.pace = 0;
    out.riding = false;
    out.distance = 0;
    return out;
  }
  const s = rideDistance(plan.route, t) + plan.offset - plan.behind;
  rideSpot(plan.route, s, out);
  out.x -= out.headingZ * plan.side;
  out.z += out.headingX * plan.side;
  out.riding = true;
  out.distance = s;
  return out;
}

/** Obal míst, kam se kůň plánu dostane (trasa i kůl) – pro ořez. */
export function rideArea(plan: RidePlan): Area {
  const points: Point[] = [plan.hitch, ...(plan.route?.points ?? [])];
  const pad = Math.abs(plan.side) + 2;
  return {
    minX: Math.min(...points.map((p) => p.x)) - pad,
    maxX: Math.max(...points.map((p) => p.x)) + pad,
    minZ: Math.min(...points.map((p) => p.z)) - pad,
    maxZ: Math.max(...points.map((p) => p.z)) + pad,
  };
}

/** Póza jezdeckého koně (livestock.ts): na trase krok a klus, u kůlu stojí. */
export function rideHorsePose(
  plan: RidePlan,
  t: number,
  state: RideState,
  out: LivestockPose,
): LivestockPose {
  rideState(plan, t, state);
  out.x = state.x;
  out.z = state.z;
  out.forwardX = state.headingX;
  out.forwardZ = state.headingZ;
  out.head = 0;
  const stride = (state.pace > RIDE_PACE.walk ? STRIDE_M.trot : STRIDE_M.walk) * RIDE_HORSE_SCALE;
  out.stride = state.riding ? Math.sin((2 * Math.PI * state.distance) / stride) : 0;
  return out;
}

/**
 * Póza jezdce (villagers.ts): na koni klip sedu – krokem `ride`, klusem `ride-trot` – zvednutý
 * o výšku sedu; když kůň stojí u kůlu, jezdec ve dne stojí vedle něj, v noci je doma.
 */
export function riderPose(plan: RidePlan): PoseFn {
  const state = createRideState();
  return (t, _herds, out) => {
    rideState(plan, t, state);
    out.headingX = state.headingX;
    out.headingZ = state.headingZ;
    out.pace = 1;
    if (state.riding) {
      out.x = state.x;
      out.z = state.z;
      out.clip = state.pace > RIDE_PACE.walk ? 'ride-trot' : 'ride';
      out.lift = RIDER_SEAT_M * RIDE_HORSE_SCALE;
      return out;
    }
    // vedle koně u kůlu (vlevo od něj)
    out.x = state.x - state.headingZ * 0.8;
    out.z = state.z + state.headingX * 0.8;
    out.clip = 'idle';
    const hour = hourOfDay(plan.window, t);
    if (hour !== null && (hour < RIDE_HOURS[0] || hour >= RIDE_HOURS[1])) out.hidden = true;
    return out;
  };
}

/** Klíč plánů jízd – koně se přepočítají, jen když se změní. */
export function ridePlansKey(plans: readonly RidePlan[]): string {
  return plans
    .map(
      (p) =>
        `${p.riderId}:${p.horseId}:${p.route ? `${p.route.length.toFixed(1)}/${p.route.points.length}` : '-'}:${p.offset.toFixed(1)}:${p.hitch.x.toFixed(1)},${p.hitch.z.toFixed(1)}:${p.window?.startMs ?? ''}`,
    )
    .join('|');
}
