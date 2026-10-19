import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundVillage, startNewDwelling } from '../actions';
import { obstacleChangesAt } from '../obstacles';
import {
  checkDwellingPlacement,
  checkPenPlacement,
  checkPlotPlacement,
  checkWorkshopPlacement,
  orchardPartsFromCells,
  placementVillageOf,
  rotatedPlot,
  type PlacementVillage,
} from '../placement';
import { NO_CRAFTS, foundingCostPerHa } from '../productivity';
import {
  FOREST_CROWN_MARGIN_M,
  OBSTACLE_COST,
  PLOT_HOUSE_ROTATION,
  dwellingBuildLabor,
} from '../rules';
import { sacredSitesOf } from '../sacred';
import { advanceVillage } from '../simulate';
import type { Person, Position, VillageState, VillageWood } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stavby v lese (Martin, 19. 10. 2026: „obydlí může jít postavit i v lese – les se prostě
// vyklučí“): les pod stavbou osadníci vyklučí jako díl pole v lese – sazba lesa za plochu lesa
// (stromy, podrost a pařezy v ní), kameny a balvany po kusech, dospělé stromy dají klády.
// Ruční krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m,
// sloupce x ≥ 8 jsou les, ostatní louka.

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const meadow = makeLandscape();
const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const YEAR = 365.25;
const HOME: Position = { x: -60, z: 0, rotation: 0 };
/** Sazba lesa za políčko 15 × 15 m bez řemesel (250 čd/ha) a s plným pokrytím nástroji (150). */
const FOREST_SQUARE = foundingCostPerHa('forest', NO_CRAFTS.tools) * 0.0225;
const FOREST_SQUARE_TOOLS = foundingCostPerHa('forest', 1) * 0.0225;
/**
 * Vyklízená plocha zemnice 9,6 × 11,9 m (DWELLING_CLEARING_M) s pruhem pod korunami 4 m
 * (FOREST_CROWN_MARGIN_M) – 17,6 × 19,9 m.
 */
const ZEMNICE_CROWNED = {
  width: 9.6 + 2 * FOREST_CROWN_MARGIN_M,
  depth: 11.9 + 2 * FOREST_CROWN_MARGIN_M,
};
const forestCost = (areaM2: number, tools = NO_CRAFTS.tools): number =>
  (foundingCostPerHa('forest', tools) * areaM2) / 10_000;

const LOOKS: Record<ObstaclePlacement['kind'], ObstaclePlacement['look']> = {
  tree: 'beech-1',
  youngTree: 'fir-young-1',
  snag: 'snag-1',
  fallenTree: 'fallen-1',
  stump: 'stump',
  shrub: 'shrub-1',
  stone: 'stone-1',
  boulder: 'boulder',
  outcrop: 'rock-boulder',
};
const obstacle = (
  id: number,
  kind: ObstaclePlacement['kind'],
  x: number,
  z: number,
): ObstaclePlacement => ({ id, kind, look: LOOKS[kind], x, z, rotation: 0, scale: 1 });

/**
 * Lesní políčko (8, 8): dva dospělé stromy, souš, pařez, keř, kámen, padlý kmen a mladý stromek;
 * lesní políčko (9, 8): strom a balvan; skalní výchoz v lese na políčku (10, 10); louka: strom.
 */
const layer: ObstacleLayer = packObstacles(
  [
    obstacle(1, 'tree', 3, 3),
    obstacle(2, 'tree', 8, 4),
    obstacle(3, 'snag', 11, 6),
    obstacle(4, 'stump', 4, 10),
    obstacle(5, 'shrub', 7, 12),
    obstacle(6, 'stone', 12, 12),
    obstacle(7, 'fallenTree', 2, 13),
    obstacle(8, 'youngTree', 13, 2),
    obstacle(9, 'tree', 20, 3),
    obstacle(10, 'boulder', 25, 10),
    obstacle(11, 'outcrop', 37.5, 37.5),
    obstacle(16, 'tree', -20, 11),
  ],
  16,
  15,
);

/**
 * Zemnice v lesním políčku (8, 8) – vyklízená plocha x 2,7–12,3 m, z 0,6–12,5 m; s pruhem pod
 * korunami x −1,3–16,3 m, z −3,4–16,5 m (v lese x ≥ 0 – 16,3 × 19,9 m).
 */
const IN_FOREST: Position = { x: 7.5, z: 5, rotation: 0 };
const IN_FOREST_M2 = 16.3 * ZEMNICE_CROWNED.depth;

/** Ves s hotovou zemnicí na louce, dospělými a lidmi k osídlení, bez staveb. */
function village(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day, dwellingPosition: HOME }));
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 30), adult(3, 28), adult(4, 20), adult(5, 18), adult(6, 22), adult(7, 21)];
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 10;
  s.lastDay = day;
  return s;
}

