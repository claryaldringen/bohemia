// Postavy řemeslníků: milíř, kopáči rudy a hlíny, nosiči kováře, dílny.
import { AGE } from '@bohemia/game';
import type { SceneLabor } from '../village-view';
import { fetchCarriers, streamPhase } from './road-traffic';
import { hash01 } from './smoke-schedule';
import {
  alongRouteWalk,
  route,
  shuttle,
  shuttleCycle,
  stand,
  walkLengthOf,
  walkSpeed,
  type PoseFn,
  type Route,
  type ShuttleOptions,
} from './villager-motion';
import { POLE_SPACING_M, campEntrance } from './burner-camp-layout';
import { shuttleErrand } from './villager-errands';
import { craftSpots, forestKilnAnchor, type CraftSpot } from './workshop-layout';
import { carpenterCartSpots, smeltSpots, treadingLine } from './craft-yard-layout';
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
  type House,
  type Identity,
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
import { ADULTS } from './villager-roster';

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
 * Muž z domácnosti uhlíře, který u milíře nehlídá, sedí u vchodu zemnice čelem k milíři
 * (workshops.md – Uhlíř, zemnice; jen když zemnice stojí a milíř pálí – `SceneBurnerCamp.occupied`).
 * Bere se z těch, kdo zbyli po práci dne; bez volného muže nikdo.
 */
export function campSitters(ctx: Context): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (const camp of ctx.village.burnerCamps ?? []) {
    if (!camp.occupied || camp.built < 1) continue;
    const key = `camp:${camp.id}`;
    const c = cast(ctx, key, { women: 0, child: false }, () =>
      ctx.roster!.take({ ...ADULTS, homes: new Set([camp.burnerId]), sex: 'male' }),
    );
    if (!c) continue;
    const at = campEntrance(camp);
    const spot = free(ctx, at.x, at.z) ? at : nearestFree(ctx, at.x, at.z, 3);
    if (!spot) {
      if (c.person) ctx.roster?.release(c.person.id);
      continue;
    }
    const pose = stand(spot.x, spot.z, Math.sin(camp.rotation), Math.cos(camp.rotation), 'sit');
    out.push(
      figure(c, pose, adultHair(c.who, ctx.sexes.married), { kind: 'traffic', traffic: 'kiln' }),
    );
  }
  return out;
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
    // uhlí na tyči nese dvojice (`poleCarriers`)
    if (share.activity !== 'fetch' || share.carts || share.pole !== undefined) continue;
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
  out.push(...poleCarriers(ctx, labor));
  return out;
}

/** Nosič kováře u milíře nebo jámy nakládá koš (s). */
export const FETCH_LOAD_S = 5;

export { POLE_SPACING_M };

/**
 * Uhlí na tyči (workshops.md – Uhlíř, odnos na tyči; Martin 14. 11. 2026): dvojice – uhlíř a jeho
 * syn, kovář, nebo syn kováře (`LaborShare.pole`, věky `ages`: uhlíř, druhý) – jde po téže trase
 * kovárna ↔ milíř, zadní o POLE_SPACING_M za předním. K milíři jdou prázdní (`walk`), zpět nesou
 * košatinu na tyči (přední `carry-pole`, zadní `carry-pole-back`) a v kovárně zmizí. Pro kováře
 * nebo jeho syna jde uhlíř napřed sám od milíře ke kovárně (`walk`) a dvojice vyjde, až tam dojde.
 * Obě postavy jdou stejnou rychlostí (pomalejší z nich), ať tyč drží pospolu.
 */
