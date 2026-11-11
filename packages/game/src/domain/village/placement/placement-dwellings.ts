// Kontroly umístění obydlí, pozemků polozemnice, dílen a milíře.

import {
  CRAFT_BASE,
  FOREST_CROWN_MARGIN_M,
  KILN_SITE,
  MILIR,
  PLOT_TYPES,
  PLOT_VARIANTS,
  WORKSHOP_PORCH_M,
} from '../rules';
import {
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type Position,
  type TileCell,
} from '../types';
import {
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
  SURFACE_CODES,
  length2,
  obstaclesOf,
  surfaceAt,
  tileOfWorldPoint,
} from '../../landscape';
import {
  NO_SPARED,
  SACRED_OAK_RADIUS_M,
  type SacredOakSite,
  type SacredSites,
  grovesOfTiles,
  sacredOaksInTile,
  sacredOaksNear,
  sacredSitesOf,
  sparedSacred,
  sparedWarning,
} from '../people/sacred';
import { sacredSitesFor } from '../people/desecration';
import {
  PLAIN_SHAPE,
  dwellingShape,
  isPlainShape,
  shapedFootprint,
} from '../buildings/dwelling-shape';
import { type Point } from './polygon';
import { type Shape, plotShapes } from './plot-cells';
import {
  cellObstacles,
  dwellingClearing,
  obstacleStatus,
  outcropUnder,
  polygonObstacles,
  polygonsObstacles,
  squareObstacles,
} from '../core/obstacles';
import { kilnCircle } from '../crafts/charcoal';
import { plotSquareSamples } from './square-grid';
import { tilesUnder } from './squares';
import { workshopFootprints } from '../crafts/crafts';
import {
  DWELLING_LAND,
  type ForestUse,
  checkFootprintFree,
  freeDwellingClearings,
  freeForestClearing,
  gateProblem,
  groveTilesUnder,
  joinWarnings,
  nearCemeteryWarning,
  squareFreeArea,
  squareInForest,
  squareObstacleCost,
  takenLandUnder,
  takenLandWarning,
  takenSquareLand,
} from './placement-land';
import {
  type DwellingPlacementCheck,
  OK,
  type PlacementCheck,
  type PlacementVillage,
  fail,
} from './placement-types';
import {
  type PlacedDwelling,
  cellCorners,
  cellIndex,
  cellsUnderPolygon,
  checkFootprintTerrain,
  dwellingFootprint,
  footprintSamples,
  freeShape,
  ownedAt,
  ownedLand,
  plotHousePosition,
  rectangleSamples,
  rotatedPlot,
  yardTouches,
  type SampledGround,
} from './placement-geometry';
import { villageDwellingPositions } from './placement-village';

