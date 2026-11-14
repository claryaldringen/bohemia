import type { WorldClock } from '../calendar';
import { cloneData } from '../village/core/clone';
import type { NewVillageEvent } from '../village/core/inbox';
import { sameCell, type GridCell } from '../village/people/world-grid';
import {
  cellKey,
  gatherMissing,
  gridOf,
  MissingData,
  tickContext,
  type TickContext,
  type TickOut,
  stampNotices,
} from './campaign-tick';
import type { CampaignNotice, CampaignVillage, CampaignWorld } from './campaign-types';
import {
  applyCommand,
  mergeGroups,
  orderParty,
  partyLeader,
  recruitMember,
  samePlace,
  shareKnowledge,
  turnHome,
} from './journey-parties';
import type {
  JourneyGroup,
  JourneyIntent,
  JourneyOrder,
  JourneyParty,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
  LegacyJourneyState,
} from './journey-types';
import { commandOf, upgradeJourney } from './journey-upgrade';
import { predatorDay, wildlifeOfMap } from './journey-predators';
import { marchSpeed, type GroupPace } from './march';
import { MARCH_FOREST, marchCellAt, type Pos } from './march-grid';
import { missingMaps, settleGoal, stepMover } from './movement';
import { JOURNEY } from './rules-war';
import { lookOnMap, type KnowledgeOut } from './seen';
import { dayOfTick, hoursPerTick, TICKS_PER_SECOND, tickOfMs } from './ticks';

// Výprava po taktech (expeditions.md; lord-control.md – Rozkazy, Na místě a návrat, Pohyb, Zásoby
// a zima; plán 2026-11-14 – Úloha 1): čistá funkce výchozího stavu a záznamu příkazů s číslem taktu
// jako tažení (`campaign.ts`), se kterým sdílí takty, pohyb po mapách (`movement.ts`), tempo
// (`marchSpeed`) a svět (`CampaignWorld`). Takt po taktu: kontrola lidí doma a šelmy na začátku
// nového dne, příkazy taktu podle `seq` (`applyCommand` – dělení a spojení skupin), konec čekání,
// pohyb hloučků. Proti tažení výprava neveze zásoby, nemrzne, bez hráče se nerozpadá a vsím na cestě
// nic neohlašuje – lidé jedí dál ze zásob své vsi. Výsledek nezávisí na tom, po jakých kouscích
// taktů se počítá – stav je JSON a takt čte jen stav, příkazy a svět. Jen det-math
// (`domain/war/**`): výpravu počítá worker i web.

/** Vstup nové výpravy (vyslání): skupina 0 stojí doma a případně dostane první rozkaz. */
export interface NewJourney {
  id: string;
  seed: number;
  playerId: string;
  houseId: string;
  home: CampaignVillage;
  /** Skutečný okamžik vyslání – výprava se počítá od taktu po tom, ve kterém leží. */
  startMs: number;
  /** Lidé výpravy – všichni ve skupině 0 a hloučku 0 doma. */
  recruits: JourneyRecruit[];
  /** První rozkaz (lord-control.md – Rozkazy); chybí – skupina stojí doma a čeká. */
  order?: JourneyOrder;
}

/**
 * Výchozí stav výpravy: skupina 0 s hloučkem 0 doma (`nextId` 1) a první rozkaz `order`. Rozkaz,
 * který neplatí (přes okraj na nesousední políčko), se zahodí – skupina stojí doma jako bez rozkazu
 * a po čekání výprava skončí.
 */
export function newJourney(input: NewJourney, clock: WorldClock): JourneyState {
  const tick = tickOfMs(input.startMs, clock);
  const state: JourneyState = {
    kind: 'journey',
    id: input.id,
    seed: input.seed,
    tick,
    day: dayOfTick(tick, clock),
    throughDay: dayOfTick(tick + 1, clock) - 1,
    phase: 'out',
    playerId: input.playerId,
    houseId: input.houseId,
    home: structuredClone(input.home),
    members: input.recruits.map((r) => recruitMember(r, 0)),
    groups: [
      {
        id: 0,
        party: 0,
        order: 'follow-leader',
        cell: { ...input.home.cell },
        pos: { ...input.home.pos },
        goal: null,
        route: [],
        leg: null,
        arrived: true,
      },
    ],
    parties: [{ id: 0, phase: 'out', arrivedTick: tick }],
    nextId: 1,
  };
  if (input.order) orderParty(state, state.parties[0]!, input.order, state.groups[0]!);
  return state;
}

