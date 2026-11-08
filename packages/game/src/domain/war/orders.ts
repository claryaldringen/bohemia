import type { BattleGroup, BattleState, Fighter } from './battle';
import type { CampaignState, GroupAssault, GroupOrder } from './campaign-types';
import type { Pos } from './march-grid';
import { WAR } from './rules-war';

// Rozkazy skupin v boji (war.md – Boj – Skupiny, Změna rozkazu): „držet se velitele a bránit ho“,
// „útočit na vše“, „držet místo“ (≈ 30 m). Ustoupit není rozkaz – ustoupí velitel a jeho muži s ním.
// Rozkaz jde změnit před bitvou kterékoli skupině, v boji jen skupině na doslech velitele (30 m).
// Tady je i plán útočníka podle rozkazu a hráčem řízeného muže; obránce plánuje `defenders.ts`.

/** Rozkazy skupin v pořadí nabídky. */
export const GROUP_ORDERS: readonly GroupOrder[] = ['follow-leader', 'attack-all', 'hold-place'];

/** Skupina „držet se velitele“ jde za ním, když je dál než tolik metrů (návrh Clauda). */
const FOLLOW_M = 6;
/** Na místo (domov, držené místo) se muž vrací, když je od něj dál než tolik metrů. */
const RETURN_M = 2;

/** Vodítko – muž se nevzdálí od žádného z bodů víc než `radiusM`. */
export interface Leash {
  at: readonly Pos[];
  radiusM: number;
}

/** Co muž v taktu udělá: na koho útočí (k němu jde sám), jinak kam jde; vodítko pohybu. */
export interface FighterPlan {
  target: Fighter | null;
  moveTo: Pos | null;
  leash: Leash | null;
}

/** Co plán vidí z bojiště – stav na začátku taktu. */
export interface PlanContext {
  fighters: readonly Fighter[];
  byId: ReadonlyMap<string, Fighter>;
  /** Kdo útočníkům velí (`battleLeader`). */
  leader: Fighter | null;
  /** Dohlédne z `a` na `b` (150 m, v lese míň). */
  sees(a: Pos, b: Pos): boolean;
  /** Domy skupiny domů obránců. */
  houses(group: number): readonly Pos[];
}

export function dist2(a: Pos, b: Pos): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Bojuje muž (ne prchá, neleží, není pryč z bojiště)? Prolamující a ten, kdo přechází hradbu,
 * bojuje jen jako cíl (lezec nahoře i s obráncem – `ladders.ts`).
 */
export function inFight(f: Fighter): boolean {
  return f.state === 'fight' || f.state === 'breach' || f.state === 'climb';
}

/** Dosah muže – luk, nebo zblízka. */
export function reachOf(f: Fighter): number {
  return f.bow ? WAR.combat.bowMaxM : WAR.combat.meleeM;
}

/** Nejbližší z kandidátů (při shodě dřívější v poli – pevné pořadí). */
export function nearest(from: Pos, candidates: readonly Fighter[]): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = dist2(from, c.pos);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Smí `f` napadnout `e`? Protivník bojuje (i prolamující); prchající jen pro „útočit na vše“
 * (war.md – Bod zlomu: pronásledují je jen skupiny útočit na vše) a pro hráčem řízeného muže.
 */
export function canAttack(f: Fighter, e: Fighter, pursue: boolean): boolean {
  // kopáč v podkopu je pod zemí – nikdo ho nezasáhne (fortifications.md – Přechod hradby)
  if (e.side === f.side || e.underground) return false;
  return inFight(e) || (pursue && e.state === 'flee');
}

/**
 * Kdo útočníkům v boji velí: velitel tažení, dokud bojuje, jinak zástupce; jinak nikdo (NPC
 * velitel a rozpad – Ú6.12).
 */
export function battleLeader(b: BattleState, byId: ReadonlyMap<string, Fighter>): Fighter | null {
  for (const id of [b.commander, b.deputy]) {
    const f = id === null ? undefined : byId.get(id);
    if (f && f.state === 'fight') return f;
  }
  return null;
}

/** Slyší skupina velitele? Aspoň jeden její bojující muž do 30 m od velitele (war.md – Změna rozkazu). */
export function orderHeard(b: BattleState, groupId: number): boolean {
  const byId = new Map(b.fighters.map((f) => [f.id, f]));
  const leader = battleLeader(b, byId);
  if (!leader) return false;
  const r = WAR.orderHearingMeters;
  return b.fighters.some(
    (f) =>
      f.side === 'attack' && f.group === groupId && inFight(f) && dist2(f.pos, leader.pos) <= r * r,
  );
}

/** Těžiště bojujících mužů skupiny (bez nich null). */
function groupCenter(b: BattleState, groupId: number): Pos | null {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const f of b.fighters) {
    if (f.side !== 'attack' || f.group !== groupId || !inFight(f)) continue;
    x += f.pos.x;
    z += f.pos.z;
    n++;
  }
  return n === 0 ? null : { x: x / n, z: z / n };
}

/**
 * Změna rozkazu skupiny (war.md – Změna rozkazu): před bitvou kdykoli, v boji jen na doslech
 * velitele. „Držet místo“ drží `at`, bez něj místo, kde skupina stojí. Vrací, zda rozkaz platí.
 * Mění `state` na místě (volající má kopii taktu).
 */
