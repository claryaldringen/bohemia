// Den vojvodovy rodiny ve skutečném čase (docs/design/lord.md – Ve scéně; villagers.md – Bez
// časosběru; Martin 1. 11. 2026: „Koukám na vojvodu a ten mezi jednotlivými činnostmi mizí a zase
// se objevuje. A lukostřelbu i boj cvičí velice krátce, skoro to není vidět“). Výcvik už neběží
// v hodinách herního dne (≈ 86 s – luk hodinu = 3,6 s, v noci herního dne skrytý), ale v cyklech
// skutečného času: vyjde z dvorce, cvičí luk a boj (střídavě napřed jedno, pak druhé), jezdci
// vyjedou, pak postojí u dvorku, vejde – a doma chvíli do dalšího cyklu. Poměr luk / boj / jízda
// a kdo vůbec cvičí dává jádro (`SceneLabor.lord`), jádro se nemění. Čisté funkce skutečného času
// (s – villagerSeconds) bez Babylonu: stejný okamžik = stejná činnost, cykly jsou zarovnané na
// LIVESTOCK_EPOCH_MS, takže se rodina cvičí společně (dvojice, střídačka u terče, skupina jezdců).
import {
  alongRoute,
  LORD_IDLE_CLIPS,
  shuttle,
  shuttleCycle,
  type PoseFn,
  type ShuttleOptions,
  type Route,
  type VillagerClip,
  type VillagerPose,
} from './villager-motion';
import type { Point } from './villager-plan-types';
import type { TrainingSpot } from './training-ground-layout';

/** Cyklus dne rodiny ve scéně (s, návrh Clauda) – jeden blok výcviku a odpočinek. */
export const LORD_CYCLE_S = 20 * 60;
/** Hodina výcviku dne z jádra = tolik s v cyklu (návrh Clauda: muž 14–44 let luk 2 h = 4 minuty). */
export const DRILL_S_PER_H = 120;
/** Nejkratší cvičení (s) – kdo vůbec cvičí, cvičí aspoň minutu. */
export const MIN_DRILL_S = 60;
/**
 * Pevné body cyklu (s od začátku): doma nejméně do `lead`; v `switch` se mění luk za boj (první
 * cvičení v něm končí, druhé po přechodu začíná – dvojice a střídačka cvičí naráz); jezdci vyjedou
 * v `ride` nejdéle na `rideMax`; u dvorku se stojí do `rest`, pak vejde.
 */
export const LORD_CYCLE = {
  lead: 60,
  switch: 8 * 60,
  ride: 13 * 60,
  rideMax: 4 * 60,
  rest: 19 * 60,
} as const;
/** Doma nejméně tolik s mezi dvěma činnostmi. */
export const HOME_MIN_S = 30;
/**
 * Návštěva vedlejší manželky (lord.md – Manželky, Ve scéně; návrh Clauda): vojvoda vyjde od dvorku
 * v `from` cyklu (po výcviku i jízdě), u manželky je `stay` (nejméně `minStay`, jinak tento cyklus
 * nejde) a zpět u dvorku je nejpozději v `backBy` (do dalšího cyklu – první cvičení pak zkrátí).
 */
export const LORD_VISIT = {
  from: 17.5 * 60,
  backBy: LORD_CYCLE_S + 5 * 60,
  stay: 4 * 60,
  minStay: 60,
} as const;
/** Ženy rodiny: cyklus domácí práce u dvorce (s) a doma na jeho začátku (s, los podle ženy). */
export const HOUSEHOLD_CYCLE_S = 10 * 60;
export const HOUSEHOLD_HOME_S = { from: 60, to: 120 } as const;
/** Lovci dojdou ke kůlu před lovem (a od kůlu zpět po něm) nejvýš za tolik s. */
export const HUNT_BRIDGE_S = 40;

/** Výstřel: míření (bow-draw) a výstřel (bow-release) – s; střídačka u terče po dvou výstřelech. */
const SHOT_S = 3.2;
const AIM_S = 2.2;
const TURN_S = SHOT_S * 2;
/** Čekající u terče stojí za sebou po tolika m; chůze od terče má rezervu tolika m. */
const QUEUE_M = 0.9;
const QUEUE_SLACK_M = 4;
/** Dvojice se střídá v útoku a krytí po tolika s; u kůlu meč a oštěp po 4 s. */
const BOUT_S = 1.6;
const POST_SWITCH_S = 4;
/** Po kolika sekundách vojvoda u dvorku změní stání vladaře (`LORD_IDLE_CLIPS`). */
export const LORD_IDLE_S = 6;

