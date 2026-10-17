import { describe, expect, it } from 'vitest';
import {
  parseFoundVillageInput,
  parseCells,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePosition,
} from '../village-input';

describe('ověření vstupu server actions vsi', () => {
  it('poloha musí mít konečná čísla x, z, rotation', () => {
    expect(parsePosition({ x: 1, z: 2, rotation: 0 })).toEqual({ x: 1, z: 2, rotation: 0 });
    expect(parsePosition({ x: 1, z: 2 })).toBeNull();
    expect(parsePosition({ x: Infinity, z: 2, rotation: 0 })).toBeNull();
    expect(parsePosition({ x: '1', z: 2, rotation: 0 })).toBeNull();
    expect(parsePosition(null)).toBeNull();
  });

  it('čtverce pole jsou pole { x, y } s čísly rozumné délky; přebytečné klíče zahodí', () => {
    expect(
      parseCells([
        { x: 0, y: 0 },
        { x: 1, y: 2, evil: true },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(parseCells([[0, 0]])).toBeNull();
    expect(parseCells([{ x: 0, y: NaN }])).toBeNull();
    expect(parseCells([{ x: '1', y: 0 }])).toBeNull();
    expect(parseCells('0,0')).toBeNull();
    expect(parseCells(Array.from({ length: 5001 }, () => ({ x: 0, y: 0 })))).toBeNull();
    expect(parsePosition({ x: 1, z: 2, rotation: 0, evil: true })).toEqual({
      x: 1,
      z: 2,
      rotation: 0,
    });
  });

  it('založení vsi, obydlí a pole', () => {
    const cells = [
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ];
    const dwelling = { x: 1, z: 2, rotation: 0 };
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, fieldCells: cells })).toEqual({
      name: 'Libice',
      dwelling,
      fieldCells: cells,
    });
    expect(parseFoundVillageInput({ name: 5, dwelling, fieldCells: cells })).toBeNull();
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, fieldOutline: [] })).toBeNull();
    expect(parsePlaceDwellingInput({ type: 'polozemnice', position: dwelling })).toEqual({
      type: 'polozemnice',
      position: dwelling,
    });
    expect(parsePlaceDwellingInput({ type: 'hrad', position: dwelling })).toBeNull();
    expect(parsePlaceFieldInput({ cells })).toEqual({ cells });
    expect(parsePlaceFieldInput({})).toBeNull();
  });
});
