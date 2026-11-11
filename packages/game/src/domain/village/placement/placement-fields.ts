// Kontroly pole, sadu a hřbitova po čtvercích.

import { CEMETERY, CEMETERY_DISTANCE_M, FIELD_LIMITS } from '../rules';
import { type CemeterySquareInput, type OrchardSquareInput, type PartInput } from '../core/actions';
import { type FieldSurface, type Position, type SquareGrid, type TileCell } from '../types';
import {
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { NO_SPARED, type SparedSacred, sparedWarning } from '../people/sacred';
import { sacredSitesFor } from '../people/desecration';
import { type TakenLand } from '../buildings/land-taken';
import {
  cellObstacles,
  obstacleStatus,
  outcropUnder,
  squareObstacles,
  type StandingTree,
} from '../core/obstacles';
import { cemeteryFoundingCost, distanceToSquare, touchingCemeteries } from '../buildings/cemetery';
import { newFenceSides } from '../buildings/fence-cost';
import { fieldGrids } from './squares';
import { fieldsTouching, partFoundingCost } from '../fields/fields';
import { normalizeGrid } from './square-grid';
import { orchardPlantingCost } from '../buildings/orchard';
import {
  BLOCKS_GATE,
  blocksGate,
  joinWarnings,
  squareFreeArea,
  squareObstacleCost,
  takenLandWarning,
  takenSquareLand,
} from './placement-land';
import {
  CEMETERY_KIND,
  FIELD_KIND,
  ORCHARD_KIND,
  type SquareFlags,
  buildSquares,
  gridSquare,
  isConnected,
  normalizeCells,
  sacredSelection,
  squareFlags,
  squareWaterDistanceM,
  waterDistanceM,
} from './placement-squares';
import {
  type CemeteryPreview,
  type FieldPreview,
  M2_PER_HA,
  MAX_CEMETERY_CELLS,
  OK,
  type OrchardPreview,
  type PlacementCheck,
  type PlacementVillage,
  fail,
  formatInteger,
  formatNumber,
  wholeMeters,
} from './placement-types';
import { cellIndex, ownedAt } from './placement-geometry';
import { sacredInShape, unreservedTrees } from './placement-dwellings';

/**
 * Stojící stromy čtverce v pořadí kácení (forest.md – Klučení lesa pro pole – postup): od stromu
 * nejblíž nejbližšímu obydlí, při shodě podle id; stromy vyhrazené jinou stavbou se vynechají.
 */
export function fellingOrder(
  village: PlacementVillage | null,
  standing: readonly StandingTree[],
  dwellingPositions: readonly Position[],
): { id: number; log: boolean }[] {
  const reserved = new Set(village?.reservedTrees ?? []);
  const near = (t: StandingTree): number =>
    dwellingPositions.length === 0
      ? 0
      : Math.min(
          ...dwellingPositions.map((d) => (t.x - d.x) * (t.x - d.x) + (t.z - d.z) * (t.z - d.z)),
        );
  return standing
    .filter((t) => !reserved.has(t.id))
    .map((t) => ({ t, d: near(t) }))
    .sort((a, b) => a.d - b.d || a.t.id - b.t.id)
    .map(({ t }) => ({ id: t.id, log: t.log }));
}

/** Stromy dílu nebo čtverce pro klády z mýcení – bez stromů se údaj vynechá. */
function withTrees(trees: number): { trees?: number } {
  return trees > 0 ? { trees } : {};
}

/**
 * Pole ze čtverců – políček krajiny (15 × 15 m, díl = celé políčko). Díly na louce, v křovinách
 * i v lese (fields.md – Založení pole, Martin); povrch dílu určí `fieldSquareSurface` a cenu
 * založení sazba povrchu za hektar. Překážky na čtverci (pata v políčku, z vrstvy `obstacles`
 * bez toho, co ves už odstranila) osadníci odstraní, až díl založí; po kusech zvednou cenu jen
 * ty, které nejsou v sazbě povrchu (v lese jsou stromy a podrost v ceně, v křovinách keře).
 * Dospělé stromy, které nevyhradila stavba, dají po založení klády (forest.md). Skalní výchoz
 * zůstane a plocha pod ním se do dílu nepočítá. Vzdálenost dílu = od středu políčka
 * k nejbližšímu z `dwellingPositions`. Kontrola v tomto pořadí: platné čtverce v krajině, ne
 * voda, nepřekrývá obydlí, jiná pole, pohřebiště ani sady, žádný díl dál než 800 m, čtverce
 * sousedí stranou v jednom celku, aspoň 0,1 ha. Náhled (díly, výměra, zakázané čtverce…) se
 * počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  gridInput?: SquareGrid,
): FieldPreview {
  const grid = gridInput ? normalizeGrid(gridInput) : undefined;
  const shape =
    grid === null
      ? ({ ok: false, reason: 'Neplatné natočení pole.' } as const)
      : normalizeCells(landscape, cells, FIELD_KIND, grid);
  if (!shape.ok) {
    return {
      cells: [],
      parts: [],
      areaM2: 0,
      averageFertility: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      surfaceCounts: {},
      clearedTrees: 0,
      blockedCells: [],
      joinedFields: [],
      sacredCells: [],
      spared: NO_SPARED,
      check: fail(shape.reason),
    };
  }
  const gridOrNone = grid ?? undefined;
  const { squares, problems, blockedCells, obstacleCounts, sacred } = buildSquares(
    landscape,
    village,
    shape.cells,
    dwellingPositions,
    obstacles,
    true,
    gridOrNone,
  );
  const surfaceCounts: Partial<Record<FieldSurface, number>> = {};
  const parts: PartInput[] = squares.map((square) => {
    surfaceCounts[square.surface] = (surfaceCounts[square.surface] ?? 0) + 1;
    return {
      areaM2: square.areaM2,
      distanceM: square.distanceM,
      naturalFertility: square.fertility,
      surface: square.surface,
      obstacleCost: square.obstacleCost,
      ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
      ...withTrees(unreservedTrees(village, square.tally.treeIds)),
      ...(square.surface === 'forest'
        ? { standing: fellingOrder(village, square.tally.standing, dwellingPositions) }
        : {}),
      cell: square.square.cell,
    };
  });

  const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const averageFertility =
    areaM2 > 0 ? parts.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2 : 0;
  const foundingCost = parts.reduce(
    (sum, p) =>
      sum +
      partFoundingCost(
        p.surface,
        p.areaM2,
        p.obstacleCost,
        village?.toolCoverage ?? 0,
        village?.ploughTeam ?? false,
      ),
    0,
  );
  const obstacleCost = parts.reduce((sum, p) => sum + p.obstacleCost, 0);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const minCells = Math.ceil(FIELD_LIMITS.minAreaM2 / cellArea);
  // čtverce navazující na pole ho rozšíří (víc polí sloučí) – nejmenší výměru má mít pole celé;
  // navazuje se jen ve stejné mřížce (fields.md – Natočené stavby)
  const joinedFields = fieldsTouching(
    village?.parts ?? [],
    shape.cells,
    gridOrNone,
    fieldGrids(village ?? {}),
  );
  const joined = new Set(joinedFields);
  const joinedAreaM2 = (village?.parts ?? [])
    .filter((p) => p.fieldId !== undefined && joined.has(p.fieldId))
    .reduce((sum, p) => sum + (p.areaM2 ?? cellArea), 0);
  const checks: [boolean, () => string][] = [
    [problems.water, () => 'Pole nesmí zasahovat do vody.'],
    [problems.dwelling, () => 'Pole se překrývá s obydlím.'],
    [problems.field, () => 'Pole se překrývá s jiným polem.'],
    [problems.cemetery, () => 'Pole se překrývá s hřbitovem.'],
    [problems.orchard, () => 'Pole se překrývá se sadem.'],
    [problems.pen, () => 'Pole se překrývá s ohradou.'],
    [problems.sacred, () => 'Pole se překrývá s posvátným místem.'],
    [problems.threshing, () => 'Pole se překrývá s humnem.'],
    [problems.woodEdge, () => 'Les vsi pole vymýtí jen po jeho čtvercích – natoč pole jako les.'],
    [problems.far, () => `Pole je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [sacred.squares.length === 0, () => 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [!isConnected(shape.cells), () => 'Čtverce pole musí tvořit jeden celek – sousedit stranou.'],
    [
      areaM2 + joinedAreaM2 < FIELD_LIMITS.minAreaM2,
      () =>
        `Pole musí mít aspoň ${formatNumber(FIELD_LIMITS.minAreaM2 / M2_PER_HA, 1)} ha, ` +
        `tedy ${minCells} čtverců (teď ${shape.cells.length}).`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    ...(gridOrNone ? { grid: gridOrNone } : {}),
    parts,
    areaM2,
    averageFertility,
    foundingCost,
    obstacleCost,
    obstacleCounts,
    surfaceCounts,
    clearedTrees: parts.reduce((sum, p) => sum + (p.trees ?? 0), 0),
    blockedCells,
    joinedFields,
    sacredCells: sacred.sacredCells,
    spared: sacred.spared,
    check: failed ? fail(failed[1]()) : withWarning(sparedWarning(sacred.spared)),
  };
}

/** Prošlá kontrola s varováním (bez varování OK). */
export function withWarning(warning: string | undefined): PlacementCheck {
  return warning ? { ok: true, reason: null, warning } : OK;
}

/**
 * Sad ze čtverců – políček krajiny (orchard.md – Stavba): staví se stejně jako pole (Martin) –
 * čtverce na louce i v lese, do 800 m od nejbližšího obydlí, souvislé, ne na obydlí, hřbitově ani
 * jiném sadu (na pole smí). Překážky na čtverci zvednou cenu výsadby podle tabulky ve fields.md
 * (les za sazbu lesa – `ForestUse`) a osadníci je odstraní, až čtverec vysadí; skalní výchoz
 * zůstane a stromy ho obejdou (plocha pod ním se nepočítá). Na rozdíl od pole nemá nejmenší
 * výměru – sadem může být i jeden čtverec. Náhled se počítá i při neúspěchu – kromě neplatných
 * čtverců.
 */
export function orchardPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  gridInput?: SquareGrid,
): OrchardPreview {
  const grid = gridInput ? normalizeGrid(gridInput) : undefined;
  const shape =
    grid === null
      ? ({ ok: false, reason: 'Neplatné natočení sadu.' } as const)
      : normalizeCells(landscape, cells, ORCHARD_KIND, grid);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      areaM2: 0,
      plantingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      blockedCells: [],
      sacredCells: [],
      spared: NO_SPARED,
      takenLand: [],
      check: fail(shape.reason),
    };
  }
  const gridOrNone = grid ?? undefined;
  const meadow = buildSquares(
    landscape,
    village,
    shape.cells,
    dwellingPositions,
    obstacles,
    false,
    gridOrNone,
  );
  const takenLand = meadow.squares.flatMap((square) =>
    square.onField ? takenSquareLand(landscape, village, square.square, ['field']) : [],
  );
  const { problems, blockedCells, obstacleCounts, sacred } = meadow;
  const squares: OrchardSquareInput[] = meadow.squares.map((square) => ({
    cell: square.square.cell,
    areaM2: square.areaM2,
    distanceM: square.distanceM,
    obstacleCost: square.obstacleCost,
    ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
    ...withTrees(unreservedTrees(village, square.tally.treeIds)),
  }));
  const checks: [boolean, string][] = [
    [problems.water, 'Sad nesmí zasahovat do vody.'],
    [problems.dwelling, 'Sad se překrývá s obydlím.'],
    [problems.cemetery, 'Sad se překrývá s hřbitovem.'],
    [problems.orchard, 'Sad se překrývá s jiným sadem.'],
    [problems.pen, 'Sad se překrývá s ohradou.'],
    [problems.sacred, 'Sad se překrývá s posvátným místem.'],
    [problems.threshing, 'Sad se překrývá s humnem.'],
    [problems.far, `Sad je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [sacred.squares.length === 0, 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [!isConnected(shape.cells), 'Čtverce sadu musí tvořit jeden celek – sousedit stranou.'],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    ...(gridOrNone ? { grid: gridOrNone } : {}),
    squares,
    areaM2: squares.reduce((sum, s) => sum + s.areaM2, 0),
    plantingCost: squares.reduce(
      (sum, s) => sum + orchardPlantingCost(s.areaM2, s.obstacleCost),
      0,
    ),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    blockedCells,
    sacredCells: sacred.sacredCells,
    spared: sacred.spared,
    takenLand,
    check: failed
      ? fail(failed[1])
      : withWarning(
          joinWarnings(
            sparedWarning(sacred.spared),
            takenLandWarning(landscape, village, takenLand),
          ),
        ),
  };
}

/** Varování u kurzoru, když je hřbitov blíž obydlí nebo vodě, než je v pořádku (řádek na každé). */
function cemeteryWarning(dwellingM: number, waterM: number): string | undefined {
  const lines = [
    dwellingM < CEMETERY_DISTANCE_M.dwelling.ok
      ? `Blízko obydlí (${wholeMeters(dwellingM)})`
      : null,
    waterM < CEMETERY_DISTANCE_M.water.ok ? `Blízko vody (${wholeMeters(waterM)})` : null,
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Hřbitov ze čtverců – políček krajiny (cemetery.md – Stavba). Čtverce na louce, v lese i na poli.
 * Čtverce, které stranou navazují na hřbitov, ho rozšíří (`extendsCemetery`). Překážky na čtverci
 * (pata v políčku, z vrstvy `obstacles` bez toho, co ves už odstranila) zvednou cenu čtverce podle
 * tabulky ve fields.md (les i les vsi za sazbu lesa – `ForestUse`) a osadníci je odstraní, až
 * hřbitov (rozšíření) dostaví – jako u dílu pole. Skalní výchoz se neodstraní a hroby jdou na
 * čtverec v pevné mřížce (`CEMETERY.gravesPerSquare`), proto čtverec, do kterého výchoz
 * zasahuje, hřbitov mít nesmí. Kontrola v tomto pořadí: platné čtverce v krajině, ne voda,
 * nepřekrývá obydlí (i plánovaná z `dwellingPositions`), hřbitov ani sad, žádný skalní výchoz,
 * navazuje nejvýš na jeden hřbitov, čtverce (i s rozšiřovaným hřbitovem) sousedí stranou v jednom
 * celku, celý hřbitov nejvýš MAX_CEMETERY_CELLS čtverců. Blízkost obydlí (pod 150 m) a vody (pod
 * 100 m) stavbu neblokuje – jen `check.warning` a `warningCells`. Náhled se počítá i při
 * neúspěchu – kromě neplatných čtverců.
 */
export function cemeteryPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  gridInput?: SquareGrid,
): CemeteryPreview {
  // natočený hřbitov (fields.md – Natočené stavby): čtverce v jeho mřížce
  const grid = gridInput ? (normalizeGrid(gridInput) ?? undefined) : undefined;
  const shape =
    gridInput && !grid
      ? { ok: false as const, reason: 'Neplatné natočení hřbitova.' }
      : normalizeCells(landscape, cells, CEMETERY_KIND, grid);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      capacity: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      extendsCemetery: false,
      blockedCells: [],
      warningCells: [],
      sacredCells: [],
      spared: NO_SPARED,
      takenLand: [],
      check: fail(shape.reason),
    };
  }

  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const onFieldAt = ownedAt(landscape, village, ['field']);
  const takenLand: TakenLand[] = [];
  const status = obstacleStatus(village?.obstacleChanges);
  const sites = sacredSitesFor(village, obstacles);
  // čtverce háje se z hřbitova vyjmou; hroby jdou v pevné mřížce, proto čtverec s posvátným
  // dubem hřbitov mít nesmí (jako výchoz) – dub zůstane stát
  const sacred = sacredSelection(
    landscape,
    obstacles,
    sites,
    shape.cells.map((cell) => gridSquare(landscape, grid, cell)),
  );
  const size = landscape.cellSizeM;
  const problems: SquareFlags & { outcrop: boolean; oak: boolean; gate: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    pen: false,
    sacred: false,
    threshing: false,
    woodEdge: false,
    outcrop: false,
    oak: false,
    gate: false,
  };
  const squares: CemeterySquareInput[] = [];
  const blockedCells: TileCell[] = [];
  const warningCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  let nearestDwellingM = Infinity;
  let nearestWaterM = Infinity;
  for (const gridSq of sacred.squares) {
    const cell = gridSq.cell;
    const raw = flagsOf(gridSq);
    const flags = {
      water: raw.water,
      // les (i les vsi, i jen zčásti) osadníci vyklučí (ForestUse)
      forest: false,
      dwelling: raw.dwelling,
      cemetery: raw.cemetery,
      orchard: raw.orchard,
      pen: raw.pen,
      sacred: raw.sacred,
      threshing: raw.threshing,
      woodEdge: false,
      // na pole hřbitov smí (fields.md – Pole jako krajina) – čtverec z pole zmizí
      field: false,
      outcrop: outcropUnder(obstacles, status, gridSq.corners),
      oak: sacredInShape(landscape, obstacles, sites, gridSq).oaks.length > 0,
      // ohrazený hřbitov před brankou obydlí (population.md – Umístění obydlí)
      gate: blocksGate(landscape, village, [gridSq.corners]),
    };
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    if (flags.water) continue;
    // na čtverci pole patří překážky vrstvy poli (stromy u cesty ne) – i kus natočeného pole
    const onField = raw.field;
    const onFieldLand = onField ? takenSquareLand(landscape, village, gridSq, ['field']) : [];
    takenLand.push(...onFieldLand);
    const layerOwned = onField && onFieldAt ? onFieldAt : undefined;
    const owned = layerOwned ? { layerOwned } : {};
    const tally = grid
      ? squareObstacles(obstacles, status, gridSq.corners, sites.protectedTrees, owned)
      : cellObstacles(obstacles, status, cell, sites.protectedTrees, owned);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    const center = grid ? gridSq.center : tileCenterWorld(landscape, cell.x, cell.y);
    const square = { cell, x: center.x, z: center.z };
    const water = grid
      ? squareWaterDistanceM(landscape, gridSq.corners)
      : waterDistanceM(landscape, cell);
    // stejná vzdálenost jako v simulaci (cemetery.ts) – od obydlí k okraji čtverce (v jeho osách)
    const dwelling = dwellingPositions.reduce(
      (min, p) => Math.min(min, distanceToSquare(p.x, p.z, square, size, grid?.rotation)),
      Infinity,
    );
    nearestDwellingM = Math.min(nearestDwellingM, dwelling);
    nearestWaterM = Math.min(nearestWaterM, water);
    if (dwelling < CEMETERY_DISTANCE_M.dwelling.ok || water < CEMETERY_DISTANCE_M.water.ok) {
      warningCells.push(cell);
    }
    squares.push({
      ...square,
      waterDistanceM: water,
      // hřbitov v lese: sazba lesa za plochu čtverce mimo pole (ForestUse)
      obstacleCost: squareObstacleCost(
        village,
        tally,
        raw.forest,
        squareFreeArea(landscape, onFieldLand),
      ),
      ...(tally.ids.length > 0 ? { obstacleIds: tally.ids } : {}),
      ...withTrees(unreservedTrees(village, tally.treeIds)),
    });
  }

  const touching = touchingCemeteries(village?.cemeteries ?? [], shape.cells, grid);
  const extended = touching.length === 1 ? touching[0]!.squares.map((s) => s.cell) : [];
  const checks: [boolean, string][] = [
    [problems.water, 'Hřbitov nesmí zasahovat do vody.'],
    [problems.dwelling, 'Hřbitov se překrývá s obydlím.'],
    [problems.cemetery, 'Hřbitov se překrývá s jiným hřbitovem.'],
    [problems.orchard, 'Hřbitov se překrývá se sadem.'],
    [problems.pen, 'Hřbitov se překrývá s ohradou.'],
    [problems.sacred, 'Hřbitov se překrývá s posvátným místem.'],
    [problems.threshing, 'Hřbitov se překrývá s humnem.'],
    [problems.outcrop, 'Stojí tu skalní výchoz – ten osadníci neodstraní.'],
    [problems.oak, 'Stojí tu posvátný dub – mezi hroby ho vesničané nenechají.'],
    [problems.gate, BLOCKS_GATE],
    [sacred.squares.length === 0, 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [touching.length > 1, 'Hřbitov smí navazovat jen na jeden hřbitov.'],
    [
      !isConnected([...shape.cells, ...extended]),
      'Čtverce hřbitova musí tvořit jeden celek – sousedit stranou.',
    ],
    [
      shape.cells.length + extended.length > MAX_CEMETERY_CELLS,
      `Hřbitov může mít nejvýš ${formatInteger(MAX_CEMETERY_CELLS)} čtverců.`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  const groves: SparedSacred = { oaks: [], groves: sacred.spared.groves };
  const warning = joinWarnings(
    squares.length > 0 ? cemeteryWarning(nearestDwellingM, nearestWaterM) : undefined,
    sparedWarning(groves),
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    cells: shape.cells,
    ...(grid ? { grid } : {}),
    squares,
    capacity: squares.length * CEMETERY.gravesPerSquare,
    foundingCost: cemeteryFoundingCost(
      squares,
      newFenceSides(
        squares.map((s) => s.cell),
        extended,
      ),
    ),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    extendsCemetery: touching.length === 1,
    blockedCells,
    warningCells,
    sacredCells: sacred.sacredCells.filter((c) => sites.groveByTile.has(cellIndex(landscape, c))),
    spared: groves,
    takenLand,
    check: failed ? fail(failed[1]) : withWarning(warning),
  };
}