/**
 * Smí obydlí stát na místě volně (bez pozemku – zemnice)? Rozdíl výšek pod půdorysem nejvýš
 * 0,5 m, políčka pod ním louka nebo les (ne voda), žádný překryv s obydlími, rozestavěnými
 * obydlími (i jejich pozemky), hřbitovy ani se skalním výchozem. Ostatní překážky na vyklízené
 * ploše (`DWELLING_CLEARING_M`) osadníci odstraní – cena po kusech podle tabulky ve fields.md,
 * les (i les vsi) vyklučí za sazbu lesa (`ForestUse`; bez `clearForest` jen louka). Na pole a do
 * sadu obydlí smí (population.md – Obydlí na poli a v sadu):
 * díly a čtverce pod vyklízenou plochou se o průnik zmenší (`takenLand`, varování „Pole se
 * zmenší“), překážky na nich obydlí neplatí – patří poli a sadu. Blíž hřbitovu než 150 m jen
 * varuje (`warning`). `obstacles` = vrstva překážek krajiny. Polozemnice se staví na pozemku –
 * `checkPlotPlacement`.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  options: ForestUse = {},
): DwellingPlacementCheck {
  const clearForest = options.clearForest ?? true;
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha obydlí.'), ...none };
  }
  const shape = dwellingShape({ type, position });
  const samples = footprintSamples(type, position, shape);
  const terrain = checkFootprintTerrain(landscape, samples, 'Obydlí', clearForest);
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = dwellingFootprint(type, position, shape);
  const land = clearForest ? DWELLING_LAND : { ...DWELLING_LAND, woods: false };
  const free = checkFootprintFree(landscape, village, [freeShape(footprint)], land);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  const gate = gateProblem(landscape, village, { type, position });
  if (gate) return { ...fail(gate), ...none };
  // překážky v políčkách polí, hřbitovů, sadů a hájů odstraní jejich stavba (háj nikdo), obydlí
  // je neplatí; posvátný dub na vyklízené ploše zůstane stát
  const clearing = dwellingClearing(type, position, shape);
  const crowned = dwellingClearing(type, position, shape, FOREST_CROWN_MARGIN_M);
  const clearingTiles = cellsUnderPolygon(landscape, clearing);
  const groves = grovesOfTiles(sites, clearingTiles);
  const owned = ownedLand(
    landscape,
    village,
    ['field', 'cemetery', 'orchard', 'pen'],
    groveTilesUnder(landscape, sites, [crowned]),
  );
  const forest = freeForestClearing(landscape, village, [clearing], [crowned], owned, clearForest);
  const tally = polygonsObstacles(
    obstacles,
    status,
    forest.polygons,
    owned,
    sites.protectedTrees,
    forest.options,
  );
  const spared = sparedSacred(sacredOaksNear(sites, obstacles, clearing, 0), groves);
  const takenLand = takenLandUnder(landscape, village, [clearing]);
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    sparedWarning(spared),
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    obstacleCost: tally.cost + forest.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared,
    takenLand,
  };
}

/**
 * Vejde se stavba `d` (obydlí, dílna) ve vsi uložené před variantami rozměrů do své varianty
 * (population.md – Varianty rozměrů)? Větší dům nesmí zasáhnout jinou stavbu (obydlí, pozemek,
 * modlu, svatyni, milíř, hřbitov, ohradu, branku souseda), skalní výchoz ani posvátné místo – pak
 * zůstane v dnešním tvaru (`plainShape`). `village` je ves bez stavby `d`. Překážky, které větší
 * vyklízená plocha volného domu nově zabere, vrací `obstacleIds` (převod je odstraní – dům v nich
 * nesmí stát), dospělé stromy z nich `treeIds`; už vyklizené překážky menšího domu se nevracejí.
 */
export function dwellingShapeFits(
  landscape: Landscape,
  village: PlacementVillage,
  d: PlacedDwelling,
  obstacles: ObstacleLayer,
): { ok: boolean; obstacleIds: number[]; treeIds: number[] } {
  const fits = { ok: true, obstacleIds: [], treeIds: [] };
  const shape = dwellingShape(d);
  if (isPlainShape(shape)) return fits;
  const houses = d.craft
    ? workshopFootprints(d.craft, d.position, shape)
    : [dwellingFootprint(d.type, d.position, shape)];
  const misfit = { ok: false, obstacleIds: [], treeIds: [] };
  if (!checkFootprintFree(landscape, village, houses.map(freeShape), DWELLING_LAND).ok) {
    return misfit;
  }
  const status = obstacleStatus(village.obstacleChanges);
  if (houses.some((f) => outcropUnder(obstacles, status, f))) return misfit;
  const sites = sacredSitesFor(village, obstacles);
  if (sacredUnder(landscape, obstacles, sites, houses)) return misfit;
  // dům na pozemku vyklidil celé políčko – nic nového nezabere
  if (d.plot && !d.craft) return fits;
  const shaped = dwellingClearing(d.type, d.position, shape);
  const owned = ownedLand(
    landscape,
    village,
    ['field', 'cemetery', 'orchard', 'pen'],
    groveTilesUnder(landscape, sites, [shaped]),
  );
  const plain = dwellingClearing(d.type, d.position, PLAIN_SHAPE);
  const before = new Set(
    polygonObstacles(obstacles, status, plain, owned, sites.protectedTrees).ids,
  );
  const tally = polygonObstacles(obstacles, status, shaped, owned, sites.protectedTrees);
  // vyhrazené stromy patří své stavbě – pokácí je ona
  const reserved = new Set(village.reservedTrees ?? []);
  const fresh = (id: number): boolean => !before.has(id) && !reserved.has(id);
  return {
    ok: true,
    obstacleIds: tally.ids.filter(fresh),
    treeIds: tally.treeIds.filter(fresh),
  };
}

