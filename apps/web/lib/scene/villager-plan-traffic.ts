// Provoz na cestách: lidé pro vodu, dřevo a na pole (villagers.md – Provoz na cestách).
import { type Sex } from '@bohemia/game';
import type { LaborActivity, SceneLabor } from '../village-view';
import {
  FIELD_TRIPS_PER_MAN_DAY,
  streamPhase,
  trafficCounts,
  trafficHomes,
  waterTrips,
  woodTrips,
  type TrafficKind,
  type TrafficStream,
} from './road-traffic';
import { hash01 } from './smoke-schedule';
import { route, shuttle, walkSpeed, type Route, type VillagerClip } from './villager-motion';
import { MILIR_SHAPE_M } from './workshop-layout';
import type { ScenePerson } from '../person-view';
import { ADULTS, YOUNGSTERS } from './villager-roster';
import {
  FIGURE_SCALE,
  TRAFFIC_HOME_S,
  WOMEN,
  type Context,
  type House,
  type PlannedVillager,
  type Point,
  type Square,
} from './villager-plan-types';
import {
  fieldPath,
  nearestFree,
  nearestHouse,
  squareEdge,
  stringHash,
  towards,
  trafficDoor,
  trafficRouteOk,
  walkRoute,
} from './villager-plan-geometry';
import { adultHair, cast, figure, womenChance } from './villager-plan-cast';
import { fieldWork, workedSquares } from './villager-plan-fields';

/**
 * Pochůzka pro dřevo nejvýš tak daleko (m po pěšině) – dál chodí jen kousek od domu. Pro vodu se
 * chodí vždy, i daleko (paths.md – Pochůzky pro vodu; Martin, 19. 10. 2026).
 */
export const ERRAND_MAX_M: Record<'water' | 'wood', number> = { water: Infinity, wood: 220 };

/**
 * Trasa pro vodu nebo dřevo po pěšině domácnosti, nebo null – bez pěšin, pro dřevo moc daleko,
 * nebo cíl ve vodě. Konec pochůzky mimo rastr schůdné země (vzdálená voda) je suchý břeh ze sítě
 * pěšin – postava se zastaví na něm.
 */
export function errandPath(
  ctx: Context,
  home: House,
  door: Point,
  kind: 'water' | 'wood',
): Route | null {
  const paths = ctx.paths;
  if (!paths) return null;
  const end = paths.errand(home.id, kind);
  if (!end) return null;
  // pěšina končí u vody / pod stromy – postava se zastaví na nejbližším volném místě
  const goal = nearestFree(ctx, end.x, end.z, 4) ?? (kind === 'water' ? end : null);
  const along = paths.route(door, end, undefined, home.id);
  if (!goal || !along || along.points.length < 2) return null;
  const points = [...along.points.slice(0, -1), [goal.x, goal.z] as const];
  if (!trafficRouteOk(ctx, points, false)) return null;
  const path = route(points, along.pace);
  return path.length <= ERRAND_MAX_M[kind] ? path : null;
}

// --- provoz na cestách (villagers.md – Provoz na cestách) ------------------------------------

/**
 * Jak chodí lidé po cestě kterého druhu: podíl žen a dětí (pro vodu chodily hlavně ženy a děti),
 * co dělají na konci (nabírají vodu, sbírají dřevo, u pole chvíli postojí), s čím jdou zpět.
 */
export const TRAFFIC_LOOK: Record<
  TrafficKind,
  {
    women: number;
    children: number;
    outClip: VillagerClip;
    endClip: VillagerClip;
    endS: number;
    backClip: VillagerClip;
  }
> = {
  // s vahadlem a vědry tam i zpět, u vody chvíli stojí (nabírá)
  water: {
    women: 0.75,
    children: 0.3,
    outClip: 'carry-water',
    endClip: 'water-idle',
    endS: 5,
    backClip: 'carry-water',
  },
  wood: {
    women: 0.45,
    children: 0.2,
    outClip: 'walk',
    endClip: 'weed',
    endS: 6,
    backClip: 'carry-wood',
  },
  field: {
    women: 0.45,
    children: 0,
    outClip: 'walk',
    endClip: 'idle',
    endS: 2,
    backClip: 'walk',
  },
  // uhlíř ze zemnice k milíři a zpět (crafts.md – Milíř u skácených buků)
  kiln: {
    women: 0.35,
    children: 0,
    outClip: 'walk',
    endClip: 'idle',
    endS: 2,
    backClip: 'walk',
  },
};

