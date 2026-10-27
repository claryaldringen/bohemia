// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape: ukázka klučení lesa pro pole (forest.md – Klučení
// lesa pro pole – postup) – řada čtverců v lese u vsi v každé fázi: kácení (půlka stromů padla),
// schnutí (paseka), pálení (rozpracované – ohně na spálené části), dohořelo dnes (ohně, večer
// žhnou uhlíky) a doutnání (druhý den – jen kouř). Vzhled, hromady větví, ohně, dým i lidi
// kreslí scéna stejně jako ve hře; dny pálení podle hodin světa scény (ostrý svět).
import {
  matureTreesByDistance,
  surfaceAt,
  type Landscape,
  type ObstacleChanges,
  type ObstacleLayer,
  type TileCell,
} from '@bohemia/game';
import { tileCenter } from '@/lib/scene/tile-at';
import type { SceneField } from '@/lib/scene/village-types';
import type { SceneFieldPart } from '@/lib/village-view';

/** Fáze čtverců ukázky v pořadí řady. */
export const CLEARING_DEMO_STAGES = ['fell', 'dry', 'burn', 'burnt', 'smolder'] as const;
export type ClearingDemoStage = (typeof CLEARING_DEMO_STAGES)[number];
/** Jak daleko od vsi (políčka) se hledá řada lesních políček. */
const SEARCH_CELLS = 30;
/** Klád na hromadě u lesa v ukázce. */
const DEMO_LOGS = 14;

export interface ClearingDemo {
  field: SceneField;
  /** Pokácené stromy (pařezy) – kácení, schnutí a pálení. */
  stumps: number[];
  /** Překážky dohořelých čtverců – shořely (jako po založení pole). */
  removed: number[];
  /** Hromada klád u lesa (kotva na kácené pasece). */
  logStacks: { id: number; x: number; z: number; logs: number }[];
  center: { x: number; z: number };
}

/** První řada CLEARING_DEMO_STAGES.length lesních políček za sebou od vsi ven (spirála po kruzích). */
function forestRow(l: Landscape): TileCell | null {
  const { x: sx, y: sy } = l.villageSite;
  const n = CLEARING_DEMO_STAGES.length;
  const forest = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < l.size && y < l.size && surfaceAt(l, x, y) === 'forest';
  for (let r = 3; r <= SEARCH_CELLS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let i = 0; i < n && ok; i++) ok = forest(x + i, y);
        if (ok) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Ukázka klučení v lese u vsi: řada políček (CLEARING_DEMO_STAGES) – den pálení `today` (herní
 * den podle hodin scény), doutnající čtverec dohořel včera. Bez lesa u vsi null.
 */
export function demoClearing(
  l: Landscape,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  fieldId: number,
  today: number,
): ClearingDemo | null {
  const start = forestRow(l);
  if (!start) return null;
  const parts: SceneFieldPart[] = [];
  const stumps: number[] = [];
  const removed: number[] = [];
  CLEARING_DEMO_STAGES.forEach((stage, i) => {
    const cell = { x: start.x + i, y: start.y };
    const c = tileCenter(l, cell.x, cell.y);
    const size = l.cellSizeM;
    const square = { cell, x: c.worldX, z: c.worldZ, size, id: fieldId * 100 + i + 1 };
    const trees = matureTreesByDistance(layer, changes, square, {
      limit: 80,
      maxDistanceM: size * 0.71,
    })
      .filter((t) => Math.abs(t.x - square.x) <= size / 2 && Math.abs(t.z - square.z) <= size / 2)
      .map((t) => t.id);
    if (stage === 'fell') stumps.push(...trees.filter((_, k) => k % 2 === 0));
    else if (stage === 'dry' || stage === 'burn') stumps.push(...trees);
    else removed.push(...trees);
    parts.push({ ...square, ...partLook(stage, today) });
  });
  const first = parts[0]!;
  return {
    field: { id: fieldId, parts },
    stumps,
    removed,
    logStacks: [{ id: fieldId, x: first.x, z: first.z, logs: DEMO_LOGS }],
    center: {
      x: parts.reduce((sum, p) => sum + p.x, 0) / parts.length,
      z: parts.reduce((sum, p) => sum + p.z, 0) / parts.length,
    },
  };
}

/** Stadium a vzhled čtverce ve fázi `stage` (jako fieldPartLooks v jádru). */
function partLook(
  stage: ClearingDemoStage,
  today: number,
): Pick<SceneFieldPart, 'stage' | 'look' | 'work' | 'before' | 'burnedDay'> {
  switch (stage) {
    case 'fell':
      return { stage: 'founding', look: 'slash', work: 0.5 };
    case 'dry':
      return { stage: 'founding', look: 'slash' };
    case 'burn':
      return { stage: 'founding', look: 'burnt', before: 'slash', work: 0.5 };
    case 'burnt':
      return { stage: 'ready', look: 'burnt', burnedDay: today };
    case 'smolder':
      return { stage: 'ready', look: 'burnt', burnedDay: today - 1 };
  }
}
