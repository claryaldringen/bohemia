import type { WorldClock } from '../calendar';
import type { NewVillageEvent } from '../village/inbox';
import type { PersonRef } from '../village/types';
import { directionBetween, type GridCell } from '../village/world-grid';
import type {
  CampaignGroup,
  CampaignIntent,
  CampaignLeg,
  CampaignMember,
  CampaignNotice,
  CampaignPlace,
  CampaignReturnReason,
  CampaignState,
  CampaignStep,
  CampaignVillage,
  CampaignWorld,
} from './campaign-types';
import { marchGrid, type MarchGrid } from './march-grid';
import { marchPath, marchPathToEdge, marchProgress, marchSpeed, type GroupPace } from './march';
import { WAR } from './rules-war';
import { frostDay } from './season';
import { dayOfTick, TICKS_PER_SECOND } from './ticks';
import { edgeCrossing, worldRoute } from './world-route';

// Tažení po taktech (plán 2026-11-03 – rozhodnutí 12, Úloha 6.5): čistá funkce výchozího stavu,
// seedu a záznamu záměrů s číslem taktu. Takt po taktu: denní krok (jídlo, mráz) na začátku
// nového dne, záměry taktu podle `seq`, pak fáze (pochod, nájezd, návrat). Výsledek nezávisí na
// tom, po jakých kouscích taktů se počítá – stav je JSON a takt čte jen stav, záměry a svět.
// Jen det-math (`domain/war/**`): tažení počítá worker i web.

/** Data, bez kterých takt nejde spočítat – takt se zahodí a volající je načte. */
class MissingData {
  constructor(
    readonly cells: GridCell[],
    readonly villageIds: string[],
  ) {}
}

/** Výstup jednoho taktu – do výsledku se přidá, jen když takt doběhne. */
interface TickOut {
  events: NewVillageEvent[];
  notices: CampaignNotice[];
}

/** Mřížky pochodu jednoho volání (políčko a den) – stejný vstup, stejná mřížka. */
interface TickContext {
  world: CampaignWorld;
  grids: Map<string, MarchGrid>;
}

const cellKey = (c: GridCell): string => `${c.x},${c.y}`;
const sameCell = (a: GridCell, b: GridCell): boolean => a.x === b.x && a.y === b.y;

/** Vstup nového tažení (vyslání – Ú6.6): muži stojí ve shromaždišti, skupiny podle `member.group`. */
export interface NewCampaign {
  id: string;
  warId: string;
  seed: number;
  /** Takt vyslání – tažení se počítá od dalšího. */
  tick: number;
  playerId: string;
  leaderName: string;
  commander: PersonRef;
  deputy: PersonRef | null;
  assembly: CampaignVillage;
  target: CampaignVillage;
  members: CampaignMember[];
  foodKg: number;
  liveCommand: boolean;
}

/** Výchozí stav tažení ve shromaždišti (fáze `assembling`). */
export function newCampaign(input: NewCampaign, clock: WorldClock): CampaignState {
  const groupIds = [...new Set(input.members.map((m) => m.group))].sort((a, b) => a - b);
  const groups: CampaignGroup[] = groupIds.map((id) => ({
    id,
    order: 'follow-leader',
    cell: { ...input.assembly.cell },
    pos: { ...input.assembly.pos },
    goal: null,
    route: [],
    leg: null,
    arrived: true,
  }));
  return {
    id: input.id,
    warId: input.warId,
    seed: input.seed,
    tick: input.tick,
    day: dayOfTick(input.tick, clock),
    phase: 'assembling',
    playerId: input.playerId,
    leaderName: input.leaderName,
    commander: { ...input.commander },
    deputy: input.deputy ? { ...input.deputy } : null,
    assembly: structuredClone(input.assembly),
    target: structuredClone(input.target),
    members: structuredClone(input.members),
    groups,
    supplies: { foodKg: input.foodKg },
    loot: { foodKg: 0, herd: 0 },
    captives: [],
    liveCommand: input.liveCommand,
    discovered: [],
    returnReason: null,
  };
}

/** Skončené tažení se už nepočítá. */
export function campaignFinished(state: CampaignState): boolean {
  return state.phase === 'done';
}

/**
 * Dopočte tažení z `state` do taktu `toTick` (včetně). Záměry s taktem nejvýš `state.tick`
 * (v minulosti) a cizí záměry se zahodí; ostatní platí přesně ve svém taktu v pořadí `seq`.
 * Chybí-li mapa nebo ves (`waiting`), výsledek je stav na konci posledního celého taktu.
 * Vstupní stav ani záměry nemění.
 */
