import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { HIDES } from '../../rules/rules-wares';
import { SMALL_GAME } from '../../rules/rules-wildlife';
import type { Pen, Person, VillageState, WaresState } from '../../types';
import { finishCuring, processHidesDay, setWaresNeed, yearlyNeed } from '../hides';
import { waresWorkDay } from '../wares-work';

// Zpracování v domácnosti (hides-honey.md): roční potřeba 1. 11., práce listopad–březen,
// hotové várky po 10 dnech.

const at = (month: number, day: number, year = 600): number => dayIndexOf({ year, month, day });
const NOV_1 = at(11, 1);
const DEC_10 = at(12, 10);
const HOURS = SMALL_GAME.hoursPerManDay;
const SMALL = HIDES.smallHideM2 / HIDES.hideM2;

/** Člověk `age` let v domácnosti `dwellingId` (jen pole, která potřeba čte). */
function person(id: number, age: number, dwellingId: number): Person {
  return { id, bornDay: NOV_1 - age * 365.25 - 10, dwellingId } as unknown as Person;
}

/** Ves s lidmi `adults` / `children` rovnoměrně v `households` domácnostech a se zásobou. */
function village(
  adults: number,
  children: number,
  households = 1,
  wares?: Partial<WaresState>,
): VillageState {
  const people: Person[] = [];
  for (let i = 0; i < adults + children; i++) {
    people.push(person(i + 1, i < adults ? 30 : 8, 1 + (i % households)));
  }
  const s = { people, dwellings: [], pens: [] } as unknown as VillageState;
  if (wares) {
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0, ...wares };
  }
  return s;
}

describe('roční potřeba kůží a kožešin', () => {
  it('1. 11.: obuv, řemení, kožichy a čepice podle lidí a domácností', () => {
    const s = village(8, 4, 3);
    setWaresNeed(s, NOV_1);
    // kůže skotu: 12 lidí ÷ 6 + 3 domácnosti ÷ 3; kožešiny: 0,7 × 8 + 0,35 × 4 + 0,2 × 12
    expect(s.wares?.need?.hides).toBeCloseTo(12 / 6 + 3 / 3, 9);
    expect(s.wares?.need?.furs).toBeCloseTo(0.7 * 8 + 0.35 * 4 + 0.2 * 12, 9);
  });

  it('postroje: kůže skotu na pár vycvičených volů nebo dospělého koně za 5 let', () => {
    const s = village(2, 0, 1);
    s.pens = [
      {
        id: 1,
        species: 'team',
        builtDay: 0,
        oxen: [0, 0, 0, NOV_1 + 100].map((d) => ({ trainedDay: d })),
      },
      {
        id: 2,
        species: 'horse',
        builtDay: 0,
        horses: [
          { id: 3, bornDay: NOV_1 - 3650, sex: 'male', training: 1 },
          { id: 4, bornDay: NOV_1 - 100, sex: 'female', training: 0 },
        ],
      },
    ] as unknown as Pen[];
    const base = 2 / 6 + 1 / 3;
    // 3 vycvičení voli = 1,5 páru, 1 dospělý kůň (hříbě ne)
    expect(yearlyNeed(s, NOV_1).hides).toBeCloseTo(base + (1.5 + 1) / 5, 9);
  });

  it('jindy než 1. 11. se potřeba nemění; bez lidí je nulová, bez NaN', () => {
    const s = village(0, 0);
    setWaresNeed(s, DEC_10);
    expect(s.wares).toBeUndefined();
    setWaresNeed(s, NOV_1);
    expect(s.wares?.need).toEqual({ hides: 0, furs: 0 });
  });
});

