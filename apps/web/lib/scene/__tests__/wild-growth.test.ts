import { describe, expect, it } from 'vitest';
import { obstacleChangesAt, woodTreeId, type AddedObstacle } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage, SceneWood } from '../../village-view';
import {
  WILD_LATE_MODELS,
  WILD_PIONEER_MODELS,
  WILD_SHRUB_MODELS,
  WILD_STUMP_MODEL,
  isWildTreeModel,
  partWildPlants,
  wildKey,
  wildModelUrl,
  wildPlants,
  woodWildPlants,
} from '../wild-growth';

// Zarůstání přílohu ve scéně (fields.md – Zarůstání, Les vsi).

const part = (overgrowth?: number, cell = { x: 4, y: 7 }): SceneFieldPart => ({
  id: 1,
  cell,
  x: 37.5,
  z: 82.5,
  size: 15,
  stage:
    overgrowth && overgrowth >= 15
      ? 'young-forest'
      : overgrowth && overgrowth >= 5
        ? 'shrubs'
        : 'meadow',
  ...(overgrowth ? { overgrowth } : {}),
});

const shrubs = (plants: ReturnType<typeof partWildPlants>): typeof plants =>
  plants.filter((p) => (WILD_SHRUB_MODELS as readonly string[]).includes(p.model));
const trees = (plants: ReturnType<typeof partWildPlants>): typeof plants =>
  plants.filter((p) => isWildTreeModel(p.model));

/** Les vsi na políčku (6, 2) – stromy z herního jádra jako ve hře. */
function wood(age: number, felled: number[] = []): { scene: SceneWood; added: AddedObstacle[] } {
  const cell = { x: 6, y: 2 };
  const day = 40_000;
  const domain = {
    cell,
    x: 97.5,
    z: 37.5,
    areaM2: 225,
    surface: 'meadow' as const,
    day: day - Math.round((age - 30) * 365.25),
  };
  const added =
    obstacleChangesAt(
      {
        clearedObstacles: [],
        felledTrees: felled.map((k) => ({ id: woodTreeId(cell, k), day: day - 365 })),
        woods: [domain],
      },
      day,
    ).added ?? [];
  return { scene: { cell, x: 97.5, z: 37.5, size: 15, surface: 'meadow', age }, added: [...added] };
}

describe('zarůstající díl – keře a stromky podle let bez pastvy a seče', () => {
  it('do 3 let louka bez keřů, pak keře přibývají a rostou, od 8 let průkopnické stromky', () => {
    expect(partWildPlants(part(), 0)).toEqual([]);
    expect(partWildPlants(part(2), 2)).toEqual([]);
    const at = (years: number): ReturnType<typeof partWildPlants> =>
      partWildPlants(part(years), years);
    expect(shrubs(at(3)).length).toBeGreaterThan(0);
    expect(trees(at(7))).toEqual([]);
    expect(shrubs(at(14)).length).toBeGreaterThan(shrubs(at(5)).length);
    expect(Math.max(...shrubs(at(14)).map((p) => p.scale))).toBeGreaterThan(
      Math.max(...shrubs(at(4)).map((p) => p.scale)),
    );
    expect(trees(at(9)).length).toBeGreaterThan(0);
    expect(trees(at(29)).length).toBeGreaterThanOrEqual(trees(at(15)).length);
    expect(Math.max(...trees(at(29)).map((p) => p.scale))).toBeGreaterThan(
      Math.max(...trees(at(10)).map((p) => p.scale)) * 2,
    );
    for (const p of trees(at(20))) {
      expect((WILD_PIONEER_MODELS as readonly string[]).includes(p.model)).toBe(true);
    }
  });

  it('rostliny stojí ve svém čtverci a jsou pokaždé stejné', () => {
    const plants = partWildPlants(part(20), 20);
    expect(partWildPlants(part(20), 20)).toEqual(plants);
    for (const p of plants) {
      expect(Math.abs(p.x - 37.5)).toBeLessThanOrEqual(7.5);
      expect(Math.abs(p.z - 82.5)).toBeLessThanOrEqual(7.5);
    }
    expect(partWildPlants(part(20, { x: 5, y: 7 }), 20)).not.toEqual(plants);
  });
});

