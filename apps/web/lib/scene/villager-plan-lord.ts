// Vojvodova rodina na dvorku (docs/design/lord.md – Ve scéně): muži a chlapci střílejí na terče,
// bojují ve dvojici nebo u kůlu, ženy rodiny stojí u dvorce jako ženy u domů. Kdo, kolik hodin
// a zda vůbec cvičí, určuje jádro (`SceneLabor.lord`); scéna jen rozvrhne hodiny do dne.
import type { SceneHunt, SceneLabor, SceneLord } from '../village-view';
import { type DayWindow } from './caravan';
import { dogPlans, type DogPlan } from './dogs';
import { HUNT_PACE } from './rider-route';
import {
  createRideState,
  DRILL_BLOCKS_H,
  hourOfDay,
  huntPlans,
  isRiding,
  rideBlockAt,
  ridePlans,
  riderPose,
  rideState,
  type RidePlan,
} from './riders';
import { cast, figure } from './villager-plan-cast';
import { hash01 } from './smoke-schedule';
import { doorPoint, free, walkRoute } from './villager-plan-geometry';
import { FIGURE_SCALE, type Context, type PlannedVillager } from './villager-plan-types';
import {
  alongRoute,
  fetcher,
  LORD_IDLE_CLIPS,
  route,
  type Route,
  type PoseFn,
  type VillagerClip,
  type VillagerKind,
  type VillagerPose,
  walkSpeed,
} from './villager-motion';
import { trainingGroundOf, type TrainingGround, type TrainingSpot } from './training-ground-layout';
import type { Point } from './villager-plan-types';

/** Po kolika sekundách vojvoda mimo výcvik změní stání vladaře (`LORD_IDLE_CLIPS`). */
export const LORD_IDLE_S = 6;

/**
 * Rozvrh výcviku dne (lord.md – Den rodiny: dva bloky, dopoledne a odpoledne – Vegetius; návrh
 * Clauda): bloky začínají v 8 a ve 14 h, v každém polovina hodin dne – napřed luk, pak boj, pak
 * jízda (jezdce v tu dobu kreslí riders.ts na koni, na dvorku ten čas není). Ženy rodiny jsou u dvorce od 7 do 19 h.
 */
export { DRILL_BLOCKS_H };
export const HOUSEHOLD_HOURS: readonly [number, number] = [7, 19];
/** Výstřel: míření (bow-draw) a výstřel (bow-release) – s; střídačka u terče po dvou výstřelech. */
const SHOT_S = 3.2;
const AIM_S = 2.2;
const TURN_S = SHOT_S * 2;
/** Dvojice se střídá v útoku a krytí po tolika s; u kůlu meč a oštěp po 4 s. */
const BOUT_S = 1.6;
const POST_SWITCH_S = 4;
/** Ženy rodiny chodí od vchodu nejvýš tak daleko (m) – zůstávají na pozemku dvorce. */
const HOUSEWORK_M = 3.5;

/** Co cvičící dělá v hodinu `hour` (0–24): luk, boj, nebo nic (doma, na koni). */
export function drillAt(
  hours: SceneLord['trainees'][number],
  hour: number,
): 'bow' | 'combat' | null {
  for (const start of DRILL_BLOCKS_H) {
    const h = hour - start;
    if (h < 0) continue;
    const bow = hours.bow / DRILL_BLOCKS_H.length;
    const combat = hours.combat / DRILL_BLOCKS_H.length;
    if (h < bow) return 'bow';
    if (h < bow + combat) return 'combat';
  }
  return null;
}

const hourOf = hourOfDay;

function put(out: VillagerPose, s: TrainingSpot, clip: VillagerClip): VillagerPose {
  out.x = s.x;
  out.z = s.z;
  out.headingX = s.headingX;
  out.headingZ = s.headingZ;
  out.clip = clip;
  out.pace = 1;
  return out;
}

