import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import {
  appointCandidate,
  departAppointee,
  settleAppointee,
  withAwaitingLord,
  type AppointeeParty,
} from '../appoint-lord';
import { succeedLord } from '../succession';
import type { VillageEvent } from '../inbox';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { DAY, dwelling, kin, trackedVillage, village, type KinSpec } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Dosazení vojvody do vsi bez muže rodu (seniorate.md – Ves bez muže rodu – dosazení vojvody).

/** Ves rodu s vojvodou 10 a jeho syny (příznak rodu mají vojvoda a jeho synové). */
function lordVillage(extra: KinSpec[] = []): VillageState {
  return trackedVillage([{ id: 10, age: 50, sex: 'male' }, ...extra]);
}

describe('appointCandidate', () => {
  const waiting = village([], [dwelling(1)], {
    dynasty: { lordId: null, lords: [{ id: 1, fromDay: 0 }] },
  });

  it('vybere nejstaršího muže rodu od 16 let, který není vojvodou ani nástupcem', () => {
    const state = lordVillage([
      { id: 11, age: 25, sex: 'male', father: 10 },
      { id: 12, age: 22, sex: 'male', father: 10 },
      { id: 13, age: 15, sex: 'male', father: 10 },
    ]);
    // 11 je nástupce, 10 vojvoda, 13 je moc mladý
    const found = appointCandidate(
      [
        { villageId: 'a', state: waiting },
        { villageId: 'b', state },
      ],
      'a',
      DAY,
      [],
    );
    expect(found).toEqual({ villageId: 'b', personId: 12 });
  });

  it('nevybere hráčova muže; při shodě stáří nižší id osoby, pak vsi', () => {
    const mk = (): VillageState =>
      lordVillage([
        { id: 11, age: 30, sex: 'male', father: 10 },
        { id: 12, age: 22, sex: 'male', father: 10 },
        { id: 14, age: 22, sex: 'male', father: 10 },
      ]);
    const villages = [
      { villageId: 'a', state: waiting },
      { villageId: 'c', state: mk() },
      { villageId: 'b', state: mk() },
    ];
    expect(appointCandidate(villages, 'a', DAY, [])).toEqual({ villageId: 'b', personId: 12 });
    expect(appointCandidate(villages, 'a', DAY, [{ villageId: 'b', personId: 12 }])).toEqual({
      villageId: 'c',
      personId: 12,
    });
  });

  it('bez vhodného muže (jen vojvoda a nástupce, nebo jen vlastní ves) vrátí null', () => {
    const state = lordVillage([{ id: 11, age: 25, sex: 'male', father: 10 }]);
    expect(appointCandidate([{ villageId: 'b', state }], 'a', DAY, [])).toBeNull();
    expect(appointCandidate([{ villageId: 'a', state }], 'a', DAY, [])).toBeNull();
  });

  it('nevybere muže z vymřelé či opuštěné vsi', () => {
    const state = lordVillage([
      { id: 11, age: 25, sex: 'male', father: 10 },
      { id: 12, age: 22, sex: 'male', father: 10 },
    ]);
    const dead = { ...state, abandonedDay: DAY - 5 };
    expect(appointCandidate([{ villageId: 'b', state: dead }], 'a', DAY, [])).toBeNull();
  });
});

/** Ves s mužem 12 (ženatý, dvě ženy, dítě, dospělá svobodná dcera, cizí dítě) a zásobami. */
function sourceVillage(): VillageState {
  const state = lordVillage([
    { id: 11, age: 28, sex: 'male', father: 10 },
    { id: 12, age: 40, sex: 'male', father: 10, spouse: 20 },
    { id: 20, age: 36, sex: 'female', spouse: 12 },
    { id: 21, age: 30, sex: 'female', spouse: 12 },
    { id: 22, age: 10, sex: 'male', father: 12, mother: 20 },
    { id: 23, age: 3, sex: 'female', father: 12, mother: 21 },
    { id: 30, age: 20, sex: 'female' },
  ]);
  state.storesKg = 1000;
  state.meatKg = 100;
  state.people.find((p) => p.id === 12)!.line = true;
  state.people.find((p) => p.id === 12)!.name = 'Bořivoj';
  return state;
}

describe('departAppointee', () => {
  it('vezme muže, manželky a svobodné děti s jídlem 25 kg na člověka od 7 let; stav nemění', () => {
    const state = sourceVillage();
    const before = JSON.stringify(state);
    const { state: next, party } = departAppointee(state, DAY, 12, 'Lhota');
    expect(JSON.stringify(state)).toBe(before);
    expect(party.people.map((p) => p.id).sort((a, b) => a - b)).toEqual([12, 20, 21, 22, 23]);
    expect(party.manId).toBe(12);
    // 3 nosiči (muž, dvě ženy) + chlapec 10 let = 4 × 25 kg, z každé zásoby poměrně
    const total = Object.values(party.food).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(next.storesKg).toBeCloseTo(1000 - party.food.grainKg, 5);
    expect(next.meatKg).toBeCloseTo(100 - party.food.meatKg, 5);
    expect(next.people.map((p) => p.id)).toEqual([10, 11, 30]);
    expect(next.chronicle.at(-1)).toEqual({
      day: DAY,
      kind: 'lord-sent',
      villageName: 'Lhota',
      name: 'Bořivoj',
    });
  });

  it('muž, který ve vsi není, RangeError', () => {
    expect(() => departAppointee(sourceVillage(), DAY, 99, 'Lhota')).toThrow(RangeError);
  });
});

