import { describe, expect, it } from 'vitest';
import { generateLandscape, tileCenterWorld, surfaceAt } from '../../landscape';
import {
  MAX_CEMETERY_CELLS,
  MAX_FIELD_CELLS,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  fieldPartsFromCells,
  villageDwellingPositions,
  waterDistanceM,
  type PlacementVillage,
} from '../placement';
import { DWELLING_FOOTPRINT_M, FIELD_LIMITS } from '../rules';
import type { Position, TileCell } from '../types';
import { block, makeLandscape } from './placement-fixtures';

const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const EMPTY: PlacementVillage = { dwellings: [], constructions: [], parts: [] };

describe('DWELLING_FOOTPRINT_M', () => {
  it('zemnice má půdorys 4 × 4 m, polozemnice 5 × 5 m', () => {
    expect(DWELLING_FOOTPRINT_M.zemnice).toEqual({ width: 4, depth: 4 });
    expect(DWELLING_FOOTPRINT_M.polozemnice).toEqual({ width: 5, depth: 5 });
  });
});

describe('checkDwellingPlacement – terén', () => {
  it('na rovné louce jde stavět', () => {
    const check = checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(7.5, 7.5));
    // ručně vyrobená krajina nemá překážky
    expect(check).toEqual({
      ok: true,
      reason: null,
      obstacleCost: 0,
      obstacleIds: [],
      clearedTrees: 0,
      obstacleCounts: {},
    });
  });

  it('mimo krajinu stavět nejde', () => {
    const check = checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(119, 0));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/krajiny/);
  });

  it('ve vodě stavět nejde', () => {
    const l = makeLandscape({ surface: (x) => (x === 8 ? 'water' : 'meadow') });
    const check = checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/vod/);
  });

  it('v lese stavět nejde – ani když do lesa zasahuje jen roh půdorysu', () => {
    const l = makeLandscape({ surface: (x) => (x === 8 ? 'forest' : 'meadow') });
    const inForest = checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5));
    expect(inForest.ok).toBe(false);
    expect(inForest.reason).toMatch(/louce/);
    // políčko 8 začíná na x = 0, půdorys u x = −1 zasahuje 1 m do lesa
    expect(checkDwellingPlacement(l, null, 'zemnice', at(-1, 7.5)).ok).toBe(false);
    expect(checkDwellingPlacement(l, null, 'zemnice', at(-3, 7.5)).ok).toBe(true);
  });

  it('na příliš prudkém svahu stavět nejde, na mírném ano', () => {
    const steep = makeLandscape({ height: (x) => x * 2 }); // 4 m půdorysu ≈ 0,53 m
    const gentle = makeLandscape({ height: (x) => x * 1.5 }); // ≈ 0,4 m
    const check = checkDwellingPlacement(steep, null, 'zemnice', at(7.5, 7.5));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/nerovná/);
    expect(checkDwellingPlacement(gentle, null, 'zemnice', at(7.5, 7.5)).ok).toBe(true);
  });

  it('otočení půdorysu se počítá – po úhlopříčce je svah delší', () => {
    const l = makeLandscape({ height: (x) => x * 1.5 }); // úhlopříčka 5,66 m ≈ 0,57 m
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5, 0)).ok).toBe(true);
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5, Math.PI / 4)).ok).toBe(false);
  });

  it('větší polozemnice na stejném svahu neprojde, kde zemnice ano', () => {
    const l = makeLandscape({ height: (x) => x * 1.6 }); // 4 m ≈ 0,43 m, 5 m ≈ 0,53 m
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5)).ok).toBe(true);
    expect(checkDwellingPlacement(l, null, 'polozemnice', at(7.5, 7.5)).ok).toBe(false);
  });

  it('neplatná čísla polohy neprojdou', () => {
    expect(checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(NaN, 0)).ok).toBe(false);
  });
});