/**
 * Póza cvičícího: v hodinách luku u své dráhy (střílí na střídačku – `rank` z `ranks`, ostatní
 * čekají kousek za ním), v hodinách boje na svém místě boje, jinak není vidět (doma, na koni).
 * Bez hodin světa (ukázky) celý den u luku, kdo luk nemá, u boje. Klipy se střídají střihem.
 */
function drillPose(
  hours: SceneLord['trainees'][number],
  ground: TrainingGround,
  archer: { lane: number; rank: number; ranks: number },
  combat: { spot: TrainingSpot; role: 'pair-a' | 'pair-b' | 'post' | 'wait' },
  rest: TrainingSpot,
  window: DayWindow | null,
  lord = false,
): PoseFn {
  const lane = ground.lanes[archer.lane]!;
  return (t, _herds, out) => {
    const hour = hourOf(window, t);
    const drill =
      hour === null
        ? hours.bow > 0
          ? 'bow'
          : hours.combat > 0
            ? 'combat'
            : null
        : drillAt(hours, hour);
    if (drill === 'bow') {
      out.stage = 'bow';
      const turn = Math.floor(t / TURN_S);
      if (turn % archer.ranks !== archer.rank) {
        put(out, lane.wait, 'idle');
        // čekající stojí v řadě za sebou – kdo jde na řadu dřív, stojí vpředu
        const back =
          (((archer.rank - (turn % archer.ranks) + archer.ranks) % archer.ranks) - 1) * 0.9;
        out.x -= lane.wait.headingX * back;
        out.z -= lane.wait.headingZ * back;
        return out;
      }
      return put(out, lane.shoot, t % SHOT_S < AIM_S ? 'bow-draw' : 'bow-release');
    }
    if (drill === 'combat') {
      out.stage = 'combat';
      const beat = Math.floor(t / BOUT_S) % 2 === 0;
      if (combat.role === 'pair-a')
        return put(out, combat.spot, beat ? 'sword-strike' : 'shield-block');
      if (combat.role === 'pair-b')
        return put(out, combat.spot, beat ? 'shield-block' : 'sword-strike');
      if (combat.role === 'post') {
        return put(
          out,
          combat.spot,
          Math.floor(t / POST_SWITCH_S) % 2 === 0 ? 'sword-strike' : 'spear-thrust',
        );
      }
      return put(out, combat.spot, 'idle');
    }
    // mimo výcvik (poledne, jízda, večer) ve dne stojí u dvorku jako ostatní muži mimo práci –
    // vojvoda jako vladař (založené ruce, střídá se po LORD_IDLE_S); skrytý je jen v noci (jako
    // ženy rodiny)
    put(
      out,
      rest,
      lord
        ? LORD_IDLE_CLIPS[
            ((Math.floor(t / LORD_IDLE_S) % LORD_IDLE_CLIPS.length) + LORD_IDLE_CLIPS.length) %
              LORD_IDLE_CLIPS.length
          ]!
        : 'idle',
    );
    if (hour !== null && isNight(hour)) out.hidden = true;
    return out;
  };
}

/** Večerní odchod k vedlejší manželce začíná po konci dne rodiny (19 h), ráno se vrací v 7–8 h. */
const VISIT_OUT_H: readonly [number, number] = [HOUSEHOLD_HOURS[1], HOUSEHOLD_HOURS[1] + 1];
const VISIT_BACK_H: readonly [number, number] = [HOUSEHOLD_HOURS[0], HOUSEHOLD_HOURS[0] + 1];

/**
 * Návštěva vedlejší manželky (lord.md – Rod vojvody, Manželky; návrh Clauda): scéna nemá noc,
 * proto „večer“ = hodina po konci dne rodiny (19–20 h) – vojvoda jde po trase `r` k manželce
 * a v domě (skrytý) zůstane přes noc; „ráno“ = 7–8 h, kdy jde stejnou cestou zpět ke dvorku.
 * Jinak platí `base` (výcvik, jízda i práce se nemění).
 */
