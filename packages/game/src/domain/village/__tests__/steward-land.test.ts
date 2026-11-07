import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf, tileCenterWorld } from '../../landscape';
import { foundVillage } from '../actions';
import { STEWARD } from '../rules-steward';
import {
  dwellingSiteValue,
  fieldCells,
  fieldCellValue,
  landValues,
  squareValue,
  villageTerritory,
} from '../steward-land';
import { makeLandscape } from './placement-fixtures';

// Mapa hodnot krajiny správce (steward.md – Mapa hodnot krajiny).

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const SIZE = 64;
const at = (x: number, y: number): number => y * SIZE + x;

// potok v ose x = 10 (dno 0 m), louka do x = 50 stoupá o 0,2 m na políčko, za ní les
const land = makeLandscape({
  size: SIZE,
  surface: (x) => (x === 10 ? 'water' : x > 50 ? 'forest' : 'meadow'),
  height: (x) => (x === 10 ? 0 : 0.2 * Math.abs(x - 10)),
  fertility: () => 60,
});

describe('hodnoty políček krajiny', () => {
  const values = landValues(land);

  it('se počítají jednou pro objekt krajiny', () => {
    expect(landValues(land)).toBe(values);
  });

  it('vzdálenost k okraji vody a lesa od středu políčka', () => {
    expect(values.waterDistM[at(10, 5)]).toBe(0);
    expect(values.waterDistM[at(11, 5)]).toBe(7.5);
    expect(values.waterDistM[at(14, 5)]).toBe(52.5);
    expect(values.forestDistM[at(50, 5)]).toBe(7.5);
    expect(values.forestDistM[at(51, 5)]).toBe(0);
  });

  it('záplavy berou úrodu jen pod hladinou velké vody, víc níž', () => {
    expect(values.floodKept[at(11, 5)]).toBeLessThan(values.floodKept[at(15, 5)]!);
    expect(values.floodKept[at(15, 5)]).toBeLessThan(1);
    expect(values.floodKept[at(48, 5)]).toBe(1);
    expect(values.silt[at(11, 5)]).toBeGreaterThan(0);
  });
});

describe('hodnota políčka pro pole', () => {
  const cells = fieldCells(land, obstaclesOf(land));

  it('je squareValue louky × počasí bez zeleně daleko od vody a lesa', () => {
    const meadow = {
      areaM2: 225,
      distanceM: 300,
      naturalFertility: 60,
      surface: 'meadow' as const,
      obstacleCost: 0,
    };
    const expected = squareValue(meadow) * (1 - STEWARD.weatherLoss);
    expect(fieldCellValue(cells, at(30, 5), 300)).toBeCloseTo(expected, 4);
  });

  it('klesá se vzdáleností, u lesa (zvěř) a v nivě (záplavy); voda 0', () => {
    expect(fieldCellValue(cells, at(40, 5), 600)).toBeLessThan(
      fieldCellValue(cells, at(40, 5), 100),
    );
    expect(fieldCellValue(cells, at(50, 5), 100)).toBeLessThan(
      fieldCellValue(cells, at(40, 5), 100),
    );
    expect(fieldCellValue(cells, at(11, 5), 100)).toBeLessThan(
      fieldCellValue(cells, at(40, 5), 100),
    );
    expect(fieldCellValue(cells, at(10, 5), 100)).toBe(0);
  });
});

describe('místo pro dům', () => {
  const values = landValues(land);

  it('ne ve vodě, v lese ani pod hladinou dvousetleté vody', () => {
    expect(dwellingSiteValue(land, values, at(10, 5), 7)).toBeNull();
    expect(dwellingSiteValue(land, values, at(55, 5), 7)).toBeNull();
    expect(dwellingSiteValue(land, values, at(20, 5), 7)).toBeNull();
    expect(dwellingSiteValue(land, values, at(40, 5), 7)).not.toBeNull();
  });

  it('dál od vody stojí víc chůze', () => {
    expect(dwellingSiteValue(land, values, at(36, 5), 7)!).toBeLessThan(
      dwellingSiteValue(land, values, at(46, 5), 7)!,
    );
  });
});

describe('území vsi', () => {
  const position = (x: number, y: number): { x: number; z: number; rotation: number } => ({
    ...tileCenterWorld(land, x, y),
    rotation: 0,
  });
  const mine = foundVillage({ seed: 1, day: DAY, dwellingPosition: position(30, 20) });

  it('ves má vše do 800 m od středu – jedna ves, jedna mapa, území nedělí', () => {
    const alone = villageTerritory(mine, land);
    expect(alone[at(30, 45)]).toBe(1);
    expect(alone[at(30, 30)]).toBe(1);
    // vzdálenější políčko než 800 m od středu (15 m políčko × 55) k území nepatří
    expect(alone[at(30, 20 + 55)] ?? 0).toBe(0);
  });
});