describe('checkDwellingPlacement – překryv', () => {
  const landscape = makeLandscape();
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: at(0, 0) }],
    constructions: [{ dwellingType: 'polozemnice', position: at(30, 0) }],
    // čtverce x 4–6, y 10–12 = svět x −60 … −15, z 30 … 75
    parts: block(4, 10, 3, 3).map((cell) => ({ cell })),
  };

  it('nesmí se překrývat s obydlím', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(3, 1));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/obydlím/);
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(10, 0)).ok).toBe(true);
  });

  it('nesmí se překrývat s rozestavěným obydlím', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(33, 0));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/rozestavěným/);
  });

  it('nesmí stát v poli ani zasahovat do jeho čtverce', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(-40, 50));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/polem/);
    // půdorys x −18 … −14 zasahuje 1 m do čtverce pole (hrana pole x = −15)
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(-16, 50)).ok).toBe(false);
    // půdorys x −15 … −11 se pole jen dotýká
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(-13, 50)).ok).toBe(true);
  });

  it('díl bez políčka (stará data) nic nezabírá', () => {
    const old: PlacementVillage = { ...EMPTY, parts: [{}] };
    expect(checkDwellingPlacement(landscape, old, 'zemnice', at(-40, 50)).ok).toBe(true);
  });
});

describe('fieldPartsFromCells – díly po čtvercích', () => {
  const landscape = makeLandscape({ fertility: (x) => (x < 8 ? 40 : 80) });
  const home = [at(0, -100)];

  it('každý čtverec louky je díl o celém políčku (225 m²)', () => {
    const result = fieldPartsFromCells(landscape, null, block(8, 8, 2, 1), home);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0]).toEqual({
      areaM2: 225,
      // vzdálenost od středu políčka (7,5; 7,5) k obydlí (0; −100)
      distanceM: Math.hypot(7.5, 107.5),
      naturalFertility: 80,
      surface: 'meadow',
      obstacleCost: 0,
      cell: { x: 8, y: 8 },
    });
    expect(result.areaM2).toBe(450);
    expect(result.blockedCells).toEqual([]);
  });

  it('opakované čtverce se počítají jednou a řadí se po řádcích', () => {
    const cells: TileCell[] = [
      { x: 9, y: 9 },
      { x: 8, y: 8 },
      { x: 9, y: 8 },
      { x: 8, y: 8 },
    ];
    const result = fieldPartsFromCells(landscape, null, cells, home);
    expect(result.cells).toEqual([
      { x: 8, y: 8 },
      { x: 9, y: 8 },
      { x: 9, y: 9 },
    ]);
    expect(result.parts.map((p) => p.cell)).toEqual(result.cells);
  });

  it('pod 0,1 ha (5 čtverců) pole neprojde', () => {
    const small = fieldPartsFromCells(landscape, null, block(8, 8, 4, 1), home);
    expect(small.check.ok).toBe(false);
    expect(small.check.reason).toBe('Pole musí mít aspoň 0,1 ha, tedy 5 čtverců (teď 4).');
    const enough = fieldPartsFromCells(landscape, null, block(8, 8, 5, 1), home);
    expect(enough.check).toEqual({ ok: true, reason: null });
    expect(enough.areaM2).toBeGreaterThanOrEqual(FIELD_LIMITS.minAreaM2);
  });

  it('průměrná úrodnost je vážená plochou dílů', () => {
    const result = fieldPartsFromCells(landscape, null, block(6, 8, 3, 1), home);
    expect(result.averageFertility).toBeCloseTo((40 * 2 + 80) / 3);
  });

  it('cena je 40 člověkodní za hektar louky', () => {
    const result = fieldPartsFromCells(landscape, null, block(6, 6, 3, 2), home);
    expect(result.check.ok).toBe(true);
    expect(result.areaM2).toBe(1350);
    expect(result.foundingCost).toBeCloseTo(40 * 0.135);
  });

  it('čtverce musí sousedit stranou v jednom celku – roh nestačí', () => {
    const apart = fieldPartsFromCells(
      landscape,
      null,
      [...block(4, 4, 3, 2), ...block(9, 4, 1, 1)],
      home,
    );
    expect(apart.check.ok).toBe(false);
    expect(apart.check.reason).toMatch(/jeden celek/);
    const corner = fieldPartsFromCells(
      landscape,
      null,
      [...block(4, 4, 3, 2), { x: 7, y: 6 }],
      home,
    );
    expect(corner.check.ok).toBe(false);
    const side = fieldPartsFromCells(landscape, null, [...block(4, 4, 3, 2), { x: 7, y: 5 }], home);
    expect(side.check.ok).toBe(true);
  });

  it('pole ve tvaru L s dírou uprostřed je jeden celek', () => {
    const ring = block(4, 4, 3, 3).filter((c) => !(c.x === 5 && c.y === 5));
    expect(fieldPartsFromCells(landscape, null, ring, home).check.ok).toBe(true);
  });
});

