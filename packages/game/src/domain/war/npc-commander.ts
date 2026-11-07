import { defenderMultiplier } from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import type { BattleState, Fighter } from './battle';
import type {
  CampaignGroup,
  CampaignMember,
  CampaignReturnReason,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from './campaign-types';
import type { Pos } from './march-grid';
import { dist2, inFight, nearest } from './orders';
import { lootCapacity } from './raid-apply';
import { WAR } from './rules-war';
import { hoursPerTick, TICKS_PER_SECOND } from './ticks';

// NPC velitel (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.12): vede tažení, když
// velí jiný muž než hráčův, když je hráč pryč a vede zástupce, nebo když velitel padl. Rozhoduje
// jen ze stavu tažení a světa – záměry platí v taktu, ve kterém je spočítá (stejně po kouscích).
// Pochod jde nejkratší cestou po mřížce map (A* obchází les, řeky po brodech – `marchPath`), průchod
// opevněním volí boj (mezera, jinak místo s nejkratším prolomením – `approach`). Jen det-math.

const SIGHT2 = WAR.sight.openM * WAR.sight.openM;
/** O kolik se smí poloha obránce posunout, než NPC velitele pošle znovu (m). */
const REGOAL_M = 10;

/** Záměry NPC velitele pro takt (pochod a nájezd; jinak žádné). Stav ani svět nemění. */
export function npcIntents(state: CampaignState, world: CampaignWorld): IntentBody[] {
  if (state.phase !== 'marching' && state.phase !== 'raiding') return [];
  const reason = turnReason(state, world);
  if (reason !== null) return [{ kind: 'turn-back', reason }];
  return state.phase === 'marching' ? marchIntents(state) : raidIntents(state, world);
}

/**
 * Bojovník, kterého NPC velitel v boji řídí: velitel, dokud bojuje (i prolamuje), jinak zástupce;
 * nikdo – null.
 */
export function npcLeader(b: BattleState): Fighter | null {
  for (const id of [b.commander, b.deputy]) {
    const f = id === null ? undefined : b.fighters.find((x) => x.id === id);
    if (f && inFight(f)) return f;
  }
  return null;
}

/** Muž, který velí: velitel, dokud je ve vojsku, jinak zástupce; nikdo – null. */
export function actingLeader(s: CampaignState): CampaignMember | null {
  for (const ref of [s.commander, s.deputy]) {
    if (ref === null) continue;
    const m = s.members.find(
      (x) => x.ref.villageId === ref.villageId && x.ref.personId === ref.personId,
    );
    if (m?.status === 'active') return m;
  }
  return null;
}

/**
 * Proč se NPC velitel obrátí (war.md – Velení): bod zlomu jeho skupiny, padlá, zajatá nebo uprchlá
 * polovina vojska, plná nosnost, jídlo jen na cestu domů; jinak null.
 */
function turnReason(s: CampaignState, world: CampaignWorld): CampaignReturnReason | null {
  const b = s.battle?.outcome === 'ongoing' ? s.battle : null;
  const lead = actingLeader(s);
  if (b && lead) {
    const own = b.groups.find((g) => g.side === 'attack' && g.id === lead.group);
    if (own?.broken) return 'routed';
  }
  const fled = new Set<number>();
  for (const f of b?.fighters ?? []) {
    if (f.side === 'attack' && (f.state === 'flee' || f.state === 'fled')) fled.add(f.ref);
  }
  let lost = 0;
  s.members.forEach((m, i) => {
    if (m.status !== 'active' || fled.has(i)) lost++;
  });
  if (s.members.length > 0 && lost >= WAR.npc.lostShare * s.members.length - 1e-9) return 'routed';
  const fit = s.members.filter((m) => m.status === 'active' && !m.wounded).length;
  if (s.loot.foodKg > 0 && s.loot.foodKg >= lootCapacity(fit, s.supplies.foodKg) - 1e-9) {
    return 'arrived';
  }
  const active = s.members.filter((m) => m.status === 'active').length;
  const home = active * WAR.foodKgPerManDay * daysHome(s, world);
  if (active > 0 && s.supplies.foodKg <= home + 1e-9) return 'supplies';
  return null;
}

/** Skupina velitele (jinak první s muži na nohou) – odtud se měří cesta domů. */
function leadGroup(s: CampaignState): CampaignGroup | null {
  const lead = actingLeader(s);
  const withMen = (g: CampaignGroup): boolean =>
    s.members.some((m) => m.group === g.id && m.status === 'active');
  return s.groups.find((g) => g.id === lead?.group && withMen(g)) ?? s.groups.find(withMen) ?? null;
}

/**
 * Herní dny cesty domů do shromaždiště – vzdušnou čarou tempem vojska (jako odhad cesty v přípravě
 * tažení; návrh Clauda).
 */
export function daysHome(s: CampaignState, world: CampaignWorld): number {
  const g = leadGroup(s);
  if (!g) return 0;
  const map = world.landscapeOf(g.cell) ?? world.landscapeOf(s.assembly.cell);
  const side = map ? map.landscape.size * map.landscape.cellSizeM : 0;
  const dx = (g.cell.x - s.assembly.cell.x) * side + g.pos.x - s.assembly.pos.x;
  const dz = (g.cell.y - s.assembly.cell.y) * side + g.pos.z - s.assembly.pos.z;
  const secondsPerDay = 24 / hoursPerTick(world.clock) / TICKS_PER_SECOND;
  return Math.sqrt(dx * dx + dz * dz) / WAR.pace.metersPerSecond / secondsPerDay;
}

/** Pochod: skupiny jdou k cíli podle rozkazu (hráč je mohl poslat jinam, než odešel). */
function marchIntents(s: CampaignState): IntentBody[] {
  const t = s.target;
  const astray = s.groups.some(
    (g) =>
      s.members.some((m) => m.group === g.id && m.status === 'active') &&
      (g.goal === null ||
        g.goal.cell.x !== t.cell.x ||
        g.goal.cell.y !== t.cell.y ||
        g.goal.pos.x !== t.pos.x ||
        g.goal.pos.z !== t.pos.z),
  );
  return astray ? [{ kind: 'march', to: { cell: { ...t.cell }, pos: { ...t.pos } } }] : [];
}

/**
 * Nájezd (war.md – Velení; fortifications.md – Postoje vsi s opevněním): velitel napadá skupiny domů
 * od nejslabší v dohledu (síla obránců × násobek obrany – u domu 1,5, za opevněním 1,5 × násobek
 * opevnění). Nemá-li vojsko aspoň 1,5 × sílu ani nejslabší z nich, nenapadne: stojí-li všichni
 * obránci za opevněním, vezme, co je venku (`plunder`), jinak se obrátí (návrh Clauda). Nevidí-li
 * nikoho, jde k nejbližším obráncům (ví, kde ves stojí).
 */
function raidIntents(s: CampaignState, world: CampaignWorld): IntentBody[] {
  const b = s.battle;
  if (!b || b.outcome !== 'ongoing') return [];
  const leader = npcLeader(b);
  if (!leader) return [];
  const chosen =
    leader.chosen === null ? undefined : b.fighters.find((f) => f.id === leader.chosen);
  if (chosen && chosen.side === 'defend' && inFight(chosen)) return [];
  const army = b.fighters.filter((f) => f.side === 'attack' && inFight(f));
  const foes = b.fighters.filter((f) => f.side === 'defend' && inFight(f));
  if (foes.length === 0) return [];
  const seen = foes.filter((d) => army.some((a) => dist2(a.pos, d.pos) <= SIGHT2));
  if (seen.length === 0) {
    const near = nearest(leader.pos, foes)!;
    const goal = leader.goal;
    if (goal && dist2(goal, near.pos) <= REGOAL_M * REGOAL_M) return [];
    return [{ kind: 'march', to: { cell: { ...s.target.cell }, pos: { ...near.pos } } }];
  }
  const mult = multiplierOf(s, world, leader.pos);
  const power = new Map<number, number>();
  for (const f of foes) power.set(f.group, (power.get(f.group) ?? 0) + f.strength * mult(f));
  let weakest: number | null = null;
  for (const g of [...new Set(seen.map((f) => f.group))].sort((x, y) => x - y)) {
    if (weakest === null || power.get(g)! < power.get(weakest)! - 1e-9) weakest = g;
  }
  const ours = army.reduce((sum, f) => sum + f.strength, 0);
  if (ours >= WAR.npc.attackRatio * power.get(weakest!)! - 1e-9) {
    const target = nearest(
      leader.pos,
      foes.filter((f) => f.group === weakest),
    )!;
    return [{ kind: 'strike', target: target.id }];
  }
  const home = FORTIFICATIONS.defenderKnowsPlace;
  const fortified = foes.every((f) => mult(f) > home + 1e-9);
  return fortified ? [{ kind: 'plunder' }] : [{ kind: 'turn-back', reason: 'order' }];
}

/** Násobek obrany obránce vůči veliteli (opevnění cílové vsi v den taktu; jeden výpočet na muže). */
function multiplierOf(s: CampaignState, world: CampaignWorld, from: Pos): (f: Fighter) => number {
  const map = world.landscapeOf(s.target.cell);
  const onMap = map?.villageIds.includes(s.target.villageId) === true;
  const forts = onMap ? (world.villageAt(s.target.villageId, s.day)?.fortifications ?? []) : [];
  const cache = new Map<string, number>();
  return (f) => {
    let m = cache.get(f.id);
    if (m === undefined) {
      m = map
        ? defenderMultiplier(map.landscape, forts, f.pos, from, s.day)
        : FORTIFICATIONS.defenderKnowsPlace;
      cache.set(f.id, m);
    }
    return m;
  };
}
