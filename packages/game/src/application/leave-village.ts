import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  DIRECTIONS,
  builtTrail,
  checkDwellingPlacement,
  checkSonLeader,
  departVillage,
  departWithSon,
  departureBlock,
  edgeDistanceM,
  journeyArrived,
  placementVillageOf,
  settlersOf,
  suggestVillageName,
  travelDays,
  travellingVillage,
  villageCentre,
  type Direction8,
  type Position,
  type Settlers,
} from '../domain/village';
import { settlementLandscape } from './enter-game';
import { foundedVillageState } from './found-village';
import { NOT_PLAYER_VILLAGE, findPlayerVillage } from './player-villages';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';
import { updateLivingVillage, updateVillage } from './update-village';
import { targetSettlement } from './new-village';
import type { VillageRecord, VillageRepository } from './villages';

// Odchod do nové vsi (migration.md – fáze 3 a 4): domácnosti vybraných obydlí odejdou a založí
// ves na nové mapě vedle ve zvoleném směru (cesta 1–3 dny, pak první zemnice). Jedna ves, jedna
// mapa – na téže mapě druhá ves nevznikne. Stará ves zůstane.

export interface LeaveVillageDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  seeds: SeedSource;
  /** Seed světa – krajina nové mapy se odvodí z jejího políčka. */
  worldSeed: number;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
}

/**
 * Kam lidé odejdou: na novou mapu ve směru (`map`). Jedna ves, jedna mapa (Martin 1. 11. 2026:
 * „Jedna ves, jedna mapa“) – na téže mapě novou ves založit nejde.
 */
export interface LeaveDestination {
  kind: 'map';
  direction: Direction8;
}

interface LeaveVillageBase {
  playerId: string;
  /** Ves, ze které lidé odcházejí. */
  villageId: string;
  /** Dnešní herní den hráče (index dne). */
  today: number;
  destination: LeaveDestination;
}

/**
 * Kdo odchází: domácnosti vybraných obydlí (`dwellingIds` – všichni jejich lidé), nebo syn
 * vojvody s poměrnou částí vsi (`sonId` – lord.md, Dělení vsi; server ověří `checkSonLeader`).
 */
export type LeaveVillageInput = LeaveVillageBase &
  ({ dwellingIds: number[]; sonId?: never } | { sonId: number; dwellingIds?: never });

export type LeaveVillageResult =
  | {
      ok: true;
      /** Stará ves po odchodu. */
      from: VillageRecord;
      /** Nová ves – lidé na cestě na novou mapu. */
      to: VillageRecord;
      /** Sídlo nové vsi – nová mapa. */
      settlement: Settlement;
    }
  | { ok: false; reason: string };

/** Neznámý směr odchodu. */
export const UNKNOWN_LEAVE_DIRECTION = 'Neznámý směr.';
/** Cíl odchodu jinde než na nové mapě (jedna ves, jedna mapa – migration.md). */
export const LEAVE_ONLY_TO_NEW_MAP = 'Odejít jde jen na novou mapu.';
export { FOREIGN_MAP_THERE, NO_WORLD_CELL, OWN_MAP_THERE } from './new-village';

/**
 * Domácnosti obydlí `dwellingIds` – nebo syn vojvody `sonId` s poměrnou částí vsi (lord.md – Dělení
 * vsi; vojvodou nové vsi je on) – odejdou založit novou ves na nové mapě (jedna ves, jedna mapa –
 * jiný cíl než `map` server odmítne): sídelní sídlo dostane polohu (0, 0), vedle ve směru vznikne
 * nové sídlo s novou krajinou (prázdné vlastní sídlo na tom políčku se použije znovu) a lidé jsou
 * na cestě 1–3 dny (`travelDays`). Stará ves zůstane – i opuštěná, když odešli všichni.
 */
export async function leaveVillage(
  deps: LeaveVillageDeps,
  input: LeaveVillageInput,
): Promise<LeaveVillageResult> {
  const found = await findPlayerVillage(deps, input);
  if (!found) return { ok: false, reason: NOT_PLAYER_VILLAGE };
  const landscape = settlementLandscape(found.settlement, deps.landscapes);
  const { destination } = input;
  // jedna ves, jedna mapa – odejít jde jen na novou mapu (vstup z klienta může nést cokoli)
  if ((destination as { kind?: unknown }).kind !== 'map') {
    return { ok: false, reason: LEAVE_ONLY_TO_NEW_MAP };
  }
  if (!DIRECTIONS.includes(destination.direction)) {
    return { ok: false, reason: UNKNOWN_LEAVE_DIRECTION };
  }
  const target = await targetSettlement(
    deps,
    found.settlement,
    input.playerId,
    destination.direction,
  );
  if (!target.ok) return target;
  const sonVillageName = sonVillage(deps, input);
  const departed = await depart(deps, input, landscape, destination.direction, sonVillageName);
  if (!departed.ok) return departed;
  const seed = deps.seeds.nextSeed();
  // akce hráče jdou pod zámkem hráče (web i worker) a `targetSettlement` ověřil, že sídlo ves nemá
  const to = await deps.villages.create(
    target.settlement.id,
    sonVillageName ?? suggestVillageName(seed),
    travellingVillage(
      departed.settlers,
      seed,
      departed.day,
      {
        direction: destination.direction,
        departedDay: departed.day,
        arrivalDay: departed.day + departed.travelDays,
      },
      false,
    ),
  );
  if (!to) throw new Error(`Na nové mapě ${target.settlement.id} už ves stojí.`);
  return { ok: true, from: departed.from, to, settlement: target.settlement };
}