function visitPose(base: PoseFn, r: Route, window: DayWindow | null): PoseFn {
  const walk = (out: VillagerPose, d: number, reverse: boolean): VillagerPose => {
    alongRoute(r, d, reverse, out);
    out.clip = 'walk-lord';
    out.pace = 1;
    out.hidden = false;
    return out;
  };
  return (t, herds, out) => {
    const hour = hourOf(window, t);
    if (hour === null) return base(t, herds, out);
    if (hour >= VISIT_OUT_H[0] && hour < VISIT_OUT_H[1])
      return walk(out, (hour - VISIT_OUT_H[0]) * r.length, false);
    if (hour >= VISIT_OUT_H[1] || hour < VISIT_BACK_H[0]) {
      base(t, herds, out);
      out.hidden = true;
      return out;
    }
    if (hour < VISIT_BACK_H[1]) return walk(out, (1 - (hour - VISIT_BACK_H[0])) * r.length, true);
    return base(t, herds, out);
  };
}

/** Noc (mimo dobu, kdy je rodina vidět u dvorku). */
function isNight(hour: number): boolean {
  return hour < HOUSEHOLD_HOURS[0] || hour >= HOUSEHOLD_HOURS[1];
}

/**
 * Žena rodiny u dvorce: ve dne domácí práce jako ženy u domů (`domestic` – postává před vchodem
 * a chodí kousek pro vodu a dřevo, tady po dvoře uvnitř pozemku), v noci doma.
 */
function householdPose(
  spot: TrainingSpot,
  who: { kind: VillagerKind; scale: number; phase: number },
  window: DayWindow | null,
): PoseFn {
  // kousek od vchodu podél dvora (uvnitř pozemku)
  const goal = { x: spot.x + spot.headingX * HOUSEWORK_M, z: spot.z + spot.headingZ * HOUSEWORK_M };
  const work = fetcher(
    route([
      [spot.x, spot.z],
      [goal.x, goal.z],
    ]),
    who.kind,
    who.scale,
    10 + who.phase * 8,
    who.phase,
  );
  return (t, herds, out) => {
    work(t, herds, out);
    const hour = hourOf(window, t);
    if (hour !== null && isNight(hour)) out.hidden = true;
    return out;
  };
}

/** Kde muž rodiny stojí mimo výcvik: před vchodem dvorce, na druhé straně než ženy (uvnitř pozemku). */
function restSpot(ctx: Context, homeId: number, i: number): TrainingSpot {
  const home = ctx.homes.find((h) => h.id === homeId) ?? ctx.houses.find((h) => h.id === homeId);
  if (!home) return { x: 0, z: 0, headingX: 0, headingZ: 1 };
  const side = (i % 2 === 0 ? 1 : -1) * (3.4 + Math.floor(i / 2) * 1.1);
  const door = doorPoint({ ...home, box: home.own ?? home.box }, side);
  const hx = door.x - home.position.x;
  const hz = door.z - home.position.z;
  const n = Math.hypot(hx, hz) || 1;
  return { x: door.x, z: door.z, headingX: hx / n, headingZ: hz / n };
}

/** Trasa vojvody od dvorku k domu vedlejší manželky po pěšinách (`walkRoute`), jinak rovně. */
function visitRoute(ctx: Context, lord: SceneLord, idx: number): Route | null {
  const wife = lord.visit
    ? (ctx.homes.find((h) => h.id === lord.visit!.home) ??
      ctx.houses.find((h) => h.id === lord.visit!.home))
    : undefined;
  if (!wife || wife.id === lord.home) return null;
  const from = restSpot(ctx, lord.home, idx);
  const door = doorPoint({ ...wife, box: wife.own ?? wife.box }, 0);
  const a = { x: from.x, z: from.z };
  const walked = walkRoute(ctx, a, door, lord.home);
  if (walked && walked.length > 0.1) return walked;
  return route([
    [a.x, a.z],
    [door.x, door.z],
  ]);
}

