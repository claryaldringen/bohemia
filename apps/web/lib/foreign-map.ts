import 'server-only';
import { sameCell, type GridCell } from '@bohemia/game';
import { campaignCells, campaignViewForPlayer } from './campaign';
import { encodeLandscape, type LandscapeTransfer } from './landscape-transfer';

// Cizí mapa tažení (war.md – Mlha války, Pohyb – mapu po mapě; plán 2026-11-03 – Úloha 6.14):
// krajina políčka je veřejná – prázdné políčko z `cellLandscapeSeed`, políčko se vsí z uloženého
// seedu sídla (tatáž, po které jde vojsko na serveru). Do prohlížeče jde jen krajina se seedem vrstvy
// překážek (stromy si prohlížeč vygeneruje sám, `decodeLandscape` + vrstva překážek); stavby cizí
// vsi nese jen pohled na tažení, a to jen objevené (`CampaignView.discovered`).

/** Krajina mapy tažení pro prohlížeč – políčko a krajina bez staveb. */
export interface ForeignMap {
  cell: GridCell;
  landscape: LandscapeTransfer;
}

/**
 * Krajina políčka `cell`, jen pro účastníka tažení a jen pro mapu, kterou jeho vojsko zná: políčko
 * vlastního muže, jeho sousedy a mapu cíle. Jinak null.
 */
export async function foreignMapForPlayer(
  playerId: string,
  campaignId: string,
  cell: GridCell,
): Promise<ForeignMap | null> {
  const view = await campaignViewForPlayer(playerId, campaignId, 0);
  if (view === null) return null;
  const near = (c: GridCell): boolean => Math.abs(c.x - cell.x) <= 1 && Math.abs(c.y - cell.y) <= 1;
  const known = sameCell(view.target.cell, cell) || view.men.some((m) => near(m.cell));
  if (!known) return null;
  const map = await campaignCells().mapOf(cell);
  return { cell: { x: cell.x, y: cell.y }, landscape: encodeLandscape(map.landscape) };
}
