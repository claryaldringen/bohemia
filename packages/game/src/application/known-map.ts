import type { GridCell } from '../domain/village/people/world-grid';
import type { SeenCell } from '../domain/war';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository, KnownCell } from './knowledge';

// Známá mapa z domova (lord-control.md – Co vojvoda vidí: „Známou mapu jde otevřít kdykoli
// z domova“; plán 2026-11-13 – Úloha 12a): hráč si prohlédne, co jeho rod o cizí mapě ví. Čte se
// jen znalost jeho vlastního živého rodu – cizí rod ani rod, který už skončil, nic nevydá.

export interface KnownMapDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  knowledge: Pick<KnowledgeRepository, 'of' | 'knownCellsOf'>;
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
 * rod na mapě viděl aspoň jednu stavbu vsi jejího **současného** držitele (`seen.parts` neprázdné
 * a `seen.villageId` – id vsi, ne sídla – je ves sídla na políčku): stopa, která mapu jen projela
 * (id vsi bez jediné viděné stavby), ani ves po změně držitele rod nesmí prozradit (world.md – Co je
 * veřejné). Jinak `null` – políčko zůstává ve znalosti, jen se nepřiřadí k žádnému rodu. Seznam je
 * jeden dotaz úložiště (`knownCellsOf`) – cena nároste s průzkumem rodu jen o řádky.
 */
export async function knownVillagesOf(
  deps: KnownMapDeps,
  input: { playerId: string },
): Promise<{ cell: GridCell; houseId: string | null }[]> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return [];
  return (await deps.knowledge.knownCellsOf(house.id)).map((known) => ({
    cell: { x: known.cell.x, y: known.cell.y },
    houseId: seenHolder(known),
  }));
}

/** Rod držitele mapy, jehož ves rod na mapě viděl (aspoň jednu stavbu); jinak null. */
function seenHolder(known: KnownCell): string | null {
  if (known.seenParts === 0 || known.seenVillageId === null) return null;
  return known.villageIds.includes(known.seenVillageId) ? known.holderHouseId : null;
}
