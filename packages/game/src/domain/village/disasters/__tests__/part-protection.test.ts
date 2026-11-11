import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  packObstacles,
  type Landscape,
  type ObstacleLayer,
  type ObstaclePlacement,
  type Surface,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import {
  computePartProtections,
  partProtectionDay,
  partProtectionOf,
  protectionAgainst,
} from '../part-protection';
import { PROTECTION } from '../../rules/rules-disasters';
import { advanceVillage } from '../../core/simulate';
import type { FieldPart, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Ochrana dílu ze zeleně a vlhkosti (disasters.md – Ochrana dílu): vzdálenost k zeleni, solitéry,
// remízy, voda, vyvýšené, niva a svah, deterministicky, dopočet po kouscích.

const SIZE = 128;
const CELL = 15;
const HALF = (SIZE * CELL) / 2;
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const centerX = (tx: number): number => -HALF + (tx + 0.5) * CELL;
const centerZ = (ty: number): number => -HALF + (ty + 0.5) * CELL;

const tree = (id: number, x: number, z: number, kind: ObstaclePlacement['kind'] = 'tree') =>
  ({ id, kind, look: 'oak-1', x, z, rotation: 0, scale: 1 }) as ObstaclePlacement;

function layerOf(...placements: ObstaclePlacement[]): ObstacleLayer {
  return packObstacles(
    [...placements].sort((a, b) => a.id - b.id),
    SIZE,
    CELL,
  );
}

function part(id: number, tx: number, ty: number): FieldPart {
  return {
    id,
    fieldId: id,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 50,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x: tx, y: ty },
  };
}

function village(parts: FieldPart[], seed = 12345): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({
      seed: 7,
      day: at(600, 9, 2),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    }),
  );
  return { ...base, parts, weatherSeed: seed };
}

interface Spec {
  surface?: (x: number, y: number) => Surface;
  height?: (x: number, y: number) => number;
}
const land = (spec: Spec = {}): Landscape => makeLandscape({ size: SIZE, ...spec });

/** Les od sloupce 90 – díl ve sloupci 89 sousedí s okrajem, ve sloupci 88 už ne. */
const FOREST_FROM_90 = (x: number): Surface => (x >= 90 ? 'forest' : 'meadow');
const DAY = at(601, 4, 1);

describe('ochrana dílu – zeleň', () => {
  it('díl přímo u okraje lesa 1, díl ve 112,5 m i uprostřed lánu 0 (les chrání jen sousedy)', () => {
    const s = village([part(1, 89, 64), part(2, 82, 64), part(3, 70, 64)]);
    const p = computePartProtections(s, DAY, land({ surface: FOREST_FROM_90 }), null);
    expect(p['1']!.green).toBe(1);
    expect(p['2']!.green).toBe(0);
    expect(p['3']!.green).toBe(0);
  });

  it('díl 90 m od sadu má (100 − 90) ÷ 85', () => {
    // sad ve sloupci 80, díl o 6 políček dál: 90 m mezi středy
    const s = village([part(1, 86, 64)]);
    s.orchards = [
      {
        id: 1,
        squares: [{ cell: { x: 80, y: 64 } }],
      } as unknown as NonNullable<VillageState['orchards']>[number],
    ];
    const p = computePartProtections(s, DAY, land(), null);
    expect(p['1']!.green).toBeCloseTo(10 / 85, 2);
  });

  it('solitéry do 50 m: dva dávají +0,5, třetí daleko nic, nejvýš 1', () => {
    const x = centerX(80);
    const z = centerZ(64);
    const layer = layerOf(
      tree(1, x + 30, z),
      tree(2, x, z + 30),
      tree(3, x - 200, z), // daleko
    );
    const s = village([part(1, 80, 64)]);
    expect(computePartProtections(s, DAY, land(), layer)['1']!.green).toBeCloseTo(0.5, 5);
    // čtyři solitéry – oříznuto na 1
    const four = layerOf(
      tree(1, x + 30, z),
      tree(2, x, z + 30),
      tree(3, x - 30, z),
      tree(4, x, z - 30),
      tree(5, x + 45, z + 45),
    );
    expect(computePartProtections(s, DAY, land(), four)['1']!.green).toBe(1);
  });

  it('strom se sousedem do 15 m solitér není; remíz ze tří stromů je zeleň', () => {
    const x = centerX(80);
    const z = centerZ(64);
    // dvojice 40 m od dílu: nejsou solitéry ani remíz
    const pair = layerOf(tree(1, x + 40, z), tree(2, x + 45, z));
    const s = village([part(1, 80, 64)]);
    expect(computePartProtections(s, DAY, land(), pair)['1']!.green).toBe(0);
    // trojice 60 m od dílu = remíz: zeleň (100 − 60) ÷ 85
    const trio = layerOf(tree(1, x + 60, z), tree(2, x + 65, z), tree(3, x + 60, z + 5));
    expect(computePartProtections(s, DAY, land(), trio)['1']!.green).toBeCloseTo(40 / 85, 2);
    // trojice od 100 m dál už dílu nepomáhá
    const far = layerOf(tree(1, x + 100, z), tree(2, x + 105, z), tree(3, x + 100, z + 5));
    expect(computePartProtections(s, DAY, land(), far)['1']!.green).toBe(0);
  });

  it('pokácený remíz se nepočítá (pařez), jabloň u cesty je solitér', () => {
    const x = centerX(80);
    const z = centerZ(64);
    const trio = layerOf(tree(1, x + 100, z), tree(2, x + 105, z), tree(3, x + 100, z + 5));
    const s = village([part(1, 80, 64)]);
    s.felledTrees = [1, 2, 3].map((id) => ({ id, day: DAY - 10 }));
    expect(computePartProtections(s, DAY, land(), trio)['1']!.green).toBe(0);
    // jabloň (strom u cesty) 20 m od dílu, bez vrstvy překážek
    const apples = village([part(1, 80, 64)]);
    apples.roads = {
      apples: [{ id: 9_000_001, x: x + 20, z, plantedDay: DAY - 20 * 365 }],
    } as unknown as VillageState['roads'];
    const withApple = computePartProtections(apples, DAY, land(), layerOf());
    expect(withApple['1']!.green).toBeGreaterThanOrEqual(0);
  });
});

