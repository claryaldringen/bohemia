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
import type { HuntStart } from './hunt-beaters';
import { huntTick, startHunt } from './journey-hunt';
import { finishHorseWork, loseHorses } from './journey-horses';
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
import { MARCH_FOREST, MARCH_GRID_VERSION, marchCellAt, type Pos } from './march-grid';
import { missingMaps, retraceCrossings, settleGoal, stepMover } from './movement';
import { JOURNEY } from './rules-war';
import { lookOnMap, type KnowledgeOut } from './seen';
import { dayOfTick, hoursPerTick, TICKS_PER_SECOND, tickOfMs } from './ticks';

// Výprava po taktech (expeditions.md; lord-control.md – Rozkazy, Na místě a návrat, Pohyb, Zásoby
// a zima; plán 2026-11-14 – Úloha 1): čistá funkce výchozího stavu a záznamu příkazů s číslem taktu
// jako tažení (`campaign.ts`), se kterým sdílí takty, pohyb po mapách (`movement.ts`), tempo
// (`marchSpeed`) a svět (`CampaignWorld`). Takt po taktu: kontrola lidí a koní doma a šelmy na
// začátku nového dne, konec práce s koňmi (`finishHorseWork`), příkazy taktu podle `seq`
// (`applyCommand` – dělení a spojení skupin, Osedlat, Sesednout, lov), konec čekání, lov vsi
// (`huntTick` – plán 2026-11-22-hunting, Úloha 6), pohyb hloučků. Výprava skončí, až nemá
// skupiny ani lov (`settleDone`).
// Proti tažení výprava neveze zásoby, nemrzne, bez hráče se nerozpadá a vsím na cestě
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
  /**
   * Lov vsi (plán 2026-11-22-hunting – Rozhodnutí 1): vyhlášení bez běžící výpravy založí výpravu
   * bez lidí jen s lovem – bez skupiny (`recruits` prázdné).
   */
  hunt?: HuntStart;
  /** Výprava v místní mřížce rodu – lov odříznutého nováčka (`JourneyState.localGrid`). */
  localGrid?: true;
}

/**
 * Výchozí stav výpravy: skupina 0 s hloučkem 0 doma (`nextId` 1) a první rozkaz `order`. Rozkaz,
 * který neplatí (přes okraj na nesousední políčko), se zahodí – skupina stojí doma jako bez rozkazu
 * a po čekání výprava skončí. Úseky vzniknou po současné mřížce pochodu (`marchGridVersion`).
 * S lovem (`hunt`) začne lov v taktu vyslání; výprava jen s lovem (bez lidí) skupinu nemá.
 */
export function newJourney(input: NewJourney, clock: WorldClock): JourneyState {
  const tick = tickOfMs(input.startMs, clock);
  const people = input.recruits.length > 0 || input.hunt === undefined;
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
    ...(input.localGrid ? { localGrid: true as const } : {}),
    members: input.recruits.map((r) => recruitMember(r, 0)),
    groups: people
      ? [
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
            crossings: [],
          },
        ]
      : [],
    marchGridVersion: MARCH_GRID_VERSION,
    parties: people ? [{ id: 0, phase: 'out', arrivedTick: tick }] : [],
    nextId: 1,
  };
  if (input.order && people) orderParty(state, state.parties[0]!, input.order, state.groups[0]!);
  if (input.hunt) startHunt(state, input.hunt, tick);
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
  // lov běží na domovské mapě, i když na ní žádný hlouček nestojí
  const home = start.home.cell;
  if (start.hunt && !upfront.some((c) => sameCell(c, home)) && world.landscapeOf(home) === null) {
    upfront.push({ ...home });
  }
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
  finishHorseWork(s, out);
  for (const intent of intents) applyCommand(s, commandOf(intent.body), ctx, out);
  const wait = waitTicks(ctx.world.clock);
  for (const p of s.parties) {
    // při práci s koňmi lhůta neběží – po ní začne znovu (`finishHorseWork`); při útoku na zvíře
    // taky – po lovu jde skupina domů s honci (`huntStep`)
    if (p.horseWork !== undefined || p.hunting) continue;
    if (p.phase === 'out' && p.arrivedTick !== null && tick - p.arrivedTick > wait) turnHome(s, p);
  }
  huntStep(s, tick, ctx, out);
  moveGroups(s, ctx, out);
  return s;
}

/**
 * Lov vsi v taktu (`huntTick`): výsledek do vsi; padl-li někdo z výpravy, `afterLosses`; v taktu
 * konce souboje jdou útočníci (skupiny s `hunting`) domů s honci (`turnHome` – cíl `home.pos` je
 * dvorec, odkud honci vyšli; plán – Otázky vyřešeno 2), pozdější rozkaz hráče návrat nahradí; lov,
 * který skončil (honci doma), ukončí výpravu bez skupin (`settleDone`).
 */