/** Na pole a zpět chodí lidé od těchto prací (u nosičů úrody, kteří chodí tak jako tak, ne). */
export const FIELD_COMMUTE: ReadonlySet<LaborActivity> = new Set([
  'dig',
  'reclaim',
  'sow',
  'weed',
  'harvest',
  'mow',
  'found-field',
]);

/** Proud lidí po jedné trase (`TrafficStream`) s trasou a podílem žen. */
export interface TrafficRoute extends TrafficStream {
  key: string;
  route: Route;
  women: number;
  /** Domácnost (id obydlí), od jejíchž dveří lidé jdou. */
  home: number;
}

/**
 * Lidé na cestách (road-traffic.ts): pro vodu a k lesu po pěšině každé domácnosti, mezi domem
 * a polem od domů, ke kterým patří díly dnešní práce. Kolik jich na které trase je, určí cesty
 * za den a délka cesty (`trafficCounts`, nejvýš `max`); po trase jdou rozestoupení (fáze se
 * zlatým řezem), tam bez nákladu, zpět s vodou, dřevem nebo z pole, a doma na chvíli zmizí.
 */
export function trafficFigures(ctx: Context, labor: SceneLabor, max: number): PlannedVillager[] {
  const streams = trafficRoutes(ctx, labor);
  const counts = trafficCounts(streams, max);
  const out: PlannedVillager[] = [];
  streams.forEach((stream, s) => {
    const count = counts[s] ?? 0;
    const look = TRAFFIC_LOOK[stream.kind];
    const base = hash01(stringHash(stream.key), 1, 93);
    for (let k = 0; k < count; k++) {
      const key = `traffic:${stream.key}:${k}`;
      const child =
        labor.people.children > 0 &&
        hash01((ctx.seed * 31 + stringHash(key)) | 0, 9, 93) < look.children;
      const c = cast(
        ctx,
        key,
        { women: womenChance(stream.women, child ? ctx.sexes.girls : ctx.sexes.women), child },
        (sex) => trafficWalker(ctx, stream, child, sex),
      );
      if (!c) continue;
      const who = c.who;
      const pose = shuttle(stream.route, {
        outClip: look.outClip,
        outSpeed: walkSpeed(who.kind, look.outClip, who.scale),
        endClip: look.endClip,
        endS: look.endS,
        backClip: look.backClip,
        backSpeed: walkSpeed(who.kind, look.backClip, who.scale),
        restClip: 'idle',
        restS: TRAFFIC_HOME_S,
        restHidden: true,
        phase: streamPhase(k, base),
      });
      const hair = child ? 'natural' : adultHair(who, ctx.sexes.married);
      out.push(figure(c, pose, hair, { kind: 'traffic', traffic: stream.kind }));
    }
  });
  return out;
}

/**
 * Kdo jde po cestě (villagers.md – Výběr postavy): člověk z domácnosti, od jejíchž dveří proud
 * vychází – pro vodu a dřevo dospělí i výrostci (dítě, když ho los postavy chce, jinak dospělý),
 * na pole dospělí, k milíři uhlíř; z dílny, která dnes pracuje, na pole nikdo.
 */
export function trafficWalker(
  ctx: Context,
  stream: TrafficRoute,
  child: boolean,
  sex: Sex,
): ScenePerson | null {
  const roster = ctx.roster!;
  const homes = new Set([stream.home]);
  if (stream.kind === 'field' && roster.busy(stream.home)) return null;
  const adults = (): ScenePerson | null => roster.take({ ...ADULTS, homes, sex });
  if (stream.kind !== 'water' && stream.kind !== 'wood') return adults();
  const kids = (): ScenePerson | null => roster.take({ ...YOUNGSTERS, homes, sex });
  return child ? (kids() ?? adults()) : (adults() ?? kids());
}

