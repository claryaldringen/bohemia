import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, tileCenterWorld } from '../../../landscape';
import { foundField, foundOrchard, foundVillage, startNewDwelling } from '../../core/actions';
import { fieldHoldings } from '../holdings';
import { landLeftM2 } from '../../buildings/land-taken';
import {
  canonicalPlot,
  cellCorners,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPlotPlacement,
  fieldPartsFromCells,
  orchardPartsFromCells,
  plotHousePosition,
  rotatedPlot,
  type PlacementVillage,
} from '../../placement/placement';
import { plotShapes } from '../../placement/plot-cells';
import { PLOT_HOUSE_OFFSET_M } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import {
  ROTATION_STEP,
  gridCellAt,
  normalizeGrid,
  rotationCosSin,
  rotationTurn,
  sameGrid,
  squareCenter,
  squareCorners,
} from '../../placement/square-grid';
import { withMergedFields } from '../fields';
import type { SquareGrid, TileCell, VillageState } from '../../types';
import { woodTreeSpots } from '../../forest/woods';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Natáčení staveb po 15° (Martin 18. 10. 2026 – „Je to 3D, takže všechny stavby by měly jít
// natáčet po 15 stupních“; fields.md – Natočené stavby). Ruční krajina 16 × 16 políček po 15 m se
// středem v počátku: políčko (8, 8) = svět 0–15 m, střed (7,5; 7,5).

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const CELL = 225;
const EMPTY = packObstacles([], 16, 15);
/** Mřížka natočená o 30° s čtvercem (0, 0) ve středu políčka (8, 8). */
const G30: SquareGrid = { x: 7.5, z: 7.5, rotation: 2 * ROTATION_STEP };
const G45: SquareGrid = { x: 7.5, z: 7.5, rotation: 3 * ROTATION_STEP };
const FAR = [{ x: -90, z: -90, rotation: 0 }];

describe('mřížka čtverců – natočení po 15°', () => {
  const landscape = makeLandscape();

  it('natočení je násobek 15° – kosiny a siny přesně z odmocnin', () => {
    expect(rotationTurn(5 * ROTATION_STEP)).toBe(5);
    expect(rotationTurn(-ROTATION_STEP)).toBe(23);
    expect(rotationTurn(0.1)).toBeNull();
    expect(rotationCosSin(6 * ROTATION_STEP)).toEqual([0, 1]);
    expect(rotationCosSin(12 * ROTATION_STEP)).toEqual([-1, 0]);
    const [c, s] = rotationCosSin(2 * ROTATION_STEP);
    expect(c).toBe(Math.sqrt(3) / 2);
    expect(s).toBe(0.5);
  });

  it('bez mřížky je čtverec políčko krajiny bit po bitu', () => {
    for (const cell of [
      { x: 0, y: 0 },
      { x: 8, y: 8 },
      { x: 15, y: 3 },
    ]) {
      expect(squareCenter(landscape, undefined, cell)).toEqual(
        tileCenterWorld(landscape, cell.x, cell.y),
      );
      expect(squareCorners(landscape, undefined, cell)).toEqual(cellCorners(landscape, cell));
    }
  });

  it('sousední čtverce natočené mřížky sdílejí rohy bit po bitu a bod najde svůj čtverec', () => {
    const a = squareCorners(landscape, G30, { x: 0, y: 0 });
    const right = squareCorners(landscape, G30, { x: 1, y: 0 });
    const up = squareCorners(landscape, G30, { x: 0, y: 1 });
    expect(right[0]).toEqual(a[1]);
    expect(right[3]).toEqual(a[2]);
    expect(up[0]).toEqual(a[3]);
    expect(up[1]).toEqual(a[2]);
    for (const cell of [
      { x: 0, y: 0 },
      { x: 2, y: -1 },
      { x: -3, y: 4 },
    ]) {
      const center = squareCenter(landscape, G30, cell);
      expect(gridCellAt(landscape, G30, center.x + 3, center.z - 4)).toEqual(cell);
    }
  });

  it('platná mřížka stavby je natočená o 15–75°, mřížka krajiny se nezapisuje', () => {
    expect(normalizeGrid(G30)).toEqual(G30);
    expect(normalizeGrid({ x: 0, z: 0, rotation: 0 })).toBeNull();
    expect(normalizeGrid({ x: 0, z: 0, rotation: 6 * ROTATION_STEP })).toBeNull();
    expect(normalizeGrid({ x: 0, z: 0, rotation: 0.2 })).toBeNull();
    expect(sameGrid(G30, { ...G30 })).toBe(true);
    expect(sameGrid(G30, G45)).toBe(false);
    expect(sameGrid(undefined, undefined)).toBe(true);
  });
});

describe('natočený pozemek polozemnice (varianta a)', () => {
  const landscape = makeLandscape();

  it('pozemek bez natočení ve středu políčka je políčko, jinak natočený čtverec na cm', () => {
    expect(rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: 0 }, 'center')).toEqual({
      cell: { x: 8, y: 8 },
      variant: 'center',
    });
    expect(rotatedPlot(landscape, { x: 7.504, z: 9.2, rotation: G30.rotation }, 'center')).toEqual({
      cell: { x: 8, y: 8 },
      variant: 'center',
      square: { x: 7.5, z: 9.2, rotation: G30.rotation },
    });
    expect(rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: 0.3 }, 'center')).toBeNull();
    expect(
      canonicalPlot(landscape, {
        cell: { x: 0, y: 0 },
        variant: 'center',
        square: { x: 7.5, z: 7.5, rotation: G30.rotation },
      }),
    ).toMatchObject({ cell: { x: 8, y: 8 } });
  });

  it('pozemek bez natočení se středem mimo střed políčka projde kontrolou serveru (D96)', () => {
    // 18. 11. 2026 – D96: pozemek má střed kdekoli pod kurzorem i bez natočení (Martin: „dokud
    // ho nepootočím, skáče po jednotlivých mapových čtvercích“); dřív se přichytil na políčko
    const plot = rotatedPlot(landscape, { x: 11.234, z: 4.5, rotation: 0 }, 'back-left')!;
    expect(plot).toEqual({
      cell: { x: 8, y: 8 },
      variant: 'back-left',
      square: { x: 11.23, z: 4.5, rotation: 0 },
    });
    expect(canonicalPlot(landscape, plot)).toEqual(plot);
    expect(checkPlotPlacement(landscape, null, 'polozemnice', plot, EMPTY).ok).toBe(true);
    // dům v rohu v osách krajiny, vchodem k brance jako na políčku
    const house = plotHousePosition(landscape, plot);
    const offset = PLOT_HOUSE_OFFSET_M['back-left'];
    expect(house.x).toBeCloseTo(11.23 + offset.x, 9);
    expect(house.z).toBeCloseTo(4.5 + offset.z, 9);
    expect(house.rotation).toBeCloseTo(Math.PI, 9);
    // čtverec není políčko: zabírá čtyři políčka zčásti (mnohoúhelník, ne políčko)
    expect(plotShapes(landscape, plot)).toHaveLength(1);
    expect(plotShapes(landscape, plot)[0]!.tile).toBeNull();
    // na poli vezme dílům jen průnik (dohromady celý čtverec), po 90° taky
    const village: PlacementVillage = {
      dwellings: [],
      constructions: [],
      fields: [{ id: 7 }],
      parts: block(7, 7, 3, 3).map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
    };
    for (const rotation of [0, Math.PI / 2]) {
      const square = rotatedPlot(landscape, { x: 11.23, z: 4.5, rotation }, 'center')!;
      const check = checkPlotPlacement(landscape, village, 'polozemnice', square, EMPTY);
      expect(check.ok).toBe(true);
      expect(check.takenLand.length).toBe(4);
      expect(check.takenLand.reduce((sum, t) => sum + t.areaM2, 0)).toBeCloseTo(CELL, 6);
    }
  });

  it('dům stojí v rohu natočeného pozemku vchodem k brance', () => {
    const plot = rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: G30.rotation }, 'back-left')!;
    const house = plotHousePosition(landscape, plot);
    const offset = PLOT_HOUSE_OFFSET_M['back-left'];
    const [c, s] = rotationCosSin(G30.rotation);
    expect(house.x).toBeCloseTo(7.5 + offset.x * c + offset.z * s, 9);
    expect(house.z).toBeCloseTo(7.5 - offset.x * s + offset.z * c, 9);
    expect(house.rotation).toBeCloseTo(Math.PI + G30.rotation, 9);
    // o 90° ve středu políčka je čtverec zase políčko (jen dům míří jinam)
    const turned = rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: Math.PI / 2 }, 'center')!;
    expect(plotShapes(landscape, turned)).toEqual([
      { corners: cellCorners(landscape, { x: 8, y: 8 }), tile: 8 * 16 + 8 },
    ]);
  });

  it('natočený pozemek projde na louce; vodu a les pod ním hlídá vzorkování', () => {
    const plot = rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: G30.rotation }, 'center')!;
    expect(checkPlotPlacement(landscape, null, 'polozemnice', plot, EMPTY).ok).toBe(true);
    const wet = makeLandscape({ surface: (x, y) => (x === 9 && y === 8 ? 'water' : 'meadow') });
    expect(checkPlotPlacement(wet, null, 'polozemnice', plot, EMPTY).reason).toBe(
      'Pozemek nemůže ležet ve vodě.',
    );
    // políčko bez natočení do sousední vody nezasahuje
    expect(
      checkPlotPlacement(
        wet,
        null,
        'polozemnice',
        { cell: { x: 8, y: 8 }, variant: 'center' },
        EMPTY,
      ).ok,
    ).toBe(true);
  });

  it('natočený pozemek se nepřekrývá s pozemkem souseda (mnohoúhelníky, ne políčka)', () => {
    const village: PlacementVillage = {
      dwellings: [
        {
          type: 'polozemnice',
          position: { x: 22.5, z: 7.5, rotation: Math.PI },
          plot: { cell: { x: 9, y: 8 }, variant: 'center' },
        },
      ],
      constructions: [],
      parts: [],
    };
    const turned = rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: G30.rotation }, 'center')!;
    expect(checkPlotPlacement(landscape, village, 'polozemnice', turned, EMPTY).reason).toBe(
      'Překrývá se s jiným obydlím.',
    );
    const square = { cell: { x: 8, y: 8 }, variant: 'center' as const };
    expect(checkPlotPlacement(landscape, village, 'polozemnice', square, EMPTY).ok).toBe(true);
  });

  it('natočený pozemek na poli sebere dílům průnik (dohromady celý čtverec)', () => {
    const village: PlacementVillage = {
      dwellings: [],
      constructions: [],
      fields: [{ id: 7 }],
      parts: block(7, 7, 3, 3).map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
    };
    const plot = rotatedPlot(landscape, { x: 7.5, z: 7.5, rotation: G30.rotation }, 'center')!;
    const check = checkPlotPlacement(landscape, village, 'polozemnice', plot, EMPTY);
    expect(check.ok).toBe(true);
    expect(check.warning).toBe('Pole se zmenší');
    expect(check.takenLand.length).toBeGreaterThan(1);
    expect(check.takenLand.reduce((sum, t) => sum + t.areaM2, 0)).toBeCloseTo(CELL, 6);
    expect(check.takenLand.find((t) => t.cell.x === 8 && t.cell.y === 8)!.areaM2).toBeLessThan(
      CELL,
    );
  });
});