describe('fieldPartsFromCells – co pole nesmí', () => {
  const home = [at(0, -100)];

  it('neplatné čtverce, prázdný výběr a čtverce mimo krajinu neprojdou', () => {
    const l = makeLandscape();
    const fraction = fieldPartsFromCells(l, null, [{ x: 1.5, y: 0 }], home);
    expect(fraction.check.reason).toMatch(/Neplatné/);
    expect(fraction.parts).toHaveLength(0);
    expect(fieldPartsFromCells(l, null, [], home).check.ok).toBe(false);
    const outside = fieldPartsFromCells(l, null, [...block(4, 4, 3, 2), { x: 16, y: 4 }], home);
    expect(outside.check.ok).toBe(false);
    expect(outside.check.reason).toMatch(/krajiny/);
  });

  it(`pole může mít nejvýš ${MAX_FIELD_CELLS} čtverců`, () => {
    const l = makeLandscape({ size: 64 });
    const huge = fieldPartsFromCells(l, null, block(0, 0, 64, 24), [at(0, 0)]);
    expect(huge.check.ok).toBe(false);
    expect(huge.check.reason).toBe('Pole může mít nejvýš 1 500 čtverců.');
  });

  it('pole zasahující do vody neprojde a vodní čtverce jsou zakázané', () => {
    const l = makeLandscape({ surface: (x) => (x === 9 ? 'water' : 'meadow') });
    const result = fieldPartsFromCells(l, null, block(6, 6, 4, 2), home);
    expect(result.check.ok).toBe(false);
    expect(result.check.reason).toMatch(/vod/);
    expect(result.blockedCells).toEqual([
      { x: 9, y: 6 },
      { x: 9, y: 7 },
    ]);
  });

  it('pole v lese zatím neprojde – lesní čtverce nejsou díly', () => {
    const l = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
    const result = fieldPartsFromCells(l, null, block(5, 6, 4, 2), home);
    expect(result.check.ok).toBe(false);
    expect(result.check.reason).toMatch(/jen na louce/);
    expect(result.parts.every((p) => p.cell !== undefined && p.cell.x < 8)).toBe(true);
    expect(result.areaM2).toBe(6 * 225);
    expect(result.blockedCells).toEqual([
      { x: 8, y: 6 },
      { x: 8, y: 7 },
    ]);
  });

  it('pole se nesmí překrývat s jiným polem, sousedit s ním smí', () => {
    const l = makeLandscape();
    const village: PlacementVillage = {
      ...EMPTY,
      parts: block(6, 6, 3, 2).map((cell) => ({ cell })),
    };
    const over = fieldPartsFromCells(l, village, block(8, 6, 3, 2), home);
    expect(over.check.ok).toBe(false);
    expect(over.check.reason).toMatch(/jiným polem/);
    expect(over.blockedCells).toEqual([
      { x: 8, y: 6 },
      { x: 8, y: 7 },
    ]);
    expect(fieldPartsFromCells(l, village, block(9, 6, 3, 2), home).check.ok).toBe(true);
  });

  it('pole se nesmí překrývat s obydlím ani s plánovaným obydlím', () => {
    const l = makeLandscape();
    // zemnice v počátku leží na rohu čtverců 7 a 8 v obou směrech
    const village: PlacementVillage = {
      ...EMPTY,
      dwellings: [{ type: 'zemnice', position: at(0, 0) }],
    };
    const built = fieldPartsFromCells(l, village, block(8, 8, 3, 2), home);
    expect(built.check.reason).toMatch(/obydlím/);
    expect(built.blockedCells).toEqual([{ x: 8, y: 8 }]);
    const planned = fieldPartsFromCells(l, null, block(5, 7, 3, 2), [at(0, 0)]);
    expect(planned.check.ok).toBe(false);
    expect(planned.check.reason).toMatch(/obydlím/);
    expect(fieldPartsFromCells(l, village, block(9, 8, 3, 2), home).check.ok).toBe(true);
  });

  it('pole dál než 800 m od obydlí neprojde', () => {
    const l = makeLandscape({ size: 64 }); // 960 m, čtverec 0 začíná na −480 m
    const far = fieldPartsFromCells(l, null, block(58, 58, 3, 2), [at(-400, -400)]);
    expect(far.check.ok).toBe(false);
    expect(far.check.reason).toMatch(/800 m/);
    expect(far.blockedCells).toHaveLength(6);
    const near = fieldPartsFromCells(l, null, block(12, 12, 3, 2), [at(-400, -400)]);
    expect(near.check.ok).toBe(true);
  });

  it('bez obydlí je každý díl moc daleko', () => {
    const result = fieldPartsFromCells(makeLandscape(), null, block(6, 6, 3, 2), []);
    expect(result.check.ok).toBe(false);
  });
});

