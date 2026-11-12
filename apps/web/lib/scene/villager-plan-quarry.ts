// Poddaní v lomu (churches.md – Mistři huti při práci, Lom; Martin 12. 11. 2026: „ať kameník
// neláme krumpáčem kámen v lomu – to dělají poddaní. … Další poddaný si od něj přisekané kameny
// odebírá a nakládá je na vůz, nebo na hromadu, pokud vůz není poblíž.“; fortifications.md –
// Kámen, Nošení kamene a vůz): lidé podílu lámání (`quarry`) lámou krumpáčem u stěny lomu, jeden
// z nich odnáší kameny od stěny (od kameníka) na hromadu u lomu a bez vozu s kamenem nosí část
// z nich kámen v nůších z hromady u lomu na stavbu – ke kostelu, k hradbě, nebo k hromadě kamení
// u dvorce (zásoba). S vozem s kamenem (podíl `haul`, `job` `stone`) nosiči nejsou a odnášeč nosí
// kameny k vozu u lomu (village-carts.ts – `stoneCartLoadSpot`); vůz kreslí cart-renderer.ts a vede
// ho vozka (villager-plan.ts – `draftStaff`). Čistý modul bez Babylonu.
import type { Sex } from '@bohemia/game';
import type { ScenePerson } from '../person-view';
import type { SceneLabor, SceneLaborShare, SceneVillage } from '../village-view';
import { streamPhase } from './road-traffic';
import { hash01 } from './smoke-schedule';
import { stoneDestination as stoneTarget } from './stone-destination';
import { PILE_RADIUS_M, QUARRY_FACE_M, QUARRY_PILES, toWorld } from './stone-pile-layout';
import { stoneCartLoadSpot } from './village-carts';
import { shuttleErrand } from './villager-errands';
import {
  shuttle,
  stand,
  walkSpeed,
  type PoseFn,
  type Route,
  type ShuttleOptions,
} from './villager-motion';
import type { PhasePlaces, PhaseRole } from './villager-phases';
import { adultHair, cast, figure } from './villager-plan-cast';
import { nearestFree, stringHash, targetKey, unit, walkRoute } from './villager-plan-geometry';
import type { Context, PlannedVillager, Point } from './villager-plan-types';
import { ADULTS, type PersonJob } from './villager-roster';

/** Lom ve scéně (`SceneVillage.quarries`). */
export type SceneQuarry = NonNullable<SceneVillage['quarries']>[number];

/**
 * Místa v lomu v místních osách lomu (m; stěna v −z, hromádky `QUARRY_PILES`; návrh Clauda):
 * řada lámajících před stěnou, kameník u nalámaného kamene na straně od hromady a za lámajícími
 * u kraje stěny, kde ukazuje, jak lámat; odnášeč u nalámaného kamene na straně do lomu,
 * stavbyvedoucí při obchůzce stranou od lámajících.
 */
export const QUARRY_STAND = {
  /** Řada lámajících: od přední plochy stěny, rozestup, přesah za okraje stěny, volno od hromádek. */
  row: { front: 0.75, spacing: 1.1, overhang: 0.6, pileGap: 0.35 },
  /** Kameník přisekává kámen – od okraje nalámaného kamene (strana od hromady, +x). */
  dress: 0.8,
  /** Kameník ukazuje, jak lámat – kus za řadou lámajících u kraje stěny. */
  show: { lx: 2.2, lz: 0.25 },
  /** Odnášeč bere kameny u nalámaného kamene na straně do lomu (+z) – od okraje. */
  pick: 0.65,
  /** Odnášeč skládá kámen na okraji hromady u lomu – od okraje. */
  stack: 0.6,
  /** Nosič nakládá u hromady u lomu a skládá u stavby – od okraje hromady. */
  load: 0.8,
  /** Stavbyvedoucí při obchůzce lomu – stranou od lámajících, kousek od kameníka. */
  visit: { lx: 3.4, lz: 0.6 },
} as const;

/**
 * Nosiči kamene bez vozu (fortifications.md – Kámen, Nošení kamene a vůz; návrh Clauda): jen když
 * je lom od stavby dál než `overM`, nosí kámen asi třetina lidí lámání (`share`), aspoň jeden;
 * u hromady u lomu nakládají `loadS` s, u stavby skládají `unloadS` s.
 */