function huntStep(s: JourneyState, tick: number, ctx: TickContext, out: TickOut): void {
  if (s.hunt === undefined) return;
  const hunt = huntTick(s, tick, ctx);
  out.events.push(...hunt.events);
  if (hunt.losses) afterLosses(s, out);
  if (hunt.ended) for (const p of s.parties) if (p.hunting) turnHome(s, p);
  settleDone(s, out);
}

/** Čekání na místě v taktech (`JOURNEY.waitDays` herních dní) – jako `absentTicks` u tažení. */
function waitTicks(clock: WorldClock): number {
  return Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
}

/**
 * Denní krok na začátku herního dne `s.day` – jen kontrola lidí doma (lord-control.md – Zásoby
 * a zima: žádné jídlo, mráz ani dezerce). Lidé zůstávají ve stavu domovské vsi, jedí z jejích zásob
 * a mohou tam zemřít (stáří, hlad): kdo ve stavu vsi není, je `fallen` (`afterLosses`). Jezdec,
 * jehož kůň ve vsi už není, ho ztratí (`loseHorses`). Domovská ves, která zanikla (`villageGone`),
 * výpravu ukončí bez událostí i s lovem – není, komu je poslat; co lidé věděli o mapách, kde stojí,
 * jde rodu. Ves, která den ještě nemá spočtený, krok zastaví jako u tažení (`MissingData`).
 */
function homeDay(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const home = s.home.villageId;
  const village = ctx.world.villageAt(home, s.day);
  if (village === null) {
    if (!ctx.world.villageGone?.(home)) throw new MissingData([], [home]);
    const cells = new Map(s.groups.map((g) => [cellKey(g.cell), g.cell]));
    for (const cell of cells.values()) shareKnowledge(s, cell, out);
    // hloučky ve stavu zůstávají (konec přímo, ne `settleDone`)
    delete s.hunt;
    s.phase = 'done';
    return;
  }
  const living = new Set(village.people.map((p) => p.id));
  for (const m of s.members) {
    if (m.status === 'active' && !living.has(m.ref.personId)) m.status = 'fallen';
  }
  afterLosses(s, out);
  if (!journeyFinished(s)) loseHorses(s, village, out);
}

/**
 * Po ztrátách (Úloha 1 – Ztráty): hlouček bez živých zmizí i s padlými – nikdo se nevrací, události
 * nejsou; co o jeho mapě výprava věděla, jde rodu (tam jeho cesta skončila). Skupina bez hloučků
 * zmizí. Skupina, ve které padl vojvoda, je `leaderless` a jde domů sama (vrací-li se už, jde dál).
 * Výprava bez skupin končí, neběží-li lov (`settleDone`).
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
  settleDone(s, out);
}

/**
 * Konec výpravy (plán 2026-11-22-hunting – Rozhodnutí 1): `done`, až nemá skupiny ani lov – lov
 * výpravu drží, dokud honci nedojdou domů, i když lidé jsou doma nebo padli; výprava jen s lovem
 * (bez lidí) skončí s ním. Konec ohlásí `everyoneHome`; skončenou výpravu nic nezmění.
 */
function settleDone(s: JourneyState, out: TickOut): void {
  if (journeyFinished(s) || s.parties.length > 0 || s.hunt !== undefined) return;
  s.phase = 'done';
  everyoneHome(s, out);
}

/**
 * Výprava končí (poslední hlouček doma, nebo už nikdo nežije, a lov neběží) – domovská ves dostane
 * `away-ends` bez `personIds`: od začátku dalšího dne je doma každý, kdo je pryč s touto výpravou
 * (plán 2026-11-14 – Review Focus 2; návrh Clauda). Kryje i lidi, které hráč přidal záměrem
 * přijatým těsně před koncem výpravy, na který už krok nedojde (`musterExpedition` je ve vsi
 * poslal pryč dřív, než výprava skončila) – nikdo tak nezůstane `away: journey` bez běžící výpravy.
 */
function everyoneHome(s: JourneyState, out: TickOut): void {
  const day = s.day + 1;
  out.events.push({
    villageId: s.home.villageId,
    day,
    ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'away-ends', refId: s.id, untilDay: day },
  });
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

/** Metry louky, které skupina `party` ujde za takt (`marchSpeed` jejích živých – `moveGroups`). */
function partyStepM(s: JourneyState, party: number): number {
  return marchSpeed(paceOf(s, party), s.day) / TICKS_PER_SECOND;
}

