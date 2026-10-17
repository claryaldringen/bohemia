import { describe, expect, it } from 'vitest';
import {
  generateLandscape,
  obstacleKind,
  obstaclesOf,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../landscape';
import { foundField, foundVillage, startNewDwelling } from '../actions';
import {
  countMatureTrees,
  fellTrees,
  matureTreesByDistance,
  NO_OBSTACLE_CHANGES,
  obstacleChangesAt,
  treeRegrowth,
  withObstacleClearing,
  type ObstacleChanges,
} from '../obstacles';
import { checkDwellingPlacement, fieldPartsFromCells, type PlacementVillage } from '../placement';
import {
  DWELLINGS,
  OBSTACLE_COST,
  OUTCROP_RADIUS_M,
  TREE_REGROWTH_YEARS,
  TREE_SAPLING_AFTER_YEARS,
} from '../rules';
import { advanceVillage } from '../simulate';
import type { Position, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';

// Ruční krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m.
const landscape = makeLandscape();
const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const YEAR = 365.25;

const obstacle = (
  id: number,
  kind: ObstaclePlacement['kind'],
  x: number,
  z: number,
  scale = 1,
): ObstaclePlacement => ({
  id,
  kind,
  look: kind === 'tree' ? 'oak-1' : kind === 'outcrop' ? 'rock-boulder' : 'stone-1',
  x,
  z,
  rotation: 0,
  scale,
});

/** Strom a kámen v políčku (8, 8), keř v (9, 8), skalní výchoz v (8, 9), mladý strom v (7, 8). */
const layer: ObstacleLayer = packObstacles(
  [
    obstacle(100, 'tree', 3, 3),
    obstacle(101, 'stone', 10, 10),
    obstacle(102, 'shrub', 20, 3),
    obstacle(103, 'outcrop', 5, 22),
    obstacle(104, 'youngTree', -4, 3),
    obstacle(105, 'tree', 40, 40),
  ],
  16,
  15,
);
const village = (changes: ObstacleChanges = NO_OBSTACLE_CHANGES): PlacementVillage => ({
  dwellings: [],
  constructions: [],
  parts: [],
  obstacleChanges: changes,
});
const FAR_DWELLING = [at(-30, 0)];

describe('fieldPartsFromCells – překážky na čtvercích', () => {
  const preview = fieldPartsFromCells(landscape, village(), block(8, 8, 2, 3), FAR_DWELLING, layer);
  const partOf = (x: number, y: number) =>
    preview.parts.find((p) => p.cell?.x === x && p.cell.y === y)!;

  it('díl platí překážky po kusech podle tabulky a osadníci je odstraní', () => {
    expect(partOf(8, 8).obstacleCost).toBe(OBSTACLE_COST.tree + OBSTACLE_COST.stone);
    expect(partOf(8, 8).obstacleIds).toEqual([100, 101]);
    expect(partOf(9, 8).obstacleCost).toBe(OBSTACLE_COST.shrub);
    expect(partOf(9, 9).obstacleIds).toBeUndefined();
    expect(preview.obstacleCost).toBe(
      OBSTACLE_COST.tree + OBSTACLE_COST.stone + OBSTACLE_COST.shrub,
    );
    expect(preview.obstacleCounts).toEqual({ tree: 1, stone: 1, shrub: 1, outcrop: 1 });
  });

  it('skalní výchoz se neodstraní – plocha pod ním se do dílu nepočítá', () => {
    const outcrop = partOf(8, 9);
    expect(outcrop.obstacleIds).toBeUndefined();
    expect(outcrop.obstacleCost).toBe(0);
    expect(outcrop.areaM2).toBeCloseTo(225 - Math.PI * OUTCROP_RADIUS_M ** 2, 6);
    expect(preview.areaM2).toBeCloseTo(6 * 225 - Math.PI * OUTCROP_RADIUS_M ** 2, 6);
  });

  it('cena založení = louka za hektar + překážky', () => {
    const meadow = (preview.areaM2 / 10_000) * 40;
    expect(preview.foundingCost).toBeCloseTo(meadow + preview.obstacleCost, 9);
  });

  it('odstraněné překážky se neplatí, pařez a mladý stromek stojí méně než strom', () => {
    const cost = (changes: ObstacleChanges): number =>
      fieldPartsFromCells(landscape, village(changes), block(8, 8, 2, 3), FAR_DWELLING, layer)
        .obstacleCost;
    const base = cost(NO_OBSTACLE_CHANGES);
    const tree = OBSTACLE_COST.tree;
    expect(cost({ removed: [100], stumps: [], saplings: [] })).toBe(base - tree);
    expect(cost({ removed: [], stumps: [100], saplings: [] })).toBe(
      base - tree + OBSTACLE_COST.stump,
    );
    expect(cost({ removed: [], stumps: [], saplings: [100] })).toBe(
      base - tree + OBSTACLE_COST.youngTree,
    );
  });
});

describe('checkDwellingPlacement – překážky na vyklízené ploše', () => {
  it('platí se překážky na celé ploše staveniště, ne jen pod půdorysem', () => {
    // půdorys x 1–5, z −4…0; strom (3, 3) stojí před vchodem, na staveništi
    const check = checkDwellingPlacement(landscape, village(), 'zemnice', at(3, -2), layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([100]);
    expect(check.obstacleCost).toBe(OBSTACLE_COST.tree);
    expect(check.obstacleCounts).toEqual({ tree: 1 });
  });

  it('natočení obydlí rozhoduje, na které straně je staveniště', () => {
    const turned = checkDwellingPlacement(
      landscape,
      village(),
      'zemnice',
      at(3, -2, Math.PI),
      layer,
    );
    expect(turned.obstacleIds).toEqual([]);
    expect(turned.obstacleCost).toBe(0);
  });

  it('obydlí nestojí na skalním výchozu', () => {
    const check = checkDwellingPlacement(landscape, village(), 'zemnice', at(5, 18), layer);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/skalní výchoz/);
    expect(checkDwellingPlacement(landscape, village(), 'zemnice', at(5, 12), layer).ok).toBe(true);
  });

  it('překážky v políčku pole patří poli – obydlí vedle pole je neplatí', () => {
    const withField: PlacementVillage = { ...village(), parts: [{ cell: { x: 8, y: 8 } }] };
    // půdorys x 1–5, z −4…0 je mimo pole, staveniště zasahuje do políčka (8, 8) se stromem
    const check = checkDwellingPlacement(landscape, withField, 'zemnice', at(3, -2), layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([]);
  });

  it('už odstraněný strom se neplatí', () => {
    const changes = { removed: [100], stumps: [], saplings: [] };
    const check = checkDwellingPlacement(landscape, village(changes), 'zemnice', at(3, -2), layer);
    expect(check.obstacleIds).toEqual([]);
  });
});

describe('odstraňování překážek stavbami', () => {
  const DAY = 1000;
  const parts = fieldPartsFromCells(landscape, null, block(8, 8, 2, 3), [at(-30, 0)], layer).parts;
  const founded = (): VillageState =>
    foundVillage({
      seed: 1,
      day: DAY,
      dwellingPosition: at(-30, 0),
      firstField: { parts },
      dwellingObstacleIds: [104],
    });

  it('první zemnice stojí hned – její překážky jsou pryč od založení', () => {
    const s = founded();
    expect(s.clearedObstacles).toEqual([{ id: 104, day: DAY }]);
    expect(s.felledTrees).toEqual([]);
  });

  it('díl pole nese své překážky, dokud ho osadníci nezaloží – pak zmizí natrvalo', () => {
    const s = founded();
    const pending = s.parts.flatMap((p) => p.obstacles ?? []);
    expect(pending.sort()).toEqual([100, 101, 102]);
    const later = advanceVillage(s, DAY + 200);
    expect(later.parts.every((p) => p.state !== 'founding')).toBe(true);
    expect(later.parts.some((p) => p.obstacles !== undefined)).toBe(false);
    const cleared = later.clearedObstacles!.map((c) => c.id).sort();
    expect(cleared).toEqual([100, 101, 102, 104]);
    for (const c of later.clearedObstacles!.filter((c) => c.id !== 104)) {
      expect(c.day).toBeGreaterThan(DAY - 1);
    }
  });

  it('nové obydlí odstraní překážky hned při zahájení stavby a zaplatí je prací', () => {
    const s = advanceVillage(founded(), DAY + 1);
    const next = startNewDwelling(s, DAY + 1, 'zemnice', at(3, -2), 3, [100]);
    expect(next.clearedObstacles).toContainEqual({ id: 100, day: DAY + 1 });
    expect(next.constructions.at(-1)!.cost).toBe(DWELLINGS.zemnice.cost + 3);
  });

  it('id překážek musí být celá nezáporná čísla bez opakování', () => {
    const s = advanceVillage(founded(), DAY + 1);
    expect(() => startNewDwelling(s, DAY + 1, 'zemnice', at(3, -2), 0, [1.5])).toThrow(RangeError);
    expect(() => startNewDwelling(s, DAY + 1, 'zemnice', at(3, -2), 0, [7, 7])).toThrow(RangeError);
    expect(() => foundField(s, DAY + 1, { parts: [{ ...parts[0]!, obstacleIds: [-1] }] })).toThrow(
      RangeError,
    );
  });
});

describe('kácení a obnova lesa (forest.md)', () => {
  const DAY = 2000;
  const state = (): VillageState =>
    foundVillage({ seed: 1, day: DAY, dwellingPosition: at(-30, 0), firstField: null });

  it('pokácený strom: pařez, po TREE_SAPLING_AFTER_YEARS nálet, po TREE_REGROWTH_YEARS strom', () => {
    expect(treeRegrowth(DAY, DAY)).toBe('stump');
    expect(treeRegrowth(DAY, DAY + Math.ceil(TREE_SAPLING_AFTER_YEARS * YEAR))).toBe('sapling');
    expect(treeRegrowth(DAY, DAY + Math.ceil(TREE_REGROWTH_YEARS * YEAR))).toBe('grown');
    expect(treeRegrowth(DAY, DAY + Math.ceil(29 * YEAR))).toBe('stump');
    expect(treeRegrowth(DAY, DAY + Math.ceil(69 * YEAR))).toBe('sapling');
    expect([TREE_SAPLING_AFTER_YEARS, TREE_REGROWTH_YEARS]).toEqual([30, 70]);
  });

  it('fellTrees zapíše stromy s dnem a změny ukazují pařezy, pak nálet', () => {
    const felled = fellTrees(state(), [100, 105], DAY + 5);
    expect(felled.felledTrees).toEqual([
      { id: 100, day: DAY + 5 },
      { id: 105, day: DAY + 5 },
    ]);
    expect(obstacleChangesAt(felled, DAY + 6)).toEqual({
      removed: [],
      stumps: [100, 105],
      saplings: [],
    });
    const later = DAY + 5 + Math.ceil(35 * YEAR);
    expect(obstacleChangesAt(felled, later).saplings).toEqual([100, 105]);
    const grown = DAY + 5 + Math.ceil(71 * YEAR);
    expect(obstacleChangesAt(felled, grown)).toEqual(NO_OBSTACLE_CHANGES);
  });

  it('pokácený strom nejde pokácet znovu, dokud nedoroste; pak ano a starý záznam zmizí', () => {
    const felled = fellTrees(state(), [100], DAY);
    expect(() => fellTrees(felled, [100], DAY + 1)).toThrow(RangeError);
    expect(() => fellTrees(felled, [101, 101], DAY + 1)).toThrow(RangeError);
    const grown = DAY + Math.ceil(TREE_REGROWTH_YEARS * YEAR);
    const again = fellTrees(felled, [100], grown);
    expect(again.felledTrees).toEqual([{ id: 100, day: grown }]);
  });

  it('odstraněný strom (pole, obydlí) nejde pokácet a pařez po něm nezůstane', () => {
    const s = { ...fellTrees(state(), [105], DAY), clearedObstacles: [{ id: 100, day: DAY }] };
    expect(() => fellTrees(s, [100], DAY + 1)).toThrow(RangeError);
    const both = { ...s, clearedObstacles: [...s.clearedObstacles, { id: 105, day: DAY + 2 }] };
    expect(obstacleChangesAt(both, DAY + 3)).toEqual({
      removed: [100, 105],
      stumps: [],
      saplings: [],
    });
  });

  it('nejbližší stojící dospělé stromy – bez pařezů, odstraněných a mladých stromků', () => {
    const changes = { removed: [], stumps: [100], saplings: [] };
    const trees = matureTreesByDistance(layer, changes, { x: 0, z: 0 });
    expect(trees.map((t) => t.id)).toEqual([105]);
    expect(trees[0]!.distanceM).toBeCloseTo(Math.hypot(40, 40), 4);
    const all = matureTreesByDistance(layer, NO_OBSTACLE_CHANGES, { x: 0, z: 0 });
    expect(all.map((t) => t.id)).toEqual([100, 105]);
    expect(matureTreesByDistance(layer, NO_OBSTACLE_CHANGES, { x: 0, z: 0 }, { limit: 1 })).toEqual(
      [all[0]],
    );
    expect(
      matureTreesByDistance(layer, NO_OBSTACLE_CHANGES, { x: 0, z: 0 }, { maxDistanceM: 10 }),
    ).toEqual([all[0]]);
    expect(countMatureTrees(layer, NO_OBSTACLE_CHANGES)).toBe(2);
    expect(countMatureTrees(layer, changes)).toBe(1);
  });

  it('na vygenerované krajině jsou nejbližší stromy opravdu dospělé a seřazené', () => {
    const l = generateLandscape(3);
    const real = obstaclesOf(l);
    const trees = matureTreesByDistance(real, NO_OBSTACLE_CHANGES, { x: 0, z: 0 }, { limit: 35 });
    expect(trees).toHaveLength(35);
    for (let i = 1; i < trees.length; i++) {
      expect(trees[i]!.distanceM).toBeGreaterThanOrEqual(trees[i - 1]!.distanceM);
    }
    for (const t of trees) {
      const index = real.id.indexOf(t.id);
      expect(obstacleKind(real, index)).toBe('tree');
    }
    expect(countMatureTrees(real, NO_OBSTACLE_CHANGES)).toBeGreaterThan(40_000);
  });
});

describe('withObstacleClearing – ves z doby před vrstvou překážek', () => {
  const DAY = 3000;
  const legacy = (): VillageState => {
    // díly ze staré vsi o překážkách nevěděly
    const parts = fieldPartsFromCells(
      landscape,
      null,
      block(8, 8, 2, 3),
      [at(-30, 0)],
      layer,
    ).parts.map((p) => ({ ...p, obstacleIds: undefined }));
    const s = foundVillage({
      seed: 1,
      day: DAY,
      dwellingPosition: at(0, -2),
      firstField: { parts },
    });
    delete s.clearedObstacles;
    delete s.felledTrees;
    return s;
  };

  it('doplní překážky pod obydlím jako odstraněné a díly v zakládání dostanou své', () => {
    const s = withObstacleClearing(legacy(), layer);
    // na staveništi zemnice (0, −2) stojí mladý strom 104 a strom 100 – ten je ale v políčku
    // pole, a tak patří dílu; díly se zakládají, výchoz zůstane
    expect(s.clearedObstacles).toEqual([{ id: 104, day: DAY - 1 }]);
    expect(s.felledTrees).toEqual([]);
    const pending = s.parts.flatMap((p) => p.obstacles ?? []).sort();
    expect(pending).toEqual([100, 101, 102]);
  });

  it('založené díly mají překážky odstraněné; ves s překážkami vrací beze změny', () => {
    const old = legacy();
    for (const p of old.parts) p.state = 'ready';
    const s = withObstacleClearing(old, layer);
    expect(s.clearedObstacles!.map((c) => c.id)).toEqual([100, 101, 102, 104]);
    expect(withObstacleClearing(s, layer)).toBe(s);
  });
});
