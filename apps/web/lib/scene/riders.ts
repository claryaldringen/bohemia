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
import { drillSeconds, LORD_CYCLE_S, rideSlot } from './lord-day';
import type { TrainingSpot } from './training-ground-layout';
import type { PoseFn } from './villager-motion';
import { squareCorners } from './villager-plan-geometry';
import { WINTER_MONTHS, type Point, type Square } from './villager-plan-types';

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
  /**
   * Jízda ve skutečném čase (ms od–do) místo bloků dne – jde přes víc herních dní; výcviková jízda
   * (`ridePlans`) se opakuje v každém cyklu dne rodiny (`period`). S ním se `blocks` nečtou.
   */
  span?: readonly [number, number];
  /** Jízda `span` se opakuje po tolika ms (lord-day.ts – cyklus dne rodiny). */
  period?: number;
  /** Opakovaná jízda, která zasáhne do tohoto času (ms od–do – jiná jízda jezdce), se nejede. */
  except?: readonly [number, number];
  /** Kde kůň stojí, když se nejede – u kůlu u brány dvorce, čelem ke kůlu. */
  hitch: TrainingSpot;
  window: DayWindow | null;
  /**
   * Kdy kůň stojí uvázaný u kůlu `hitch` mimo ohradu (skutečný čas, ms od–do – kování u branky
   * ohrady, shoeing-plan.ts); jezdec nejede (`route` null). Bez údaje jen jízdy.
   */
  tied?: readonly (readonly [number, number])[];
  /**
   * Cesta koně od branky jeho ohrady ke kůlu `hitch` (horses.md – Ve scéně; návrh Clauda): před
   * každou jízdou (`span`) ho po ní vyvede podkoní (ride-grooms.ts; bez rolníků jezdec sám – D69)
   * a u kůlu chvíli stojí, po jízdě ho odvede zpět do ohrady – z ohrady vyjde a do ní vejde
   * u branky. Bez údaje se kůň objeví u kůlu.
   */
  lead?: RideLead;
}

/** Cesta koně z ohrady ke kůlu – body od branky ke kůlu a délka (m). */
export interface RideLead {
  points: readonly Point[];
  length: number;
  /** Směr koně u kůlu – jako na začátku jízdy. */
  heading: Point;
}

/** Kůň vedený za uzdu jde z ohrady ke kůlu a zpět krokem (m/s, návrh Clauda). */
export const LEAD_M_S = 1.2;
/** U kůlu stojí před jízdou (s) – jezdec nasedá na stojícího koně. */
export const LEAD_WAIT_S = 10;

/**
 * Cesta koně z branky ohrady `gate` ke kůlu plánu (po pěšinách `leg`, jinak rovně) – končí tam,
 * kde jízda začíná (místo koně ve skupině, čelem po trase), ať se kůň při nasednutí nepřenese.
 */
export function withLead(plan: RidePlan, gate: Point | null, leg: RideLeg): RidePlan {
  if (!gate || !plan.span) return plan;
  const start = rideState(
    plan,
    (plan.span[0] - LIVESTOCK_EPOCH_MS) / 1000 + 1e-3,
    createRideState(),
  );
  const lead = leadPath(
    gate,
    { x: start.x, z: start.z },
    { x: start.headingX, z: start.headingZ },
    leg,
  );
  return lead ? { ...plan, lead } : plan;
}

/**
 * Cesta koně z branky ohrady `gate` k místu `end` u kůlu (po pěšinách `leg`, jinak rovně), u kůlu
 * čelem `heading`; kratší než 0,5 m – null (kůň stojí u kůlu). Stejná cesta před jízdou dne rodiny
 * (`withLead`) i při odjezdu a příjezdu výjezdu vojvody (expedition-choreo.ts).
 */
export function leadPath(gate: Point, end: Point, heading: Point, leg: RideLeg): RideLead | null {
  const found = leg(gate, end);
  const points = found && found.length >= 2 ? [gate, ...found.slice(1, -1), end] : [gate, end];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  }
  return length <= 0.5 ? null : { points, length, heading };
}

/**
 * Kůň na cestě z ohrady ke kůlu `d` m od branky (`back` – jde zpět do ohrady): poloha, směr a krok;
 * na koncích stojí čelem jako u kůlu. Den rodiny (`rideHorsePose`) i výjezd (expedition-choreo.ts).
 */
