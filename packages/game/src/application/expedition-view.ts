import type { GridCell } from '../domain/village/people/world-grid';
import { sameCell } from '../domain/village/people/world-grid';
import { ageGroupOf } from '../domain/village/people/people';
import type { QuarryKind } from '../domain/village/types';
import {
  commandOf,
  groupSetOut,
  mergeKnowledge,
  partyLeader,
  upgradeJourney,
  type CampaignPlace,
  type HorseWork,
  type HuntBeaters,
  type HuntFight,
  type JourneyHunt,
  type JourneyMember,
  type JourneyParty,
  type JourneyState,
  type MemberHorse,
  type Pos,
  type QuarryState,
  type SeenCell,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import { controllable, membersOf, waitDaysLeft, type JourneyReadDeps } from './journey-view';
import type { JourneyRepository } from './journeys';

// Pohled hráče na jeho výpravy (expeditions.md – Výběr a skupina, Ve scéně; plán 2026-11-14 –
// Úloha 6). Web nic nepočítá: čte kontrolní bod každé běžící výpravy hráče (jedna za domovskou
// ves) a ukazuje skupiny a hloučky a lov vsi (`hunt` – plán 2026-11-22-hunting, Úloha 9). Starší
// bod převede `upgradeJourney` (jedna skupina).

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
  groups: {
    id: number;
    cell: GridCell;
    pos: Pos;
    goal: CampaignPlace | null;
    arrived: boolean;
    /**
     * Kde a v kterém taktu hlouček naposledy stál, než vyrazil po současném úseku (`groupSetOut`) –
     * scéna podle něj ví, kdy se stojící hlouček rozjel; stojí – chybí.
     */
    setOut?: { tick: number; pos: Pos };
  }[];
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
  /**
   * Výprava v místní mřížce rodu – lov odříznutého nováčka (`JourneyState.localGrid`): `home`
   * a políčka hloučků jsou místní políčka, ne políčka světa (web podle nich cizí mapy nedává).
   */
  localGrid?: true;
  /** Dvorec domovské vsi – odkud výprava vyjela a kam se vrací. */
  homePos: Pos;
  parties: PartyView[];
  /**
   * Co rod ví o cizích mapách, na kterých hloučky stojí (klíč `x,y`): znalost rodu sloučená s tím,
   * co výprava viděla teď (`mergeKnowledge`). Domovská mapa tu není – hráč ji zná celou.
   */
  seen: Record<string, SeenCell>;
  /** Lov vsi ve výpravě (plán 2026-11-22-hunting – Úloha 9); null – žádný neběží. */
  hunt: HuntView | null;
}

/**
 * Lov vsi, jak ho vidí hráč (plán 2026-11-22-hunting – Úloha 9): zvíře, honci (polohu spočte scéna
 * z taktu – `beatersAt`), psi a útočníci. Útočníky kreslí scéna jako lidi výpravy (jejich hlouček
 * má polohu bojovníka).
 */
export interface HuntView {
  /** null – zvíře je ještě v lese, nebo už zmizelo. */
  quarry: { kind: QuarryKind; pos: Pos; heading: Pos; state: QuarryState; hits: number } | null;
  beaters: HuntBeaters;
  dogs: number;
  /** Útočníci v souboji (personId). */
  strikers: number[];
  outcome: HuntFight['outcome'];
  /** Takt souboje, ke kterému platí poloha a stav zvířete (`HuntFight.tick`). */
  tick: number;
}

/**
 * Běží ve výpravě lov vsi (plán 2026-11-22-hunting – Rozhodnutí 1: nejvýš jeden; tlačítko lovu
 * zašedne s `already`)? Lov trvá, dokud honci nejsou doma; skončená výprava a žádná – ne.
 */
export function huntRunning(state: JourneyState | null): boolean {
  return state !== null && state.phase !== 'done' && state.hunt !== undefined;
}