/** Proudy lidí vsi: voda a dřevo po domácnostech, pole po prácích dne a domech. */
export function trafficRoutes(ctx: Context, labor: SceneLabor): TrafficRoute[] {
  const homes = ctx.homes.filter((h) => h.inhabited).sort((a, b) => a.id - b.id);
  const people = new Map(
    trafficHomes(
      labor,
      homes.map((h) => h.id),
    ).map((h) => [h.id, h]),
  );
  const out: TrafficRoute[] = [];
  const add = (
    kind: TrafficKind,
    key: string,
    trips: number,
    path: Route | null,
    women: number,
    home: number,
  ): void => {
    if (!path || trips <= 0 || path.length < 1) return;
    // táž práce na témže poli víckrát (ozim a jař) – jeden proud, cesty se sečtou
    const same = out.find((s) => s.key === key);
    if (same) same.trips += trips;
    else {
      const activeS = activeSeconds(path, kind);
      out.push({ kind, key, trips, route: path, activeS, women, home });
    }
  };
  for (const home of homes) {
    const household = people.get(home.id);
    if (!household) continue;
    const door = trafficDoor(ctx, home);
    if (!door) continue;
    for (const kind of ['water', 'wood'] as const) {
      const trips = kind === 'water' ? waterTrips(household) : woodTrips(labor.month);
      if (trips <= 0) continue;
      add(
        kind,
        `${kind}:${home.id}`,
        trips,
        errandPath(ctx, home, door, kind),
        TRAFFIC_LOOK[kind].women,
        home.id,
      );
    }
  }
  // uhlíř chodí ze zemnice k milíři (crafts.md – Milíř u skácených buků): cesta tam a zpět na
  // člověkoden práce u milíře – jen ke vzdálenému milíři
  labor.shares.forEach((share) => {
    const t = share.target;
    if (share.activity !== 'craft' || t.kind !== 'kiln' || t.from !== undefined) return;
    const home = homes.find((h) => h.id === t.id);
    if (!home || share.manDays <= 0) return;
    const door = trafficDoor(ctx, home);
    if (!door || Math.hypot(t.x - door.x, t.z - door.z) < KILN_COMMUTE_MIN_M) return;
    const edge = towards(t, door, MILIR_SHAPE_M.radius + 1);
    add(
      'kiln',
      `kiln:${t.id}:${t.kiln ?? ''}`,
      share.manDays * FIELD_TRIPS_PER_MAN_DAY,
      walkRoute(ctx, door, edge, home.id) ?? fieldPath(ctx, door, edge, home.id),
      TRAFFIC_LOOK.kiln.women,
      home.id,
    );
  });
  labor.shares.forEach((share) => {
    if (!FIELD_COMMUTE.has(share.activity) || share.target.kind !== 'field') return;
    if (share.manDays <= 0) return;
    const fieldId = share.target.id;
    const work = fieldWork(ctx, fieldId);
    if (!work) return;
    const squares = workedSquares(ctx, share, work);
    if (squares.length === 0) return;
    // díl patří k nejbližšímu domu (holdings.ts) – od každého domu ke svému prvnímu dílu fronty
    const groups = new Map<number, { home: House; square: Square; n: number }>();
    for (const view of squares) {
      const home = nearestHouse(homes, view.part);
      if (!home) continue;
      const group = groups.get(home.id);
      if (group) group.n++;
      else groups.set(home.id, { home, square: view.part, n: 1 });
    }
    for (const { home, square, n } of groups.values()) {
      const door = trafficDoor(ctx, home);
      if (!door) continue;
      const trips = (share.manDays * FIELD_TRIPS_PER_MAN_DAY * n) / squares.length;
      const edge = squareEdge(square, door);
      add(
        'field',
        `field:${share.activity}:${fieldId}:${home.id}`,
        trips,
        walkRoute(ctx, door, edge, home.id) ?? fieldPath(ctx, door, edge, home.id),
        WOMEN[share.activity],
        home.id,
      );
    }
  });
  return out;
}

/** Milíř blíž zemnici než tolik (m) – uhlíř k němu nechodí jako proud lidí. */
export const KILN_COMMUTE_MIN_M = 25;

/** Jak dlouho je člověk na cestě (s): tam, na konci, zpět – průměrná žena (FIGURE_SCALE). */
export function activeSeconds(path: Route, kind: TrafficKind): number {
  const look = TRAFFIC_LOOK[kind];
  const walk = path.walkLength ?? path.length;
  return (
    walk / walkSpeed('woman', look.outClip, FIGURE_SCALE) +
    look.endS +
    walk / walkSpeed('woman', look.backClip, FIGURE_SCALE)
  );
}
