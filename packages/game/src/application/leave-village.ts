import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  obstaclesOf,
  type Landscape,
} from '../domain/landscape';
import {
  DIRECTIONS,
  NEW_VILLAGE_MIN_DISTANCE_M,
  SEAT_CELL,
  builtTrail,
  checkDwellingPlacement,
  departVillage,
  departureBlock,
  distanceToVillages,
  edgeDistanceM,
  journeyArrived,
  neighbourCell,
  neighbourSnapshot,
  placementVillageOf,
  sameCell,
  settlersOf,
  squareCenter,
  suggestVillageName,
  travelDays,
  travellingVillage,
  villageCentre,
  villagePoints,
  withNeighbours,
  type Direction8,
  type Position,
  type Settlers,
  type VillageState,
} from '../domain/village';
import { settlementLandscape } from './enter-game';
import { TOO_CLOSE_TO_VILLAGE, foundedVillageState } from './found-village';
import { NOT_PLAYER_VILLAGE, findPlayerVillage } from './player-villages';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';
import { updateLivingVillage, updateVillage } from './update-village';
import type { VillageRecord, VillageRepository } from './villages';

// Odchod do nové vsi (migration.md – fáze 3 a 4): domácnosti vybraných obydlí odejdou a založí
// ves jinde na téže mapě (hráč hned umístí první zemnici), nebo na nové mapě vedle ve zvoleném
// směru (cesta 1–3 dny, pak první zemnice). Stará ves zůstane.

export interface LeaveVillageDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  seeds: SeedSource;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
}

/**
 * Kam lidé odejdou: na téže mapě s polohou první zemnice nové vsi (`here`), nebo na novou mapu
 * ve směru (`map`).
 */
export type LeaveDestination =
  { kind: 'here'; dwelling: Position } | { kind: 'map'; direction: Direction8 };

export interface LeaveVillageInput {
  playerId: string;
  /** Ves, ze které lidé odcházejí. */
  villageId: string;
  /** Dnešní herní den hráče (index dne). */
  today: number;
  /** Obydlí, jejichž domácnosti odejdou (všichni jejich lidé). */
  dwellingIds: number[];
  destination: LeaveDestination;
}

export type LeaveVillageResult =
  | {
      ok: true;
      /** Stará ves po odchodu. */
      from: VillageRecord;
      /** Nová ves – založená (na téže mapě), nebo lidé na cestě (nová mapa). */
      to: VillageRecord;
      /** Sídlo nové vsi (na nové mapě nové sídlo). */
      settlement: Settlement;
    }
  | { ok: false; reason: string };

/** Neznámý směr odchodu. */
export const UNKNOWN_LEAVE_DIRECTION = 'Neznámý směr.';
/** Tím směrem už leží vlastní ves hráče. */
export const OWN_MAP_THERE = 'Tím směrem už leží tvoje ves – stěhování mezi vsemi zatím není.';
/** Sídlo, ze kterého se odchází, nemá polohu v mřížce (jen sídelní ji dostane). */
export const NO_WORLD_CELL = 'Tahle mapa nemá místo ve světě – na novou mapu odtud nejde odejít.';

/**
 * Domácnosti obydlí `dwellingIds` odejdou založit novou ves. Na téže mapě (`here`) server ověří
 * místo první zemnice (krajina, stavby a půda všech vsí mapy, nejméně 300 m od nich) dřív, než
 * lidé odejdou; ves se pak hned založí s osadníky. Na novou mapu (`map`) sídelní sídlo dostane
 * polohu (0, 0), vedle ve směru vznikne nové sídlo s novou krajinou (prázdné vlastní sídlo na tom
 * políčku se použije znovu) a lidé jsou na cestě 1–3 dny (`travelDays`). Stará ves zůstane – i
 * opuštěná, když odešli všichni.
 */