describe('natočené pole a sad – vlastní mřížka', () => {
  it('úrodnost čtverce = průměr políček pod body vzorkování', () => {
    const landscape = makeLandscape({ fertility: (x, y) => (x === 9 && y === 8 ? 100 : 0) });
    const aligned = fieldPartsFromCells(landscape, null, block(4, 8, 5, 1), FAR, EMPTY);
    expect(aligned.parts.at(-1)!.naturalFertility).toBe(0);
    const turned = fieldPartsFromCells(landscape, null, block(0, 0, 5, 1), FAR, EMPTY, G30);
    expect(turned.check.ok).toBe(true);
    expect(turned.grid).toEqual(G30);
    const first = turned.parts[0]!;
    expect(first.naturalFertility).toBeGreaterThan(0);
    expect(first.naturalFertility).toBeLessThan(100);
  });

  it('natočené pole se s polem v mřížce krajiny nesmí překrývat', () => {
    const landscape = makeLandscape();
    const village: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [{ cell: { x: 9, y: 8 }, fieldId: 3, areaM2: CELL }],
    };
    expect(
      fieldPartsFromCells(landscape, village, block(0, 0, 5, 1), FAR, EMPTY, G30).check.reason,
    ).toBe('Pole se překrývá s jiným polem.');
  });

  it('pole navazuje jen ve stejné mřížce', () => {
    const landscape = makeLandscape();
    const village: PlacementVillage = {
      dwellings: [],
      constructions: [],
      fields: [{ id: 7, grid: G30 }],
      parts: block(0, 0, 5, 1).map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
    };
    const same = fieldPartsFromCells(landscape, village, block(0, 1, 2, 1), FAR, EMPTY, G30);
    expect(same.joinedFields).toEqual([7]);
    expect(same.check.ok).toBe(true);
    const other = fieldPartsFromCells(landscape, village, block(0, -3, 5, 1), FAR, EMPTY, {
      ...G45,
      x: -60,
      z: -60,
    });
    expect(other.joinedFields).toEqual([]);
  });

  it('foundField uloží mřížku a rozšíření zůstane v ní; jiná mřížka = nové pole', () => {
    const landscape = makeLandscape();
    const start = foundVillage({ seed: 4, day: DAY, dwellingPosition: FAR[0]! });
    const first = fieldPartsFromCells(landscape, start, block(0, 0, 5, 1), FAR, EMPTY, G30);
    const one = foundField(start, start.lastDay, { parts: first.parts, grid: first.grid! });
    const field = one.fields.at(-1)!;
    expect(field.grid).toEqual(G30);
    const more = fieldPartsFromCells(landscape, one, block(0, 1, 5, 1), FAR, EMPTY, G30);
    expect(more.joinedFields).toEqual([field.id]);
    const two = foundField(one, one.lastDay, { parts: more.parts, grid: G30 });
    expect(two.fields).toHaveLength(1);
    expect(two.parts.filter((p) => p.fieldId === field.id)).toHaveLength(10);
    const away: SquareGrid = { x: -82.5, z: 37.5, rotation: G45.rotation };
    const third = fieldPartsFromCells(landscape, two, block(0, 0, 5, 1), FAR, EMPTY, away);
    expect(third.check.reason).toBeNull();
    const three = foundField(two, two.lastDay, { parts: third.parts, grid: away });
    expect(three.fields).toHaveLength(2);
  });

  it('sad v mřížce krajiny přes natočené pole sebere dílům jen průnik', () => {
    const landscape = makeLandscape();
    const start = foundVillage({ seed: 4, day: DAY, dwellingPosition: FAR[0]! });
    const preview = fieldPartsFromCells(landscape, start, block(0, 0, 5, 1), FAR, EMPTY, G30);
    const withField = foundField(start, start.lastDay, { parts: preview.parts, grid: G30 });
    const orchard = orchardPartsFromCells(landscape, withField, [{ x: 8, y: 8 }], FAR, EMPTY);
    expect(orchard.check.ok).toBe(true);
    expect(orchard.check.warning).toBe('Pole se zmenší');
    expect(orchard.takenLand.length).toBeGreaterThan(0);
    for (const t of orchard.takenLand) {
      expect(t.grid).toEqual(G30);
      expect(t.areaM2).toBeLessThan(CELL);
    }
    const next = foundOrchard(withField, withField.lastDay, {
      squares: orchard.squares,
      takenLand: orchard.takenLand,
    });
    // díl se zmenší o průnik, pod 20 % čtverce zmizí celý (landLeftM2)
    const expected = withField.parts.reduce((sum, p) => {
      const t = orchard.takenLand.find((q) => q.cell.x === p.cell!.x && q.cell.y === p.cell!.y);
      return sum + (t ? landLeftM2(p.areaM2, t.areaM2, t.cellAreaM2) : p.areaM2);
    }, 0);
    expect(next.parts.reduce((sum, p) => sum + p.areaM2, 0)).toBeCloseTo(expected, 6);
    expect(next.parts.length).toBeLessThanOrEqual(withField.parts.length);
  });

  it('natočený sad uloží mřížku', () => {
    const landscape = makeLandscape();
    const start = foundVillage({ seed: 4, day: DAY, dwellingPosition: FAR[0]! });
    const preview = orchardPartsFromCells(landscape, start, block(0, 0, 2, 2), FAR, EMPTY, G45);
    expect(preview.check.ok).toBe(true);
    const next = foundOrchard(start, start.lastDay, {
      squares: preview.squares,
      grid: preview.grid!,
    });
    expect(next.orchards!.at(-1)!.grid).toEqual(G45);
  });
});

