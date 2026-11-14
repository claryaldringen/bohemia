import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/people/world-grid';
import { ageGroupOf } from '../domain/village/people/people';
import { sameCell } from '../domain/village/people/world-grid';
import {
  hoursPerTick,
  INTENT_LEAD_TICKS,
  inSight,
  JOURNEY,
  mergeKnowledge,
  partyLeader,
  tickOfMs,
  upgradeJourney,
  type CampaignPlace,
  type JourneyGroup,
  type JourneyOrder,
  type JourneyParty,
  type JourneyPhase,
  type JourneyState,
  type Pos,
  type SeenCell,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import { mapGrid, type SightGridCache } from './campaign-view';
import type { CampaignCells } from './campaigns';
import type { HouseRepository } from './houses';
import { orderAim } from './journey-order';
import type { KnowledgeRepository } from './knowledge';
import type { JourneyRepository } from './journeys';
import { houseName } from './negotiation-chronicle';
import { findPlayerVillage, type PlayerVillagesDeps } from './player-villages';
import type { VillageRepository } from './villages';

// Rozkazy a pohled na výjezd vojvody (lord-control.md – Rozkazy, Na místě a návrat, Soused; plán
// 2026-11-13 – Úloha 5). Web volá tyhle use-casy; stav počítá worker, tady se jen čte kontrolní
// bod a zapisují záměry hráče.

/** Pohled hráče na vlastní běžící výjezd. */
export interface JourneyView {
  journeyId: string;
  tick: number;
  day: number;
  phase: JourneyPhase;
  /** Políčko světa, na kterém skupina je. */
  cell: GridCell;
  home: GridCell;
  /**
   * Odkud výjezd vyjel a kam se vrací – dvorec domovské vsi (`launchJourney`); scéna od něj měří
   * odjezd a příjezd (ves nemusí stát na místě vsi krajiny).
   */
  homePos: Pos;
  men: { personId: number; lord: boolean; mounted: boolean; wounded: boolean }[];
  group: { pos: Pos; goal: CampaignPlace | null; arrived: boolean };
  /** Celé dny zbývající do automatického návratu (3, 2, 1) – jen když skupina stojí na místě. */
  waitDaysLeft: number | null;
  /** Vojvoda žije – hráč smí rozkazovat. */
  controllable: boolean;
  /**
   * Co rod ví o mapě, na které skupina je (stopa a naposled viděné stavby – Úloha 6): znalost rodu
   * sloučená s tím, co výjezd viděl teď (`mergeKnowledge`, Úloha 11) – další výjezd tak má od
   * prvního taktu na mapě stopu i stavby z dřívějších. Na domovské mapě, kterou hráč zná celou,
   * a dokud rod o mapě nic neví, null.
   */
  seen: SeenCell | null;
}

export interface JourneyReadDeps {
  journeys: Pick<JourneyRepository, 'activeOfPlayer' | 'checkpoint'>;
  world: WorldClock;
  /**
   * Úložiště znalosti rodu (Úloha 11) – jeden dotaz na pohled (mapa skupiny); bez něj jen čerstvé
   * `seen` výjezdu. Stav výjezdu znalost rodu nenese – kontrolní body nerostou.
   */
  knowledge?: Pick<KnowledgeRepository, 'of'>;
}

/**
 * Pohled hráče na jeho běžící výjezd; null = hráč žádný nemá. Pohled cizího hráče na cizí výjezd
 * neexistuje – výjezd se hledá podle hráče. Ukazuje skupinu s vojvodou (jinak první) a její
 * hlouček s vojvodou (jinak první); lidé, kteří padli nebo zemřeli doma, se neukazují. Starší bod
 * převede `upgradeJourney`.
 */
export async function journeyViewFor(
  deps: JourneyReadDeps,
  input: { playerId: string },
): Promise<JourneyView | null> {
  const id = (await deps.journeys.activeOfPlayer(input.playerId))[0] ?? null;
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const state = point ? upgradeJourney(point.state) : null;
  const viewed = state ? lordParty(state) : null;
  if (!state || !viewed || state.playerId !== input.playerId) return null;
  const { party, group } = viewed;
  return {
    journeyId: state.id,
    tick: state.tick,
    day: state.day,
    phase: state.phase === 'done' ? 'done' : party.phase,
    cell: { ...group.cell },
    home: { ...state.home.cell },
    homePos: { ...state.home.pos },
    men: membersOf(state, party.id)
      .filter((m) => m.status === 'active')
      .map((m) => ({
        personId: m.ref.personId,
        lord: m.lord,
        mounted: m.mounted,
        wounded: m.wounded,
      })),
    group: { pos: { ...group.pos }, goal: group.goal, arrived: group.arrived },
    waitDaysLeft: waitDaysLeft(state, party, deps.world),
    controllable: controllable(state, party),
    seen: await seenOn(deps, state, group.cell),
  };
}

/**
 * Skupina, kterou ukazuje pohled a řídí starý rozkaz (`commandJourney`): skupina s vojvodou (i
 * padlým), jinak první; hlouček s vojvodou, jinak první hlouček skupiny. Výprava bez skupin – null.
 */
function lordParty(state: JourneyState): { party: JourneyParty; group: JourneyGroup } | null {
  const lord = state.members.find((m) => m.lord);
  const lordGroup = lord ? state.groups.find((g) => g.id === lord.group) : undefined;
  const party =
    (lordGroup && state.parties.find((p) => p.id === lordGroup.party)) ?? state.parties[0];
  if (!party) return null;
  const group =
    lordGroup?.party === party.id ? lordGroup : state.groups.find((g) => g.party === party.id);
  return group ? { party, group } : null;
}

/** Lidé skupiny `party` (ze všech jejích hloučků). */
export function membersOf(state: JourneyState, party: number): JourneyState['members'] {
  const groups = new Set(state.groups.filter((g) => g.party === party).map((g) => g.id));
  return state.members.filter((m) => groups.has(m.group));
}

/** Hráč skupině rozkazuje – neztratila vojvodu (krok ji pak označí `leaderless`). */
export function controllable(state: JourneyState, party: JourneyParty): boolean {
  if (party.leaderless) return false;
  return !membersOf(state, party.id).some((m) => m.lord && m.status === 'fallen');
}

/**
 * Co rod ví o mapě `cell` (Úloha 11): znalost rodu z úložiště sloučená s čerstvým `seen` výjezdu.
 * Domovskou mapu hráč zná celou – null, úložiště se neptá.
 */
async function seenOn(
  deps: JourneyReadDeps,
  state: JourneyState,
  cell: GridCell,
): Promise<SeenCell | null> {
  if (sameCell(cell, state.home.cell)) return null;
  const fresh = state.seen?.[cellKey(cell)] ?? null;
  const known = (await deps.knowledge?.of(state.houseId, cell)) ?? null;
  if (known === null || fresh === null) return fresh ?? known;
  return mergeKnowledge(known, fresh);
}

/** Celé dny do návratu: 3 hned po dojetí, pak 2, 1; skupina, která jede, nebo se vrací – null. */
export function waitDaysLeft(
  state: JourneyState,
  party: JourneyParty,
  world: WorldClock,
): number | null {
  if (state.phase !== 'out' || party.phase !== 'out' || party.arrivedTick === null) return null;
  const elapsedDays = ((state.tick - party.arrivedTick) * hoursPerTick(world)) / 24;
  return Math.max(1, Math.ceil(JOURNEY.waitDays - elapsedDays));
}

export interface JourneyCommandDeps extends JourneyReadDeps {
  journeys: Pick<JourneyRepository, 'activeOfPlayer' | 'checkpoint' | 'addIntent'>;
  cells: CampaignCells;
  villages: Pick<VillageRepository, 'find'>;
  grids?: SightGridCache;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku (`houseAtWarOn`)? */
  atWar: (playerId: string, cell: GridCell) => Promise<boolean>;
}

export type JourneyCommandResult =
  | { queued: true; tick: number }
  | { queued: false; reason: 'refused' | 'unreachable' | 'war-there' };

const REFUSED: JourneyCommandResult = { queued: false, reason: 'refused' };

/**
 * Zapíše rozkaz hráče jako záměr na takt teď + `INTENT_LEAD_TICKS`. Rozkaz se ověří vůči políčku
 * a poloze, kde skupina podle kontrolního bodu je (`orderAim` – totéž ověření jako při vyslání).
 * Odmítne (`refused`) hráče bez běžícího výjezdu, výjezd bez živého vojvody a vstup, který nedává
 * smysl (bod mimo mapu, nekonečné číslo, `cross` na nesousední políčko); `unreachable` – skupina
 * na místo nedojde; `war-there` – políčko patří rodu, se kterým je rod hráče ve válce.
 */
export async function commandJourney(
  deps: JourneyCommandDeps,
  input: { playerId: string; command: JourneyOrder; nowMs: number },
): Promise<JourneyCommandResult> {
  const id = (await deps.journeys.activeOfPlayer(input.playerId))[0] ?? null;
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const state = point ? upgradeJourney(point.state) : null;
  const viewed = state ? lordParty(state) : null;
  if (!id || !state || !viewed || state.playerId !== input.playerId) return REFUSED;
  if (state.phase === 'done' || !controllable(state, viewed.party)) return REFUSED;
  const group = viewed.group;
  const command = input.command;
  const grid = command.kind === 'go' ? await mapGrid(deps, group.cell, state.day) : null;
  const aim = orderAim(command, group.cell, group.pos, () => grid!);
  if (aim === 'invalid') return REFUSED;
  if (aim === 'unreachable') return { queued: false, reason: 'unreachable' };
  if (aim !== null && (await deps.atWar(input.playerId, aim))) {
    return { queued: false, reason: 'war-there' };
  }
  const tick = tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS;
  const queued = await deps.journeys.addIntent(id, {
    tick,
    byPlayer: input.playerId,
    body: command,
  });
  return queued === null ? REFUSED : { queued: true, tick: queued.tick };
}

/** Cizí (nebo vlastní) jezdec na mapě vsi – co o něm hostitel smí vědět. */
export interface JourneyVisitor {
  journeyId: string;
  own: boolean;
  /** Jméno vojvody. */
  leader: string;
  /** Jméno rodu (jako v panelu Rod). */
  house: string;
  tick: number;
  pos: Pos;
  /** Cíl na této mapě; jiný cíl hostitel nevidí. */
  goal: Pos | null;
  men: { lord: boolean; mounted: boolean }[];
}

export interface VisitorsDeps extends PlayerVillagesDeps {
  journeys: Pick<JourneyRepository, 'onCell' | 'checkpoint'>;
  houses: Pick<HouseRepository, 'byId'>;
  cells: CampaignCells;
  grids?: SightGridCache;
}

/**
 * Jezdci na mapě vsi `villageId` hráče. Hostitel je vidí jako obránce ve válce – lidmi a domy vsi
 * (`inSight`: 150 m, v lese 50 m); vlastní výjezd hráče je vidět vždy. Ves jiného hráče: prázdno.
 * Ves jezdce na cestě nijak nereaguje (lord-control.md – Soused) – tohle je jen pohled.
 */
export async function visitorsOn(
  deps: VisitorsDeps,
  input: { playerId: string; villageId: string },
): Promise<JourneyVisitor[]> {
  const own = await findPlayerVillage(deps, input);
  const cell = own?.settlement.worldCell;
  if (!own || !cell) return [];
  const states: JourneyState[] = [];
  for (const id of await deps.journeys.onCell(cell)) {
    const point = await deps.journeys.checkpoint(id);
    if (point) states.push(upgradeJourney(point.state));
  }
  if (states.length === 0) return [];
  const village = own.village.state;
  const eyes = village.dwellings.map((d) => ({ x: d.position.x, z: d.position.z }));
  const grid = states.some((s) => s.playerId !== input.playerId)
    ? await mapGrid(deps, cell, village.lastDay)
    : null;
  const visitors: JourneyVisitor[] = [];
  for (const state of states) {
    const mine = state.playerId === input.playerId;
    // jeden jezdec za výpravu: hlouček vojvody, jinak první hlouček na mapě, který hostitel vidí
    const first = lordParty(state)?.group;
    const group = [...(first ? [first] : []), ...state.groups.filter((g) => g !== first)].find(
      (g) => sameCell(g.cell, cell) && (mine || eyes.some((e) => inSight(grid, e, g.pos))),
    );
    if (!group) continue;
    const lord = state.members.find((m) => m.lord);
    const leader =
      (lord ?? partyLeader(membersOf(state, group.party).filter((m) => m.status === 'active')))
        ?.name ??
      state.leaderName ??
      '';
    const house = await deps.houses.byId(state.houseId);
    visitors.push({
      journeyId: state.id,
      own: mine,
      leader,
      house: house ? await houseName(deps, house) : leader,
      tick: state.tick,
      pos: { ...group.pos },
      // cíl jen u vlastního výjezdu – o cizím hostitel smí znát jen jméno a rod (lord-control.md)
      goal: mine && group.goal && sameCell(group.goal.cell, cell) ? { ...group.goal.pos } : null,
      men: state.members
        .filter((m) => m.group === group.id && m.status === 'active')
        .map((m) => ({ lord: m.lord, mounted: m.mounted })),
    });
  }
  return visitors;
}

/** Skupina výpravy na mapě vsi – co o ní hostitel smí vědět (expeditions.md – Soused). */
export interface ExpeditionVisitor {
  journeyId: string;
  partyId: number;
  own: boolean;
  /** Jméno vůdce skupiny; beze jména null. */
  leaderName: string | null;
  /** Jméno rodu (jako v panelu Rod). */
  houseName: string;
  tick: number;
  /** Hloučky skupiny na této mapě (cíl jen u vlastní skupiny). */
  groups: { id: number; pos: Pos; goal: Pos | null }[];
  people: {
    personId: number;
    /** Hlouček (`groups[].id`), ve kterém člověk na této mapě je. */
    group: number;
    lord: boolean;
    mounted: boolean;
    /** Vede koně za uzdu. */
    led: boolean;
    female: boolean;
    child: boolean;
  }[];
}

/**
 * Skupiny výprav na mapě vsi `villageId` hráče. Hostitel vidí skupinu, když vidí aspoň jeden její
 * hlouček na této mapě (`inSight`: 150 m, v lese 50 m, lidmi a domy vsi); vlastní skupiny vidí
 * vždy. Ve výsledku jsou jen hloučky na této mapě a lidé v nich. Ves jiného hráče: prázdno.
 */
export async function expeditionVisitorsOn(
  deps: VisitorsDeps,
  input: { playerId: string; villageId: string },
): Promise<ExpeditionVisitor[]> {
  const own = await findPlayerVillage(deps, input);
  const cell = own?.settlement.worldCell;
  if (!own || !cell) return [];
  const states: JourneyState[] = [];
  for (const id of await deps.journeys.onCell(cell)) {
    const point = await deps.journeys.checkpoint(id);
    if (point) states.push(upgradeJourney(point.state));
  }
  if (states.length === 0) return [];
  const village = own.village.state;
  const eyes = village.dwellings.map((d) => ({ x: d.position.x, z: d.position.z }));
  const grid = states.some((s) => s.playerId !== input.playerId)
    ? await mapGrid(deps, cell, village.lastDay)
    : null;
  const visitors: ExpeditionVisitor[] = [];
  for (const state of states) {
    const mine = state.playerId === input.playerId;
    const house = await deps.houses.byId(state.houseId);
    for (const party of state.parties) {
      const seen = state.groups.filter(
        (g) =>
          g.party === party.id &&
          sameCell(g.cell, cell) &&
          (mine || eyes.some((e) => inSight(grid, e, g.pos))),
      );
      if (seen.length === 0) continue;
      const ids = new Set(seen.map((g) => g.id));
      const active = membersOf(state, party.id).filter((m) => m.status === 'active');
      const leaderName = partyLeader(active)?.name ?? null;
      visitors.push({
        journeyId: state.id,
        partyId: party.id,
        own: mine,
        leaderName,
        houseName: house ? await houseName(deps, house) : (leaderName ?? ''),
        tick: state.tick,
        groups: seen.map((g) => ({
          id: g.id,
          pos: { ...g.pos },
          // cíl jen u vlastní skupiny – o cizí smí hostitel znát jen jméno a rod
          goal: mine && g.goal && sameCell(g.goal.cell, cell) ? { ...g.goal.pos } : null,
        })),
        people: active
          .filter((m) => ids.has(m.group))
          .map((m) => ({
            personId: m.ref.personId,
            group: m.group,
            lord: m.lord,
            mounted: m.mounted,
            led: m.horse === 'led',
            female: m.female === true,
            child: m.bornDay !== undefined && ageGroupOf(m.bornDay, state.day) === 'child',
          })),
      });
    }
  }
  return visitors;
}
