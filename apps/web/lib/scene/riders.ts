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
import { drillSeconds, LORD_CYCLE, LORD_CYCLE_S, HUNT_BRIDGE_S, rideSlot } from './lord-day';
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
   * Jízda ve skutečném čase (ms od–do) místo bloků dne – lov (`huntPlans`) jde přes víc herních
   * dní, výcviková jízda (`ridePlans`) se opakuje v každém cyklu dne rodiny (`period`). S ním se
   * `blocks` nečtou.
   */
  span?: readonly [number, number];
  /** Jízda `span` se opakuje po tolika ms (lord-day.ts – cyklus dne rodiny). */
  period?: number;
  /** Opakovaná jízda, která zasáhne do tohoto času (ms od–do – lov jezdce), se nejede. */
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
   * každou jízdou (`span`) ji kůň dojde a u kůlu chvíli stojí, po jízdě se po ní vrátí do ohrady –
   * z ohrady vyjde a do ní vejde u branky. Bez údaje se kůň objeví u kůlu.
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

/** Kůň bez jezdce jde z ohrady ke kůlu a zpět krokem (m/s, návrh Clauda). */
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
  const end = { x: start.x, z: start.z };
  const found = leg(gate, end);
  const points = found && found.length >= 2 ? [gate, ...found.slice(1, -1), end] : [gate, end];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  }
  if (length <= 0.5) return plan;
  return {
    ...plan,
    lead: { points, length, heading: { x: start.headingX, z: start.headingZ } },
  };
}

/**
 * Kde je kůň na cestě z ohrady ke kůlu v čase `t`: vzdálenost od branky (m; u kůlu `length`) a zda
 * jde zpět do ohrady – před jízdou dojde a `LEAD_WAIT_S` stojí u kůlu, po jízdě se vrátí. Mimo null.
 */
