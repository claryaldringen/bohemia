import type { GridCell } from '../domain/village/people/world-grid';
import type { TrailExit } from '../domain/village/trade/trail-exits';
import type { RoadPoint, VillageState } from '../domain/village/types';
import { continuationsOf, NO_CONTINUATIONS } from '../domain/war';
import type { CampaignCells } from './campaigns';
import type { VillageRepository } from './villages';

// Pokračování zemských stezek sousedních vsí (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13): mapa čte výstupy stezek ze souhrnů vsí na
// 8 sousedních políčkách (port `TrailExitSource` – jeden dotaz), vstupy z nich skládá
// `createCampaignCells` (`CampaignMap.trailEntries`) a osy pokračování odvodí jádro.

/**
 * Výstupy stezek vsi aktivního sídla na sousedním políčku: `exits` ze souhrnu vsi
 * (`VillageDigest.trailExits`); null = souhrn bez nich (uložený dřív, jiné verze tvaru nebo
 * starší verze stavu) – volající ves načte celou (`trailExitsOf`).
 */
export interface NeighbourTrailExits {
  villageId: string;
  /** Verze uložené vsi – klíč paměti výstupů načtených ze stavu. */
  version: number;
  cell: GridCell;
  exits: TrailExit[] | null;
}

/** Port: výstupy stezek vsí aktivních sídel na 8 sousedních políčkách políčka (bez něj samého). */
export interface TrailExitSource {
  trailExitsAround(cell: GridCell): Promise<NeighbourTrailExits[]>;
}

/**
 * Osy pokračování stezek sousedních vsí na mapě políčka `cell` v den `day` (`continuationsOf`):
 * branka dvorce ze stavu `state` (pohled vlastní vsi), jinak ze stavu první vsi mapy; mapa bez vsi
 * null. Pro scénu a pohledy – prohlížeč osy dostane jako data.
 */
export async function mapTrailContinuations(
  deps: { cells: CampaignCells; villages: Pick<VillageRepository, 'find'> },
  cell: GridCell,
  day: number,
  state?: VillageState | null,
): Promise<readonly (readonly RoadPoint[])[]> {
  const map = await deps.cells.mapOf(cell);
  // bez vstupu dostavěného před dnem se ves nenačítá – výsledek je týž (`NO_CONTINUATIONS`)
  if (!(map.trailEntries ?? []).some((e) => e.builtDay < day)) return NO_CONTINUATIONS;
  const villageId = map.villageIds[0];
  const village =
    state ??
    (villageId === undefined ? null : ((await deps.villages.find(villageId))?.state ?? null));
  return continuationsOf(map, village, day);
}
