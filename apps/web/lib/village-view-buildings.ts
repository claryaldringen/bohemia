// Ohrady, posvátná místa, sady a hřbitovy pro scénu a panel.

import { VillageThreshing, VillageOxen, VillageSacred } from './village-view-types';
import { ScenePen, SceneSacred, SceneSacredOak, SceneVillage } from './village-view-scene-types';
import { repairProgress } from './village-view-chronicle';
import {
  ORCHARD_WINDOWS,
  sacredBuildingHappiness,
  type SacredBuildingKind,
  dateOfDayIndex,
  monthInWindow,
  groveAgeYears,
  isAbandoned,
  sacredRuinOvergrowth,
  stockedPenIds,
  structureCondition,
  squareBearing,
  squareCenter,
  tileCenterWorld,
  HAY_WINTER_MONTHS,
  type HerdSpecies,
  type ConstructionSummary,
  type CartKind,
  type Landscape,
  type ObstacleLayer,
  type OrchardSquare,
  type OrchardWork,
  type SquareGrid,
  type TileCell,
  type VillageState,
  type VillageSummary,
  type PenSpecies,
  herdsOverRoom,
  threshingStatus,
} from '@bohemia/game';
import { fruitVisible, treeGrowth } from './orchard-look';

import { sacredOakGrowth } from './sacred-look';

/**
 * Ohrady pro scénu: druh, čtverce, stavba (průběh z rozestavěné stavby) a zvířata – voli
 * spřežení, telata ve výcviku a v zimě krávy v ohradách skotu (oxen.md: přes zimu stojí v ohradě –
 * kolik se jich v noci do ohrady vejde, `penOccupancy`); u každé ohrady i počet zvířat na noc.
 */
export function scenePens(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): ScenePen[] {
  const winter = HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const stocked = stockedPenIds(state);
  return summary.pens.map((pen) => {
    const building = pen.built
      ? undefined
      : state.constructions.find((c) => c.kind === 'pen' && c.penId === pen.id);
    const wear = (state.pens ?? []).find((p) => p.id === pen.id)?.wear;
    const cows = winter && pen.built && pen.species === 'cattle' ? pen.animals : 0;
    return {
      id: pen.id,
      species: pen.species,
      cell: { x: pen.cell.x, y: pen.cell.y },
      ...(pen.extraSquares ? { extraSquares: pen.extraSquares } : {}),
      night: pen.animals,
      ...(pen.grid ? { grid: pen.grid, rotation: pen.grid.rotation } : {}),
      x: pen.x,
      z: pen.z,
      size: landscape.cellSizeM,
      built: pen.built,
      progress: pen.built
        ? 1
        : (summary.constructions.find((c) => c.id === building?.id)?.buildProgress ?? 0),
      // rozšíření ve stavbě – průběh plotu kolem nových čtverců
      ...extensionProgress(state, summary, pen),
      oxen: pen.oxen?.trained ?? 0,
      trainees: pen.oxen?.training ?? 0,
      cows,
      ...wearOf(structureCondition(wear, 'pen', day), 'condition'),
      ...(pen.built && !stocked.has(pen.id) ? { stocked: false as const } : {}),
    };
  });
}

/**
 * Všechny čtverce ohrady ve scéně – první a další (oxen.md – Ohrady podle druhu), se stranou
 * a natočením ohrady; jako čtverce pole (`CellSquare`).
 */
export function scenePenSquares(
  pen: Pick<ScenePen, 'cell' | 'x' | 'z' | 'size' | 'rotation' | 'extraSquares'>,
): { cell: TileCell; x: number; z: number; size: number; rotation?: number }[] {
  const turned = pen.rotation !== undefined ? { rotation: pen.rotation } : {};
  return [
    { cell: pen.cell, x: pen.x, z: pen.z, size: pen.size, ...turned },
    ...(pen.extraSquares ?? []).map((q) => ({
      cell: q.cell,
      x: q.x,
      z: q.z,
      size: pen.size,
      ...turned,
    })),
  ];
}

/** Snopy a upozornění výmlatu (`threshingStatus` z jádra); nic z toho – bez údaje. */
export function threshingOf(state: VillageState, day: number): { threshing?: VillageThreshing } {
  const status = threshingStatus(state, day);
  const kg = Math.round(status.sheavesGrainKg + status.sheavesLegumesKg);
  const threshing: VillageThreshing = {
    ...(kg > 0 ? { sheavesKg: kg } : {}),
    ...(status.floorNeeded ? { floorNeeded: true as const } : {}),
    ...(status.waiting ? { waiting: true as const } : {}),
    ...(status.emergency ? { emergency: true as const } : {}),
    ...(status.floorShort ? { floorShort: true as const } : {}),
  };
  return Object.keys(threshing).length > 0 ? { threshing } : {};
}

