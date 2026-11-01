// Jezdci ve scéně (horses.md – Ve scéně): jezdec je postava `man.glb` s klipem sedu (villagers.ts),
// kůň kus fauny s krokem a klusem (livestock.ts). Obojí počítá polohu z téhož plánu jízdy dne
// (`RidePlan`) a téže čisté funkce času (`rideState`) – jezdec sedí na koni bez vazby mezi meshi.
// Žádný nový vertex atribut: sed je klip, výška sedla jen posun matice instance (`VillagerPose.lift`).
// Kdo, kdy a na kterém koni jede, určuje jádro (`SceneLord.riders`, `lordRides`); scéna jen kreslí.
import type { SceneHunt, SceneLord, SceneRide, SceneVillage } from '../village-view';
import type { DayWindow } from './caravan';
import { LIVESTOCK_EPOCH_MS, type Area, type LivestockPose } from './livestock-motion';
import {
  fieldRing,
  cutWay,
  HUNT_PACE,
  HUNT_SWEEP_M,
  HUNT_WAY_SHARE,
  huntRoute,
  loopRoute,
  RIDE_PACE,
  rideDistance,
  rideGroups,
  rideSpot,
  trailRoute,
  wayLength,
  WINTER_RING_M,
  type RideLeg,
  type RideRoute,
  type RideSpot,
} from './rider-route';
import type { TrainingSpot } from './training-ground-layout';
import type { PoseFn } from './villager-motion';
import { squareCorners } from './villager-plan-geometry';
import { WINTER_MONTHS, type Point, type Square } from './villager-plan-types';

/**
 * Bloky výcviku dne (lord.md – Den rodiny: dopoledne a odpoledne; návrh Clauda): začínají v 8 a ve
 * 14 h, v každém polovina hodin dne – napřed luk, pak boj, pak jízda (`drillAt`, `rideBlocks`).
 */
export const DRILL_BLOCKS_H: readonly number[] = [8, 14];
/** Jezdec mimo blok jízdy (bez výcviku) je vidět ve dne (h) – v noci je doma. */
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
  /** Posun skupiny po trase (m); bloky jízdy začínají vždy u kůlu, takže 0. */
  offset: number;
  /**
   * Bloky jízdy dne (h herního dne, od–do): jede se jen v nich, jinak jezdec cvičí na dvorku a kůň
   * je v ohradě. Null – bez rozvrhu (ukázky bez hodin světa) se jede nepřetržitě.
   */
  blocks: readonly (readonly [number, number])[] | null;
  /** Kde kůň stojí, když se nejede – u kůlu u brány dvorce, čelem ke kůlu. */
  hitch: TrainingSpot;
  window: DayWindow | null;
  /**
   * Hodiny dne, kdy kůň stojí uvázaný u kůlu `hitch` mimo ohradu (kování u branky ohrady –
   * shoeing-plan.ts); jezdec nejede (`route` null). Bez údaje jen jízdy.
   */
  tied?: readonly (readonly [number, number])[];
}

/** Délka herního dne bez hodin světa (s – ukázky): 365 skutečných dní = 1000 herních let. */
export const FALLBACK_DAY_S = 86.4;

/** Hodina herního dne v čase `t` – z hodin světa, bez nich dokola po `FALLBACK_DAY_S`. */
export function dayHour(window: DayWindow | null, t: number): number {
  const hour = hourOfDay(window, t);
  if (hour !== null) return hour;
  return ((((t % FALLBACK_DAY_S) + FALLBACK_DAY_S) % FALLBACK_DAY_S) / FALLBACK_DAY_S) * 24;
}

