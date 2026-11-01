// Provoz na cestách: lidé pro vodu, dřevo a uhlíř k milíři (villagers.md – Provoz na cestách).
// Na pole se proudem nechodí – cesta ode dveří je součást práce na poli (rozvrh člověka,
// villager-schedule.ts; Martin 31. 10. 2026: „Ano“).
import { type Sex } from '@bohemia/game';
import type { SceneLabor } from '../village-view';
import {
  KILN_TRIPS_PER_MAN_DAY,
  streamPhase,
  trafficCounts,
  trafficHomes,
  waterTrips,
  woodTrips,
  type TrafficKind,
  type TrafficStream,
} from './road-traffic';
import { hash01 } from './smoke-schedule';
import { shuttleErrand } from './villager-errands';
import {
  route,
  shuttle,
  walkSpeed,
  type Route,
  type ShuttleOptions,
  type VillagerClip,
} from './villager-motion';
import { MILIR_SHAPE_M } from './workshop-layout';
import type { ScenePerson } from '../person-view';
import { ADULTS, YOUNGSTERS } from './villager-roster';
import {
  FIGURE_SCALE,
  TRAFFIC_HOME_S,
  type Context,
  type House,
  type PlannedVillager,
  type Point,
  type VillagerGround,
} from './villager-plan-types';
import {
  nearestFree,
  stringHash,
  towards,
  trafficDoor,
  trafficRouteOk,
  walkRoute,
} from './villager-plan-geometry';
import { adultHair, cast, figure, womenChance } from './villager-plan-cast';

/**
 * Pochůzka nejvýš tak daleko (m po pěšině). Pro vodu se chodí vždy, i daleko (paths.md – Pochůzky
 * pro vodu; Martin, 19. 10. 2026); pro dřevo do 400 m (villagers.md – K lesu pro dřevo) – jádro
 * chodí pro dřevo nejvýš za cenu `ERRAND_MAX_COST` 450 (cena ≥ délka, do kopce a lesem víc),
 * dál méně často a proud se nekreslí.
 */
export const ERRAND_MAX_M: Record<'water' | 'wood', number> = { water: Infinity, wood: 400 };

/**
 * Větší skupinka stromů, ke které se chodí pro dřevo (villagers.md – K lesu pro dřevo; Martin
 * 24. 10. 2026): aspoň `trees` stojících dospělých stromů do `radiusM` od jednoho z nich (i on
 * sám) – osamělý strom ani dvojice u cesty ne, okraj lesa vždy.
 */
export const WOOD_GROVE = { trees: 6, radiusM: 15 } as const;

/** Jak daleko od vchodu (m vzdušnou čarou) se skupinka stromů hledá. */
export const WOOD_SEARCH_M = 250;

/** Kolik nejbližších skupinek se zkusí projít po pěšinách – vyhraje nejkratší chůze. */
export const WOOD_CANDIDATES = 3;

/** Hledání skupinek po čtvercích (m, dvojnásobek poloměru skupinky) – stromy se načtou líně. */
const GROVE_TILE_M = 2 * WOOD_GROVE.radiusM;

/** Nejvýš tolik stromů ve čtverci hledání (hustý les). */
const GROVE_TILE_TREES = 400;

/** Postupné poloměry hledání (m) – v lese u vsi stačí první, dál se hledá jen v řídké krajině. */
const GROVE_RADII_M = [30, 60, 120, 250] as const;

/** Postava sbírá dřevo kousek před krajním stromem skupinky (m) – ne v koruně. */
const WOOD_GATHER_M = 2.5;

/**
 * Větší skupinky stromů kolem vsi (villagers.md – K lesu pro dřevo): stromy se z vrstvy překážek
 * načítají líně po čtvercích `GROVE_TILE_M` a hustota se počítá jen u stromů, které hledání
 * projde – práce úměrná ploše kolem vchodů, ne celému lesu. Jeden index na plán.
 */
export class GroveIndex {
  private readonly tiles = new Map<number, readonly Point[]>();
  private readonly dense = new Map<Point, boolean>();

  constructor(
    private readonly ground: Pick<VillagerGround, 'treesIn'>,
    private readonly grove: { trees: number; radiusM: number } = WOOD_GROVE,
  ) {}

  private tile(i: number, j: number): readonly Point[] {
    const key = (i + 32768) * 65536 + (j + 32768);
    let trees = this.tiles.get(key);
    if (!trees) {
      const half = GROVE_TILE_M / 2;
      trees = this.ground.treesIn(
        (i + 0.5) * GROVE_TILE_M,
        (j + 0.5) * GROVE_TILE_M,
        half,
        GROVE_TILE_TREES,
      );
      this.tiles.set(key, trees);
    }
    return trees;
  }

