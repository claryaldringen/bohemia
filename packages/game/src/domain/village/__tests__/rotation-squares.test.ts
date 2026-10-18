import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundCemetery, foundField, foundPen, foundVillage } from '../actions';
import { cemeteryDwellingDistance, cemeteryHygiene, distanceToSquare } from '../cemetery';
import { neighbourSnapshot } from '../neighbourhood';
import { pathVillageOf } from '../paths/village';
import {
  cellCorners,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPenPlacement,
  fieldPartsFromCells,
  squareWaterDistanceM,
  waterDistanceM,
} from '../placement';
import { advanceVillage } from '../simulate';
import { ROTATION_STEP, rotationCosSin, squareCenter, squareCorners } from '../square-grid';
import { villageLandSquares } from '../squares';
import type { SquareGrid, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Natočený hřbitov a ohrada (fields.md – Natočené stavby; Martin: „všechny plošné stavby by měly
// jít natáčet, výslovně i hřbitovy“). Ruční krajina 16 × 16 políček po 15 m se středem
// v počátku: políčko (8, 8) = svět 0–15 m, střed (7,5; 7,5). Sloupec políček x = 13 (svět 75 až
// 90 m) je voda.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const CELL = 225;
const EMPTY = packObstacles([], 16, 15);
/** Mřížky s čtvercem (0, 0) ve středu políčka (8, 8). */
const G30: SquareGrid = { x: 7.5, z: 7.5, rotation: 2 * ROTATION_STEP };
const G45: SquareGrid = { x: 7.5, z: 7.5, rotation: 3 * ROTATION_STEP };
const FAR = [{ x: -90, z: -90, rotation: 0 }];
const landscape = makeLandscape({ surface: (x) => (x === 13 ? 'water' : 'meadow') });

/** Ves se zemnicí daleko vlevo dole a dřevem na ohrady. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR[0]! }));
  s.woodLogs = 40;
  return s;
}

describe('natočený hřbitov – kontrola a vzdálenosti', () => {
  it('čtverce v mřížce hřbitova: středy z mřížky, vzdálenost od vody od natočeného čtverce', () => {
    const preview = cemeteryPartsFromCells(landscape, null, block(0, 0, 2, 1), FAR, EMPTY, G30);
    expect(preview.check.ok).toBe(true);
    expect(preview.grid).toEqual(G30);
    expect(preview.capacity).toBe(112);
    for (const square of preview.squares) {
      expect({ x: square.x, z: square.z }).toEqual(squareCenter(landscape, G30, square.cell));
      expect(square.waterDistanceM).toBe(
        squareWaterDistanceM(landscape, squareCorners(landscape, G30, square.cell)),
      );
    }
    // mřížka mimo 15–75° neplatí
    const bad = cemeteryPartsFromCells(landscape, null, block(0, 0, 1, 1), FAR, EMPTY, {
      ...G30,
      rotation: 0.1,
    });
    expect(bad.check.ok).toBe(false);
  });

  it('vzdálenost od vody: políčko jako dřív, natočený čtverec rohem blíž', () => {
    for (const cell of [
      { x: 8, y: 8 },
      { x: 11, y: 3 },
      { x: 2, y: 14 },
    ]) {
      expect(squareWaterDistanceM(landscape, cellCorners(landscape, cell))).toBeCloseTo(
        waterDistanceM(landscape, cell),
        9,
      );
    }
    // čtverec 45° ve středu políčka (11, 8): roh sahá o 7,5 · √2 m – k vodě (x = 75) zbývá míň
    // než 15 m políčka
    const turned = squareCorners(
      landscape,
      { x: 52.5, z: 7.5, rotation: G45.rotation },
      {
        x: 0,
        y: 0,
      },
    );
    expect(waterDistanceM(landscape, { x: 11, y: 8 })).toBe(15);
    expect(squareWaterDistanceM(landscape, turned)).toBeCloseTo(75 - 52.5 - 7.5 * Math.SQRT2, 9);
  });

  it('vzdálenost obydlí od natočeného čtverce se měří v jeho osách (hygiena a pořadí pohřbu)', () => {
    const square = { x: 0, z: 0 };
    // čtverec 45°: roh míří podél osy x světa – bod (12, 0) je od rohu 12 − 7,5 · √2
    expect(distanceToSquare(12, 0, square, 15)).toBe(4.5);
    expect(distanceToSquare(12, 0, square, 15, G45.rotation)).toBeCloseTo(12 - 7.5 * Math.SQRT2, 9);
    const dwellings = [{ x: 12, z: 0, rotation: 0 }];
    expect(cemeteryDwellingDistance([square], 15, dwellings, G45)).toBeCloseTo(
      12 - 7.5 * Math.SQRT2,
      9,
    );
    const cemetery = {
      squares: [{ cell: { x: 0, y: 0 }, x: 0, z: 0, waterDistanceM: 500 }],
      squareSizeM: 15,
    };
    const far = [{ x: 140, z: 0, rotation: 0 }];
    // v osách krajiny 132,5 m, natočený 140 − 10,6 m – hygiena horší
    expect(cemeteryHygiene({ ...cemetery, grid: { ...G45, x: 0, z: 0 } }, far)).toBeLessThan(
      cemeteryHygiene(cemetery, far),
    );
  });
});

describe('natočený hřbitov – založení, rozšíření a pole jako krajina', () => {
  it('foundCemetery uloží mřížku, rozšíření jen ve stejné mřížce', () => {
    let s = village();
    const first = cemeteryPartsFromCells(landscape, s, [{ x: 0, y: 0 }], FAR, EMPTY, G30);
    s = foundCemetery(s, s.lastDay, { squares: first.squares, grid: G30, squareSizeM: 15 });
    expect(s.cemeteries![0]!.grid).toEqual(G30);
    const more = cemeteryPartsFromCells(landscape, s, [{ x: 1, y: 0 }], FAR, EMPTY, G30);
    expect(more.check.ok).toBe(true);
    expect(more.extendsCemetery).toBe(true);
    s = foundCemetery(s, s.lastDay, { squares: more.squares, grid: G30, squareSizeM: 15 });
    expect(s.cemeteries).toHaveLength(1);
    expect(s.cemeteries![0]!.squares).toHaveLength(2);
    expect(s.cemeteries![0]!.squares[1]!.constructionId).toBeDefined();
    // týž čtverec znovu nejde, čtverec v jiné mřížce stranou nenavazuje – nový hřbitov
    expect(() =>
      foundCemetery(s, s.lastDay, { squares: more.squares, grid: G30, squareSizeM: 15 }),
    ).toThrow(/patří hřbitovu/);
    const away: SquareGrid = { x: -67.5, z: 52.5, rotation: G45.rotation };
    const other = cemeteryPartsFromCells(landscape, s, [{ x: 1, y: 0 }], FAR, EMPTY, away);
    expect(other.extendsCemetery).toBe(false);
    s = foundCemetery(s, s.lastDay, { squares: other.squares, grid: away, squareSizeM: 15 });
    expect(s.cemeteries).toHaveLength(2);
  });

  it('natočený hřbitov se s jiným hřbitovem nepřekrývá (mnohoúhelníky, ne políčka)', () => {
    let s = village();
    const aligned = cemeteryPartsFromCells(landscape, s, [{ x: 8, y: 8 }], FAR, EMPTY);
    s = foundCemetery(s, s.lastDay, { squares: aligned.squares, squareSizeM: 15 });
    // čtverec 45° ve středu sousedního políčka zasahuje rohem do políčka hřbitova
    const beside = cemeteryPartsFromCells(landscape, s, [{ x: 0, y: 0 }], FAR, EMPTY, {
      ...G45,
      x: 22.5,
    });
    expect(beside.check.reason).toBe('Hřbitov se překrývá s jiným hřbitovem.');
  });

  it('natočený hřbitov na poli v mřížce krajiny mu sebere jen průnik', () => {
    const start = village();
    const field = fieldPartsFromCells(landscape, start, block(7, 7, 3, 3), FAR, EMPTY);
    const s = foundField(start, start.lastDay, { parts: field.parts });
    const cemetery = cemeteryPartsFromCells(landscape, s, [{ x: 0, y: 0 }], FAR, EMPTY, G45);
    expect(cemetery.check.ok).toBe(true);
    const middle = cemetery.takenLand.find((t) => t.cell.x === 8 && t.cell.y === 8)!;
    expect(middle.grid).toBeUndefined();
    // čtverec 45° ve středu políčka mu nechá čtyři rohy (trojúhelníky s odvěsnou 15 − 7,5 · √2)
    const corner = 15 - 7.5 * Math.SQRT2;
    expect(middle.areaM2).toBeCloseTo(CELL - 2 * corner * corner, 6);
    expect(cemetery.takenLand.length).toBeGreaterThan(1);
  });

  it('obydlí blízko natočeného hřbitova varuje, natočený čtverec zabírá i mimo své políčko', () => {
    let s = village();
    const preview = cemeteryPartsFromCells(landscape, s, [{ x: 0, y: 0 }], FAR, EMPTY, G45);
    s = foundCemetery(s, s.lastDay, {
      squares: preview.squares,
      grid: G45,
      squareSizeM: 15,
    });
    const squares = villageLandSquares(landscape, s, ['cemetery']);
    expect(squares[0]!.tile).toBeNull();
    // roh čtverce 45° sahá do políčka (9, 8) – zemnice tam stát nesmí
    const [c, sn] = rotationCosSin(G45.rotation);
    const corner = { x: 7.5 + 9 * c, z: 7.5 - 9 * sn };
    expect(corner.x).toBeGreaterThan(13);
    const onCorner = checkDwellingPlacement(landscape, s, 'zemnice', { ...corner, rotation: 0 });
    expect(onCorner.reason).toBe('Překrývá se s hřbitovem.');
    const near = checkDwellingPlacement(landscape, s, 'zemnice', { x: 40, z: 40, rotation: 0 });
    expect(near.ok).toBe(true);
    expect(near.warning).toContain('Blízko hřbitova');
  });
});

describe('natočená ohrada', () => {
  it('čtverec natočené mřížky: střed z mřížky, ohrada v osách krajiny jako dřív', () => {
    const turned = checkPenPlacement(landscape, null, { x: 0, y: 0 }, EMPTY, G30);
    expect(turned.ok).toBe(true);
    expect({ x: turned.x, z: turned.z }).toEqual({ x: 7.5, z: 7.5 });
    const aligned = checkPenPlacement(landscape, null, { x: 8, y: 8 }, EMPTY);
    expect(aligned.ok).toBe(true);
    expect({ x: aligned.x, z: aligned.z }).toEqual({ x: 7.5, z: 7.5 });
  });

  it('natočená ohrada nesmí rohem do vody ani ven z krajiny', () => {
    const water = checkPenPlacement(landscape, null, { x: 0, y: 0 }, EMPTY, {
      ...G45,
      x: 67.5,
    });
    expect(water.reason).toBe('Ohrada nemůže stát ve vodě.');
    const outside = checkPenPlacement(landscape, null, { x: 0, y: 0 }, EMPTY, {
      ...G45,
      x: -112.5,
    });
    expect(outside.reason).toBe('Ohrada musí ležet uvnitř krajiny sídla.');
  });

  it('skalní výchoz v natočeném čtverci ohradu nedovolí', () => {
    const outcrop: ObstaclePlacement = {
      id: 7,
      kind: 'outcrop',
      look: 'rock-boulder',
      // malý výchoz v natočeném čtverci, ale mimo políčko (8, 8)
      x: 7.5 + 9,
      z: 7.5,
      rotation: 0,
      scale: 0.3,
    };
    const layer = packObstacles([outcrop], 16, 15);
    const check = checkPenPlacement(landscape, null, { x: 0, y: 0 }, layer, G45);
    expect(check.reason).toBe('Stojí tu skalní výchoz – ten osadníci neodstraní.');
    expect(checkPenPlacement(landscape, null, { x: 8, y: 8 }, layer).ok).toBe(true);
  });

  it('foundPen uloží mřížku; jiná ohrada přes natočenou nejde, pole jí dá jen průnik', () => {
    const start = village();
    const field = fieldPartsFromCells(landscape, start, block(9, 7, 2, 3), FAR, EMPTY);
    let s = foundField(start, start.lastDay, { parts: field.parts });
    const check = checkPenPlacement(landscape, s, { x: 0, y: 0 }, EMPTY, G45);
    expect(check.ok).toBe(true);
    // roh čtverce 45° zasahuje do políček pole (9, 7–9) – jen kusy
    expect(check.takenLand.length).toBeGreaterThan(0);
    for (const t of check.takenLand) expect(t.areaM2).toBeLessThan(CELL / 4);
    s = foundPen(
      s,
      s.lastDay,
      {
        cell: { x: 0, y: 0 },
        grid: G45,
        x: check.x,
        z: check.z,
        obstacleCost: check.obstacleCost,
        obstacleIds: check.obstacleIds,
        clearedTrees: check.clearedTrees,
        takenLand: check.takenLand,
      },
      null,
    );
    expect(s.pens![0]!.grid).toEqual(G45);
    expect(checkPenPlacement(landscape, s, { x: 8, y: 7 }, EMPTY).reason).toBe(
      'Překrývá se s ohradou.',
    );
    expect(() =>
      foundPen(
        s,
        s.lastDay,
        {
          cell: { x: 0, y: 0 },
          grid: G45,
          x: check.x,
          z: check.z,
          obstacleCost: 0,
          obstacleIds: [],
          clearedTrees: 0,
        },
        null,
      ),
    ).toThrow(/ohrada stojí/);
  });
});

describe('natočený hřbitov a ohrada v simulaci, pěšinách a u sousedů', () => {
  /** Ves s natočeným hřbitovem (60°, 2 čtverce) a natočenou ohradou (15°). */
  function turnedVillage(): VillageState {
    let s = village();
    const grid: SquareGrid = { x: -52.5, z: 52.5, rotation: 4 * ROTATION_STEP };
    const preview = cemeteryPartsFromCells(landscape, s, block(0, 0, 2, 1), FAR, EMPTY, grid);
    s = foundCemetery(s, s.lastDay, { squares: preview.squares, grid, squareSizeM: 15 });
    const penGrid: SquareGrid = { x: -22.5, z: -52.5, rotation: ROTATION_STEP };
    const pen = checkPenPlacement(landscape, s, { x: 0, y: 0 }, EMPTY, penGrid);
    expect(pen.ok).toBe(true);
    return foundPen(
      s,
      s.lastDay,
      {
        cell: { x: 0, y: 0 },
        grid: penGrid,
        x: pen.x,
        z: pen.z,
        obstacleCost: pen.obstacleCost,
        obstacleIds: pen.obstacleIds,
        clearedTrees: pen.clearedTrees,
      },
      EMPTY,
    );
  }

  it('pěšiny dostanou natočené čtverce hřbitova a ohrady, přehled sousedů je nese s mřížkou', () => {
    const s = turnedVillage();
    const paths = pathVillageOf(s, s.lastDay, landscape);
    for (const square of paths.cemeteries![0]!.squares) {
      expect(square.rotation).toBe(4 * ROTATION_STEP);
    }
    expect(paths.pens![0]!.rotation).toBe(ROTATION_STEP);
    const snapshot = neighbourSnapshot([s], s.lastDay)!;
    expect(snapshot.squares).toHaveLength(3);
    expect(snapshot.squares!.every((q) => q.grid.rotation > 0)).toBe(true);
  });

  it('ves s natočeným hřbitovem a ohradou se dopočítá po kouscích stejně jako vcelku', () => {
    const s = turnedVillage();
    const end = s.lastDay + 400;
    const whole = advanceVillage(s, end, EMPTY, landscape);
    let parts = s;
    for (const step of [1, 60, 250, 400]) {
      parts = advanceVillage(parts, Math.min(end, s.lastDay + step), EMPTY, landscape);
    }
    expect(parts).toEqual(whole);
    // hřbitov a ohrada se dostavěly a mřížky zůstaly
    expect(whole.cemeteries![0]!.builtDay).not.toBeNull();
    expect(whole.cemeteries![0]!.grid).toEqual(s.cemeteries![0]!.grid);
    expect(whole.pens![0]!.grid).toEqual(s.pens![0]!.grid);
  });
});