describe('obydlí v lese', () => {
  it('projde – les i s pruhem pod korunami za sazbu lesa, kámen po kusech, stromy dají klády', () => {
    const check = checkDwellingPlacement(landscape, null, 'zemnice', IN_FOREST, layer);
    expect(check.ok).toBe(true);
    // stromy, souš, pařez, keř, padlý kmen a mladý stromek (ty dva v pruhu pod korunami) jsou
    // v sazbě lesa, kámen se platí po kusech
    expect(check.obstacleIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(check.obstacleCounts).toEqual({
      tree: 2,
      snag: 1,
      stump: 1,
      shrub: 1,
      stone: 1,
      fallenTree: 1,
      youngTree: 1,
    });
    expect(check.clearedTrees).toBe(2);
    expect(check.obstacleCost).toBeCloseTo(forestCost(IN_FOREST_M2) + OBSTACLE_COST.stone);
    // táž místa na louce by se platila po kusech (osamělé stromy) a pruh pod korunami tam není
    const onMeadow = checkDwellingPlacement(meadow, null, 'zemnice', IN_FOREST, layer);
    expect(onMeadow.obstacleIds).toEqual([1, 2, 3, 4, 5, 6]);
    expect(onMeadow.obstacleCost).toBe(
      2 * OBSTACLE_COST.tree +
        OBSTACLE_COST.snag +
        OBSTACLE_COST.stump +
        OBSTACLE_COST.shrub +
        OBSTACLE_COST.stone,
    );
  });

  it('s kovářem (nástroji) je vyklučení levnější – sazba lesa podle mezí produktivity', () => {
    const tools: PlacementVillage = { ...placementVillageOf(village(), DAY), toolCoverage: 1 };
    const check = checkDwellingPlacement(landscape, tools, 'zemnice', IN_FOREST, layer);
    expect(check.obstacleCost).toBeCloseTo(forestCost(IN_FOREST_M2, 1) + OBSTACLE_COST.stone);
  });

  it('skalní výchoz, voda a prudký svah stavbu dál nedovolí', () => {
    const rock = checkDwellingPlacement(
      landscape,
      null,
      'zemnice',
      { x: 37.5, z: 37, rotation: 0 },
      layer,
    );
    expect(rock.ok).toBe(false);
    expect(rock.reason).toMatch(/výchoz/);
    const water = makeLandscape({ surface: (x) => (x === 8 ? 'water' : 'forest') });
    expect(checkDwellingPlacement(water, null, 'zemnice', IN_FOREST, layer).reason).toMatch(/vod/);
    const steep = makeLandscape({ surface: () => 'forest', height: (x) => x * 2 });
    expect(checkDwellingPlacement(steep, null, 'zemnice', IN_FOREST, layer).reason).toMatch(
      /nerovná/,
    );
  });

  it('zahájení: překážky zmizí, dospělé stromy jdou na hromadu a stavba je hned spotřebuje', () => {
    const s = village();
    const check = checkDwellingPlacement(
      landscape,
      placementVillageOf(s, DAY),
      'zemnice',
      IN_FOREST,
      layer,
    );
    const started = startNewDwelling(
      s,
      DAY,
      'zemnice',
      IN_FOREST,
      check.obstacleCost,
      check.obstacleIds,
      { obstacles: layer, clearedTrees: check.clearedTrees },
    );
    expect(obstacleChangesAt(started, DAY).removed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 10 klád + 2 ze stromů staveniště, zemnice vezme 7 – nic se nekácí
    expect(started.woodLogs).toBe(5);
    const site = started.constructions[0]!;
    expect(site.wood?.fell ?? []).toEqual([]);
    // práce: stavba bez kácení + vyklučení lesa a kámen
    expect(site.cost).toBeCloseTo(dwellingBuildLabor('zemnice') + check.obstacleCost);
  });

  it('dopočet po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním', () => {
    const s = village();
    const check = checkDwellingPlacement(
      landscape,
      placementVillageOf(s, DAY),
      'zemnice',
      IN_FOREST,
      layer,
    );
    const start = startNewDwelling(
      s,
      DAY,
      'zemnice',
      IN_FOREST,
      check.obstacleCost,
      check.obstacleIds,
      { obstacles: layer, clearedTrees: check.clearedTrees },
    );
    const end = DAY + 2 * 365;
    const whole = advanceVillage(start, end, layer);
    expect(whole.dwellings).toHaveLength(2);
    const viaJson = (v: VillageState): VillageState =>
      JSON.parse(JSON.stringify(v)) as VillageState;
    const steps = [1, 29, 200, 7, 13, 365];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!), layer),
      );
    }
    expect(chunked).toEqual(viaJson(whole));
  });

  it('vesničané si sami (bez hráče) les nevyklučí – `clearForest: false`', () => {
    const own = checkDwellingPlacement(landscape, null, 'zemnice', IN_FOREST, layer, {
      clearForest: false,
    });
    expect(own.ok).toBe(false);
    expect(own.reason).toMatch(/les/);
  });
});