/** Těžiště vrcholů mnohoúhelníku (střed obdélníku půdorysu). */
function centroid(polygon: readonly Point[]): { x: number; z: number } {
  const x = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const z = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  return { x, z };
}

/**
 * Smí řemeslná dílna `craft` stát na místě (crafts.md – Budovy)? Umisťuje se volně jako zemnice:
 * obydlí řemesla (hrnčíř a kovář polozemnice s přístřeškem vpředu, uhlíř zemnice – milíř staví
 * u každé dávky buků zvlášť, crafts.md – Milíř u skácených buků) jako `checkDwellingPlacement` –
 * louka nebo les (ne voda), dost rovná zem, žádný překryv, skalní výchoz ani posvátné místo.
 * Překážky na vyklízené ploše dílny osadníci odstraní (cena po kusech), les vyklučí za sazbu lesa
 * (`ForestUse`). Na pole a do sadu smí jako zemnice – zmenší je o průnik vyklízených ploch
 * (`takenLand`).
 */
export function checkWorkshopPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  craft: Craft,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): DwellingPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha dílny.'), ...none };
  }
  const type = CRAFT_BASE[craft];
  const shape = dwellingShape({ type, position });
  const { width, depth } = shapedFootprint(type, shape, WORKSHOP_PORCH_M[craft]);
  const footprints = workshopFootprints(craft, position, shape);
  const house = { ...centroid(footprints[0]!), rotation: position.rotation };
  const terrain = checkFootprintTerrain(landscape, rectangleSamples(width, depth, house));
  if (!terrain.ok) return { ...terrain, ...none };
  const free = checkFootprintFree(landscape, village, footprints.map(freeShape), DWELLING_LAND);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (footprints.some((f) => outcropUnder(obstacles, status, f))) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, footprints);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  const gate = gateProblem(landscape, village, { type, position, craft });
  if (gate) return { ...fail(gate), ...none };
  const clearings = freeDwellingClearings(type, position, shape);
  const crowned = freeDwellingClearings(type, position, shape, FOREST_CROWN_MARGIN_M);
  const clearingTiles = clearings.flatMap((c) => cellsUnderPolygon(landscape, c));
  const groves = grovesOfTiles(sites, clearingTiles);
  const owned = ownedLand(
    landscape,
    village,
    ['field', 'cemetery', 'orchard'],
    groveTilesUnder(landscape, sites, crowned),
  );
  const forest = freeForestClearing(landscape, village, clearings, crowned, owned);
  const tally = polygonsObstacles(
    obstacles,
    status,
    forest.polygons,
    owned,
    sites.protectedTrees,
    forest.options,
  );
  const oaks = clearings.flatMap((c) => sacredOaksNear(sites, obstacles, c, 0));
  const spared = sparedSacred([...new Map(oaks.map((o) => [o.id, o])).values()], groves);
  const takenLand = takenLandUnder(landscape, village, clearings);
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    sparedWarning(spared),
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    obstacleCost: tally.cost + forest.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared,
    takenLand,
  };
}

/** Nejkratší vzdálenost bodu od lomené čáry (m). */
function polylineDistance(
  p: { x: number; z: number },
  points: readonly { x: number; z: number }[],
): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
    best = Math.min(best, length2(p.x - (a.x + t * dx), p.z - (a.z + t * dz)));
  }
  if (points.length === 1) best = length2(p.x - points[0]!.x, p.z - points[0]!.z);
  return best;
}

/**
 * Smí milíř stát na místě se středem `center` (crafts.md – Milíř u skácených buků; návrh Clauda)?
 * Milíř je samostatná stavba uprostřed skácených buků: pod čtvercem milíře (MILIR.footprintM)
 * krajina, ne voda a dost rovná zem (jako u obydlí, les smí – uhlíř ho stejně kácí); kruh milíře
 * s pruhem kolem (MILIR.clearingRadiusM + KILN_SITE.marginM) nezasahuje na pole, do sadu, na
 * hřbitov, do ohrady, na obydlí ani pozemek, na modlu či svatyni, ani před branku;
 * aspoň KILN_SITE.homeM od obydlí (i rozestavěných), KILN_SITE.kilnM od jiného milíře a kruh
 * s KILN_SITE.roadM od osy pevné cesty; ne na skalním výchozu, pod posvátným dubem ani na háji.
 * Kontrola je deterministická (stejně v prohlížeči i na serveru).
 */