/** Skončená výprava se už nepočítá (i starší bod). */
export function journeyFinished(state: JourneyState | LegacyJourneyState): boolean {
  return state.phase === 'done';
}

/**
 * Dopočte výpravu ze `state` do taktu `toTick` (včetně). Starší bod převede `upgradeJourney`.
 * Záměry s taktem nejvýš `state.tick` (v minulosti) a cizí záměry se zahodí; ostatní platí přesně
 * ve svém taktu v pořadí `seq` (`commandOf`, `applyCommand`). Chybí-li mapa nebo ves (`waiting`),
 * výsledek je stav na konci posledního celého taktu. Vstupní stav ani záměry nemění.
 */
export function stepJourney(
  state: JourneyState | LegacyJourneyState,
  toTick: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): JourneyStep {
  const start = upgradeJourney(state);
  const pending = intents
    .filter((i) => i.tick > start.tick && i.tick <= toTick && i.byPlayer === start.playerId)
    .sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  const ctx = tickContext(world);
  const villageEvents: NewVillageEvent[] = [];
  const notices: CampaignNotice[] = [];
  const knowledge: KnowledgeOut[] = [];
  const withKnowledge = (): { knowledge?: KnowledgeOut[] } =>
    knowledge.length > 0 ? { knowledge } : {};
  let current = start;
  let next = 0;
  const upfront = missingMaps(start, world);
  if (upfront.length > 0) {
    return { state: start, villageEvents, notices, waiting: { cells: upfront, villageIds: [] } };
  }
  while (current.tick < toTick && !journeyFinished(current)) {
    const tick = current.tick + 1;
    let end = next;
    while (end < pending.length && pending[end]!.tick === tick) end++;
    const out: TickOut = { events: [], notices: [], knowledge: [] };
    try {
      current = journeyTick(current, tick, pending.slice(next, end), ctx, out);
    } catch (error) {
      if (!(error instanceof MissingData)) throw error;
      return {
        state: current,
        villageEvents,
        notices,
        ...withKnowledge(),
        waiting: { cells: error.cells, villageIds: error.villageIds },
      };
    }
    next = end;
    villageEvents.push(...out.events);
    notices.push(...stampNotices(out.notices, `journey:${current.id}:${tick}`));
    knowledge.push(...(out.knowledge ?? []));
  }
  return { state: current, villageEvents, notices, ...withKnowledge(), waiting: null };
}

/**
 * Jeden takt – na kopii stavu (když chybí data, kopie se zahodí; `cloneData` jako u tažení). Po
 * pohybu se vsím na mapě nic neohlašuje – výprava není vojsko (lord-control.md – Soused) –, jen se
 * lidé rozhlédnou (`discover`). Znalost map (`seen`) se nekopíruje: `lookOnMap` ji na místě
 * nemění a co se změní, vrátí jako nový objekt – kopie by s délkou cesty rostla každý takt.
 */
function journeyTick(
  state: JourneyState,
  tick: number,
  intents: readonly JourneyIntent[],
  ctx: TickContext,
  out: TickOut,
): JourneyState {
  const { seen, ...rest } = state;
  const s: JourneyState = cloneData(rest);
  if (seen) s.seen = seen;
  s.tick = tick;
  const day = dayOfTick(tick, ctx.world.clock);
  s.throughDay = dayOfTick(tick + 1, ctx.world.clock) - 1;
  while (s.day < day) {
    s.day++;
    homeDay(s, ctx, out);
    if (!journeyFinished(s)) predators(s, ctx, out);
    if (journeyFinished(s)) return s;
  }
  for (const intent of intents) applyCommand(s, commandOf(intent.body), ctx, out);
  const wait = waitTicks(ctx.world.clock);
  for (const p of s.parties) {
    if (p.phase === 'out' && p.arrivedTick !== null && tick - p.arrivedTick > wait) turnHome(s, p);
  }
  moveGroups(s, ctx, out);
  return s;
}

/** Čekání na místě v taktech (`JOURNEY.waitDays` herních dní) – jako `absentTicks` u tažení. */
function waitTicks(clock: WorldClock): number {
  return Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
}

