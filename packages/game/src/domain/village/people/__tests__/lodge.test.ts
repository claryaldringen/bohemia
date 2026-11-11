import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import { advanceVillage } from '../../core/simulate';
import { villagersToday } from '../../core/morning-water';
import { LODGE, MASON_CRAFTS, MASTER_NAMES } from '../../rules';
import type { VillageState } from '../../types';
import { DAY, dwelling, kin, trackedVillage, village } from '../../__tests__/kin-fixtures';
import {
  arriveFromAbroad,
  canInviteLodge,
  canInviteMaster,
  inviteLodge,
  inviteMaster,
  isLodgeIdle,
  lodgeArrivalsDay,
} from '../lodge';

// Stavební huť – pozvání a příchod mistrů (stone-masonry.md – Stavební huť).

/** Ves rodu s vojvodou (pokřtěný rod) a volnými obydlími 2 a 3. */
function baptized(extra: Partial<VillageState> = {}): VillageState {
  return trackedVillage([{ id: 10, age: 40, sex: 'male' }], undefined, {
    faith: { rodBaptizedDay: DAY - 100 },
    storesKg: 100000,
    ...extra,
  });
}

describe('canInviteLodge', () => {
  it('nepokřtěný rod huť nepozve', () => {
    const state = trackedVillage([{ id: 10, age: 40, sex: 'male' }]);
    expect(canInviteLodge(state, DAY)).toBe('not-baptized');
  });

  it('pokřtěný rod s vojvodou smí; po pozvání už ne', () => {
    const state = baptized();
    expect(canInviteLodge(state, DAY)).toBe('ok');
    expect(canInviteLodge(inviteLodge(state, 'adriatic', DAY), DAY)).toBe('already');
  });

  it('ves bez vojvody huť nepozve', () => {
    const state = baptized({ dynasty: { lordId: null, lords: [{ id: 1, fromDay: 0 }] } });
    expect(canInviteLodge(state, DAY)).toBe('no-lord');
  });
});

describe('inviteLodge a inviteMaster', () => {
  it('pozvání zapíše pět mistrů na cestě na den + příchod', () => {
    const state = baptized();
    const next = inviteLodge(state, 'carolingian', DAY);
    expect(state.lodge).toBeUndefined();
    expect(next.lodge?.circle).toBe('carolingian');
    expect(next.lodge?.arriving?.map((a) => a.role)).toEqual(MASON_CRAFTS);
    expect(next.lodge?.arriving?.every((a) => a.day === DAY + LODGE.arrivalDays)).toBe(true);
  });

  it('mistra pozve jen chybějícího oboru stejného okruhu', () => {
    const state = baptized();
    expect(canInviteMaster(state, 'mason')).toBe('no-lodge');
    const invited = inviteLodge(state, 'adriatic', DAY);
    expect(canInviteMaster(invited, 'mason')).toBe('present');
    const arrived = { ...invited, lodge: { circle: 'adriatic' as const, invitedDay: DAY } };
    expect(canInviteMaster(arrived, 'mason')).toBe('ok');
    const again = inviteMaster(arrived, 'mason', DAY + 5);
    expect(again.lodge?.arriving).toEqual([{ role: 'mason', day: DAY + 5 + LODGE.arrivalDays }]);
    expect(inviteMaster(again, 'mason', DAY + 6)).toBe(again);
  });
});

