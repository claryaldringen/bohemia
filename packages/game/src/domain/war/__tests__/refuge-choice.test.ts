import { describe, expect, it } from 'vitest';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, Person, VillageState } from '../../village/types';
import type { GridCell } from '../../village/people/world-grid';
import type { CampaignPlace } from '../campaign-types';
import {
  armyEtaTicks,
  flightEtaTicks,
  flightLoad,
  leaveMapTicks,
  messengerOf,
  messengerSpeed,
  refugeHostOf,
  refugeOptions,
  stewardAlarmChoice,
  type RefugeHost,
  type RefugeOptionsInput,
} from '../refuge-choice';
import { WAR } from '../rules-war';
import { TICKS_PER_SECOND } from '../ticks';
import { field, land, palisade } from './battle-fixtures';

// Hradiště, odhady a volba správce (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09
// – Úloha 4, Otevřené 1, 2, 4, 6, 7).

/** Letní den (červenec roku 500) – bez sněhu (`isMarchWinter`). */
const DAY = 200;
const GEO = land();
const HOME: GridCell = { x: 0, y: 0 };

const house = (id: number, x: number, z = 0): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

const person = (
  id: number,
  age: number,
  sex: 'male' | 'female',
  extra: Partial<Person> = {},
): Person => ({
  ...kin({ id, age, sex, home: 1 }, DAY),
  ...extra,
});

const livestock = {
  herds: { sheep: 10, goat: 4, pig: 2, cow: 3 },
  young: { sheep: 2, goat: 0, pig: 0, cow: 1 },
};

/** Ves 3 mužů, 2 žen a dítěte s dobytkem a 5 t obilí. */
function home(extra: Partial<VillageState> = {}): VillageState {
  const people = [
    person(1, 30, 'male'),
    person(2, 25, 'male'),
    person(3, 40, 'male'),
    person(4, 28, 'female'),
    person(5, 33, 'female'),
    person(6, 10, 'male'),
  ];
  return village(people, [house(1, 760)], { lastDay: DAY, storesKg: 5000, livestock, ...extra });
}

/** Hradiště na políčku `cell` se středem útočiště v počátku mapy. */
const host = (villageId: string, cell: GridCell, capacityM2 = 2000): RefugeHost => ({
  villageId,
  cell,
  center: { x: 0, z: 0 },
  capacityM2,
});

/** Ves u východního okraje (195 m od středu okrajové buňky), hradiště 2 políčka na východ. */
const at: CampaignPlace = { cell: HOME, pos: { x: 760, z: 0 } };

function input(o: Partial<RefugeOptionsInput> = {}): RefugeOptionsInput {
  return {
    state: home(),
    day: DAY,
    village: at,
    grid: field().grid,
    seenAt: { cell: HOME, pos: { x: 760 - 1000, z: 0 } },
    sinceSeenTicks: 0,
    hosts: [host('lhota', { x: 2, y: 0 })],
    ...o,
  };
}

