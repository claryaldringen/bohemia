import type { WorldClock } from '../domain/calendar';
import {
  countDeclaredHunt,
  huntDenied,
  huntingDogs,
  isVillageAbandoned,
  isVillageExtinct,
  isVillageTravelling,
  pickQuarry,
  reserveBeaters,
  unreserveBeaters,
  type HuntDenied,
} from '../domain/village';
import type { VillageState } from '../domain/village/types';
import {
  continuationsOf,
  huntStartOf,
  INTENT_LEAD_TICKS,
  marchGrid,
  newJourney,
  tickOfMs,
  type CampaignVillage,
  type HuntStart,
  type JourneyState,
} from '../domain/war';
import { journeyCells, type JourneyCells } from './campaigns';
import { journeyHome } from './expedition';
import { villageJourneyHunt } from './expedition-view';
import type { HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import { editVillage, findPlayerVillage, type PlayerVillagesDeps } from './player-villages';
import { isIsolated, type SeedSource, type Settlement, type WorldCell } from './settlements';
import { VILLAGE_ABANDONED, VILLAGE_EXTINCT, VILLAGE_TRAVELLING } from './update-village';
import type { VillageRepository } from './villages';

// Vyhlášení lovu (hunting.md – Pravidla 2, 3; plán 2026-11-22-hunting – Rozhodnutí 1, 3, 4,
// Úloha 9): hráč vyhlásí lov tlačítkem dvorce, kdykoli to dovolí důvody `huntDenied` (hájení,
// běžící lov, zvěř v lese vsi, honci na zítřek) – bez meze „jednou za 3 dny“. Ves zaplatí práci
// honců zítra a zapíše pořadí vyhlášení (štítek losu zvířete); lov běží ve výpravě domovské vsi –
// bez běžící výpravy v nové jen s lovem, jinak záměrem `hunt` výpravě, která už běží (lidé venku
// zůstanou, kde jsou). Ves v odříznuté krajině (sídlo i vsi synů v místní mřížce rodu) loví ve
// výpravě místní mřížky (`localGrid` – hunting.md, Lov odříznutého nováčka): domov na místním
// políčku sídla, mapa z krajiny vsi (`villageMapOf`) a lovci mapu vsi neopustí.

export interface DeclareHuntDeps extends PlayerVillagesDeps {
  villages: VillageRepository;
  journeys: Pick<
    JourneyRepository,
    'activeIn' | 'checkpoint' | 'intentsAfter' | 'create' | 'addIntent'
  >;
  houses: Pick<HouseRepository, 'activeOf'>;
  /**
   * Mapy políček – mřížka pochodu domovské mapy (dveře lesa) a dvorec nové výpravy; ves v místní
   * mřížce rodu z krajiny vsi (`journeyCells`).
   */
  cells: JourneyCells;
  world: WorldClock;
  seeds: SeedSource;
  /** Nové id výpravy (uuid). */
  newId: () => string;
}

/**
 * Lov běží ve výpravě `journeyId`, nebo proč nejde: důvod vsi (`HuntDenied`), cizí ves
 * (`no-village`), sídlo ani v místní mřížce rodu, ani na políčku světa rodu s místem na mapě světa
 * (`unreachable`, jako výprava – `musterExpedition`), ves nežije (vymřelá, opuštěná, lidé na
 * cestě – stejné texty jako u ostatních akcí vsi, `updateLivingVillage`), zápis vsi se při souběhu
 * nepovedl ani po opakování (`busy`).
 */
export type DeclareHuntResult =
  | { ok: true; journeyId: string }
  | { ok: false; reason: HuntDenied | DeadVillage | 'no-village' | 'unreachable' | 'busy' };

/** Ves nežije – texty jako u `updateLivingVillage`. */
type DeadVillage = typeof VILLAGE_EXTINCT | typeof VILLAGE_ABANDONED | typeof VILLAGE_TRAVELLING;

const NO_VILLAGE = { ok: false, reason: 'no-village' } as const;

/**
 * Hráč vyhlásí lov ve vsi `villageId` (volající drží zámek hráče – web `guardedAction`):
 * 1. ves hráče (`no-village`), běžící výprava vsi a lov v ní – v kontrolním bodu, nebo čekající
 *    záměr `hunt` (`villageJourneyHunt`);
 * 2. ves žije (nevymřelá, neopuštěná, ne na cestě) a důvody na den honců – zítřek dne vsi
 *    (`huntDenied(stav, lastDay + 1, běží)`; víc lovů za den smí, každý zaplatí své honce) – napřed na
 *    uloženém stavu (bez mapy), znovu na čerstvém při zápisu; důvod se vrátí a nic se neuloží;
 *    domov výpravy – běžící, jinak ves v místní mřížce rodu (výprava `localGrid` na místním políčku
 *    sídla), nebo rod hráče s místem na mapě světa a sídlo s políčkem světa (jinak `unreachable`,
 *    jako `musterExpedition`);
 * 3. zvíře losem `pickQuarry` (seed vsi, den vsi a pořadí vyhlášení po `countDeclaredHunt`)
 *    a začátek lovu `huntStartOf` z mřížky pochodu domovské mapy – dveře hustého lesa nejbližší
 *    ke dvorci výpravy (běžící, jinak `journeyHome`); mapa bez hustého lesa `no-game`. Jinak ves
 *    zítra uvolní honce (`reserveBeaters`) a uloží se (souběžné zápisy – `busy`);
 * 4. výprava běží → záměr `hunt` na takt teď + `INTENT_LEAD_TICKS` (nejdřív za kontrolním bodem);
 *    jinak – i když mezitím skončila – nová výprava jen s lovem (`newJourney` s `hunt`, bez lidí).
 */
export async function declareHuntInVillage(
  deps: DeclareHuntDeps,
  input: { playerId: string; villageId: string; now: Date },
): Promise<DeclareHuntResult> {
  const own = await findPlayerVillage(deps, input);
  if (!own) return NO_VILLAGE;
  const villageId = own.village.id;
  const { id, journey, running } = await villageJourneyHunt(deps, input.playerId, villageId);
  const denied = deniedOn(own.village.state, running);
  if (denied !== null) return { ok: false, reason: denied };

  // domov výpravy: běžící, jinak nové – ves v místní mřížce rodu, nebo rod hráče s místem na mapě
  // světa (jako `musterExpedition`)
  const from: NewHome | 'no-village' | 'unreachable' = journey
    ? {
        cell: journey.home.cell,
        houseId: journey.houseId,
        ...(journey.localGrid ? { localGrid: true as const } : {}),
      }
    : await newHome(deps, input.playerId, own.settlement);
  if (from === 'no-village') return NO_VILLAGE;
  if (from === 'unreachable') return { ok: false, reason: 'unreachable' };
  const { cell, houseId } = from;
  const local = from.localGrid ? { localGrid: true as const } : {};
  // ves v místní mřížce – krajina vsi, ne políčko světa se stejnými čísly
  const map = await journeyCells(deps.cells, { ...local, home: { villageId, cell } }).mapOf(cell);
  const chosen: { start?: HuntStart; home?: CampaignVillage; day?: number } = {};
  const failed = await editVillage<HuntDenied | DeadVillage | 'busy'>(
    deps.villages,
    villageId,
    (state) => {
      const reason = deniedOn(state, running);
      if (reason !== null) return reason;
      const day = state.lastDay;
      countDeclaredHunt(state);
      const w = state.wildlife;
      const quarry = w ? pickQuarry(w, state.seed, day, w.hunt?.declared ?? 0) : null;
      if (quarry === null) return 'no-game';
      const home: CampaignVillage = journey?.home ?? {
        villageId,
        name: own.village.name,
        cell: { ...cell },
        pos: journeyHome(state, cell, map.landscape),
      };
      const grid = marchGrid(map.landscape, map.obstacles, state, {
        day,
        trailContinuations: continuationsOf(map, state, day),
      });
      const start = huntStartOf(grid, home.pos, { quarry, day, dogs: huntingDogs(state) });
      if (start === null) return 'no-game';
      reserveBeaters(state, day);
      chosen.start = start;
      chosen.home = home;
      chosen.day = day;
      return null;
    },
    'busy',
  );
  if (failed !== null) return { ok: false, reason: failed };
  const start = chosen.start!;

  try {
    return await startHunt(deps, input, {
      journey,
      id,
      houseId,
      start,
      home: chosen.home!,
      ...local,
    });
  } catch (error) {
    // zápis výpravy selhal – ves lov nezaplatí (jako `musterExpedition` vrací rekruty)
    await editVillage<'gone'>(
      deps.villages,
      villageId,
      (state) => {
        unreserveBeaters(state, chosen.day!);
        return null;
      },
      'gone',
    );
    throw error;
  }
}

/** Lov do výpravy: záměr běžící, jinak nová výprava jen s lovem (domov a lidé beze změny). */
async function startHunt(
  deps: DeclareHuntDeps,
  input: { playerId: string; villageId: string; now: Date },
  run: {
    journey: JourneyState | null;
    id: string | null;
    houseId: string;
    start: HuntStart;
    home: CampaignVillage;
    localGrid?: true;
  },
): Promise<DeclareHuntResult> {
  const { journey, id, start } = run;
  if (journey && id !== null) {
    const tick =
      Math.max(tickOfMs(input.now.getTime(), deps.world), journey.tick) + INTENT_LEAD_TICKS;
    const body = { kind: 'hunt', start } as const;
    if ((await deps.journeys.addIntent(id, { tick, byPlayer: input.playerId, body })) !== null) {
      return { ok: true, journeyId: id };
    }
    // výprava mezitím skončila – lov dostane novou se stejným domovem
  }
  const journeyId = deps.newId();
  await deps.journeys.create(
    newJourney(
      {
        id: journeyId,
        seed: deps.seeds.nextSeed(),
        playerId: input.playerId,
        houseId: run.houseId,
        home: structuredClone(run.home),
        recruits: [],
        startMs: input.now.getTime(),
        hunt: start,
        ...(run.localGrid ? { localGrid: true as const } : {}),
      },
      deps.world,
    ),
    input.now,
  );
  return { ok: true, journeyId };
}

/**
 * Proč ves lov nevyhlásí: nežije (vymřelá, opuštěná, lidé na cestě – spící ves by zaplatila honce,
 * kteří neexistují), nebo `huntDenied` na den honců (zítřek dne vsi) – `running` = lov běží ve
 * výpravě; null – smí.
 */
function deniedOn(state: VillageState, running: boolean): HuntDenied | DeadVillage | null {
  if (isVillageExtinct(state)) return VILLAGE_EXTINCT;
  if (isVillageAbandoned(state)) return VILLAGE_ABANDONED;
  if (isVillageTravelling(state)) return VILLAGE_TRAVELLING;
  return huntDenied(state, state.lastDay + 1, running);
}

/** Domov výpravy s lovem: políčko domova, rod a příznak místní mřížky rodu. */
interface NewHome {
  cell: WorldCell;
  houseId: string;
  localGrid?: true;
}

/**
 * Domov nové výpravy s lovem a rod hráče (bez rodu `no-village`): ves v odříznuté krajině (sídlo
 * i ves syna v místní mřížce – `isIsolated`) loví ve výpravě místní mřížky z místního políčka sídla
 * (hunting.md – Lov odříznutého nováčka; Martin 23. 11. 2026: „nováček ať loví“); jinak políčko
 * světa sídla rodu s místem na mapě světa (jako `musterExpedition` – `homeOf`), bez něj výprava nemá
 * odkud vyjet (`unreachable`).
 */
async function newHome(
  deps: DeclareHuntDeps,
  playerId: string,
  settlement: Settlement,
): Promise<NewHome | 'no-village' | 'unreachable'> {
  const house = await deps.houses.activeOf(playerId);
  if (!house) return 'no-village';
  const local = settlement.localCell ?? null;
  if (isIsolated(settlement) && local) {
    return { cell: { x: local.x, y: local.y }, houseId: house.id, localGrid: true };
  }
  if (house.placedAt === null || !settlement.worldCell) return 'unreachable';
  return { cell: settlement.worldCell, houseId: house.id };
}