describe('pole jako krajina napříč mřížkami', () => {
  const landscape = makeLandscape();
  /** Ves s natočeným polem 5 × 2 čtverce v mřížce G30. */
  function withTurnedField(): VillageState {
    const start = foundVillage({ seed: 4, day: DAY, dwellingPosition: FAR[0]! });
    const preview = fieldPartsFromCells(landscape, start, block(0, 0, 5, 2), FAR, EMPTY, G30);
    return foundField(start, start.lastDay, { parts: preview.parts, grid: G30 });
  }

  it('zemnice na natočeném poli mu vezme průnik vyklízené plochy (kus s mřížkou pole)', () => {
    const s = withBuiltFirstDwelling(withTurnedField());
    const man = s.nextId++;
    const woman = s.nextId++;
    s.people.push(
      { id: man, bornDay: DAY - 9000, dwellingId: 1, sex: 'male', spouseId: woman },
      { id: woman, bornDay: DAY - 9000, dwellingId: 1, sex: 'female', spouseId: man },
    );
    s.woodLogs = 60;
    const [c, sn] = rotationCosSin(G30.rotation);
    // střed domu na čtverci (2, 0) natočeného pole
    const at = { x: 7.5 + 30 * c, z: 7.5 - 30 * sn, rotation: 0 };
    const check = checkDwellingPlacement(landscape, s, 'zemnice', at, EMPTY);
    expect(check.ok).toBe(true);
    expect(check.warning).toContain('Pole se zmenší');
    expect(check.takenLand.length).toBeGreaterThan(0);
    for (const t of check.takenLand) expect(t.grid).toEqual(G30);
    const area = (state: VillageState): number => state.parts.reduce((sum, p) => sum + p.areaM2, 0);
    const next = startNewDwelling(s, s.lastDay, 'zemnice', at, check.obstacleCost, [], {
      takenLand: check.takenLand,
    });
    expect(area(next)).toBeLessThan(area(s));
  });

  it('hřbitov v mřížce krajiny přes natočené pole mu vezme jen průnik', () => {
    const s = withTurnedField();
    const cemetery = cemeteryPartsFromCells(landscape, s, [{ x: 8, y: 8 }], FAR, EMPTY);
    expect(cemetery.check.reason).toBeNull();
    expect(cemetery.takenLand.length).toBeGreaterThan(0);
    for (const t of cemetery.takenLand) {
      expect(t.grid).toEqual(G30);
      expect(t.areaM2).toBeLessThan(CELL);
    }
  });

  it('stará navazující pole se slučují jen ve stejné mřížce', () => {
    const s = withTurnedField();
    const field = s.fields[0]!;
    // druhé pole stejné mřížky přiléhá stranou (řada y = 2) – sloučí se
    const twin = structuredClone(s);
    twin.fields.push({ id: 900, grid: G30 });
    for (const cell of block(0, 2, 2, 1)) {
      twin.parts.push({ ...structuredClone(s.parts[0]!), id: twin.nextId++, fieldId: 900, cell });
    }
    expect(withMergedFields(twin).fields.map((f) => f.id)).toEqual([field.id]);
    // pole v mřížce krajiny se stejnými čísly čtverců (jinde ve světě) se neslučuje
    const other = structuredClone(s);
    other.fields.push({ id: 901 });
    for (const cell of block(0, 2, 2, 1)) {
      other.parts.push({ ...structuredClone(s.parts[0]!), id: other.nextId++, fieldId: 901, cell });
    }
    expect(withMergedFields(other)).toBe(other);
  });
});

