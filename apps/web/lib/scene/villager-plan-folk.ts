// Domácí práce, nosiči, nečinní, starší u domů a děti u stád.
import type { SceneLabor } from '../village-view';
import { fetcher, herder, route, shuttle, stand, walkSpeed } from './villager-motion';
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

// --- trasy ---------------------------------------------------------------------------------