/**
 * Denní krok na začátku herního dne `s.day` – jen kontrola lidí doma (lord-control.md – Zásoby
 * a zima: žádné jídlo, mráz ani dezerce). Lidé zůstávají ve stavu domovské vsi, jedí z jejích zásob
 * a mohou tam zemřít (stáří, hlad): kdo ve stavu vsi není, je `fallen` (`afterLosses`). Domovská
 * ves, která zanikla (`villageGone`), výpravu ukončí bez událostí – není, komu je poslat; co lidé
 * věděli o mapách, kde stojí, jde rodu. Ves, která den ještě nemá spočtený, krok zastaví jako
 * u tažení (`MissingData`).
 */
function homeDay(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const home = s.home.villageId;
  const village = ctx.world.villageAt(home, s.day);
  if (village === null) {
    if (!ctx.world.villageGone?.(home)) throw new MissingData([], [home]);
    const cells = new Map(s.groups.map((g) => [cellKey(g.cell), g.cell]));
    for (const cell of cells.values()) shareKnowledge(s, cell, out);
    s.phase = 'done';
    return;
  }
  const living = new Set(village.people.map((p) => p.id));
  for (const m of s.members) {
    if (m.status === 'active' && !living.has(m.ref.personId)) m.status = 'fallen';
  }
  afterLosses(s, out);
}

/**
 * Po ztrátách (Úloha 1 – Ztráty): hlouček bez živých zmizí i s padlými – nikdo se nevrací, události
 * nejsou; co o jeho mapě výprava věděla, jde rodu (tam jeho cesta skončila). Skupina bez hloučků
 * zmizí. Skupina, ve které padl vojvoda, je `leaderless` a jde domů sama (vrací-li se už, jde dál).
 * Výprava bez skupin končí.
 */
function afterLosses(s: JourneyState, out: TickOut): void {
  const alive = new Set(s.members.filter((m) => m.status === 'active').map((m) => m.group));
  const dead = s.groups.filter((g) => !alive.has(g.id));
  // vojvoda padl sám v hloučku bez živých – hlouček zmizí, ale zbytek jeho skupiny se jinak
  // nedozví, že je bez vedení (členové jsou pryč, než se `lordFell` počítá níž)
  const orphaned = new Set(
    s.members
      .filter((m) => m.lord && m.status === 'fallen')
      .flatMap((m) => {
        const party = s.groups.find((g) => g.id === m.group)?.party;
        return party === undefined ? [] : [party];
      }),
  );
  if (dead.length > 0) {
    const shared = new Set<string>();
    for (const g of dead) {
      if (shared.has(cellKey(g.cell))) continue;
      shared.add(cellKey(g.cell));
      shareKnowledge(s, g.cell, out);
    }
    const gone = new Set(dead.map((g) => g.id));
    s.groups = s.groups.filter((g) => !gone.has(g.id));
    s.members = s.members.filter((m) => !gone.has(m.group));
    s.parties = s.parties.filter((p) => s.groups.some((g) => g.party === p.id));
  }
  const partyOfGroup = new Map(s.groups.map((g) => [g.id, g.party]));
  for (const p of s.parties) {
    if (p.leaderless) continue;
    const lordFell =
      orphaned.has(p.id) ||
      s.members.some((m) => m.lord && m.status === 'fallen' && partyOfGroup.get(m.group) === p.id);
    if (!lordFell) continue;
    p.leaderless = true;
    if (p.phase === 'out') turnHome(s, p);
  }
  if (s.parties.length === 0) s.phase = 'done';
}

/**
 * Šelmy (lord-control.md – Nebezpečí, bod 3; expeditions.md – Co platí dál; Rozhodnutí 9): stojí-li
 * hlouček na začátku dne v hustém lese (`MARCH_FOREST` pod jeho místem), losuje se (`predatorDay`
 * – jen hlouček s nejvýš `predatorGroupMax` živými, proud podle id hloučku) podle zvěře mapy
 * (`wildlifeOfMap` – stav vsi na mapě; ves čte jako `discover`, žádnou další). Zraněný dostane
 * `wounded` a `woundedDay`, zabitý je `fallen` (`afterLosses`); ves dostane `journey-casualty`.
 */
