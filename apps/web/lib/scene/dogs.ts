// Psi dvorce ve scéně (wildlife.md – Psi; Ve scéně): smečka u dvorce, na lovu běží s lovci, v den
// jezdecké hlídky pár psů s objížďkou. Pes je kus dobytka (`dog.glb` – livestock.ts) s krokem
// a „hlavou u země“ (morph `lie` = čichání) – žádný nový vertex atribut. Kde pes je, je čistá
// funkce skutečného času a plánu dne (`dogPose`); kolik psů a kdo dnes loví, určuje jádro.
import type { Area, LivestockPose } from './livestock-motion';
import { HUNT_PACE, RIDE_PACE } from './rider-route';
import {
  createRideState,
  isRiding,
  rideArea,
  ridePlansKey,
  rideState,
  type RidePlan,
  type RideState,
} from './riders';
import type { Point } from './villager-plan-types';

/** Velikost psa ve scéně (mastif 1,1 m – stylizovaně jako dobytek trochu větší). */
export const DOG_SCALE = 1.1;
/** Na objížďce běží nejvýš tolik psů (wildlife.md – Jezdecká hlídka: psi zesílí hlídku). */
export const PATROL_DOGS = 3;
/** Délka kroku psa (m na cyklus) krokem a během – u psa velikosti 1. */
const DOG_STRIDE_M = { walk: 0.9, run: 1.7 } as const;
/** Pes u dvorce chodí po oblouku kolem svého místa: poloměr, rozkmit (rad) a doba (s) sem a tam. */
const WANDER = { radius: 1.6, swing: 0.9, periodS: 46 } as const;
/** Psi u dvorce leží na kruhu kolem kůlu u brány – tak daleko (m) a po tolika rad. */
const HOME_RING_M = 4.5;
const HOME_STEP = 0.8;
/** Psi běží vedle vůdce: kus před ním a do stran (m). */
const AHEAD_M = 2.2;
const SIDE_M = 1.5;

/** Plán psa na den: místo u dvorce a s kým dnes běží (lov, hlídka), nebo nikdo. */
export interface DogPlan {
  home: Point;
  /** Počáteční úhel na oblouku kolem místa a posun rozvrhu (s). */
  angle: number;
  phase: number;
  /** Plán vůdce (pěší lovec, jezdec lovu nebo hlídky) – v jeho bloku pes běží s ním. */
  leader: RidePlan | null;
  ahead: number;
  side: number;
}

/** Vstup plánu psů – kolik jich je, kde je kůl u brány, lov a hlídka dne. */
export interface DogPlanInput {
  count: number;
  hitch: Point;
  /** Plány lovu dne – pěší napřed (psi běží s nimi), jinak jezdci. */
  hunt: { rides: readonly RidePlan[]; foot: readonly RidePlan[] };
  /** Plány jízd dne (objížďka) a zda je to hlídka (jádro `patrol`). */
  rides: readonly RidePlan[];
  patrol: boolean;
  /** Smí tu pes stát (ne voda, stavba) – jinak místo u dvorce zkusí dál po kruhu. */
  free(x: number, z: number): boolean;
}

/**
 * Psi dne (wildlife.md – Psi): všichni u dvorce na kruhu kolem kůlu u brány; v den lovu všichni
 * s lovci (pěší napřed – pes loví s pěším, jinak s jezdci), v den hlídky nejvýš `PATROL_DOGS` psů
 * s jezdci objížďky. Vůdci se střídají, psi vedle nich střídavě vlevo a vpravo.
 */
