import type { WorldClock } from '../domain/calendar';
import {
  countDeclaredHunt,
  huntDenied,
  huntingDogs,
  huntOnDay,
  pickQuarry,
  reserveBeaters,
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
  upgradeJourney,
  type CampaignVillage,
  type HuntStart,
} from '../domain/war';
import type { CampaignCells } from './campaigns';
import { journeyHome } from './expedition';
import { huntRunning } from './expedition-view';
import type { HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import { editVillage, findPlayerVillage, type PlayerVillagesDeps } from './player-villages';
import type { SeedSource } from './settlements';
import type { VillageRepository } from './villages';

// Vyhlášení lovu (hunting.md – Pravidla 2, 3; plán 2026-11-22-hunting – Rozhodnutí 1, 3, 4,
// Úloha 9): hráč vyhlásí lov tlačítkem dvorce, kdykoli to dovolí důvody `huntDenied` (hájení,
// běžící lov, zvěř v lese vsi, honci na zítřek) – bez meze „jednou za 3 dny“. Ves zaplatí práci
// honců zítra a zapíše pořadí vyhlášení (štítek losu zvířete); lov běží ve výpravě domovské vsi –
// bez běžící výpravy v nové jen s lovem, jinak záměrem `hunt` výpravě, která už běží (lidé venku
// zůstanou, kde jsou).

export interface DeclareHuntDeps extends PlayerVillagesDeps {
  villages: VillageRepository;
  journeys: Pick<JourneyRepository, 'activeIn' | 'checkpoint' | 'create' | 'addIntent'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  /** Mapy políček – mřížka pochodu domovské mapy (dveře lesa) a dvorec nové výpravy. */
  cells: CampaignCells;
  world: WorldClock;
  seeds: SeedSource;
  /** Nové id výpravy (uuid). */
  newId: () => string;
}

/**
 * Lov běží ve výpravě `journeyId`, nebo proč nejde: důvod vsi (`HuntDenied`), cizí ves nebo rod
 * bez místa na mapě světa (`no-village`), zápis vsi se při souběhu nepovedl ani po opakování
 * (`busy`).
 */
export type DeclareHuntResult =
  { ok: true; journeyId: string } | { ok: false; reason: HuntDenied | 'no-village' | 'busy' };

const NO_VILLAGE = { ok: false, reason: 'no-village' } as const;

/**
 * Hráč vyhlásí lov ve vsi `villageId` (volající drží zámek hráče – web `guardedAction`):
 * 1. ves hráče (`no-village`), běžící výprava vsi (`activeIn`) a lov v ní (`huntRunning`);
 * 2. důvody na den honců – zítřek dne vsi (`huntDenied(stav, lastDay + 1, běží)`; běží i tehdy, je-li
 *    na ten den ve vsi už lov hráče nebo správce – `huntOnDay`, jeden lov ve vsi za den) – napřed na
 *    uloženém stavu (bez mapy), znovu na čerstvém při zápisu; důvod se vrátí a nic se neuloží;
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
  const id = await deps.journeys.activeIn(input.playerId, villageId);
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const journey = point ? upgradeJourney(point.state) : null;
  const running = huntRunning(journey);
  const denied = deniedOn(own.village.state, running);
  if (denied !== null) return { ok: false, reason: denied };

  // domov výpravy: běžící, jinak nové – rod hráče s místem na mapě světa (jako `musterExpedition`)
  const cell = journey?.home.cell ?? own.settlement.worldCell;
  const houseId = journey?.houseId ?? (await placedHouse(deps, input.playerId));
  if (!cell || houseId === null) return NO_VILLAGE;
  const map = await deps.cells.mapOf(cell);
  const chosen: { start?: HuntStart; home?: CampaignVillage } = {};
  const failed = await editVillage<HuntDenied | 'busy'>(
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
      return null;
    },
    'busy',
  );
  if (failed !== null) return { ok: false, reason: failed };
  const start = chosen.start!;

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
        houseId,
        home: structuredClone(chosen.home!),
        recruits: [],
        startMs: input.now.getTime(),
        hunt: start,
      },
      deps.world,
    ),
    input.now,
  );
  return { ok: true, journeyId };
}

/**
 * Proč ves lov nevyhlásí (`huntDenied` na den honců – zítřek dne vsi): lov běží ve výpravě
 * (`running`), nebo je na ten den ve vsi už lov hráče či správce (`huntOnDay` – jeden lov ve vsi za
 * den, návrh Clauda); null – smí.
 */
function deniedOn(state: VillageState, running: boolean): HuntDenied | null {
  const day = state.lastDay + 1;
  return huntDenied(state, day, running || huntOnDay(state, day));
}

/** Rod hráče s místem na mapě světa (id), jinak null – výprava nemá odkud vyjet. */
async function placedHouse(deps: DeclareHuntDeps, playerId: string): Promise<string | null> {
  const house = await deps.houses.activeOf(playerId);
  return house && house.placedAt !== null ? house.id : null;
}