export function leadPose(
  lead: RideLead,
  d: number,
  back: boolean,
  out: LivestockPose,
): LivestockPose {
  const pts = lead.points;
  let rest = d;
  let i = 1;
  for (; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
    if (rest <= len) break;
    rest -= len;
  }
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const f = Math.min(1, rest / len);
  const walking = d > 0 && d < lead.length;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.forwardX = walking ? ((b.x - a.x) / len) * (back ? -1 : 1) : lead.heading.x;
  out.forwardZ = walking ? ((b.z - a.z) / len) * (back ? -1 : 1) : lead.heading.z;
  out.head = 0;
  out.stride = walking ? Math.sin((2 * Math.PI * d) / (STRIDE_M.walk * RIDE_HORSE_SCALE)) : 0;
  return out;
}

/**
 * Vedení koně v jednom opakování jízdy (s – villagerSeconds; D69): kůň vyjde od branky (`out`),
 * u kůlu je v `at`, jezdec nasedne v `mount` a sesedne v `dismount`, kůň je zpět u branky v `back`.
 */
export interface LeadTimes {
  /** Opakování jízdy (`RidePlan.period`); bez opakování 0. */
  n: number;
  out: number;
  at: number;
  mount: number;
  dismount: number;
  back: number;
}

/**
 * Vedení koně v opakování `n` jízdy `plan`: před jízdou krokem `LEAD_M_S` od branky ke kůlu
 * a `LEAD_WAIT_S` stání, po jízdě zpět. Bez cesty z ohrady, bez opakování (jen `n` 0) nebo jízda,
 * která se nejede (`except`) – null.
 */
export function leadTimes(plan: RidePlan, n: number): LeadTimes | null {
  const lead = plan.lead;
  if (!lead || !plan.span || (!plan.period && n !== 0)) return null;
  const [from0, to0] = plan.span;
  const from = from0 + n * (plan.period ?? 0);
  const to = from + (to0 - from0);
  if (plan.except && plan.except[0] < to && plan.except[1] > from) return null;
  const walk = lead.length / LEAD_M_S;
  const mount = (from - LIVESTOCK_EPOCH_MS) / 1000;
  const dismount = (to - LIVESTOCK_EPOCH_MS) / 1000;
  return {
    n,
    out: mount - LEAD_WAIT_S - walk,
    at: mount - LEAD_WAIT_S,
    mount,
    dismount,
    back: dismount + walk,
  };
}

/** Opakování jízdy `plan`, do kterého spadá čas `t` (s) – nejbližší začaté (bez `period` 0). */
export function leadRepeat(plan: RidePlan, t: number): number {
  if (!plan.span || !plan.period) return 0;
  return Math.floor((t * 1000 + LIVESTOCK_EPOCH_MS - plan.span[0]) / plan.period);
}

/**
 * Kde je kůň na cestě z ohrady ke kůlu v čase `t`: vzdálenost od branky (m; u kůlu `length`) a zda
 * jde zpět do ohrady – před jízdou dojde a `LEAD_WAIT_S` stojí u kůlu, po jízdě se vrátí. Mimo null.
 */
export function leadAt(plan: RidePlan, t: number): { d: number; back: boolean } | null {
  const lead = plan.lead;
  if (!lead || !plan.span) return null;
  const base = leadRepeat(plan, t);
  for (const n of plan.period ? [base, base + 1] : [0]) {
    const w = leadTimes(plan, n);
    if (!w) continue;
    if (t >= w.out && t < w.mount) {
      return { d: Math.min(lead.length, (t - w.out) * LEAD_M_S), back: false };
    }
    if (t >= w.dismount && t < w.back) {
      return { d: Math.max(0, lead.length - (t - w.dismount) * LEAD_M_S), back: true };
    }
  }
  return null;
}

/** Kdo vede koně, jde u jeho hlavy (m před středem koně) po pravé straně (m) – jezdec nasedá zleva. */
const LEADER_AHEAD_M = 0.7;
const LEADER_SIDE_M = 0.75;

