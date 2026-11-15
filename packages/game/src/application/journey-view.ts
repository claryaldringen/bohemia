import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/people/world-grid';
import { ageGroupOf } from '../domain/village/people/people';
import { sameCell } from '../domain/village/people/world-grid';
import {
  hoursPerTick,
  inSight,
  JOURNEY,
  partyLeader,
  upgradeJourney,
  type CampaignPlace,
  type JourneyParty,
  type JourneyPhase,
  type JourneyState,
  type Pos,
  type SeenCell,
} from '../domain/war';
import { mapGrid, type SightGridCache } from './campaign-view';
import type { CampaignCells } from './campaigns';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { JourneyRepository } from './journeys';
import { houseName } from './negotiation-chronicle';
import { findPlayerVillage, type PlayerVillagesDeps } from './player-villages';

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
   * Odkud výjezd vyjel a kam se vrací – dvorec domovské vsi (`musterExpedition`); scéna od něj měří
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

/** Skupina výpravy na mapě vsi – co o ní hostitel smí vědět (expeditions.md – Soused). */
export interface ExpeditionVisitor {
  journeyId: string;
  partyId: number;
  own: boolean;
  /** Domovská ves vlastní skupiny (id lidí platí jen v ní); cizí skupina null. */
  villageId: string | null;
  /** Jméno vůdce skupiny; beze jména null. */
  leaderName: string | null;
  /** Jméno rodu (jako v panelu Rod). */
  houseName: string;
  tick: number;
  /** Hloučky skupiny na této mapě (cíl jen u vlastní skupiny). */
  groups: { id: number; pos: Pos; goal: Pos | null }[];
  people: {
    /** Id osoby v její vsi – jen u vlastní skupiny; cizí id hostitel nezná (null). */
    personId: number | null;
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
        villageId: mine ? state.home.villageId : null,
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
            personId: mine ? m.ref.personId : null,
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
