import type { GridCell } from '../domain/village/people/world-grid';
import type { HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';
import type { WarRepository } from './wars';

// Je rod hráče ve válce s rodem, kterému patří ves na políčku světa? (lord-control.md – Rozkazy:
// výjezd do země, kde je válka, nejde; plán 2026-11-13 – rozhodnutí 1.) Stejným podpisem se ptají
// výjezdy při vyslání i při rozkazu.

export interface JourneyWarDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  wars: Pick<WarRepository, 'activeBetween'>;
  settlements: Pick<SettlementRepository, 'occupiedCells'>;
}

/** Válka mezi rodem hráče `playerId` a držitelem mapy na políčku `cell`; prázdné políčko a vlastní mapa ne. */
export async function houseAtWarOn(
  deps: JourneyWarDeps,
  playerId: string,
  cell: GridCell,
): Promise<boolean> {
  const own = await deps.houses.activeOf(playerId);
  if (!own) return false;
  const occupied = (await deps.settlements.occupiedCells()).find(
    (o) => o.cell.x === cell.x && o.cell.y === cell.y,
  );
  if (!occupied) return false;
  const other = await deps.houses.activeOf(occupied.ownerId);
  if (!other || other.id === own.id) return false;
  return (await deps.wars.activeBetween(own.id, other.id)) !== null;
}