  /** Stromy ve čtvercích, které zasahují do čtverce kolem (x, z) o polovině `half`. */
  private around(x: number, z: number, half: number, visit: (t: Point) => boolean | void): void {
    const i0 = Math.floor((x - half) / GROVE_TILE_M);
    const i1 = Math.floor((x + half) / GROVE_TILE_M);
    const j0 = Math.floor((z - half) / GROVE_TILE_M);
    const j1 = Math.floor((z + half) / GROVE_TILE_M);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const t of this.tile(i, j)) if (visit(t) === true) return;
      }
    }
  }

  /** Patří strom do větší skupinky (aspoň `trees` stromů do `radiusM`, i on sám)? */
  isDense(t: Point): boolean {
    const known = this.dense.get(t);
    if (known !== undefined) return known;
    const r2 = this.grove.radiusM * this.grove.radiusM;
    let n = 0;
    this.around(t.x, t.z, this.grove.radiusM, (o) => {
      const dx = o.x - t.x;
      const dz = o.z - t.z;
      return dx * dx + dz * dz <= r2 && ++n >= this.grove.trees;
    });
    const dense = n >= this.grove.trees;
    this.dense.set(t, dense);
    return dense;
  }

  /**
   * Nejbližší skupinky od vchodu `door` (nejvýš `count`, do `searchM` vzdušnou čarou) – z každé
   * strom nejblíž vchodu; další strom blíž než dva poloměry k vybranému je táž skupinka. Hledá se
   * v rostoucích poloměrech – co je uvnitř menšího, je blíž než cokoli venku, pořadí je přesné.
   */
  nearest(door: Point, count: number, searchM = WOOD_SEARCH_M): Point[] {
    const radii = [...GROVE_RADII_M.filter((r) => r < searchM), searchM];
    let spots: Point[] = [];
    for (const radius of radii) {
      const near: { t: Point; d: number }[] = [];
      this.around(door.x, door.z, radius, (t) => {
        const d = Math.hypot(t.x - door.x, t.z - door.z);
        if (d <= radius && this.isDense(t)) near.push({ t, d });
      });
      near.sort((a, b) => a.d - b.d);
      spots = [];
      for (const { t } of near) {
        if (spots.length >= count) break;
        if (spots.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < 2 * this.grove.radiusM)) continue;
        spots.push(t);
      }
      if (spots.length >= count) break;
    }
    return spots;
  }
}

/** Stromy větších skupinek ze seznamu stromů seřazené od vchodu (do `searchM`). */
export function groveSpots(trees: readonly Point[], door: Point, searchM = 400): Point[] {
  const ground = {
    treesIn: (x: number, z: number, half: number): Point[] =>
      trees.filter((t) => Math.abs(t.x - x) <= half && Math.abs(t.z - z) <= half),
  };
  return new GroveIndex(ground).nearest(door, Infinity, searchM);
}

/**
 * Index skupinek stromů – jeden na stav stromů (`treesToken`; bez značky na plán), všechny
 * domácnosti i další přeplánování sdílejí načtené čtverce. WeakMap: se značkou zaniká index.
 */
const grovesOfPlan = new WeakMap<object, GroveIndex>();

/**
 * Trasy pro dřevo k nejbližším větším skupinkám stromů (vrstva překážek se stavem vsi – pokácené
 * stromy se nepočítají): `walkRoute` – kratší z rovně a po síti pěšin a pevných cest (týž model
 * jako odhad simulace), kolem domů po suchu; postava se zastaví na volném místě na kraji skupinky.
 */
function groveRoutes(ctx: Context, home: House, door: Point): Route[] {
  const out: Route[] = [];
  const owner = ctx.ground.treesToken ?? ctx;
  let groves = grovesOfPlan.get(owner);
  if (!groves) grovesOfPlan.set(owner, (groves = new GroveIndex(ctx.ground)));
  for (const tree of groves.nearest(door, WOOD_CANDIDATES)) {
    if (Math.hypot(tree.x - door.x, tree.z - door.z) <= WOOD_GATHER_M) continue;
    const edge = towards(tree, door, WOOD_GATHER_M);
    const goal = nearestFree(ctx, edge.x, edge.z, 4);
    if (!goal) continue;
    const path = walkRoute(ctx, door, goal, home.id);
    if (path && path.length >= 1) out.push(path);
  }
  return out;
}