describe('pozemek polozemnice v lese', () => {
  const tile = { x: 8, y: 8 };

  it('celé políčko za sazbu lesa, všechny kusy zmizí, dospělé stromy dají klády', () => {
    const check = checkPlotPlacement(
      landscape,
      null,
      'polozemnice',
      { cell: tile, variant: 'center' },
      layer,
    );
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(check.clearedTrees).toBe(2);
    expect(check.obstacleCost).toBeCloseTo(FOREST_SQUARE + OBSTACLE_COST.stone);
    expect(check.position).toEqual({ x: 7.5, z: 7.5, rotation: PLOT_HOUSE_ROTATION });
    // přestavba obyvatel na novém pozemku les nevyklučí
    const own = checkPlotPlacement(
      landscape,
      null,
      'polozemnice',
      { cell: tile, variant: 'center' },
      layer,
      { takeLand: false },
    );
    expect(own.ok).toBe(false);
  });

  it('natočený pozemek v lese: sazba lesa za celý čtverec, kameny a balvany po kusech', () => {
    const plot = rotatedPlot(landscape, { x: 9, z: 7.5, rotation: Math.PI / 12 }, 'center')!;
    expect(plot.square).toBeDefined();
    const check = checkPlotPlacement(landscape, null, 'polozemnice', plot, layer);
    expect(check.ok).toBe(true);
    const pieces =
      (check.obstacleCounts.stone ?? 0) * OBSTACLE_COST.stone +
      (check.obstacleCounts.boulder ?? 0) * OBSTACLE_COST.boulder;
    expect(check.obstacleCost).toBeCloseTo(FOREST_SQUARE + pieces);
    expect(check.obstacleIds).toEqual(expect.arrayContaining([1, 2]));
    expect(check.clearedTrees).toBeGreaterThanOrEqual(2);
  });

  it('pozemek na lese vsi ho vyklučí – les vsi bez stromů zmizí', () => {
    const s = village();
    const wood: VillageWood = {
      cell: { x: 6, y: 8 },
      x: -22.5,
      z: 7.5,
      areaM2: 225,
      surface: 'meadow',
      day: DAY - 40 * 365,
    };
    s.woods = [wood];
    const v = placementVillageOf(s, DAY);
    const plot = { cell: wood.cell, variant: 'center' as const };
    const check = checkPlotPlacement(meadow, v, 'polozemnice', plot, layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleCost).toBeCloseTo(FOREST_SQUARE);
    expect(check.obstacleIds.length).toBeGreaterThanOrEqual(5);
    const started = startNewDwelling(
      s,
      DAY,
      'polozemnice',
      check.position!,
      check.obstacleCost,
      check.obstacleIds,
      { obstacles: layer, clearedTrees: check.clearedTrees, plot },
    );
    expect(started.woods).toBeUndefined();
    expect(obstacleChangesAt(started, DAY).added ?? []).toEqual([]);
  });
});

