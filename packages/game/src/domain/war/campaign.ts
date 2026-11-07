import type { WorldClock } from '../calendar';
import type { NewVillageEvent, VillageEventBody } from '../village/inbox';
import type { Person, PersonRef, VillageState } from '../village/types';
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
import { deserters } from './desertion';
import {
  battleForts,
  battleTick,
  commandFighter,
  openBattle,
  type BattleField,
  type BattleFort,
  type BattleState,
} from './battle';
import { defenderRoster } from './defenders';
import { stanceOf } from './flight';
import { planDefense } from './stance';
import {
  lootCapacity,
  lootTotals,
  noLoot,
  raidChronicle,
  raidLoot,
  type CampaignReturn,
  type RaidResult,
} from './raid-apply';
import { marchGrid, type MarchGrid } from './march-grid';
import { marchPath, marchPathToEdge, marchProgress, marchSpeed, type GroupPace } from './march';
import { WAR } from './rules-war';
import { frostDay } from './season';
import { setGroupOrder } from './orders';
import { dayOfTick, hoursPerTick, TICKS_PER_SECOND, tickRandom } from './ticks';
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
  /** Opevnění vsi pro bojiště (ves a den). */
  forts: Map<string, BattleFort[]>;
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
  /** Přepadení bez opovědi (kronika nájezdu). */
  ambush?: boolean;
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
    ...(input.ambush ? { ambush: true as const } : {}),
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
  const ctx: TickContext = { world, grids: new Map(), forts: new Map() };
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
    dailyStep(s, out);
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
      raidTick(s, tick, ctx, out);
      break;
    case 'returning':
    case 'disbanded':
      moveGroups(s, ctx);
      if (allArrived(s)) finish(s, ctx, out);
      break;
  }
  // boj skončil (výhra, porážka, ústup) – výsledek nájezdu do vsí jednou (Ú6.10)
  reportRaid(s, ctx, out);
  return s;
}

/**
 * Denní krok na začátku herního dne `s.day` (war.md – Pohyb – Zásoby, Zima): mráz venku (ve
 * shromaždišti se muži zotaví) a jídlo – 1 kg na muže a den. Když jídlo dojde na pochodu,
 * vojsko se obrátí domů (Martin 2. 11. 2026).
 */
function dailyStep(s: CampaignState, out: TickOut): void {
  const outside = s.phase !== 'assembling' && s.phase !== 'done';
  const active = s.members.filter((m) => m.status === 'active');
  for (const m of active) {
    const delta = frostDay(m, outside, s.day);
    m.health += delta.health;
    m.vigor += delta.vigor;
  }
  if (!outside) return;
  desert(s, out);
  const need = active.length * WAR.foodKgPerManDay;
  const eaten = Math.min(need, s.supplies.foodKg);
  s.supplies.foodKg -= eaten;
  if (eaten < need && s.phase === 'marching') turnBack(s, 'supplies');
}

/**
 * Dezerce nucených (war.md – Vojsko): dezertér s příbuznými v cíli cíl varuje – ves dostane
 * signál `army-seen` dřív, než vojsko dorazí (jeden za den, ať se nezdvojí).
 */
