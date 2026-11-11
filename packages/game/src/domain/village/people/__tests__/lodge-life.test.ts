import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import { LODGE } from '../../rules';
import type { MasonCraft, Person, VillageState } from '../../types';
import { DAY, dwelling, kin, village } from '../../__tests__/kin-fixtures';
import { arrangeMarriages } from '../marriage';
import { lodgeLeavingDay, lodgeLifeDay, masonApprentices, promoteMasters } from '../lodge-life';
import { canInviteMaster } from '../lodge';

// Odchod mistrů huti a noví mistři (stone-masonry.md – Svoboda, rodina a odchod).

function master(id: number, craft: MasonCraft, home: number, extra: Partial<Person> = {}): Person {
  return { ...kin({ id, age: 30, sex: 'male', home }), mason: craft, name: 'Petrus', ...extra };
}

/** Ves s huť a mistry. */
function lodgeVillage(people: Person[], seed = 1, lodgeExtra = {}): VillageState {
  return village(people, [dwelling(1), dwelling(2), dwelling(3)], {
    seed,
    storesKg: 100000,
    happiness: { value: 60, deaths: [], toil: [] },
    lodge: { circle: 'adriatic', invitedDay: DAY - 100, ...lodgeExtra },
  });
}

const HUNGRY = LODGE.leaving.hungryDays;

describe('lodgeLeavingDay', () => {
  it('počítá hladové dny a po 30. dni svobodný mistr odejde', () => {
    const state = lodgeVillage([kin({ id: 1, age: 40, sex: 'male' }), master(5, 'mason', 2)]);
    for (let i = 0; i < HUNGRY - 1; i++) lodgeLeavingDay(state, 0.5, DAY + i);
    expect(state.people.some((p) => p.id === 5)).toBe(true);
    expect(state.lodge?.hungryDays).toBe(HUNGRY - 1);
    lodgeLeavingDay(state, 0.5, DAY + HUNGRY);
    expect(state.people.some((p) => p.id === 5)).toBe(false);
    expect(state.lodge?.hungryDays).toBeUndefined();
    expect(state.chronicle.at(-1)).toMatchObject({
      kind: 'master-left',
      craft: 'mason',
      people: 1,
    });
  });

  it('sytost nad mezí počítadlo vynuluje', () => {
    const state = lodgeVillage([master(5, 'mason', 2)], 1, { hungryDays: 20 });
    lodgeLeavingDay(state, 1, DAY);
    expect(state.lodge?.hungryDays).toBeUndefined();
  });

  it('nízké štěstí 60 dní vyžene svobodného mistra', () => {
    const state = lodgeVillage([kin({ id: 1, age: 40, sex: 'male' }), master(5, 'mason', 2)]);
    state.happiness = { value: 10, deaths: [], toil: [] };
    for (let i = 0; i < LODGE.leaving.unhappyDays; i++) lodgeLeavingDay(state, 1, DAY + i);
    expect(state.people.map((p) => p.id)).toEqual([1]);
  });

  it('ženatý s dětmi zůstane zhruba ve 3 ze 4 losů a odchází celá domácnost', () => {
    let stayed = 0;
    const seeds = 400;
    for (let seed = 1; seed <= seeds; seed++) {
      const state = lodgeVillage(
        [
          master(5, 'mason', 2, { spouseId: 6 }),
          { ...kin({ id: 6, age: 28, sex: 'female', home: 2 }), spouseId: 5 },
          kin({ id: 7, age: 5, sex: 'male', home: 2, father: 5, mother: 6 }),
          kin({ id: 8, age: 40, sex: 'male', home: 1 }),
        ],
        seed,
        { hungryDays: HUNGRY - 1 },
      );
      lodgeLeavingDay(state, 0.5, DAY + seed);
      if (state.people.some((p) => p.id === 5)) {
        stayed++;
        expect(state.people).toHaveLength(4);
        // mistr, který zůstal, dostane další los až po další mezi
        expect(state.lodge?.hungryDays).toBeUndefined();
      } else {
        expect(state.people.map((p) => p.id)).toEqual([8]);
        expect(state.chronicle.at(-1)).toMatchObject({ kind: 'master-left', people: 3 });
      }
    }
    expect(stayed / seeds).toBeGreaterThan(0.68);
    expect(stayed / seeds).toBeLessThan(0.82);
  });

  it('bez mistrů ve vsi se počítadla nevedou', () => {
    const state = lodgeVillage([kin({ id: 1, age: 40, sex: 'male' })], 1, { hungryDays: 29 });
    lodgeLeavingDay(state, 0.1, DAY);
    expect(state.lodge?.hungryDays).toBeUndefined();
  });

  it('ves bez huti nic nepočítá a nelosuje', () => {
    const state = village([master(5, 'mason', 2)]);
    const before = structuredClone(state);
    lodgeLifeDay(state, 0, DAY);
    expect(state).toEqual(before);
  });
});