describe('hřbitov brání obydlí i poli', () => {
  const landscape = makeLandscape();
  // čtverce x 4–5, y 10 = svět x −60 … −30, z 30 … 45
  const village: PlacementVillage = {
    ...EMPTY,
    cemeteries: [{ squares: block(4, 10, 2, 1).map((cell) => ({ cell })) }],
  };

  it('obydlí nesmí zasahovat do čtverce hřbitova', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(-45, 38));
    expect(check).toMatchObject({ ok: false, reason: 'Překrývá se s hřbitovem.' });
  });

  it('obydlí blíž hřbitovu než 150 m jen varuje', () => {
    // okraj hřbitova z = 30, obydlí v z = 10 → 20 m od okraje
    // ručně vyrobená krajina nemá překážky
    const noObstacles = { obstacleCost: 0, obstacleIds: [], clearedTrees: 0, obstacleCounts: {} };
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(-45, 10))).toEqual({
      ok: true,
      reason: null,
      warning: 'Blízko hřbitova (20 m)',
      ...noObstacles,
    });
    const far = makeLandscape({ size: 40 });
    const farVillage: PlacementVillage = {
      ...EMPTY,
      cemeteries: [{ squares: [{ cell: { x: 0, y: 0 } }] }],
    };
    expect(checkDwellingPlacement(far, farVillage, 'zemnice', at(0, 0))).toEqual({
      ok: true,
      reason: null,
      ...noObstacles,
    });
  });

  it('pole se nesmí překrývat s hřbitovem', () => {
    const over = fieldPartsFromCells(landscape, village, block(5, 9, 3, 2), [at(0, 0)]);
    expect(over.check.reason).toBe('Pole se překrývá s hřbitovem.');
    expect(over.blockedCells).toEqual([{ x: 5, y: 10 }]);
  });
});

describe('waterDistanceM', () => {
  it('mezi okraji políček; sousední políčko vody 0; bez vody konečné číslo', () => {
    const l = makeLandscape({ surface: (x) => (x === 10 ? 'water' : 'meadow') });
    expect(waterDistanceM(l, { x: 9, y: 3 })).toBe(0);
    expect(waterDistanceM(l, { x: 5, y: 3 })).toBe(60);
    expect(waterDistanceM(l, { x: 10, y: 3 })).toBe(0);
    const dry = waterDistanceM(makeLandscape(), { x: 5, y: 3 });
    expect(Number.isFinite(dry)).toBe(true);
    expect(dry).toBeGreaterThan(400);
  });
});

