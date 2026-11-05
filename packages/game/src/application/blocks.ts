import { NEGOTIATION_REASONS as R } from '../domain/negotiation';
import type { ChronicleEvent } from '../domain/village';
import type { HouseRepository } from './houses';
import {
  chronicleHouses,
  houseName,
  noticeHouse,
  type NegotiationVillages,
} from './negotiation-chronicle';
import { NO_HOUSE } from './negotiate';
import type { NegotiationRepository } from './negotiations';

// Blokování rodu (vassalage.md – Meze): zablokovaný nemůže navrhovat jednání. Stávající dohody
// blokování neruší, rozběhnuté jednání dvojice se ukončí. Kronika i upozornění jsou neutrální.

export interface BlockDeps extends NegotiationVillages {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  negotiations: NegotiationRepository;
}

export type BlockResult = { ok: true } | { ok: false; reason: string };

/** Hráč za svůj rod zablokuje rod `target`; opakované zablokování nic nezapíše znovu. */
export async function blockPlayer(
  deps: BlockDeps,
  input: { playerId: string; target: string; now: Date; today: number },
): Promise<BlockResult> {
  const blocker = await deps.houses.activeOf(input.playerId);
  if (!blocker) return { ok: false, reason: NO_HOUSE };
  if (blocker.id === input.target) return { ok: false, reason: R.yourselfOnly };
  const blocked = await deps.houses.byId(input.target);
  if (!blocked) return { ok: false, reason: R.extinct };
  const changed = await deps.negotiations.transaction(async (tx): Promise<boolean> => {
    if (await tx.blocks(blocker.id, blocked.id)) return false;
    await tx.setBlock(blocker.id, blocked.id, true, input.now);
    const running = await tx.openBetween(blocker.id, blocked.id);
    if (running) await tx.setStatus(running.id, 'ended', running.version, input.now);
    await noticeHouse(
      tx,
      blocked,
      'blocked',
      { houseId: blocker.id, name: await houseName(deps, blocker) },
      input.today,
    );
    return true;
  });
  if (changed) {
    const event: ChronicleEvent = {
      day: input.today,
      kind: 'blocked',
      blocker: await houseName(deps, blocker),
      blocked: await houseName(deps, blocked),
    };
    await chronicleHouses(
      deps,
      [blocker, blocked],
      `block:${blocker.id}:${blocked.id}:${input.now.getTime()}`,
      event,
    );
  }
  return { ok: true };
}

/** Hráč zruší své zablokování rodu `target` (bez upozornění). */
export async function unblockPlayer(
  deps: Pick<BlockDeps, 'houses' | 'negotiations'>,
  input: { playerId: string; target: string; now: Date },
): Promise<BlockResult> {
  const blocker = await deps.houses.activeOf(input.playerId);
  if (!blocker) return { ok: false, reason: NO_HOUSE };
  await deps.negotiations.transaction((tx) =>
    tx.setBlock(blocker.id, input.target, false, input.now),
  );
  return { ok: true };
}