/**
 * Člověk, který vede koně za uzdu (podkoní, bez něj jezdec sám – D69, Martin 15. 11. 2026): `d` m
 * od branky po cestě `lead` (`back` – zpět do ohrady) u hlavy koně po jeho pravé straně, čelem po
 * směru chůze. Směr bere z části cesty, ve které je – na koncích nestojí jinak než při chůzi, ať
 * se při zastavení a otočce nepřenese (u kůlu se kůň natočí po směru jízdy sám).
 */
export function leaderSpot(
  lead: RideLead,
  d: number,
  back: boolean,
  out: { x: number; z: number; headingX: number; headingZ: number },
): { x: number; z: number; headingX: number; headingZ: number } {
  const pts = lead.points;
  let rest = Math.min(lead.length, Math.max(0, d));
  let a = pts[0]!;
  let b = pts[1] ?? a;
  for (let i = 1; i < pts.length; i++) {
    a = pts[i - 1]!;
    b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (rest <= len || i === pts.length - 1) break;
    rest -= len;
  }
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const f = Math.min(1, rest / len);
  const s = back ? -1 : 1;
  const fx = ((b.x - a.x) / len) * s;
  const fz = ((b.z - a.z) / len) * s;
  out.x = a.x + (b.x - a.x) * f + fx * LEADER_AHEAD_M + fz * LEADER_SIDE_M;
  out.z = a.z + (b.z - a.z) * f + fz * LEADER_AHEAD_M - fx * LEADER_SIDE_M;
  out.headingX = fx;
  out.headingZ = fz;
  return out;
}

/** Jde kůň v čase `t` z ohrady ke kůlu, stojí u něj před jízdou, nebo se vrací do ohrady? */
export function isLed(plan: RidePlan, t: number): boolean {
  return leadAt(plan, t) !== null;
}

/** Délka herního dne bez hodin světa (s – ukázky): 365 skutečných dní = 1000 herních let. */
export const FALLBACK_DAY_S = 86.4;

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
 * Výcviková jízda ve skutečném čase (lord.md – Ve scéně; villagers.md – Bez časosběru; návrh
 * Clauda): v každém cyklu dne rodiny (`LORD_CYCLE_S`) od `LORD_CYCLE.ride`, po luku a boji –
 * skupina jede spolu tak dlouho, kolik dá nejdelší jízda dne ve skupině (hodina jízdy jádra =
 * `DRILL_S_PER_H` s, nejvýš `LORD_CYCLE.rideMax`), krokem a klusem půlku tam a půlku zpět.
 * Vrátí `span` (ms, první cyklus) a `period` (ms).
 */