/** Délka cvičení v cyklu (s) z hodin dne jádra; 0 – necvičí. */
export function drillSeconds(hours: number): number {
  return hours > 0 ? Math.max(MIN_DRILL_S, hours * DRILL_S_PER_H) : 0;
}

/** Cyklus, ve kterém je čas `t` (s). */
export function cycleIndex(t: number): number {
  return Math.floor(t / LORD_CYCLE_S);
}

/** Jízda cyklu `k`: od–do (s) – stejné pro všechny jezdce (skupina jede spolu). */
export function rideSlot(k: number, lengthS: number): readonly [number, number] {
  const from = k * LORD_CYCLE_S + LORD_CYCLE.ride;
  return [from, from + Math.min(LORD_CYCLE.rideMax, lengthS)];
}

/** Druh kroku dne: chůze, luk, boj, čekání u koně, jízda, stání u dvorku, u manželky (skrytý). */
export type LordStepKind = 'walk' | 'bow' | 'combat' | 'wait' | 'ride' | 'rest' | 'away';

/** Krok dne cvičícího – od–do (s); mimo kroky je doma (skrytý ve dveřích dvorce). */
export interface LordStep {
  kind: LordStepKind;
  from: number;
  to: number;
  /** Kde stojí (u chůze cíl). */
  at: TrainingSpot;
  /** Chůze: odkud. */
  start?: TrainingSpot;
  /** Chůze po trase (návštěva), `reverse` – zpět. */
  route?: Route;
  reverse?: boolean;
}

/** Místa dne cvičícího. */
export interface TraineePlaces {
  /** Dveře dvorce – doma skrytý tady. */
  door: TrainingSpot;
  /** Stání u dvorku po výcviku. */
  rest: TrainingSpot;
  /** Kde střílí (dráha – čeká se za ní), kde bojuje; null – to necvičí. */
  bow: TrainingSpot | null;
  combat: TrainingSpot | null;
  /** Kde čeká u koně (jezdec), jinak null. */
  hitch: TrainingSpot | null;
}

/** Vstup dne cvičícího. */
export interface TraineeDay {
  /** Délka luku a boje v cyklu (s – `drillSeconds`). */
  drills: { bow: number; combat: number };
  /** Délka jízdy cyklu (s, 0 – nejezdí; `rideSlot`). */
  ride: number;
  places: TraineePlaces;
  /** Tempo chůze (m/s). */
  speed: number;
  /** Trasa od stání u dvorku ke dveřím vedlejší manželky v cyklu `k`, jinak null. */
  visit?: ((k: number) => Route | null) | null;
  /** Kdy je zaneprázdněný jinde (s od–do – lov), návštěva se mu nevyhne. */
  busy?: readonly [number, number] | null;
}

/** Návštěva v cyklu `k`: odchod od dvorku, příchod k manželce, odchod od ní, návrat (s). */
export interface VisitPlan {
  depart: number;
  arrive: number;
  leave: number;
  back: number;
  route: Route;
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.z - a.z);

/** Návštěva vedlejší manželky v cyklu `k`, nebo null (bez manželky, krátký čas, lov). */
export function visitPlan(day: TraineeDay, k: number): VisitPlan | null {
  const route = day.visit?.(k) ?? null;
  if (!route) return null;
  const walk = route.length / day.speed;
  const depart = k * LORD_CYCLE_S + LORD_VISIT.from;
  const stay = Math.min(LORD_VISIT.stay, k * LORD_CYCLE_S + LORD_VISIT.backBy - depart - 2 * walk);
  if (stay < LORD_VISIT.minStay) return null;
  const back = depart + 2 * walk + stay;
  if (day.busy && day.busy[0] < back && day.busy[1] > depart) return null;
  return { depart, arrive: depart + walk, leave: depart + walk + stay, back, route };
}

/**
 * Kroky cvičícího v cyklu `k` (lord.md – Ve scéně, návrh Clauda): doma, vyjde ze dveří a dojde
 * k prvnímu cvičení (střídavě luk a boj), v `switch` přejde ke druhému, jezdec ke koni a v `ride`
 * vyjede, pak stojí u dvorku (vojvoda případně jde k manželce) a vejde. Mezi místy chůzí.
 */
