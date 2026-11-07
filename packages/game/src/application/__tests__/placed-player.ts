import { enterGame, type EnterGameDeps, type EnterGameResult } from '../enter-game';
import type { WorldCell } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';

/**
 * Testovací zkratka: vstup do hry a hned umístění odříznutého rodu na políčko `cell` mapy světa
 * (jako by začal svobodný – newcomers.md), ať testy, které počítají s hráčem na mapě, nemusí
 * procházet volbou pána.
 */
export async function enterPlaced(
  deps: EnterGameDeps,
  playerId: string,
  cell: WorldCell,
): Promise<EnterGameResult> {
  const entered = await enterGame(deps, playerId);
  if (
    !(deps.settlements instanceof InMemorySettlements) ||
    !(deps.houses instanceof InMemoryHouses)
  )
    throw new Error('enterPlaced potřebuje in-memory repozitáře');
  if (entered.settlement.worldCell !== null) return entered;
  deps.settlements.moveIsolated(playerId, cell);
  const house = await deps.houses.activeOf(playerId);
  if (house) house.placedAt = deps.now();
  const seat = await deps.settlements.findSeat(playerId);
  return { ...entered, settlement: seat ?? entered.settlement };
}