export const STONE_CARRY = { overM: 40, share: 1 / 3, loadS: 6, unloadS: 5 } as const;

/** Místo postavy: bod a směr pohledu. */
interface Spot {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** Hromádka v lomu ve světě: střed a poloměr (m). */
export interface QuarryPile {
  x: number;
  z: number;
  r: number;
}

/** Bod v místních osách lomu ve světě. */
function local(q: SceneQuarry, lx: number, lz: number): Point {
  const [x, z] = toWorld(q.x, q.z, q.rotation, lx, lz);
  return { x, z };
}

/** Bod `r` m od středu `c` ve směru k `toward`. */
export function rimToward(c: Point, toward: Point, r: number): Point {
  const d = unit(toward.x - c.x, toward.z - c.z);
  return { x: c.x + d.x * r, z: c.z + d.z * r };
}

/** Lom `outcropId` ve scéně, nebo null. */
export function sceneQuarry(ctx: Pick<Context, 'village'>, outcropId: number): SceneQuarry | null {
  return (ctx.village.quarries ?? []).find((q) => q.outcropId === outcropId) ?? null;
}

/**
 * Hromádky lomu ve světě: nalámaný kámen u stěny (`broken`) a hromada u lomu (`heap`) –
 * rozestavěný lom hromadu nemá, kameny se skládají k nalámanému kamení.
 */
export function quarryPiles(q: SceneQuarry): { broken: QuarryPile; heap: QuarryPile } {
  const { broken, heap } = QUARRY_PILES;
  const b = { ...local(q, broken.lx, broken.lz), r: PILE_RADIUS_M.a * broken.scale };
  const h = q.building ? b : { ...local(q, heap.lx, heap.lz), r: PILE_RADIUS_M.b * heap.scale };
  return { broken: b, heap: h };
}

/**
 * Místa lámajících před stěnou lomu v rozestupu `row.spacing`, mimo hromádky, čelem ke stěně –
 * napřed nejblíž místu, kde kameník ukazuje, jak lámat (`QUARRY_STAND.show`).
 */
export function quarryFaceSpots(q: SceneQuarry): Spot[] {
  const { row, show } = QUARRY_STAND;
  const lz = -QUARRY_FACE_M.back + QUARRY_FACE_M.depth / 2 + row.front;
  const half = QUARRY_FACE_M.width / 2 + row.overhang;
  const n = Math.floor((2 * half) / row.spacing) + 1;
  const piles = [
    { ...QUARRY_PILES.broken, r: PILE_RADIUS_M.a * QUARRY_PILES.broken.scale },
    ...(q.building ? [] : [{ ...QUARRY_PILES.heap, r: PILE_RADIUS_M.b * QUARRY_PILES.heap.scale }]),
  ];
  const xs: number[] = [];
  for (let k = 0; k < n; k++) {
    const lx = (k - (n - 1) / 2) * row.spacing;
    if (piles.every((p) => Math.hypot(lx - p.lx, lz - p.lz) >= p.r + row.pileGap)) xs.push(lx);
  }
  xs.sort((a, b) => Math.abs(a - show.lx) - Math.abs(b - show.lx));
  const face = { x: -Math.sin(q.rotation), z: -Math.cos(q.rotation) };
  return xs.map((lx) => ({ ...local(q, lx, lz), hx: face.x, hz: face.z }));
}

/** Kameník u nalámaného kamene na straně od hromady, čelem k němu (přisekává kámen). */
export function quarryDressSpot(q: SceneQuarry): Spot {
  const { broken } = quarryPiles(q);
  const b = QUARRY_PILES.broken;
  const at = local(q, b.lx + broken.r + QUARRY_STAND.dress, b.lz);
  const h = unit(broken.x - at.x, broken.z - at.z);
  return { ...at, hx: h.x, hz: h.z };
}

/** Kde kameník ukazuje lámajícím, jak lámat – kus za jejich řadou (krok jinde `face`). */
export function quarryShowSpot(q: SceneQuarry): Point {
  return local(q, QUARRY_STAND.show.lx, QUARRY_STAND.show.lz);
}

/** Kam stavbyvedoucí při obchůzce lomu dojde (krok jinde `quarry`). */
export function quarryVisitSpot(q: SceneQuarry): Point {
  return local(q, QUARRY_STAND.visit.lx, QUARRY_STAND.visit.lz);
}

/** Odnášeč u nalámaného kamene na straně do lomu, čelem k němu (bere přisekané kameny). */
function pickSpot(q: SceneQuarry): Spot {
  const { broken } = quarryPiles(q);
  const b = QUARRY_PILES.broken;
  const at = local(q, b.lx, b.lz + broken.r + QUARRY_STAND.pick);
  const h = unit(broken.x - at.x, broken.z - at.z);
  return { ...at, hx: h.x, hz: h.z };
}

/**
 * Kam se kámen z lomu `q` podílu `share` nosí (fortifications.md – Kámen, Nošení kamene a vůz;
 * jádro – `stoneSource`; stone-destination.ts): k hromadě kamene u kostela, k nejbližšímu bodu
 * obvodu hradby, jejíž stavba láme, jinak k hromadě kamení u dvorce (zásoba). Bod a poloměr
 * hromady (m); bez místa null.
 */
export function stoneDestination(
  ctx: Pick<Context, 'village' | 'center'>,
  share: Pick<SceneLaborShare, 'construction'>,
  q: SceneQuarry,
): { at: Point; r: number } | null {
  return stoneTarget(ctx.village, ctx.center, share.construction, q);
}

/** Jede dnes z lomu podílu `share` vůz s kamenem (podíl `haul`, `job` `stone` téže stavby)? */
function stoneCartToday(labor: SceneLabor, share: SceneLaborShare): boolean {
  const t = share.target;
  return labor.shares.some(
    (s) =>
      s.activity === 'haul' &&
      s.job === 'stone' &&
      s.target.kind === 'quarry' &&
      t.kind === 'quarry' &&
      s.target.id === t.id &&
      (s.construction === undefined ||
        share.construction === undefined ||
        s.construction === share.construction),
  );
}

/**
 * Trasa nosičů kamene: od hromady u stavby (začátek – tam skládají) k hromadě u lomu (konec –
 * tam nakládají). Bez vozu a jen s lomem dál než `STONE_CARRY.overM` od stavby; jinak null.
 */
function carryRoute(
  ctx: Context,
  labor: SceneLabor,
  share: SceneLaborShare,
  q: SceneQuarry,
): Route | null {
  if (stoneCartToday(labor, share)) return null;
  const dest = stoneDestination(ctx, share, q);
  if (!dest || Math.hypot(dest.at.x - q.x, dest.at.z - q.z) <= STONE_CARRY.overM) return null;
  const { heap } = quarryPiles(q);
  const drop = rimToward(dest.at, q, dest.r + QUARRY_STAND.load);
  const load = rimToward(heap, dest.at, heap.r + QUARRY_STAND.load);
  const from = nearestFree(ctx, drop.x, drop.z, 6);
  const to = nearestFree(ctx, load.x, load.z, 3);
  return from && to ? walkRoute(ctx, from, to) : null;
}

/**
 * Postavy podílů lámání dne (`counts` – kolik postav podíl dostal): u každého lomu ve scéně první
 * postava láme u stěny (klip `quarry`), druhá odnáší kameny od stěny na hromadu u lomu (`stacker`),
 * další lámou, a bez vozu s kamenem nosí od tří postav poslední z nich (≈ třetina, aspoň jeden,
 * nejvýš všichni kromě prvního lámajícího a odnášeče) kámen v nůších na stavbu jako pochůzku. Lámou muži (těžká práce); kdo se k stěně
 * nevejde nebo nemá místo, postavu nemá a zůstane volný pro jinou práci.
 */
export function quarryFigures(
  ctx: Context,
  labor: SceneLabor,
  counts: readonly number[],
): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  labor.shares.forEach((share, s) => {
    const n = counts[s] ?? 0;
    const t = share.target;
    if (share.activity !== 'quarry' || t.kind !== 'quarry' || n <= 0) return;
    const q = sceneQuarry(ctx, t.id);
    if (q) out.push(...quarryCrew(ctx, labor, share, q, n));
  });
  return out;
}

