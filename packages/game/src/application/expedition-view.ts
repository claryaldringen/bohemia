import type { GridCell } from '../domain/village/people/world-grid';
import { sameCell } from '../domain/village/people/world-grid';
import { ageGroupOf } from '../domain/village/people/people';
import {
  mergeKnowledge,
  partyLeader,
  upgradeJourney,
  type CampaignPlace,
  type HorseWork,
  type JourneyMember,
  type JourneyParty,
  type JourneyState,
  type MemberHorse,
  type Pos,
  type SeenCell,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import { controllable, membersOf, waitDaysLeft, type JourneyReadDeps } from './journey-view';

// Pohled hráče na jeho výpravy (expeditions.md – Výběr a skupina, Ve scéně; plán 2026-11-14 –
// Úloha 6). Web nic nepočítá: čte kontrolní bod každé běžící výpravy hráče (jedna za domovskou
// ves) a ukazuje skupiny a hloučky. Starší bod převede `upgradeJourney` (jedna skupina).

/** Skupina výpravy, jak ji vidí její hráč. */
export interface PartyView {
  id: number;
  phase: 'out' | 'returning';
  /** Hráč skupině rozkazuje – neztratila vojvodu. */
  controllable: boolean;
  /** Vůdce skupiny (nejstarší živý – `partyLeader`); null = nikdo nežije. */
  leaderId: number | null;
  /** Celé dny do automatického návratu (3, 2, 1), jen když skupina stojí na místě. */
  waitDaysLeft: number | null;
  /** Probíhající osedlání nebo sesednutí. */
  horseWork: HorseWork | null;
  groups: { id: number; cell: GridCell; pos: Pos; goal: CampaignPlace | null; arrived: boolean }[];
  people: {
    personId: number;
    /** Hlouček (`groups[].id`), ve kterém člověk je. */
    group: number;
    lord: boolean;
    rider: boolean;
    mounted: boolean;
    horse: MemberHorse | null;
    horseId: number | null;
    wounded: boolean;
    /** Síla do meče; na koni se svým koněm `strengthMounted`. */
    strength: number;
    female: boolean;
    child: boolean;
  }[];
}

/** Pohled hráče na jednu jeho výpravu (jedna domovská ves). */
export interface ExpeditionView {
  journeyId: string;
  villageId: string;
  tick: number;
  day: number;
  home: GridCell;
  /** Dvorec domovské vsi – odkud výprava vyjela a kam se vrací. */
  homePos: Pos;
  parties: PartyView[];
  /**
   * Co rod ví o cizích mapách, na kterých hloučky stojí (klíč `x,y`): znalost rodu sloučená s tím,
   * co výprava viděla teď (`mergeKnowledge`). Domovská mapa tu není – hráč ji zná celou.
   */
  seen: Record<string, SeenCell>;
}

/**
 * Pohledy hráče na všechny jeho běžící výpravy (podle založení); hráč bez výprav a cizí výprava –
 * prázdno. Lidé, kteří padli nebo zemřeli doma, se neukazují.
 */
export async function expeditionViewsFor(
  deps: JourneyReadDeps,
  input: { playerId: string },
): Promise<ExpeditionView[]> {
  const views: ExpeditionView[] = [];
  for (const id of await deps.journeys.activeOfPlayer(input.playerId)) {
    const point = await deps.journeys.checkpoint(id);
    const state = point ? upgradeJourney(point.state) : null;
    if (!state || state.playerId !== input.playerId || state.phase === 'done') continue;
    views.push({
      journeyId: state.id,
      villageId: state.home.villageId,
      tick: state.tick,
      day: state.day,
      home: { ...state.home.cell },
      homePos: { ...state.home.pos },
      parties: state.parties.map((party) => partyView(deps, state, party)),
      seen: await seenOnMaps(deps, state),
    });
  }
  return views;
}

function partyView(deps: JourneyReadDeps, state: JourneyState, party: JourneyParty): PartyView {
  const groups = state.groups.filter((g) => g.party === party.id);
  const people = membersOf(state, party.id).filter((m) => m.status === 'active');
  return {
    id: party.id,
    phase: party.phase,
    controllable: controllable(state, party),
    leaderId: partyLeader(people)?.ref.personId ?? null,
    waitDaysLeft: waitDaysLeft(state, party, deps.world),
    horseWork: party.horseWork ? structuredClone(party.horseWork) : null,
    groups: groups.map((g) => ({
      id: g.id,
      cell: { ...g.cell },
      pos: { ...g.pos },
      goal: g.goal ? structuredClone(g.goal) : null,
      arrived: g.arrived,
    })),
    people: people.map((m) => personView(m, state.day)),
  };
}

function personView(m: JourneyMember, day: number): PartyView['people'][number] {
  return {
    personId: m.ref.personId,
    group: m.group,
    lord: m.lord,
    rider: m.horseId !== undefined,
    mounted: m.mounted,
    horse: m.horse ?? null,
    horseId: m.horseId ?? null,
    wounded: m.wounded,
    strength: m.mounted ? (m.strengthMounted ?? m.strength) : m.strength,
    female: m.female === true,
    // bez dne narození (starší bod) je to vojvoda nebo družina – dospělí
    child: m.bornDay !== undefined && ageGroupOf(m.bornDay, day) === 'child',
  };
}

/** Znalost rodu o cizích mapách hloučků výpravy – jeden dotaz na políčko. */
async function seenOnMaps(
  deps: JourneyReadDeps,
  state: JourneyState,
): Promise<Record<string, SeenCell>> {
  const seen: Record<string, SeenCell> = {};
  const done: GridCell[] = [];
  for (const g of state.groups) {
    if (sameCell(g.cell, state.home.cell) || done.some((c) => sameCell(c, g.cell))) continue;
    done.push(g.cell);
    const fresh = state.seen?.[cellKey(g.cell)] ?? null;
    const known = (await deps.knowledge?.of(state.houseId, g.cell)) ?? null;
    const merged =
      known === null || fresh === null ? (fresh ?? known) : mergeKnowledge(known, fresh);
    if (merged !== null) seen[cellKey(g.cell)] = merged;
  }
  return seen;
}
