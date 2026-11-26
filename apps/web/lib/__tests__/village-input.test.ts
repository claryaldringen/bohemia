import { describe, expect, it } from 'vitest';
import {
  parseSetDefenseStanceInput,
  parseBaptizeInput,
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
  parseArmsOrderInput,
  parseMarketExpeditionInput,
  parseMarketPeopleInput,
  parseSlaveOfferInput,
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
    expect(parsePlaceDwellingInput({ type: 'srub', position: dwelling })).toEqual({
      type: 'srub',
      position: dwelling,
    });
    // dvorec hráč nestaví (trade.md, log-house.md – Dvorec od roku 800)
    expect(parsePlaceDwellingInput({ type: 'dvorec-srub', position: dwelling })).toBeNull();
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

  it('nadzemní dílna: type vypleteny / srub projde, jiný typ ne, bez type klíč type není', () => {
    const position = { x: 1, z: 2, rotation: 0.5 };
    expect(parsePlaceWorkshopInput({ craft: 'smith', position, type: 'srub' })).toEqual({
      craft: 'smith',
      position,
      type: 'srub',
    });
    expect(parsePlaceWorkshopInput({ craft: 'smith', position, type: 'vypleteny' })?.type).toBe(
      'vypleteny',
    );
    expect(parsePlaceWorkshopInput({ craft: 'smith', position, type: 'dvorec' })).toBeNull();
    expect(parsePlaceWorkshopInput({ craft: 'smith', position, type: 'polozemnice' })).toBeNull();
    expect(parsePlaceWorkshopInput({ craft: 'smith', position, type: 7 })).toBeNull();
    expect(parsePlaceWorkshopInput({ craft: 'smith', position })).not.toHaveProperty('type');
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
    // hřbitov zbourá pokřtěný rod (christianity.md) – o tom, jestli smí, rozhodne server
    expect(parseStructureUseInput({ structure: 'cemetery', id: 5 })).toEqual({
      structure: 'cemetery',
      id: 5,
    });
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

describe('vstup stezky (trade.md)', () => {
  it('směr stezky jen z 8 známých', async () => {
    const { parseBuildTrailInput } = await import('../village-input');
    expect(parseBuildTrailInput({ direction: 'SE' })).toEqual({ direction: 'SE' });
    expect(parseBuildTrailInput({ direction: 'up' })).toBeNull();
    expect(parseBuildTrailInput(null)).toBeNull();
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

describe('parseBaptizeInput – křest vojvody (christianity.md – Křest rodu)', () => {
  it('stačí objekt s villageId (ten čte villageAction), cokoli jiného neprojde', () => {
    expect(parseBaptizeInput({ villageId: 'v-1' })).toEqual({});
    expect(parseBaptizeInput({})).toEqual({});
    expect(parseBaptizeInput(null)).toBeNull();
    expect(parseBaptizeInput('v-1')).toBeNull();
  });
});

describe('parseSetDefenseStanceInput (war.md – Obránci)', () => {
  it('přijme obranu a evakuaci, zrušené vzdání odmítne', () => {
    expect(parseSetDefenseStanceInput({ stance: 'defend' })).toEqual({ stance: 'defend' });
    expect(parseSetDefenseStanceInput({ stance: 'flee' })).toEqual({ stance: 'flee' });
    expect(parseSetDefenseStanceInput({ stance: 'surrender' })).toBeNull();
  });
});

describe('vstup výpravy na trh', () => {
  const ok = {
    villageId: '11111111-1111-4111-8111-111111111111',
    targetVillageId: '22222222-2222-4222-8222-222222222222',
    give: { grain: 200, cows: 2 },
    wants: { meat: 50 },
    stayDays: 3,
  };

  it('převede objednávku a cíl', () => {
    expect(parseMarketExpeditionInput(ok)).toEqual({
      targetVillageId: '22222222-2222-4222-8222-222222222222',
      order: { give: { grain: 200, cows: 2 }, wants: { meat: 50 }, stayDays: 3 },
    });
    expect(parseMarketExpeditionInput({ ...ok, give: undefined, wants: undefined })).toMatchObject({
      order: { give: {}, wants: {} },
    });
  });

  it('odmítne záporná čísla, desetiny, neznámé zboží a špatný tvar', () => {
    expect(parseMarketExpeditionInput({ ...ok, give: { grain: -1 } })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, give: { cows: 1.5 } })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, wants: { grain: 10.5 } })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, give: { silver: 5 } })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, give: { grain: NaN } })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, stayDays: 1.5 })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, stayDays: -1 })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, targetVillageId: '' })).toBeNull();
    expect(parseMarketExpeditionInput({ ...ok, give: [] })).toBeNull();
    expect(parseMarketExpeditionInput(null)).toBeNull();
  });
});