/** Skutečných sekund na herní hodinu (bez hodin světa podle `FALLBACK_DAY_S`). */
export function hourSeconds(window: DayWindow | null): number {
  return window && window.endMs > window.startMs
    ? (window.endMs - window.startMs) / 1000 / 24
    : FALLBACK_DAY_S / 24;
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
 * Bloky jízdy jezdce (h herního dne): v každém bloku výcviku (`DRILL_BLOCKS_H`) po luku a boji
 * (stejné dělení jako `drillAt`) polovina hodin jízdy dne (`SceneRide.hours`).
 */
export function rideBlocks(lord: SceneLord, ride: SceneRide): [number, number][] {
  const hours = lord.trainees.find((h) => h.id === ride.id);
  const n = DRILL_BLOCKS_H.length;
  const before = ((hours?.bow ?? 0) + (hours?.combat ?? 0)) / n;
  return ride.hours > 0
    ? DRILL_BLOCKS_H.map((start): [number, number] => [
        start + before,
        start + before + ride.hours / n,
      ])
    : [];
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
  const at = (index: number): TrainingSpot => hitchSpot(hitch, index);
  const groups = rideGroups(riders);
  groups.forEach((group, g) => {
    group.forEach((ride: SceneRide, k) => {
      // víc skupin jede ve stejných blocích vedle sebe (každá o dvě šířky dál od osy)
      const lane = group.length === 1 ? 0 : (k % 2 === 0 ? 1 : -1) * SIDE_M;
      plans.push({
        riderId: ride.id,
        horseId: ride.horseId,
        route: patrol,
        behind: Math.floor(k / 2) * GAP_M,
        side: lane + g * 2 * SIDE_M,
        offset: 0,
        blocks: window ? rideBlocks(lord, ride) : null,
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
      blocks: window ? rideBlocks(lord, lord.escort) : null,
      hitch: at(plans.length),
      window,
    });
  }
  return plans;
}

/** Kde stojí kůň `index` u kůlu: vedle sebe podél kůlu (kolmo na směr ke kůlu), střídavě vlevo a vpravo. */
export function hitchSpot(hitch: TrainingSpot, index: number): TrainingSpot {
  const k = Math.ceil(index / 2) * (index % 2 === 0 ? 1 : -1) * HITCH_GAP_M;
  return {
    x: hitch.x - hitch.headingX * HITCH_REACH_M - hitch.headingZ * k,
    z: hitch.z - hitch.headingZ * HITCH_REACH_M + hitch.headingX * k,
    headingX: hitch.headingX,
    headingZ: hitch.headingZ,
  };
}

/**
 * Blok lovu (h herního dne; wildlife.md – Ve scéně, návrh Clauda): lovci vyrazí za šera ve 3 h,
 * do půlky bloku jsou u lesa a v lese, ve 21 h jsou zpět – den má 86 s, kratší blok by lovci
 * k lesu nedošli.
 */
export const HUNT_BLOCK: readonly [number, number] = [3, 21];
/** Pěší lovci jdou za sebou po tolika m, střídavě kousek vlevo a vpravo. */
const FOOT_GAP_M = 1.8;
const FOOT_SIDE_M = 0.6;

/** Vstup plánu lovu – lov dne, kůl u brány, okraj lesa u zvěře, cesta a schůdná zem. */
export interface HuntPlanInput {
  hunt: SceneHunt;
  hitch: TrainingSpot;
  edge: Point;
  /** Nejbližší okraj lesa od kůlu – lovci k němu, když les u zvěře nestihnou (`huntWay`). */
  nearEdge?: Point | null;
  leg: RideLeg;
  walkable(x: number, z: number): boolean;
  window: DayWindow | null;
}

/**
 * Cesta lovců (wildlife.md – Ve scéně): k lesu u zvěře, když ho stihnou (pěší rychlou chůzí
 * `HUNT_PACE.foot.max`, jezdci cvalem za `HUNT_WAY_SHARE` půlky bloku); jinak k bližšímu z obou
 * okrajů lesa a nejdál, kam doběhnou (pěší poklusem `trot`) – v půlce bloku se nikdy neotáčejí
 * v poli.
 */
export function huntWay(
  way: readonly Point[],
  near: readonly Point[] | null,
  halfS: number,
  foot: boolean,
): Point[] {
  const wayS = HUNT_WAY_SHARE * halfS;
  const easy = foot ? HUNT_PACE.foot.max : HUNT_PACE.ride.max;
  const fastest = foot ? HUNT_PACE.foot.trot : HUNT_PACE.ride.max;
  let best = way;
  if (near && wayLength(way) > easy * wayS && wayLength(near) < wayLength(way)) best = near;
  return cutWay(best, fastest * wayS);
}

/**
 * Body, mezi kterými lovci v lese chodí (`HUNT_SWEEP_M`): podél okraje lesa na obě strany a kus do
 * lesa – kolmo na směr od kůlu k okraji. Kde se nedá stát, kratší; nikde – null.
 */
export function huntSweep(
  from: Point,
  edge: Point,
  walkable: (x: number, z: number) => boolean,
): [Point, Point] | null {
  const dx = edge.x - from.x;
  const dz = edge.z - from.z;
  const n = Math.hypot(dx, dz) || 1;
  const ix = dx / n;
  const iz = dz / n;
  const side = (sign: number): Point | null => {
    for (const f of [1, 0.5]) {
      const p = {
        x: edge.x + ix * HUNT_SWEEP_M.inward * f - iz * HUNT_SWEEP_M.along * f * sign,
        z: edge.z + iz * HUNT_SWEEP_M.inward * f + ix * HUNT_SWEEP_M.along * f * sign,
      };
      if (walkable(p.x, p.z)) return p;
    }
    return null;
  };
  const a = side(1);
  const b = side(-1);
  if (!a && !b) return null;
  return [a ?? edge, b ?? edge];
}

/**
 * Plány lovu dne (wildlife.md – Ve scéně; jádro `hunt.today`): jezdci jako blok jízdy
 * (`rideState` – půlku bloku tam, pak po téže trase zpět), ale celý den lovu (`HUNT_BLOCK`)
 * a po trase k okraji lesa u zvěře (`huntRoute`) – vojvoda vede, po dvou; pěší s oštěpy za nimi
 * vlastním tempem v řadě (`foot` – plán bez koně, `horseId` −1). Bez hodin světa se neloví.
 */
export function huntPlans(input: HuntPlanInput): { rides: RidePlan[]; foot: RidePlan[] } {
  const { hunt, hitch, edge, leg, walkable, window } = input;
  if (!window || window.endMs <= window.startMs) return { rides: [], foot: [] };
  const hourS = (window.endMs - window.startMs) / 1000 / 24;
  const halfS = ((HUNT_BLOCK[1] - HUNT_BLOCK[0]) / 2) * hourS;
  const wayTo = (to: Point): Point[] => {
    const found = leg(hitch, to);
    return found && found.length >= 2 ? [hitch, ...found.slice(1, -1), to] : [hitch, to];
  };
  const way = wayTo(edge);
  const near = input.nearEdge ? wayTo(input.nearEdge) : null;
  const sweep = huntSweep(hitch, edge, walkable);
  const blocks = [HUNT_BLOCK];
  const route = (foot: boolean): RideRoute | null => {
    const go = huntWay(way, near, halfS, foot);
    const end = go[go.length - 1]!;
    return huntRoute(go, end === edge ? sweep : huntSweep(hitch, end, walkable), foot, halfS);
  };
  const rideRoute = hunt.riders.length > 0 ? route(false) : null;
  const footRoute = hunt.foot.length > 0 ? route(true) : null;
  const rides = hunt.riders.map((r, k): RidePlan => ({
    riderId: r.id,
    horseId: r.horseId,
    route: rideRoute,
    behind: Math.floor(k / 2) * GAP_M,
    side: hunt.riders.length === 1 ? 0 : (k % 2 === 0 ? 1 : -1) * SIDE_M,
    offset: 0,
    blocks,
    hitch: hitchSpot(hitch, k),
    window,
  }));
  const foot = hunt.foot.map((id, k): RidePlan => ({
    riderId: id,
    horseId: -1,
    route: footRoute,
    behind: k * FOOT_GAP_M,
    side: (k % 2 === 0 ? -1 : 1) * FOOT_SIDE_M,
    offset: 0,
    blocks,
    hitch: { ...hitch },
    window,
  }));
  return { rides, foot };
}

/**
 * Kde je jezdec s koněm v čase `t` (s skutečného času). Jede jen v bloku jízdy (`blocks`, podíl
 * z hodin jádra – `rideBlocks`): blok začíná u kůlu, kůň jede po trase tempem `rideDistance`
 * z počátku bloku a v druhé půlce bloku se po téže trase vrací, takže na konci stojí zase u kůlu
 * (návrh Clauda: den má 86 s, okruh nebo cesta k hranici se do bloku nevejde, proto jen vyjede
 * a vrátí se). Mimo blok kůň stojí u kůlu (jezdec cvičí, kůň je v ohradě – `riding` false). Bez
 * rozvrhu (`blocks` null, bez hodin světa) jede nepřetržitě po celé trase.
 */
export function rideState(plan: RidePlan, t: number, out: RideState): RideState {
  const block = plan.route ? rideBlockAt(plan, t) : null;
  if (!plan.route || (plan.blocks && !block)) {
    out.x = plan.hitch.x;
    out.z = plan.hitch.z;
    out.headingX = plan.hitch.headingX;
    out.headingZ = plan.hitch.headingZ;
    out.pace = 0;
    out.riding = false;
    out.distance = 0;
    return out;
  }
  let d: number;
  let back = false;
  if (block) {
    // v půlce bloku se jede zpět po téže trase
    const hourS = (plan.window!.endMs - plan.window!.startMs) / 1000 / 24;
    const half = block.length / 2;
    back = block.elapsed > half;
    d = rideDistance(plan.route, Math.min(block.elapsed, block.length - block.elapsed) * hourS);
  } else {
    d = rideDistance(plan.route, t) + plan.offset;
  }
  rideSpot(plan.route, Math.max(0, d - plan.behind), out);
  if (back) {
    out.headingX = -out.headingX;
    out.headingZ = -out.headingZ;
  }
  out.x -= out.headingZ * plan.side;
  out.z += out.headingX * plan.side;
  out.riding = true;
  out.distance = d;
  return out;
}

/** Blok jízdy, ve kterém je čas `t`: hodiny od začátku a délka bloku (h); jinak null. */
export function rideBlockAt(plan: RidePlan, t: number): { elapsed: number; length: number } | null {
  if (!plan.blocks) return null;
  const hour = hourOfDay(plan.window, t);
  if (hour === null) return null;
  for (const [from, to] of plan.blocks) {
    if (hour >= from && hour < to) return { elapsed: hour - from, length: to - from };
  }
  return null;
}

/** Id koní, kteří jsou v čase `nowMs` (epoch ms) mimo ohradu – na jízdě, nebo uvázaní u kůlu. */
export function ridingHorseIds(plans: readonly RidePlan[], nowMs: number): Set<number> {
  const t = (nowMs - LIVESTOCK_EPOCH_MS) / 1000;
  return new Set(plans.filter((p) => isAway(p, t)).map((p) => p.horseId));
}

/** Stojí kůň v čase `t` uvázaný u kůlu mimo ohradu (`RidePlan.tied`)? */
export function isTied(plan: RidePlan, t: number): boolean {
  if (!plan.tied || plan.tied.length === 0) return false;
  const hour = dayHour(plan.window, t);
  return plan.tied.some(([from, to]) => hour >= from && hour < to);
}

/** Je kůň v čase `t` mimo ohradu – jede, nebo stojí uvázaný (ohrada ho nekreslí)? */
export function isAway(plan: RidePlan, t: number): boolean {
  return isRiding(plan, t) || isTied(plan, t);
}

/** Jede jezdec v čase `t` (je v bloku jízdy, nebo bez rozvrhu s trasou)? */
export function isRiding(plan: RidePlan, t: number): boolean {
  return plan.route !== null && (plan.blocks ? rideBlockAt(plan, t) !== null : true);
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
  out.stride =
    state.riding && !waiting(plan, state) ? Math.sin((2 * Math.PI * state.distance) / stride) : 0;
  return out;
}

/**
 * Kůň v bloku jízdy stojí na začátku trasy – skupina se teprve rozjíždí (jezdec za čelem čeká,
 * než je na něj místo) nebo se už vrátila.
 */
function waiting(plan: RidePlan, state: RideState): boolean {
  return state.distance - plan.behind <= 0;
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
      // na koni je vidět vždy – i když ho rozvrh posílá domů (doma, konec průvodu, povodeň);
      // kůň nikdy nejede bez jezdce (horses.md – Ve scéně)
      out.hidden = false;
      delete out.stage;
      out.x = state.x;
      out.z = state.z;
      // na stojícím koni sedí klidně (klip 0 A.D. `rider/…/idle_relax_01`)
      out.clip = waiting(plan, state)
        ? 'ride-idle'
        : state.pace > RIDE_PACE.walk
          ? 'ride-trot'
          : 'ride';
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
        `${p.riderId}:${p.horseId}:${p.route ? `${p.route.length.toFixed(1)}/${p.route.points.length}` : '-'}:${p.offset.toFixed(1)}:${p.hitch.x.toFixed(1)},${p.hitch.z.toFixed(1)}:${p.window?.startMs ?? ''}:${p.blocks?.map((b) => b.join('-')).join(',') ?? ''}:${p.tied?.map((b) => b.join('-')).join(',') ?? ''}`,
    )
    .join('|');
}