/** Jméno nové vsi syna vojvody (ze seedu) – odchod domácností ho vybírá až po odchodu. */
function sonVillage(deps: LeaveVillageDeps, input: LeaveVillageInput): string | undefined {
  return input.sonId === undefined ? undefined : suggestVillageName(deps.seeds.nextSeed());
}

/**
 * Odchod ze staré vsi (dopočítané do dneška): domácnosti odejdou (`departVillage`), nebo syn
 * vojvody s poměrnou částí vsi (`departWithSon` – do kroniky jméno nové vsi `villageName`),
 * stará ves se uloží. Vrátí ji, osadníky, den odchodu a dny cesty na novou mapu ve směru
 * `direction` (od dvorce ke kraji mapy, po hotové stezce 1 den).
 */
async function depart(
  deps: LeaveVillageDeps,
  input: LeaveVillageInput,
  landscape: Landscape,
  direction: Direction8,
  villageName?: string,
): Promise<
  | { ok: true; from: VillageRecord; settlers: Settlers; day: number; travelDays: number }
  | { ok: false; reason: string }
> {
  const captured: { outcome: { settlers: Settlers; day: number; travelDays: number } | null } = {
    outcome: null,
  };
  const result = await updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    landscape,
    (state) => {
      const day = state.lastDay;
      const { sonId } = input;
      const block =
        sonId === undefined
          ? departureBlock(state, input.dwellingIds)
          : checkSonLeader(state, sonId, day).reason;
      if (block) return { ok: false, reason: block };
      const days = travelDays(
        edgeDistanceM(landscape, villageCentre(state), direction),
        builtTrail(state, direction) !== null,
      );
      const departed =
        sonId === undefined
          ? departVillage(state, day, input.dwellingIds, direction)
          : departWithSon(state, day, sonId, {
              direction,
              ...(villageName === undefined ? {} : { villageName }),
            });
      captured.outcome = { settlers: departed.settlers, day, travelDays: days };
      return { ok: true, state: departed.state };
    },
  );
  if (!result.ok) return result;
  const { outcome } = captured;
  if (outcome === null) throw new Error('Odchod se nezapsal.');
  const { settlers, day, travelDays: days } = outcome;
  return { ok: true, from: result.village, settlers, day, travelDays: days };
}

export interface SettleJourneyInput {
  playerId: string;
  /** Ves lidí na cestě (záznam na nové mapě). */
  villageId: string;
  today: number;
  /** Poloha první zemnice nové vsi. */
  dwelling: Position;
}

/** Ves není na cestě – nemá co zakládat. */
export const NOT_TRAVELLING = 'Tahle ves už stojí.';
/** Lidé ještě nedorazili. */
export const NOT_ARRIVED = 'Lidé ještě nedorazili – zemnici umístí, až přijdou.';

/**
 * Lidé na cestě dorazili na novou mapu a hráč umístí první zemnici (migration.md – fáze 4): ves
 * se založí z osadníků (lidé, jídlo, stáda) jako při založení – bydlí na staveništi, dokud ji
 * nepostaví. Server místo ověří znovu. Před příjezdem odmítne.
 */
export async function settleJourney(
  deps: LeaveVillageDeps,
  input: SettleJourneyInput,
): Promise<{ ok: true; village: VillageRecord } | { ok: false; reason: string }> {
  const found = await findPlayerVillage(deps, input);
  if (!found) return { ok: false, reason: NOT_PLAYER_VILLAGE };
  const landscape = settlementLandscape(found.settlement, deps.landscapes);
  return updateVillage(deps.villages, input.villageId, input.today, landscape, (state) => {
    if (!state.journey) return { ok: false, reason: NOT_TRAVELLING };
    if (!journeyArrived(state, input.today)) return { ok: false, reason: NOT_ARRIVED };
    const village = placementVillageOf(state, state.lastDay);
    const check = checkDwellingPlacement(
      landscape,
      village,
      'zemnice',
      input.dwelling,
      obstaclesOf(landscape),
    );
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem zemnice nepatří.' };
    const founded = foundedVillageState(
      state.seed,
      {
        landscape,
        today: input.today,
        dwelling: input.dwelling,
        settlers: settlersOf(state),
      },
      undefined,
      state.weatherSeed ?? null,
    );
    if (!founded.ok) return founded;
    // kronika cesty zůstane před založením
    return {
      ok: true,
      state: {
        ...founded.state,
        chronicle: [...state.chronicle, ...founded.state.chronicle],
        ...(state.origin === undefined ? {} : { origin: state.origin }),
      },
    };
  });
}