/** Místo boje `k`-tého bojujícího: napřed dvojice, pak kůl, ostatní čekají u kůlu. */
function combatSpot(
  ground: TrainingGround,
  k: number,
): { spot: TrainingSpot; role: 'pair-a' | 'pair-b' | 'post' | 'wait' } {
  const pair = ground.pairs[Math.floor(k / 2)];
  if (pair) return { spot: pair[k % 2]!, role: k % 2 === 0 ? 'pair-a' : 'pair-b' };
  const extra = k - ground.pairs.length * 2;
  if (extra === 0) return { spot: ground.post, role: 'post' };
  const p = ground.post;
  // čekající stojí vedle místa u kůlu
  const side = extra % 2 === 0 ? 1 : -1;
  const d = Math.ceil(extra / 2) * 1.0 * side;
  return {
    spot: { ...p, x: p.x - p.headingZ * d, z: p.z + p.headingX * d },
    role: 'wait',
  };
}

/** Kůl na koně u brány (training-ground-layout – `hitch`), bez něj místo u cvičného kůlu. */
function hitchSpot(ground: TrainingGround): TrainingSpot {
  const hitch = ground.pieces.find((p) => p.part === 'hitch');
  if (!hitch) return ground.post;
  return {
    x: hitch.x,
    z: hitch.z,
    headingX: Math.sin(hitch.rotation),
    headingZ: Math.cos(hitch.rotation),
  };
}

/**
 * Rodina na dvorku (lord.md – Ve scéně; villagers.md – výjimka z pravidla „nikdo nestojí na
 * oploceném pozemku“): cvičící muži a chlapci na cvičišti (`trainingGroundOf`), ženy rodiny
 * u dvorce. Lidé s pevným místem dne – berou se z rozpisu lidí (`takeId`) hned po pohřbu
 * a karavanách, do práce vsi pak nejdou. Jezdci dne (`SceneLord.riders`, doprovod výpravy) jsou
 * ve dne na koni (riders.ts – `ridePlans`) a plány jízd jdou koním (`rides`). Bez lidí ve scéně,
 * rodiny nebo cvičiště nic.
 */