describe('les vsi – stromy z herního jádra, rostou do 70 let', () => {
  it('strom na každém místě, se stářím větší; pokácený je pařez', () => {
    const young = wood(30);
    const old = wood(70, [2]);
    const youngPlants = trees(woodWildPlants(young.scene, young.added));
    expect(youngPlants).toHaveLength(5);
    const oldPlants = woodWildPlants(old.scene, old.added);
    expect(trees(oldPlants)).toHaveLength(4);
    expect(oldPlants.filter((p) => p.model === WILD_STUMP_MODEL)).toHaveLength(1);
    expect(Math.max(...trees(oldPlants).map((p) => p.scale))).toBeGreaterThan(
      Math.max(...youngPlants.map((p) => p.scale)),
    );
    // podrost
    expect(shrubs(oldPlants)).toHaveLength(3);
    expect(wildModelUrl(WILD_LATE_MODELS[0])).toBe('/models/trees/oak-1.glb');
    expect(wildModelUrl(WILD_STUMP_MODEL)).toBe('/models/decor/stump.glb');
  });

  it('všechny rostliny vsi a klíč, který se mění jen se změnou dat', () => {
    const forest = wood(40);
    const village: Pick<SceneVillage, 'fields' | 'woods' | 'obstacles'> = {
      fields: [{ id: 1, parts: [part(9), part(undefined, { x: 5, y: 7 })] }],
      woods: [forest.scene],
      obstacles: { removed: [], stumps: [], saplings: [], added: forest.added },
    };
    const plants = wildPlants(village);
    expect(plants.length).toBe(
      partWildPlants(part(9), 9).length + woodWildPlants(forest.scene, forest.added).length,
    );
    const key = wildKey(village);
    expect(wildKey({ ...village })).toBe(key);
    expect(wildKey({ ...village, fields: [{ id: 1, parts: [part(10)] }] })).not.toBe(key);
    expect(wildKey({ ...village, woods: [{ ...forest.scene, age: 41 }] })).not.toBe(key);
  });

  it('pod stavbou v lese vsi podrost neroste (Martin 19. 10. 2026 – les se vyklučí)', () => {
    const forest = wood(40);
    const village: Pick<SceneVillage, 'fields' | 'woods' | 'obstacles' | 'dwellings'> = {
      fields: [],
      woods: [forest.scene],
      obstacles: { removed: [], stumps: [], saplings: [], added: forest.added },
      dwellings: [],
    };
    const all = wildPlants(village);
    // zemnice uprostřed lesa vsi – vyklízená plocha x 92,7–102,3, z 33,1–45
    const house = {
      id: 1,
      type: 'zemnice' as const,
      position: { x: 97.5, z: 37.5, rotation: 0 },
      built: true,
      progress: 1,
    };
    const built = { ...village, dwellings: [house] };
    const left = wildPlants(built);
    expect(left.length).toBeLessThan(all.length);
    const inside = (p: { x: number; z: number }): boolean =>
      p.x > 92.7 && p.x < 102.3 && p.z > 33.1 && p.z < 45;
    expect(left.some(inside)).toBe(false);
    expect(wildKey(built)).not.toBe(wildKey(village));
  });
});

describe('Zdivočelý sad ve scéně', () => {
  // náletové stromy opuštěného sadu (orchard.md – Zdivočelý sad): jabloně v modelech sadu,
  // k nim pár jiných dřevin, nepravidelně rozmístěné podle jádra
  const trees = Array.from({ length: 40 }, (_, i) => ({
    id: 3_221_225_472 + i,
    x: 20 + (i % 8) * 4.3 + (i % 3) * 0.7,
    z: 30 + Math.floor(i / 8) * 5.1 + (i % 5) * 0.4,
    apple: i % 5 !== 0,
    age: (i * 3) % 40,
  }));
  const village = {
    fields: [],
    obstacles: undefined,
    roads: undefined,
    wildTrees: trees,
  } as unknown as SceneVillage;

  it('jabloně mají modely sadu a velikost podle stáří, ostatní jsou jiné dřeviny', () => {
    const plants = wildPlants(village);
    expect(plants).toHaveLength(trees.length);
    const apples = plants.filter((p) => p.model.startsWith('apple'));
    expect(apples).toHaveLength(trees.filter((t) => t.apple).length);
    expect(apples.length / plants.length).toBeGreaterThan(0.7);
    for (const p of plants) expect(isWildTreeModel(p.model)).toBe(true);
    // mladší strom je menší
    const young = wildPlants({ ...village, wildTrees: [{ ...trees[1]!, age: 1 }] } as SceneVillage);
    const old = wildPlants({ ...village, wildTrees: [{ ...trees[1]!, age: 20 }] } as SceneVillage);
    expect(young[0]!.scale).toBeLessThan(old[0]!.scale);
  });

  it('stromy nestojí v řadách (poloha podle jádra) a klíč reaguje na stáří', () => {
    const xs = new Set(wildPlants(village).map((p) => Math.round(p.x * 10)));
    expect(xs.size).toBeGreaterThan(15);
    const older = { ...village, wildTrees: trees.map((t) => ({ ...t, age: t.age + 1 })) };
    expect(wildKey(older as SceneVillage)).not.toBe(wildKey(village));
    expect(wildKey(village)).toBe(wildKey(village));
  });
});
