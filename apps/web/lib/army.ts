import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  ageYears,
  isVillageAbandoned,
  isVillageExtinct,
  kinInTarget,
  launchCampaign,
  lineCandidates,
  musterOf,
  musterSeed,
  planCampaign,
  villageHorses,
  villagerCandidates,
  type CampaignEstimate,
  type CampaignPlan,
  type GridCell,
  type LaunchDeps,
  type VillageRecord,
} from '@bohemia/game';
import { currentWorld } from '@bohemia/server';
import { gameDeps, playerToday, requireVillageRight } from './game';
import { launchCampaignActionForPlayer, planCampaignActionForPlayer } from './village';
import type { ArmyPanelData, ArmyTargetView, ArmyVillageView } from './army-view';

// Composition root panelu Vojsko (war.md – Velení a příprava tažení): panel čte vsi rodu a cíle
// ve válce, odhad a vyslání jsou use-casy `planCampaign` a `launchCampaign` nad skutečnými
// repozitáři. Herní logika je v `packages/game/src/application/{plan,launch}-campaign.ts`.

const ORIGIN: GridCell = { x: 0, y: 0 };

function launchDeps(): LaunchDeps {
  const deps = gameDeps();
  return {
    houses: deps.houses,
    wars: deps.wars,
    notices: deps.notices,
    villages: deps.villages,
    settlements: deps.settlements,
    landscapes: deps.landscapes,
    world: currentWorld(),
    campaigns: deps.campaigns,
    seeds: deps.seeds,
    newId: randomUUID,
    // útok po ohlášeném průchodu ohlášení zruší, vyslání ho naváže na tažení (war.md – Pohyb)
    passages: deps.passages,
    // přepadení přes rozsudek pána „mír“ = neposlušnost (vassalage.md – Mír a spory)
    disputes: deps.disputes,
    vassalages: deps.vassalages,
  };
}

const alive = (record: VillageRecord): boolean =>
  !isVillageExtinct(record.state) && !isVillageAbandoned(record.state);

/**
 * Panel Vojsko: vsi rodu s muži rodu a vesničany, cíle (vsi rodů ve válce) a – s vybraným cílem –
 * dobrovolníci a ochotní / neochotní po vsích. Jen pro hráče s právem `war` ve vsi `villageId`.
 */
export async function armyPanelForPlayer(
  playerId: string,
  input: { villageId: string; targetVillageId: string | null },
): Promise<ArmyPanelData | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const right = await requireVillageRight(playerId, input.villageId, 'war', today.day);
  if (typeof right === 'string') return { error: right };
  const deps = gameDeps();
  const house = await deps.houses.activeOf(playerId);
  if (!house) return { error: 'Nemáš živý rod.' };
  let targetCell: GridCell | null = null;
  if (input.targetVillageId !== null) {
    const target = await deps.villages.find(input.targetVillageId);
    const settlement = target ? await deps.settlements.find(target.settlementId) : null;
    if (!target || !settlement) return { error: 'Ta ves zanikla.' };
    targetCell = settlement.worldCell ?? ORIGIN;
  }
  const villages: ArmyVillageView[] = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const record of await deps.villages.listBySettlement(settlement.id)) {
      if (!alive(record)) continue;
      villages.push(armyVillage(record, settlement.worldCell ?? ORIGIN, targetCell, input));
    }
  }
  return {
    villages,
    targets: await warTargets(deps, house.id),
    lord: house.lord,
  };
}

function armyVillage(
  record: VillageRecord,
  from: GridCell,
  targetCell: GridCell | null,
  input: { targetVillageId: string | null },
): ArmyVillageView {
  const state = record.state;
  const day = state.lastDay;
  const horses = new Set(
    villageHorses(state).flatMap((h) => (h.riderId === undefined ? [] : [h.riderId])),
  );
  const candidates = villagerCandidates(state, day);
  const muster =
    targetCell !== null && input.targetVillageId !== null
      ? musterOf(
          state,
          day,
          kinInTarget(state, from, targetCell),
          musterSeed(state, input.targetVillageId),
        )
      : null;
  return {
    id: record.id,
    name: record.name,
    storesKg: Math.max(0, Math.floor(state.storesKg - (state.reservedSeedKg ?? 0))),
    lineMen: lineCandidates(state, day).map((p) => ({
      personId: p.id,
      name: p.name ?? null,
      age: ageYears(p.bornDay, day),
      mounted: horses.has(p.id),
    })),
    candidates: candidates.length,
    volunteers: muster?.volunteers ?? [],
    others: muster?.others ?? [],
    willing: muster?.willing ?? 0,
    unwilling: muster?.unwilling ?? 0,
  };
}

/** Vsi rodů, se kterými rod válčí. */
async function warTargets(
  deps: ReturnType<typeof gameDeps>,
  houseId: string,
): Promise<ArmyTargetView[]> {
  const out: ArmyTargetView[] = [];
  for (const war of await deps.wars.activeOf(houseId)) {
    const enemyId = war.houses[0] === houseId ? war.houses[1] : war.houses[0];
    const enemy = await deps.houses.byId(enemyId);
    if (!enemy || enemy.endedAt !== null || enemy.playerId === null) continue;
    const lordRecord = enemy.lord ? await deps.villages.find(enemy.lord.villageId) : null;
    const lordName =
      lordRecord?.state.people.find((p) => p.id === enemy.lord?.personId)?.name ?? null;
    for (const settlement of await deps.settlements.listActive(enemy.playerId)) {
      for (const record of await deps.villages.listBySettlement(settlement.id)) {
        if (alive(record)) out.push({ villageId: record.id, name: record.name, lordName });
      }
    }
  }
  return out;
}

/** Odhad tažení (síla, cesta, zásoby) nebo důvod odmítnutí česky; nic nemění. */
export function planCampaignForPlayer(
  playerId: string,
  plan: CampaignPlan,
): Promise<CampaignEstimate | { error: string }> {
  return planCampaignActionForPlayer(playerId, plan.assemblyVillageId, async (ctx) => {
    const estimate = await planCampaign(launchDeps(), {
      playerId,
      plan,
      today: ctx.day,
      now: new Date(),
    });
    return typeof estimate === 'string' ? { error: estimate } : estimate;
  });
}

/** Vyšle tažení; `{ ok }`, nebo důvod odmítnutí česky. */
export function launchCampaignForPlayer(
  playerId: string,
  plan: CampaignPlan,
): Promise<{ ok: true } | { error: string }> {
  return launchCampaignActionForPlayer(playerId, plan.assemblyVillageId, async (ctx) => {
    const result = await launchCampaign(launchDeps(), {
      playerId,
      plan,
      today: ctx.day,
      now: new Date(),
    });
    return result.ok ? { ok: true as const } : { error: result.reason };
  });
}