export function poleCarriers(ctx: Context, labor: SceneLabor): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (const share of labor.shares) {
    const pole = share.pole;
    if (share.activity !== 'fetch' || share.carts || pole === undefined) continue;
    const t = share.target;
    if (t.kind !== 'kiln' || t.from === undefined) continue;
    const smithHome = ctx.houses.find((h) => h.id === t.from && h.built);
    if (!smithHome) continue;
    const door = trafficDoor(ctx, smithHome);
    const goal = nearestFree(ctx, t.x, t.z, 8);
    if (!door || !goal) continue;
    const path = walkRoute(ctx, door, goal);
    if (!path) continue;
    const ages = share.ages ?? [];
    const key = `fetch:${targetKey(t)}:${ages.join('.')}`;
    const homes = [new Set([t.id]), new Set([pole === 'burner-son' ? t.id : t.from])];
    const people = [0, 1].map((k) => {
      const age = ages[k] ?? 30;
      const child = age < CHILD_UNDER;
      const c = cast(ctx, `${key}:${k}`, { women: 0, child }, () =>
        ctx.roster!.take({
          from: AGE.olderChild,
          to: Infinity,
          homes: homes[k]!,
          sex: 'male',
          age,
        }),
      );
      return c ? { c, child } : null;
    });
    const [lead, rear] = people;
    if (!lead || !rear) {
      // druhý u tyče nevyšel – ten, kdo vyšel, zůstane volný pro jinou postavu
      for (const p of people) if (p?.c.person) ctx.roster?.release(p.c.person.id);
      continue;
    }
    const poses = polePoses(
      path,
      lead.c.who,
      rear.c.who,
      pole !== 'burner-son',
      hash01(stringHash(key), 1, 93),
    );
    [lead, rear].forEach(({ c, child }, k) => {
      const hair = child ? 'natural' : adultHair(c.who, ctx.sexes.married);
      out.push(figure(c, poses[k]!, hair, { kind: 'fetch', goods: 'charcoal' }));
    });
  }
  return out;
}

/**
 * Pózy dvojice u tyče po trase kovárna (začátek) ↔ milíř (konec): jeden cyklus je (s `alone`
 * napřed cesta samotného uhlíře od milíře ke kovárně) cesta tam, nakládání, cesta zpět s tyčí
 * a doma. Zadní postava jde o POLE_SPACING_M později po téže trase, v kovárně vejde dovnitř
 * o chvíli po předním.
 */
export function polePoses(
  path: Route,
  lead: { kind: Identity['kind']; scale: number },
  rear: { kind: Identity['kind']; scale: number },
  alone: boolean,
  phase: number,
): [PoseFn, PoseFn] {
  const slowest = (clip: 'walk' | 'carry-pole'): number =>
    Math.min(walkSpeed(lead.kind, clip, lead.scale), walkSpeed(rear.kind, clip, rear.scale));
  const outSpeed = slowest('walk');
  const backSpeed = slowest('carry-pole');
  const delayS = POLE_SPACING_M / backSpeed;
  const options: ShuttleOptions = {
    outClip: 'walk',
    outSpeed,
    endClip: 'idle',
    endS: FETCH_LOAD_S,
    backClip: 'carry-pole',
    backSpeed,
    restClip: 'idle',
    // zadní dojde za předním do kovárny, než se cyklus opakuje
    restS: TRAFFIC_HOME_S + delayS + 2,
    restHidden: true,
    phase: 0,
  };
  const walk = walkLengthOf(path);
  const legS = alone ? walk / outSpeed : 0;
  const cycleS = legS + shuttleCycle(path, options).cycleS;
  const front = shuttle(path, options);
  const back = shuttle(path, { ...options, backClip: 'carry-pole-back' });
  const clock = (t: number): number => {
    const shifted = t + phase * cycleS;
    return ((shifted % cycleS) + cycleS) % cycleS;
  };
  const leader: PoseFn = (t, herds, out) => {
    const time = clock(t);
    if (time >= legS) return front(time - legS, herds, out);
    // uhlíř sám od milíře ke kovárně, pro druhého
    out.pace = alongRouteWalk(path, walk - (time / legS) * walk, true, out);
    out.clip = 'walk';
    out.stage = 'out';
    return out;
  };
  const follower: PoseFn = (t, herds, out) => {
    const time = clock(t) - legS - delayS;
    if (time < 0) {
      alongRouteWalk(path, 0, true, out);
      out.clip = 'idle';
      out.stage = 'rest';
      out.hidden = true;
      return out;
    }
    return back(time, herds, out);
  };
  return [leader, follower];
}

