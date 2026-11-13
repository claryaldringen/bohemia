import type { GridCell } from '../domain/village/people/world-grid';
import type { SeenCell } from '../domain/war';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { SettlementRepository } from './settlements';

// Známá mapa z domova (lord-control.md – Co vojvoda vidí: „Známou mapu jde otevřít kdykoli
// z domova“; plán 2026-11-13 – Úloha 12a): hráč si prohlédne, co jeho rod o cizí mapě ví. Čte se
// jen znalost jeho vlastního živého rodu – cizí rod ani rod, který už skončil, nic nevydá.

export interface KnownMapDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  knowledge: Pick<KnowledgeRepository, 'of' | 'cellsOf'>;
  settlements: Pick<SettlementRepository, 'holderAt'>;
}

/** Znalost rodu hráče o mapě na políčku; `null` – rod mapu nezná (nebo hráč rod nemá). */
export async function knownMapFor(
  deps: Pick<KnownMapDeps, 'houses' | 'knowledge'>,
  input: { playerId: string; cell: GridCell },
): Promise<{ seen: SeenCell } | null> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return null;
  const seen = await deps.knowledge.of(house.id, input.cell);
  return seen ? { seen } : null;
}

/**
 * Mapy, které rod hráče zná, a rod, který na nich sídlí (`null` – na políčku nikdo není, nebo
 * nemá rod): hráč podle toho pozná, u kterého rodu v panelu je oko aktivní.
 */
export async function knownVillagesOf(
  deps: KnownMapDeps,
  input: { playerId: string },
): Promise<{ cell: GridCell; houseId: string | null }[]> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return [];
  const out: { cell: GridCell; houseId: string | null }[] = [];
  for (const cell of await deps.knowledge.cellsOf(house.id)) {
    const holder = await deps.settlements.holderAt(cell);
    const owner = holder === null ? null : await deps.houses.activeOf(holder);
    out.push({ cell: { x: cell.x, y: cell.y }, houseId: owner?.id ?? null });
  }
  return out;
}
