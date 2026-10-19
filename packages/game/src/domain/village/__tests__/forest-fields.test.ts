import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  generateLandscape,
  obstaclesOf,
  packObstacles,
  surfaceAt,
  tileCenterWorld,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../landscape';
import { foundField, foundVillage, startNewDwelling, type FieldInput } from '../actions';
import { effectiveFertility, fieldSquareSurface, partFoundingCost } from '../fields';
import { obstacleChangesAt } from '../obstacles';
import {
  cemeteryPartsFromCells,
  fieldPartsFromCells,
  orchardPartsFromCells,
  placementVillageOf,
  type PlacementVillage,
} from '../placement';
import { NO_CRAFTS, foundingCostPerHa } from '../productivity';
import {
  FOREST_BONUS,
  LOG_ROT_PER_YEAR,
  OBSTACLE_COST,
  SURFACE_INCLUDED_OBSTACLES,
} from '../rules';
import { advanceVillage } from '../simulate';
import type { Person, Position, TileCell, VillageState } from '../types';
import { reservedTrees } from '../wood';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Pole v křovinách a v lese (fields.md – Založení pole, forest.md – Mýcení a hromada klád).
// Ruční krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m,
// sloupce x ≥ 8 jsou les, ostatní louka.

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const YEAR = 365.25;
const HOME: Position = { x: -60, z: 0, rotation: 0 };
const SQUARE_HA = 225 / 10_000;

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
 * Lesní čtverec (8, 8): dva dospělé stromy, souš, pařez, keř, kámen, padlý kmen a mladý stromek;
 * lesní čtverec (9, 8): strom a balvan; louka (6, 8): pět keřů a strom (křoviny); louka (7, 8):
 * čtyři keře (ještě louka).
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
    ...[0, 1, 2, 3, 4].map((k) => obstacle(11 + k, 'shrub', -28 + k * 3, 4)),
    obstacle(16, 'tree', -20, 11),
    ...[0, 1, 2, 3].map((k) => obstacle(17 + k, 'shrub', -13 + k * 3, 5)),
  ],
  16,
  15,
);
const CELLS = block(6, 8, 4, 2);

const preview = (village: PlacementVillage | null = null, cells: TileCell[] = CELLS) =>
  fieldPartsFromCells(landscape, village, cells, [HOME], layer);
const partAt = (result: ReturnType<typeof preview>, x: number, y: number) =>
  result.parts.find((p) => p.cell?.x === x && p.cell.y === y)!;

/** Ves s hotovou zemnicí a dospělými, kteří pole založí, bez staveb. */
function village(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day, dwellingPosition: HOME }));
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 30), adult(3, 28), adult(4, 20), adult(5, 18)];
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 0;
  s.lastDay = day;
  return s;
}

describe('fieldSquareSurface', () => {
  const TOOLS = NO_CRAFTS.tools;

  it('les podle krajiny, voda není povrch pole', () => {
    expect(fieldSquareSurface('forest', 0, 225, TOOLS)).toBe('forest');
    expect(fieldSquareSurface('forest', 9, 225, TOOLS)).toBe('forest');
    expect(fieldSquareSurface('water', 0, 225, TOOLS)).toBeNull();
  });

  it('louka je křovinami, když by keře po kusech stály aspoň rozdíl sazeb křovin a louky', () => {
    // podle rešerše stojí křoviny bez řemesel stejně jako louka (100 čd/ha) a s nástroji méně –
    // rozdíl sazeb je ≤ 0, takže křovinami je čtverec s jakýmkoli keřem
    for (const tools of [0, 0.5, 1]) {
      expect(fieldSquareSurface('meadow', 0, 225, tools)).toBe('meadow');
      expect(fieldSquareSurface('meadow', 1, 225, tools)).toBe('shrub');
      expect(fieldSquareSurface('meadow', 5, 100, tools)).toBe('shrub');
    }
  });

  it('cena s přibývajícími keři nepřesáhne sazbu křovin a neklesá', () => {
    let previous = 0;
    for (let shrubs = 0; shrubs <= 12; shrubs++) {
      const surface = fieldSquareSurface('meadow', shrubs, 225, TOOLS)!;
      const included = SURFACE_INCLUDED_OBSTACLES[surface].includes('shrub');
      const cost = partFoundingCost(
        surface,
        225,
        included ? 0 : shrubs * OBSTACLE_COST.shrub,
        TOOLS,
      );
      expect(cost).toBeLessThanOrEqual(foundingCostPerHa('shrub', TOOLS) * SQUARE_HA + 1e-9);
      expect(cost).toBeGreaterThan(previous - 1e-9);
      previous = cost;
    }
  });
});

