import type { GridCell } from '../domain/village/people/world-grid';
import type { SeenCell } from '../domain/war';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Známá mapa z domova (lord-control.md – Co vojvoda vidí: „Známou mapu jde otevřít kdykoli
// z domova“; plán 2026-11-13 – Úloha 12a): hráč si prohlédne, co jeho rod o cizí mapě ví. Čte se
// jen znalost jeho vlastního živého rodu – cizí rod ani rod, který už skončil, nic nevydá.

export interface KnownMapDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  knowledge: Pick<KnowledgeRepository, 'of' | 'cellsOf'>;
  settlements: Pick<SettlementRepository, 'holderAt' | 'listActive'>;
  /** Jen otisky – id vsí sídla (znalost drží id vsi, ne sídla). */
  villages: Pick<VillageRepository, 'stampsOf'>;
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
 * Mapy, které rod hráče zná, a rod, který na nich sídlí. `houseId` dostane políčko jen tehdy, když
 * rod na mapě viděl ves jejího **současného** držitele (`seen.villageId` – id vsi, ne sídla): poloha vsi, kterou rod
 * neviděl (jen stopa), ani vsi po změně držitele se nesmí prozradit (world.md – Co je veřejné).
 * Jinak `null` – políčko zůstává ve znalosti, jen se nepřiřadí k žádnému rodu.
 */
export async function knownVillagesOf(
  deps: KnownMapDeps,
  input: { playerId: string },
): Promise<{ cell: GridCell; houseId: string | null }[]> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return [];
  const out: { cell: GridCell; houseId: string | null }[] = [];
  for (const cell of await deps.knowledge.cellsOf(house.id)) {
    out.push({ cell: { x: cell.x, y: cell.y }, houseId: await seenHouseAt(deps, house.id, cell) });
  }
  return out;
}

/** Rod držitele mapy `cell`, jehož ves rod `houseId` na mapě viděl; jinak null. */
async function seenHouseAt(
  deps: KnownMapDeps,
  houseId: string,
  cell: GridCell,
): Promise<string | null> {
  const seen = await deps.knowledge.of(houseId, cell);
  if (seen?.villageId === undefined) return null;
  const holder = await deps.settlements.holderAt(cell);
  if (holder === null) return null;
  const held = (await deps.settlements.listActive(holder)).find(
    (s) => s.worldCell?.x === cell.x && s.worldCell.y === cell.y,
  );
  if (!held) return null;
  const stamps = await deps.villages.stampsOf([held.id]);
  if (!stamps.some((v) => v.id === seen.villageId)) return null;
  return (await deps.houses.activeOf(holder))?.id ?? null;
}
