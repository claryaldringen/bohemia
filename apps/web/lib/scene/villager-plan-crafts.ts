// Postavy řemeslníků: milíř, kopáči rudy a hlíny, nosiči kováře, dílny.
import { AGE } from '@bohemia/game';
import type { SceneLabor } from '../village-view';
import { fetchCarriers, streamPhase } from './road-traffic';
import { hash01 } from './smoke-schedule';
import {
  shuttle,
  stand,
  walkSpeed,
  type PoseFn,
  type Route,
  type ShuttleOptions,
} from './villager-motion';
import { shuttleErrand } from './villager-errands';
import { craftSpots, forestKilnAnchor } from './workshop-layout';
import { orePitRadius } from './ore-site-layout';
import { GRAIN_PIT_RADIUS_M } from './grain-pit-layout';
import { FLOOR_ENTRANCE, floorPoint } from './threshing-floor-layout';
import {
  CHILD_UNDER,
  MILIR_ID_OFFSET,
  TRAFFIC_HOME_S,
  gap,
  none,
  type Context,
  type Placer,
  type PlannedVillager,
  type Point,
} from './villager-plan-types';
import {
  free,
  inBox,
  nearestFree,
  stringHash,
  targetKey,
  trafficDoor,
  unit,
  walkRoute,
} from './villager-plan-geometry';
import { adultHair, cast, figure } from './villager-plan-cast';

/**
 * Uhlíř u milíře v lese (crafts.md – Uhlíř): staví, hlídá a vytahuje uhlí – místa kolem kupy
 * jako u milíře u dílny (`craftSpots` s `forestKilnAnchor`).
 */
export function kilnWorkers(ctx: Context, kiln: { x: number; z: number }): Placer {
  const spots = craftSpots('burner', forestKilnAnchor(kiln));
  return (i) => {
    const spot = spots[i % spots.length]!;
    if (free(ctx, spot.x, spot.z)) return stand(spot.x, spot.z, spot.hx, spot.hz, spot.clip);
    const near = nearestFree(ctx, spot.x, spot.z, 4);
    return near ? stand(near.x, near.z, spot.hx, spot.hz, spot.clip) : null;
  };
}

/**
 * Kopáči rudy (crafts.md – Uhlí a ruda kováře): na valu nejčerstvější jámy u rudiště (do
 * ORE_PIT_REACH_M od místa) kolem dokola, čelem do jámy, s motykou; bez jámy kolem místa.
 */
export function oreDiggers(ctx: Context, site: { x: number; z: number }): Placer {
  const near = (ctx.village.orePits ?? [])
    .filter((p) => Math.hypot(p.x - site.x, p.z - site.z) <= ORE_PIT_REACH_M)
    .sort((a, b) => a.overgrowth - b.overgrowth || b.kg - a.kg);
  const pit = near[0] ?? { x: site.x, z: site.z, kg: 0 };
  const radius = orePitRadius(pit.kg) + gap(0.2);
  return (i) => {
    const a = 0.7 + i * 2.1;
    const x = pit.x + Math.cos(a) * radius;
    const z = pit.z + Math.sin(a) * radius;
    const spot = nearestFree(ctx, x, z, 3);
    if (!spot) return null;
    const h = unit(pit.x - spot.x, pit.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, 'hoe');
  };
}

/**
 * Lidé u obilné jámy (production-chains.md – Obilné jámy): první dva stojí kolem hrdla čelem
 * k němu a pracují motykou (kopání, pečetění hlínou), další nosí v koších zrno z hromádky na humně
 * (vstup před předkem mlatu nejbližšího humna, kde zrno čeká) k jámě po pěšinách. Bez zrna na
 * humnu (nebo bez cesty) stojí u jámy všichni.
 */
export function grainPitWorkers(ctx: Context, pit: { x: number; z: number }): Placer {
  const radius = GRAIN_PIT_RADIUS_M + gap(0.35);
  const atPit = (i: number): PoseFn | null => {
    const a = 0.4 + i * 2.1;
    const spot = nearestFree(ctx, pit.x + Math.cos(a) * radius, pit.z + Math.sin(a) * radius, 3);
    if (!spot) return null;
    const h = unit(pit.x - spot.x, pit.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, 'hoe');
  };
  const path = grainRoute(ctx, pit);
  return (i, who) => {
    if (i < 2 || !path) return atPit(i);
    return shuttle(path, {
      outClip: 'walk',
      outSpeed: walkSpeed(who.kind, 'walk', who.scale),
      endClip: 'weed',
      endS: FETCH_LOAD_S,
      backClip: 'carry',
      backSpeed: walkSpeed(who.kind, 'carry', who.scale),
      restClip: 'weed',
      restS: 3,
      phase: who.phase,
    });
  };
}