describe('fieldPartsFromCells – pole v křovinách a v lese', () => {
  const result = preview();

  it('pole přes louku, křoviny i les projde; povrch dílů podle čtverce', () => {
    expect(result.check).toEqual({ ok: true, reason: null });
    expect(result.blockedCells).toEqual([]);
    expect(result.parts).toHaveLength(8);
    expect(partAt(result, 6, 8).surface).toBe('shrub');
    // 4 keře – křoviny stojí bez řemesel stejně jako louka, každý keř dělá čtverec křovinami
    expect(partAt(result, 7, 8).surface).toBe('shrub');
    expect(partAt(result, 8, 8).surface).toBe('forest');
    expect(partAt(result, 9, 9).surface).toBe('forest');
    expect(result.surfaceCounts).toEqual({ meadow: 2, shrub: 2, forest: 4 });
  });

  it('v lese jsou stromy, souše, pařezy a podrost v sazbě – po kusech jen kameny a balvany', () => {
    expect(partAt(result, 8, 8).obstacleCost).toBe(OBSTACLE_COST.stone);
    expect(partAt(result, 9, 8).obstacleCost).toBe(OBSTACLE_COST.boulder);
    // odstraní se ale všechno, co na čtverci stojí
    expect(partAt(result, 8, 8).obstacleIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(partAt(result, 9, 8).obstacleIds).toEqual([9, 10]);
  });

  it('v křovinách jsou keře v sazbě, strom se platí po kusech', () => {
    expect(partAt(result, 6, 8).obstacleCost).toBe(OBSTACLE_COST.tree);
    expect(partAt(result, 7, 8).obstacleCost).toBe(0);
  });

  it('cena založení: louka 100, křoviny 100, les 250 člověkodní na hektar + překážky', () => {
    const obstacles = OBSTACLE_COST.stone + OBSTACLE_COST.boulder + OBSTACLE_COST.tree;
    expect(result.obstacleCost).toBe(obstacles);
    expect(result.foundingCost).toBeCloseTo(
      (2 * 100 + 2 * 100 + 4 * 250) * SQUARE_HA + obstacles,
      9,
    );
  });

  it('dospělé stromy na dílech dají klády – mladý stromek, souš ani pařez ne', () => {
    expect(partAt(result, 8, 8).trees).toBe(2);
    expect(partAt(result, 9, 8).trees).toBe(1);
    expect(partAt(result, 6, 8).trees).toBe(1);
    expect(partAt(result, 7, 8).trees).toBeUndefined();
    expect(result.clearedTrees).toBe(4);
  });

  it('strom vyhrazený stavbou kládu nedá, ale z dílu zmizí a cenu nemění', () => {
    const reserved = preview({
      dwellings: [],
      constructions: [],
      parts: [],
      reservedTrees: [1],
    });
    expect(partAt(reserved, 8, 8).trees).toBe(1);
    expect(partAt(reserved, 8, 8).obstacleIds).toContain(1);
    expect(reserved.foundingCost).toBe(result.foundingCost);
    expect(reserved.clearedTrees).toBe(3);
  });

  it('pokácený strom (pařez) v lese kládu nedá a cenu lesa nemění', () => {
    const felled = preview({
      dwellings: [],
      constructions: [],
      parts: [],
      obstacleChanges: { removed: [], stumps: [2, 9], saplings: [] },
    });
    expect(partAt(felled, 8, 8).trees).toBe(1);
    expect(partAt(felled, 9, 8).trees).toBeUndefined();
    expect(felled.foundingCost).toBe(result.foundingCost);
  });

  it('nezávisí na pořadí čtverců – stejný náhled', () => {
    expect(preview(null, [...CELLS].reverse())).toEqual(result);
  });

  it('sad a hřbitov v lese: les se vyklučí za sazbu lesa jako díl pole (Martin 19. 10. 2026)', () => {
    const forestSquare = foundingCostPerHa('forest', NO_CRAFTS.tools) * SQUARE_HA;
    const orchard = orchardPartsFromCells(landscape, null, CELLS, [HOME], layer);
    expect(orchard.check).toEqual({ ok: true, reason: null });
    expect(orchard.blockedCells).toEqual([]);
    expect(orchard.squares).toHaveLength(8);
    const square = (x: number, y: number) =>
      orchard.squares.find((s) => s.cell.x === x && s.cell.y === y)!;
    // keře na louce platí sad po kusech jako dřív
    expect(square(6, 8).obstacleCost).toBe(5 * OBSTACLE_COST.shrub + OBSTACLE_COST.tree);
    // v lese sazba lesa, stromy, souš, pařez, padlý kmen a keř v ní, kámen a balvan po kusech;
    // dospělé stromy dají klády
    expect(square(8, 8).obstacleCost).toBeCloseTo(forestSquare + OBSTACLE_COST.stone);
    expect(square(8, 8).obstacleIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(square(8, 8).trees).toBe(2);
    expect(square(9, 8).obstacleCost).toBeCloseTo(forestSquare + OBSTACLE_COST.boulder);
    expect(square(8, 9).obstacleCost).toBeCloseTo(forestSquare);
    const cemetery = cemeteryPartsFromCells(landscape, null, CELLS, [HOME], layer);
    expect(cemetery.check.ok).toBe(true);
    const grave = cemetery.squares.find((s) => s.cell.x === 8 && s.cell.y === 8)!;
    expect(grave.obstacleCost).toBeCloseTo(forestSquare + OBSTACLE_COST.stone);
    expect(grave.trees).toBe(2);
  });
});

describe('založení pole v lese', () => {
  const founded = (): VillageState =>
    foundField(village(), DAY, { parts: preview(placementVillageOf(village(), DAY)).parts });

  it('po založení: překážky zmizí, klády za dospělé stromy, popel z mýcení (okno 3 let)', () => {
    const s = founded();
    const end = DAY + 2 * 365;
    const after = advanceVillage(s, end, layer);
    expect(after.constructions).toEqual([]);
    expect(after.parts.every((p) => p.state !== 'founding')).toBe(true);
    const removed = obstacleChangesAt(after, end).removed;
    for (let id = 1; id <= 20; id++) expect(removed).toContain(id);
    // 4 klády, hnijí ≈ 4 % ročně
    expect(after.woodLogs).toBeLessThanOrEqual(4);
    expect(after.woodLogs).toBeGreaterThan(4 * (1 - 2 * LOG_ROT_PER_YEAR));
    for (const part of after.parts) {
      if (part.surface === 'forest') {
        expect(part.bonusUntilDay).not.toBeNull();
        expect(part.obstacles).toBeUndefined();
        expect(part.trees).toBeUndefined();
      } else {
        expect(part.bonusUntilDay).toBeNull();
      }
    }
  });

  it('bonus úrodnosti v okně 3 let od založení dílu – první sezóna +40, nejvýš 100', () => {
    let s = founded();
    let day = DAY;
    // den po dni do založení prvního lesního dílu
    while (!s.parts.some((p) => p.surface === 'forest' && p.state !== 'founding')) {
      day++;
      s = advanceVillage(s, day, layer);
    }
    const part = s.parts.find((p) => p.surface === 'forest' && p.state !== 'founding')!;
    expect(part.bonusUntilDay).toBe(day + FOREST_BONUS.windowYears * 365);
    expect(effectiveFertility(part, day)).toBe(
      Math.min(100, part.naturalFertility + FOREST_BONUS.bySeason[0]),
    );
    expect(effectiveFertility(part, part.bonusUntilDay! + 1)).toBe(part.naturalFertility);
  });

  it('strom vyhrazený obydlím: pole ho odstraní bez klády, stavba ho počítá jako pokácený', () => {
    const s = village();
    s.people.push(
      { id: 6, bornDay: DAY - Math.ceil(22 * YEAR), dwellingId: 1 },
      { id: 7, bornDay: DAY - Math.ceil(21 * YEAR), dwellingId: 1 },
    );
    // 3 klády z hromady a 4 dospělé stromy krajiny – zemnice (7 stromů) vyhradí všechny
    s.woodLogs = 3;
    const started = startNewDwelling(s, DAY, 'zemnice', { x: -8, z: -20, rotation: 0 }, 0, [], {
      obstacles: layer,
    });
    expect([...reservedTrees(started)].sort((a, b) => a - b)).toEqual([1, 2, 9, 16]);
    const field = preview(placementVillageOf(started, DAY));
    expect(field.check.ok).toBe(true);
    expect(field.clearedTrees).toBe(0);
    const withField = foundField(started, DAY, { parts: field.parts });
    const after = advanceVillage(withField, DAY + 2 * 365, layer);
    expect(after.constructions).toEqual([]);
    expect(after.dwellings).toHaveLength(2);
    // klády nepřibyly – vyhrazené stromy patří stavbě, ta je počítá jako pokácené
    expect(after.woodLogs).toBe(0);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním', () => {
    const start = founded();
    const end = DAY + 4 * 365;
    const whole = advanceVillage(start, end, layer);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    const steps = [1, 29, 400, 7, 13, 365, 2, 61];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!), layer),
      );
    }
    expect(chunked).toEqual(whole);
    // les se opravdu vymýtil – jinak by shoda nic neznamenala
    expect(
      whole.parts.filter((p) => p.surface === 'forest' && p.state !== 'founding'),
    ).toHaveLength(4);
  });

  it('první pole vsi smí do lesa (založení vsi)', () => {
    const field: FieldInput = { parts: preview().parts };
    const s = foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, firstField: field });
    expect(s.parts.filter((p) => p.surface === 'forest')).toHaveLength(4);
    expect(s.constructions.find((c) => c.kind === 'field')!.cost).toBeCloseTo(
      preview().foundingCost,
      9,
    );
  });
});