describe('vstup lidí na prodej pro náhled výpravy (plán 3, Úloha 11)', () => {
  const ok = { villageId: '11111111-1111-4111-8111-111111111111', families: 1, men: 0, women: 3 };

  it('převede počty rodin, mužů a žen', () => {
    expect(parseMarketPeopleInput(ok)).toEqual({ families: 1, men: 0, women: 3 });
  });

  it('otroci jsou volitelné celé nezáporné číslo (plán 5)', () => {
    expect(parseMarketPeopleInput({ ...ok, slaves: 2 })).toEqual({
      families: 1,
      men: 0,
      women: 3,
      slaves: 2,
    });
    expect(parseMarketPeopleInput(ok)).not.toHaveProperty('slaves');
    expect(parseMarketPeopleInput({ ...ok, slaves: 1.5 })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, slaves: -1 })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, slaves: '2' })).toBeNull();
  });

  it('odmítne chybějící, záporné a necelé počty i špatný tvar', () => {
    expect(parseMarketPeopleInput({ ...ok, men: undefined })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, families: -1 })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, women: 1.5 })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, men: '2' })).toBeNull();
    expect(parseMarketPeopleInput({ ...ok, families: Infinity })).toBeNull();
    expect(parseMarketPeopleInput(null)).toBeNull();
  });
});

describe('vstup objednávky zbroje u cizích kupců (plán 4, Úloha 6)', () => {
  const ok = { villageId: '11111111-1111-4111-8111-111111111111', good: 'swords', amount: 2 };

  it('převede zbroj a počet kusů – i nulu', () => {
    expect(parseArmsOrderInput({ good: 'swords', amount: 2 })).toEqual({
      good: 'swords',
      amount: 2,
    });
    expect(parseArmsOrderInput(ok)).toEqual({ good: 'swords', amount: 2 });
    expect(parseArmsOrderInput({ ...ok, good: 'mailShirts', amount: 0 })).toEqual({
      good: 'mailShirts',
      amount: 0,
    });
    expect(parseArmsOrderInput({ ...ok, good: 'helmets' })).toEqual({ good: 'helmets', amount: 2 });
  });

  it('odmítne jiné zboží než zbroj', () => {
    for (const good of [
      'coins',
      'grain',
      'gold',
      '',
      'toString',
      '__proto__',
      1,
      null,
      undefined,
    ]) {
      expect(parseArmsOrderInput({ ...ok, good })).toBeNull();
    }
  });

  it('odmítne záporný, necelý a nečíselný počet i špatný tvar', () => {
    for (const amount of [-1, 1.5, NaN, Infinity, '2', null, undefined, [2]]) {
      expect(parseArmsOrderInput({ ...ok, amount })).toBeNull();
    }
    expect(parseArmsOrderInput(null)).toBeNull();
    expect(parseArmsOrderInput([ok])).toBeNull();
    expect(parseArmsOrderInput('swords')).toBeNull();
  });
});

describe('vstup nabídky otroků (plán 5, Úloha 6b)', () => {
  it('převede celý nezáporný počet, jinak null', () => {
    expect(parseSlaveOfferInput({ villageId: 'v', count: 2 })).toEqual({ count: 2 });
    expect(parseSlaveOfferInput({ count: 0 })).toEqual({ count: 0 });
    for (const count of ['2', -1, 1.5, NaN, null, undefined]) {
      expect(parseSlaveOfferInput({ villageId: 'v', count })).toBeNull();
    }
    expect(parseSlaveOfferInput(null)).toBeNull();
  });
});