/** Cesta od jámy k hromádce zrna na nejbližším humně (vstup před mlatem); bez zrna null. */
function grainRoute(ctx: Context, pit: { x: number; z: number }): Route | null {
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const f of ctx.village.threshingFloors ?? []) {
    if (!f.built || !f.grainKg) continue;
    const e = floorPoint(f.position, FLOOR_ENTRANCE.lx, FLOOR_ENTRANCE.lz);
    const d = Math.hypot(e.x - pit.x, e.z - pit.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return null;
  const from = nearestFree(ctx, pit.x + radiusOut(pit, best).x, pit.z + radiusOut(pit, best).z, 3);
  const to = nearestFree(ctx, best.x, best.z, 4);
  if (!from || !to) return null;
  return walkRoute(ctx, from, to);
}

/** Krok od středu jámy k humnu – nosič stojí za valem (m). */
function radiusOut(pit: { x: number; z: number }, toward: { x: number; z: number }): Point {
  const h = unit(toward.x - pit.x, toward.z - pit.z);
  const r = GRAIN_PIT_RADIUS_M + 0.9;
  return { x: h.x * r, z: h.z * r };
}

/** Jámy rudiště leží kolem místa nejvýš tak daleko (m – SMITH_SUPPLY.pitSpreadM a rezerva). */
export const ORE_PIT_REACH_M = 8;

/**
 * Nosiči kováře (crafts.md – Uhlí a ruda kováře; villagers.md – Provoz na cestách): kdo dnes nese
 * uhlí od milíře nebo rudu z rudiště (synové – menší postavy, nebo kovář), jde z kovárny po
 * pěšinách k milíři či jámě tam bez nákladu a zpět s košem, doma na chvíli zmizí. Každý nosič je
 * jedna postava (`fetchCarriers`) – syn chodí sám celý den tam a zpět, ne proud lidí. S vozem
 * jede kovář vozem.
 */
export function smithFetchFigures(ctx: Context, labor: SceneLabor): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (const share of labor.shares) {
    if (share.activity !== 'fetch' || share.carts) continue;
    const t = share.target;
    if (t.kind !== 'ore' && t.kind !== 'clay' && t.kind !== 'kiln') continue;
    const from = t.kind === 'kiln' ? t.from : t.id;
    if (from === undefined) continue;
    const home = ctx.houses.find((h) => h.id === from && h.built);
    if (!home) continue;
    const door = trafficDoor(ctx, home);
    const goal = nearestFree(ctx, t.x, t.z, 8);
    if (!door || !goal) continue;
    const path = walkRoute(ctx, door, goal);
    if (!path) continue;
    const key = `fetch:${targetKey(t)}:${(share.ages ?? []).join('.')}`;
    const base = hash01(stringHash(key), 1, 93);
    const goods = t.kind === 'kiln' ? 'charcoal' : t.kind;
    fetchCarriers(share.ages).forEach((age, k) => {
      const child = age < CHILD_UNDER;
      // syn kováře podle věku z jádra (uhlí od 10 let, ruda od 14), nebo kovář sám
      const c = cast(ctx, `${key}:${k}`, { women: 0, child }, () =>
        ctx.roster!.take({
          from: AGE.olderChild,
          to: Infinity,
          homes: new Set([from]),
          sex: 'male',
          age,
        }),
      );
      if (!c) return;
      const who = c.who;
      const options: ShuttleOptions = {
        outClip: 'walk',
        outSpeed: walkSpeed(who.kind, 'walk', who.scale),
        endClip: 'idle',
        endS: FETCH_LOAD_S,
        backClip: 'carry',
        backSpeed: walkSpeed(who.kind, 'carry', who.scale),
        restClip: 'idle',
        restS: TRAFFIC_HOME_S,
        restHidden: true,
        phase: streamPhase(k, base),
      };
      const hair = child ? 'natural' : adultHair(who, ctx.sexes.married);
      // pochůzka je celý cyklus – při změně plánu ji nosič dojde (villager-errands.ts)
      out.push({
        ...figure(c, shuttle(path, options), hair, { kind: 'fetch', goods }),
        errand: shuttleErrand(path, options),
      });
    });
  }
  return out;
}

/** Nosič kováře u milíře nebo jámy nakládá koš (s). */
export const FETCH_LOAD_S = 5;

/**
 * Řemeslníci v dílně (crafts.md): hrnčíř u kruhu a pece, kovář u kovadliny a měchů, uhlíř kolem
 * milíře s hrabicí – místa z workshop-layout.ts, postavy se po nich střídají; místo, kde
 * nejde stát (voda, jiný dům), nahradí nejbližší volné.
 */
export function craftsmen(ctx: Context, dwellingId: number): Placer {
  const house = ctx.houses.find((h) => h.id === dwellingId && h.built && h.craft);
  if (!house?.craft) return none;
  const spots = craftSpots(house.craft, house.position, house.frame);
  // pod přístřeškem dílny smí stát její řemeslníci (dům bez přístřešku je v `box`)
  const ok = (x: number, z: number): boolean =>
    ctx.ground.walkable(x, z) &&
    !ctx.houses.some(
      (h) => h !== house && h.id !== MILIR_ID_OFFSET - house.id && inBox(h, x, z, 0),
    );
  return (i) => {
    const spot = spots[i % spots.length]!;
    const ring = Math.floor(i / spots.length);
    const x = spot.x - spot.hx * ring * gap(0.8);
    const z = spot.z - spot.hz * ring * gap(0.8);
    if (ok(x, z)) return stand(x, z, spot.hx, spot.hz, spot.clip);
    const near = nearestFree(ctx, x, z, 4);
    return near ? stand(near.x, near.z, spot.hx, spot.hz, spot.clip) : null;
  };
}