export function checkKilnSite(
  landscape: Landscape,
  village: PlacementVillage | null,
  center: { x: number; z: number },
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): PlacementCheck {
  if (![center.x, center.z].every(Number.isFinite)) return fail('Neplatná poloha milíře.');
  const square = { x: center.x, z: center.z, rotation: 0 };
  const samples = rectangleSamples(MILIR.footprintM, MILIR.footprintM, square);
  const terrain = checkFootprintTerrain(landscape, samples, 'Milíř');
  if (!terrain.ok) return terrain;
  const circle = kilnCircle(center, MILIR.clearingRadiusM + KILN_SITE.marginM);
  const free = checkFootprintFree(landscape, village, [freeShape(circle)], { woods: true });
  if (!free.ok) return free;
  if (village) {
    const homes = villageDwellingPositions(village);
    if (homes.some((h) => length2(h.x - center.x, h.z - center.z) < KILN_SITE.homeM)) {
      return fail('Milíř nesmí stát u domů.');
    }
    if (
      (village.kilns ?? []).some((k) => length2(k.x - center.x, k.z - center.z) < KILN_SITE.kilnM)
    ) {
      return fail('Stojí tu jiný milíř.');
    }
    const reach = MILIR.clearingRadiusM + KILN_SITE.roadM;
    if ((village.walkRoads ?? []).some((r) => polylineDistance(center, r.points) < reach)) {
      return fail('Milíř nesmí stát na cestě.');
    }
  }
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, circle)) {
    return fail('Stojí tu skalní výchoz – ten osadníci neodstraní.');
  }
  const sacred = sacredUnder(landscape, obstacles, sacredSitesOf(obstacles), [circle]);
  return sacred ? fail(sacred) : OK;
}

/** Kontrola pozemku obydlí – navíc poloha domu na něm (null, když pozemek neprošel). */
export interface PlotPlacementCheck extends DwellingPlacementCheck {
  position: Position | null;
}

/**
 * Smí obydlí stát na pozemku `plot` (population.md – Umístění obydlí, Martin 18. 10. 2026)?
 * Pozemek je celé políčko krajiny jako čtverec pole: louka nebo les (ne voda), bez skalního
 * výchozu, nezabrané hřbitovem, jiným pozemkem ani obydlím; dům stojí uprostřed nebo v rohu podle
 * varianty a pod jeho půdorysem musí být dost rovná zem (≤ 0,5 m). Na pozemku nesmí být posvátný
 * dub ani čtverec háje a dům nestojí pod korunou dubu ze sousedního políčka (happiness.md – jako
 * u obydlí), takže vesničané nemusí nic nechat stát. Překážky platí jako u čtverce pole – všechny
 * kusy na políčku (cena po kusech, dospělé stromy nevyhrazené jinou stavbou dají klády), pozemek
 * v lese (i v lese vsi) osadníci vyklučí za sazbu lesa jako díl pole (`ForestUse`). Blíž hřbitovu
 * než 150 m jen varuje.
 *
 * Pozemek smí na čtverec pole i sadu (population.md – Obydlí na poli a v sadu): čtverec z pole či
 * sadu zmizí (`takenLand` – celé políčko, varování „Pole se zmenší“ / „Pole zanikne“) a jeho
 * překážky pozemek neplatí – patří poli a sadu. `takeLand: false` (přestavba obyvatel na novém
 * pozemku – ti pole, sad ani les nezaberou) čtverce polí, sadů a lesa vsi ani les krajiny nepovolí.
 */