export function setGroupOrder(
  state: CampaignState,
  groupId: number,
  order: GroupOrder,
  at: Pos | null,
): boolean {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return false;
  const battle = state.battle?.outcome === 'ongoing' ? state.battle : null;
  if (battle && !orderHeard(battle, groupId)) return false;
  const place =
    order === 'hold-place'
      ? (at ?? (battle ? groupCenter(battle, groupId) : null) ?? { ...group.pos })
      : null;
  group.order = order;
  if (place) group.holdAt = { x: place.x, z: place.z };
  else delete group.holdAt;
  const bg = battle?.groups.find((g) => g.side === 'attack' && g.id === groupId);
  if (bg) {
    bg.order = order;
    bg.holdAt = place ? { x: place.x, z: place.z } : null;
  }
  return true;
}

/**
 * Postup skupiny přes hradbu (fortifications.md – Přechod hradby; Martin 8. 11. 2026 – „ano“, volí
 * hráč rozkazem skupině): před bitvou kdykoli, v boji jen na doslech velitele jako rozkaz. `null` =
 * nejrychlejší postup místa (jako NPC). Platí pro muže, kteří ke stěně teprve dojdou. Vrací, zda
 * volba platí. Mění `state` na místě. Rozhraní – Úloha 17 plánu hradeb.
 */
export function setGroupAssault(
  state: CampaignState,
  groupId: number,
  assault: GroupAssault | null,
): boolean {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return false;
  const battle = state.battle?.outcome === 'ongoing' ? state.battle : null;
  if (battle && !orderHeard(battle, groupId)) return false;
  if (assault) group.assault = assault;
  else delete group.assault;
  const bg = battle?.groups.find((g) => g.side === 'attack' && g.id === groupId);
  if (bg) {
    if (assault) bg.assault = assault;
    else delete bg.assault;
  }
  return true;
}

/**
 * Hráčem řízený muž (war.md – Boj: hráč živě řídí jen svého muže): napadne, koho určil, jinak jde,
 * kam ho poslal, a brání se tomu, kdo na něj útočí a je na dosah – sám nikoho nehoní.
 */
export function controlledPlan(f: Fighter, ctx: PlanContext): FighterPlan {
  const chosen = f.chosen === null ? undefined : ctx.byId.get(f.chosen);
  if (chosen && canAttack(f, chosen, true)) return { target: chosen, moveTo: null, leash: null };
  const reach = reachOf(f);
  const threats = ctx.fighters.filter(
    (e) => canAttack(f, e, false) && e.aim === f.id && dist2(f.pos, e.pos) <= reach * reach,
  );
  const threat = nearest(f.pos, threats);
  if (threat) return { target: threat, moveTo: null, leash: null };
  return { target: null, moveTo: f.goal, leash: null };
}

/** „Útočit na vše“: nejbližší viditelný protivník i prchající; nikoho nevidí – projdou ves. */
function attackAll(f: Fighter, ctx: PlanContext): FighterPlan {
  const foes = ctx.fighters.filter((e) => canAttack(f, e, true));
  const seen = foes.filter((e) => ctx.sees(f.pos, e.pos));
  return { target: nearest(f.pos, seen.length > 0 ? seen : foes), moveTo: null, leash: null };
}

/**
 * Plán útočníka podle rozkazu skupiny (war.md – Boj – Skupiny). Bez velitele „držet se velitele“
 * napadá jako „útočit na vše“ a NPC velitel (bez živého vedení) taky – jeho rozhodování doplní
 * Ú6.12.
 */
export function attackerPlan(f: Fighter, group: BattleGroup, ctx: PlanContext): FighterPlan {
  if (f.controlled) return controlledPlan(f, ctx);
  const leader = ctx.leader;
  let order = group.order ?? 'attack-all';
  if (order === 'follow-leader' && (!leader || leader.id === f.id)) order = 'attack-all';
  if (leader && leader.id === f.id) order = 'attack-all';
  switch (order) {
    case 'attack-all':
      return attackAll(f, ctx);
    case 'follow-leader': {
      const guard = leader!;
      const threats = ctx.fighters.filter(
        (e) =>
          canAttack(f, e, false) &&
          (e.aim === guard.id || e.aim === f.id) &&
          ctx.sees(f.pos, e.pos),
      );
      const threat = nearest(f.pos, threats);
      if (threat) return { target: threat, moveTo: null, leash: null };
      const far = dist2(f.pos, guard.pos) > FOLLOW_M * FOLLOW_M;
      return { target: null, moveTo: far ? { ...guard.pos } : null, leash: null };
    }
    case 'hold-place': {
      // nepřítel u místa (na dosah zblízka od jeho okraje), lukem i kdo je na dostřel odsud
      const at = group.holdAt ?? f.home;
      const hold = WAR.holdPlaceM;
      const zone = hold + WAR.combat.meleeM;
      const bow = WAR.combat.bowMaxM * WAR.combat.bowMaxM;
      const foes = ctx.fighters.filter(
        (e) =>
          canAttack(f, e, false) &&
          ctx.sees(f.pos, e.pos) &&
          (dist2(at, e.pos) <= zone * zone || (f.bow && dist2(f.pos, e.pos) <= bow)),
      );
      const leash: Leash = { at: [at], radiusM: hold };
      const foe = nearest(f.pos, foes);
      if (foe) return { target: foe, moveTo: null, leash };
      const away = dist2(f.pos, at) > RETURN_M * RETURN_M;
      return { target: null, moveTo: away ? { ...at } : null, leash };
    }
  }
}

/** Návrat domů / na místo, když je muž dál než pár metrů. */
export function returnTo(f: Fighter, at: Pos): Pos | null {
  return dist2(f.pos, at) > RETURN_M * RETURN_M ? { ...at } : null;
}
