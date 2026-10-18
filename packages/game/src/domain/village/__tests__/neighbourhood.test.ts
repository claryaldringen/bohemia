import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import { departVillage } from '../departure';
import { neighbourSnapshot, withNeighbours, withoutNeighbours } from '../neighbourhood';
import { obstacleChangesAt } from '../obstacles';
import {
  FOREIGN_LAND,
  checkDwellingPlacement,
  checkPlotPlacement,
  fieldPartsFromCells,
  placementVillageOf,
  rotatedPlot,
} from '../placement';
import { ROTATION_STEP, rotationCosSin } from '../square-grid';
import type { DwellingPlot, SquareGrid, VillageState } from '../types';
import { reservedTrees } from '../wood';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vsi na téže mapě o sobě vědí (migration.md – fáze 3): kontroly umístění znají stavby a pole
// druhé vsi, paseky a vyhrazené stromy se nekříží.

const DAY = 1000;
// 32 × 32 políček po 15 m = 480 m; středy políček: x = −240 + (i + 0,5) · 15
const landscape = makeLandscape({ size: 32 });

/** Druhá ves: zemnice na políčku (8, 8), pole na políčkách (10–12, 8–9), paseky a vyhrazený strom. */
function otherVillage(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: -112.5, z: -112.5, rotation: 0 } }),
  );
  for (const [i, cell] of block(10, 8, 3, 2).entries()) {
    s.fields.push({ id: 900 });
    s.parts.push({
      id: 901 + i,
      fieldId: 900,
      areaM2: 225,
      distanceM: 30,
      naturalFertility: 60,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'ready',
      sownYears: 0,
      fallowSinceDay: null,
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
      cell,
    });
  }
  s.clearedObstacles = [{ id: 11, day: DAY }];
  s.felledTrees = [{ id: 12, day: DAY }];
  s.constructions.push({
    id: 777,
    kind: 'rebuild',
    startedDay: DAY,
    cost: 10,
    done: 0,
    dwellingType: 'zemnice',
    position: null,
    dwellingId: 1,
    fieldId: null,
    wood: { trees: 1, fromPile: 0, fell: [{ id: 13, cost: 2 }], felled: 0 },
  });
  return s;
}

/** Tahle ves – zemnice daleko od druhé, nic dalšího. */
function thisVillage(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 150, z: 150, rotation: 0 } }),
  );
}

describe('neighbourSnapshot', () => {
  it('stavby, půda, paseky a vyhrazené stromy druhé vsi; bez vsí null', () => {
    const snapshot = neighbourSnapshot([otherVillage()], DAY)!;
    expect(snapshot.dwellings).toHaveLength(1);
    expect(snapshot.cells).toEqual(block(10, 8, 3, 2).sort((a, b) => a.y - b.y || a.x - b.x));
    expect(snapshot.cleared.map((c) => c.id)).toEqual([11]);
    expect(snapshot.felled.map((c) => c.id)).toEqual([12]);
    expect(snapshot.reserved).toContain(13);
    expect(neighbourSnapshot([], DAY)).toBeNull();
  });

  it('ves na cestě nic nezabírá, opuštěná jen to, co z ní stojí', () => {
    const other = otherVillage();
    const { state: abandoned } = departVillage(other, DAY, [1]);
    expect(neighbourSnapshot([abandoned], DAY)!.dwellings).toHaveLength(1);
    expect(neighbourSnapshot([abandoned], DAY + 20 * 365)!.dwellings).toHaveLength(0);
  });

  it('přehled se připojí a před uložením odebere', () => {
    const s = thisVillage();
    expect(withNeighbours(s, null)).toBe(s);
    const attached = withNeighbours(s, neighbourSnapshot([otherVillage()], DAY));
    expect(attached.neighbours).toBeDefined();
    expect(withoutNeighbours(attached)).toEqual(s);
    expect(withoutNeighbours(s)).toBe(s);
  });
});