function predators(s: JourneyState, ctx: TickContext, out: TickOut): void {
  let hit = false;
  gatherMissing([...s.groups], (g) => {
    const grid = gridOf(g.cell, s.day, ctx);
    if ((grid.flags[marchCellAt(grid, g.pos)]! & MARCH_FOREST) === 0) return;
    const map = ctx.world.landscapeOf(g.cell);
    if (map === null) throw new MissingData([{ ...g.cell }], []);
    const villageId = map.villageIds[0];
    const village = villageId === undefined ? null : ctx.world.villageAt(villageId, s.day);
    if (villageId !== undefined && village === null) throw new MissingData([], [villageId]);
    const members = s.members.filter((m) => m.group === g.id);
    const hits = predatorDay({
      members,
      inForest: true,
      wildlife: wildlifeOfMap(map, village),
      seed: s.seed,
      day: s.day,
      group: g.id,
    });
    for (const h of hits) {
      const m = members[h.index]!;
      if (h.outcome === 'dead') m.status = 'fallen';
      else {
        m.wounded = true;
        m.woundedDay = s.day;
      }
      out.events.push({
        villageId: s.home.villageId,
        day: s.day,
        ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
        body: {
          kind: 'journey-casualty',
          journeyId: s.id,
          personId: m.ref.personId,
          outcome: h.outcome,
          by: h.by,
        },
      });
    }
    if (hits.length > 0) hit = true;
  });
  if (hit) afterLosses(s, out);
}

/** Složení skupiny `party` pro tempo (`marchSpeed`) – živí ze všech jejích hloučků; stádo nevede. */
function paceOf(s: JourneyState, party: number): GroupPace {
  const groups = new Set(s.groups.filter((g) => g.party === party).map((g) => g.id));
  const pace: GroupPace = { onFoot: 0, riders: 0, woundedOnFoot: 0, herd: 0 };
  for (const m of s.members) {
    if (m.status !== 'active' || !groups.has(m.group)) continue;
    if (m.mounted) pace.riders++;
    else if (m.wounded) pace.woundedOnFoot++;
    else pace.onFoot++;
  }
  return pace;
}

/**
 * Pohyb hloučků o jeden takt jako u vojska (`moveGroups` – lord-control.md, Pohyb): metry louky
 * tempem nejpomalejšího ze skupiny (`marchSpeed` ze všech živých skupiny na začátku pohybu – jen
 * jezdci × 1,5, sníh × 0,75) po úseku mapy, brány jsou v míru otevřené (mřížka pochodu je zavírá
 * jen v boji). Hlouček stojí, když dojde do cíle nebo dál nemá kudy; „Přes okraj“ (`crossing`)
 * končí vstupem na mapu cíle – hlouček stojí, kde na ni vstoupil. Hlouček skupiny, která se vrací,
 * po dojetí skončí (`finishGroup`). Po pohybu splynou hloučky téže skupiny, které stojí na
 * stejném místě se shodným cílem; skupina, jejíž hloučky všechny stojí, začne čekat (`arrivedTick`).
 * Znalost map jde rodu při přechodu okrajem (mapa, kterou hlouček opouští) a po dojetí (mapa, na
 * které stojí – po rozhlédnutí).
 */
function moveGroups(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const speeds = new Map<number, number>();
  for (const p of s.parties)
    speeds.set(p.id, marchSpeed(paceOf(s, p.id), s.day) / TICKS_PER_SECOND);
  const parties = new Map(s.parties.map((p) => [p.id, p]));
  const left: GridCell[] = [];
  const stopped: JourneyGroup[] = [];
  for (const g of [...s.groups]) {
    if (g.arrived || g.goal === null) continue;
    const party = parties.get(g.party)!;
    settleGoal(g, s.day, ctx);
    const before = g.cell;
    const step = stepMover(g, g.goal.pos, speeds.get(party.id)!, s.day, ctx);
    if (step === 'crossed') left.push(before);
    // ven vede přes okraj jen „Přes okraj“ – hlouček zastaví na mapě cíle; jinak se jde dál
    const across =
      step === 'crossed' &&
      party.phase === 'out' &&
      party.crossing === true &&
      sameCell(g.cell, g.goal.cell);
    if (step === 'moved' || (step === 'crossed' && !across)) continue;
    g.arrived = true;
    if (across) g.goal = { cell: { ...g.cell }, pos: { ...g.pos } };
    if (party.phase === 'returning') finishGroup(s, g, party, out);
    else stopped.push(g);
  }
  for (const cell of left) shareKnowledge(s, cell, out);
  for (const p of s.parties) {
    mergeGroups(s, p.id, (a, b) => a.arrived && b.arrived && samePlace(a, b) && sameGoal(a, b));
  }
  for (const p of s.parties) {
    if (p.arrivedTick === null && s.groups.every((g) => g.party !== p.id || g.arrived)) {
      p.arrivedTick = s.tick;
    }
  }
  discover(s, ctx);
  const shared = new Set<string>();
  // i hlouček, který při dojetí splynul s jiným – stojí na téže mapě
  for (const g of stopped) {
    if (shared.has(cellKey(g.cell))) continue;
    shared.add(cellKey(g.cell));
    shareKnowledge(s, g.cell, out);
  }
}