export function traineeSteps(day: TraineeDay, k: number): LordStep[] {
  const c = k * LORD_CYCLE_S;
  const { places, speed } = day;
  const steps: LordStep[] = [];
  let here = places.door;
  // od terče se odchází z místa, kde střelec zrovna stál (u terče či v řadě) – chůze má rezervu
  const walkS = (to: Point): number =>
    (distance(here, to) + (here === places.bow ? QUEUE_SLACK_M : 0)) / speed;
  const go = (to: TrainingSpot, from: number): number => {
    const to1 = from + walkS(to);
    if (to1 > from) steps.push({ kind: 'walk', from, to: to1, at: to, start: here });
    here = to;
    return to1;
  };
  const stay = (kind: LordStepKind, from: number, to: number): void => {
    if (to > from) steps.push({ kind, from, to, at: here });
  };
  const prev = visitPlan(day, k - 1);
  const notBefore = Math.max(
    c + LORD_CYCLE.lead,
    prev ? prev.back + distance(places.rest, places.door) / speed + HOME_MIN_S : -Infinity,
  );
  const order: ('bow' | 'combat')[] = k % 2 === 0 ? ['bow', 'combat'] : ['combat', 'bow'];
  const drills = order
    .map((kind) => ({ kind, length: day.drills[kind], at: places[kind] }))
    .filter((d): d is { kind: 'bow' | 'combat'; length: number; at: TrainingSpot } =>
      Boolean(d.length > 0 && d.at),
    );
  const riding = day.ride > 0 && places.hitch ? rideSlot(k, day.ride) : null;
  // kdy nejpozději končí poslední cvičení – jezdec musí dojít ke koni, ostatní stát u dvorku
  const lastEnd = (at: Point): number =>
    riding && places.hitch
      ? riding[0] - distance(at, places.hitch) / speed
      : c + LORD_CYCLE.rest - distance(at, places.rest) / speed;
  const switchT = c + LORD_CYCLE.switch;
  let t = notBefore;
  if (drills.length === 2) {
    const [a, b] = drills as [(typeof drills)[number], (typeof drills)[number]];
    const depart = Math.max(notBefore, switchT - a.length - distance(here, a.at) / speed);
    t = go(a.at, depart);
    const end = Math.max(t, switchT);
    stay(a.kind, t, end);
    t = go(b.at, end);
    const end2 = Math.max(t, Math.min(t + b.length, lastEnd(b.at)));
    stay(b.kind, t, end2);
    t = end2;
  } else if (drills.length === 1) {
    const a = drills[0]!;
    t = go(a.at, Math.max(notBefore, switchT - distance(here, a.at) / speed));
    const end = Math.max(t, Math.min(t + a.length, lastEnd(a.at)));
    stay(a.kind, t, end);
    t = end;
  }
  if (riding && places.hitch) {
    t = go(places.hitch, t);
    stay('wait', t, riding[0]);
    stay('ride', Math.max(t, riding[0]), riding[1]);
    t = Math.max(t, riding[1]);
  }
  t = go(places.rest, t);
  const visit = visitPlan(day, k);
  if (visit) {
    stay('rest', t, visit.depart);
    const from = Math.max(t, visit.depart);
    const end = visit.route.points[visit.route.points.length - 1]!;
    const wife: TrainingSpot = {
      x: end[0],
      z: end[1],
      headingX: here.headingX,
      headingZ: here.headingZ,
    };
    steps.push({
      kind: 'walk',
      from,
      to: visit.arrive,
      at: wife,
      start: here,
      route: visit.route,
    });
    steps.push({ kind: 'away', from: visit.arrive, to: visit.leave, at: wife });
    steps.push({
      kind: 'walk',
      from: visit.leave,
      to: visit.back,
      at: here,
      start: here,
      route: visit.route,
      reverse: true,
    });
    t = visit.back;
  } else {
    stay('rest', t, c + LORD_CYCLE.rest);
    t = Math.max(t, c + LORD_CYCLE.rest);
  }
  go(places.door, t);
  return steps;
}

/** Krok, ve kterém je čas `t`, z kroků cyklu (`stepsOf` – i předchozí cyklus, návštěva přesahuje). */
export function stepAt(stepsOf: (k: number) => readonly LordStep[], t: number): LordStep | null {
  const k = cycleIndex(t);
  for (const j of [k, k - 1]) {
    for (const s of stepsOf(j)) if (t >= s.from && t < s.to) return s;
  }
  return null;
}

/** Kroky cyklů s pamětí posledních několika (póza se ptá za snímek). */
export function memoSteps(of: (k: number) => LordStep[]): (k: number) => readonly LordStep[] {
  const cache = new Map<number, LordStep[]>();
  return (k) => {
    let found = cache.get(k);
    if (!found) {
      if (cache.size > 4) cache.clear();
      found = of(k);
      cache.set(k, found);
    }
    return found;
  };
}

function put(out: VillagerPose, s: TrainingSpot, clip: VillagerClip): VillagerPose {
  out.x = s.x;
  out.z = s.z;
  out.headingX = s.headingX;
  out.headingZ = s.headingZ;
  out.clip = clip;
  out.pace = 1;
  return out;
}

