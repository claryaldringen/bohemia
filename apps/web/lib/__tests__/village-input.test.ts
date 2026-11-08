import { describe, expect, it } from 'vitest';
import {
  parseDemolishFortificationSectionInput,
  parseFoundVillageInput,
  parseCells,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceSacredInput,
  parsePlaceThreshingFloorInput,
  parsePlaceWorkshopInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parsePosition,
  parseSkipTimeInput,
  parseAbandonFieldPartsInput,
  parseStructureUseInput,
  parseCancelConstructionInput,
  parseNameLineManInput,
  parseVillageId,
  villageIdOf,
  parsePlantRoadApplesInput,
  parseUpgradeRoadInput,
  parseLeaveVillageInput,
  parseSettleJourneyInput,
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
    // jméno vojvody (lord.md – Zakladatelé) – jen tvar, písmena ověří use-case; bez něj čeká
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, lordName: 'Bořivoj' })).toEqual({
      name: 'Libice',
      dwelling,
      fieldCells: [],
      lordName: 'Bořivoj',
    });
    expect(parseFoundVillageInput({ name: 'Libice', dwelling, lordName: 7 })).toBeNull();
    expect(
      parseFoundVillageInput({ name: 'Libice', dwelling, lordName: 'x'.repeat(201) }),
    ).toBeNull();
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