export function stepCampaign(
  state: CampaignState,
  toTick: number,
  intents: readonly CampaignIntent[],
  world: CampaignWorld,
): CampaignStep {
  const pending = intents
    .filter((i) => i.tick > state.tick && i.tick <= toTick && i.byPlayer === state.playerId)
    .sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  const ctx: TickContext = { world, grids: new Map() };
  const villageEvents: NewVillageEvent[] = [];
  const notices: CampaignNotice[] = [];
  let current = state;
  let next = 0;
  const upfront = missingMaps(state, world);
  if (upfront.length > 0) {
    return { state, villageEvents, notices, waiting: { cells: upfront, villageIds: [] } };
  }
  while (current.tick < toTick && !campaignFinished(current)) {
    const tick = current.tick + 1;
    let end = next;
    while (end < pending.length && pending[end]!.tick === tick) end++;
    const out: TickOut = { events: [], notices: [] };
    try {
      current = campaignTick(current, tick, pending.slice(next, end), ctx, out);
    } catch (error) {
      if (!(error instanceof MissingData)) throw error;
      return {
        state: current,
        villageEvents,
        notices,
        waiting: { cells: error.cells, villageIds: error.villageIds },
      };
    }
    next = end;
    villageEvents.push(...out.events);
    notices.push(...out.notices);
  }
  return { state: current, villageEvents, notices, waiting: null };
}

/** Mapy, které tažení potřebuje hned: políčka skupin a další políčka jejich tras. */
function missingMaps(state: CampaignState, world: CampaignWorld): GridCell[] {
  const missing = new Map<string, GridCell>();
  for (const g of state.groups) {
    for (const cell of [g.cell, ...g.route.slice(0, 1)]) {
      if (!missing.has(cellKey(cell)) && world.landscapeOf(cell) === null) {
        missing.set(cellKey(cell), { ...cell });
      }
    }
  }
  return [...missing.values()];
}

/** Jeden takt – na kopii stavu (když chybí data, kopie se zahodí). */
function campaignTick(
  state: CampaignState,
  tick: number,
  intents: readonly CampaignIntent[],
  ctx: TickContext,
  out: TickOut,
): CampaignState {
  const s = structuredClone(state);
  s.tick = tick;
  const day = dayOfTick(tick, ctx.world.clock);
  while (s.day < day) {
    s.day++;
    dailyStep(s);
  }
  for (const intent of intents) applyIntent(s, intent, out);
  switch (s.phase) {
    case 'assembling':
    case 'done':
      break;
    case 'marching':
      moveGroups(s, ctx);
      if (allArrived(s) && s.groups.some((g) => sameCell(g.cell, s.target.cell))) {
        s.phase = 'raiding';
      }
      break;
    case 'raiding':
      raidTick(s);
      break;
    case 'returning':
    case 'disbanded':
      moveGroups(s, ctx);
      if (allArrived(s)) finish(s, out);
      break;
  }
  return s;
}

/**
 * Denní krok na začátku herního dne `s.day` (war.md – Pohyb – Zásoby, Zima): mráz venku (ve
 * shromaždišti se muži zotaví) a jídlo – 1 kg na muže a den. Když jídlo dojde na pochodu,
 * vojsko se obrátí domů (Martin 2. 11. 2026).
 */
function dailyStep(s: CampaignState): void {
  const outside = s.phase !== 'assembling' && s.phase !== 'done';
  const active = s.members.filter((m) => m.status === 'active');
  for (const m of active) {
    const delta = frostDay(m, outside, s.day);
    m.health += delta.health;
    m.vigor += delta.vigor;
  }
  if (!outside) return;
  const need = active.length * WAR.foodKgPerManDay;
  const eaten = Math.min(need, s.supplies.foodKg);
  s.supplies.foodKg -= eaten;
  if (eaten < need && s.phase === 'marching') turnBack(s, 'supplies');
}

/** Záměr taktu – co ve fázi nedává smysl, se zahodí. */
function applyIntent(s: CampaignState, intent: CampaignIntent, out: TickOut): void {
  const body = intent.body;
  switch (body.kind) {
    case 'set-out':
      if (s.phase !== 'assembling') return;
      s.phase = 'marching';
      for (const g of s.groups) sendGroup(g, s.target);
      chronicle(s, out, s.assembly.villageId, 'set-out');
      return;
    case 'march':
      if (s.phase !== 'marching' || !s.liveCommand) return;
      for (const g of s.groups) sendGroup(g, body.to);
      return;
    case 'turn-back':
      if (s.phase === 'marching' || s.phase === 'raiding') turnBack(s, 'order');
      return;
  }
}

/** Skupina vyrazí k místu `to` – trasa po mřížce světa, úsek mapy se spočte při pohybu. */
function sendGroup(g: CampaignGroup, to: CampaignPlace): void {
  g.goal = { cell: { ...to.cell }, pos: { ...to.pos } };
  g.route = worldRoute(g.cell, to.cell, () => false).slice(1);
  g.leg = null;
  g.arrived = false;
}

/** Obrat domů ke shromaždišti (rozpad po hloučcích do domovských vsí doplní Ú6.12). */
function turnBack(s: CampaignState, reason: CampaignReturnReason): void {
  s.phase = 'returning';
  s.returnReason = reason;
  for (const g of s.groups) sendGroup(g, s.assembly);
}

/**
 * Takt na mapě cíle. Úloha 6.5 boj nemá – vojsko se po příchodu obrátí. Sem se zapojí boj
 * (`battleTick` – Ú6.8), obránci a útěk (Ú6.9), kořist (Ú6.10) a vzdaní (Ú6.11).
 */