describe('natočené stavby v simulaci', () => {
  it('hospodářství bere středy natočených čtverců a sousedy jen v jejich mřížce', () => {
    const houses = [{ id: 1, position: { x: 0, z: 0 } }];
    const cells: TileCell[] = block(-2, -2, 5, 5);
    // hospodářství počítá v krajině sídla 128 × 128 políček – střed (7,5; 7,5) má políčko (64, 64)
    const aligned = fieldHoldings(
      houses,
      cells.map((cell, i) => ({ id: i + 1, cell: { x: cell.x + 64, y: cell.y + 64 } })),
    );
    const turned = fieldHoldings(
      houses,
      cells.map((cell, i) => ({ id: i + 1, cell, grid: G30 })),
    );
    expect(aligned.active).toBe(true);
    expect(turned.active).toBe(true);
    // čtverec (0, 0) natočené mřížky má střed (7,5; 7,5) – stejně daleko jako políčko (8, 8)
    expect(turned.byPart.get(13)!.distanceM).toBeCloseTo(aligned.byPart.get(13)!.distanceM, 9);
  });

  it('les z natočeného pole stojí v natočeném čtverci a má vlastní id', () => {
    const wood = { cell: { x: 0, y: 0 }, x: 7.5, z: 7.5, areaM2: CELL, grid: G30 };
    const spots = woodTreeSpots(wood);
    const aligned = woodTreeSpots({ cell: { x: 8, y: 8 }, x: 7.5, z: 7.5, areaM2: CELL });
    expect(spots.length).toBe(aligned.length);
    expect(new Set([...spots, ...aligned].map((s) => s.id)).size).toBe(2 * spots.length);
    const [c, s] = rotationCosSin(G30.rotation);
    for (const spot of spots) {
      const dx = spot.x - 7.5;
      const dz = spot.z - 7.5;
      expect(Math.abs(dx * c - dz * s)).toBeLessThanOrEqual(7.51);
      expect(Math.abs(dx * s + dz * c)).toBeLessThanOrEqual(7.51);
    }
  });

  it('ves s natočeným polem, sadem a pozemkem se dopočítá po kouscích stejně jako vcelku', () => {
    const landscape = makeLandscape();
    let s = withBuiltFirstDwelling(
      foundVillage({ seed: 9, day: DAY, dwellingPosition: { x: -60, z: -60, rotation: 0 } }),
    );
    const positions = [{ x: -60, z: -60, rotation: 0 }];
    const field = fieldPartsFromCells(landscape, s, block(0, 0, 4, 3), positions, EMPTY, G30);
    expect(field.check.ok).toBe(true);
    s = foundField(s, s.lastDay, { parts: field.parts, grid: G30 });
    const away: SquareGrid = { x: -52.5, z: 52.5, rotation: G45.rotation };
    const orchard = orchardPartsFromCells(landscape, s, block(0, 0, 2, 2), positions, EMPTY, away);
    expect(orchard.check.ok).toBe(true);
    s = foundOrchard(s, s.lastDay, { squares: orchard.squares, grid: away });
    const man = s.nextId++;
    const woman = s.nextId++;
    s.people.push(
      { id: man, bornDay: DAY - 9000, dwellingId: 1, sex: 'male', spouseId: woman },
      { id: woman, bornDay: DAY - 9000, dwellingId: 1, sex: 'female', spouseId: man },
    );
    s.woodLogs = 60;
    const plot = rotatedPlot(
      landscape,
      { x: -60, z: 10, rotation: 5 * ROTATION_STEP },
      'back-left',
    )!;
    const check = checkPlotPlacement(landscape, s, 'polozemnice', plot, EMPTY);
    expect(check.ok).toBe(true);
    s = startNewDwelling(s, s.lastDay, 'polozemnice', check.position!, check.obstacleCost, [], {
      plot,
      obstacles: EMPTY,
    });
    const end = s.lastDay + 500;
    const whole = advanceVillage(s, end, EMPTY, landscape);
    let parts = s;
    for (const step of [1, 45, 200, 333, 500]) {
      parts = advanceVillage(parts, Math.min(end, s.lastDay + step), EMPTY, landscape);
    }
    expect(parts).toEqual(whole);
    expect(whole.fields.find((f) => f.grid)?.grid).toEqual(G30);
    expect(whole.orchards?.[0]?.grid).toEqual(away);
  });
});