function quarryCrew(
  ctx: Context,
  labor: SceneLabor,
  share: SceneLaborShare,
  q: SceneQuarry,
  n: number,
): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  const key = `quarry:${targetKey(share.target)}:${share.construction ?? ''}`;
  // přednost má lámání: jediná postava láme, druhá odnáší kameny od kameníka, nosiči až od třetí
  const stacker = n >= 2 ? 1 : -1;
  const path = n >= 3 ? carryRoute(ctx, labor, share, q) : null;
  const carriers = path ? Math.min(n - 2, Math.max(1, Math.round(n * STONE_CARRY.share))) : 0;
  const faces = quarryFaceSpots(q);
  const base = hash01(stringHash(key), 1, 93);
  // lámou muži; ves bez mužů – kdokoli dospělý
  const pick = (sex: Sex): ScenePerson | null =>
    ctx.roster!.take({ ...ADULTS, onlySex: 'male' }) ?? ctx.roster!.take({ ...ADULTS, sex });
  const job: PersonJob = { kind: 'share', activity: 'quarry', target: share.target };
  for (let i = 0; i < n; i++) {
    const carrier = i >= n - carriers ? i - (n - carriers) : -1;
    let spot: Spot | null = null;
    if (carrier < 0) {
      const want = i === stacker ? pickSpot(q) : faces[i === 0 ? 0 : i - 1];
      const at = want ? nearestFree(ctx, want.x, want.z, 1.2) : null;
      spot = want && at ? { ...want, x: at.x, z: at.z } : null;
      // k stěně se nevejde – postavu nemá
      if (!spot) continue;
    }
    const c = cast(ctx, `${key}:${i}`, { women: 0, child: false }, pick);
    if (!c) continue;
    const who = c.who;
    const hair = adultHair(who, ctx.sexes.married);
    if (carrier >= 0 && path) {
      const man = who.kind === 'man';
      const options: ShuttleOptions = {
        outClip: 'walk',
        outSpeed: walkSpeed(who.kind, 'walk', who.scale),
        endClip: man ? 'lay' : 'weed',
        endS: STONE_CARRY.loadS,
        backClip: man ? 'carry-stone' : 'carry',
        backSpeed: walkSpeed(who.kind, man ? 'carry-stone' : 'carry', who.scale),
        restClip: man ? 'lay' : 'weed',
        restS: STONE_CARRY.unloadS,
        phase: streamPhase(carrier, base),
      };
      // pochůzka je celý cyklus – při změně plánu ji nosič dojde (villager-errands.ts)
      out.push({
        ...figure(c, shuttle(path, options), hair, { kind: 'fetch', goods: 'stone' }),
        errand: shuttleErrand(path, options),
      });
      continue;
    }
    const pose: PoseFn = stand(
      spot!.x,
      spot!.z,
      spot!.hx,
      spot!.hz,
      i === stacker ? 'lay' : 'quarry',
    );
    out.push(figure(c, pose, hair, i === stacker ? { ...job, stacker: true } : job));
  }
  return out;
}

