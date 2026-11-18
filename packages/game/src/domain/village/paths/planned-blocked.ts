// Náhled zásahu stavby do sítě cest (paths.md – Stavba přes cestu, Náhled u kurzoru – Martin
// 18. 11. 2026): plocha, kterou stavba po postavení zabere (`plannedBlockedAt` – táž mřížka chodců
// jako `villageBlockedAt`), a kusy cest, které by v ní pravidlo kusu pod stavbou opustilo
// (`stretchesUnderBuilding` – týž výpočet jako `abandonBlockedStretches`). Stejné funkce volá
// náhled umisťování v prohlížeči – náhled a skutečnost se shodnou.

import type { Landscape } from '../../landscape';
import { HUMNO, SACRED_BUILDINGS } from '../rules';
import type { Craft, DwellingPlot, DwellingType, Position, SacredBuildingKind } from '../types';
import { buildingBounds, dwellingBox } from './network-grid';
import { HOUSE_MARGIN_M, type PathSquare, type PathVillage } from './network-types';
import { pathPlotOf } from './network';
import { pathTerrainOf, pathWindowFor } from './terrain';
import { gridBlockedAt } from './village';

export { BLOCK_MIN_RUN_M, stretchesUnderBuilding, type RoadStretch } from './roads-overgrow';

/**
 * Stavba, kterou hráč umisťuje, jak ji zná plocha staveb vsi: obydlí či dílna (volně nebo na
 * pozemku), modla či svatyně, humno, ohrada a hřbitov po čtvercích (čtverce jako v síti pěšin).
 */
export type PlannedBuilding =
  | {
      kind: 'dwelling';
      type: DwellingType;
      position: Position;
      plot?: DwellingPlot;
      craft?: Craft;
    }
  | { kind: 'sacred'; type: SacredBuildingKind; position: Position }
  | { kind: 'threshing-floor'; position: Position }
  | { kind: 'pen' | 'cemetery'; squares: readonly PathSquare[] };

/** Rezerva okna mřížky kolem stavby (m) – pruh u plotu a okraj domu se do okna vejdou. */
const PLANNED_MARGIN_M = 6;

/** Ves pro síť pěšin, ve které stojí jen plánovaná stavba – hotová i jako staveniště. */
function plannedVillage(landscape: Landscape, planned: PlannedBuilding): PathVillage {
  const empty: PathVillage = { dwellings: [], fields: [] };
  switch (planned.kind) {
    case 'dwelling': {
      // kus pod staveništěm se opouští už při zahájení stavby – plocha staveniště i hotového domu
      const base = {
        type: planned.type,
        position: planned.position,
        ...(planned.plot ? { plot: pathPlotOf(landscape, planned.plot) } : {}),
        ...(planned.craft ? { craft: planned.craft } : {}),
      };
      return {
        ...empty,
        dwellings: [
          { ...base, id: 1, built: true },
          { ...base, id: 2, built: false },
        ],
      };
    }
    case 'sacred':
      return {
        ...empty,
        sacred: {
          oaks: [],
          groves: [],
          buildings: [{ id: 1, kind: planned.type, position: planned.position, built: true }],
        },
      };
    case 'threshing-floor':
      return { ...empty, threshingFloors: [{ id: 1, position: planned.position, built: true }] };
    case 'pen': {
      const [first, ...extra] = planned.squares;
      if (!first) return empty;
      return { ...empty, pens: [{ ...first, id: 1, built: true, extra }] };
    }
    case 'cemetery':
      return { ...empty, cemeteries: [{ id: 1, squares: planned.squares, built: true }] };
  }
}

/** Obdélník světa, který plánovaná stavba zabere (bez rezervy), nebo null (žádné čtverce). */
function plannedBounds(
  village: PathVillage,
  planned: PlannedBuilding,
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  const rects: [number, number, number, number][] = [];
  for (const d of village.dwellings) {
    rects.push(buildingBounds({ position: d.position, box: dwellingBox(d) }, HOUSE_MARGIN_M));
  }
  if (planned.kind === 'sacred' || planned.kind === 'threshing-floor') {
    // půdorys natočený o cokoli se vejde do kruhu o poloměru půlky úhlopříčky
    const half =
      planned.kind === 'sacred'
        ? SACRED_BUILDINGS[planned.type].footprintM / 2
        : Math.max(HUMNO.sizeM.x, HUMNO.sizeM.z) / 2;
    const r = half * Math.SQRT2;
    const { x, z } = planned.position;
    rects.push([x - r, z - r, x + r, z + r]);
  }
  if (planned.kind === 'pen' || planned.kind === 'cemetery') {
    for (const s of planned.squares) {
      const r = (s.size / 2) * Math.SQRT2;
      rects.push([s.x - r, s.z - r, s.x + r, s.z + r]);
    }
  }
  if (rects.length === 0) return null;
  return {
    minX: Math.min(...rects.map((r) => r[0])) - PLANNED_MARGIN_M,
    minZ: Math.min(...rects.map((r) => r[1])) - PLANNED_MARGIN_M,
    maxX: Math.max(...rects.map((r) => r[2])) + PLANNED_MARGIN_M,
    maxZ: Math.max(...rects.map((r) => r[3])) + PLANNED_MARGIN_M,
  };
}

/**
 * Neprůchodná plocha plánované stavby, až bude stát (paths.md – Stavba přes cestu, Náhled
 * u kurzoru): táž mřížka chodců jako `villageBlockedAt` (`gridBlockedAt` v okně na mřížce krajiny
 * – tytéž buňky) se vsí, ve které stojí jen tahle stavba. Ostatní stavby vsi plochu nemění – živé
 * cesty jimi nevedou (pravidlo je už opustilo). Mřížka se staví až pro první bod v okně stavby –
 * cesty daleko od kurzoru terén nepočítají (první terén krajiny stojí ≈ 170 ms, pak pod 1 ms); mimo
 * okno false jako u `gridBlockedAt` (okraj okna je PLANNED_MARGIN_M od stavby – nic tam neleží).
 * Bez čtverců null.
 */
export function plannedBlockedAt(
  landscape: Landscape,
  planned: PlannedBuilding,
): ((x: number, z: number) => boolean) | null {
  const village = plannedVillage(landscape, planned);
  const bounds = plannedBounds(village, planned);
  if (!bounds) return null;
  let grid: ((x: number, z: number) => boolean) | null = null;
  return (x, z) => {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
    grid ??= gridBlockedAt(village, pathTerrainOf(landscape, pathWindowFor(landscape, bounds)));
    return grid(x, z);
  };
}