describe('pole v lese na vygenerované krajině', () => {
  it('lesní čtverce u vsi: díly se sazbou lesa, klády za stromy, po kusech jen kameny', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const l = generateLandscape(seed);
      const obstacles = obstaclesOf(l);
      const site = l.villageSite;
      const home = tileCenterWorld(l, site.x, site.y);
      // nejbližší blok 3 × 2 lesních čtverců k místu vsi
      let best: TileCell[] | null = null;
      let bestDistance = Infinity;
      for (let y = 0; y < l.size - 1; y++) {
        for (let x = 0; x < l.size - 2; x++) {
          const cells = block(x, y, 3, 2);
          if (!cells.every((c) => surfaceAt(l, c.x, c.y) === 'forest')) continue;
          const d = Math.hypot(x - site.x, y - site.y);
          if (d < bestDistance) {
            best = cells;
            bestDistance = d;
          }
        }
      }
      expect(best).not.toBeNull();
      const result = fieldPartsFromCells(
        l,
        null,
        best!,
        [{ x: home.x, z: home.z, rotation: 0 }],
        obstacles,
      );
      expect(result.check, `seed ${seed}`).toEqual({ ok: true, reason: null });
      expect(result.surfaceCounts).toEqual({ forest: 6 });
      expect(result.clearedTrees).toBeGreaterThan(0);
      const counts = result.obstacleCounts;
      expect(result.obstacleCost).toBe(
        (counts.stone ?? 0) * OBSTACLE_COST.stone + (counts.boulder ?? 0) * OBSTACLE_COST.boulder,
      );
    }
    // Pět krajin s vrstvou překážek trvá samo ≈ 1,5 s, při souběhu s testy webu i přes 5 s.
  }, 30_000);
});
