// Vojvodova rodina na dvorku (docs/design/lord.md – Ve scéně): muži a chlapci střílejí na terče,
// bojují ve dvojici nebo u kůlu a vyjíždějí na koních, ženy rodiny pracují u dvorce jako ženy
// u domů. Kdo, kolik a zda vůbec cvičí, určuje jádro (`SceneLabor.lord`); den rodiny ve skutečném
// čase (vyjde z dvorce → luk a boj → jízda → u dvorku → vejde) skládá lord-day.ts.
import type { SceneHunt, SceneLabor, SceneLord } from '../village-view';
import { type DayWindow } from './caravan';
import { dogPlans, type DogPlan } from './dogs';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import {
  drillSeconds,
  householdPose,
  HUNT_BRIDGE_S,
  memoSteps,
  traineePose,
  traineeSteps,
  type ArcherSlot,
  type FighterSlot,
  type TraineeDay,
} from './lord-day';
import type { ExpeditionYard, YardHorse } from './expedition-choreo';
import { HUNT_PACE } from './rider-route';
import {
  createRideState,
  hitchSpot as horseHitchSpot,
  huntPlans,
  isRiding,
  leaderSpot,
  leadPath,
  leadRepeat,
  leadTimes,
  LEAD_M_S,
  rideBlockAt,
  ridePlans,
  riderPose,
  rideState,
  type RidePlan,
  withLead,
} from './riders';
import { groomCandidates, groomedHorses } from './ride-grooms';
import { horseGate } from './villager-plan-shoeing';
import { cast, figure } from './villager-plan-cast';
import { hash01 } from './smoke-schedule';
import { doorPoint, free, walkRoute } from './villager-plan-geometry';
import { FIGURE_SCALE, type Context, type PlannedVillager } from './villager-plan-types';
import {
  createVillagerPose,
  route,
  type Route,
  type PoseFn,
  type VillagerPose,
  walkSpeed,
} from './villager-motion';
import { trainingGroundOf, type TrainingGround, type TrainingSpot } from './training-ground-layout';
import type { Point } from './villager-plan-types';

/** Kůň vyjde z ohrady tak daleko před branku (m), než zamíří ke kůlu. */
const LEAD_OUT_M = 1;

/** Cesty jízd a koní po pěšinách a kolem domů (walkRoute), jinak rovně; přes pole nikdy. */
function pathLeg(ctx: Context): (a: Point, b: Point) => Point[] {
  return (a, b) => {
    const r = walkRoute(ctx, a, b);
    return r ? r.points.map(([x, z]) => ({ x, z })) : [a, b];
  };
}

/**
 * Kde kůň `horseId` vyjde z ohrady a kam se vrátí: kousek před brankou hotové ohrady, ve které
 * stojí (riders.ts – `withLead`, `leadPath`); bez ní null.
 */
function leadGate(ctx: Context, horseId: number): Point | null {
  const pen = (ctx.village.pens ?? []).find((p) => p.horses?.some((h) => h.id === horseId));
  const gate = pen ? horseGate(ctx, pen.id) : null;
  return gate ? { x: gate.x + gate.outX * LEAD_OUT_M, z: gate.z + gate.outZ * LEAD_OUT_M } : null;
}

/**
 * Místa vsi pro scénář výprav (expeditions.md – Ve scéně; expedition-choreo.ts): branky ohrad koní
 * (kam kůň vyjde a vrátí se), vchody obydlí lidí, vchod a brána dvorce a koně jezdců vsi u kůlu
 * vedle sebe (vojvodův první) s cestou z ohrady – stejnou jako před jízdou dne rodiny (`leadPath`).
 * Bez cvičiště (zemnice, kde rodina dnes necvičí) null.
 */