describe('ostatní stavby v lese', () => {
  it('ohrada, dílna uhlíře s milířem i sad – les za sazbu lesa', () => {
    const pen = checkPenPlacement(landscape, null, { x: 8, y: 8 }, layer);
    expect(pen.ok).toBe(true);
    expect(pen.obstacleCost).toBeCloseTo(FOREST_SQUARE + OBSTACLE_COST.stone);
    expect(pen.clearedTrees).toBe(2);
    const burner = checkWorkshopPlacement(
      landscape,
      null,
      'burner',
      { x: 60, z: 60, rotation: 0 },
      layer,
    );
    expect(burner.ok).toBe(true);
    expect(burner.obstacleCost).toBeGreaterThan(
      forestCost(ZEMNICE_CROWNED.width * ZEMNICE_CROWNED.depth),
    );
    const orchard = orchardPartsFromCells(landscape, null, block(8, 9, 2, 1), [HOME], layer);
    expect(orchard.check.ok).toBe(true);
    expect(orchard.squares.map((s) => s.obstacleCost)).toEqual([FOREST_SQUARE, FOREST_SQUARE]);
    // s nástroji levněji
    const tools: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [],
      toolCoverage: 1,
    };
    const cheap = checkPenPlacement(landscape, tools, { x: 9, y: 9 }, layer);
    expect(cheap.obstacleCost).toBeCloseTo(FOREST_SQUARE_TOOLS);
  });
});

describe('posvátné duby a háje se v lese nikdy nekácí', () => {
  // velký osamělý dub na políčku (8, 8), dubový háj (12 dubů po 5 m) na políčkách (3, 12)
  // a (4, 12); malé duby kvůli velikostem – celá krajina je les
  const forest = makeLandscape({ surface: () => 'forest' });
  const BIG_OAK = 1;
  const oak = (id: number, look: ObstaclePlacement['look'], x: number, z: number, scale = 1) =>
    ({ id, kind: 'tree', look, x, z, rotation: 0, scale }) satisfies ObstaclePlacement;
  const placements: ObstaclePlacement[] = [
    oak(BIG_OAK, 'oak-large-1', 7.5, 7.5, 1.2),
    oak(2, 'oak-1', -52.5, 22.5, 0.8),
    oak(3, 'oak-1', -52.5, -52.5, 0.8),
  ];
  const groveIds: number[] = [];
  for (const [i, z] of [65, 60, 70].entries()) {
    for (const [j, x] of [-70, -75, -65, -60].entries()) {
      const id = 10 + i * 4 + j;
      groveIds.push(id);
      placements.push(oak(id, 'oak-1', x, z));
    }
  }
  const oaks = packObstacles(placements, 16, 15);

  it('vrstva má posvátný dub a háj', () => {
    const sites = sacredSitesOf(oaks);
    expect(sites.oaks.map((o) => o.id)).toContain(BIG_OAK);
    expect(sites.groves).toHaveLength(1);
  });

  it('obydlí pod korunu posvátného dubu ani do háje nesmí, sad dub ušetří', () => {
    const underOak = checkDwellingPlacement(
      forest,
      null,
      'zemnice',
      { x: 12, z: 7.5, rotation: 0 },
      oaks,
    );
    expect(underOak.ok).toBe(false);
    expect(underOak.reason).toMatch(/posvátný dub/);
    const inGrove = checkDwellingPlacement(
      forest,
      null,
      'zemnice',
      { x: -67, z: 65, rotation: 0 },
      oaks,
    );
    expect(inGrove.ok).toBe(false);
    expect(inGrove.reason).toMatch(/háj/);
    const orchard = orchardPartsFromCells(forest, null, [{ x: 8, y: 8 }], [HOME], oaks);
    expect(orchard.check.ok).toBe(true);
    expect(orchard.squares[0]!.obstacleIds ?? []).not.toContain(BIG_OAK);
    expect(orchard.spared.oaks.map((o) => o.id)).toEqual([BIG_OAK]);
  });

  it('vyklízená plocha u háje: stromy háje zůstanou a jeho plocha se neplatí', () => {
    // políčko (5, 12) začíná na x = −45; zemnice u hranice zasahuje plochou s pruhem pod
    // korunami (x −50,8 … −33,2, z 59,1 … 79) do háje na políčku (4, 12) – z 60 … 75
    const position: Position = { x: -42, z: 67.5, rotation: 0 };
    const check = checkDwellingPlacement(forest, null, 'zemnice', position, oaks);
    expect(check.ok).toBe(true);
    for (const id of groveIds) expect(check.obstacleIds).not.toContain(id);
    // v háji leží 5,8 × 15 m plochy – ta se nevyklučí
    const crowned = ZEMNICE_CROWNED.width * ZEMNICE_CROWNED.depth;
    expect(check.obstacleCost).toBeCloseTo(forestCost(crowned - 5.8 * 15));
  });
});
