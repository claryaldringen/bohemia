import { fortHasWall, fortsContaining } from '../village/fortification';
import { untakenRefuges, type BattleField, type BattleState, type Fighter } from './battle';
import type {
  CampaignGroup,
  CampaignMember,
  CampaignReturnReason,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from './campaign-types';
import { approachStep, fastestApproach, passageOpen } from './npc-assault';
import { dist2, inFight, nearest, orderHeard } from './orders';
import { lootCapacity } from './raid-apply';
import { WAR } from './rules-war';
import { hoursPerTick, TICKS_PER_SECOND } from './ticks';

// NPC velitel (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.12): vede tažení, když
// velí jiný muž než hráčův, když je hráč pryč a vede zástupce, nebo když velitel padl. Rozhoduje
// jen ze stavu tažení a světa – záměry platí v taktu, ve kterém je spočítá (stejně po kouscích).
// Pochod jde nejkratší cestou po mřížce map (A* obchází les, řeky po brodech – `marchPath`), průchod
// opevněním: velitel vede skupinu k místu nejrychlejšího postupu (`npc-assault.ts`), u hradby pak
// každý muž volí postup místa sám (boj – `approach`). Jen det-math.

const SIGHT2 = WAR.sight.openM * WAR.sight.openM;
/** O kolik se smí poloha obránce posunout, než NPC velitele pošle znovu (m). */
const REGOAL_M = 10;
/** Velitel je u místa postupu přes hradbu (a odtud napadne), stojí-li do tolika metrů (m). */
const AT_APPROACH_M = 3;

/**
 * Záměry NPC velitele pro takt (pochod a nájezd; jinak žádné). Stav, svět ani bojiště nemění.
 * `field` – bojiště nájezdu s opevněním cíle (`battleFieldOf`); bez něj velitel o hradbě neví.
 */
export function npcIntents(
  state: CampaignState,
  world: CampaignWorld,
  field: BattleField | null = null,
): IntentBody[] {
  if (state.phase !== 'marching' && state.phase !== 'raiding') return [];
  const reason = turnReason(state, world);
  if (reason !== null) return [{ kind: 'turn-back', reason }];
  return state.phase === 'marching' ? marchIntents(state) : raidIntents(state, field);
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
  if (active > 0 && s.supplies.foodKg <= homeFoodKg(s, world) + 1e-9) return 'supplies';
  return null;
}

/**
 * Jídlo na cestu domů (war.md – Velení: Podrobnosti NPC velitele) – muži na nohou × denní potřeba
 * × dny cesty do shromaždiště (`daysHome`). Zbývá-li ho jen tolik, NPC velitel se obrátí; klesne-li
 * jídlo pod ně, živě vedenému tažení muži dezertují (war.md – Zásoby tažení: Živé vedení bez rozkazu).
 */
export function homeFoodKg(s: CampaignState, world: CampaignWorld): number {
  const active = s.members.filter((m) => m.status === 'active').length;
  return active * WAR.foodKgPerManDay * daysHome(s, world);
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
 * Nájezd (war.md – Velení; fortifications.md – Obrana bez násobku, NPC velitel): velitel napadá
 * skupiny domů od nejslabší v dohledu (součet sil obránců – násobek obrany zrušen 8. 11. 2026),
 * má-li vojsko aspoň 1,5 × její sílu. Stojí-li všichni obránci uvnitř obvodu opevnění, ve kterém
 * velitel není, napadne jen s nejrychlejším postupem přes hradbu nejvýš 1 herní den
 * (`fastestApproach`) – vede skupinu k místu postupu a odtud napadne; jinak vezme, co je venku
 * (`plunder`). Bez opevnění se slabší vojsko obrátí. Nevidí-li nikoho, jde k nejbližším obráncům
 * (ví, kde ves stojí). Otevře-li se průchod hradbou, pošle skupiny dovnitř (`insideOrders`).
 */
function raidIntents(s: CampaignState, field: BattleField | null): IntentBody[] {
  const b = s.battle;
  if (!b || b.outcome !== 'ongoing') return [];
  const leader = npcLeader(b);
  if (!leader) return [];
  return [...insideOrders(field, b, leader), ...leaderIntents(s, field, b, leader)];
}

/**
 * Průchod hradbou je otevřený (mezera či průlom, lezec nahoře, útočník za hradbou – `passageOpen`)
 * a obránci stojí za ní → skupiny, které velitele slyší a nemají „útočit na vše“, pošle dovnitř
 * (`set-order`; war.md – Změna rozkazu; plán hradeb, Úloha 20 – návrh Clauda). Velitel sám smí
 * zůstat u průchodu (luk), skupina venku stát nesmí.
 */
function insideOrders(field: BattleField | null, b: BattleState, leader: Fighter): IntentBody[] {
  if (!field) return [];
  const groups = b.groups.filter(
    (g) =>
      g.side === 'attack' &&
      !g.broken &&
      g.order !== 'attack-all' &&
      b.fighters.some(
        (f) => f.side === 'attack' && f.group === g.id && f.id !== leader.id && inFight(f),
      ) &&
      orderHeard(b, g.id),
  );
  if (groups.length === 0) return [];
  const forts = field.forts.map((bf) => bf.fort).filter((f) => fortHasWall(f, field.day));
  if (forts.length === 0) return [];
  const foes = b.fighters.filter((f) => f.side === 'defend' && inFight(f));
  const inside = fortsContaining(
    field.geo,
    forts,
    foes.map((f) => f.pos),
  ).some((fort) => fort !== null);
  if (!inside || !passageOpen(field, b)) return [];
  return groups.map((g) => ({ kind: 'set-order', group: g.id, order: 'attack-all' }));
}

/** Záměry velitele samého: koho napadnout, kam jít, nebo vzít, co je venku, či se obrátit. */
function leaderIntents(
  s: CampaignState,
  field: BattleField | null,
  b: BattleState,
  leader: Fighter,
): IntentBody[] {
  const chosen =
    leader.chosen === null ? undefined : b.fighters.find((f) => f.id === leader.chosen);
  if (chosen && chosen.side === 'defend' && inFight(chosen)) return [];
  const army = b.fighters.filter((f) => f.side === 'attack' && inFight(f));
  const foes = b.fighters.filter((f) => f.side === 'defend' && inFight(f));
  if (foes.length === 0) return emptyRefuge(field, b, army.length, leader);
  const seen = foes.filter((d) => army.some((a) => dist2(a.pos, d.pos) <= SIGHT2));
  if (seen.length === 0) {
    const near = nearest(leader.pos, foes)!;
    const goal = leader.goal;
    if (goal && dist2(goal, near.pos) <= REGOAL_M * REGOAL_M) return [];
    return [{ kind: 'march', to: { cell: { ...s.target.cell }, pos: { ...near.pos } } }];
  }
  const power = new Map<number, number>();
  for (const f of foes) power.set(f.group, (power.get(f.group) ?? 0) + f.strength);
  let weakest: number | null = null;
  for (const g of [...new Set(seen.map((f) => f.group))].sort((x, y) => x - y)) {
    if (weakest === null || power.get(g)! < power.get(weakest)! - 1e-9) weakest = g;
  }
  const ours = army.reduce((sum, f) => sum + f.strength, 0);
  const strong = ours >= WAR.npc.attackRatio * power.get(weakest!)! - 1e-9;
  const target = nearest(
    leader.pos,
    foes.filter((f) => f.group === weakest),
  )!;
  if (!field || !behindWalls(field, leader, foes)) {
    return strong
      ? [{ kind: 'strike', target: target.id }]
      : [{ kind: 'turn-back', reason: 'order' }];
  }
  // za hradbou: napadne jen s postupem nejvýš 1 herní den, jinak vezme, co je venku
  const way = strong ? fastestApproach(field, b, army.length, leader.pos) : null;
  if (!way || way.hours > WAR.npc.maxAssaultHours + 1e-9) return [{ kind: 'plunder' }];
  if (dist2(leader.pos, way.at) <= AT_APPROACH_M * AT_APPROACH_M) {
    return [{ kind: 'strike', target: target.id }];
  }
  // k místu kolem hradby (`approachStep`); nový bod dá, až se posune o víc než 3 m
  const next = approachStep(field, leader.pos, way);
  if (leader.goal && dist2(leader.goal, next) <= AT_APPROACH_M * AT_APPROACH_M) return [];
  return [{ kind: 'march', to: { cell: { ...s.target.cell }, pos: next } }];
}

/**
 * Nikdo už nebojuje, ale útočiště je nedobyté (fortifications.md – Bod zlomu a probíjení – dobyté,
 * až je útočník uvnitř): muži jdou dovnitř sami (`battle.ts`); trvá-li nejrychlejší postup přes
 * hradbu déle než 1 herní den, velitel vezme, co je venku (`plunder`).
 */
function emptyRefuge(
  field: BattleField | null,
  b: BattleState,
  men: number,
  leader: Fighter,
): IntentBody[] {
  if (!field || untakenRefuges(field, b).length === 0) return [];
  const way = fastestApproach(field, b, men, leader.pos);
  return !way || way.hours > WAR.npc.maxAssaultHours + 1e-9 ? [{ kind: 'plunder' }] : [];
}

/**
 * Stojí všichni obránci uvnitř obvodu opevnění bojiště s aspoň jedním stojícím úsekem (v den
 * boje), ve kterém velitel není? Obvod každého opevnění se spočítá jednou.
 */
function behindWalls(field: BattleField, leader: Fighter, foes: readonly Fighter[]): boolean {
  const forts = field.forts.map((bf) => bf.fort).filter((f) => fortHasWall(f, field.day));
  if (forts.length === 0) return false;
  const [mine, ...theirs] = fortsContaining(field.geo, forts, [
    leader.pos,
    ...foes.map((f) => f.pos),
  ]);
  return theirs.every((fort) => fort !== null && fort !== undefined && fort !== mine);
}