function raidTick(s: CampaignState): void {
  turnBack(s, 'arrived');
}

/** Konec tažení: muži doma, zápis do kronik domovských vsí a upozornění vůdci. */
function finish(s: CampaignState, out: TickOut): void {
  s.phase = 'done';
  const homes = [...new Set(s.members.map((m) => m.ref.villageId))];
  for (const villageId of homes) chronicle(s, out, villageId, 'returned');
  out.notices.push({
    playerId: s.playerId,
    kind: 'campaign-returned',
    payload: { campaignId: s.id, reason: s.returnReason },
    gameDay: s.day,
  });
}

/**
 * Zápis do kroniky vsi přes schránku – na následující den (ves může mít dnešek spočítaný; výsledky
 * tažení jdou do vsi vždy den nato – rozhodnutí 13). `ref` je jedinečný: takt a pořadí v něm.
 */
function chronicle(
  s: CampaignState,
  out: TickOut,
  villageId: string,
  step: 'set-out' | 'returned',
): void {
  const day = s.day + 1;
  out.events.push({
    villageId,
    day,
    ref: `camp:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'chronicle', event: { day, kind: 'campaign', step, leader: s.leaderName } },
  });
}

function allArrived(s: CampaignState): boolean {
  return s.groups.every((g) => g.arrived);
}

/** Složení skupiny pro tempo; stádo kořisti jde se skupinou velitele (návrh Clauda). */
function paceOf(s: CampaignState, g: CampaignGroup): GroupPace {
  const pace: GroupPace = { onFoot: 0, riders: 0, woundedOnFoot: 0, herd: 0 };
  for (const m of s.members) {
    if (m.group !== g.id || m.status !== 'active') continue;
    if (m.mounted) pace.riders++;
    else if (m.wounded) pace.woundedOnFoot++;
    else pace.onFoot++;
  }
  const commander = s.members.find(
    (m) => m.ref.villageId === s.commander.villageId && m.ref.personId === s.commander.personId,
  );
  const herdGroup = commander?.group ?? s.groups[0]?.id;
  if (g.id === herdGroup) pace.herd = s.loot.herd;
  return pace;
}

/**
 * Pohyb skupin o jeden takt: metry louky tempem skupiny (`marchSpeed` ÷ takty za sekundu) po
 * úseku mapy. Konec úseku na okraji = přechod na sousední mapu (zbytek taktu se nevyužije), konec
 * úseku v cíli = skupina stojí. Skupina bez mužů, nebo která nemá kudy, stojí.
 */
function moveGroups(s: CampaignState, ctx: TickContext): void {
  for (const g of s.groups) {
    if (g.arrived || g.goal === null) continue;
    const pace = paceOf(s, g);
    if (pace.onFoot + pace.riders + pace.woundedOnFoot === 0) {
      g.arrived = true;
      continue;
    }
    if (g.leg === null) {
      g.leg = planLeg(g, s.day, ctx);
      if (g.leg === null) {
        g.arrived = true;
        continue;
      }
    }
    const leg = g.leg;
    const end = leg.meadowM[leg.meadowM.length - 1]!;
    const walked = leg.walkedM + marchSpeed(pace, s.day) / TICKS_PER_SECOND;
    if (walked < end) {
      leg.walkedM = walked;
      g.pos = marchProgress(leg, walked);
      continue;
    }
    g.pos = { ...leg.points[leg.points.length - 1]! };
    g.leg = null;
    const nextCell = g.route.shift();
    if (nextCell === undefined) {
      g.arrived = true;
      continue;
    }
    g.pos = edgeCrossing(g.cell, nextCell, g.pos);
    g.cell = nextCell;
  }
}

/** Úsek po mapě skupiny: k okraji ve směru dalšího políčka trasy, nebo k cíli; null = nemá kudy. */
function planLeg(g: CampaignGroup, day: number, ctx: TickContext): CampaignLeg | null {
  const grid = gridOf(g.cell, day, ctx);
  const nextCell = g.route[0];
  let path;
  if (nextCell !== undefined) {
    const direction = directionBetween(g.cell, nextCell);
    path = direction === null ? null : marchPathToEdge(grid, g.pos, direction);
  } else {
    path = g.goal ? marchPath(grid, g.pos, g.goal.pos) : null;
  }
  return path ? { points: path.points, meadowM: path.meadowM, walkedM: 0 } : null;
}

/** Mřížka pochodu mapy políčka v den `day` – krajina, překážky a první ves na mapě. */
function gridOf(cell: GridCell, day: number, ctx: TickContext): MarchGrid {
  const key = `${cellKey(cell)}@${day}`;
  const cached = ctx.grids.get(key);
  if (cached) return cached;
  const map = ctx.world.landscapeOf(cell);
  if (map === null) throw new MissingData([{ ...cell }], []);
  const villageId = map.villageIds[0];
  let village = null;
  if (villageId !== undefined) {
    village = ctx.world.villageAt(villageId, day);
    if (village === null) throw new MissingData([], [villageId]);
  }
  const grid = marchGrid(map.landscape, map.obstacles, village, { day });
  ctx.grids.set(key, grid);
  return grid;
}
