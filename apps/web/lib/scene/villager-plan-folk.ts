// Domácí práce, nosiči, nečinní, starší u domů a děti u stád.
import type { SceneLabor } from '../village-view';
import { fetcher, herder, route, shuttle, stand, walkSpeed, type PoseFn } from './villager-motion';
import type { ScenePerson } from '../person-view';
import { ADULTS, ELDERS, YOUNGSTERS } from './villager-roster';
import {
  WOMEN,
  gap,
  none,
  type Context,
  type Placer,
  type PlannedVillager,
} from './villager-plan-types';
import { doorPoint, nearestFree, unit, walkRoute, worldPoint } from './villager-plan-geometry';
import { adultHair, cast, figure, identity, womenChance } from './villager-plan-cast';

/**
 * Výrostci, kteří dnes pasou (`labor.herders.children` – diet.md, Pasáci): napřed, ať je nikdo
 * jiný nevezme; postav u stád je jen tolik, kolik stád se pase (`herders`).
 */
export function herderPeople(ctx: Context, labor: SceneLabor): ScenePerson[] {
  const roster = ctx.roster;
  if (!roster) return [];
  const out: ScenePerson[] = [];
  for (let k = 0; k < (labor.herders?.children ?? 0); k++) {
    const who = identity(ctx.seed, `herder:${k}`, {
      women: womenChance(0.4, ctx.sexes.girls),
      child: true,
    });
    const person = roster.take({ ...YOUNGSTERS, sex: who.kind === 'woman' ? 'female' : 'male' });
    if (!person) break;
    out.push(person);
  }
  return out;
}

/**
 * Nosiči výpravy k sousedovi (trade.md – Obchod): jdou s nákladem po zemské stezce od dvorce ke
 * kraji mapy a zase zpět (skutečný čas jako ostatní postavy) – rozestoupení podle fáze, takže
 * tvoří karavanu po celé stezce.
 */
export function porters(
  ctx: Context,
  trailId: number | null,
  line?: readonly { x: number; z: number }[],
): Placer {
  const points = line ?? (ctx.village.trails ?? []).find((t) => t.id === trailId)?.points ?? [];
  if (points.length < 2) return none;
  const path = route(points.map((p) => [p.x, p.z] as const));
  return (_i, who) =>
    shuttle(path, {
      outClip: 'carry',
      outSpeed: walkSpeed(who.kind, 'carry', who.scale),
      endClip: 'idle',
      endS: 4,
      backClip: 'carry',
      backSpeed: walkSpeed(who.kind, 'carry', who.scale),
      restClip: 'idle',
      restS: 3,
      phase: who.phase,
    });
}

/**
 * Domácí práce venku: u obydlí (po domech dokola) postávají ženy před vchodem a některé
 * chodí kousek od domu (pro vodu a dřevo po pěšinách chodí provoz na cestách).
 */
export function domestic(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i, who) => {
    const home = homes[i % homes.length];
    if (!home) return null;
    const turn = Math.floor(i / homes.length);
    const side = turn % 2 === 0 ? -gap(1.3) : gap(1.3);
    const door = nearestFree(ctx, doorPoint(home, side).x, doorPoint(home, side).z, 1.5);
    if (!door) return null;
    // pro vodu a dřevo po pěšinách chodí provoz na cestách (trafficFigures) – domácí práce jen
    // kousek od domu
    if (turn % 2 === 1) {
      // 6–12 m od domu směrem od vsi (k hromadě dřeva, ke džberu)
      const away = unit(
        home.position.x - ctx.center.x + (who.phase - 0.5) * 6,
        home.position.z - ctx.center.z + 1,
      );
      const r = 6 + who.phase * 6;
      const goal = nearestFree(ctx, door.x + away.x * r, door.z + away.z * r, 3);
      const path = goal ? walkRoute(ctx, door, goal) : null;
      if (path) return fetcher(path, who.kind, who.scale, 10 + who.phase * 8, who.phase);
    }
    const out = unit(door.x - home.position.x, door.z - home.position.z);
    return stand(door.x, door.z, out.x, out.z, 'idle');
  };
}

/** Nečinní (společná práce bez staveb): dvojice u domů natočené k sobě. */
export function idlers(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i) => {
    const home = homes[Math.floor(i / 2) % homes.length];
    if (!home) return null;
    const pair = Math.floor(i / (2 * homes.length));
    const side = pair % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + 2.4 : home.box.minX - 2.4;
    const base = worldPoint(home.position, edge, 0.5 - pair);
    const across = unit(Math.cos(home.position.rotation), -Math.sin(home.position.rotation));
    const k = i % 2 === 0 ? -gap(0.7) : gap(0.7);
    const spot = nearestFree(ctx, base.x + across.x * k, base.z + across.z * k, 2);
    if (!spot) return null;
    return stand(spot.x, spot.z, -across.x * Math.sign(k), -across.z * Math.sign(k), 'idle');
  };
}

