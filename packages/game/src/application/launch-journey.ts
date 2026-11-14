import { currentLord } from '../domain/village/people/dynasty';
import { ageYears, isAway, isInjured } from '../domain/village/people/people';
import type { GridCell } from '../domain/village/people/world-grid';
import type { Person, VillageState } from '../domain/village/types';
import { lineCandidates, recruitOf, WAR, type JourneyOrder } from '../domain/war';
import type { WorldClock } from '../domain/calendar';
import type { CampaignCells, CampaignRepository } from './campaigns';
import { musterMounted, type ExpeditionRefusal } from './expedition';
import type { HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import { findPlayerVillage, type PlayerVillage, type PlayerVillagesDeps } from './player-villages';
import type { SeedSource } from './settlements';
import type { VillageRepository } from './villages';

// Výběr družiny a vyslání výjezdu vojvody (lord-control.md – Kdo jede; plán 2026-11-13 – Úloha 2):
// starý vstup webu, dokud ho nenahradí výběr lidí (plán 2026-11-14 – Úloha 9; smaže Úloha 12).
// Ověří vojvodu a družinu po staru (muži rodu od 16 let) a vyšle je přes `musterExpedition`
// (`application/expedition.ts`) – jezdci vyjedou rovnou na koni (`musterMounted`). Volající drží
// zámek hráče (web `guardedAction`) – jen vlastní ves hráče.

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
  journeys: Pick<JourneyRepository, 'activeIn' | 'checkpoint' | 'create' | 'addIntent'>;
  /** Mapy políček – krajina a překážky pro ověření rozkazu a domov výpravy. */
  cells: CampaignCells;
  world: WorldClock;
  seeds: SeedSource;
  /** Nové id výjezdu (uuid). */
  newId: () => string;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku (`houseAtWarOn`)? */
  atWar: (playerId: string, cell: GridCell) => Promise<boolean>;
}

/**
 * Kandidáti vsi ve dni `day` a důvod stavu vsi (vojvoda), proč výjezd nejde; null = jde. Kůň a síla
 * jako u výpravy (`recruitOf` – na koni síla na koni).
 */
function assess(
  state: VillageState,
  day: number,
): { refusal: JourneyRefusal | null; lord: JourneyCandidate | null; men: JourneyCandidate[] } {
  const lord = currentLord(state);
  const candidate = (p: Person, isLord: boolean): JourneyCandidate => {
    const recruit = recruitOf(state, p, day);
    return {
      personId: p.id,
      name: p.name ?? '',
      age: ageYears(p.bornDay, day),
      lord: isLord,
      mounted: recruit.horseId !== undefined,
      strength: recruit.strengthMounted ?? recruit.strength,
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
 * Hráč vyšle vojvodu s družinou `retinue` (id mužů vsi, bez vojvody) – adaptér na
 * `musterExpedition` s `[vojvoda, ...družina]` a prvním rozkazem. Napřed po staru vojvoda
 * a družina (`JourneyRefusal`), pak ověření rozkazu, odchod ze vsi a založení výjezdu use-casem
 * výpravy (selže-li založení, muži jsou zpět doma a chyba jde dál). Cizí ves a ves bez vojvody:
 * `no-lord`; rod bez místa na mapě světa nemá kam jet (`unreachable`).
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
  const view = await viewOf(deps, own, input.playerId, own.village.state.lastDay);
  if (view.refusal !== null) return { ok: false, reason: view.refusal };
  if (!retinueFits(view.men, input.retinue)) return { ok: false, reason: 'bad-retinue' };
  const done = await musterMounted(deps, {
    playerId: input.playerId,
    villageId: input.villageId,
    people: [view.lord!.personId, ...input.retinue],
    command: { kind: 'order', order: input.order },
    now: input.now,
  });
  return done.ok ? done : { ok: false, reason: launchRefusal(done.reason) };
}

/**
 * Důvod výpravy po staru: cizí ves `no-lord`; kdo mezi výběrem a odjezdem přestal smět (souběžný
 * zápis vsi) `bad-retinue`; cíl a napadená ves beze změny.
 */
function launchRefusal(reason: ExpeditionRefusal): JourneyRefusal {
  switch (reason) {
    case 'no-village':
      return 'no-lord';
    case 'village-attacked':
    case 'unreachable':
    case 'war-there':
      return reason;
    default:
      return 'bad-retinue';
  }
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
