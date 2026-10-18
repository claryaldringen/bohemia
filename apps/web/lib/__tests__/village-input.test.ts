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
  parseCancelRelocationInput,
  parseRelocateHouseholdInput,
  parseVillageId,
  villageIdOf,
  parsePlantRoadApplesInput,
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

describe('vstupy víc vsí a přestěhování (migration.md)', () => {
  const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('id vsi je UUID z vstupu akce, jiný řetězec ne', () => {
    expect(villageIdOf({ villageId: ID, cells: [] })).toBe(ID);
    expect(villageIdOf({ villageId: ID.toUpperCase() })).toBe(ID);
    expect(villageIdOf({ villageId: "1' OR 1=1" })).toBeNull();
    expect(villageIdOf({ villageId: 42 })).toBeNull();
    expect(villageIdOf({})).toBeNull();
    expect(villageIdOf(null)).toBeNull();
    expect(parseVillageId(undefined)).toBeNull();
  });

  it('přestěhování: id obydlí a nový dům jako stavba obydlí', () => {
    const position = { x: 1, z: 2, rotation: 0 };
    expect(
      parseRelocateHouseholdInput({ villageId: ID, dwellingId: 3, type: 'zemnice', position }),
    ).toEqual({ dwellingId: 3, type: 'zemnice', position });
    expect(
      parseRelocateHouseholdInput({
        dwellingId: 3,
        type: 'polozemnice',
        position,
        plot: { cell: { x: 4, y: 5 }, variant: 'center' },
      }),
    ).toEqual({
      dwellingId: 3,
      type: 'polozemnice',
      position,
      plot: { cell: { x: 4, y: 5 }, variant: 'center' },
    });
    expect(parseRelocateHouseholdInput({ dwellingId: 0, type: 'zemnice', position })).toBeNull();
    expect(parseRelocateHouseholdInput({ dwellingId: 1.5, type: 'zemnice', position })).toBeNull();
    expect(parseRelocateHouseholdInput({ dwellingId: 2, type: 'hrad', position })).toBeNull();
  });

  it('zrušení přestěhování: kladné celé id stavby', () => {
    expect(parseCancelRelocationInput({ constructionId: 12 })).toEqual({ constructionId: 12 });
    expect(parseCancelRelocationInput({ constructionId: -1 })).toBeNull();
    expect(parseCancelRelocationInput({ constructionId: '12' })).toBeNull();
    expect(parseCancelRelocationInput(undefined)).toBeNull();
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

describe('parsePlantRoadApplesInput', () => {
  it('úsek cesty – kladné celé číslo, nic jiného', () => {
    expect(parsePlantRoadApplesInput({ roadId: 4 })).toEqual({ roadId: 4 });
    expect(parsePlantRoadApplesInput({ roadId: 4, extra: 1 })).toEqual({ roadId: 4 });
    expect(parsePlantRoadApplesInput({ roadId: 0 })).toBeNull();
    expect(parsePlantRoadApplesInput({ roadId: 1.5 })).toBeNull();
    expect(parsePlantRoadApplesInput({ roadId: '4' })).toBeNull();
    expect(parsePlantRoadApplesInput(null)).toBeNull();
  });
});

describe('vstup stezky a obchodu (trade.md)', () => {
  it('směr stezky jen z 8 známých', async () => {
    const { parseBuildTrailInput } = await import('../village-input');
    expect(parseBuildTrailInput({ direction: 'se' })).toEqual({ direction: 'se' });
    expect(parseBuildTrailInput({ direction: 'up' })).toBeNull();
    expect(parseBuildTrailInput(null)).toBeNull();
  });

  it('výprava: známé zboží, celá nezáporná množství', async () => {
    const { parseSendExpeditionInput } = await import('../village-input');
    expect(
      parseSendExpeditionInput({ direction: 'n', give: { grain: 100, salt: 0 }, get: { iron: 2 } }),
    ).toEqual({ direction: 'n', give: { grain: 100 }, get: { iron: 2 } });
    expect(parseSendExpeditionInput({ direction: 'n', give: { gold: 1 }, get: {} })).toBeNull();
    expect(parseSendExpeditionInput({ direction: 'n', give: { grain: -1 }, get: {} })).toBeNull();
    expect(parseSendExpeditionInput({ direction: 'n', give: { grain: 1.5 }, get: {} })).toBeNull();
  });
});