export function expeditionYard(ctx: Context): ExpeditionYard | null {
  const ground = trainingGroundOf(ctx.village);
  if (!ground) return null;
  const hitch = hitchSpot(ground);
  const leg = pathLeg(ctx);
  const lordId = ctx.village.labor?.lord?.lordId;
  const pairs = (ctx.village.pens ?? [])
    .flatMap((pen) => pen.horses ?? [])
    .flatMap((h) => (h.riderId === undefined ? [] : [{ horseId: h.id, riderId: h.riderId }]))
    .sort(
      (a, b) =>
        Number(b.riderId === lordId) - Number(a.riderId === lordId) || a.riderId - b.riderId,
    );
  const horses = pairs.map(({ horseId, riderId }, i): YardHorse => {
    const spot = horseHitchSpot(hitch, i);
    const gate = leadGate(ctx, horseId);
    const heading = { x: spot.headingX, z: spot.headingZ };
    return { riderId, horseId, spot, lead: gate ? leadPath(gate, spot, heading, leg) : null };
  });
  const homes = new Map((ctx.village.labor?.persons ?? []).map((p) => [p.id, p.home]));
  const door = manorDoor(ctx, ground.home);
  return {
    door: { x: door.x, z: door.z },
    gate: ground.gate ?? hitch,
    horses,
    gateOf: (horseId) => leadGate(ctx, horseId),
    horseOf: (personId) => pairs.find((p) => p.riderId === personId)?.horseId ?? null,
    entryOf: (personId) => {
      const home = homes.get(personId);
      if (home === undefined) return null;
      const d = manorDoor(ctx, home);
      return d.x === 0 && d.z === 0 ? null : { x: d.x, z: d.z };
    },
    leg,
  };
}

/** Ženy rodiny chodí od vchodu nejvýš tak daleko (m) – zůstávají na pozemku dvorce. */
const HOUSEWORK_M = 3.5;

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

/** Vchod dvorce (dveře uprostřed) – doma je cvičící skrytý tady. */
export function manorDoor(ctx: Context, homeId: number): TrainingSpot {
  const home = ctx.homes.find((h) => h.id === homeId) ?? ctx.houses.find((h) => h.id === homeId);
  if (!home) return { x: 0, z: 0, headingX: 0, headingZ: 1 };
  const door = doorPoint({ ...home, box: home.own ?? home.box }, 0);
  const hx = door.x - home.position.x;
  const hz = door.z - home.position.z;
  const n = Math.hypot(hx, hz) || 1;
  return { x: door.x, z: door.z, headingX: hx / n, headingZ: hz / n };
}

/** Trasa vojvody od stání u dvorku `from` k domu vedlejší manželky `homeId` po pěšinách, jinak rovně. */
function visitRoute(ctx: Context, lord: SceneLord, from: Point, homeId: number): Route | null {
  const wife = ctx.homes.find((h) => h.id === homeId) ?? ctx.houses.find((h) => h.id === homeId);
  if (!wife || wife.id === lord.home) return null;
  const door = doorPoint({ ...wife, box: wife.own ?? wife.box }, 0);
  const walked = walkRoute(ctx, from, door, lord.home);
  if (walked && walked.length > 0.1) return walked;
  return route([
    [from.x, from.z],
    [door.x, door.z],
  ]);
}