/** Ves bez muže rodu s dvorcem 1 a obyvateli (ženou). */
function lordlessVillage(): VillageState {
  return village([kin({ id: 1, age: 30, sex: 'female', home: 2 })], [dwelling(1), dwelling(2)], {
    manorId: 1,
    nextId: 500,
    storesKg: 10,
    dynasty: { lordId: null, lords: [{ id: 7, fromDay: 0, toDay: DAY - 10 }], endedDay: DAY - 10 },
    awaitingLord: { sinceDay: DAY - 10 },
  });
}

function party(): AppointeeParty {
  return departAppointee(sourceVillage(), DAY, 12, 'Lhota').party;
}

describe('settleAppointee', () => {
  it('nová id, nastěhování do dvorce, vojvoda, konec čekání, kronika', () => {
    const state = lordlessVillage();
    const p = party();
    const events = settleAppointee(state, DAY + 4, p);
    expect(events).toEqual([{ day: DAY + 4, kind: 'lord', name: 'Bořivoj' }]);
    expect(state.nextId).toBe(505);
    const ids = state.people.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const man = state.people.find((x) => x.name === 'Bořivoj')!;
    expect(man.id).toBe(500);
    expect(state.dynasty).toMatchObject({ lordId: 500 });
    expect(state.dynasty?.endedDay).toBeUndefined();
    expect(state.dynasty?.lords.at(-1)).toEqual({ id: 500, name: 'Bořivoj', fromDay: DAY + 4 });
    expect(state.awaitingLord).toBeUndefined();
    // celá rodina bydlí v dvorci a vazby ukazují na nová id
    const arrived = state.people.filter((x) => x.id >= 500);
    expect(arrived).toHaveLength(5);
    expect(arrived.every((x) => x.dwellingId === 1)).toBe(true);
    const wives = arrived.filter((x) => x.sex === 'female' && x.spouseId === man.id);
    expect(wives).toHaveLength(2);
    const boy = arrived.find((x) => x.sex === 'male' && x.id !== man.id)!;
    expect(boy.fatherId).toBe(man.id);
    expect(wives.map((w) => w.id)).toContain(boy.motherId);
    // rodiče mimo družinu se nepřenášejí (patří jiné vsi)
    expect(man.fatherId).toBeUndefined();
    expect(state.storesKg).toBeCloseTo(10 + p.food.grainKg, 5);
  });

  it('ves, která už vojvodu má, družinu jen přijme (kronika line-arrived)', () => {
    const state = lordVillage();
    state.nextId = 500;
    const events = settleAppointee(state, DAY, party());
    expect(events).toEqual([{ day: DAY, kind: 'line-arrived', name: 'Bořivoj' }]);
    expect(state.dynasty?.lordId).toBe(10);
    expect(state.people.filter((x) => x.id >= 500)).toHaveLength(5);
  });

  it('družinu nesdílí se vstupem (hluboká kopie)', () => {
    const p = party();
    const before = JSON.stringify(p);
    settleAppointee(lordlessVillage(), DAY, p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('čekání vsi na vojvodu', () => {
  it('smrt posledního muže rodu začne čekání', () => {
    const state = trackedVillage([{ id: 10, age: 50, sex: 'male' }]);
    state.people = [];
    succeedLord(state, DAY);
    expect(state.dynasty?.lordId).toBeNull();
    expect(state.awaitingLord).toEqual({ sinceDay: DAY });
    // opakovaný krok den nezmění
    succeedLord(state, DAY + 1);
    expect(state.awaitingLord).toEqual({ sinceDay: DAY });
  });

  it('starší ves bez vojvody se převede jednou a idempotentně; ostatní beze změny', () => {
    const old = lordlessVillage();
    delete old.awaitingLord;
    const once = withAwaitingLord(old);
    expect(once.awaitingLord).toEqual({ sinceDay: DAY - 10 });
    expect(withAwaitingLord(once)).toBe(once);
    const living = lordVillage();
    expect(withAwaitingLord(living)).toBe(living);
  });
});

describe('příjezd ve schránce – dopočet po kouscích', () => {
  /** Ves založená hrou, ale bez muže rodu: čeká na vojvodu. */
  function waitingVillage(): VillageState {
    const state = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: 200, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    for (const p of state.people) delete p.line;
    state.dynasty = {
      lordId: null,
      lords: [{ id: 1, fromDay: 200, toDay: 200 }],
      endedDay: 200,
    };
    state.awaitingLord = { sinceDay: 200 };
    return state;
  }
  const start = waitingVillage();
  const end = start.lastDay + 20;
  const man: Person = { ...kin({ id: 3, age: 30, sex: 'male' }, start.lastDay), line: true };
  man.name = 'Bořivoj';
  const arriving: AppointeeParty = {
    manId: 3,
    people: [man],
    food: { grainKg: 25, meatKg: 0, cheeseKg: 0, legumesKg: 0, applesKg: 0 },
  };
  const events: VillageEvent[] = [
    {
      id: 'e1',
      villageId: 'v1',
      day: start.lastDay + 6,
      seq: 1,
      body: { kind: 'lord-arrives', party: arriving, fromVillageId: 'x' },
    },
  ];
  const whole = advanceVillage(start, end, null, null, events);

  it('příjezd udělá z muže vojvodu právě v den příjezdu', () => {
    expect(whole.dynasty?.lordId).not.toBeNull();
    expect(whole.awaitingLord).toBeUndefined();
    expect(whole.chronicle.find((e) => e.kind === 'lord')).toMatchObject({
      day: start.lastDay + 6,
      name: 'Bořivoj',
    });
  });

  it.each([1, 3, 10])('po kouscích po %i dnech = vcelku (stejný JSON)', (size) => {
    let chunked = waitingVillage();
    while (chunked.lastDay < end) {
      const to = Math.min(end, chunked.lastDay + size);
      const day = chunked.lastDay;
      chunked = advanceVillage(
        chunked,
        to,
        null,
        null,
        events.filter((e) => e.day > day && e.day <= to),
      );
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });
});
