import { describe, expect, it } from 'vitest';
import {
  parseFoundVillageInput,
  parseOutline,
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

  it('obrys je pole dvojic čísel rozumné délky; přebytečné klíče polohy zahodí', () => {
    expect(
      parseOutline([
        [0, 0],
        [1, 2],
      ]),
    ).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(parseOutline([[0, 0, 1]])).toBeNull();
    expect(parseOutline([[0, NaN]])).toBeNull();
    expect(parseOutline('0,0')).toBeNull();
    expect(parseOutline(Array.from({ length: 1001 }, () => [0, 0]))).toBeNull();
    expect(parsePosition({ x: 1, z: 2, rotation: 0, evil: true })).toEqual({
      x: 1,
      z: 2,
      rotation: 0,
    });
  });

  it('založení vsi, obydlí a pole', () => {
    const outline = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    const dwelling = { x: 1, z: 2, rotation: 0 };
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, fieldOutline: outline })).toEqual({
      name: 'Libice',
      dwelling,
      fieldOutline: outline,
    });
    expect(parseFoundVillageInput({ name: 5, dwelling, fieldOutline: outline })).toBeNull();
    expect(parsePlaceDwellingInput({ type: 'polozemnice', position: dwelling })).toEqual({
      type: 'polozemnice',
      position: dwelling,
    });
    expect(parsePlaceDwellingInput({ type: 'hrad', position: dwelling })).toBeNull();
    expect(parsePlaceFieldInput({ outline })).toEqual({ outline });
    expect(parsePlaceFieldInput({})).toBeNull();
  });
});