/**
 * Role fází postavy lámání (villager-phases.ts): lámající u stěny si chvíli oddechne, odnášeč
 * nosí kameny od nalámaného kamene na okraj hromady u lomu (krok jinde `heap`) – jede-li dnes
 * z lomu vůz s kamenem, nosí je k vozu a nakládá (`quarry-load`, místo u zadku vozu na konci jeho
 * trasy u lomu – `stoneCartLoadSpot`; Martin 12. 11. 2026: „nakládá je na vůz, nebo na hromadu,
 * pokud vůz není poblíž“).
 */
export function quarryPhases(
  ctx: Pick<Context, 'village'>,
  job: Extract<PersonJob, { kind: 'share' }>,
  at: Point,
): { role: PhaseRole; places?: PhasePlaces } {
  if (!job.stacker) return { role: 'quarry-break' };
  const q = job.target.kind === 'quarry' ? sceneQuarry(ctx, job.target.id) : null;
  if (!q) return { role: 'quarry-stack' };
  const cart = stoneCartLoadSpot(ctx.village, q.outcropId);
  if (cart) return { role: 'quarry-load', places: { heap: cart } };
  const { heap } = quarryPiles(q);
  return {
    role: 'quarry-stack',
    places: { heap: rimToward(heap, at, heap.r + QUARRY_STAND.stack) },
  };
}