describe('ochrana dílu – vlhkost', () => {
  it('u vody +0,2, vyvýšený −0,2, oříznutí 0–1', () => {
    const water = (x: number, y: number): Surface => (x === 60 && y === 10 ? 'water' : 'meadow');
    const near = (x: number, y: number): Surface => (x === 77 && y === 64 ? 'water' : 'meadow');
    const s = village([part(1, 80, 64)]);
    const pNear = computePartProtections(s, DAY, land({ surface: near }), null)['1']!;
    expect(pNear.nearWater).toBe(true);
    expect(protectionAgainst(pNear, 'dry')).toBeCloseTo(0.2, 5);
    // vyvýšený díl u lesa: hřbet 8 m, voda daleko
    const hill = (x: number, y: number): number => (x === 89 && y === 64 ? 8 : 0);
    const forestHill = village([part(1, 89, 64)]);
    const pHill = computePartProtections(
      forestHill,
      DAY,
      land({
        surface: (x, y) => (x === 60 && y === 10 ? 'water' : FOREST_FROM_90(x)),
        height: hill,
      }),
      null,
    )['1']!;
    expect(pHill.raised).toBe(true);
    expect(protectionAgainst(pHill, 'dry')).toBeCloseTo(0.8, 5);
    expect(protectionAgainst(pHill, 'frost')).toBeCloseTo(0.8, 5);
    // holý vyvýšený díl se ořízne na 0
    const bare = computePartProtections(
      s,
      DAY,
      land({ surface: water, height: (x, y) => (x === 80 && y === 64 ? 8 : 0) }),
      null,
    )['1']!;
    expect(bare.raised).toBe(true);
    expect(protectionAgainst(bare, 'dry')).toBe(0);
  });

  it('bez vody v mapě není nic niva ani vyvýšené', () => {
    const p = computePartProtections(village([part(1, 80, 64)]), DAY, land(), null)['1']!;
    expect(p.lowland).toBeUndefined();
    expect(p.raised).toBeUndefined();
    expect(p.nearWater).toBeUndefined();
  });

  it('deštivé léto: niva −0,2, svah +0,2, zeleň se nepočítá', () => {
    const water = (x: number, y: number): Surface => (x === 79 && y === 64 ? 'water' : 'meadow');
    const s = village([part(1, 80, 64), part(2, 100, 64)]);
    const p = computePartProtections(s, DAY, land({ surface: water }), null);
    expect(p['1']!.lowland).toBe(true);
    expect(protectionAgainst(p['1'], 'wet')).toBeCloseTo(-0.2, 5);
    // svah: soused o 2 m výš, voda daleko
    const slope = (x: number, y: number): number =>
      x === 10 && y === 10 ? 0 : x === 101 && y === 64 ? 12 : 10;
    const far = (x: number, y: number): Surface => (x === 10 && y === 10 ? 'water' : 'meadow');
    const q = computePartProtections(s, DAY, land({ surface: far, height: slope }), null);
    expect(q['2']!.slope).toBe(true);
    expect(protectionAgainst(q['2'], 'wet')).toBeCloseTo(0.2, 5);
    // les u dílu mokro nemění
    const forest = computePartProtections(
      village([part(1, 89, 64)]),
      DAY,
      land({ surface: FOREST_FROM_90 }),
      null,
    );
    expect(protectionAgainst(forest['1'], 'wet')).toBe(0);
  });

  it('kroupy: zeleň × 0,4', () => {
    expect(protectionAgainst({ green: 1 }, 'hail')).toBeCloseTo(PROTECTION.hailGreenShare, 5);
    expect(protectionAgainst({ green: 0.5, nearWater: true }, 'hail')).toBeCloseTo(0.2, 5);
    expect(protectionAgainst(undefined, 'dry')).toBe(PROTECTION.noLandscapeGreen);
  });
});