export async function leaveVillage(
  deps: LeaveVillageDeps,
  input: LeaveVillageInput,
): Promise<LeaveVillageResult> {
  const found = await findPlayerVillage(deps, input);
  if (!found) return { ok: false, reason: NOT_PLAYER_VILLAGE };
  const landscape = settlementLandscape(found.settlement, deps.landscapes);
  const { destination } = input;
  if (destination.kind === 'here') {
    const problem = await herePlacementProblem(
      deps,
      found.settlement.id,
      landscape,
      destination,
      input.today,
    );
    if (problem) return { ok: false, reason: problem };
    const departed = await depart(deps, input, landscape);
    if (!departed.ok) return departed;
    const state = foundedVillageState(
      deps.seeds.nextSeed(),
      {
        landscape,
        today: input.today,
        dwelling: destination.dwelling,
        settlers: departed.settlers,
      },
      undefined,
      await deps.villages.weatherSeedOf(found.settlement.id),
    );
    if (!state.ok) throw new Error(`Ves z osadníků nešla založit: ${state.reason}`);
    const to = await deps.villages.add(
      found.settlement.id,
      suggestVillageName(deps.seeds.nextSeed()),
      state.state,
    );
    return { ok: true, from: departed.from, to, settlement: found.settlement };
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
  const departed = await depart(deps, input, landscape, destination.direction);
  if (!departed.ok) return departed;
  const seed = deps.seeds.nextSeed();
  const to = await deps.villages.add(
    target.settlement.id,
    suggestVillageName(seed),
    travellingVillage(departed.settlers, seed, departed.day, {
      direction: destination.direction,
      departedDay: departed.day,
      arrivalDay: departed.day + departed.travelDays,
    }),
  );
  return { ok: true, from: departed.from, to, settlement: target.settlement };
}

/**
 * Proč na téže mapě první zemnice nové vsi na místě `destination` stát nemůže: krajina, stavby
 * a půda všech vsí mapy (`foreign`) a vzdálenost nejméně NEW_VILLAGE_MIN_DISTANCE_M od jejich
 * staveb. Česky, nebo null.
 */
async function herePlacementProblem(
  deps: LeaveVillageDeps,
  settlementId: string,
  landscape: Landscape,
  destination: { dwelling: Position },
  today: number,
): Promise<string | null> {
  const villages = (await deps.villages.listBySettlement(settlementId)).map((v) => v.state);
  const points = villages.flatMap((v) =>
    villagePoints(v, (x, y, grid) => squareCenter(landscape, grid, { x, y })),
  );
  if (distanceToVillages(destination.dwelling, points) < NEW_VILLAGE_MIN_DISTANCE_M) {
    return TOO_CLOSE_TO_VILLAGE;
  }
  // nová ves ještě nemá nic – zná jen stavby a paseky ostatních vsí mapy
  const empty = emptyVillage(today);
  const village = placementVillageOf(
    withNeighbours(empty, neighbourSnapshot(villages, today)),
    today,
  );
  const check = checkDwellingPlacement(
    landscape,
    village,
    'zemnice',
    destination.dwelling,
    obstaclesOf(landscape),
  );
  return check.ok ? null : (check.reason ?? 'Sem zemnice nepatří.');
}

/** Prázdná ves pro kontrolu umístění první zemnice (bez lidí a staveb). */
function emptyVillage(day: number): VillageState {
  return {
    seed: 0,
    foundedDay: day,
    lastDay: day,
    nextId: 1,
    people: [],
    dwellings: [],
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
  };
}

/**
 * Sídlo nové mapy ve směru `direction` od sídla `from`: sídelní sídlo bez polohy dostane
 * (0, 0); na sousedním políčku mřížky vznikne nové sídlo s novou krajinou, nebo se použije
 * vlastní sídlo bez vsí, které tam už je. Vlastní ves tím směrem → OWN_MAP_THERE.
 */
async function targetSettlement(
  deps: LeaveVillageDeps,
  from: Settlement,
  playerId: string,
  direction: Direction8,
): Promise<{ ok: true; settlement: Settlement } | { ok: false; reason: string }> {
  let cell = from.worldCell;
  if (cell === null) {
    if (!from.isSeat) return { ok: false, reason: NO_WORLD_CELL };
    const placed = await deps.settlements.assignWorldCell(from.id, SEAT_CELL);
    cell = placed?.worldCell ?? null;
    if (cell === null) return { ok: false, reason: NO_WORLD_CELL };
  }
  const targetCell = neighbourCell(cell, direction);
  const active = await deps.settlements.listActive(playerId);
  const existing = active.find((s) => s.worldCell !== null && sameCell(s.worldCell, targetCell));
  if (existing) {
    const villages = await deps.villages.listBySettlement(existing.id);
    return villages.length > 0
      ? { ok: false, reason: OWN_MAP_THERE }
      : { ok: true, settlement: existing };
  }
  const accepted = generateAcceptedLandscape(deps.seeds.nextSeed());
  const created = await deps.settlements.create({
    ownerId: playerId,
    landscapeSeed: accepted.seed,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: targetCell,
  });
  if (created) return { ok: true, settlement: created };
  // souběžný odchod týmž směrem mezitím sídlo založil
  const again = (await deps.settlements.listActive(playerId)).find(
    (s) => s.worldCell !== null && sameCell(s.worldCell, targetCell),
  );
  return again ? { ok: true, settlement: again } : { ok: false, reason: OWN_MAP_THERE };
}

/**
 * Odchod ze staré vsi (dopočítané do dneška): domácnosti odejdou (`departVillage`), stará ves se
 * uloží. Vrátí ji, osadníky, den odchodu a dny cesty na novou mapu ve směru `direction`
 * (od dvorce ke kraji mapy, po hotové stezce 1 den).
 */
async function depart(
  deps: LeaveVillageDeps,
  input: LeaveVillageInput,
  landscape: Landscape,
  direction?: Direction8,
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
      const block = departureBlock(state, input.dwellingIds);
      if (block) return { ok: false, reason: block };
      const day = state.lastDay;
      const days = direction
        ? travelDays(
            edgeDistanceM(landscape, villageCentre(state), direction),
            builtTrail(state, direction) !== null,
          )
        : 0;
      const departed = departVillage(state, day, input.dwellingIds, direction);
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
      state: { ...founded.state, chronicle: [...state.chronicle, ...founded.state.chronicle] },
    };
  });
}