/** Doma – skrytý ve dveřích. */
function inside(out: VillagerPose, door: Point): VillagerPose {
  out.x = door.x;
  out.z = door.z;
  out.clip = 'idle';
  out.pace = 1;
  out.stage = 'home';
  out.hidden = true;
  return out;
}

/** Střelec u dráhy: pořadí (`rank`) z kolika (`ranks`) se střídají u terče, ostatní čekají za ním. */
export interface ArcherSlot {
  lane: { shoot: TrainingSpot; wait: TrainingSpot };
  rank: number;
  ranks: number;
}

/** Bojující: místo a úloha (dvojice, kůl, čeká). */
export interface FighterSlot {
  spot: TrainingSpot;
  role: 'pair-a' | 'pair-b' | 'post' | 'wait';
}

/** Kde střelec v kole `turn` stojí – u terče, nebo v řadě za ním (kdo jde dřív, stojí vpředu). */
function archerSpot(a: ArcherSlot, turn: number): TrainingSpot {
  const slot = (((a.rank - turn) % a.ranks) + a.ranks) % a.ranks;
  if (slot === 0) return a.lane.shoot;
  const back = (slot - 1) * QUEUE_M;
  const w = a.lane.wait;
  return { ...w, x: w.x - w.headingX * back, z: w.z - w.headingZ * back };
}

/** Vstup pózy cvičícího. */
export interface TraineePoseInput {
  stepsOf: (k: number) => readonly LordStep[];
  door: Point;
  archer: ArcherSlot | null;
  fighter: FighterSlot | null;
  speed: number;
  /** Vojvoda – chodí a stojí jako vladař. */
  lord: boolean;
  /** Na koni v kroku jízdy (riders.ts – `riderPose`), když zrovna jede; jinak null. */
  mounted?: ((t: number) => boolean) | null;
  mountedPose?: PoseFn | null;
}

/**
 * Póza cvičícího podle kroků dne: doma skrytý ve dveřích, chůze mezi místy (klip chůze, vladař
 * `walk-lord`), u terče střídačka (k terči a zpět do řady chůzí), boj ve dvojici či u kůlu, u koně
 * čeká, na koni jede (`mountedPose`), u dvorku stojí, u manželky skrytý v jejích dveřích. Noc
 * herního dne nic neschovává.
 */