/** Shodný cíl (políčko i poloha) – hloučky, které tam oba stojí, splynou. */
function sameGoal(a: JourneyGroup, b: JourneyGroup): boolean {
  if (a.goal === null || b.goal === null) return false;
  const [p, q] = [a.goal.pos, b.goal.pos];
  return sameCell(a.goal.cell, b.goal.cell) && p.x === q.x && p.z === q.z;
}

/**
 * Objevování po pohybu (lord-control.md – Co vojvoda vidí; expeditions.md – Co platí dál): na každé
 * cizí mapě si výprava pamatuje stopu a naposled viděné stavby a opevnění (`lookOnMap`) – oči jsou
 * polohy všech hloučků na té mapě; vlastní mapu hráč zná celou – domovská mapa se neukládá. Ves na
 * mapě se čte jako při pohybu (`gridOf`, `villageAt` pro den taktu) – ves bez spočteného dne krok
 * zastaví (`MissingData`). Jiná ves na mapě (stará zanikla, novou založil nováček) – stavby staré
 * vsi k ní nepatří, zůstane jen stopa.
 */
function discover(s: JourneyState, ctx: TickContext): void {
  if (journeyFinished(s)) return;
  const maps = new Map<string, { cell: GridCell; eyes: Pos[] }>();
  for (const g of s.groups) {
    if (sameCell(g.cell, s.home.cell)) continue;
    const key = cellKey(g.cell);
    const map = maps.get(key) ?? { cell: g.cell, eyes: [] };
    map.eyes.push(g.pos);
    maps.set(key, map);
  }
  gatherMissing(maps.entries(), ([key, { cell, eyes }]) => {
    const grid = gridOf(cell, s.day, ctx);
    const villageId = ctx.world.landscapeOf(cell)?.villageIds[0];
    const village = villageId === undefined ? null : ctx.world.villageAt(villageId, s.day);
    if (villageId !== undefined && village === null) throw new MissingData([], [villageId]);
    const prev = s.seen?.[key];
    const next = lookOnMap(prev, { villageId, village, eyes, grid, day: s.day });
    if (next !== prev) s.seen = { ...s.seen, [key]: next };
  });
}

/**
 * Hlouček skupiny, která se vrací, došel domů (lord-control.md – Na místě a návrat; Úloha 1 –
 * Návrat): domovská ves dostane `away-ends` s jeho živými (`personIds`) – jsou od začátku dalšího
 * dne zase doma (schránka na následující den jako výsledky tažení; `ref` je jedinečný: takt
 * a pořadí v něm) – a hráč upozornění „Bořivoj se vrátil.“ s vůdcem hloučku (`partyLeader`). Skupina,
 * která ztratila vojvodu, upozornění nemá – vojvoda se nevrátil (návrh Clauda). Hlouček i jeho lidé
 * ze stavu zmizí, skupina bez hloučků taky; výprava bez skupin končí. Dál nemá kudy = skončí, kde
 * stojí, jako u tažení – co o té mapě věděl, jde rodu.
 */
function finishGroup(s: JourneyState, g: JourneyGroup, party: JourneyParty, out: TickOut): void {
  const living = s.members.filter((m) => m.group === g.id && m.status === 'active');
  shareKnowledge(s, g.cell, out);
  const day = s.day + 1;
  if (living.length > 0) {
    out.events.push({
      villageId: s.home.villageId,
      day,
      ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
      body: {
        kind: 'away-ends',
        refId: s.id,
        untilDay: day,
        personIds: living.map((m) => m.ref.personId),
      },
    });
  }
  const leader = partyLeader(living);
  if (leader && !party.leaderless) {
    out.notices.push({
      playerId: s.playerId,
      kind: 'journey-returned',
      payload: {
        journeyId: s.id,
        ...(leader.name === undefined ? {} : { leader: leader.name }),
        ...(leader.female ? { female: true } : {}),
      },
      gameDay: s.day,
    });
  }
  s.members = s.members.filter((m) => m.group !== g.id);
  s.groups = s.groups.filter((x) => x !== g);
  if (!s.groups.some((x) => x.party === party.id)) s.parties = s.parties.filter((p) => p !== party);
  if (s.parties.length === 0) s.phase = 'done';
}
