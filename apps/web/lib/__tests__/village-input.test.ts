import { describe, expect, it } from 'vitest';
import {
  parseFoundVillageInput,
  parseCells,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceSacredInput,
  parsePlaceWorkshopInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parsePosition,
  parseSkipTimeInput,
  parseUpgradeRoadInput,
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
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, fieldCells: 'x' })).toBeNull();
    // bez čtverců pole – ves se založí jen se zemnicí
    expect(parseFoundVillageInput({ name: 'Libice', dwelling })).toEqual({
      name: 'Libice',
      dwelling,
      fieldCells: [],
    });
    expect(parseRenameVillageInput({ name: 'Lhota' })).toEqual({ name: 'Lhota' });
    expect(parseRenameVillageInput({ name: 'x'.repeat(201) })).toBeNull();
    expect(parseRenameVillageInput('Lhota')).toBeNull();
    expect(parsePlaceDwellingInput({ type: 'polozemnice', position: dwelling })).toEqual({
      type: 'polozemnice',
      position: dwelling,
    });
    expect(parsePlaceDwellingInput({ type: 'hrad', position: dwelling })).toBeNull();
    // pozemek polozemnice: celočíselné políčko a známá varianta (přebytečné klíče zahodí)
    const plot = { cell: { x: 4, y: 7, z: 1 }, variant: 'back-left' };
    expect(parsePlaceDwellingInput({ type: 'polozemnice', position: dwelling, plot })).toEqual({
      type: 'polozemnice',
      position: dwelling,
      plot: { cell: { x: 4, y: 7 }, variant: 'back-left' },
    });
    for (const bad of [
      { cell: { x: 4.5, y: 7 }, variant: 'center' },
      { cell: { x: 4, y: 7 }, variant: 'middle' },
      { variant: 'center' },
      'center',
    ]) {
      expect(
        parsePlaceDwellingInput({ type: 'polozemnice', position: dwelling, plot: bad }),
      ).toBeNull();
    }
    expect(parsePlaceFieldInput({ cells })).toEqual({ cells });
    expect(parsePlaceFieldInput({})).toBeNull();
  });

  it('restart hry: bez vstupu jen po konci hry, { abandon: true } i se živou vsí', () => {
    expect(parseRestartGameInput(undefined)).toEqual({ abandon: false });
    expect(parseRestartGameInput({})).toEqual({ abandon: false });
    expect(parseRestartGameInput({ abandon: true })).toEqual({ abandon: true });
    expect(parseRestartGameInput({ abandon: false })).toEqual({ abandon: false });
    expect(parseRestartGameInput({ abandon: 'true' })).toBeNull();
    expect(parseRestartGameInput({ abandon: 1 })).toBeNull();
    expect(parseRestartGameInput(null)).toBeNull();
    expect(parseRestartGameInput(true)).toBeNull();
  });

  it('přeskočení času: jen měsíc, rok, nebo 10 let', () => {
    expect(parseSkipTimeInput({ skip: 'month' })).toEqual({ skip: 'month' });
    expect(parseSkipTimeInput({ skip: 'year', days: 9999 })).toEqual({ skip: 'year' });
    expect(parseSkipTimeInput({ skip: 'decade' })).toEqual({ skip: 'decade' });
    expect(parseSkipTimeInput({ skip: 'century' })).toBeNull();
    expect(parseSkipTimeInput({ days: 30 })).toBeNull();
    expect(parseSkipTimeInput('month')).toBeNull();
    expect(parseSkipTimeInput(undefined)).toBeNull();
  });
});

describe('vstup stavby modly a svatyně', () => {
  it('druh idol / shrine a poloha s konečnými čísly, jinak null', () => {
    const position = { x: 1, z: 2, rotation: 0.5 };
    expect(parsePlaceSacredInput({ kind: 'idol', position })).toEqual({ kind: 'idol', position });
    expect(parsePlaceSacredInput({ kind: 'shrine', position })).toEqual({
      kind: 'shrine',
      position,
    });
    expect(parsePlaceSacredInput({ kind: 'zemnice', position })).toBeNull();
    expect(
      parsePlaceSacredInput({ kind: 'idol', position: { x: 1, z: NaN, rotation: 0 } }),
    ).toBeNull();
    expect(parsePlaceSacredInput(null)).toBeNull();
  });
});

describe('vstup stavby řemeslné dílny', () => {
  it('řemeslo potter / smith / burner a poloha s konečnými čísly, jinak null', () => {
    const position = { x: 1, z: 2, rotation: 0.5 };
    expect(parsePlaceWorkshopInput({ craft: 'smith', position })).toEqual({
      craft: 'smith',
      position,
    });
    expect(parsePlaceWorkshopInput({ craft: 'burner', position, extra: 1 })).toEqual({
      craft: 'burner',
      position,
    });
    expect(parsePlaceWorkshopInput({ craft: 'weaver', position })).toBeNull();
    expect(
      parsePlaceWorkshopInput({ craft: 'potter', position: { x: 1, z: 2, rotation: Infinity } }),
    ).toBeNull();
    expect(parsePlaceWorkshopInput('potter')).toBeNull();
  });
});

describe('parseUpgradeRoadInput', () => {
  it('úsek a vylepšení – jen upravená cesta nebo hať a lávka', () => {
    expect(parseUpgradeRoadInput({ roadId: 4, upgrade: 'improved' })).toEqual({
      roadId: 4,
      upgrade: 'improved',
    });
    expect(parseUpgradeRoadInput({ roadId: 4, upgrade: 'causeway' })?.upgrade).toBe('causeway');
    expect(parseUpgradeRoadInput({ roadId: 4, upgrade: 'trodden' })).toBeNull();
    expect(parseUpgradeRoadInput({ roadId: 0, upgrade: 'improved' })).toBeNull();
    expect(parseUpgradeRoadInput({ roadId: 1.5, upgrade: 'improved' })).toBeNull();
    expect(parseUpgradeRoadInput(null)).toBeNull();
  });
});