describe('hradiště (Otevřené 1)', () => {
  it('ves s hotovou palisádou s plochou je hradiště; bez opevnění ani rozestavěná ne', () => {
    const fort = palisade(true);
    const of = (forts: VillageState['fortifications']): RefugeHost | null =>
      refugeHostOf('lhota', village([], [], { fortifications: forts }), GEO, { x: 1, y: 0 }, DAY);
    const h = of([fort]);
    expect(h).not.toBeNull();
    expect(h!.villageId).toBe('lhota');
    expect(h!.capacityM2).toBeGreaterThan(0);
    expect(h!.cell).toEqual({ x: 1, y: 0 });
    expect(Math.abs(h!.center.x)).toBeLessThan(5);
    expect(Math.abs(h!.center.z)).toBeLessThan(5);
    expect(of([])).toBeNull();
    expect(of(undefined)).toBeNull();
    const unfinished = {
      ...fort,
      segments: fort.segments.map((s, i) => ({ ...s, builtDay: i === 0 ? null : 0 })),
    };
    expect(of([unfinished])).toBeNull();
    // dostavěné až po dni rozhodnutí – ještě není
    const later = { ...fort, segments: fort.segments.map((s) => ({ ...s, builtDay: DAY + 1 })) };
    expect(of([later])).toBeNull();
  });

  it('(a) pán bez opevněné vsi → „Pán nemá hradiště“ pro posla i oba útěky do hradiště', () => {
    const o = refugeOptions(input({ hosts: [] }));
    expect(o.host).toBeNull();
    expect(o.messenger.blocked).toBe('no-hillfort');
    expect(o.people.blocked).toBe('no-hillfort');
    expect(o.all.blocked).toBe('no-hillfort');
  });

  it('(d) dva kandidáti – bližší; shoda – menší id (nezávisle na pořadí)', () => {
    const near = host('zz-near', { x: 2, y: 0 });
    const far = host('aa-far', { x: 3, y: 0 });
    expect(refugeOptions(input({ hosts: [far, near] })).host!.villageId).toBe('zz-near');
    const mid: CampaignPlace = { cell: HOME, pos: { x: 0, z: 0 } };
    const east = host('b', { x: 2, y: 0 });
    const west = host('a', { x: -2, y: 0 });
    const tie = (hosts: RefugeHost[]): string =>
      refugeOptions(input({ village: mid, seenAt: { cell: { x: 0, y: 5 }, pos: mid.pos }, hosts }))
        .host!.villageId;
    expect(tie([east, west])).toBe('a');
    expect(tie([west, east])).toBe('a');
  });

  it('kandidát dál než refugeMaxCells políček nebo bez plochy se nepočítá', () => {
    const far = host('far', { x: WAR.alarm.refugeMaxCells + 1, y: 0 });
    expect(refugeOptions(input({ hosts: [far] })).host).toBeNull();
    expect(refugeOptions(input({ hosts: [host('x', { x: 2, y: 0 }, 0)] })).host).toBeNull();
  });
});