describe('zpracování v domácnosti', () => {
  it('kožešiny: napřed ovčí (3 h), z lovu (1,5 h) jen do potřeby, když ovčí nestačí', () => {
    const s = village(4, 0, 1, { sheepFurs: 3, wildFurs: 5, need: { hides: 0, furs: 4 } });
    const used = processHidesDay(s, DEC_10, 2);
    // 3 ovčí × 3 h + 1 z lovu × 1,5 h = 10,5 h
    expect(used).toBeCloseTo(10.5 / HOURS, 9);
    expect(s.wares?.sheepFurs).toBeCloseTo(0, 9);
    expect(s.wares?.wildFurs).toBeCloseTo(4, 9);
    expect(s.wares?.curing).toEqual([{ doneDay: DEC_10 + HIDES.cureDays, hides: 0, furs: 4 }]);
    // potřeba ubude až hotovou várkou
    expect(s.wares?.need?.furs).toBe(4);
  });

  it('práce nestačí: kůže skotu po 10 h, zlomky dovolené, vrací spotřebované člověkodny', () => {
    const s = village(4, 0, 1, { hides: 5, sheepFurs: 2, need: { hides: 5, furs: 2 } });
    expect(processHidesDay(s, DEC_10, 0.5)).toBeCloseTo(0.5, 9);
    expect(s.wares?.hides).toBeCloseTo(4.5, 9);
    // napřed kůže, kožešiny na řadě až po nich
    expect(s.wares?.sheepFurs).toBe(2);
    expect(s.wares?.curing).toEqual([{ doneDay: DEC_10 + HIDES.cureDays, hides: 0.5, furs: 0 }]);
  });

  it('kozí a prasečí kůže po 4 h a přepočtem plochou, až když kůže skotu nestačí', () => {
    const s = village(4, 0, 1, { hides: 1, smallHides: 6, need: { hides: 2, furs: 0 } });
    const used = processHidesDay(s, DEC_10, 2);
    // kůže skotu 10 h, pak 10 h na 2,5 kozí a prasečí kůže (= 2,5 × 0,8 / 3 kůže skotu)
    expect(used).toBeCloseTo(2, 9);
    expect(s.wares?.hides).toBeCloseTo(0, 9);
    expect(s.wares?.smallHides).toBeCloseTo(3.5, 9);
    expect(s.wares?.curing?.[0]?.hides).toBeCloseTo(1 + 2.5 * SMALL, 9);
  });

  it('kozí a prasečí kůže nejvýš do potřeby v kůžích skotu', () => {
    const s = village(4, 0, 1, { smallHides: 6, need: { hides: 1, furs: 0 } });
    expect(processHidesDay(s, DEC_10, 3)).toBeCloseTo((4 * 3.75) / HOURS, 9);
    expect(s.wares?.smallHides).toBeCloseTo(6 - 3.75, 9);
  });

  it('várky v práci se počítají do potřeby – znovu se nezačne, co už se louhuje', () => {
    const s = village(4, 0, 1, { sheepFurs: 10, need: { hides: 0, furs: 4 } });
    s.wares!.curing = [{ doneDay: DEC_10 + 3, hides: 0, furs: 3 }];
    processHidesDay(s, DEC_10, 5);
    expect(s.wares?.sheepFurs).toBeCloseTo(9, 9);
  });

  it('hotová várka v den dokončení ubere potřebu a zmizí', () => {
    const s = village(4, 0, 1, { sheepFurs: 3, need: { hides: 0, furs: 4 } });
    processHidesDay(s, DEC_10, 1);
    finishCuring(s, DEC_10 + HIDES.cureDays - 1);
    expect(s.wares?.curing).toHaveLength(1);
    finishCuring(s, DEC_10 + HIDES.cureDays);
    expect(s.wares?.curing).toBeUndefined();
    expect(s.wares?.need?.furs).toBeCloseTo(1, 9);
  });

  it('mimo listopad–březen, bez potřeby nebo bez práce se nezpracovává', () => {
    const june = village(4, 0, 1, { hides: 5, need: { hides: 5, furs: 0 } });
    expect(processHidesDay(june, at(6, 15), 3)).toBe(0);
    expect(june.wares?.hides).toBe(5);
    const april = village(4, 0, 1, { hides: 5, need: { hides: 5, furs: 0 } });
    expect(processHidesDay(april, at(4, 1), 3)).toBe(0);
    const march = village(4, 0, 1, { hides: 5, need: { hides: 5, furs: 0 } });
    expect(processHidesDay(march, at(3, 31), 3)).toBeGreaterThan(0);
    const none = village(4, 0, 1, { hides: 5 });
    expect(processHidesDay(none, DEC_10, 3)).toBe(0);
    expect(
      processHidesDay(village(4, 0, 1, { hides: 5, need: { hides: 5, furs: 0 } }), DEC_10, 0),
    ).toBe(0);
  });
});

describe('zpracování jen z volné práce žen (population.md – Práce, Stavby staví muži)', () => {
  const stock = { hides: 20, need: { hides: 20, furs: 0 } };

  it('bez volné práce žen nic – várka čeká, i když zbytek práce vsi je velký', () => {
    const s = village(4, 0, 1, stock);
    expect(waresWorkDay(s, DEC_10, 5, null, 0)).toBe(0);
    expect(s.wares?.hides).toBe(20);
    expect(s.wares?.curing).toBeUndefined();
  });

  it('nejvýš volná práce žen – práce mužů navíc zpracování neurychlí', () => {
    const few = village(4, 0, 1, stock);
    const many = village(4, 0, 1, stock);
    expect(waresWorkDay(few, DEC_10, 1, null, 0.5)).toBeCloseTo(0.5, 9);
    expect(waresWorkDay(many, DEC_10, 10, null, 0.5)).toBeCloseTo(0.5, 9);
    expect(many.wares).toEqual(few.wares);
    expect(few.wares?.hides).toBeCloseTo(20 - (0.5 * HOURS) / HIDES.hoursPerHide, 9);
  });

  it('nejvýš zbytek práce vsi; bez údaje o ženách (pohlaví neznámá) z celého zbytku jako dřív', () => {
    expect(waresWorkDay(village(4, 0, 1, stock), DEC_10, 0.5, null, 3)).toBeCloseTo(0.5, 9);
    expect(waresWorkDay(village(4, 0, 1, stock), DEC_10, 3, null)).toBeCloseTo(3, 9);
  });
});