describe('kontroly umístění znají druhou ves', () => {
  const attached = (): VillageState =>
    withNeighbours(thisVillage(), neighbourSnapshot([otherVillage()], DAY));

  it('obydlí na pole ani přes zemnici druhé vsi nejde – na vlastní pole by šlo', () => {
    const village = placementVillageOf(attached(), DAY);
    const onField = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: -67.5,
      z: -112.5,
      rotation: 0,
    });
    expect(onField).toMatchObject({ ok: false, reason: FOREIGN_LAND });
    const onHouse = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: -110,
      z: -112.5,
      rotation: 0,
    });
    expect(onHouse.ok).toBe(false);
    // bez přehledu by místo prošlo
    const alone = placementVillageOf(thisVillage(), DAY);
    expect(
      checkDwellingPlacement(landscape, alone, 'zemnice', { x: -67.5, z: -112.5, rotation: 0 }).ok,
    ).toBe(true);
  });

  it('pole na půdu druhé vsi nejde a nenavazuje na její pole', () => {
    const village = placementVillageOf(attached(), DAY);
    const over = fieldPartsFromCells(landscape, village, block(11, 9, 3, 2), [
      { x: 150, z: 150, rotation: 0 },
    ]);
    expect(over.check).toMatchObject({ ok: false, reason: FOREIGN_LAND });
    const beside = fieldPartsFromCells(landscape, village, block(13, 8, 3, 2), [
      { x: 150, z: 150, rotation: 0 },
    ]);
    expect(beside.joinedFields).toEqual([]);
  });

  it('pozemek polozemnice na půdě druhé vsi nejde', () => {
    const village = placementVillageOf(attached(), DAY);
    const check = checkPlotPlacement(landscape, village, 'polozemnice', {
      cell: { x: 10, y: 8 },
      variant: 'center',
    });
    expect(check).toMatchObject({ ok: false, reason: FOREIGN_LAND });
  });

  it('paseky a pařezy druhé vsi platí i tady, její vyhrazené stromy nikdo jiný nekácí', () => {
    const s = attached();
    const changes = obstacleChangesAt(s, DAY);
    expect(changes.removed).toContain(11);
    expect(changes.stumps).toContain(12);
    expect(reservedTrees(s).has(13)).toBe(true);
    expect(reservedTrees(thisVillage()).has(13)).toBe(false);
  });
});

describe('natočené stavby druhé vsi (fields.md – Natočené stavby)', () => {
  // mřížka pole druhé vsi: střed čtverce (0, 0) ve středu políčka (11, 8), natočení 30°
  const grid: SquareGrid = { x: -67.5, z: -112.5, rotation: 2 * ROTATION_STEP };
  // natočený pozemek 45° ve středu políčka (20, 20)
  const plot = (): DwellingPlot =>
    rotatedPlot(landscape, { x: 67.5, z: 67.5, rotation: 3 * ROTATION_STEP }, 'center')!;

  /** Druhá ves s natočeným polem 3 × 2 čtverce a natočeným pozemkem obydlí. */
  function turnedVillage(): VillageState {
    const s = otherVillage();
    const aligned = s.parts.filter((p) => p.fieldId === 900);
    s.fields = s.fields.filter((f) => f.id !== 900);
    s.parts = s.parts.filter((p) => p.fieldId !== 900);
    s.fields.push({ id: 950, grid });
    for (const [i, cell] of block(0, 0, 3, 2).entries()) {
      s.parts.push({ ...aligned[i]!, id: 951 + i, fieldId: 950, cell });
    }
    s.dwellings[0]!.type = 'polozemnice';
    s.dwellings[0]!.plot = plot();
    return s;
  }
  const attached = (): VillageState =>
    withNeighbours(thisVillage(), neighbourSnapshot([turnedVillage()], DAY));
  const home = [{ x: 150, z: 150, rotation: 0 }];

  it('přehled nese natočené čtverce s mřížkou zvlášť, natočený pozemek ne jako políčko', () => {
    const snapshot = neighbourSnapshot([turnedVillage()], DAY)!;
    expect(snapshot.squares).toHaveLength(6);
    for (const s of snapshot.squares!) expect(s.grid).toEqual(grid);
    expect(snapshot.cells).toEqual([]);
    expect(snapshot.dwellings[0]!.plot!.square).toBeDefined();
    // ves bez natočených staveb má přehled ve starém tvaru (jen políčka)
    expect(neighbourSnapshot([otherVillage()], DAY)!).not.toHaveProperty('squares');
  });

  it('natočené pole druhé vsi blokuje čtverce, které zasahuje, a obydlí na něm', () => {
    const village = placementVillageOf(attached(), DAY);
    // políčko (10, 8) natočený čtverec (0, 0) zasahuje rohem
    const touched = fieldPartsFromCells(landscape, village, block(10, 5, 1, 5), home);
    expect(touched.check).toMatchObject({ ok: false, reason: FOREIGN_LAND });
    // o políčko dál už ne
    const free = fieldPartsFromCells(landscape, village, block(9, 5, 1, 5), home);
    expect(free.check.ok).toBe(true);
    // obydlí uprostřed čtverce (1, 0) natočeného pole
    const [c, s] = rotationCosSin(grid.rotation);
    const onField = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: grid.x + 15 * c,
      z: grid.z - 15 * s,
      rotation: 0,
    });
    expect(onField).toMatchObject({ ok: false, reason: FOREIGN_LAND });
  });

  it('natočený pozemek druhé vsi blokuje pozemek, který zasahuje, o políčko dál ne', () => {
    const village = placementVillageOf(attached(), DAY);
    const beside = checkPlotPlacement(landscape, village, 'polozemnice', {
      cell: { x: 21, y: 20 },
      variant: 'center',
    });
    expect(beside).toMatchObject({ ok: false, reason: FOREIGN_LAND });
    const further = checkPlotPlacement(landscape, village, 'polozemnice', {
      cell: { x: 22, y: 20 },
      variant: 'center',
    });
    expect(further.ok).toBe(true);
  });
});
