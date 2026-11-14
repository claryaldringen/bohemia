import type { Landscape } from '../domain/landscape';
import { currentLord } from '../domain/village/people/dynasty';
import { villageHorses } from '../domain/village/livestock/horses';
import { villageManor, villageManorId } from '../domain/village/people/manor';
import { ageYears, isAway, isInjured } from '../domain/village/people/people';
import type { GridCell } from '../domain/village/people/world-grid';
import type { Person, VillageState } from '../domain/village/types';
import { sendAway } from '../domain/vassalage';
import {
  lineCandidates,
  lineManStrength,
  marchGrid,
  newJourney,
  WAR,
  type JourneyOrder,
  type JourneyRecruit,
  type Pos,
} from '../domain/war';
import type { WorldClock } from '../domain/calendar';
import type { CampaignCells, CampaignRepository } from './campaigns';
import type { HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import { orderAim } from './journey-order';
import { UNNAMED_HOUSE } from './negotiation-chronicle';
import {
  editVillage,
  findPlayerVillage,
  type PlayerVillage,
  type PlayerVillagesDeps,
} from './player-villages';
import { villagePlace } from './plan-campaign';
import type { SeedSource } from './settlements';
import type { VillageRepository } from './villages';

// Výběr družiny a vyslání výjezdu vojvody (lord-control.md – Kdo jede; plán 2026-11-13 – Úloha 2):
// vojvoda (a muži rodu od 16 let, kteří jsou doma a zdraví) odejdou z vsi s `away: journey`
// (nepracují, ale jedí dál doma) a vznikne výjezd s prvním rozkazem. Volající drží zámek hráče
// (web `guardedAction`) – jen vlastní ves hráče.

/** Kandidát na výjezd: vojvoda, nebo muž rodu doma. */
export interface JourneyCandidate {
  personId: number;
  name: string;
  age: number;
  lord: boolean;
  /** Má vlastního jezdeckého koně (lord-control.md – Kůň). */
  mounted: boolean;
  /** Síla (`lineManStrength`) – v družině se neukazuje, počítá se při vyslání. */
  strength: number;
}

/** Proč výjezd nejde (jedna z hlášek v rozhraní – „Vojvoda je raněný.“…). */
export type JourneyRefusal =
  | 'no-lord'
  | 'lord-young'
  | 'lord-wounded'
  | 'lord-away'
  | 'village-attacked'
  | 'journey-active'
  | 'bad-retinue'
  | 'unreachable'
  | 'war-there';

export interface JourneyViewDeps extends PlayerVillagesDeps {
  /** Cizí vojsko na mapě vsi (`activeAgainst`). */
  campaigns: Pick<CampaignRepository, 'activeAgainst'>;
  journeys: Pick<JourneyRepository, 'activeIn'>;
}

export interface LaunchJourneyDeps extends JourneyViewDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  villages: VillageRepository;
  journeys: Pick<JourneyRepository, 'activeIn' | 'create'>;
  /** Mapa domovského políčka – krajina a překážky pro ověření prvního rozkazu. */
  cells: CampaignCells;
  world: WorldClock;
  seeds: SeedSource;
  /** Nové id výjezdu (uuid). */
  newId: () => string;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku (`houseAtWarOn`)? */
  atWar: (playerId: string, cell: GridCell) => Promise<boolean>;
}

/** Kandidáti vsi ve dni `day` a důvod stavu vsi (vojvoda), proč výjezd nejde; null = jde. */
function assess(
  state: VillageState,
  day: number,
): { refusal: JourneyRefusal | null; lord: JourneyCandidate | null; men: JourneyCandidate[] } {
  const lord = currentLord(state);
  const horses = new Map(
    villageHorses(state).flatMap((h) => (h.riderId === undefined ? [] : [[h.riderId, h] as const])),
  );
  const candidate = (p: Person, isLord: boolean): JourneyCandidate => {
    const horse = horses.get(p.id) ?? null;
    return {
      personId: p.id,
      name: p.name ?? '',
      age: ageYears(p.bornDay, day),
      lord: isLord,
      mounted: horse !== null,
      strength: lineManStrength(p, horse),
    };
  };
  let refusal: JourneyRefusal | null = null;
  if (!lord) refusal = 'no-lord';
  else if (ageYears(lord.bornDay, day) < WAR.army.minAge) refusal = 'lord-young';
  else if (isInjured(lord, day)) refusal = 'lord-wounded';
  else if (isAway(lord, day)) refusal = 'lord-away';
  return {
    refusal,
    lord: lord ? candidate(lord, true) : null,
    men: lineCandidates(state, day)
      .filter((p) => p.id !== lord?.id)
      .map((p) => candidate(p, false)),
  };
}