/** Místo boje `k`-tého bojujícího: napřed dvojice, pak kůl, ostatní čekají u kůlu. */
function combatSpot(ground: TrainingGround, k: number): FighterSlot {
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

/** Kde jezdec čeká u svého koně (vlevo od koně u kůlu – jako `riderPose`). */
function besideHorse(plan: RidePlan): TrainingSpot {
  const h = plan.hitch;
  return {
    x: h.x - h.headingZ * 0.8,
    z: h.z + h.headingX * 0.8,
    headingX: h.headingX,
    headingZ: h.headingZ,
  };
}

/** Bod pózy v čase `t` (poloha, směr, skrytý). */
interface PosePoint extends Point {
  hx: number;
  hz: number;
  hidden: boolean;
}

/** Chůze z `a` do `b` přirozeným tempem `speed` (nejvýš za `span` s), pak stojí (případně vejde). */
function walkBetween(
  out: VillagerPose,
  a: PosePoint,
  b: PosePoint,
  since: number,
  span: number,
  speed: number,
): VillagerPose {
  out.hidden = false;
  delete out.lift;
  // k lovu a z něj (panel postavy – person-activity.ts)
  out.stage = 'hunt';
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const dur = Math.min(span, d / speed);
  if (since >= dur) {
    out.x = b.x;
    out.z = b.z;
    out.headingX = b.hx;
    out.headingZ = b.hz;
    out.clip = 'idle';
    out.pace = 1;
    if (b.hidden) out.hidden = true;
    return out;
  }
  const f = since / dur;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.headingX = (b.x - a.x) / d;
  out.headingZ = (b.z - a.z) / d;
  out.clip = 'walk';
  out.pace = Math.min(1.3, d / dur / speed);
  return out;
}

/**
 * Lovec z rodiny (wildlife.md – Ve scéně): lov (`hunt`, ve skutečném čase `span` – ms) přeruší den
 * rodiny (`base`); `HUNT_BRIDGE_S` před lovem dojde chůzí tam, kde lov začíná (u kůlu, ke koni),
 * po lovu odtud dojde tam, kde ho den rodiny zastihne – nikdy se nepřenese střihem.
 */
function huntBridge(
  base: PoseFn,
  hunt: PoseFn,
  span: readonly [number, number],
  speed: number,
): PoseFn {
  const hs = (span[0] - LIVESTOCK_EPOCH_MS) / 1000;
  const he = (span[1] - LIVESTOCK_EPOCH_MS) / 1000;
  const probe = createVillagerPose();
  const at = (fn: PoseFn, t: number, herds: Parameters<PoseFn>[1]): PosePoint => {
    probe.hidden = false;
    const p = fn(t, herds, probe);
    return { x: p.x, z: p.z, hx: p.headingX, hz: p.headingZ, hidden: p.hidden === true };
  };
  let into: [PosePoint, PosePoint] | null = null;
  let back: [PosePoint, PosePoint] | null = null;
  return (t, herds, out) => {
    if (t >= hs && t < he) return hunt(t, herds, out);
    if (t >= hs - HUNT_BRIDGE_S && t < hs) {
      into ??= [at(base, hs - HUNT_BRIDGE_S, herds), { ...at(hunt, hs, herds), hidden: false }];
      return walkBetween(out, into[0], into[1], t - (hs - HUNT_BRIDGE_S), HUNT_BRIDGE_S, speed);
    }
    if (t >= he && t < he + HUNT_BRIDGE_S) {
      back ??= [
        { ...at(hunt, he - 1e-3, herds), hidden: false },
        at(base, he + HUNT_BRIDGE_S, herds),
      ];
      return walkBetween(out, back[0], back[1], t - he, HUNT_BRIDGE_S, speed);
    }
    return base(t, herds, out);
  };
}

/** Jezdec bez podkoního dojde k brance ohrady (a od ní po jízdě zpět) nejvýš za tolik s. */
export const SELF_LEAD_BRIDGE_S = 40;

/**
 * Jezdec vede koně sám (D69 – ves bez rolníků; Martin 15. 11. 2026, jako výjezd vojvody „nikdo
 * doma“): `SELF_LEAD_BRIDGE_S` před vyvedením koně (`leadTimes`) dojde od místa, kde ho den rodiny
 * (`base`) zastihne, k brance, vyvede koně za uzdu ke kůlu (`leaderSpot`) a nasedne; po jízdě ho
 * odvede do ohrady a dojde tam, kde ho den rodiny zastihne – nikdy se nepřenese střihem.
 */
export function selfLead(base: PoseFn, plan: RidePlan, speed: number): PoseFn {
  const lead = plan.lead;
  if (!lead || !plan.span) return base;
  const probe = createVillagerPose();
  const spot = { x: 0, z: 0, headingX: 0, headingZ: 1 };
  const ends = new Map<number, { into: [PosePoint, PosePoint]; back: [PosePoint, PosePoint] }>();
  const pace = LEAD_M_S / speed;
  const at = (fn: PoseFn, t: number, herds: Parameters<PoseFn>[1]): PosePoint => {
    probe.hidden = false;
    const p = fn(t, herds, probe);
    return { x: p.x, z: p.z, hx: p.headingX, hz: p.headingZ, hidden: p.hidden === true };
  };
  const gate = (back: boolean): PosePoint => {
    leaderSpot(lead, 0, back, spot);
    return { x: spot.x, z: spot.z, hx: -spot.headingX, hz: -spot.headingZ, hidden: false };
  };
  return (t, herds, out) => {
    const n0 = leadRepeat(plan, t);
    for (const n of plan.period ? [n0, n0 + 1] : [0]) {
      const w = leadTimes(plan, n);
      if (!w) continue;
      const s0 = w.out - SELF_LEAD_BRIDGE_S;
      const s1 = w.back + SELF_LEAD_BRIDGE_S;
      if (t < s0 || t >= s1 || (t >= w.mount && t < w.dismount)) continue;
      let e = ends.get(n);
      if (!e) {
        e = {
          into: [at(base, s0, herds), gate(false)],
          back: [gate(true), at(base, s1, herds)],
        };
        ends.set(n, e);
      }
      if (t < w.out) {
        walkBetween(out, e.into[0], e.into[1], t - s0, SELF_LEAD_BRIDGE_S, speed);
      } else if (t >= w.back) {
        walkBetween(out, e.back[0], e.back[1], t - w.back, SELF_LEAD_BRIDGE_S, speed);
      } else {
        const back = t >= w.dismount;
        const walking = back ? t < w.back : t < w.at;
        const d = back ? lead.length - (t - w.dismount) * LEAD_M_S : (t - w.out) * LEAD_M_S;
        leaderSpot(lead, d, back, out);
        out.hidden = false;
        delete out.lift;
        out.clip = walking ? 'walk' : 'idle';
        out.pace = walking ? pace : 1;
      }
      delete out.stage;
      return out;
    }
    return base(t, herds, out);
  };
}

/**
 * Rodina na dvorku (lord.md – Ve scéně; villagers.md – výjimka z pravidla „nikdo nestojí na
 * oploceném pozemku“ a Bez časosběru): cvičící muži a chlapci jdou den rodiny ve skutečném čase
 * (lord-day.ts – z dvorce na cvičiště `trainingGroundOf`, ke koni, k vedlejší manželce), ženy
 * rodiny pracují u dvorce. Lidé s pevným místem dne – berou se z rozpisu lidí (`takeId`) hned po
 * pohřbu a karavanách, do práce vsi pak nejdou. Jezdci dne (`SceneLord.riders`, doprovod výpravy)
 * vyjíždějí v cyklu (riders.ts – `ridePlans`) a plány jízd jdou koním (`rides`). Bez lidí ve
 * scéně, rodiny nebo cvičiště nic.
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
  const leg = pathLeg(ctx);
  const wild = ctx.village.wildlife;
  // lov (wildlife.md – Ve scéně): jezdci a pěší s oštěpy k okraji lesa u zvěře a zpět – ve
  // skutečném čase od dne lovu (`huntWindow`)
  const hunt = wild?.hunt ? huntParty(ctx, wild.hunt, hitch, leg, huntWindow, huntSpot) : null;
  const huntSpan = hunt?.rides[0]?.span ?? hunt?.foot[0]?.span ?? null;
  // jezdci lovu objížďku nejedou, když jsou na lovu (s cestou ke kůlu a zpět) – kůň je na lovu
  const hunters = new Set((wild?.hunt?.riders ?? []).map((r) => r.id));
  const busy: readonly [number, number] | null = huntSpan
    ? [huntSpan[0] - HUNT_BRIDGE_S * 1000, huntSpan[1] + HUNT_BRIDGE_S * 1000]
    : null;
  const patrolRides = ridePlans({
    village: ctx.village,
    lord,
    hitch,
    homes: ctx.homes.map((h) => ({ x: h.position.x, z: h.position.z })),
    leg,
    window,
  }).flatMap((r): RidePlan[] =>
    !hunters.has(r.riderId) ? [r] : busy && r.span ? [{ ...r, except: busy }] : [],
  );
  // kůň dojde z ohrady ke kůlu před jízdou a vrátí se po ní (riders.ts – `withLead`): z branky
  // ohrady, kde stojí, kousek před ni – vyjde a vejde u branky (`leadGate`)
  const ledPatrol = patrolRides.map((r) => withLead(r, leadGate(ctx, r.horseId), leg));
  const ledHunt = (hunt?.rides ?? []).map((r) => withLead(r, leadGate(ctx, r.horseId), leg));
  const rides = [...ledPatrol, ...ledHunt];
  // koně vyvede a odvede podkoní (D69 – ride-grooms.ts); na koho nezbude rolník, vede jezdec sám
  const groomed = groomedHorses(
    rides,
    groomCandidates(ctx.village.labor?.persons ?? [], lord).length,
  );
  const selfLed = (r: RidePlan | undefined): RidePlan | null =>
    r?.lead && r.span && !groomed.has(r.horseId) ? r : null;
  const ledPatrolOf = new Map(ledPatrol.map((r) => [r.riderId, r]));
  const ledHuntOf = new Map(ledHunt.map((r) => [r.riderId, r]));
  const patrolOf = new Map(patrolRides.map((r) => [r.riderId, r]));
  const huntRideOf = new Map((hunt?.rides ?? []).map((r) => [r.riderId, r]));
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
  const door = manorDoor(ctx, lord.home);
  // vedlejší manželky se střídají po cyklech (podle pořadí z jádra)
  const wives = lord.visit?.homes ?? [];
  const archers = lord.trainees.filter((h) => h.bow > 0).map((h) => h.id);
  const fighters = lord.trainees.filter((h) => h.combat > 0).map((h) => h.id);
  for (const [idx, hours] of lord.trainees.entries()) {
    const c = cast(ctx, `lord:${hours.id}`, { women: 0, child: false }, () =>
      ctx.roster!.takeId(hours.id),
    );
    if (!c) continue;
    const isLord = lord.lordId === hours.id || lord.visit?.lordId === hours.id;
    const speed = walkSpeed('man', isLord ? 'walk-lord' : 'walk', c.who.scale);
    const a = archers.indexOf(hours.id);
    const lane = Math.max(0, a) % lanes;
    const archer: ArcherSlot | null =
      a >= 0
        ? {
            lane: ground.lanes[lane]!,
            rank: Math.floor(a / lanes),
            ranks: Math.max(1, Math.ceil((archers.length - lane) / lanes)),
          }
        : null;
    const f = fighters.indexOf(hours.id);
    const fighter = f >= 0 ? combatSpot(ground, f) : null;
    const patrol = patrolOf.get(hours.id);
    const rest = restSpot(ctx, lord.home, idx);
    const visits = lord.visit?.lordId === hours.id && wives.length > 0;
    const routes = new Map<number, Route | null>();
    const day: TraineeDay = {
      drills: { bow: drillSeconds(hours.bow), combat: drillSeconds(hours.combat) },
      ride: patrol?.span ? (patrol.span[1] - patrol.span[0]) / 1000 : 0,
      places: {
        door,
        rest,
        bow: archer ? archer.lane.wait : null,
        combat: fighter ? fighter.spot : null,
        hitch: patrol?.span ? besideHorse(patrol) : null,
      },
      speed,
      visit: visits
        ? (k): Route | null => {
            const home = wives[((k % wives.length) + wives.length) % wives.length]!;
            if (!routes.has(home)) routes.set(home, visitRoute(ctx, lord, rest, home));
            return routes.get(home) ?? null;
          }
        : null,
      busy: hunters.has(hours.id) || walking.has(hours.id) ? busy : null,
    };
    const mounted = patrol ? riderPose(patrol) : null;
    let pose: PoseFn = traineePose({
      stepsOf: memoSteps((k) => traineeSteps(day, k)),
      door,
      archer,
      fighter,
      speed,
      lord: isLord,
      mounted: patrol ? (t): boolean => isRiding(patrol, t) : null,
      mountedPose: mounted,
    });
    // bez hodin světa (ukázky) jezdec jede nepřetržitě
    if (patrol && mounted && !patrol.span) {
      const onFoot = pose;
      pose = (t, herds, o) => (isRiding(patrol, t) ? mounted(t, herds, o) : onFoot(t, herds, o));
    }
    const huntRide = huntRideOf.get(hours.id);
    const foot = walking.get(hours.id);
    if (huntRide?.span) pose = huntBridge(pose, riderPose(huntRide), huntRide.span, speed);
    else if (foot?.span)
      pose = huntBridge(pose, footHunterPose(foot, carrier === hours.id, null), foot.span, speed);
    // bez podkoního jezdec dojde pro koně k brance a po jízdě ho odvede do ohrady sám (D69)
    for (const own of [selfLed(ledPatrolOf.get(hours.id)), selfLed(ledHuntOf.get(hours.id))]) {
      if (own) pose = selfLead(pose, own, speed);
    }
    out.push(figure(c, pose, 'natural', { kind: 'lord', household: false }));
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
      const spot = doorPoint({ ...home, box: home.own ?? home.box }, side);
      const hx = spot.x - home.position.x;
      const hz = spot.z - home.position.z;
      const n = Math.hypot(hx, hz) || 1;
      const goal = { x: spot.x + (hx / n) * HOUSEWORK_M, z: spot.z + (hz / n) * HOUSEWORK_M };
      const { kind, scale, phase } = c.who;
      const pose = householdPose(
        spot,
        route([
          [spot.x, spot.z],
          [goal.x, goal.z],
        ]),
        {
          outClip: 'walk',
          outSpeed: walkSpeed(kind, 'walk', scale),
          endClip: 'weed',
          endS: 4,
          backClip: 'carry',
          backSpeed: walkSpeed(kind, 'carry', scale),
          restClip: 'idle',
          restS: 10 + phase * 8,
        },
        phase,
      );
      out.push(figure(c, pose, 'linen', { kind: 'lord', household: true }));
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
    out.stage = 'hunt';
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