describe('odhady (Otevřené 2)', () => {
  it('cesta = vzdušná čára × 1,3 ÷ tempo; stádo poloviční tempo', () => {
    const foot = { onFoot: 5, riders: 0, woundedOnFoot: 0, herd: 0 };
    const from: CampaignPlace = { cell: HOME, pos: { x: 0, z: 0 } };
    const to: CampaignPlace = { cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } };
    const metres = 1920 * WAR.alarm.routeFactor;
    expect(flightEtaTicks(from, to, foot, DAY)).toBe(
      Math.ceil((metres / WAR.pace.metersPerSecond) * TICKS_PER_SECOND),
    );
    expect(flightEtaTicks(from, to, { ...foot, herd: 3 }, DAY)).toBe(
      Math.ceil((metres / (WAR.pace.metersPerSecond * WAR.pace.herd)) * TICKS_PER_SECOND),
    );
  });

  it('k okraji mapy ve směru dalšího políčka; úhlopříčně do rohu', () => {
    const foot = { onFoot: 1, riders: 0, woundedOnFoot: 0, herd: 0 };
    const edge = 960 - WAR.march.cellM / 2;
    const ticks = (m: number): number =>
      Math.ceil(((m * WAR.alarm.routeFactor) / WAR.pace.metersPerSecond) * TICKS_PER_SECOND);
    expect(leaveMapTicks({ x: 760, z: 300 }, { x: 1, y: 0 }, HOME, foot, DAY)).toBe(
      ticks(edge - 760),
    );
    expect(leaveMapTicks({ x: 0, z: 0 }, { x: 0, y: -1 }, HOME, foot, DAY)).toBe(ticks(edge));
    expect(leaveMapTicks({ x: 0, z: 0 }, { x: 1, y: 1 }, HOME, foot, DAY)).toBe(
      ticks(Math.sqrt(2 * edge * edge)),
    );
  });

  it('vojsko: vzdušná čára ÷ pěší tempo, bez násobku cesty', () => {
    const seen: CampaignPlace = { cell: HOME, pos: { x: -240, z: 0 } };
    expect(armyEtaTicks(seen, at, DAY)).toBe(
      Math.ceil((1000 / WAR.pace.metersPerSecond) * TICKS_PER_SECOND),
    );
  });

  it('(b) vojsko 1 km → jdou obě; 300 m → se vším pozdě, jen lidé jde; u domů → obě pozdě', () => {
    const far = refugeOptions(input());
    expect(far.host!.villageId).toBe('lhota');
    expect(far.people.blocked).toBeNull();
    expect(far.all.blocked).toBeNull();
    expect(far.all.etaTicks!).toBeGreaterThan(far.people.etaTicks!);
    expect(far.people.armyEtaTicks).toBe(far.all.armyEtaTicks);

    const near = refugeOptions(input({ seenAt: { cell: HOME, pos: { x: 460, z: 0 } } }));
    expect(near.all.blocked).toBe('too-late');
    expect(near.people.blocked).toBeNull();
    expect(near.all.leaveTicks!).toBeGreaterThanOrEqual(near.all.armyEtaTicks!);
    expect(near.people.leaveTicks!).toBeLessThan(near.people.armyEtaTicks!);

    const here = refugeOptions(input({ seenAt: at }));
    expect(here.people.blocked).toBe('too-late');
    expect(here.all.blocked).toBe('too-late');
    expect(here.people.armyEtaTicks).toBe(0);
  });

  it('čas od spatření se odečte od příchodu vojska', () => {
    const fresh = refugeOptions(input());
    const later = refugeOptions(input({ sinceSeenTicks: 900 }));
    expect(later.people.armyEtaTicks).toBe(fresh.people.armyEtaTicks! - 900);
    expect(later.all.blocked).toBe('too-late');
    const gone = refugeOptions(input({ sinceSeenTicks: 99_999 }));
    expect(gone.people.armyEtaTicks).toBe(0);
  });

  it('(c) trasa přes políčko, kde vojsko viděli → pozdě i s velkým náskokem', () => {
    const seen = { cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } };
    const o = refugeOptions(input({ seenAt: seen }));
    expect(o.people.blocked).toBe('too-late');
    expect(o.all.blocked).toBe('too-late');
    // vojsko jinde (na severu) – trasa na východ volná
    const north = refugeOptions(input({ seenAt: { cell: { x: 0, y: 1 }, pos: { x: 0, z: 0 } } }));
    expect(north.people.blocked).toBeNull();
    expect(north.route).toEqual([HOME, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('les: bez lesa „no-forest“, s lesem jde; lidé pryč blokují všechny útěky', () => {
    expect(refugeOptions(input()).forest.blocked).toBe('no-forest');
    const woods = refugeOptions(input({ grid: field([], (tx) => tx >= 85).grid }));
    expect(woods.forest.blocked).toBeNull();
    expect(woods.forest.etaTicks!).toBeGreaterThan(0);
    const fled = refugeOptions(input({ fled: true, grid: field([], (tx) => tx >= 85).grid }));
    expect(fled.forest.blocked).toBe('gone');
    expect(fled.people.blocked).toBe('gone');
    expect(fled.all.blocked).toBe('gone');
    const away = home({
      refuge: { refId: 'c:a0', campaignId: 'c', mode: 'forest', departedDay: DAY },
    });
    expect(refugeOptions(input({ state: away })).people.blocked).toBe('gone');
  });

  it('posel: už běží → „sent“; bez mužů → „no-runner“; eta podle běhu', () => {
    expect(refugeOptions(input({ messengerSent: true })).messenger.blocked).toBe('sent');
    const women = village([person(4, 28, 'female')], [house(1, 760)], { lastDay: DAY });
    expect(refugeOptions(input({ state: women })).messenger.blocked).toBe('no-runner');
    const o = refugeOptions(input());
    expect(o.messenger.blocked).toBeNull();
    expect(o.messenger.etaTicks!).toBeLessThan(o.people.etaTicks!);
  });
});

describe('co nesou (Otevřené 7)', () => {
  it('jen lidé – všichni přítomní bez zásob a dobytka, pěší tempo', () => {
    const load = flightLoad(home(), DAY, 'people');
    expect(load.people.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(load.people.find((p) => p.id === 1)).toMatchObject({ man: true, line: false });
    expect(load.people.find((p) => p.id === 6)!.man).toBe(false);
    expect(load.foodKg).toBe(0);
    expect(load.herd).toEqual({ sheep: 0, goat: 0, pig: 0, cow: 0 });
    expect(load.carts).toBe(0);
    expect(load.pace.herd).toBe(0);
  });

  it('se vším – dospělý 25 kg, dítě 10 kg, celé stádo; osivo zůstává', () => {
    const load = flightLoad(home(), DAY, 'all');
    expect(load.foodKg).toBe(5 * 25 + 10);
    expect(load.herd).toEqual({ sheep: 12, goat: 4, pig: 2, cow: 4 });
    expect(load.pace.herd).toBeGreaterThan(0);
    const seed = flightLoad(home({ storesKg: 100, reservedSeedKg: 60 }), DAY, 'all');
    expect(seed.foodKg).toBe(40);
    // zapečetěné jámy zůstávají ve vsi (Otevřené 7; Ú7 – odchod je ve vsi neodečte)
    const pits = flightLoad(
      home({
        storesKg: 100,
        reservedSeedKg: 20,
        grainPits: [
          {
            id: 9,
            x: 0,
            z: 0,
            capacityKg: 80,
            grainKg: 50,
            state: 'sealed',
            dugDay: 0,
            filledDay: 0,
          },
          { id: 8, x: 0, z: 0, capacityKg: 80, grainKg: 10, state: 'open', dugDay: 0 },
        ],
      }),
      DAY,
      'all',
    );
    expect(pits.foodKg).toBe(30);
  });

  it('(e) vůz se spřežením přidá 400 kg, vůz bez spřežení nic; les bez vozů', () => {
    const carts = {
      carts: [
        { id: 1, kind: 'four-wheel' as const, builtDay: 0 },
        { id: 2, kind: 'two-wheel' as const, builtDay: 0 },
      ],
      looseOxen: [{ trainedDay: 0 }],
    };
    const one = flightLoad(home(carts), DAY, 'all');
    expect(one.carts).toBe(1);
    expect(one.foodKg).toBe(135 + WAR.carryKg.cart);
    const three = flightLoad(
      home({ ...carts, looseOxen: [{ trainedDay: 0 }, { trainedDay: 0 }, { trainedDay: 0 }] }),
      DAY,
      'all',
    );
    expect(three.carts).toBe(2);
    expect(three.foodKg).toBe(135 + 2 * WAR.carryKg.cart);
    const calf = flightLoad(home({ ...carts, looseOxen: [{ trainedDay: DAY + 50 }] }), DAY, 'all');
    expect(calf.carts).toBe(0);
    const away = flightLoad(
      home({
        ...carts,
        trade: { expeditions: [{ carts: [2] }] } as unknown as VillageState['trade'],
      }),
      DAY,
      'all',
    );
    expect(away.carts).toBe(0);
    expect(flightLoad(home(carts), DAY, 'forest').carts).toBe(0);
    expect(flightLoad(home(carts), DAY, 'forest').foodKg).toBe(135);
  });

  it('kdo je pryč, nejde; raněný zpomalí', () => {
    const state = home();
    state.people[0] = { ...state.people[0]!, away: { kind: 'campaign', untilDay: DAY + 5 } };
    state.people[1] = { ...state.people[1]!, woundedUntil: DAY + 30 };
    const load = flightLoad(state, DAY, 'people');
    expect(load.people.map((p) => p.id)).toEqual([2, 3, 4, 5, 6]);
    expect(load.pace.woundedOnFoot).toBe(1);
  });
});

describe('posel (Otevřené 4)', () => {
  it('(g) nejmladší zdatný vesničan 16–44; bez něj muž rodu; raněný ani starý ne', () => {
    const lord = person(10, 35, 'male', { line: true });
    const people = [person(1, 30, 'male'), person(2, 20, 'male'), person(3, 50, 'male'), lord];
    expect(messengerOf(village(people), DAY)).toEqual({ personId: 2, mounted: false });
    const hurt = people.map((p) => (p.id === 2 ? { ...p, woundedUntil: DAY + 10 } : p));
    expect(messengerOf(village(hurt), DAY)!.personId).toBe(1);
    const old = [person(3, 50, 'male'), lord, person(4, 20, 'female')];
    expect(messengerOf(village(old), DAY)!.personId).toBe(10);
    expect(messengerOf(village([person(3, 50, 'male'), person(6, 12, 'male')]), DAY)).toBeNull();
    const awayLord = { ...lord, away: { kind: 'campaign' as const, untilDay: DAY + 3 } };
    expect(messengerOf(village([awayLord]), DAY)).toBeNull();
  });

  it('vesničan jde pěšky i s koněm ve vsi (Martin 9. 11. 2026: „Posel jde pěšky“)', () => {
    const horse = { id: 1, bornDay: DAY - 6 * 365, sex: 'male' as const, training: 0 };
    const people = [person(2, 20, 'male')];
    expect(messengerOf(village(people, undefined, { looseHorses: [horse] }), DAY)).toEqual({
      personId: 2,
      mounted: false,
    });
    expect(messengerSpeed(true, DAY)).toBeGreaterThan(messengerSpeed(false, DAY));
    expect(messengerSpeed(false, DAY)).toBe(WAR.pace.metersPerSecond * WAR.alarm.runFactor);
  });

  it('hráč vybere posla: muž rodu se svým jezdeckým koněm jede; bez koně, nepodkutý nebo vesničan pěšky', () => {
    const lord = person(10, 35, 'male', { line: true });
    const son = person(11, 17, 'male', { line: true });
    const people = [person(2, 20, 'male'), person(3, 50, 'male'), lord, son];
    const own = { id: 1, bornDay: DAY - 6 * 365, sex: 'male' as const, training: 0, riderId: 10 };
    const foal = { ...own, id: 2, bornDay: DAY - 100, riderId: 11 };
    const v = village(people, undefined, { looseHorses: [own, foal] });
    // výchozí (i za správce) – vesničan pěšky
    expect(messengerOf(v, DAY)).toEqual({ personId: 2, mounted: false });
    expect(messengerOf(v, DAY, 10)).toEqual({ personId: 10, mounted: true });
    // hříbě není jezdecký kůň
    expect(messengerOf(v, DAY, 11)).toEqual({ personId: 11, mounted: false });
    expect(messengerOf(v, DAY, 2)).toEqual({ personId: 2, mounted: false });
    // starý vesničan, žena, neznámý ani raněný muž rodu ne
    expect(messengerOf(v, DAY, 3)).toBeNull();
    expect(messengerOf(v, DAY, 99)).toBeNull();
    const hurt = village(
      people.map((p) => (p.id === 10 ? { ...p, woundedUntil: DAY + 10 } : p)),
      undefined,
      { looseHorses: [own] },
    );
    expect(messengerOf(hurt, DAY, 10)).toBeNull();
    // po termínu kování koně nejezdí (`isUnshod`)
    const pen = { id: 1, species: 'horse', horses: [own] } as never;
    const unshod = village(people, undefined, {
      pens: [pen],
      shoeing: { lastDay: DAY - 400 },
    } as Partial<VillageState>);
    const shod = village(people, undefined, {
      pens: [pen],
      shoeing: { lastDay: DAY - 1 },
    } as Partial<VillageState>);
    expect(messengerOf(shod, DAY, 10)).toEqual({ personId: 10, mounted: true });
    expect(messengerOf(unshod, DAY, 10)).toEqual({ personId: 10, mounted: false });
    // bez vesničana výchozí muž rodu – jede, umí-li
    expect(messengerOf(village([lord], undefined, { looseHorses: [own] }), DAY)).toEqual({
      personId: 10,
      mounted: true,
    });
  });
});

describe('volba správce (Otevřené 6)', () => {
  const opts = (o: Partial<RefugeOptionsInput> = {}): ReturnType<typeof refugeOptions> =>
    refugeOptions(input(o));

  it('(f) útěk + stihnou se vším → posel a „se vším“', () => {
    expect(stewardAlarmChoice(opts(), 'flee', false)).toEqual({ messenger: true, flee: 'all' });
  });

  it('nestihnou se vším → jen lidé; nestihnou vůbec → les', () => {
    const near = opts({ seenAt: { cell: HOME, pos: { x: 460, z: 0 } } });
    expect(stewardAlarmChoice(near, 'flee', false)).toEqual({ messenger: true, flee: 'people' });
    const woods = field([], (tx) => tx >= 85).grid;
    const here = opts({ seenAt: at, grid: woods });
    expect(stewardAlarmChoice(here, 'flee', false)).toEqual({ messenger: true, flee: 'forest' });
  });

  it('bránit se → jen posel; vlastní útočiště → jen posel', () => {
    expect(stewardAlarmChoice(opts(), 'defend', false)).toEqual({ messenger: true, flee: null });
    expect(stewardAlarmChoice(opts(), 'flee', true)).toEqual({ messenger: true, flee: null });
  });

  it('bez lesa a bez hradiště → nic', () => {
    expect(stewardAlarmChoice(opts({ hosts: [] }), 'flee', false)).toEqual({
      messenger: false,
      flee: null,
    });
  });
});
