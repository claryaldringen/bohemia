// Ukázka opevnění na /dev/buildings (fortifications.md – Ve scéně) bez Babylonu: polský plot,
// palisáda, val, val s palisádou, staveniště po úsecích, stáří a průlom – skutečná opevnění
// z jádra (obvod, úseky a brány z plochy po čtvercích), jen stáří a stavba jsou dané ukázkou.
import {
  fortificationArea,
  fortificationOutline,
  fortSegments,
  type FortBuildWork,
  type FortKind,
  type FortTop,
  type Fortification,
  type GridGeometry,
} from '@bohemia/game';
import { sceneFortification, type SceneFortification, type SceneFortSegment } from '../fort-view';

/** Ukázka opevnění – tlačítko Opevnění. */
export const SHOWCASE_FORTS = {
  id: 'opevneni',
  label: 'Opevnění',
  focus: { x: -8, z: 133, radius: 58 },
} as const;

/** Mřížka louky ukázky (400 m – střed v počátku, čtverce 15 m jako ve hře). */
export const SHOWCASE_FORT_GEO: GridGeometry = { size: 26, cellSizeM: 15 };

/** Jedno opevnění ukázky. */
export interface DemoFort {
  id: number;
  kind: FortKind;
  top?: FortTop;
  /** Obdélník čtverců plochy: levý dolní čtverec a rozměry. */
  cells: { x: number; y: number; w: number; h: number };
  /** Brány: úsek a poloha na jeho rovné části (m od začátku; chybí – uprostřed). */
  gates?: { segment: number; offsetM?: number }[];
  /** Stáří úseků v letech (null – úsek nestojí). */
  age?: (segment: number) => number | null;
  /** Stav úseků 0–1 (chátrání za životností). */
  state?: number;
  /** Prolomené úseky. */
  breached?: readonly number[];
  /** Rozestavěné: co se staví a průběh úseků 0–1. */
  work?: { kind: FortBuildWork; progress: (segment: number) => number | undefined };
  rampartHeight?: number;
  gatesClosed?: boolean;
}

/** Opevnění pro scénu z popisu ukázky (tvar z jádra – `fortificationOutline`). */
export function demoFortification(demo: DemoFort, geo: GridGeometry): SceneFortification {
  const cells = [];
  for (let x = 0; x < demo.cells.w; x++)
    for (let y = 0; y < demo.cells.h; y++) cells.push({ x: demo.cells.x + x, y: demo.cells.y + y });
  const area = fortificationArea(cells, null, geo);
  if ('error' in area) throw new Error(`Plocha ukázky opevnění ${demo.id}: ${area.error}`);
  const outline = fortificationOutline(area, demo.kind);
  const shapes = fortSegments(outline);
  const age = demo.age ?? ((): number => 1);
  const fort: Fortification = {
    id: demo.id,
    grid: null,
    cells,
    kind: demo.kind,
    ...(demo.top ? { top: demo.top } : {}),
    segments: shapes.map((s) => {
      const a = age(s.index);
      return {
        index: s.index,
        builtDay: a === null ? null : 0,
        ...(demo.top ? { topBuiltDay: a === null ? null : 0 } : {}),
        state: demo.state ?? 1,
        ...(demo.breached?.includes(s.index) ? { breachedDay: 0 } : {}),
      };
    }),
    gates: (demo.gates ?? []).map((g) => {
      const line = shapes[g.segment]!.line;
      const offsetM = g.offsetM ?? line.length / 2;
      return {
        segment: g.segment,
        offsetM,
        x: line.x + line.dx * offsetM,
        z: line.z + line.dz * offsetM,
      };
    }),
    ...(demo.rampartHeight !== undefined ? { rampartHeight: demo.rampartHeight } : {}),
  };
  const looks = shapes.map((s): SceneFortSegment => {
    const a = age(s.index);
    const p = demo.work?.progress(s.index);
    return {
      age: a,
      ...(demo.top ? { topAge: a } : {}),
      ...(p !== undefined ? { progress: p } : {}),
    };
  });
  return sceneFortification(fort, outline, looks, {
    building: demo.work !== undefined,
    ...(demo.work ? { work: demo.work.kind } : {}),
    ...(demo.gatesClosed ? { gatesClosed: true as const } : {}),
  });
}

/**
 * Opevnění ukázky v řadách na severu louky: plot, palisáda, val (zarostlý), val s palisádou
 * (brána otevřená); staveniště palisády (hotové úseky od brány, rozdělaný úsek se žlabem), stará
 * palisáda za životností (šedá, nakřivo, mezery), průlom (vyvrácené kůly, rozsekaná zavřená
 * brána) a rozestavěný val (příkop se prohlubuje, val roste).
 */
export function showcaseFortifications(): SceneFortification[] {
  const demos: DemoFort[] = [
    { id: 1, kind: 'fence', cells: { x: 1, y: 20, w: 2, h: 2 }, gates: [{ segment: 4 }] },
    { id: 2, kind: 'palisade', cells: { x: 4, y: 20, w: 2, h: 2 }, gates: [{ segment: 4 }] },
    {
      id: 3,
      kind: 'rampart',
      cells: { x: 7, y: 20, w: 3, h: 3 },
      gates: [{ segment: 7 }],
      age: () => 3,
    },
    {
      id: 4,
      kind: 'rampart',
      top: 'palisade',
      cells: { x: 11, y: 20, w: 3, h: 3 },
      gates: [{ segment: 7 }],
      age: () => 1.2,
    },
    {
      id: 5,
      kind: 'palisade',
      cells: { x: 1, y: 24, w: 3, h: 2 },
      gates: [{ segment: 7 }],
      age: (s) => (s >= 7 ? 0 : null),
      work: { kind: 'build', progress: (s) => (s >= 7 ? 1 : s === 0 ? 0.7 : s === 1 ? 0.15 : 0) },
    },
    {
      id: 6,
      kind: 'palisade',
      cells: { x: 5, y: 24, w: 2, h: 2 },
      gates: [{ segment: 4 }],
      age: () => 22,
      state: 0.55,
    },
    {
      id: 7,
      kind: 'palisade',
      cells: { x: 8, y: 24, w: 2, h: 2 },
      gates: [{ segment: 4 }],
      breached: [1, 4],
      gatesClosed: true,
    },
    {
      id: 8,
      kind: 'rampart',
      cells: { x: 11, y: 24, w: 3, h: 2 },
      gates: [{ segment: 7 }],
      age: () => null,
      work: { kind: 'build', progress: (s) => [1, 1, 0.8, 0.45, 0.15][s] ?? 0 },
    },
  ];
  return demos.map((d) => demoFortification(d, SHOWCASE_FORT_GEO));
}