/**
 * Trasa pro vodu nebo dřevo po pěšině domácnosti, nebo null – bez pěšin, pro dřevo moc daleko,
 * nebo cíl ve vodě. Konec pochůzky mimo rastr schůdné země (vzdálená voda) je suchý břeh ze sítě
 * pěšin – postava se zastaví na něm. Pro dřevo vyhraje nejkratší chůze ke konci pěšiny pro dřevo
 * (okraj lesa ze sítě pěšin) nebo k nejbližší větší skupince stromů (villagers.md – K lesu pro
 * dřevo). Když pěšina domácnosti neprojde (dům, voda na odbočce), jde se ke konci pěšiny jako
 * kamkoli jinam (`walkRoute` – po síti pěšin a pevných cest, nebo rovně).
 */
export function errandPath(
  ctx: Context,
  home: House,
  door: Point,
  kind: 'water' | 'wood',
): Route | null {
  const paths = ctx.paths;
  if (!paths) return null;
  const options: Route[] = kind === 'wood' ? groveRoutes(ctx, home, door) : [];
  const end = paths.errand(home.id, kind);
  // pěšina končí u vody / pod stromy – postava se zastaví na nejbližším volném místě
  const goal = end && (nearestFree(ctx, end.x, end.z, 4) ?? (kind === 'water' ? end : null));
  const along = end && goal ? paths.route(door, end, undefined, home.id) : null;
  if (goal && along && along.points.length >= 2) {
    const points = [...along.points.slice(0, -1), [goal.x, goal.z] as const];
    if (trafficRouteOk(ctx, points, false)) options.push(route(points, along.pace));
    else {
      const walked = walkRoute(ctx, door, goal, home.id);
      if (walked) options.push(walked);
    }
  }
  let best: Route | null = null;
  for (const path of options) {
    if (path.length > ERRAND_MAX_M[kind]) continue;
    if (!best || (path.walkLength ?? path.length) < (best.walkLength ?? best.length)) best = path;
  }
  return best;
}

// --- provoz na cestách (villagers.md – Provoz na cestách) ------------------------------------

/**
 * Jak chodí lidé po cestě kterého druhu: podíl žen a dětí (pro vodu chodily hlavně ženy a děti),
 * co dělají na konci (nabírají vodu, sbírají dřevo, u milíře chvíli postojí), s čím jdou zpět.
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
    // u skupinky stromů chvíli sbírá (shýbá se – villagers.md, K lesu pro dřevo)
    endClip: 'weed',
    endS: 12,
    backClip: 'carry-wood',
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

/** Proud lidí po jedné trase (`TrafficStream`) s trasou a podílem žen. */
export interface TrafficRoute extends TrafficStream {
  key: string;
  route: Route;
  women: number;
  /** Domácnost (id obydlí), od jejíchž dveří lidé jdou. */
  home: number;
}

/**
 * Lidé na cestách (road-traffic.ts): pro vodu a k lesu po pěšině každé domácnosti, uhlíř ze
 * zemnice k milíři. Kolik jich na které trase je, určí cesty za den a délka cesty
 * (`trafficCounts`, nejvýš `max`); po trase jdou rozestoupení (fáze se zlatým řezem), tam bez
 * nákladu, zpět s vodou nebo dřevem, a doma na chvíli zmizí.
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
      const options: ShuttleOptions = {
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
      };
      const pose = shuttle(stream.route, options);
      const hair = child ? 'natural' : adultHair(who, ctx.sexes.married);
      // pochůzka je celý cyklus – při změně plánu ji postava dojde (villager-errands.ts)
      out.push({
        ...figure(c, pose, hair, { kind: 'traffic', traffic: stream.kind }),
        errand: shuttleErrand(stream.route, options),
      });
    }
  });
  return out;
}

/**
 * Kdo jde po cestě (villagers.md – Výběr postavy): člověk z domácnosti, od jejíchž dveří proud
 * vychází – pro vodu a dřevo dospělí i výrostci (dítě, když ho los postavy chce, jinak dospělý),
 * k milíři uhlíř.
 */
export function trafficWalker(
  ctx: Context,
  stream: TrafficRoute,
  child: boolean,
  sex: Sex,
): ScenePerson | null {
  const roster = ctx.roster!;
  const homes = new Set([stream.home]);
  const adults = (): ScenePerson | null => roster.take({ ...ADULTS, homes, sex });
  if (stream.kind !== 'water' && stream.kind !== 'wood') return adults();
  const kids = (): ScenePerson | null => roster.take({ ...YOUNGSTERS, homes, sex });
  return child ? (kids() ?? adults()) : (adults() ?? kids());
}

/** Proudy lidí vsi: voda a dřevo po domácnostech, uhlíř k milíři. */
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
      share.manDays * KILN_TRIPS_PER_MAN_DAY,
      walkRoute(ctx, door, edge, home.id),
      TRAFFIC_LOOK.kiln.women,
      home.id,
    );
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