describe('cemeteryPartsFromCells', () => {
  // 32 políček = 480 m, políčko 0 začíná na −240 m; potok ve sloupci 31
  const landscape = makeLandscape({
    size: 32,
    surface: (x, y) => (x === 31 ? 'water' : x < 2 && y < 2 ? 'forest' : 'meadow'),
  });
  const home = [at(0, 0)];

  it('čtverce louky se středem ve světě, vzdáleností od vody, cenou a místem pro hroby', () => {
    const result = cemeteryPartsFromCells(landscape, null, block(4, 4, 2, 2), home);
    expect(result.check).toEqual({ ok: true, reason: null });
    expect(result.squares).toHaveLength(4);
    expect(result.squares[0]).toEqual({
      cell: { x: 4, y: 4 },
      x: -172.5,
      z: -172.5,
      waterDistanceM: 26 * 15,
      obstacleCost: 0,
    });
    expect(result.capacity).toBe(224);
    expect(result.foundingCost).toBe(40);
    expect(result.extendsCemetery).toBe(false);
    expect(result.warningCells).toEqual([]);
  });

  it('blízko obydlí jen varuje – neblokuje', () => {
    // čtverec 18 začíná na x = 30 m – okraj 30 m od obydlí v počátku
    const result = cemeteryPartsFromCells(landscape, null, block(18, 15, 1, 2), home);
    expect(result.check).toEqual({ ok: true, reason: null, warning: 'Blízko obydlí (30 m)' });
    expect(result.warningCells).toEqual(block(18, 15, 1, 2));
  });

  it('blízko vody varuje, blízko obou dva řádky', () => {
    const water = cemeteryPartsFromCells(landscape, null, block(28, 28, 1, 1), home);
    expect(water.check).toEqual({ ok: true, reason: null, warning: 'Blízko vody (30 m)' });
    const both = cemeteryPartsFromCells(landscape, null, block(28, 15, 1, 1), [at(150, 0)]);
    expect(both.check.warning).toBe('Blízko obydlí (30 m)\nBlízko vody (30 m)');
  });

  it('voda, les, obydlí, pole a jiný hřbitov blokují; zakázané čtverce do náhledu', () => {
    const village: PlacementVillage = {
      dwellings: [{ type: 'zemnice', position: at(0, 0) }],
      constructions: [],
      parts: block(20, 20, 2, 2).map((cell) => ({ cell })),
      cemeteries: [{ squares: block(10, 20, 2, 1).map((cell) => ({ cell })) }],
    };
    const check = (cells: TileCell[]): string | null =>
      cemeteryPartsFromCells(landscape, village, cells, home).check.reason;
    expect(check(block(30, 5, 2, 1))).toBe('Hřbitov nesmí zasahovat do vody.');
    expect(check(block(1, 1, 2, 1))).toMatch(/jen na louce/);
    expect(check(block(15, 15, 2, 2))).toBe('Hřbitov se překrývá s obydlím.');
    expect(check(block(19, 20, 2, 1))).toBe('Hřbitov se překrývá s polem.');
    expect(check(block(11, 20, 2, 1))).toBe('Hřbitov se překrývá s jiným hřbitovem.');
    expect(
      cemeteryPartsFromCells(landscape, village, block(19, 20, 2, 1), home).blockedCells,
    ).toEqual([{ x: 20, y: 20 }]);
    const water = cemeteryPartsFromCells(landscape, village, block(30, 5, 2, 1), home);
    expect(water.squares.map((s) => s.cell)).toEqual([{ x: 30, y: 5 }]);
  });

  it('čtverce navazující stranou na hřbitov ho rozšíří; na dva hřbitovy navázat nejde', () => {
    const village: PlacementVillage = {
      ...EMPTY,
      cemeteries: [
        { squares: block(10, 10, 2, 1).map((cell) => ({ cell })) },
        { squares: block(16, 10, 1, 1).map((cell) => ({ cell })) },
      ],
    };
    const extend = cemeteryPartsFromCells(landscape, village, block(10, 11, 2, 1), home);
    expect(extend.check.ok).toBe(true);
    expect(extend.extendsCemetery).toBe(true);
    expect(extend.capacity).toBe(112);
    // roh nestačí – jen strana
    const corner = cemeteryPartsFromCells(landscape, village, [{ x: 12, y: 11 }], home);
    expect(corner.extendsCemetery).toBe(false);
    // dva oddělené čtverce, oba navazují na hřbitov – s ním tvoří celek
    const both = cemeteryPartsFromCells(
      landscape,
      village,
      [
        { x: 9, y: 10 },
        { x: 12, y: 10 },
      ],
      home,
    );
    expect(both.check.ok).toBe(true);
    const two = cemeteryPartsFromCells(landscape, village, block(12, 10, 4, 1), home);
    expect(two.check.reason).toBe('Hřbitov smí navazovat jen na jeden hřbitov.');
    const big: PlacementVillage = {
      ...EMPTY,
      cemeteries: [{ squares: block(2, 2, 10, 10).map((cell) => ({ cell })) }],
    };
    const tooBig = cemeteryPartsFromCells(landscape, big, [{ x: 12, y: 2 }], home);
    expect(tooBig.check.reason).toBe('Hřbitov může mít nejvýš 100 čtverců.');
  });

  it('čtverce musí tvořit jeden celek; neplatné, mimo krajinu a příliš mnoho čtverců neprojdou', () => {
    const apart = cemeteryPartsFromCells(
      landscape,
      null,
      [
        { x: 4, y: 4 },
        { x: 6, y: 4 },
      ],
      home,
    );
    expect(apart.check.reason).toBe('Čtverce hřbitova musí tvořit jeden celek – sousedit stranou.');
    expect(cemeteryPartsFromCells(landscape, null, [{ x: 1.5, y: 2 }], home).check.reason).toBe(
      'Neplatné čtverce hřbitova.',
    );
    expect(cemeteryPartsFromCells(landscape, null, [{ x: 40, y: 2 }], home).check.reason).toBe(
      'Hřbitov musí ležet uvnitř krajiny sídla.',
    );
    expect(cemeteryPartsFromCells(landscape, null, [], home).check.reason).toBe(
      'Vyber aspoň jeden čtverec hřbitova.',
    );
    const huge = cemeteryPartsFromCells(landscape, null, block(2, 2, 11, 10), home);
    expect(MAX_CEMETERY_CELLS).toBe(100);
    expect(huge.check.reason).toBe('Hřbitov může mít nejvýš 100 čtverců.');
  });
});