/** Porty pro `huntRunningIn` – běžící výprava vsi, její kontrolní bod a záměry za ním. */
export interface HuntRunningDeps {
  journeys: Pick<JourneyRepository, 'activeIn' | 'checkpoint' | 'intentsAfter'>;
}

/** Běžící výprava vsi (`id`, stav bodu převedený `upgradeJourney`) a zda v ní běží lov vsi. */
export interface VillageJourneyHunt {
  id: string | null;
  journey: JourneyState | null;
  running: boolean;
}

/**
 * Běžící výprava hráče ze vsi `villageId` a zda v ní běží lov vsi: lov v kontrolním bodu
 * (`huntRunning`), nebo nevyřízený záměr `hunt` za bodem – s lidmi venku jde vyhlášení záměrem
 * na takt teď + `INTENT_LEAD_TICKS` a do bodu se dostane až s workerem (záměry za bodem čte
 * i `recallJourneysAtWar`). Jinak by druhé vyhlášení před uplatněním záměru prošlo, ves by
 * zaplatila honce dvakrát a výprava by druhý lov zahodila (`startHunt`).
 */
export async function villageJourneyHunt(
  deps: HuntRunningDeps,
  playerId: string,
  villageId: string,
): Promise<VillageJourneyHunt> {
  const id = await deps.journeys.activeIn(playerId, villageId);
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const journey = point ? upgradeJourney(point.state) : null;
  if (id === null || journey === null || journey.phase === 'done') {
    return { id, journey, running: false };
  }
  if (huntRunning(journey)) return { id, journey, running: true };
  const intents = await deps.journeys.intentsAfter(id, journey.tick);
  return { id, journey, running: intents.some((i) => commandOf(i.body).kind === 'hunt') };
}

/**
 * Běží lov vsi `villageId` hráče (`villageJourneyHunt` – v bodu výpravy, nebo čeká jeho záměr)?
 * Tlačítko lovu pak zašedne s `already` a vyhlášení se odmítne (`declareHuntInVillage`).
 */
export async function huntRunningIn(
  deps: HuntRunningDeps,
  playerId: string,
  villageId: string,
): Promise<boolean> {
  return (await villageJourneyHunt(deps, playerId, villageId)).running;
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
      ...(state.localGrid ? { localGrid: true as const } : {}),
      homePos: { ...state.home.pos },
      parties: state.parties.map((party) => partyView(deps, state, party)),
      seen: await seenOnMaps(deps, state),
      hunt: state.hunt ? huntView(state.hunt) : null,
    });
  }
  return views;
}

/** Zvíře v lese (`hidden`) a zmizelé (`gone`) scéna nekreslí. */
const UNSEEN: ReadonlySet<QuarryState> = new Set<QuarryState>(['hidden', 'gone']);

/**
 * Pohled na lov: zvíře venku (i padlé – leží, dokud ho honci neodnesou), honci a psi; útočníci jsou
 * bojovníci, kteří v souboji jednají – ne odvolaní (`left`) ani padlí (`down`).
 */
function huntView(hunt: JourneyHunt): HuntView {
  const f = hunt.fight;
  const q = f.quarry;
  return {
    quarry: UNSEEN.has(q.state)
      ? null
      : {
          kind: q.kind,
          pos: { ...q.pos },
          heading: { ...q.heading },
          state: q.state,
          hits: q.hits,
        },
    beaters: structuredClone(hunt.beaters),
    dogs: hunt.dogs,
    strikers: f.hunters.filter((h) => !h.left && h.state !== 'down').map((h) => h.personId),
    outcome: f.outcome,
    tick: f.tick,
  };
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
    groups: groups.map((g) => {
      const setOut = groupSetOut(state, g);
      return {
        id: g.id,
        cell: { ...g.cell },
        pos: { ...g.pos },
        goal: g.goal ? structuredClone(g.goal) : null,
        arrived: g.arrived,
        ...(setOut ? { setOut } : {}),
      };
    }),
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