/**
 * Kdo může na výjezd z vsi `villageId` hráče: vojvoda a muži rodu od 16 let, kteří jsou doma a
 * nejsou ranění (raněný, na tažení nebo výjezdu, zajatý a mladší chybí), nebo důvod, proč výjezd
 * nejde. Cizí ves nebo ves bez vojvody: `no-lord`.
 */
export async function journeyCandidates(
  deps: JourneyViewDeps,
  input: { playerId: string; villageId: string; today: number },
): Promise<{
  refusal: JourneyRefusal | null;
  lord: JourneyCandidate | null;
  men: JourneyCandidate[];
}> {
  const own = await findPlayerVillage(deps, input);
  if (!own) return { refusal: 'no-lord', lord: null, men: [] };
  return viewOf(deps, own, input.playerId, input.today);
}

async function viewOf(
  deps: JourneyViewDeps,
  own: PlayerVillage,
  playerId: string,
  day: number,
): Promise<ReturnType<typeof assess>> {
  const view = assess(own.village.state, day);
  if (view.refusal === null && (await deps.campaigns.activeAgainst(own.village.id)).length > 0) {
    view.refusal = 'village-attacked';
  }
  if (view.refusal === null && (await deps.journeys.activeIn(playerId, own.village.id)) !== null) {
    view.refusal = 'journey-active';
  }
  return view;
}

/**
 * Hráč vyšle vojvodu s družinou `retinue` (id mužů vsi, bez vojvody). Ověří vojvodu, družinu a první
 * rozkaz, pošle muže pryč (`away: journey`) a založí výjezd. Selže-li uložení další vsi nebo založení
 * výjezdu, muži jsou zpět doma. Cizí ves a ves bez vojvody: `no-lord`; rod bez místa na mapě světa
 * nemá kam jet (`unreachable`).
 */
export async function launchJourney(
  deps: LaunchJourneyDeps,
  input: {
    playerId: string;
    villageId: string;
    retinue: number[];
    order: JourneyOrder;
    now: Date;
  },
): Promise<{ ok: true; journeyId: string } | { ok: false; reason: JourneyRefusal }> {
  const own = await findPlayerVillage(deps, input);
  if (!own) return { ok: false, reason: 'no-lord' };
  const state = own.village.state;
  const day = state.lastDay;
  const view = await viewOf(deps, own, input.playerId, day);
  if (view.refusal !== null) return { ok: false, reason: view.refusal };
  if (!retinueFits(view.men, input.retinue)) return { ok: false, reason: 'bad-retinue' };
  const house = await deps.houses.activeOf(input.playerId);
  const cell = own.settlement.worldCell;
  if (!house) return { ok: false, reason: 'no-lord' };
  if (house.placedAt === null || !cell) return { ok: false, reason: 'unreachable' };

  const map = await deps.cells.mapOf(cell);
  const homePos = journeyHome(state, cell, map.landscape);
  const aim = orderAim(input.order, cell, homePos, () =>
    marchGrid(map.landscape, map.obstacles, state, { day }),
  );
  if (aim === 'unreachable' || aim === 'invalid') return { ok: false, reason: 'unreachable' };
  if (aim !== null && (await deps.atWar(input.playerId, aim))) {
    return { ok: false, reason: 'war-there' };
  }

  const journeyId = deps.newId();
  const ids = [view.lord!.personId, ...input.retinue];
  const failed = await editVillage<JourneyRefusal>(
    deps.villages,
    own.village.id,
    (fresh) => send(fresh, ids, journeyId, input.retinue),
    'bad-retinue',
  );
  if (failed !== null) return { ok: false, reason: failed };

  const recruits = recruitsOf(state, view, input.retinue, own.village.id);
  try {
    await deps.journeys.create(
      newJourney(
        {
          id: journeyId,
          seed: deps.seeds.nextSeed(),
          playerId: input.playerId,
          houseId: house.id,
          home: { villageId: own.village.id, name: own.village.name, cell, pos: homePos },
          recruits,
          startMs: input.now.getTime(),
          order: input.order,
        },
        deps.world,
      ),
      input.now,
    );
  } catch (error) {
    await release(deps.villages, own.village.id, journeyId);
    throw error;
  }
  return { ok: true, journeyId };
}