/** Starší u domů – stojí u boční stěny čelem ven (sedět zatím neumí – chybí animace). */
export function elders(ctx: Context, count: number): PlannedVillager[] {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  const out: PlannedVillager[] = [];
  for (let i = 0; i < count && homes.length > 0; i++) {
    const slot = homes[i % homes.length]!;
    // starší doma (villagers.md – Výběr postavy): přednostně z domu postavy, stojí u svého domu
    const c = cast(
      ctx,
      `elder:${slot.id}:${i}`,
      { women: womenChance(0.5, ctx.sexes.elderWomen), child: false },
      () => ctx.roster!.take({ ...ELDERS, preferHome: slot.id }),
    );
    if (!c) continue;
    const home = (c.person && homes.find((h) => h.id === c.person!.home)) || slot;
    const who = c.who;
    const side = i % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + gap(0.7) : home.box.minX - gap(0.7);
    const p = worldPoint(home.position, edge, home.box.minZ * 0.3);
    const spot = nearestFree(ctx, p.x, p.z, 1.5);
    if (!spot) continue;
    const away = unit(spot.x - home.position.x, spot.z - home.position.z);
    out.push(
      figure(
        { who: { ...who, scale: who.scale * 0.97 }, person: c.person },
        stand(spot.x, spot.z, away.x, away.z, 'idle', 0.7),
        'grey',
        { kind: 'elder' },
      ),
    );
  }
  return out;
}

/**
 * Pasáci u stád – děti (zmenšený muž nebo žena), starší (šediny) a dospělí, jeden u každého
 * stáda (`herderKinds`).
 */
export function herders(
  ctx: Context,
  kinds: readonly ('child' | 'elder' | 'adult')[],
  youngsters: readonly ScenePerson[] = [],
): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  kinds.forEach((kind, k) => {
    const c = cast(
      ctx,
      `herder:${k}`,
      {
        women: womenChance(
          kind === 'child' ? 0.4 : WOMEN.herding,
          kind === 'child'
            ? ctx.sexes.girls
            : kind === 'elder'
              ? ctx.sexes.elderWomen
              : ctx.sexes.women,
        ),
        child: kind === 'child',
      },
      // výrostci, kteří dnes pasou (`herderPeople`); starší a dospělí pasáci (dřívější
      // rozdělení práce) z lidí vsi
      () =>
        kind === 'child'
          ? (youngsters[k] ?? null)
          : ctx.roster!.take(kind === 'elder' ? ELDERS : ADULTS),
    );
    if (!c) return;
    const who = c.who;
    const speed = walkSpeed(who.kind, 'walk', who.scale) * 0.8;
    const home = nearestFree(ctx, ctx.center.x + 12 + k * 2, ctx.center.z + 12, 6) ?? ctx.center;
    const hair =
      kind === 'elder' ? 'grey' : kind === 'adult' ? adultHair(who, ctx.sexes.married) : 'natural';
    const pose = herder(k, home, who.seed, who.phase, speed, 0.8);
    out.push(figure(c, pose, hair, { kind: 'herd', herd: k }));
  });
  return out;
}

/** Nejvýš tolik rybářů u jedné tůně (jádro `SMALL_GAME.maxPerPool`) a rozestup na břehu (m). */
export const ANGLERS_PER_POOL = 3;
const ANGLER_GAP_M = 3.2;
/** Rybář stojí na prvním schůdném místě od okraje vody (m navíc, krok, nejdál). */
const BANK_FROM_M = 0.6;
const BANK_STEP_M = 0.6;
const BANK_MAX_M = 8;

/**
 * Kde stojí rybář `i` u tůně (wildlife.md – Ve scéně): na břehu tůně (`SceneWildlife.pools` –
 * loviště od nejbližší), střídavě na obou březích, podél toku po `ANGLER_GAP_M`, na prvním
 * schůdném místě od vody, čelem k vodě. Nad `ANGLERS_PER_POOL` nebo bez tůně null.
 */