export function rideSpan(hours: number): { span: readonly [number, number]; period: number } {
  const [from, to] = rideSlot(0, drillSeconds(hours));
  return {
    span: [LIVESTOCK_EPOCH_MS + from * 1000, LIVESTOCK_EPOCH_MS + to * 1000],
    period: LORD_CYCLE_S * 1000,
  };
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
    const longest = Math.max(...group.map((r) => r.hours));
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
        blocks: null,
        ...(window && longest > 0 ? rideSpan(longest) : {}),
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
      blocks: null,
      ...(window && lord.escort.hours > 0 ? rideSpan(lord.escort.hours) : {}),
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
 * Kde je jezdec s koněm v čase `t` (s skutečného času). Jede jen v bloku jízdy (`span` ve
 * skutečném čase – `rideSpan`, lov; dřív `blocks` hodin dne): blok začíná u kůlu, kůň jede po
 * trase tempem `rideDistance` z počátku bloku a v druhé půlce bloku se po téže trase vrací, takže
 * na konci stojí zase u kůlu (návrh Clauda: okruh nebo cesta k hranici se do bloku nevejde, proto
 * jen vyjede a vrátí se). Mimo blok kůň stojí u kůlu (jezdec cvičí, kůň je v ohradě – `riding`
 * false). Bez rozvrhu (bez `span` i `blocks`, bez hodin světa) jede nepřetržitě po celé trase.
 */
export function rideState(plan: RidePlan, t: number, out: RideState): RideState {
  const block = plan.route ? rideBlockAt(plan, t) : null;
  if (!plan.route || ((plan.blocks || plan.span) && !block)) {
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
    const half = block.length / 2;
    back = block.elapsed > half;
    d = rideDistance(plan.route, Math.min(block.elapsed, block.length - block.elapsed));
  } else {
    d = rideDistance(plan.route, t) + plan.offset;
  }
  rideSpot(plan.route, Math.max(0, d - plan.behind), out);
  // stranou od osy podle směru trasy (i cestou zpět – na obratu se jezdec nepřenese na druhou stranu)
  out.x -= out.headingZ * plan.side;
  out.z += out.headingX * plan.side;
  if (back) {
    out.headingX = -out.headingX;
    out.headingZ = -out.headingZ;
  }
  out.riding = true;
  out.distance = d;
  return out;
}

/**
 * Blok jízdy, ve kterém je čas `t`: skutečné sekundy od začátku a délka bloku (s) – jízda ve
 * skutečném čase (`span`), nebo blok hodin dne (`blocks`); jinak null.
 */
export function rideBlockAt(plan: RidePlan, t: number): { elapsed: number; length: number } | null {
  if (plan.span) {
    const ms = t * 1000 + LIVESTOCK_EPOCH_MS;
    const [from0, to0] = plan.span;
    const length = to0 - from0;
    // opakovaná jízda – kolikátá v řadě (`period`)
    const n = plan.period ? Math.floor((ms - from0) / plan.period) : 0;
    const from = from0 + n * (plan.period ?? 0);
    if (ms < from || ms >= from + length) return null;
    if (plan.except && plan.except[0] < from + length && plan.except[1] > from) return null;
    return { elapsed: (ms - from) / 1000, length: length / 1000 };
  }
  if (!plan.blocks) return null;
  const hour = hourOfDay(plan.window, t);
  if (hour === null) return null;
  const hourS = hourSeconds(plan.window);
  for (const [from, to] of plan.blocks) {
    if (hour >= from && hour < to)
      return { elapsed: (hour - from) * hourS, length: (to - from) * hourS };
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
  const ms = t * 1000 + LIVESTOCK_EPOCH_MS;
  return plan.tied.some(([from, to]) => ms >= from && ms < to);
}

/** Je kůň v čase `t` mimo ohradu – jede, nebo stojí uvázaný (ohrada ho nekreslí)? */
export function isAway(plan: RidePlan, t: number): boolean {
  return isRiding(plan, t) || isTied(plan, t) || isLed(plan, t);
}

/** Jede jezdec v čase `t` (je v bloku jízdy, nebo bez rozvrhu s trasou)? */
export function isRiding(plan: RidePlan, t: number): boolean {
  return plan.route !== null && (plan.blocks || plan.span ? rideBlockAt(plan, t) !== null : true);
}

/** Obal míst, kam se kůň plánu dostane (trasa i kůl) – pro ořez. */
export function rideArea(plan: RidePlan): Area {
  const points: Point[] = [plan.hitch, ...(plan.route?.points ?? []), ...(plan.lead?.points ?? [])];
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
  const led = state.riding ? null : leadAt(plan, t);
  // z ohrady ke kůlu a zpět krokem (u kůlu stojí, kde jízda začne)
  if (led && plan.lead) return leadPose(plan.lead, led.d, led.back, out);
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
 * o výšku sedu; když kůň stojí u kůlu, jezdec stojí vedle něj (noc herního dne nic neschovává –
 * den rodiny jde ve skutečném čase, lord-day.ts).
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
      out.stage = 'ride';
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
    out.hidden = false;
    return out;
  };
}

/** Klíč plánů jízd – koně se přepočítají, jen když se změní. */
export function ridePlansKey(plans: readonly RidePlan[]): string {
  return plans
    .map(
      (p) =>
        `${p.riderId}:${p.horseId}:${p.route ? `${p.route.length.toFixed(1)}/${p.route.points.length}` : '-'}:${p.offset.toFixed(1)}:${p.hitch.x.toFixed(1)},${p.hitch.z.toFixed(1)}:${p.window?.startMs ?? ''}:${p.span?.join('-') ?? ''}:${p.period ?? ''}:${p.except?.join('-') ?? ''}:${p.blocks?.map((b) => b.join('-')).join(',') ?? ''}:${p.tied?.map((b) => b.join('-')).join(',') ?? ''}:${p.lead?.length.toFixed(1) ?? ''}`,
    )
    .join('|');
}