/**
 * Řemeslníci v dílně (crafts.md): hrnčíř u kruhu a pece, kovář u kovadliny a měchů, uhlíř kolem
 * milíře s hrabicí – místa z workshop-layout.ts, postavy se po nich střídají; místo, kde
 * nejde stát (voda, jiný dům), nahradí nejbližší volné. Podle dvora dne (craft-yard-layout.ts):
 * při tavbě kovář sype rudu a uhlí do redukční pece a druhý šlape měch (měchař – syn 10–13 má
 * v rozdělení práce vlastní podíl s věkem, `bellows`), při překování kove u kovadliny; hrnčíř
 * šlape hlínu v jámě (střídavě po dnech napřed šlapání, nebo kruh); tesař s pomocníkem staví
 * rozdělaný vůz před dílnou (`carpenterCartSpots`).
 */
export function craftsmen(ctx: Context, dwellingId: number, bellows = false): Placer {
  const house = ctx.houses.find((h) => h.id === dwellingId && h.built && h.craft);
  if (!house?.craft) return none;
  const view = {
    id: house.id,
    craft: house.craft,
    position: house.position,
    ...(house.frame ? { frame: house.frame } : {}),
    ...(house.type ? { type: house.type } : {}),
  };
  const porch = craftSpots(house.craft, house.position, house.frame, house.type);
  const smelting = house.craft === 'smith' && house.yard?.task === 'smelt';
  const furnace = smelting ? smeltSpots(view) : [];
  // měchař z podílu syna stojí jen u měchu; sám kovář taví bez měchaře
  if (bellows) return smelting ? standAt(ctx, house, [furnace[1]!]) : none;
  // tesař s pomocníkem u rozdělaného vozu (villagers.md – Fáze činností, Tesař), dokud ho
  // nedodělá – vůz čekající na kování už jen stojí
  const cart = house.craft === 'carpenter' && (house.yard?.cart?.stage ?? 3) < 3;
  const spots = smelting
    ? [furnace[0]!, ...(house.yard?.bellows ? [furnace[1]!] : []), ...porch]
    : cart
      ? carpenterCartSpots(view)
      : porch;
  const place = standAt(ctx, house, spots);
  if (house.craft !== 'potter' || !house.yard?.treading) return place;
  const tread = treading(view, stringHash(`tread:${house.id}`));
  // jeden hrnčíř šlape každý druhý den, s pomocníkem šlape vždy jeden z nich
  const first = ctx.day % 2 === 0 ? 0 : 1;
  return (i, who) => (i === first ? tread : place(i < first ? i : i - 1, who));
}

/** Postavy po místech `spots` dokola, další řada za nimi; místo, kde nejde stát, nahradí volné. */
function standAt(ctx: Context, house: House, spots: readonly CraftSpot[]): Placer {
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

/** Rychlost šlapání hlíny (m/s) a zastavení na krajích jámy (s). */
export const TREADING = { speed: 0.28, turnS: 0.6 } as const;

/** Hrnčíř šlape hlínu v jámě – pomalu tam a zpět napříč jámou (klip chůze na místě v hlíně). */
function treading(view: Parameters<typeof treadingLine>[0], seed: number): PoseFn {
  const [a, b] = treadingLine(view);
  const options: ShuttleOptions = {
    outClip: 'walk',
    outSpeed: TREADING.speed,
    endClip: 'idle',
    endS: TREADING.turnS,
    backClip: 'walk',
    backSpeed: TREADING.speed,
    restClip: 'idle',
    restS: TREADING.turnS,
    phase: hash01(seed, 1, 7),
  };
  return shuttle(route([a, b]), options);
}