export function dogPlans(input: DogPlanInput): DogPlan[] {
  const { count, hitch, hunt, rides, patrol, free } = input;
  const leaders: readonly RidePlan[] =
    hunt.foot.length > 0
      ? hunt.foot
      : hunt.rides.length > 0
        ? hunt.rides
        : patrol
          ? rides.filter((r) => r.route !== null)
          : [];
  const out: DogPlan[] = [];
  let slot = 0;
  for (let k = 0; k < count; k++) {
    let home: Point = hitch;
    for (let tries = 0; tries < 12; tries++, slot++) {
      const a = slot * HOME_STEP;
      const p = { x: hitch.x + Math.cos(a) * HOME_RING_M, z: hitch.z + Math.sin(a) * HOME_RING_M };
      if (free(p.x, p.z)) {
        home = p;
        slot++;
        break;
      }
    }
    const hunting = hunt.foot.length + hunt.rides.length > 0;
    const leader =
      leaders.length > 0 && (hunting || k < PATROL_DOGS) ? leaders[k % leaders.length]! : null;
    out.push({
      home,
      angle: k * 2.1,
      phase: k * 7.3,
      leader,
      ahead: AHEAD_M * (1 + 0.4 * Math.floor(k / 2)),
      side: (k % 2 === 0 ? 1 : -1) * SIDE_M,
    });
  }
  return out;
}

/** Stav vůdce pro pózu psa – jeden na plán. */
export function createDogState(): RideState {
  return createRideState();
}

/**
 * Póza psa v čase `t` (s skutečného času): v bloku vůdce běží vedle něj (krok podle tempa, kde
 * pěší stojí s oštěpem, čichá); jinak u dvorce chodí po oblouku sem a tam a na krajích čichá.
 */
export function dogPose(
  plan: DogPlan,
  t: number,
  state: RideState,
  out: LivestockPose,
): LivestockPose {
  if (plan.leader && isRiding(plan.leader, t)) {
    rideState(plan.leader, t, state);
    const hx = state.headingX;
    const hz = state.headingZ;
    out.x = state.x + hx * plan.ahead - hz * plan.side;
    out.z = state.z + hz * plan.ahead + hx * plan.side;
    out.forwardX = hx;
    out.forwardZ = hz;
    const stopped = state.pace <= HUNT_PACE.stop * 2;
    out.head = stopped ? 1 : 0;
    const stride = state.pace > RIDE_PACE.walk ? DOG_STRIDE_M.run : DOG_STRIDE_M.walk;
    out.stride = stopped
      ? 0
      : Math.sin((2 * Math.PI * (state.distance + plan.ahead)) / (stride * DOG_SCALE));
    return out;
  }
  const w = (2 * Math.PI * (t + plan.phase)) / WANDER.periodS;
  const theta = plan.angle + WANDER.swing * Math.sin(w);
  const turn = Math.cos(w);
  const dir = turn >= 0 ? 1 : -1;
  out.x = plan.home.x + Math.cos(theta) * WANDER.radius;
  out.z = plan.home.z + Math.sin(theta) * WANDER.radius;
  out.forwardX = -Math.sin(theta) * dir;
  out.forwardZ = Math.cos(theta) * dir;
  // na krajích oblouku (pomalu) čichá, uprostřed popochází
  out.head = Math.min(1, Math.max(0, 1 - Math.abs(turn) * 3));
  out.stride = Math.sin(
    (2 * Math.PI * WANDER.radius * (theta - plan.angle)) / (DOG_STRIDE_M.walk * DOG_SCALE),
  );
  return out;
}

/** Obal míst, kam se pes dostane (u dvorce i trasa vůdce) – pro ořez. */
export function dogArea(plan: DogPlan): Area {
  const r = WANDER.radius + 1;
  const home: Area = {
    minX: plan.home.x - r,
    maxX: plan.home.x + r,
    minZ: plan.home.z - r,
    maxZ: plan.home.z + r,
  };
  if (!plan.leader) return home;
  const lead = rideArea(plan.leader);
  const pad = Math.abs(plan.ahead) + Math.abs(plan.side);
  return {
    minX: Math.min(home.minX, lead.minX - pad),
    maxX: Math.max(home.maxX, lead.maxX + pad),
    minZ: Math.min(home.minZ, lead.minZ - pad),
    maxZ: Math.max(home.maxZ, lead.maxZ + pad),
  };
}

/** Klíč plánů psů – přepočítají se, jen když se změní. */
export function dogPlansKey(plans: readonly DogPlan[]): string {
  return plans
    .map(
      (p) =>
        `${p.home.x.toFixed(1)},${p.home.z.toFixed(1)}:${p.leader ? ridePlansKey([p.leader]) : '-'}`,
    )
    .join('|');
}
