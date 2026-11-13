import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  commandJourney,
  journeyCandidates,
  journeyViewFor,
  launchJourney,
  visitorsOn,
  type GridCell,
  type JourneyCandidate,
  type JourneyCommandDeps,
  type JourneyCommandResult,
  type JourneyOrder,
  type JourneyRefusal,
  type JourneyView,
  type JourneyVisitor,
  type LaunchJourneyDeps,
  type MarchGrid,
  type VisitorsDeps,
} from '@bohemia/game';
import { currentWorld, LruCache } from '@bohemia/server';
import { campaignCells } from './campaign';
import { gameDeps } from './game';
import type { ForeignMap } from './foreign-map';
import { encodeLandscape } from './landscape-transfer';
import { journeyActionForPlayer } from './village';

// Výjezd vojvody (lord-control.md; plán 2026-11-13 – Úloha 7): composition root – use-casy
// `journeyCandidates`, `launchJourney`, `journeyViewFor`, `commandJourney` a `visitorsOn` nad
// skutečnými repozitáři. Herní logika je v `packages/game/src/application/{launch-journey,
// journey-view}.ts`.

/** Mřížky mapy skupiny pro ověření rozkazu – pohled se ptá 2× za sekundu, mřížka se mění po dnech. */
const GRIDS = new LruCache<string, MarchGrid>(4);

function commandDeps(): JourneyCommandDeps {
  const deps = gameDeps();
  return {
    journeys: deps.journeys,
    world: currentWorld(),
    cells: campaignCells(),
    villages: deps.villages,
    grids: GRIDS,
    atWar: deps.atWar,
  };
}

function launchDeps(): LaunchJourneyDeps {
  const deps = gameDeps();
  return {
    settlements: deps.settlements,
    villages: deps.villages,
    campaigns: deps.campaigns,
    journeys: deps.journeys,
    houses: deps.houses,
    cells: campaignCells(),
    world: currentWorld(),
    seeds: deps.seeds,
    newId: randomUUID,
    atWar: deps.atWar,
  };
}

function visitorsDeps(): VisitorsDeps {
  const deps = gameDeps();
  return {
    settlements: deps.settlements,
    villages: deps.villages,
    journeys: deps.journeys,
    houses: deps.houses,
    cells: campaignCells(),
    grids: GRIDS,
  };
}

/** Kandidáti na výjezd z vlastní vsi `villageId` (vojvoda, muži rodu doma) a důvod, proč nejde. */
export function journeyCandidatesForPlayer(
  playerId: string,
  villageId: string,
): Promise<
  | { refusal: JourneyRefusal | null; lord: JourneyCandidate | null; men: JourneyCandidate[] }
  | { error: string }
> {
  return journeyActionForPlayer(playerId, villageId, (ctx) =>
    journeyCandidates(launchDeps(), { playerId, villageId, today: ctx.day }),
  );
}

/** Vyšle vojvodu s družinou z vsi `villageId`; `{ ok }`, nebo důvod odmítnutí. */
export function launchJourneyForPlayer(
  playerId: string,
  input: { villageId: string; retinue: number[]; order: JourneyOrder },
): Promise<
  { ok: true; journeyId: string } | { ok: false; reason: JourneyRefusal } | { error: string }
> {
  return journeyActionForPlayer(playerId, input.villageId, () =>
    launchJourney(launchDeps(), { ...input, playerId, now: new Date() }),
  );
}

/** Rozkaz hráče do jeho běžícího výjezdu – takt záměru, nebo odmítnutí. */
export function commandJourneyForPlayer(
  playerId: string,
  command: JourneyOrder,
): Promise<JourneyCommandResult> {
  return commandJourney(commandDeps(), { playerId, command, nowMs: Date.now() });
}

/** Pohled hráče na jeho běžící výjezd; null = žádný nemá. */
export function journeyViewForPlayer(playerId: string): Promise<JourneyView | null> {
  const deps = gameDeps();
  return journeyViewFor(
    { journeys: deps.journeys, world: currentWorld(), knowledge: deps.knowledge },
    { playerId },
  );
}

/** Jezdci na mapě vsi hráče (vlastní vždy, cizí jen v dohledu); cizí ves = prázdno. */
export function visitorsOnVillage(playerId: string, villageId: string): Promise<JourneyVisitor[]> {
  return visitorsOn(visitorsDeps(), { playerId, villageId });
}

/**
 * Krajina políčka `cell` pro hráče s výjezdem: jen políčko, na kterém skupina stojí, a jeho
 * sousedé (8 směrů – kam může přejít). Jinak null, ať se nic neprozradí.
 */
export async function journeyMapForPlayer(
  playerId: string,
  cell: GridCell,
): Promise<ForeignMap | null> {
  const view = await journeyViewForPlayer(playerId);
  if (view === null) return null;
  const near = Math.abs(view.cell.x - cell.x) <= 1 && Math.abs(view.cell.y - cell.y) <= 1;
  if (!near) return null;
  const map = await campaignCells().mapOf(cell);
  return { cell: { x: cell.x, y: cell.y }, landscape: encodeLandscape(map.landscape) };
}
