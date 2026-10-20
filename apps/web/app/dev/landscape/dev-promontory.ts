import { promontoriesOf, type Landscape } from '@bohemia/game';
import type { HoldingsOverlaySector } from '@/lib/scene/holdings-overlay';
import type { Point } from '@/lib/scene/village-layout';

/** Seedy, jejichž krajina (nové vrstvy) má ostrožnu nad zaříznutým meandrem – hlídá test. */
export const PROMONTORY_SEEDS = [2, 16, 25, 38, 39, 51, 65] as const;

/** Barvy překryvu: obrys plochy ostrožny a šíje. */
const OUTLINE_COLOR = [1, 0.62, 0.12] as const;
const NECK_COLOR = [0.9, 0.12, 0.1] as const;

/** Bod v políčkách (jako `villageSite`) → svět scény (m). */
function toWorld(l: Landscape, p: { x: number; y: number }): Point {
  const half = (l.size * l.cellSizeM) / 2;
  return [-half + (p.x + 0.5) * l.cellSizeM, -half + (p.y + 0.5) * l.cellSizeM];
}

/** Vývojový překryv ostrožen krajiny (terén 2): obrys plochy nahoře a čára šíje. */
export function promontoryOverlay(l: Landscape): HoldingsOverlaySector[] {
  return promontoriesOf(l).flatMap((p) => [
    { cells: [], color: OUTLINE_COLOR, lines: [p.outline.map((q) => toWorld(l, q))] },
    { cells: [], color: NECK_COLOR, lines: [p.neck.map((q) => toWorld(l, q))], open: true },
  ]);
}

/** Střed první ostrožny ve světě scény (m), nebo null. */
export function promontoryFocus(l: Landscape): { x: number; z: number } | null {
  const first = promontoriesOf(l)[0];
  if (!first) return null;
  const [x, z] = toWorld(l, first.center);
  return { x, z };
}
