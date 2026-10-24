// Vojvodova rodina na dvorku (docs/design/lord.md – Ve scéně): muži a chlapci střílejí na terče,
// bojují ve dvojici nebo u kůlu, ženy rodiny stojí u dvorce jako ženy u domů. Kdo, kolik hodin
// a zda vůbec cvičí, určuje jádro (`SceneLabor.lord`); scéna jen rozvrhne hodiny do dne.
import type { SceneLabor, SceneLord } from '../village-view';
import { type DayWindow } from './caravan';
import { hourOfDay, ridePlans, riderPose, type RidePlan } from './riders';
import { cast, figure } from './villager-plan-cast';
import { doorPoint, walkRoute } from './villager-plan-geometry';
import { type Context, type PlannedVillager } from './villager-plan-types';
import {
  fetcher,
  route,
  type PoseFn,
  type VillagerClip,
  type VillagerKind,
  type VillagerPose,
} from './villager-motion';
import { trainingGroundOf, type TrainingGround, type TrainingSpot } from './training-ground-layout';
import type { Point } from './villager-plan-types';

/**
 * Rozvrh výcviku dne (lord.md – Den rodiny: dva bloky, dopoledne a odpoledne – Vegetius; návrh
 * Clauda): bloky začínají v 8 a ve 14 h, v každém polovina hodin dne – napřed luk, pak boj, pak
 * jízda (jezdce kreslí jízda, na dvorku ten čas není). Ženy rodiny jsou u dvorce od 7 do 19 h.
 */
export const DRILL_BLOCKS_H: readonly number[] = [8, 14];
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
    // mimo výcvik (poledne, jízda, večer) ve dne stojí u dvorku jako ostatní muži mimo práci;
    // skrytý je jen v noci (jako ženy rodiny)
    put(out, rest, 'idle');
    if (hour !== null && isNight(hour)) out.hidden = true;
    return out;
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
): { people: PlannedVillager[]; rides: RidePlan[] } {
  const lord = labor.lord;
  if (!lord || !ctx.roster) return { people: [], rides: [] };
  const ground = trainingGroundOf(ctx.village);
  if (!ground || ground.home !== lord.home) return { people: [], rides: [] };
  const out: PlannedVillager[] = [];
  // jízdy dne – po pěšinách a kolem domů (walkRoute), jinak rovně; přes pole nikdy (rider-route.ts)
  const rides = ridePlans({
    village: ctx.village,
    lord,
    hitch: hitchSpot(ground),
    homes: ctx.homes.map((h) => ({ x: h.position.x, z: h.position.z })),
    leg: (a, b): Point[] => {
      const r = walkRoute(ctx, a, b);
      return r ? r.points.map(([x, z]) => ({ x, z })) : [a, b];
    },
    window,
  });
  const riding = new Map(rides.map((r) => [r.riderId, r]));
  const lanes = ground.lanes.length;
  // jezdci jsou na koni – dráhy a místa boje dostanou jen ostatní
  const drilling = lord.trainees.filter((h) => !riding.has(h.id));
  const archers = drilling.filter((h) => h.bow > 0).map((h) => h.id);
  const fighters = drilling.filter((h) => h.combat > 0).map((h) => h.id);
  for (const [idx, hours] of lord.trainees.entries()) {
    const c = cast(ctx, `lord:${hours.id}`, { women: 0, child: false }, () =>
      ctx.roster!.takeId(hours.id),
    );
    if (!c) continue;
    const ride = riding.get(hours.id);
    if (ride) {
      out.push(figure(c, riderPose(ride), 'natural', { kind: 'lord', household: false }));
      continue;
    }
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
    );
    out.push(figure(c, pose, 'natural', { kind: 'lord', household: false }));
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
  return { people: out, rides };
}