describe('promoteMasters', () => {
  /** Mistr stavbyvedoucí zemřel; pomocník Jan s `xp` čd v oboru. */
  function afterDeath(xp: number, lodgeExtra: object = {}): VillageState {
    const helper: Person = {
      ...kin({ id: 9, age: 30, sex: 'male', home: 1 }),
      masonryXp: { builder: xp },
    };
    return lodgeVillage(
      [kin({ id: 1, age: 40, sex: 'male' }), helper, master(5, 'mason', 2)],
      1,
      lodgeExtra,
    );
  }

  it('pomocník s 650 čd se stane mistrem oboru bez mistra', () => {
    const state = afterDeath(650);
    promoteMasters(state, DAY);
    expect(state.people.find((p) => p.id === 9)?.mason).toBe('builder');
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'master-promoted', craft: 'builder' });
  });

  it('s 500 čd nikdo; vojvoda smí pozvat chybějícího mistra', () => {
    const state = afterDeath(500);
    promoteMasters(state, DAY);
    expect(state.people.some((p) => p.id === 9 && p.mason)).toBe(false);
    expect(canInviteMaster(state, 'builder')).toBe('ok');
  });

  it('nejvyšší zkušenost vítězí, při shodě nižší id; nezletilí a mistři ne', () => {
    const state = afterDeath(700);
    state.people.push(
      { ...kin({ id: 8, age: 30, sex: 'male', home: 1 }), masonryXp: { builder: 700 } },
      { ...kin({ id: 4, age: 12, sex: 'male', home: 1 }), masonryXp: { builder: 900 } },
      { ...master(6, 'mason', 3), masonryXp: { builder: 999 } },
    );
    promoteMasters(state, DAY);
    expect(state.people.filter((p) => p.mason === 'builder').map((p) => p.id)).toEqual([8]);
  });

  it('mistr na cestě obor obsazuje', () => {
    const state = afterDeath(650, { arriving: [{ role: 'builder', day: DAY + 20 }] });
    promoteMasters(state, DAY);
    expect(state.people.some((p) => p.id === 9 && p.mason)).toBe(false);
  });

  it('kněz se mistrem nestane', () => {
    const state = afterDeath(650);
    state.people.find((p) => p.id === 9)!.priest = true;
    promoteMasters(state, DAY);
    expect(state.people.some((p) => p.id === 9 && p.mason)).toBe(false);
  });
});

describe('masonApprentices', () => {
  it('synové v domácnosti mistra od 12 let', () => {
    const m = master(5, 'mason', 2);
    const state = lodgeVillage([
      m,
      kin({ id: 7, age: 12, sex: 'male', home: 2, father: 5 }),
      kin({ id: 8, age: 11, sex: 'male', home: 2, father: 5 }),
      kin({ id: 9, age: 15, sex: 'female', home: 2, father: 5 }),
      kin({ id: 10, age: 15, sex: 'male', home: 3, father: 5 }),
    ]);
    expect(masonApprentices(state, m, DAY).map((p) => p.id)).toEqual([7]);
  });
});

describe('sňatek mistra', () => {
  it('svobodný mistr se žení jako ostatní svobodní', () => {
    const state = village(
      [
        master(5, 'mason', 2),
        kin({ id: 6, age: 22, sex: 'female', home: 3 }),
        kin({ id: 8, age: 40, sex: 'male', home: 1 }),
      ],
      [dwelling(1), dwelling(2), dwelling(3)],
      { lodge: { circle: 'adriatic', invitedDay: 0 } },
    );
    let married = false;
    for (let d = 0; d < 400 && !married; d++) {
      arrangeMarriages(state, DAY + d);
      married = state.people.find((p) => p.id === 5)?.spouseId !== undefined;
    }
    expect(married).toBe(true);
  });
});

describe('simulace dne', () => {
  const people = (): Person[] => [
    kin({ id: 1, age: 40, sex: 'male' }),
    master(5, 'mason', 2),
    master(6, 'builder', 3),
    { ...kin({ id: 9, age: 30, sex: 'male', home: 1 }), masonryXp: { builder: 650, mason: 650 } },
  ];

  it('hladová ves přijde o mistra; vcelku = po kouscích', () => {
    const state = lodgeVillage(people());
    state.storesKg = 0;
    const to = DAY + 60;
    const whole = advanceVillage(state, to, null, null);
    let chunked = state;
    for (const end of [DAY + 7, DAY + 31, DAY + 32, DAY + 45, to]) {
      chunked = advanceVillage(chunked, end, null, null);
    }
    expect(chunked).toEqual(whole);
    expect(whole.chronicle.some((e) => e.kind === 'master-left')).toBe(true);
  });

  it('smrt mistra ve vsi s pomocníkem dá nového mistra (simulace dne)', () => {
    const state = lodgeVillage(people());
    state.people = state.people.filter((p) => p.id !== 5);
    const after = advanceVillage(state, DAY + 2, null, null);
    expect(after.people.find((p) => p.id === 9)?.mason).toBe('mason');
  });
});