export function checkPlotPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  plot: DwellingPlot,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  options: { takeLand?: boolean } = {},
): PlotPlacementCheck {
  const takeLand = options.takeLand ?? true;
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
    position: null,
  };
  if (!PLOT_TYPES[type]) return { ...fail('Tohle obydlí se staví bez pozemku.'), ...none };
  if (!PLOT_VARIANTS.includes(plot.variant)) {
    return { ...fail('Neplatné místo domu na pozemku.'), ...none };
  }
  // dvorec stojí na pozemku dvou políček – dům a dvůr (trade.md – Dvorec vojvody)
  if ((type === 'dvorec') !== (plot.yard !== undefined)) {
    return { ...fail('Dvorec potřebuje pozemek se dvorem.'), ...none };
  }
  if (plot.yard && (plot.variant !== 'center' || !yardTouches(plot.cell, plot.yard))) {
    return { ...fail('Dvůr musí sousedit s políčkem domu.'), ...none };
  }
  if (plot.square) {
    const valid = rotatedPlot(landscape, plot.square, plot.variant);
    if (plot.yard || !valid || valid.cell.x !== plot.cell.x || valid.cell.y !== plot.cell.y) {
      return { ...fail('Neplatné natočení pozemku.'), ...none };
    }
  }
  const shapes = plotShapes(landscape, plot);
  for (const shape of shapes) {
    const where = plotGroundProblem(landscape, shape, takeLand);
    if (where) return { ...fail(where), ...none };
  }
  const position = plotHousePosition(landscape, plot);
  const shape = dwellingShape({ type, position, plot });
  const samples = footprintSamples(type, position, shape);
  const terrain = checkFootprintTerrain(landscape, samples, 'Obydlí', takeLand);
  if (!terrain.ok) return { ...terrain, ...none };
  const sites = sacredSitesFor(village, obstacles);
  for (const shape of shapes) {
    const taken = plotSquareProblem(landscape, village, shape, obstacles, sites, takeLand);
    if (taken) return { ...fail(taken), ...none };
  }
  const house = sacredUnder(landscape, obstacles, sites, [
    dwellingFootprint(type, position, shape),
  ]);
  if (house) return { ...fail(house), ...none };
  const gate = gateProblem(landscape, village, { type, position, plot });
  if (gate) return { ...fail(gate), ...none };
  const takenLand = takeLand
    ? shapes.flatMap((shape) => takenSquareLand(landscape, village, shape))
    : [];
  const tally = sumClearings(
    shapes.map((shape) => plotClearing(landscape, village, shape, obstacles, sites, takeLand)),
  );
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    ...tally,
    takenLand,
    position,
  };
}

/** Body vzorkování krajiny pod natočeným čtvercem (5 × 5) – povrch a úrodnost. */
export const SQUARE_SAMPLES = 5;

/**
 * Krajina pod natočeným čtvercem (fields.md – Natočené stavby): body `samples` po políčkách – voda,
 * když do ní zasahuje kterýkoli bod, les, když v lese leží většina bodů (5 × 5 – nikdy půl na
 * půl), úrodnost jako průměr políček pod body; `corners` jen hlídají okraj krajiny.
 */
export function sampledGround(
  landscape: Landscape,
  samples: readonly Point[],
  corners: readonly Point[],
): SampledGround {
  let outside = false;
  let water = false;
  let forest = 0;
  let fertility = 0;
  for (const [x, z] of corners) {
    if (!tileOfWorldPoint(landscape, x, z)) outside = true;
  }
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) {
      outside = true;
      continue;
    }
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') water = true;
    else if (surface === 'forest') forest++;
    fertility += landscape.fertility[tile.y * landscape.size + tile.x]!;
  }
  return {
    outside,
    water,
    forest: forest * 2 > samples.length,
    fertility: fertility / samples.length,
  };
}

/**
 * Krajina pod čtvercem pozemku: políčko podle povrchu políčka, natočený čtverec podle bodů
 * vzorkování (`sampledGround`).
 */
function plotGround(landscape: Landscape, shape: Shape): SampledGround {
  if (shape.tile !== null) {
    const surface = landscape.surface[shape.tile];
    return {
      outside: false,
      water: surface === SURFACE_CODES.water,
      forest: surface === SURFACE_CODES.forest,
      fertility: landscape.fertility[shape.tile]!,
    };
  }
  const samples = shape.square
    ? plotSquareSamples(shape.square, landscape.cellSizeM, SQUARE_SAMPLES)
    : shape.corners;
  return sampledGround(landscape, samples, shape.corners);
}

/**
 * Čtverec pozemku v krajině, ne ve vodě – na louce i v lese (bez `clearForest` jen na louce)?
 * Políčko podle povrchu políčka, natočený čtverec podle bodů vzorkování (`sampledGround`). Důvod
 * česky, nebo null.
 */