export function lordFigures(
  ctx: Context,
  labor: SceneLabor,
  window: DayWindow | null,
  huntSpot: HuntSpotFn | null = null,
  huntWindow: DayWindow | null = window,
): { people: PlannedVillager[]; rides: RidePlan[]; dogs: DogPlan[] } {
  const lord = labor.lord;
  if (!lord || !ctx.roster) return { people: [], rides: [], dogs: [] };
  const ground = trainingGroundOf(ctx.village);
  if (!ground || ground.home !== lord.home) return { people: [], rides: [], dogs: [] };
  const out: PlannedVillager[] = [];
  // jízdy dne – po pěšinách a kolem domů (walkRoute), jinak rovně; přes pole nikdy (rider-route.ts)
  const hitch = hitchSpot(ground);
  const leg = (a: Point, b: Point): Point[] => {
    const r = walkRoute(ctx, a, b);
    return r ? r.points.map(([x, z]) => ({ x, z })) : [a, b];
  };
  const wild = ctx.village.wildlife;
  // jezdci lovu (lov jde ve skutečném čase přes víc dní) objížďku nejedou – kůň je na lovu
  const hunters = new Set((wild?.hunt?.riders ?? []).map((r) => r.id));
  const patrolRides = ridePlans({
    village: ctx.village,
    lord,
    hitch,
    homes: ctx.homes.map((h) => ({ x: h.position.x, z: h.position.z })),
    leg,
    window,
  }).filter((r) => !hunters.has(r.riderId));
  // lov (wildlife.md – Ve scéně): jezdci a pěší s oštěpy k okraji lesa u zvěře a zpět – ve
  // skutečném čase od dne lovu (`huntWindow`)
  const hunt = wild?.hunt ? huntParty(ctx, wild.hunt, hitch, leg, huntWindow, huntSpot) : null;
  const rides = [...patrolRides, ...(hunt?.rides ?? [])];
  const riding = new Map(rides.map((r) => [r.riderId, r]));
  const walking = new Map((hunt?.foot ?? []).map((r) => [r.riderId, r]));
  const carrier = hunt && (wild?.hunt?.kills ?? 0) > 0 ? (hunt.foot[0]?.riderId ?? null) : null;
  const dogs = dogPlans({
    count: wild?.dogs ?? 0,
    hitch,
    hunt: hunt ?? { rides: [], foot: [] },
    rides: patrolRides,
    patrol: wild?.patrol === true,
    free: (x, z) => free(ctx, x, z),
  });
  const lanes = ground.lanes.length;
  // jezdci cvičí luk a boj na dvorku jako ostatní, na koni jsou jen v bloku jízdy
  const archers = lord.trainees.filter((h) => h.bow > 0).map((h) => h.id);
  const fighters = lord.trainees.filter((h) => h.combat > 0).map((h) => h.id);
  for (const [idx, hours] of lord.trainees.entries()) {
    const c = cast(ctx, `lord:${hours.id}`, { women: 0, child: false }, () =>
      ctx.roster!.takeId(hours.id),
    );
    if (!c) continue;
    const a = Math.max(0, archers.indexOf(hours.id));
    const lane = a % lanes;
    const ranks = Math.ceil((archers.length - lane) / lanes);
    const pose = drillPose(
      hours,
      ground,
      { lane, rank: Math.floor(a / lanes), ranks: Math.max(1, ranks) },
      combatSpot(ground, Math.max(0, fighters.indexOf(hours.id))),
      restSpot(ctx, lord.home, idx),
      window,
      lord.lordId === hours.id,
    );
    const ride = riding.get(hours.id);
    const mounted = ride ? riderPose(ride) : null;
    const foot = walking.get(hours.id);
    const posed: PoseFn =
      ride && mounted
        ? (t, herds, o) => (isRiding(ride, t) ? mounted(t, herds, o) : pose(t, herds, o))
        : foot
          ? footHunterPose(foot, carrier === hours.id, pose)
          : pose;
    const visit = lord.visit && lord.visit.lordId === hours.id ? visitRoute(ctx, lord, idx) : null;
    out.push(
      figure(c, visit ? visitPose(posed, visit, window) : posed, 'natural', {
        kind: 'lord',
        household: false,
      }),
    );
    walking.delete(hours.id);
  }
  // pěší lovci mimo cvičící (odešlí synové rodu) – jen v bloku lovu, jinak jsou doma
  for (const [id, plan] of walking) {
    const c = cast(ctx, `hunt:${id}`, { women: 0, child: false }, () => ctx.roster!.takeId(id));
    if (!c) continue;
    out.push(
      figure(c, footHunterPose(plan, carrier === id, null), 'natural', {
        kind: 'lord',
        household: false,
      }),
    );
  }
  const home =
    ctx.homes.find((h) => h.id === lord.home) ?? ctx.houses.find((h) => h.id === lord.home);
  if (home) {
    lord.household.forEach((id, i) => {
      const c = cast(ctx, `lord-home:${id}`, { women: 1, child: false }, () =>
        ctx.roster!.takeId(id),
      );
      if (!c) return;
      const side = (i % 2 === 0 ? -1 : 1) * (1.3 + Math.floor(i / 2) * 1.1);
      // u dvorce před vchodem domu (uvnitř pozemku), ne před bránou
      const door = doorPoint({ ...home, box: home.own ?? home.box }, side);
      const hx = door.x - home.position.x;
      const hz = door.z - home.position.z;
      const n = Math.hypot(hx, hz) || 1;
      const spot = { x: door.x, z: door.z, headingX: hx / n, headingZ: hz / n };
      out.push(
        figure(c, householdPose(spot, c.who, window), 'linen', { kind: 'lord', household: true }),
      );
    });
  }
  return { people: out, rides, dogs };
}

/** Okraj lesa u zvěře pro lov dne (VillageWildlife – skupina na okraji lesa podle cíle), nebo null. */
export type HuntSpotFn = (target: SceneHunt['target']) => Point | null;