function leadAt(plan: RidePlan, t: number): { d: number; back: boolean } | null {
  const lead = plan.lead;
  if (!lead || !plan.span) return null;
  const walkMs = (lead.length / LEAD_M_S) * 1000;
  const preMs = walkMs + LEAD_WAIT_S * 1000;
  const ms = t * 1000 + LIVESTOCK_EPOCH_MS;
  const [from0, to0] = plan.span;
  const period = plan.period ?? 0;
  const base = period ? Math.floor((ms - from0) / period) : 0;
  for (const n of period ? [base, base + 1] : [0]) {
    const from = from0 + n * period;
    const to = from + (to0 - from0);
    if (plan.except && plan.except[0] < to && plan.except[1] > from) continue;
    if (ms >= from - preMs && ms < from) {
      return { d: Math.min(lead.length, ((ms - from + preMs) / 1000) * LEAD_M_S), back: false };
    }
    if (ms >= to && ms < to + walkMs) {
      return { d: Math.max(0, lead.length - ((ms - to) / 1000) * LEAD_M_S), back: true };
    }
  }
  return null;
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
 * Lov ve skutečném čase (wildlife.md – Ve scéně, návrh Clauda; villagers.md – Činnosti od začátku
 * do konce): lovci vyrazí za šera dne lovu (`HUNT_START_H`) a lov trvá `HUNT_REAL_S` – půlku tam
 * k lesu a v lese, půlku zpět – přirozenou chůzí a krokem až klusem. Deset minut je ≈ 7 herních
 * dní, tedy jako kalendář lovu (každých 7 dní); jádro lov dál počítá za jeden den.
 */
export const HUNT_REAL_S = 600;
/** Hodina dne lovu, kdy lovci vyrazí. */
export const HUNT_START_H = 3;
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
 * Cesta lovců (wildlife.md – Ve scéně): k lesu u zvěře, když ho stihnou (pěší svižnou chůzí
 * `HUNT_PACE.foot.max`, jezdci klusem za `HUNT_WAY_SHARE` půlky lovu); jinak k bližšímu z obou
 * okrajů lesa a nejdál, kam dojdou – v půlce lovu se nikdy neotáčejí v poli.
 */
export function huntWay(
  way: readonly Point[],
  near: readonly Point[] | null,
  halfS: number,
  foot: boolean,
): Point[] {
  const wayS = HUNT_WAY_SHARE * halfS;
  const fastest = foot ? HUNT_PACE.foot.max : HUNT_PACE.ride.max;
  let best = way;
  if (near && wayLength(way) > fastest * wayS && wayLength(near) < wayLength(way)) best = near;
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
 * Začátek a konec lovu ve skutečném čase (ms): od šera dne lovu (`window` – okno dne lovu,
 * `HUNT_START_H`) v nejbližší chvíli, kdy jezdci dne rodiny vyjíždějí (lord-day.ts – `rideSlot`;
 * návrh Clauda: lovci jsou pak u koní a lov nahradí výcvikovou jízdu cyklu), a aspoň
 * `HUNT_BRIDGE_S` po začátku dne lovu (lovci k té chvíli dojdou ke kůlu), `HUNT_REAL_S` dlouho.
 * Bez okna null.
 */
export function huntSpan(window: DayWindow | null): readonly [number, number] | null {
  if (!window || window.endMs <= window.startMs) return null;
  const earliest = Math.max(
    window.startMs + HUNT_START_H * hourSeconds(window) * 1000,
    window.startMs + HUNT_BRIDGE_S * 1000,
  );
  const t = (earliest - LIVESTOCK_EPOCH_MS) / 1000;
  const k = Math.ceil((t - LORD_CYCLE.ride) / LORD_CYCLE_S);
  const startMs = LIVESTOCK_EPOCH_MS + (k * LORD_CYCLE_S + LORD_CYCLE.ride) * 1000;
  return [startMs, startMs + HUNT_REAL_S * 1000];
}

/**
 * Plány lovu (wildlife.md – Ve scéně; jádro `hunt.today`): jezdci jako blok jízdy (`rideState` –
 * půlku lovu tam, pak po téže trase zpět), ale ve skutečném čase (`huntSpan` – `span` plánu, přes
 * víc herních dní) a po trase k okraji lesa u zvěře (`huntRoute`) – vojvoda vede, po dvou; pěší
 * s oštěpy za nimi vlastním tempem v řadě (`foot` – plán bez koně, `horseId` −1). `window` je okno
 * dne lovu. Bez hodin světa se neloví.
 */
export function huntPlans(input: HuntPlanInput): { rides: RidePlan[]; foot: RidePlan[] } {
  const { hunt, hitch, edge, leg, walkable, window } = input;
  const span = huntSpan(window);
  if (!span) return { rides: [], foot: [] };
  const halfS = HUNT_REAL_S / 2;
  const wayTo = (to: Point): Point[] => {
    const found = leg(hitch, to);
    return found && found.length >= 2 ? [hitch, ...found.slice(1, -1), to] : [hitch, to];
  };
  const way = wayTo(edge);
  const near = input.nearEdge ? wayTo(input.nearEdge) : null;
  const sweep = huntSweep(hitch, edge, walkable);
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
    blocks: null,
    span,
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
    blocks: null,
    span,
    hitch: { ...hitch },
    window,
  }));
  return { rides, foot };
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
  if (led && plan.lead) {
    // z ohrady ke kůlu a zpět krokem (u kůlu stojí, kde jízda začne)
    const pts = plan.lead.points;
    let rest = led.d;
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
    const walking = led.d > 0 && led.d < plan.lead.length;
    out.x = a.x + (b.x - a.x) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.forwardX = walking ? ((b.x - a.x) / len) * (led.back ? -1 : 1) : plan.lead.heading.x;
    out.forwardZ = walking ? ((b.z - a.z) / len) * (led.back ? -1 : 1) : plan.lead.heading.z;
    out.head = 0;
    out.stride = walking ? Math.sin((2 * Math.PI * led.d) / (STRIDE_M.walk * RIDE_HORSE_SCALE)) : 0;
    return out;
  }
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