function plotGroundProblem(
  landscape: Landscape,
  shape: Shape,
  clearForest: boolean,
): string | null {
  if (shape.tile !== null) {
    const cell = { x: shape.tile % landscape.size, y: Math.floor(shape.tile / landscape.size) };
    return plotCellProblem(landscape, cell, clearForest);
  }
  const ground = plotGround(landscape, shape);
  if (ground.outside) return 'Pozemek musí ležet uvnitř krajiny sídla.';
  if (ground.water) return 'Pozemek nemůže ležet ve vodě.';
  if (ground.forest && !clearForest) return 'Roste tu les – pozemek sem nepatří.';
  return null;
}

/**
 * Políčko pozemku v krajině, ne ve vodě – na louce i v lese (bez `clearForest` jen na louce)?
 * Důvod česky, nebo null.
 */
function plotCellProblem(
  landscape: Landscape,
  cell: TileCell,
  clearForest: boolean,
): string | null {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return 'Neplatné políčko pozemku.';
  if (cell.x < 0 || cell.y < 0 || cell.x >= landscape.size || cell.y >= landscape.size) {
    return 'Pozemek musí ležet uvnitř krajiny sídla.';
  }
  const surface = surfaceAt(landscape, cell.x, cell.y);
  if (surface === 'water') return 'Pozemek nemůže ležet ve vodě.';
  if (surface !== 'meadow' && !clearForest) return 'Roste tu les – pozemek sem nepatří.';
  return null;
}

/**
 * Posvátná místa pod čtvercem: háj – políčka háje pod ním (u políčka jen ono samo), posvátné duby
 * – na políčku (u políčka), v natočeném čtverci (kmen uvnitř).
 */
export function sacredInShape(
  landscape: Landscape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  shape: Shape,
): { groveTiles: number[]; oaks: readonly SacredOakSite[] } {
  const groveTiles = tilesUnder(landscape, shape.corners, shape.tile).filter((tile) =>
    sites.groveByTile.has(tile),
  );
  const oaks =
    shape.tile !== null
      ? sacredOaksInTile(sites, shape.tile)
      : sacredOaksNear(sites, obstacles, shape.corners, 0);
  return { groveTiles, oaks };
}

/**
 * Zabírá čtverec pozemku něco jiného – hřbitov, obydlí či pozemek, modla, svatyně, bez
 * `takeLand` i pole a sad – nebo je na něm skalní výchoz, posvátný dub či čtverec háje? Důvod
 * česky, nebo null.
 */
function plotSquareProblem(
  landscape: Landscape,
  village: PlacementVillage | null,
  shape: Shape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  takeLand: boolean,
): string | null {
  const free = checkFootprintFree(landscape, village, [shape], takeLand ? DWELLING_LAND : {});
  if (!free.ok) return free.reason;
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, shape.corners)) {
    return 'Na pozemku je skalní výchoz – ten osadníci neodstraní.';
  }
  const sacred = sacredInShape(landscape, obstacles, sites, shape);
  if (sacred.groveTiles.length > 0) {
    return 'Na pozemku roste posvátný dubový háj – ten vesničané nevykácejí.';
  }
  if (sacred.oaks.length > 0) {
    return 'Na pozemku stojí posvátný dub – ten vesničané nepokácí.';
  }
  return null;
}

/**
 * Překážky na čtverci pozemku jako u čtverce pole – všechny kusy kromě posvátných stromů (cena
 * po kusech, dospělé stromy nevyhrazené jinou stavbou dají klády); pozemek v lese (i v lese vsi)
 * jako díl pole v lese – sazba lesa za plochu čtverce mimo pole a sad, stromy, podrost a pařezy
 * v ní (`ForestUse`). Na pozemku posvátné místo být nesmí, takže není co nechat stát (`spared`
 * prázdné). Kde pozemek leží na čtverci pole nebo sadu (`takeLand`), překážky nevyklízí – patří
 * poli a sadu (založený díl a vysazený čtverec je už nemají). Bez `takeLand` les nevyklučí.
 */