describe('villageDwellingPositions', () => {
  it('vrátí polohy obydlí i rozestavěných obydlí', () => {
    const village: PlacementVillage = {
      dwellings: [{ type: 'zemnice', position: at(1, 2) }],
      constructions: [
        { dwellingType: 'polozemnice', position: at(3, 4) },
        { dwellingType: null, position: null },
      ],
      parts: [],
    };
    expect(villageDwellingPositions(village)).toEqual([at(1, 2), at(3, 4)]);
    expect(villageDwellingPositions(null)).toEqual([]);
  });
});

describe('umístění na vygenerované krajině', () => {
  // Krajiny jednou – kontroly umístění si k nim vygenerují vrstvu překážek (stovky ms na krajinu).
  const landscapes = new Map<number, ReturnType<typeof generateLandscape>>();
  const landscapeOf = (seed: number): ReturnType<typeof generateLandscape> => {
    const cached = landscapes.get(seed);
    if (cached) return cached;
    const l = generateLandscape(seed);
    landscapes.set(seed, l);
    return l;
  };
  // U místa vsi najde první políčko, kde zemnice uprostřed projde, a pole 3 × 2 čtverce vedle ní.
  const findSpot = (seed: number): { dwelling: Position; field: TileCell[] } | null => {
    const l = landscapeOf(seed);
    const { x: sx, y: sy } = l.villageSite;
    for (let r = 0; r < 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = sx + dx;
          const ty = sy + dy;
          if (surfaceAt(l, tx, ty) !== 'meadow') continue;
          const c = tileCenterWorld(l, tx, ty);
          const dwelling = at(c.x, c.z);
          if (!checkDwellingPlacement(l, null, 'zemnice', dwelling).ok) continue;
          const field = block(tx + 1, ty - 1, 3, 2);
          if (fieldPartsFromCells(l, null, field, [dwelling]).check.ok) return { dwelling, field };
        }
      }
    }
    return null;
  };

  it('u místa vsi jde postavit zemnici a založit pole (5 krajin)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(findSpot(seed), `seed ${seed}`).not.toBeNull();
    }
  }, 30_000);

  it('díly pole na vygenerované krajině nesou úrodnost svého políčka', () => {
    const l = landscapeOf(3);
    const spot = findSpot(3);
    expect(spot).not.toBeNull();
    const result = fieldPartsFromCells(l, null, spot!.field, [spot!.dwelling]);
    for (const part of result.parts) {
      expect(part.naturalFertility).toBe(l.fertility[part.cell!.y * l.size + part.cell!.x]);
    }
    expect(result.parts.reduce((s, p) => s + p.areaM2, 0)).toBeCloseTo(result.areaM2);
  });
});