describe('vstup stavby humna', () => {
  it('poloha s konečnými čísly (přebytečné klíče zahodí), jinak null', () => {
    const position = { x: 1, z: 2, rotation: 0.5 };
    expect(parsePlaceThreshingFloorInput({ position, kind: 'idol' })).toEqual({ position });
    expect(
      parsePlaceThreshingFloorInput({ position: { x: 1, z: 2, rotation: Infinity } }),
    ).toBeNull();
    expect(parsePlaceThreshingFloorInput({})).toBeNull();
    expect(parsePlaceThreshingFloorInput('humno')).toBeNull();
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

  it('zrušení přestěhování: kladné celé id stavby', () => {
    expect(parseCancelConstructionInput({ constructionId: 12 })).toEqual({ constructionId: 12 });
    expect(parseCancelConstructionInput({ constructionId: -1 })).toBeNull();
    expect(parseCancelConstructionInput({ constructionId: '12' })).toBeNull();
    expect(parseCancelConstructionInput(undefined)).toBeNull();
  });

  it('opuštění dílů pole – neprázdný seznam kladných id bez opakování a abandon', () => {
    expect(parseAbandonFieldPartsInput({ partIds: [3, 7], abandon: true })).toEqual({
      partIds: [3, 7],
      abandon: true,
    });
    expect(parseAbandonFieldPartsInput({ partIds: [3], abandon: false })).toEqual({
      partIds: [3],
      abandon: false,
    });
    expect(parseAbandonFieldPartsInput({ partIds: [], abandon: true })).toBeNull();
    expect(parseAbandonFieldPartsInput({ partIds: [3, 3], abandon: true })).toBeNull();
    expect(parseAbandonFieldPartsInput({ partIds: [0], abandon: true })).toBeNull();
    expect(parseAbandonFieldPartsInput({ partIds: ['3'], abandon: true })).toBeNull();
    expect(parseAbandonFieldPartsInput({ partIds: [3], abandon: 'yes' })).toBeNull();
    expect(parseAbandonFieldPartsInput({ partIds: 3, abandon: true })).toBeNull();
    expect(parseAbandonFieldPartsInput(null)).toBeNull();
  });

  it('opustit, zbourat a vrátit stavbu – druh stavby a kladné id', () => {
    expect(parseStructureUseInput({ structure: 'dwelling', id: 5 })).toEqual({
      structure: 'dwelling',
      id: 5,
    });
    expect(parseStructureUseInput({ structure: 'shrine', id: 9 })).toEqual({
      structure: 'shrine',
      id: 9,
    });
    expect(parseStructureUseInput({ structure: 'cemetery', id: 5 })).toBeNull();
    expect(parseStructureUseInput({ structure: 'pen', id: 0 })).toBeNull();
    expect(parseStructureUseInput({ structure: 'pen', id: '3' })).toBeNull();
    expect(parseStructureUseInput(null)).toBeNull();
  });

  it('pojmenování muže rodu – kladné id člověka a jméno (písmena ověří use-case)', () => {
    expect(parseNameLineManInput({ personId: 12, name: 'Mrdomír' })).toEqual({
      personId: 12,
      name: 'Mrdomír',
    });
    expect(parseNameLineManInput({ personId: 0, name: 'Mrdomír' })).toBeNull();
    expect(parseNameLineManInput({ personId: '12', name: 'Mrdomír' })).toBeNull();
    expect(parseNameLineManInput({ personId: 12, name: 5 })).toBeNull();
    expect(parseNameLineManInput({ personId: 12, name: 'x'.repeat(201) })).toBeNull();
    expect(parseNameLineManInput(null)).toBeNull();
  });
});

describe('parseDemolishFortificationSectionInput (demolition.md – Opevnění)', () => {
  it('opevnění kladné id, díl od 0; jinak null', () => {
    expect(parseDemolishFortificationSectionInput({ fortificationId: 3, segment: 0 })).toEqual({
      fortificationId: 3,
      segment: 0,
    });
    expect(parseDemolishFortificationSectionInput({ fortificationId: 3, segment: -1 })).toBeNull();
    expect(parseDemolishFortificationSectionInput({ fortificationId: 3, segment: 1.5 })).toBeNull();
    expect(parseDemolishFortificationSectionInput({ fortificationId: 0, segment: 2 })).toBeNull();
    expect(parseDemolishFortificationSectionInput({ fortificationId: 3 })).toBeNull();
  });
});

describe('parseUpgradeRoadInput', () => {
  it('úsek a vylepšení – jen úprava cesty (hať a lávka jsou její součástí)', () => {
    expect(parseUpgradeRoadInput({ roadId: 4, upgrade: 'improved' })).toEqual({
      roadId: 4,
      upgrade: 'improved',
    });
    expect(parseUpgradeRoadInput({ roadId: 4, upgrade: 'causeway' })).toBeNull();
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
    expect(parseBuildTrailInput({ direction: 'SE' })).toEqual({ direction: 'SE' });
    expect(parseBuildTrailInput({ direction: 'up' })).toBeNull();
    expect(parseBuildTrailInput(null)).toBeNull();
  });

  it('výprava: známé zboží, celá nezáporná množství', async () => {
    const { parseSendExpeditionInput } = await import('../village-input');
    expect(
      parseSendExpeditionInput({
        direction: 'N',
        give: { grain: 100, logs: 0 },
        get: { ironBars: 2 },
      }),
    ).toEqual({ direction: 'N', give: { grain: 100 }, get: { ironBars: 2 } });
    expect(parseSendExpeditionInput({ direction: 'N', give: { gold: 1 }, get: {} })).toBeNull();
    // lidé (trade.md – Výměna lidí): rodiny, muži a ženy zvlášť celými nezápornými čísly,
    // chybějící druh 0, chybí celé = nikdo
    expect(
      parseSendExpeditionInput({
        direction: 'N',
        give: {},
        get: {},
        givePeople: { families: 1, men: 0, women: 1 },
        getPeople: { men: 2 },
      }),
    ).toEqual({
      direction: 'N',
      give: {},
      get: {},
      givePeople: { families: 1, men: 0, women: 1 },
      getPeople: { families: 0, men: 2, women: 0 },
    });
    expect(
      parseSendExpeditionInput({
        direction: 'N',
        give: {},
        get: {},
        givePeople: { families: -1 },
      }),
    ).toBeNull();
    expect(
      parseSendExpeditionInput({ direction: 'N', give: {}, get: {}, getPeople: { women: 1.5 } }),
    ).toBeNull();
    // zboží zvenku obchod nezná (trade.md – Jen společné suroviny)
    expect(parseSendExpeditionInput({ direction: 'N', give: {}, get: { salt: 1 } })).toBeNull();
    expect(parseSendExpeditionInput({ direction: 'N', give: { grain: -1 }, get: {} })).toBeNull();
    expect(parseSendExpeditionInput({ direction: 'N', give: { grain: 1.5 }, get: {} })).toBeNull();
  });
});

describe('vstupy odchodu do nové vsi (migration.md – fáze 3 a 4)', () => {
  const dwelling = { x: 1, z: 2, rotation: 0 };

  it('odchod jen na novou mapu – na téže mapě (`here`) null (jedna ves, jedna mapa)', () => {
    expect(
      parseLeaveVillageInput({ dwellingIds: [3, 5], destination: { kind: 'here', dwelling } }),
    ).toBeNull();
    expect(
      parseLeaveVillageInput({ dwellingIds: [3], destination: { kind: 'map', direction: 'SW' } }),
    ).toEqual({ dwellingIds: [3], destination: { kind: 'map', direction: 'SW' } });
  });

  it('odchod syna vojvody: sonId místo obydlí, ne obojí', () => {
    expect(
      parseLeaveVillageInput({ sonId: 7, destination: { kind: 'map', direction: 'N' } }),
    ).toEqual({ sonId: 7, destination: { kind: 'map', direction: 'N' } });
    expect(
      parseLeaveVillageInput({ sonId: 7, destination: { kind: 'here', dwelling } }),
    ).toBeNull();
    expect(
      parseLeaveVillageInput({ sonId: 0, destination: { kind: 'map', direction: 'N' } }),
    ).toBeNull();
    expect(
      parseLeaveVillageInput({
        sonId: 7,
        dwellingIds: [1],
        destination: { kind: 'map', direction: 'N' },
      }),
    ).toBeNull();
    expect(parseLeaveVillageInput({ sonId: 7 })).toBeNull();
    // null / nečíslo / prázdná obydlí vedle sonId nesmí projít
    const map = { kind: 'map', direction: 'N' };
    expect(parseLeaveVillageInput({ sonId: null, destination: map })).toBeNull();
    expect(parseLeaveVillageInput({ sonId: 7, dwellingIds: [], destination: map })).toBeNull();
  });

  it('bez obydlí, se špatným id, směrem nebo cílem null', () => {
    expect(
      parseLeaveVillageInput({ dwellingIds: [], destination: { kind: 'map', direction: 'N' } }),
    ).toBeNull();
    expect(
      parseLeaveVillageInput({ dwellingIds: [0], destination: { kind: 'map', direction: 'N' } }),
    ).toBeNull();
    expect(
      parseLeaveVillageInput({ dwellingIds: [1], destination: { kind: 'map', direction: 'UP' } }),
    ).toBeNull();
    expect(parseLeaveVillageInput({ dwellingIds: [1], destination: { kind: 'moon' } })).toBeNull();
    expect(parseLeaveVillageInput({ dwellingIds: [1] })).toBeNull();
    expect(
      parseLeaveVillageInput({
        dwellingIds: Array.from({ length: 201 }, (_, i) => i + 1),
        destination: { kind: 'map', direction: 'N' },
      }),
    ).toBeNull();
  });

  it('založení vsi po příjezdu: poloha první zemnice', () => {
    expect(parseSettleJourneyInput({ dwelling })).toEqual({ dwelling });
    expect(parseSettleJourneyInput({ dwelling: { x: 1 } })).toBeNull();
    expect(parseSettleJourneyInput(null)).toBeNull();
  });
});