function plotClearing(
  landscape: Landscape,
  village: PlacementVillage | null,
  shape: Shape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  takeLand: boolean,
): Omit<DwellingPlacementCheck, keyof PlacementCheck | 'takenLand'> {
  const status = obstacleStatus(village?.obstacleChanges);
  const owned = takeLand ? ownedAt(landscape, village, ['field', 'orchard']) : null;
  const options = owned ? { owned } : {};
  const tally =
    shape.tile !== null
      ? cellObstacles(
          obstacles,
          status,
          { x: shape.tile % landscape.size, y: Math.floor(shape.tile / landscape.size) },
          sites.protectedTrees,
          options,
        )
      : squareObstacles(obstacles, status, shape.corners, sites.protectedTrees, options);
  const forest =
    takeLand && squareInForest(landscape, village, shape, plotGround(landscape, shape));
  const taken = forest ? takenSquareLand(landscape, village, shape) : [];
  return {
    obstacleCost: squareObstacleCost(village, tally, forest, squareFreeArea(landscape, taken)),
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared: NO_SPARED,
  };
}

/** Překážky víc políček pozemku dohromady (dvorec – dům a dvůr). */
function sumClearings(
  clearings: readonly ReturnType<typeof plotClearing>[],
): ReturnType<typeof plotClearing> {
  const counts: Partial<Record<ObstacleKind, number>> = {};
  for (const c of clearings) {
    for (const [kind, n] of Object.entries(c.obstacleCounts) as [ObstacleKind, number][]) {
      counts[kind] = (counts[kind] ?? 0) + n;
    }
  }
  return {
    obstacleCost: clearings.reduce((sum, c) => sum + c.obstacleCost, 0),
    obstacleIds: clearings.flatMap((c) => c.obstacleIds),
    clearedTrees: clearings.reduce((sum, c) => sum + c.clearedTrees, 0),
    obstacleCounts: counts,
    spared: NO_SPARED,
  };
}

/**
 * Smí políčko `cell` dostat starší polozemnice, která na něm už stojí (převod starých vsí,
 * `withPlots`)? Jako u nového pozemku: louka (les ne – obyvatelé ho sami nevyklučí), nic jiného ho
 * nezabírá (obydlí samo se do `village` nedává), bez výchozu a posvátných míst – rovnost pod domem
 * se nehlídá, dům už stojí. Vrátí překážky na políčku, nebo důvod, proč ne.
 */
export function existingPlotSquare(
  landscape: Landscape,
  village: PlacementVillage,
  cell: TileCell,
  obstacles: ObstacleLayer,
): PlacementCheck & Partial<Omit<DwellingPlacementCheck, keyof PlacementCheck>> {
  const sites = sacredSitesOf(obstacles);
  const cellProblem = plotCellProblem(landscape, cell, false);
  if (cellProblem) return fail(cellProblem);
  const shape: Shape = { corners: cellCorners(landscape, cell), tile: cellIndex(landscape, cell) };
  const problem = plotSquareProblem(landscape, village, shape, obstacles, sites, false);
  if (problem) return fail(problem);
  return { ...OK, ...plotClearing(landscape, village, shape, obstacles, sites, false) };
}

/**
 * Brání stavbě s půdorysem `plot` posvátné místo? Háj se nekácí (žádný čtverec háje pod
 * půdorysem) a pod korunou posvátného dubu se nestaví (kmen blíž než SACRED_OAK_RADIUS_M).
 * Vrací důvod česky, nebo null.
 */
export function sacredUnder(
  landscape: Landscape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  plot: readonly (readonly Point[])[],
): string | null {
  const tiles = plot.flatMap((polygon) => cellsUnderPolygon(landscape, polygon));
  if (tiles.some((tile) => sites.groveByTile.has(tile))) {
    return 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.';
  }
  if (
    plot.some((polygon) => sacredOaksNear(sites, obstacles, polygon, SACRED_OAK_RADIUS_M).length)
  ) {
    return 'Stojí tu posvátný dub – ten vesničané nepokácí.';
  }
  return null;
}

/** Kolik z dospělých stromů `treeIds` nevyhradila žádná stavba (ty dají klády z mýcení). */
export function unreservedTrees(
  village: PlacementVillage | null,
  treeIds: readonly number[],
): number {
  const reserved = new Set(village?.reservedTrees ?? []);
  return treeIds.filter((id) => !reserved.has(id)).length;
}