/**
 * Odkud výjezd vyjíždí a kam se vrací (lord-control.md – Rozkazy: „Domů – nejkratší cestou do
 * vlastní vsi“; Ve scéně: odjezd branou dvorce): dvorec vsi. Hráč staví ves, kde chce – místo vsi
 * krajiny (`villagePlace`) od ní může ležet daleko (Martinův Vlkov ≈ 430 m). Dokud zakladatelé
 * první zemnici staví, staveniště dvorce; ves bez obydlí i staveniště – místo vsi krajiny.
 */
function journeyHome(state: VillageState, cell: GridCell, landscape: Landscape): Pos {
  const manorId = villageManorId(state);
  const site =
    manorId === null
      ? undefined
      : state.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === manorId);
  const at = villageManor(state)?.position ?? site?.position;
  return at ? { x: at.x, z: at.z } : villagePlace(cell, landscape).pos;
}

/** Družina: jen muži z kandidátů, každý nejvýš jednou (vojvoda v ní není). */
function retinueFits(men: readonly JourneyCandidate[], retinue: readonly number[]): boolean {
  const allowed = new Set(men.map((m) => m.personId));
  const seen = new Set<number>();
  for (const id of retinue) {
    if (!Number.isInteger(id) || !allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/**
 * Lidé výjezdu (`newJourney` – skupina 0): vojvoda první, pak družina; síla a boj z dovedností muže
 * při vyslání, na koni podle vlastního koně (lord-control.md – Kůň). Vojvoda bez jména nese jméno
 * neznámého rodu jako dřív `leaderName` (upozornění „… se vrátil.“).
 */
function recruitsOf(
  state: VillageState,
  view: ReturnType<typeof assess>,
  retinue: readonly number[],
  villageId: string,
): JourneyRecruit[] {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  return [view.lord!, ...retinue.map((id) => view.men.find((m) => m.personId === id)!)].map(
    (c): JourneyRecruit => {
      const person = byId.get(c.personId);
      const name = c.lord && c.name === '' ? UNNAMED_HOUSE : c.name;
      return {
        ref: { villageId, personId: c.personId },
        lord: c.lord,
        strength: c.strength,
        fight: person?.arms?.combat ?? 0,
        ...(name === '' ? {} : { name }),
        ...(person?.sex === 'female' ? { female: true as const } : {}),
        ...(person ? { bornDay: person.bornDay } : {}),
        ...(c.mounted ? { mounted: true as const } : {}),
      };
    },
  );
}

/**
 * Odchod mužů z vsi (mutuje kopii stavu). Ves se mezitím mohla změnit (opakování při souběžném
 * zápisu) – vojvoda a družina se proto ověří znovu na čerstvém stavu.
 */
function send(
  state: VillageState,
  ids: readonly number[],
  journeyId: string,
  retinue: readonly number[],
): JourneyRefusal | null {
  const day = state.lastDay;
  const fresh = assess(state, day);
  if (fresh.refusal !== null) return fresh.refusal;
  if (!retinueFits(fresh.men, retinue)) return 'bad-retinue';
  sendAway(state, day, ids, { kind: 'journey', refId: journeyId });
  return null;
}

/** Vrátí muže domů (nepovedlo se založit výjezd). */
async function release(
  villages: VillageRepository,
  villageId: string,
  journeyId: string,
): Promise<void> {
  await editVillage<JourneyRefusal>(
    villages,
    villageId,
    (state) => {
      for (const p of state.people) if (p.away?.refId === journeyId) delete p.away;
      return null;
    },
    'bad-retinue',
  );
}
