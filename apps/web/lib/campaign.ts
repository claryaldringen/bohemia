import 'server-only';
import {
  campaignsOf,
  campaignViewFor,
  commandCampaign,
  type CampaignCells,
  type CampaignCommand,
  type CampaignCommandDeps,
  type CampaignCommandResult,
  type MarchGrid,
  type TargetDwelling,
} from '@bohemia/game';
import { createTrailExitSource } from '@bohemia/db';
import { createCampaignCells, currentWorld, LruCache } from '@bohemia/server';
import { getDatabase } from './db';
import { gameDeps } from './game';
import type { CampaignSummary, CampaignView } from './campaign-view';

// Živé vedení a pohled na tažení (war.md – Velení, Mlha války; plán 2026-11-03 – Úloha 6.14):
// composition root – use-casy `campaignViewFor` a `commandCampaign` nad skutečnými repozitáři.
// Herní logika je v `packages/game/src/application/campaign-view.ts`.

/**
 * Mřížky mapy cíle pro dohled v lese – pohled se počítá s každou změnou bodu tažení (událost
 * `campaign`, server-events.md – Válka), mřížka se mění po dnech.
 */
const SIGHT_GRIDS = new LruCache<string, MarchGrid>(4);
/** Obydlí cílových vsí po herních dnech – celý stav vsi se nečte při každém dotazu pohledu. */
const TARGETS = new LruCache<string, readonly TargetDwelling[]>(16);
let cells: CampaignCells | null = null;

/** Mapy políček pro tažení (sdílená mezipaměť krajin, prázdná políčka v LRU) – jedny na proces. */
export function campaignCells(): CampaignCells {
  if (cells) return cells;
  const deps = gameDeps();
  cells = createCampaignCells({
    settlements: deps.settlements,
    villages: deps.villages,
    landscapes: deps.landscapes,
    worldSeed: deps.worldSeed,
    // vstupy zemských stezek sousedních vsí ze souhrnů (trade.md – Pokračování na sousední mapě)
    trailExits: createTrailExitSource(getDatabase()),
  });
  return cells;
}

function commandDeps(): CampaignCommandDeps {
  const deps = gameDeps();
  return {
    campaigns: deps.campaigns,
    cells: campaignCells(),
    villages: deps.villages,
    // vazal ve službě – jen s muži ze vsi, kterou drží (`mayHandleCampaign`)
    settlements: deps.settlements,
    grids: SIGHT_GRIDS,
    targets: TARGETS,
    world: currentWorld(),
    // co rod hráče ví o mapě cíle (docs/code/war.md – Živé vedení a pohled)
    knowledge: deps.knowledge,
    houses: deps.houses,
  };
}

/** Pohled hráče na tažení; null = tažení není, nebo v něm hráč nemá vůdcovství ani muže. */
export function campaignViewForPlayer(
  playerId: string,
  campaignId: string,
  sinceTick: number,
): Promise<CampaignView | null> {
  return campaignViewFor(commandDeps(), { playerId, campaignId, sinceTick });
}

/**
 * Pokyn hráče do tažení na takt teď + 2 – takt záměru, nebo odmítnutí (důvod se neprozradí, kromě
 * místa, kam vojsko nedojde).
 */
export function commandCampaignForPlayer(
  playerId: string,
  campaignId: string,
  command: CampaignCommand,
): Promise<CampaignCommandResult> {
  return commandCampaign(commandDeps(), { playerId, campaignId, command, nowMs: Date.now() });
}

/**
 * Běžící tažení, která hráč vede nebo ve kterých jdou jeho muži (panel Vojsko) – bez starého
 * vojska z doby před Začít znovu (rod tažení už není živým rodem hráče).
 */
export function campaignsOfPlayer(playerId: string): Promise<CampaignSummary[]> {
  const deps = gameDeps();
  return campaignsOf(
    {
      campaigns: deps.campaigns,
      houses: deps.houses,
      villages: deps.villages,
      settlements: deps.settlements,
    },
    { playerId },
  );
}
