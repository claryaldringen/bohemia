import 'server-only';
import {
  foreignMapTrails,
  sameCell,
  type CampaignMap,
  type GridCell,
  type RoadPoint,
  type SeenCell,
} from '@bohemia/game';
import { createAlarmOwners } from '@bohemia/db';
import { campaignCells, campaignViewForPlayer } from './campaign';
import { getDatabase } from './db';
import { gameDeps, playerToday } from './game';
import { encodeLandscape, type LandscapeTransfer } from './landscape-transfer';
import { warSceneOnMapForPlayer } from './war-scene';

// Cizí mapa tažení (war.md – Mlha války, Pohyb – mapu po mapě; plán 2026-11-03 – Úloha 6.14):
// krajina políčka je veřejná – prázdné políčko z `cellLandscapeSeed`, políčko se vsí z uloženého
// seedu sídla (tatáž, po které jde vojsko na serveru). Do prohlížeče jde jen krajina se seedem vrstvy
// překážek (stromy si prohlížeč vygeneruje sám, `decodeLandscape` + vrstva překážek); stavby cizí
// vsi nese jen pohled na tažení, a to jen objevené (`CampaignView.discovered`). Co z pokračování
// stezek sousedů prohlížeč dostane, rozhoduje use-case `foreignMapTrails`.

/** Pokračování stezek sousedů na cizí mapě pro prohlížeč (`foreignMapTrails`). */
export interface ForeignMapTrails {
  /**
   * Osy pokračování zemských stezek sousedních vsí (trade.md – Pokračování na sousední mapě);
   * na mapě, která není `friendly`, jen části, které rod objevil. Chybí = žádné.
   */
  trailContinuations?: RoadPoint[][];
  /**
   * Mapa vsi vlastního rodu nebo vazala (Martin 16. 11. 2026): pokračování stezek je v mlze cizí
   * mapy vidět celé jako na vlastní; mapa nepřítele a neutrála (i bez vsi) zůstává pod mlhou.
   * Chybí = ne.
   */
  friendly?: true;
}

/** Krajina mapy tažení pro prohlížeč – políčko a krajina bez staveb. */
export interface ForeignMap extends ForeignMapTrails {
  cell: GridCell;
  landscape: LandscapeTransfer;
}

/**
 * Pokračování stezek na mapě `map` v dnešní den hráče (vývojový posun času počítá); `seen` – co
 * o mapě vědí jeho muži teď (pohled na výjezd či tažení na serveru).
 */
async function trailsOnMap(
  playerId: string,
  cell: GridCell,
  map: CampaignMap,
  seen: readonly SeenCell[],
): Promise<ForeignMapTrails> {
  const today = await playerToday(playerId);
  if (!today.ok) return {};
  const deps = gameDeps();
  const { axes, friendly } = await foreignMapTrails(
    {
      villages: deps.villages,
      alarmOwners: createAlarmOwners(getDatabase()),
      houses: deps.houses,
      vassalages: deps.vassalages,
      knowledge: deps.knowledge,
    },
    { playerId, cell, map, day: today.day, seen },
  );
  return {
    ...(axes.length > 0 ? { trailContinuations: axes.map((a) => a.map((p) => ({ ...p }))) } : {}),
    ...(friendly ? { friendly: true as const } : {}),
  };
}

/**
 * Mapa políčka s pokračováním stezek sousedů – společné pro mapu tažení a výjezdu; `trailsOnly`
 * – jen pokračování stezek bez krajiny (prohlížeč je dočte, když muži objeví víc).
 */
export async function foreignMapOf(
  playerId: string,
  cell: GridCell,
  seen: readonly SeenCell[],
  trailsOnly: boolean,
): Promise<ForeignMap | ForeignMapTrails> {
  const map = await campaignCells().mapOf(cell);
  const trails = await trailsOnMap(playerId, cell, map, seen);
  if (trailsOnly) return trails;
  return { cell: { x: cell.x, y: cell.y }, landscape: encodeLandscape(map.landscape), ...trails };
}

/**
 * Krajina políčka `cell`, jen pro účastníka tažení a jen pro mapu, kterou jeho vojsko zná: políčko
 * vlastního muže, jeho sousedy a mapu cíle. Jinak null. Pokračování stezek objevené podle toho, co
 * o mapě ví rod a vojsko (`WarSceneView.known`; mapa bez vojska jen znalost rodu).
 */
export async function foreignMapForPlayer(
  playerId: string,
  campaignId: string,
  cell: GridCell,
  trailsOnly = false,
): Promise<ForeignMap | ForeignMapTrails | null> {
  const view = await campaignViewForPlayer(playerId, campaignId, 0);
  if (view === null) return null;
  const near = (c: GridCell): boolean => Math.abs(c.x - cell.x) <= 1 && Math.abs(c.y - cell.y) <= 1;
  const known = sameCell(view.target.cell, cell) || view.men.some((m) => near(m.cell));
  if (!known) return null;
  const war = await warSceneOnMapForPlayer(playerId, campaignId, cell);
  return foreignMapOf(playerId, cell, war?.known ? [war.known] : [], trailsOnly);
}