function desert(s: CampaignState, out: TickOut): void {
  let warns = false;
  for (const m of deserters(s)) {
    m.status = 'deserted';
    warns ||= m.kin === true;
  }
  if (!warns) return;
  const day = s.day + 1;
  out.events.push({
    villageId: s.target.villageId,
    day,
    ref: `camp:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'threat-signal', signal: { kind: 'army-seen', day: s.day } },
  });
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
      if (!s.liveCommand) return;
      if (s.phase === 'raiding' && s.battle && sameCell(body.to.cell, s.target.cell)) {
        commandFighter(s.battle, commanderFighter(s), { goal: body.to.pos });
        return;
      }
      if (s.phase !== 'marching') return;
      for (const g of s.groups) sendGroup(g, body.to);
      return;
    case 'turn-back':
      if (s.phase === 'marching' || s.phase === 'raiding') turnBack(s, 'order');
      return;
    case 'set-order':
      if (s.phase === 'done' || s.phase === 'disbanded') return;
      setGroupOrder(s, body.group, body.order, body.at ?? null);
      return;
    case 'strike':
      if (s.phase === 'raiding' && s.battle && s.liveCommand) {
        commandFighter(s.battle, commanderFighter(s), { strike: body.target });
      }
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
  if (s.phase === 'raiding') leaveBattle(s);
  s.phase = 'returning';
  s.returnReason = reason;
  for (const g of s.groups) sendGroup(g, s.assembly);
}

/**
 * Takt na mapě cíle – boj muž po muži (war.md – Boj; Ú6.8). První takt postaví bojiště: obránce
 * vsi ve výchozím postoji u domů (`defenderRoster`; postoje, včasný útěk a skryté jámy – Ú6.9)
 * a muže tažení u jejich skupin; každý takt pak `battleTick` s náhodou taktu.
 * Konec boje: útočníci drží bojiště → kořist a škody ve vsi (Ú6.10), zajetí raněných mužů rodu
 * a vzdaných (Ú6.11), pak domů; útočníci poraženi → domů (rozpad po hloučcích, prchající domů
 * a rozhodnutí NPC velitele – Ú6.12; raněné na bojišti zajme obránce – Ú6.11).
 */
function raidTick(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  // vlastní vojska a vojska pána a vazalů jsou neškodná – nikdo neútočí ani neutíká
  if (!s.battle && ctx.world.harmless?.(s.target.villageId, s.playerId)) {
    turnBack(s, 'arrived');
    return;
  }
  const field = battleFieldOf(s, ctx);
  if (!s.battle) {
    s.battle = campaignBattle(s, ctx, field);
    // přítomný hráč se dozví, že u vsi stojí cizí vojsko (war.md – Obránci: Přítomný hráč)
    const watcher = ctx.world.watcherOf?.(s.target.villageId);
    if (watcher && watcher.playerId !== s.playerId) {
      out.notices.push({
        playerId: watcher.playerId,
        kind: 'foreign-army',
        payload: { villageId: s.target.villageId, name: watcher.name },
        gameDay: s.day,
      });
    }
  }
  battleTick(s.battle, field, tickRandom(s.seed, tick, 'battle'));
  const fallenBefore = new Set(s.members.flatMap((m, i) => (m.status === 'fallen' ? [i] : [])));
  syncMembers(s, s.battle);
  // padlý muž rodu – smrt a nástupnictví ve vsi hned (war.md – Ztráty), ne až po návratu
  s.members.forEach((m, i) => {
    if (m.line && m.status === 'fallen' && !fallenBefore.has(i)) {
      post(s, out, m.ref.villageId, {
        kind: 'line-man-fell',
        personId: m.ref.personId,
        campaignId: s.id,
      });
    }
  });
  // padlí, ranění, odvedení, kořist a průlomy jdou do vsí jako vnější události (rozhodnutí 13 –
  // `reportRaid` na konci taktu)
  if (s.battle.outcome === 'attackers') turnBack(s, 'arrived');
  else if (s.battle.outcome === 'defenders') turnBack(s, 'routed');
}

/** Id bojovníka velitele tažení (pokyny hráče v boji). */
function commanderFighter(s: CampaignState): string {
  const i = s.members.findIndex((m) => sameRef(m.ref, s.commander));
  return `a:${i}`;
}

const sameRef = (a: PersonRef, b: PersonRef): boolean =>
  a.villageId === b.villageId && a.personId === b.personId;

/** Bojiště v den `s.day`: mřížka mapy cíle a opevnění cílové vsi. */
function battleFieldOf(s: CampaignState, ctx: TickContext): BattleField {
  const grid = gridOf(s.target.cell, s.day, ctx);
  const map = ctx.world.landscapeOf(s.target.cell);
  if (map === null) throw new MissingData([{ ...s.target.cell }], []);
  const key = `${s.target.villageId}@${s.day}`;
  let forts = ctx.forts.get(key);
  if (!forts && !map.villageIds.includes(s.target.villageId)) forts = [];
  if (!forts) {
    const village = ctx.world.villageAt(s.target.villageId, s.day);
    if (village === null) throw new MissingData([], [s.target.villageId]);
    forts = battleForts(map.landscape, village.fortifications ?? []);
    ctx.forts.set(key, forts);
  }
  return {
    grid,
    geo: map.landscape,
    forts,
    day: s.day,
    hoursPerTick: hoursPerTick(ctx.world.clock),
  };
}

/** Výchozí boj: muži tažení na mapě cíle, kteří stojí na nohou, a obránci vsi. */
function campaignBattle(s: CampaignState, ctx: TickContext, field: BattleField): BattleState {
  // ves na mapě cíle už není (zanikla, odešla) – nikdo nebrání
  const onMap = ctx.world.landscapeOf(s.target.cell)?.villageIds.includes(s.target.villageId);
  const village = onMap ? ctx.world.villageAt(s.target.villageId, s.day) : null;
  if (onMap && village === null) throw new MissingData([], [s.target.villageId]);
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  const attackers = s.members.flatMap((m, member) => {
    const g = groups.get(m.group);
    if (m.status !== 'active' || m.wounded || !g || !sameCell(g.cell, s.target.cell)) return [];
    return [{ member, group: m.group, m, g }];
  });
  // šik po skupinách – pět v řadě po 2 m, ať muži nestojí v jednom bodě
  const rank = new Map<number, number>();
  const fighters = attackers.map(({ member, group, m, g }) => {
    const k = rank.get(group) ?? 0;
    rank.set(group, k + 1);
    return {
      member,
      group,
      line: m.line,
      mounted: m.mounted,
      strength: m.strength * m.vigor,
      health: m.health,
      pos: { x: g.pos.x + ((k % 5) - 2) * 2, z: g.pos.z + Math.floor(k / 5) * 2 },
    };
  });
  // Ú6.10 / aplikace: muži rodu v jiných vsích hráče (`lineMenElsewhere`) – zatím jen tato ves.
  // Ves se podle postoje rozdělí dřív, než dojde na boj (útěk, útočiště, vzdání – Ú6.9).
  const plan = village
    ? planDefense({
        state: village,
        day: s.day,
        stance: stanceOf(village),
        defenders: defenderRoster(village, s.day),
        attackers: fighters.map((a) => ({ pos: a.pos, mounted: a.mounted })),
        field,
      })
    : null;
  return openBattle({
    attackers: fighters,
    ...(plan ? { shelter: plan.shelter } : {}),
    defenders: plan ? plan.fighters : [],
    groups: s.groups.map((g) => ({ id: g.id, order: g.order, holdAt: g.holdAt ?? null })),
    commander: indexOf(s, s.commander),
    deputy: s.deputy ? indexOf(s, s.deputy) : null,
    liveCommand: s.liveCommand,
  });
}

function indexOf(s: CampaignState, ref: PersonRef): number | null {
  const i = s.members.findIndex((m) => sameRef(m.ref, ref));
  return i < 0 ? null : i;
}

/** Zdraví a ztráty mužů tažení z boje: padlý `fallen`, raněný `wounded` (zpomalí návrat). */
function syncMembers(s: CampaignState, b: BattleState): void {
  for (const f of b.fighters) {
    const m = f.side === 'attack' ? s.members[f.ref] : undefined;
    if (!m || m.status !== 'active') continue;
    m.health = f.health;
    if (f.state !== 'down') continue;
    if (f.killed) m.status = 'fallen';
    else {
      m.wounded = true;
      m.woundedDay ??= s.day;
    }
  }
}

/**
 * Konec boje pro tažení: skupiny se sejdou tam, kde stojí jejich muži (velitel, jinak první
 * na nohou), a jdou odtud. Ustoupí-li velitel, jeho muži spořádaně s ním (war.md – Boj).
 */
function leaveBattle(s: CampaignState): void {
  const b = s.battle;
  if (!b) return;
  if (b.outcome === 'ongoing') b.outcome = 'withdrawn';
  syncMembers(s, b);
  const lead = b.fighters.find((f) => f.id === b.commander && f.state !== 'down');
  for (const g of s.groups) {
    const men = b.fighters.filter(
      (f) => f.side === 'attack' && f.group === g.id && f.state !== 'down',
    );
    const at = men.find((f) => f.id === lead?.id) ?? men[0];
    if (at) g.pos = { ...at.pos };
  }
}

/**
 * Konec tažení: muži doma (`campaign-return` – kořist a odvedení do vsi shromaždiště), zápis do
 * kronik domovských vsí a upozornění vůdci.
 */
function finish(s: CampaignState, ctx: TickContext, out: TickOut): void {
  reportRaid(s, ctx, out);
  s.phase = 'done';
  const homes = [...new Set(s.members.map((m) => m.ref.villageId))];
  const spoils = s.loot.detail !== undefined || (s.loot.people?.length ?? 0) > 0;
  if (spoils && !homes.includes(s.assembly.villageId)) homes.push(s.assembly.villageId);
  for (const villageId of homes) {
    post(s, out, villageId, { kind: 'campaign-return', result: returnOf(s, villageId) });
    chronicle(s, out, villageId, 'returned');
  }
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
  post(s, out, villageId, {
    kind: 'chronicle',
    event: { day, kind: 'campaign', step, leader: s.leaderName },
  });
}

/** Událost do schránky vsi na následující den (rozhodnutí 13); `ref` = takt a pořadí v něm. */
function post(s: CampaignState, out: TickOut, villageId: string, body: VillageEventBody): void {
  out.events.push({
    villageId,
    day: s.day + 1,
    ref: `camp:${s.id}:${s.tick}:${out.events.length}`,
    body,
  });
}

/** Návrat do vsi `villageId`: její muži zpět (ne zajatí), ranění, padlí vesničané, kořist. */
function returnOf(s: CampaignState, villageId: string): CampaignReturn {
  const mine = s.members.filter((m) => m.ref.villageId === villageId);
  const home = villageId === s.assembly.villageId;
  return {
    campaignId: s.id,
    back: mine
      .filter((m) => m.status === 'active' || m.status === 'deserted')
      .map((m) => m.ref.personId),
    wounded: mine
      .filter((m) => m.status === 'active' && m.wounded)
      .map((m) => ({ personId: m.ref.personId, day: m.woundedDay ?? s.day })),
    fallen: mine.filter((m) => m.status === 'fallen' && !m.line).map((m) => m.ref.personId),
    ...(home && s.loot.detail ? { loot: structuredClone(s.loot.detail) } : {}),
    ...(home && s.loot.people?.length ? { people: structuredClone(s.loot.people) } : {}),
  };
}

/**
 * Výsledek nájezdu (war.md – Ztráty, Kořist; Ú6.10) – jednou, když boj skončí: padlí a ranění
 * obránci; drží-li útočníci bojiště, i odvedení (vzdaní – rozkaz `surrendered`, výchozí odvést;
 * muže rodu a šlechtice zajme až Ú6.11) a kořist do nosnosti. Napadená ves dostane `raid-result`
 * a průlomy opevnění, ves shromaždiště zápis do kroniky; kořist a odvedení jdou s vojskem.
 */
function reportRaid(s: CampaignState, ctx: TickContext, out: TickOut): void {
  const b = s.battle;
  if (!b || b.outcome === 'ongoing' || s.raidDay !== undefined) return;
  const map = ctx.world.landscapeOf(s.target.cell);
  if (map === null) throw new MissingData([{ ...s.target.cell }], []);
  let village: VillageState | null = null;
  if (map.villageIds.includes(s.target.villageId)) {
    village = ctx.world.villageAt(s.target.villageId, s.day);
    if (village === null) throw new MissingData([], [s.target.villageId]);
  }
  s.raidDay = s.day;
  if (village === null) return;
  const result = raidResultOf(s, b, village, ctx);
  post(s, out, s.target.villageId, { kind: 'raid-result', result });
  for (const [fortificationId, segments] of breachesOf(b, village)) {
    post(s, out, s.target.villageId, { kind: 'fortification-breach', fortificationId, segments });
  }
  const counts = {
    fallen: result.fallen.length,
    wounded: result.wounded.length,
    led: result.led.length,
    loot: result.loot,
  };
  post(s, out, s.assembly.villageId, {
    kind: 'chronicle',
    event: raidChronicle(s.day + 1, result, counts),
  });
  const totals = lootTotals(result.loot);
  s.loot = {
    foodKg: s.loot.foodKg + totals.foodKg,
    herd: s.loot.herd + totals.herd,
    detail: structuredClone(result.loot),
    ...(result.led.length > 0 ? { people: ledPeople(village, result.led) } : {}),
  };
  for (const personId of result.led) s.captives.push({ villageId: s.target.villageId, personId });
}

/** Padlí, ranění, odvedení a kořist z boje a stavu napadené vsi v den konce boje. */
function raidResultOf(
  s: CampaignState,
  b: BattleState,
  village: VillageState,
  ctx: TickContext,
): RaidResult {
  const fallen: number[] = [];
  const wounded: number[] = [];
  for (const f of b.fighters) {
    if (f.side !== 'defend' || f.state !== 'down') continue;
    (f.killed ? fallen : wounded).push(f.ref);
  }
  const won = b.outcome === 'attackers';
  const led: number[] = [];
  const shelter = b.shelter;
  if (won && shelter) {
    const order = s.surrendered ?? 'lead';
    const people = new Map(village.people.map((p) => [p.id, p]));
    for (const id of shelter.surrendered) {
      const p = people.get(id);
      // muže rodu a šlechtice zajme Ú6.11 – zatím zůstanou doma
      if (!p || p.line || p.noble) continue;
      if (order === 'lead') led.push(id);
      else if (order === 'kill') fallen.push(id);
    }
  }
  const base = {
    campaignId: s.id,
    leader: s.leaderName,
    ...(s.assembly.name === undefined ? {} : { from: s.assembly.name }),
    ...(s.target.name === undefined ? {} : { target: s.target.name }),
    declared: s.ambush !== true,
    fallen: fallen.sort((x, y) => x - y),
    wounded: wounded.sort((x, y) => x - y),
    led: led.sort((x, y) => x - y),
  };
  if (!won) return { ...base, loot: noLoot(), pitsFound: [] };
  const refuge = new Set(shelter?.refuge ?? []);
  const surrendered = new Set(shelter?.surrendered ?? []);
  const refugeTaken = [...refuge].some(
    (id) => surrendered.has(id) || b.fighters.some((f) => f.side === 'defend' && f.ref === id),
  );
  const fit = s.members.filter((m) => m.status === 'active' && !m.wounded).length;
  const { loot, pitsFound } = raidLoot({
    village,
    day: s.day,
    shelter,
    refugeTaken,
    capacityKg: lootCapacity(fit, s.supplies.foodKg),
    seed: s.seed,
    daysInVillage: (b.ticks * hoursPerTick(ctx.world.clock)) / 24,
  });
  return { ...base, loot, pitsFound };
}

/** Prolomené úseky po opevněních vsi (id opevnění → úseky); pořadí jako `battleForts`. */
function breachesOf(b: BattleState, village: VillageState): Map<number, number[]> {
  const forts = village.fortifications ?? [];
  const byFort = new Map<number, number[]>();
  for (const br of b.breaches) {
    const fort = forts[br.fort];
    if (!br.progress.breached || !fort) continue;
    const list = byFort.get(fort.id) ?? [];
    if (!list.includes(br.segment)) list.push(br.segment);
    byFort.set(fort.id, list);
  }
  for (const list of byFort.values()) list.sort((x, y) => x - y);
  return byFort;
}

/** Snímek odvedených lidí ze stavu napadené vsi (v pořadí id). */
function ledPeople(village: VillageState, ids: readonly number[]): Person[] {
  const wanted = new Set(ids);
  return village.people
    .filter((p) => wanted.has(p.id))
    .sort((a, b) => a.id - b.id)
    .map((p) => structuredClone(p));
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
