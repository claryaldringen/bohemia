import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  commandParty,
  expeditionViewsFor,
  expeditionVisitorsOn,
  knownMapFor,
  knownVillagesOf,
  musterExpedition,
  type ExpeditionCommand,
  type ExpeditionDeps,
  type ExpeditionResult,
  type ExpeditionView,
  type ExpeditionVisitor,
  type GridCell,
  type MarchGrid,
  type SeenCell,
  type VisitorsDeps,
} from '@bohemia/game';
import { currentWorld, LruCache } from '@bohemia/server';
import { campaignCells } from './campaign';
import { gameDeps } from './game';
import { foreignMapOf, type ForeignMap } from './foreign-map';
import { encodeLandscape } from './landscape-transfer';
import { journeyActionForPlayer } from './village';

// Výpravy (expeditions.md; plán 2026-11-14 – Úloha 7): composition root – use-casy `commandParty`,
// `musterExpedition`, `expeditionViewsFor` a `expeditionVisitorsOn` nad skutečnými repozitáři.
// Herní logika je v `packages/game/src/application/{expedition,expedition-view,journey-view}.ts`.

/** Mřížky mapy skupiny pro ověření rozkazu – pohled se počítá při každé změně výpravy, mřížka se mění po dnech. */
const GRIDS = new LruCache<string, MarchGrid>(4);

function launchDeps(): ExpeditionDeps {
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

/**
 * Příkaz hráče vybraným lidem vsi `villageId` (expeditions.md – Výběr a skupina): napřed rozkaz
 * lidem, kteří už ve výpravě jsou (`commandParty`, jen záměr, bez zámku vsi); jsou-li ve výběru
 * lidé ze vsi, pod zámkem hráče a úpravou vsi je přidá `musterExpedition`.
 */
export async function commandExpeditionForPlayer(
  playerId: string,
  input: { villageId: string; people: number[]; command: ExpeditionCommand },
): Promise<ExpeditionResult | { error: string }> {
  const full = { ...input, playerId, now: new Date() };
  const first = await commandParty(launchDeps(), full);
  if (first.ok || first.reason !== 'recruits') return first;
  return journeyActionForPlayer(playerId, input.villageId, () =>
    musterExpedition(launchDeps(), { ...full, now: new Date() }),
  );
}

/** Pohledy hráče na všechny jeho běžící výpravy (jedna za domovskou ves). */
export function expeditionViewsForPlayer(playerId: string): Promise<ExpeditionView[]> {
  const deps = gameDeps();
  return expeditionViewsFor(
    { journeys: deps.journeys, world: currentWorld(), knowledge: deps.knowledge },
    { playerId },
  );
}

/** Skupiny výprav na mapě vsi hráče (vlastní vždy, cizí jen v dohledu); cizí ves = prázdno. */
export function expeditionVisitorsOnVillage(
  playerId: string,
  villageId: string,
): Promise<ExpeditionVisitor[]> {
  return expeditionVisitorsOn(visitorsDeps(), { playerId, villageId });
}

/**
 * Krajina políčka `cell` pro hráče s výpravou: jen políčka, na kterých stojí některý z jeho
 * hloučků, a jejich sousedé (8 směrů – kam mohou přejít). Jinak null, ať se nic neprozradí.
 */
export async function journeyMapForPlayer(
  playerId: string,
  cell: GridCell,
): Promise<ForeignMap | null> {
  const views = await expeditionViewsForPlayer(playerId);
  const near = views.some((v) =>
    v.parties.some((p) =>
      p.groups.some((g) => Math.abs(g.cell.x - cell.x) <= 1 && Math.abs(g.cell.y - cell.y) <= 1),
    ),
  );
  if (!near) return null;
  return foreignMapOf(playerId, cell);
}

/**
 * Mapa, jak ji zná rod hráče (known-map.ts): krajina políčka a jeho znalost. Rod mapu nezná
 * (nebo je to znalost cizího rodu) → null. Krajina se generuje ze seedu políčka, žádná cizí data.
 */
export async function knownMapForPlayer(
  playerId: string,
  cell: GridCell,
): Promise<{ map: ForeignMap; seen: SeenCell } | null> {
  const known = await knownMapFor(gameDeps(), { playerId, cell });
  if (known === null) return null;
  const map = await campaignCells().mapOf(cell);
  return {
    map: { cell: { x: cell.x, y: cell.y }, landscape: encodeLandscape(map.landscape) },
    seen: known.seen,
  };
}

/** Mapy, které rod hráče zná, a rod, který na nich sídlí. */
export function knownVillagesForPlayer(
  playerId: string,
): Promise<{ cell: GridCell; houseId: string | null }[]> {
  return knownVillagesOf(gameDeps(), { playerId });
}
