import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  abandonForLineEnd,
  abandonedVillageAt,
  isVillageAsleep,
  isVillageDormant,
} from '../departure';
import { NO_DYNASTY } from '../dynasty';
import { isGameOver, isLineExtinct, lineEndDay, lineEndWhere } from '../extinction';
import { removePeople } from '../kinship';
import { advanceVillage } from '../simulate';
import { succeedLord } from '../succession';
import type { Person, VillageState } from '../types';
import { DAY, trackedVillage } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Konec rodu (lord.md – Konec rodu; Martin 24. 10. 2026: „Pokud rod po meči zcela vymře, hra
// končí.“). Vojvoda 10, hlavní manželka 11, dvorec je obydlí 1.

/** Sledovaná ves – vojvoda 10 s manželkou 11, `extra` další lidé. */
function lordVillage(extra: Parameters<typeof trackedVillage>[0] = []): VillageState {
  return trackedVillage([
    { id: 10, age: 40, sex: 'male', spouse: 11 },
    { id: 11, age: 35, sex: 'female', spouse: 10 },
    ...extra,
  ]);
}

/** Zemřeli `ids` (kinship – `removePeople`) a proběhl krok nástupnictví dne `day`. */
function die(s: VillageState, ids: number[], day: number): ReturnType<typeof succeedLord> {
  removePeople(s, new Set(ids));
  return succeedLord(s, day);
}

describe('konec rodu ve vsi (succeedLord)', () => {
  it('po smrti posledního muže rodu – i dítěte – ves zapíše den a jméno posledního', () => {
    const s = lordVillage([{ id: 20, age: 2, sex: 'male', mother: 11, father: 10 }]);
    s.dynasty!.lords[0]!.name = 'Bořivoj';
    expect(die(s, [10], DAY + 1).map((e) => e.kind)).toEqual(['lord']);
    expect(s.dynasty?.lordId).toBe(20);
    s.people.find((p) => p.id === 20)!.name = 'Ctibor';
    s.dynasty!.lords[1]!.name = 'Ctibor';
    expect(s.dynasty?.endedDay).toBeUndefined();
    expect(die(s, [20], DAY + 9)).toEqual([{ day: DAY + 9, kind: 'line-ended', name: 'Ctibor' }]);
    expect(s.dynasty).toMatchObject({ lordId: null, endedDay: DAY + 9 });
    expect(s.dynasty?.lords.map((l) => l.toDay)).toEqual([DAY + 1, DAY + 9]);
    // další dny už nic nezapíšou
    expect(succeedLord(s, DAY + 10)).toEqual([]);
    expect(s.dynasty?.endedDay).toBe(DAY + 9);
  });

  it('ženy rodu rod nedrží', () => {
    const s = lordVillage([{ id: 21, age: 15, sex: 'female', mother: 11, father: 10 }]);
    expect(die(s, [10], DAY + 3)).toEqual([{ day: DAY + 3, kind: 'line-ended' }]);
    expect(s.dynasty?.endedDay).toBe(DAY + 3);
  });

  it('ves bez rodu nic nezapisuje', () => {
    const s = lordVillage();
    s.dynasty = { lordId: null, lords: [] };
    expect(die(s, [10], DAY + 3)).toEqual([]);
    expect(s.dynasty.endedDay).toBeUndefined();
  });
});

describe('konec hry vymřením rodu', () => {
  const ended = (): VillageState => {
    const s = lordVillage();
    die(s, [10], DAY + 5);
    return s;
  };

  it('ves s lidmi, ale bez muže rodu hru ukončí; den konce je poslední smrt', () => {
    const a = ended();
    expect(a.people).toHaveLength(1);
    expect(isLineExtinct([a])).toBe(true);
    expect(isGameOver([a])).toBe(true);
    const b = lordVillage();
    die(b, [10], DAY + 30);
    expect(lineEndDay([a, b])).toBe(DAY + 30);
    expect(lineEndDay([lordVillage()])).toBeUndefined();
  });

  it('stará ves bez endedDay – den konce z extinctDay / abandonedDay, endedDay má přednost', () => {
    const old = lordVillage();
    old.people = [];
    old.extinctDay = DAY + 40;
    const gone = lordVillage();
    gone.people = [];
    gone.abandonedDay = DAY + 50;
    expect(isGameOver([old, gone])).toBe(true);
    expect(lineEndDay([old, gone])).toBe(DAY + 50);
    expect(lineEndWhere([old, gone])).toEqual({ index: 1, day: DAY + 50 });
    const a = ended();
    expect(lineEndDay([old, a])).toBe(DAY + 5);
  });

  it('putující ves s mužem rodu hru neukončí, víc vsí s různým endedDay – nejpozdější', () => {
    const travelling = lordVillage();
    travelling.journey = {
      arrivalDay: DAY + 9,
    } as unknown as VillageState['journey'];
    expect(isLineExtinct([ended(), travelling])).toBe(false);
    const b = lordVillage();
    die(b, [10], DAY + 2);
    expect(lineEndDay([ended(), b])).toBe(DAY + 5);
  });

  it('rod v druhé vsi hru drží', () => {
    expect(isLineExtinct([ended(), lordVillage()])).toBe(false);
    expect(isGameOver([ended(), lordVillage()])).toBe(false);
  });

  it('ves bez rodu i ves před převodem končí jen vymřením', () => {
    const without = lordVillage();
    without.dynasty = { ...NO_DYNASTY, lords: [] };
    const before = lordVillage();
    delete before.dynasty;
    expect(isLineExtinct([without, before])).toBe(false);
    expect(isGameOver([without])).toBe(false);
    expect(isGameOver([before])).toBe(false);
  });
});

describe('ves opuštěná – rod vymřel (abandonForLineEnd)', () => {
  it('lidé zůstanou jako záznam, ves se dál nedopočítává, vstup se nemění', () => {
    const s = lordVillage([{ id: 30, age: 30, sex: 'male', home: 2 }]);
    die(s, [10], DAY + 5);
    s.lastDay = DAY + 40;
    const before = structuredClone(s);
    const next = abandonForLineEnd(s, DAY + 5);
    expect(s).toEqual(before);
    expect(next.abandonedDay).toBe(DAY + 5);
    expect(next.people).toEqual(s.people);
    expect(next.chronicle.at(-1)).toEqual({
      day: DAY + 5,
      kind: 'village-abandoned',
      reason: 'line-ended',
    });
    expect(isVillageDormant(next)).toBe(true);
    const later = advanceVillage(next, DAY + 400, null);
    expect(later.chronicle).toEqual(next.chronicle);
    expect(later.people).toEqual(next.people);
    expect(abandonForLineEnd(next, DAY + 9)).toBe(next);
    // pohled: nikdo v ní nežije, ani dobytek
    next.livestock = {
      herds: { sheep: 3, goat: 0, pig: 2, cow: 1 },
      young: { sheep: 1, goat: 0, pig: 0, cow: 0 },
    };
    const shown = abandonedVillageAt(next, DAY + 41);
    expect(shown.people).toEqual([]);
    expect(Object.values(shown.livestock!.herds).every((n) => n === 0)).toBe(true);
    expect(Object.values(shown.livestock!.young).every((n) => n === 0)).toBe(true);
    expect(next.people).toHaveLength(2);
    // spící ves se kvůli dni neukládá: pohled je stejný se zaostalým i posunutým lastDay
    const shifted = abandonedVillageAt({ ...next, lastDay: DAY + 41 }, DAY + 41);
    expect(shown).toEqual(shifted);
    expect(isVillageAsleep(next)).toBe(true);
    expect(isVillageAsleep({ ...next, abandonedDay: undefined })).toBe(false);
  });
});

describe('determinismus konce rodu', () => {
  const START = dayIndexOf({ year: 601, month: 3, day: 1 });
  const person = (id: number, years: number, sex: Person['sex'], extra: Partial<Person> = {}) =>
    ({
      id,
      bornDay: START - Math.ceil(years * 365.25) - 10,
      dwellingId: 1,
      sex,
      ...extra,
    }) satisfies Person;

  /** Ves před rodem: starý vojvoda bez synů s ženou a dcerou, cizí mladý pár. */
  function lastManVillage(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.constructions = [];
    s.people = [
      person(2, 88, 'male', { spouseId: 3 }),
      person(3, 60, 'female', { spouseId: 2 }),
      person(4, 20, 'female', { fatherId: 2, motherId: 3 }),
      person(7, 30, 'male', { spouseId: 8 }),
      person(8, 25, 'female', { spouseId: 7 }),
    ];
    s.storesKg = 30_000;
    s.lastDay = START;
    s.nextId = 1000;
    s.foundedDay = START - 30 * 365;
    delete s.dynasty;
    return s;
  }

  it('den konce rodu nezávisí na kouscích dopočtu', () => {
    const end = START + 6 * 365;
    const whole = advanceVillage(lastManVillage(), end, null);
    let pieces = lastManVillage();
    for (let d = START + 53; d < end; d += 53) pieces = advanceVillage(pieces, d, null);
    pieces = advanceVillage(pieces, end, null);
    expect(whole.dynasty?.endedDay).toBeDefined();
    expect(pieces.dynasty).toEqual(whole.dynasty);
    expect(pieces.chronicle).toEqual(whole.chronicle);
    expect(whole.chronicle.filter((e) => e.kind === 'line-ended')).toHaveLength(1);
    // ves žije dál jako ves bez vojvody
    expect(whole.extinctDay).toBeUndefined();
    expect(whole.abandonedDay).toBeUndefined();
  });
});