/**
 * Druhy stád, která se na noc nevejdou do ohrad svého druhu a k domům (`herdsOverRoom` – oxen.md,
 * Ohrady podle druhu; i během ročního odkladu, ať hráč ví, že má stavět). Vše se vejde – nic.
 */
export function penShortOf(state: VillageState): { penShort?: HerdSpecies[] } {
  const short = herdsOverRoom(state);
  return short.length > 0 ? { penShort: short } : {};
}

/** Voli vsi pro panel ohrady volů (`VillageView.oxen`); bez ohrady volů nic. */
export function oxenViewOf(summary: VillageSummary): { oxen?: VillageOxen } {
  if (!summary.oxen) return {};
  const carts: Record<CartKind, number> = { 'two-wheel': 0, 'four-wheel': 0 };
  for (const cart of summary.crafts.carts) carts[cart.kind]++;
  return { oxen: { ...summary.oxen, carts, cartTargets: { ...summary.crafts.cartTargets } } };
}

/** Druh ohrady ve scéně – bez údaje (ukázky) se spřežením nebo výcvikem spřežení, jinak skot. */
export function scenePenSpecies(pen: Pick<ScenePen, 'species' | 'oxen' | 'trainees'>): PenSpecies {
  return pen.species ?? (pen.oxen > 0 || pen.trainees > 0 ? 'team' : 'cattle');
}

/**
 * Průběh rozšíření ohrady ve stavbě (oxen.md – Ohrady podle druhu): stavba čtverců `pending` –
 * plot kolem nich se staví po fázích jako u nové ohrady. Bez rozšíření nic.
 */
export function extensionProgress(
  state: VillageState,
  summary: VillageSummary,
  pen: VillageSummary['pens'][number],
): { extension?: number } {
  if (!pen.built || !pen.extraSquares?.some((q) => q.pending)) return {};
  const pending = new Set(
    (state.pens ?? [])
      .find((p) => p.id === pen.id)
      ?.extraSquares?.flatMap((q) => (q.constructionId === undefined ? [] : [q.constructionId])),
  );
  const c = summary.constructions.find((x) => pending.has(x.id));
  return { extension: c?.buildProgress ?? 0 };
}

/**
 * Stav stavby pro scénu (abandonment.md): jen pod 1, po setinách – scéna podle něj volí stupeň
 * rozpadu (structure-decay.ts) a přestaví se jen při změně stupně.
 */
export function wearOf<K extends string>(condition: number, key: K): { [key in K]?: number } {
  if (condition >= 1) return {};
  return { [key]: Math.floor(condition * 100) / 100 } as { [key in K]?: number };
}

/** Posvátná místa pro scénu; ves bez nich null. */
export function sceneSacred(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneSacred | null {
  const sites = state.constructions.flatMap((c) => {
    if ((c.kind !== 'idol' && c.kind !== 'shrine') || c.position === null) return [];
    const progress = summary.constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    return [{ id: c.id, kind: c.kind, position: c.position, built: false, progress }];
  });
  const wears = new Map((state.sacredBuildings ?? []).map((b) => [b.id, b.wear]));
  const repairing = new Set(
    state.constructions.flatMap((c) =>
      c.kind === 'repair' && (c.repair?.structure === 'idol' || c.repair?.structure === 'shrine')
        ? [c.repair.id]
        : [],
    ),
  );
  const buildings = [
    ...summary.sacred.buildings.map((b) => {
      const wear = wears.get(b.id);
      return {
        id: b.id,
        kind: b.kind,
        position: b.position,
        built: true,
        progress: 1,
        ...wearOf(structureCondition(wear, b.kind, day), 'condition'),
        ...(isAbandoned(wear) ? { abandoned: true as const } : {}),
        // ohniště opravované svatyně se rozhoří až po opravě (abandonment.md – Oprava)
        ...(repairing.has(b.id) ? { repairing: true as const } : {}),
      };
    }),
    ...sites,
  ];
  // zbytky padlých model a svatyní – zarůstání po 5 % (scéna se přestaví jen při změně)
  const ruins = (state.sacredRuins ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    position: r.position,
    overgrowth: Math.floor(sacredRuinOvergrowth(r, day) * 20) / 20,
  }));
  const { oaks, groves } = summary.sacred;
  if (oaks.length === 0 && groves.length === 0 && buildings.length === 0 && ruins.length === 0) {
    return null;
  }
  // souš a padlý kmen mají velikost dubu v den uschnutí
  const sceneOak = (o: (typeof oaks)[number]): SceneSacredOak => ({
    id: o.id,
    x: o.x,
    z: o.z,
    growth: sacredOakGrowth(o.day, o.diedDay ?? day),
    ...(o.stage === 'snag' ? { snag: true as const } : {}),
    ...(o.stage !== 'alive' && o.sizeM !== null ? { sizeM: o.sizeM } : {}),
  });
  const fallen = oaks.filter((o) => o.stage === 'fallen').map(sceneOak);
  return {
    oaks: oaks.filter((o) => o.stage !== 'fallen').map(sceneOak),
    ...(fallen.length > 0 ? { fallenOaks: fallen } : {}),
    groves: groves.map((g) => ({
      id: g.id,
      x: g.x,
      z: g.z,
      squares: g.cells.map((cell) => {
        const center = tileCenterWorld(landscape, cell.x, cell.y);
        return {
          cell: { x: cell.x, y: cell.y },
          x: center.x,
          z: center.z,
          size: landscape.cellSizeM,
        };
      }),
    })),
    buildings,
    ...(ruins.length > 0 ? { ruins } : {}),
  };
}