/**
 * Kde a kdy hlouček vyrazil po současném úseku mapy – pro scénu, která stavy dostává po kolech
 * workeru a jinak neví, kdy se stojící hlouček rozjel (journey.md – Scéna vsi; Martin 18. 11. 2026:
 * „zezačátku jde hrozně pomalu“): začátek úseku (`leg.points[0]`) a poslední takt, kdy tam ještě
 * stál – takt stavu bez taktů chůze po úseku (ušlé metry louky ÷ krok skupiny `partyStepM`). Null –
 * stojí, úsek ještě nemá, nebo po něm ještě nešel.
 */
export function groupSetOut(s: JourneyState, g: JourneyGroup): { tick: number; pos: Pos } | null {
  const leg = g.leg;
  if (g.arrived || leg === null || !(leg.walkedM > 0)) return null;
  const stepM = partyStepM(s, g.party);
  if (!(stepM > 0)) return null;
  const start = leg.points[0]!;
  return { tick: s.tick - Math.round(leg.walkedM / stepM), pos: { x: start.x, z: start.z } };
}

/**
 * Pohyb hloučků o jeden takt jako u vojska (`moveGroups` – lord-control.md, Pohyb): metry louky
 * tempem nejpomalejšího ze skupiny (`marchSpeed` ze všech živých skupiny na začátku pohybu – jen
 * jezdci × 1,5, sníh × 0,75) po úseku mapy, brány jsou v míru otevřené (mřížka pochodu je zavírá
 * jen v boji). Hlouček stojí, když dojde do cíle nebo dál nemá kudy; „Přes okraj“ (`crossing`)
 * končí vstupem na mapu cíle – hlouček stojí, kde na ni vstoupil. Hlouček skupiny, která se vrací,
 * po dojetí domů skončí (`finishGroup`); domů se cíl neposouvá (`settleGoal` – kdo domů nedojde,
 * nedošel). Nemá-li kudy domů, vrátí se, kudy přišel (Martin 17. 11. 2026 – „Vrátit se, kudy
 * přišla“, `retraceCrossings`); nejde-li ani to, stojí a výprava běží – nový rozkaz, nebo další den
 * znovu (`stuckDay`; návrh Clauda) –, domů se nikdy nepřenese. Po pohybu splynou hloučky téže
 * skupiny, které stojí na stejném místě se shodným cílem; skupina, jejíž hloučky všechny stojí,
 * začne čekat (`arrivedTick`). Znalost map jde rodu při přechodu okrajem (mapa, kterou hlouček opouští) a po dojetí (mapa, na
 * které stojí – po rozhlédnutí). Hloučky skupiny, která pracuje s koňmi (`horseWork`), stojí –
 * rozkaz má cíl zapsaný a vyrazí po ní.
 */
function moveGroups(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const speeds = new Map<number, number>();
  for (const p of s.parties) speeds.set(p.id, partyStepM(s, p.id));
  const parties = new Map(s.parties.map((p) => [p.id, p]));
  const left: GridCell[] = [];
  const stopped: JourneyGroup[] = [];
  for (const g of [...s.groups]) {
    if (g.arrived || g.goal === null) continue;
    const party = parties.get(g.party)!;
    if (party.horseWork !== undefined) continue;
    const returning = party.phase === 'returning';
    if (!returning) settleGoal(g, s.day, ctx);
    const before = g.cell;
    const speed = speeds.get(party.id)!;
    let step = stepMover(g, g.goal.pos, speed, s.day, ctx);
    if (step === 'stuck' && returning && retraceCrossings(g, g.goal)) {
      step = stepMover(g, g.goal.pos, speed, s.day, ctx);
    }
    // uvízlý návrat stojí, ale nedošel – výprava běží dál
    if (step === 'stuck' && returning) continue;
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
 * a pořadí v něm), poslední hlouček výpravy bez lovu bez `personIds` (`everyoneHome`) – a hráč
 * upozornění „Bořivoj se vrátil.“ s vůdcem hloučku (`partyLeader`). Skupina, která ztratila
 * vojvodu, upozornění nemá – vojvoda se nevrátil (návrh Clauda). Hlouček i jeho lidé ze stavu
 * zmizí, skupina bez hloučků taky; výprava bez skupin končí, neběží-li lov (`settleDone` – jinak
 * skončí s ním). Jen po dojetí domů – uvízlý návrat stojí (`moveGroups`).
 */
function finishGroup(s: JourneyState, g: JourneyGroup, party: JourneyParty, out: TickOut): void {
  const living = s.members.filter((m) => m.group === g.id && m.status === 'active');
  shareKnowledge(s, g.cell, out);
  const day = s.day + 1;
  // poslední hlouček bez lovu ohlásí konec výpravy (`settleDone` níž)
  const last = s.hunt === undefined && s.groups.every((x) => x === g);
  if (!last && living.length > 0) {
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
  settleDone(s, out);
}