/** Hledání okraje lesa: kruhy po tolika m až do dosahu a kolik směrů na kruhu. */
const EDGE_SEARCH = { from: 30, step: 15, to: 360, dirs: 24, trees: 3, half: 6 } as const;

/**
 * Okraj lesa nejblíž kůlu (bez zvěře ve scéně): první kruh, na kterém je schůdné místo
 * s aspoň třemi stromy kolem – směr začíná podle losu dne. Nikde – null.
 */
export function forestEdge(ctx: Context, from: Point): Point | null {
  const start = hash01(ctx.seed, ctx.day, 613) * Math.PI * 2;
  for (let r = EDGE_SEARCH.from; r <= EDGE_SEARCH.to; r += EDGE_SEARCH.step) {
    for (let k = 0; k < EDGE_SEARCH.dirs; k++) {
      const a = start + (k / EDGE_SEARCH.dirs) * Math.PI * 2;
      const x = from.x + Math.cos(a) * r;
      const z = from.z + Math.sin(a) * r;
      if (!ctx.ground.walkable(x, z)) continue;
      if (
        ctx.ground.treesIn(x, z, EDGE_SEARCH.half, EDGE_SEARCH.trees).length >= EDGE_SEARCH.trees
      ) {
        return { x, z };
      }
    }
  }
  return null;
}

/**
 * Plány lovu dne: k okraji lesa u zvěře (`huntSpot`), jinak k nejbližšímu okraji lesa – k němu
 * i když les u zvěře nestihnou (`huntWay`).
 */
function huntParty(
  ctx: Context,
  hunt: SceneHunt,
  hitch: TrainingSpot,
  leg: (a: Point, b: Point) => Point[],
  window: DayWindow | null,
  huntSpot: HuntSpotFn | null,
): { rides: RidePlan[]; foot: RidePlan[] } | null {
  const spot = huntSpot?.(hunt.target) ?? null;
  // nejbližší okraj lesa – bez zvěře ve scéně cíl, jinak když lovci les u zvěře nestihnou
  const near = forestEdge(ctx, hitch);
  const edge = spot ?? near;
  if (!edge) return null;
  return huntPlans({
    hunt,
    hitch,
    edge,
    nearEdge: near,
    leg,
    walkable: (x, z) => ctx.ground.walkable(x, z),
    window,
  });
}

/**
 * Pěší lovec (wildlife.md – Ve scéně): v bloku lovu jde po trase lovu (`rideState` jako jezdec –
 * tam, v lese sem a tam, zpět) s oštěpem (`walk-spear`); kde trasa stojí, drží oštěp
 * (`spear-thrust`); nosič úlovku nese cestou zpět maso (`carry-meat`). Mimo blok `otherwise`
 * (cvičí na dvorku), bez ní doma.
 */
export function footHunterPose(plan: RidePlan, carrier: boolean, otherwise: PoseFn | null): PoseFn {
  const state = createRideState();
  return (t, herds, out) => {
    const block = rideBlockAt(plan, t);
    if (!block || !plan.route) {
      if (otherwise) return otherwise(t, herds, out);
      out.hidden = true;
      return out;
    }
    rideState(plan, t, state);
    const back = block.elapsed > block.length / 2;
    out.x = state.x;
    out.z = state.z;
    out.headingX = state.headingX;
    out.headingZ = state.headingZ;
    out.stage = back ? 'back' : 'out';
    if (state.pace <= HUNT_PACE.stop * 2) {
      out.clip = 'spear-thrust';
      out.pace = 1;
    } else if (back && carrier) {
      out.clip = 'carry-meat';
      out.pace = state.pace / walkSpeed('man', 'carry-meat', FIGURE_SCALE);
    } else {
      out.clip = 'walk-spear';
      out.pace = state.pace / walkSpeed('man', 'walk-spear', FIGURE_SCALE);
    }
    return out;
  };
}