export function traineePose(input: TraineePoseInput): PoseFn {
  const { stepsOf, door, archer, fighter, speed, lord } = input;
  const walkClip: VillagerClip = lord ? 'walk-lord' : 'walk';
  // kde krok skončil (chůze z luku vyjde z místa, kde střelec stál)
  const ends = new WeakMap<LordStep, Point>();
  const bowAt = (s: LordStep, t: number, out: VillagerPose): VillagerPose => {
    if (!archer) return put(out, s.at, 'idle');
    const turn = Math.floor(t / TURN_S);
    const spot = archerSpot(archer, turn);
    // na začátku kola dojde na své nové místo (z řady k terči, od terče na konec řady)
    const from = t - turn * TURN_S < t - s.from ? archerSpot(archer, turn - 1) : s.at;
    const since = Math.min(t - s.from, t - turn * TURN_S);
    const d = distance(from, spot);
    if (d > 1e-6 && since * speed < d) {
      const f = (since * speed) / d;
      out.x = from.x + (spot.x - from.x) * f;
      out.z = from.z + (spot.z - from.z) * f;
      out.headingX = (spot.x - from.x) / d;
      out.headingZ = (spot.z - from.z) / d;
      out.clip = 'walk';
      out.pace = 1;
      return out;
    }
    if (spot !== archer.lane.shoot) return put(out, spot, 'idle');
    return put(out, spot, t % SHOT_S < AIM_S ? 'bow-draw' : 'bow-release');
  };
  const combatAt = (s: LordStep, t: number, out: VillagerPose): VillagerPose => {
    const beat = Math.floor(t / BOUT_S) % 2 === 0;
    const role = fighter?.role ?? 'wait';
    if (role === 'pair-a') return put(out, s.at, beat ? 'sword-strike' : 'shield-block');
    if (role === 'pair-b') return put(out, s.at, beat ? 'shield-block' : 'sword-strike');
    if (role === 'post')
      return put(
        out,
        s.at,
        Math.floor(t / POST_SWITCH_S) % 2 === 0 ? 'sword-strike' : 'spear-thrust',
      );
    return put(out, s.at, 'idle');
  };
  const pose: PoseFn = (t, herds, out) => {
    out.hidden = false;
    delete out.lift;
    const s = stepAt(stepsOf, t);
    if (!s) return inside(out, door);
    switch (s.kind) {
      case 'walk': {
        // kam jde (panel postavy – person-activity.ts): na cvičiště, ke koni, k manželce, ke dvorci
        const next = s.route && !s.reverse ? 'away' : stepAt(stepsOf, s.to + 1e-3)?.kind;
        out.stage =
          next === 'bow' || next === 'combat'
            ? 'out'
            : next === 'wait' || next === 'ride'
              ? 'hitch'
              : next === 'away'
                ? 'visit'
                : 'back';
        if (s.route) {
          // zpět po téže trase – vzdálenost od začátku trasy ubývá, směr otočený
          const d = Math.min(s.route.length, (t - s.from) * speed);
          alongRoute(s.route, s.reverse ? s.route.length - d : d, s.reverse === true, out);
          out.clip = walkClip;
          out.pace = 1;
          return out;
        }
        let a: Point = s.start ?? s.at;
        // chůze z cvičení u terče – odkud střelec opravdu odchází
        const before = stepAt(stepsOf, s.from - 1e-3);
        if (before?.kind === 'bow') {
          let end = ends.get(before);
          if (!end) {
            const probe = bowAt(before, s.from - 1e-3, { ...out });
            end = { x: probe.x, z: probe.z };
            ends.set(before, end);
          }
          a = end;
        }
        const b = s.at;
        const d = distance(a, b);
        const f = Math.min(1, Math.max(0, (t - s.from) / Math.max(1e-6, s.to - s.from)));
        out.x = a.x + (b.x - a.x) * f;
        out.z = a.z + (b.z - a.z) * f;
        if (d > 1e-6) {
          out.headingX = (b.x - a.x) / d;
          out.headingZ = (b.z - a.z) / d;
        }
        out.clip = walkClip;
        out.pace = Math.min(1.3, d / Math.max(1e-6, s.to - s.from) / speed);
        if (out.pace < 0.5) out.pace = 1;
        return out;
      }
      case 'bow':
        out.stage = 'bow';
        return bowAt(s, t, out);
      case 'combat':
        out.stage = 'combat';
        return combatAt(s, t, out);
      case 'ride':
        if (input.mountedPose && input.mounted?.(t)) return input.mountedPose(t, herds, out);
        out.stage = 'wait';
        return put(out, s.at, 'idle');
      case 'wait':
        out.stage = 'wait';
        return put(out, s.at, 'idle');
      case 'away':
        // u vedlejší manželky – skrytý v jejích dveřích
        out.stage = 'visit';
        return inside(out, s.at);
      case 'rest': {
        out.stage = 'rest';
        const n = LORD_IDLE_CLIPS.length;
        return put(
          out,
          s.at,
          lord ? LORD_IDLE_CLIPS[((Math.floor(t / LORD_IDLE_S) % n) + n) % n]! : 'idle',
        );
      }
    }
  };
  return pose;
}

/**
 * Žena rodiny u dvorce (lord.md – Ve scéně): cyklus `HOUSEHOLD_CYCLE_S` posunutý podle ženy
 * (`phase` 0–1) – doma `HOUSEHOLD_HOME_S`, pak domácí práce před vchodem (`chore` – pochůzka pro
 * vodu a dřevo po dvoře jako ženy u domů, celé otočky, takže končí ve dveřích) a vejde. Noc
 * herního dne nic neschovává.
 */
export function householdPose(
  door: Point,
  work: Route,
  chore: Omit<ShuttleOptions, 'phase' | 'restHidden'>,
  phase: number,
): PoseFn {
  const pose = shuttle(work, { ...chore, phase: 0 });
  const { cycleS } = shuttleCycle(work, { ...chore, phase: 0 });
  const shift = phase * HOUSEHOLD_CYCLE_S;
  const home = HOUSEHOLD_HOME_S.from + (HOUSEHOLD_HOME_S.to - HOUSEHOLD_HOME_S.from) * phase;
  // celé otočky – poslední skončí stáním ve dveřích
  const turns = Math.max(1, Math.floor((HOUSEHOLD_CYCLE_S - home - HOME_MIN_S) / cycleS));
  const end = home + turns * cycleS;
  return (t, herds, out) => {
    out.hidden = false;
    delete out.stage;
    const local = (((t - shift) % HOUSEHOLD_CYCLE_S) + HOUSEHOLD_CYCLE_S) % HOUSEHOLD_CYCLE_S;
    if (local < home || local >= end) return inside(out, door);
    return pose(local - home, herds, out);
  };
}