export function anglerSpot(
  ctx: Context,
  index: number,
  i: number,
): { x: number; z: number; headingX: number; headingZ: number } | null {
  const pool = ctx.village.wildlife?.pools?.[index];
  if (!pool || i >= ANGLERS_PER_POOL) return null;
  // levý břeh je vlevo od směru toku
  const sides = [
    { nx: -pool.flowZ, nz: pool.flowX, half: pool.halfLeft },
    { nx: pool.flowZ, nz: -pool.flowX, half: pool.halfRight },
  ];
  for (let k = 0; k < sides.length; k++) {
    const side = sides[(i + k) % 2]!;
    const along = (Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1) + (k > 0 ? 0.5 : 0)) * ANGLER_GAP_M;
    const ax = pool.x + pool.flowX * along;
    const az = pool.z + pool.flowZ * along;
    for (let d = side.half + BANK_FROM_M; d <= side.half + BANK_MAX_M; d += BANK_STEP_M) {
      const x = ax + side.nx * d;
      const z = az + side.nz * d;
      if (ctx.ground.walkable(x, z)) return { x, z, headingX: -side.nx, headingZ: -side.nz };
    }
  }
  return null;
}

/**
 * Rybáři u tůně (wildlife.md – Drobná zvěř a ryby; Ve scéně): podíl práce `fish` s cílem tůně –
 * postava stojí na břehu s prutem (klip `fish` – klidová póza a prut z `man.glb` / `woman.glb`).
 * Kolik jich je, dává podíl práce (hodiny ÷ délka dne, nejvýš 3 na tůň – `anglerSpot`).
 */
export function anglers(ctx: Context, index: number): Placer {
  return (i) => {
    const spot = anglerSpot(ctx, index, i);
    return spot ? stand(spot.x, spot.z, spot.headingX, spot.headingZ, 'fish', 0.6) : null;
  };
}

/** Nejvýš tolik dětí s řehtačkou na hlídaných dílech a jejich tempo (m/s). */
export const WATCH_CHILDREN = 4;
const WATCH_PACE = 0.55;

/**
 * Děti s řehtačkou na hlídaných dílech (wildlife.md – Noční hlídka: vrány plaší i ve dne; jen
 * zobrazení): na každém hlídaném dílu (`SceneWildlife.watchParts`) nejvýš jedno dítě z výrostků,
 * které chodí sem a tam po okraji dílu. Noc hra nemá – noční hlídače u ohně scéna nekreslí
 * (návrh Clauda; v panelu je ikona hlídky).
 */
export function watchChildren(ctx: Context): PlannedVillager[] {
  const ids = ctx.village.wildlife?.watchParts ?? [];
  const roster = ctx.roster;
  if (ids.length === 0 || !roster) return [];
  const parts = ctx.village.fields.flatMap((f) => f.parts);
  const out: PlannedVillager[] = [];
  for (const id of ids) {
    if (out.length >= WATCH_CHILDREN) break;
    const part = parts.find((p) => p.id === id);
    if (!part) continue;
    const c = cast(
      ctx,
      `watch:${id}`,
      { women: womenChance(0.4, ctx.sexes.girls), child: true },
      (sex) => roster.take({ ...YOUNGSTERS, sex }),
    );
    if (!c) continue;
    // okraj dílu nejblíž středu vsi – kousek za čtvercem (na mezi)
    const half = part.size / 2 + 0.8;
    const rot = part.rotation ?? 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const sides = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ].map(([u, v]) => ({
      nx: u! * cos + v! * sin,
      nz: -u! * sin + v! * cos,
    }));
    const near = sides
      .map((n) => ({
        n,
        d: Math.hypot(part.x + n.nx * half - ctx.center.x, part.z + n.nz * half - ctx.center.z),
      }))
      .sort((a, b) => a.d - b.d)[0]!.n;
    const mx = part.x + near.nx * half;
    const mz = part.z + near.nz * half;
    const tx = -near.nz;
    const tz = near.nx;
    out.push(
      figure(c, edgeWalk(mx, mz, tx, tz, part.size / 2, c.who.phase), 'natural', { kind: 'watch' }),
    );
  }
  return out;
}

/** Chůze sem a tam po úsečce (střed, směr, půldélka) tempem `WATCH_PACE`, na koncích chvíli stojí. */
function edgeWalk(
  x: number,
  z: number,
  tx: number,
  tz: number,
  half: number,
  phase: number,
): PoseFn {
  const leg = Math.max(1, 2 * half) / WATCH_PACE;
  const rest = 4;
  const period = 2 * (leg + rest);
  return (t, _herds, out) => {
    const tau = (((t + phase * period) % period) + period) % period;
    const forward = tau < leg + rest;
    const u = forward ? tau : tau - leg - rest;
    const f = Math.min(1, u / leg);
    const s = (forward ? f : 1 - f) * 2 * half - half;
    const dir = forward ? 1 : -1;
    out.x = x + tx * s;
    out.z = z + tz * s;
    out.headingX = tx * dir;
    out.headingZ = tz * dir;
    out.clip = u < leg ? 'walk' : 'idle';
    out.pace = u < leg ? WATCH_PACE / 0.8 : 1;
    return out;
  };
}

// --- trasy ---------------------------------------------------------------------------------