/**
 * Posvátná místa pro panel výběru – kolik které přidává, stáří dubů (souš: stáří, kdy uschla;
 * háj: nejstarší dub podle vrstvy překážek), u staveb průběh. Padlá souš už posvátným dubem není.
 */
export function sacredView(
  state: VillageState,
  summary: VillageSummary,
  obstacles: ObstacleLayer,
  day: number,
): VillageSacred {
  const sites = summary.constructions.flatMap((c) =>
    c.kind === 'idol' || c.kind === 'shrine'
      ? [
          {
            id: c.id,
            kind: c.kind,
            built: false,
            happiness: SACRED_HAPPINESS[c.kind],
            progress: c.progress,
            oaksToFell: c.treesToFell,
            condition: 1,
            abandoned: false,
            repair: null,
          },
        ]
      : [],
  );
  const wears = new Map((state.sacredBuildings ?? []).map((b) => [b.id, b.wear]));
  return {
    oaks: summary.sacred.oaks.flatMap((o) =>
      o.stage === 'fallen'
        ? []
        : [{ id: o.id, happiness: o.happiness, ageYears: o.ageYears, snag: o.stage === 'snag' }],
    ),
    groves: summary.sacred.groves.map((g) => ({
      id: g.id,
      oaks: g.oaks,
      squares: g.cells.length,
      happiness: g.happiness,
      ageYears: groveAgeYears(obstacles, g, day),
    })),
    buildings: [
      ...summary.sacred.buildings.map((b) => ({
        id: b.id,
        kind: b.kind,
        built: true,
        happiness: b.happiness,
        progress: 1,
        oaksToFell: 0,
        condition: structureCondition(wears.get(b.id), b.kind, day),
        abandoned: isAbandoned(wears.get(b.id)),
        repair: repairProgress(summary.constructions, b.kind, b.id),
      })),
      ...sites,
    ],
  };
}

export const DAYS_PER_TREE_YEAR = 365.25;

/**
 * Čtverec sadu pro scénu: průběh výsadby, velikost stromů podle stáří (po setinách – instance
 * se nepřestavují při každém dotazu) a jablka na stromech, když sad plodí a ještě se nesklidil.
 */
export function sceneOrchardSquare(
  landscape: Landscape,
  square: OrchardSquare,
  day: number,
  work: OrchardWork | null,
  grid?: SquareGrid,
): NonNullable<SceneVillage['orchards']>[number]['squares'][number] {
  const center = squareCenter(landscape, grid, square.cell);
  const planted = square.plantedDay;
  const planting =
    planted !== null ? 1 : square.plantingCost > 0 ? square.plantingDone / square.plantingCost : 0;
  const growth =
    planted === null ? 0 : Math.round(treeGrowth((day - planted) / DAYS_PER_TREE_YEAR) * 100) / 100;
  const month = dateOfDayIndex(day).month;
  const fruit =
    planted !== null &&
    fruitVisible({
      bearing: squareBearing(square, day),
      month,
      harvestWindow: monthInWindow(ORCHARD_WINDOWS.harvest, month),
      harvested: work?.task === 'harvest' ? work.done >= work.required : true,
    });
  return {
    cell: { x: square.cell.x, y: square.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    ...(grid ? { rotation: grid.rotation } : {}),
    planting,
    growth,
    fruit,
    // obnova: staré stromy skácené, čtverec se sází znovu (orchard.md – Obnova sadu)
    ...(square.renewal !== undefined && planted === null ? { renewal: true as const } : {}),
  };
}

/**
 * Průběh stavby hřbitova 0–1 – založení, u hotového hřbitova rozšíření (stavby jdou v pořadí
 * zahájení, první je založení); bez stavby hotový 1, nehotový 0.
 */
export function cemeteryProgress(
  id: number,
  built: boolean,
  constructions: readonly ConstructionSummary[],
): number {
  const active = constructions.filter((s) => s.kind === 'cemetery' && s.cemeteryId === id);
  if (active.length === 0) return built ? 1 : 0;
  return built ? Math.min(...active.map((s) => s.progress)) : active[0]!.progress;
}

export const SACRED_HAPPINESS: Record<SacredBuildingKind, number> = {
  idol: sacredBuildingHappiness('idol'),
  shrine: sacredBuildingHappiness('shrine'),
};
