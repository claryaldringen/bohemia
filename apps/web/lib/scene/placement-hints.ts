// Čisté výpočty náhledu umisťování stavby (bez Babylonu): pozemek se středem pod kurzorem
// (population.md – Natočený pozemek, D96) a kusy cest, které by stavba přerušila (paths.md – Stavba
// přes cestu, Náhled u kurzoru) – stejné funkce jádra jako na serveru.

import {
  plannedBlockedAt,
  rotatedPlot,
  stretchesUnderBuilding,
  type DwellingPlot,
  type Landscape,
  type PlannedBuilding,
  type PlotVariant,
  type RoadStretch,
} from '@bohemia/game';
import type { SceneRoad } from '../village-view';
import type { PlotSquare } from './homestead-layout';
import { tileCenter } from './tile-at';

/**
 * Pozemek pod kurzorem v ukládané podobě jako na serveru (`rotatedPlot`) a jeho čtverec ve světě:
 * střed pod kurzorem na cm natočený o `rotation` – i bez natočení a po 90° (population.md –
 * Natočený pozemek, D96 – Martin 18. 11. 2026: „dokud ho nepootočím, skáče po jednotlivých
 * mapových čtvercích“); bez natočení přesně ve středu políčka je to políčko. Mimo krajinu null.
 */
export function plotUnderCursor(
  landscape: Landscape,
  x: number,
  z: number,
  rotation: number,
  variant: PlotVariant,
): { plot: DwellingPlot; square: PlotSquare } | null {
  const plot = rotatedPlot(landscape, { x, z, rotation }, variant);
  if (!plot) return null;
  const size = landscape.cellSizeM;
  if (plot.square) return { plot, square: { ...plot.square, size } };
  const center = tileCenter(landscape, plot.cell.x, plot.cell.y);
  return { plot, square: { x: center.worldX, z: center.worldZ, size } };
}

/**
 * Kusy cest vsi pod stavbou u kurzoru (paths.md – Stavba přes cestu, Náhled u kurzoru): plocha
 * stavby z jádra (`plannedBlockedAt`) a pravidlo kusu pod stavbou (`stretchesUnderBuilding`) –
 * cesta ve vylepšení se nehodnotí jako v pravidle. Stejná stavba nad stejnými cestami = minulý
 * výsledek (kurzor, který stojí, nic nepočítá).
 */
export function roadsUnderPlanned(
  landscape: Landscape,
  roads: () => readonly SceneRoad[],
): (planned: PlannedBuilding) => readonly RoadStretch[] {
  let last: {
    key: string;
    roads: readonly SceneRoad[];
    result: readonly RoadStretch[];
  } | null = null;
  return (planned) => {
    const list = roads();
    if (list.length === 0) return [];
    const key = JSON.stringify(planned);
    if (last && last.key === key && last.roads === list) return last.result;
    const blocked = plannedBlockedAt(landscape, planned);
    const frozen = new Set(list.filter((r) => r.upgrade).map((r) => r.id));
    const result = blocked ? stretchesUnderBuilding(list, blocked, frozen) : [];
    last = { key, roads: list, result };
    return result;
  };
}
