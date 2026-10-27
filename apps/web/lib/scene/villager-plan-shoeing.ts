// Kování koní jako postava vsi (horses.md – Kování, Ve scéně; shoeing-plan.ts): vlastní kovář
// z domácnosti kovárny jde od dveří kovárny po pěšinách k brance ohrady koní, cizí kovář ze
// sousední vsi přichází ze směru souseda – po zemské stezce, jinak krajinou od kraje mapy – a touž
// cestou odchází. Koně stojí při kování uvázaní u kůlu vedle branky (plány koní `RidePlan.tied`).
import { AGE, penGateToward, penSquaresEntrance } from '@bohemia/game';
import type { SceneLabor, SceneShoeing } from '../village-view';
import { scenePenSquares } from '../village-view';
import type { DayWindow } from './caravan';
import { hourSeconds, type RidePlan } from './riders';
import {
  shodHorsePlans,
  shoeingSchedule,
  shoeingSpots,
  smithShoeingPose,
  type ShoeingGate,
  type ShoeingScene,
} from './shoeing-plan';
import { route, walkSpeed, type Route } from './villager-motion';
import { adultHair, cast, figure, STRANGER } from './villager-plan-cast';
import { trafficDoor, walkRoute } from './villager-plan-geometry';
import { ADULTS } from './villager-roster';
import type { Context, PlannedVillager, Point } from './villager-plan-types';

/** Klíč postavy kováře (vlastní / cizí) – stálý po celý den kování. */
export const SHOEING_KEY = { own: 'shoeing:own', foreign: 'shoeing:foreign' } as const;

/** Branka hotové ohrady koní `penId` (bez ní null). */
function horseGate(ctx: Context, penId: number): ShoeingGate | null {
  const pen = (ctx.village.pens ?? []).find((p) => p.id === penId && p.built);
  if (!pen) return null;
  const squares = scenePenSquares({
    ...pen,
    extraSquares: (pen.extraSquares ?? []).filter((q) => !q.pending),
  });
  const gate = penSquaresEntrance(squares, penGateToward(squares, ctx.village.dwellings));
  return { x: gate.x, z: gate.z, outX: gate.outX, outZ: gate.outZ };
}

/** Trasa z bodů (aspoň dva). */
function polyline(points: readonly Point[]): Route {
  return route(points.map((p) => [p.x, p.z] as const));
}

/** Cesta po pěšinách z `a` do `b`, jinak rovně. */
function walkWay(ctx: Context, a: Point, b: Point, homeId?: number): Route {
  return walkRoute(ctx, a, b, homeId) ?? polyline([a, b]);
}

/**
 * Cesta cizího kováře: zemská stezka (`trailId`) nebo čára krajinou (`line`) od kraje mapy –
 * konec bližší ohradě je u vsi – a od něj po pěšinách k místu kování. Bez cesty null.
 */
function foreignWay(ctx: Context, shoeing: SceneShoeing, goal: Point): Route | null {
  const trail = (ctx.village.trails ?? []).find((t) => t.id === shoeing.trailId)?.points;
  const base = trail ?? shoeing.line ?? [];
  if (base.length < 2) return null;
  const first = base[0]!;
  const last = base[base.length - 1]!;
  const firstNear =
    Math.hypot(first.x - goal.x, first.z - goal.z) < Math.hypot(last.x - goal.x, last.z - goal.z);
  // od kraje mapy ke vsi
  const inward = firstNear ? [...base].reverse() : [...base];
  const end = inward[inward.length - 1]!;
  const leg = walkWay(ctx, end, goal);
  const points: Point[] = [...inward, ...leg.points.slice(1).map(([x, z]) => ({ x, z }))];
  return polyline(points);
}

/**
 * Kovář dne a koně u kůlu (horses.md – Kování, Ve scéně): s kováním dne (`labor.shoeing`) a hotovou
 * ohradou koní postava kováře – vlastní je člověk z domácnosti kovárny (muž), cizí je cizí postava
 * (`STRANGER`). Bez kování, ohrady nebo cesty nic (podíl `horse-shoeing` pak stojí u plotu jako dřív).
 */
export function shoeingFigures(
  ctx: Context,
  labor: SceneLabor,
  window: DayWindow | null,
): { people: PlannedVillager[]; rides: RidePlan[] } {
  const none = { people: [], rides: [] };
  const shoeing = labor.shoeing;
  if (!shoeing || shoeing.horses.length === 0) return none;
  const gate = horseGate(ctx, shoeing.horses[0]!.pen);
  if (!gate) return none;
  const spots = shoeingSpots(gate);
  let way: Route | null;
  let forge: number | null = null;
  if (shoeing.own) {
    const smiths = ctx.homes
      .filter((h) => ctx.village.dwellings.some((d) => d.id === h.id && d.craft === 'smith'))
      .sort((a, b) => a.id - b.id);
    const home = smiths[0];
    const door = home ? trafficDoor(ctx, home) : null;
    if (!home || !door) return none;
    forge = home.id;
    way = walkWay(ctx, door, spots.smith, home.id);
  } else {
    way = foreignWay(ctx, shoeing, spots.smith);
  }
  if (!way || way.length <= 0) return none;
  const key = shoeing.own ? SHOEING_KEY.own : SHOEING_KEY.foreign;
  const c = cast(
    ctx,
    key,
    { women: 0, child: false },
    forge !== null
      ? () =>
          ctx.roster!.take({ ...ADULTS, homes: new Set([forge]), onlySex: 'male' }) ??
          ctx.roster!.take({
            from: AGE.olderChild,
            to: Infinity,
            homes: new Set([forge]),
            onlySex: 'male',
          })
      : STRANGER,
  );
  if (!c) return none;
  const plan: ShoeingScene = {
    own: shoeing.own,
    way,
    hitch: spots.hitch,
    smith: spots.smith,
    horses: shoeing.horses.map((h) => h.id),
    schedule: shoeingSchedule(
      way.length,
      shoeing.horses.length,
      shoeing.own,
      hourSeconds(window),
      walkSpeed(c.who.kind, 'walk', c.who.scale),
    ),
    window,
  };
  const target = { kind: 'pen', id: shoeing.horses[0]!.pen } as const;
  const smith = figure(c, smithShoeingPose(plan), adultHair(c.who, ctx.sexes.married), {
    kind: 'share',
    activity: 'horse-shoeing',
    target,
  });
  return { people: [smith], rides: shodHorsePlans(plan) };
}