describe('arriveFromAbroad', () => {
  const random = createRandom(7);

  it('mistr je svobodný křesťan s jménem okruhu a věkem z LODGE.masterAge', () => {
    const state = inviteLodge(baptized(), 'adriatic', DAY);
    const next = arriveFromAbroad(state, 'stonemason', DAY, random);
    const master = next.people.find((p) => p.mason === 'stonemason')!;
    expect(MASTER_NAMES.adriatic).toContain(master.name);
    expect(master.sex).toBe('male');
    expect(master.faith).toBe('christian');
    expect(master.spouseId).toBeUndefined();
    const age = (DAY - master.bornDay) / 365.25;
    expect(age).toBeGreaterThanOrEqual(LODGE.masterAge.min);
    expect(age).toBeLessThan(LODGE.masterAge.max + 1);
    expect(state.people.some((p) => p.mason)).toBe(false);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'newcomer', people: 1 });
  });

  it('karolinský okruh dává bavorská jména, kněz je bez jména', () => {
    const state = inviteLodge(baptized(), 'carolingian', DAY);
    const next = arriveFromAbroad(
      arriveFromAbroad(state, 'builder', DAY, random),
      'priest',
      DAY,
      random,
    );
    expect(MASTER_NAMES.carolingian).toContain(next.people.find((p) => p.mason)!.name);
    const priest = next.people.find((p) => p.priest)!;
    expect(priest.name).toBeUndefined();
    expect(isLodgeIdle(priest)).toBe(true);
  });

  it('volné obydlí dostane mistr do vlastní domácnosti', () => {
    const state = inviteLodge(baptized(), 'adriatic', DAY);
    const next = arriveFromAbroad(state, 'mason', DAY, random);
    const master = next.people.find((p) => p.mason)!;
    expect(master.dwellingId).toBe(2);
    expect(next.displaced).toBeUndefined();
  });

  it('bez volného obydlí je host ve dvorci a nové obydlí osídlí přednostně', () => {
    const people = [
      kin({ id: 10, age: 40, sex: 'male', home: 1 }),
      kin({ id: 11, age: 40, sex: 'male', home: 2 }),
    ];
    const state = {
      ...village(people, [dwelling(1), dwelling(2)], {
        manorId: 1,
        faith: { rodBaptizedDay: DAY - 100 },
        lodge: { circle: 'adriatic' as const, invitedDay: DAY - 60 },
      }),
    };
    const next = arriveFromAbroad(state, 'mason', DAY, random);
    const master = next.people.find((p) => p.mason)!;
    expect(master.dwellingId).toBe(1);
    expect(next.displaced).toEqual([
      { household: 1, day: DAY, people: [{ id: master.id, host: 1 }] },
    ]);
    // nové obydlí: master se do něj nastěhuje dřív než rodina čekající na dům
    const built = { ...next, dwellings: [...next.dwellings, dwelling(3)] };
    const later = advanceVillage(built, DAY + 1, null, null);
    expect(later.people.find((p) => p.id === master.id)!.dwellingId).toBe(3);
  });

  it('ves bez obydlí nikoho nepřijme', () => {
    const state = village([], [], { lodge: { circle: 'adriatic', invitedDay: 0 } });
    expect(arriveFromAbroad(state, 'mason', DAY, random)).toBe(state);
  });
});

describe('lodgeArrivalsDay', () => {
  it('zpracuje jen mistry s termínem do dneška', () => {
    const state = inviteLodge(baptized(), 'adriatic', DAY);
    const early = structuredClone(state);
    lodgeArrivalsDay(early, DAY + LODGE.arrivalDays - 1);
    expect(early.people.some((p) => p.mason)).toBe(false);
    const due = structuredClone(state);
    lodgeArrivalsDay(due, DAY + LODGE.arrivalDays);
    expect(due.people.filter((p) => p.mason).map((p) => p.mason)).toEqual(MASON_CRAFTS);
    expect(due.lodge?.arriving).toBeUndefined();
  });
});

describe('simulace dne s huť', () => {
  const TO = DAY + LODGE.arrivalDays + 10;
  const state = inviteLodge(baptized(), 'adriatic', DAY);

  it('po 60 dnech je ve vsi pět mistrů, kteří se vsí nepracují', () => {
    const after = advanceVillage(state, TO, null, null);
    const masters = after.people.filter((p) => p.mason);
    expect(masters.map((m) => m.mason).sort()).toEqual([...MASON_CRAFTS].sort());
    const { villagers } = villagersToday(after, after.lastDay, new Set());
    expect(villagers.some(isLodgeIdle)).toBe(false);
    expect(villagers.length).toBeLessThanOrEqual(after.people.length - 5);
  });

  it('vcelku = po kouscích přes den příchodu', () => {
    const whole = advanceVillage(state, TO, null, null);
    let chunked = state;
    for (const end of [DAY + 30, DAY + LODGE.arrivalDays - 1, DAY + LODGE.arrivalDays, TO]) {
      chunked = advanceVillage(chunked, end, null, null);
    }
    expect(chunked).toEqual(whole);
  });

  it('ves bez huti simuluje stejně (žádný stav huti)', () => {
    const plain = advanceVillage(baptized(), TO, null, null);
    expect(plain.lodge).toBeUndefined();
    expect(plain.displaced).toBeUndefined();
  });
});