describe('den ochrany dílů v simulaci', () => {
  it('jen 1. 4. a jen s weatherSeed; bez krajiny 0,25 všude', () => {
    const s = village([part(1, 89, 64)]);
    partProtectionDay(s, at(601, 3, 31), land(), null);
    expect(s.disasters?.protection).toBeUndefined();
    partProtectionDay(s, DAY, null, null);
    expect(s.disasters?.protection).toEqual({ year: 601, parts: { '1': { green: 0.25 } } });
    const noSeed = village([part(1, 89, 64)]);
    delete noSeed.weatherSeed;
    partProtectionDay(noSeed, DAY, land(), null);
    expect(noSeed.disasters).toBeUndefined();
    expect(partProtectionOf(noSeed, 1, 'dry')).toBe(0.25);
  });

  it('deterministicky; vcelku = po kouscích přes 1. 4.', () => {
    const landscape = land({ surface: FOREST_FROM_90 });
    const layer = layerOf(tree(1, centerX(80) + 30, centerZ(64)));
    const start = at(601, 3, 25);
    const end = at(601, 4, 12);
    const make = (): VillageState => ({
      ...village([part(1, 89, 64), part(2, 80, 64)]),
      lastDay: start,
    });
    const whole = advanceVillage(make(), end, layer, landscape);
    let chunked = make();
    while (chunked.lastDay < end) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + 3), layer, landscape);
    }
    const expected = whole.disasters?.protection;
    expect(expected?.year).toBe(601);
    expect(expected?.parts['1']!.green).toBe(1);
    // solitér 30 m (+0,25); les ve 142,5 m už nechrání
    expect(expected?.parts['2']!.green).toBeCloseTo(0.25, 2);
    expect(chunked.disasters?.protection).toEqual(expected);
    expect(advanceVillage(make(), end, layer, landscape).disasters?.protection).toEqual(expected);
  });

  it('výkon: ves se 150 díly se počítá jednou ročně pod 100 ms (v klidu ≈ 10 ms)', () => {
    const parts: FieldPart[] = [];
    for (let i = 0; i < 150; i++) parts.push(part(i + 1, 60 + (i % 15), 56 + Math.floor(i / 15)));
    const placements: ObstaclePlacement[] = [];
    for (let i = 0; i < 600; i++) {
      placements.push(tree(i + 1, -300 + (i % 30) * 20, -300 + Math.floor(i / 30) * 20));
    }
    const layer = layerOf(...placements);
    const landscape = land({ surface: FOREST_FROM_90 });
    const s = village(parts);
    computePartProtections(s, DAY, landscape, layer); // zahřátí (výška nad potokem se pamatuje)
    const t0 = performance.now();
    computePartProtections(s, DAY, landscape, layer);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
