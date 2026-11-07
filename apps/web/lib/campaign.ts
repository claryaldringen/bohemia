import 'server-only';
import {
  campaignViewFor,
  commandCampaign,
  type CampaignCells,
  type CampaignCommand,
  type CampaignCommandDeps,
  type MarchGrid,
} from '@bohemia/game';
import { createCampaignCells, currentWorld, LruCache } from '@bohemia/server';
import { gameDeps } from './game';
import type { CampaignSummary, CampaignView } from './campaign-view';

// Živé vedení a pohled na tažení (war.md – Velení, Mlha války; plán 2026-11-03 – Úloha 6.14):
// composition root – use-casy `campaignViewFor` a `commandCampaign` nad skutečnými repozitáři.
// Herní logika je v `packages/game/src/application/campaign-view.ts`.

/** Mřížky mapy cíle pro dohled v lese – pohled se ptá 2× za sekundu, mřížka se mění po dnech. */
const SIGHT_GRIDS = new LruCache<string, MarchGrid>(4);
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
  });
  return cells;
}

function commandDeps(): CampaignCommandDeps {
  const deps = gameDeps();
  return {
    campaigns: deps.campaigns,
    cells: campaignCells(),
    villages: deps.villages,
    grids: SIGHT_GRIDS,
    world: currentWorld(),
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

/** Pokyn hráče do tažení na takt teď + 2; false = odmítnut (důvod se neprozradí). */
export function commandCampaignForPlayer(
  playerId: string,
  campaignId: string,
  command: CampaignCommand,
): Promise<boolean> {
  return commandCampaign(commandDeps(), { playerId, campaignId, command, nowMs: Date.now() });
}

/** Běžící tažení, která hráč vede (panel Vojsko) – cíl a fáze. */
export async function campaignsOfPlayer(playerId: string): Promise<CampaignSummary[]> {
  const deps = gameDeps();
  const out: CampaignSummary[] = [];
  for (const id of await deps.campaigns.activeOf(playerId)) {
    const point = await deps.campaigns.checkpoint(id);
    if (!point) continue;
    const s = point.state;
    out.push({ id, targetName: s.target.name ?? null, phase: s.phase, liveCommand: s.liveCommand });
  }
  return out;
}
