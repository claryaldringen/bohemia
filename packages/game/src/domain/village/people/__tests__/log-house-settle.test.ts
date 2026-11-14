import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import { advanceVillage } from '../../core/simulate';
import { newcomerHome } from '../../trade/people-trade';
import { vacateDwelling } from '../displaced';
import { occupyEmptyDwellings, settleNewDwelling, waitingHouseholds } from '../households';
import { settleArrival } from '../lodge';
import { logHouseFamilies, logHouseWaiting, settleLogHouse } from '../log-house-settle';
import type { Construction, Person, VillageState } from '../../types';
import {
  DAY,
  LINE_LORD_ID as LORD,
  couple,
  dwelling,
  kin,
  trackedVillage,
  village,
  type KinSpec,
} from '../../__tests__/kin-fixtures';

// Kdo bydlí v nadzemním domě (log-house.md – Kdo v domě bydlí; Martin 12. 11. 2026: „Nadzemní dům
// ať primárně obsadí cizí řemeslníci, pak kněz, pak synové hlavní manželky a pak synové vedlejších
// manželek“). Dvorec je obydlí 1 (zemnice), vojvoda 10.

const home = (s: VillageState, id: number): number | undefined =>
  s.people.find((p) => p.id === id)?.dwellingId;
const heads = (families: readonly Person[][]): number[] => families.map((f) => f[0]!.id);
const person = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;

/** Mistr huti (obor `mason`) nebo kněz – svobodný muž 30 let v obydlí `at`. */
function stranger(id: number, at: number, role: 'mason' | 'priest'): Person {
  const p = kin({ id, age: 30, sex: 'male', home: at });
  return role === 'priest' ? { ...p, priest: true } : { ...p, mason: 'mason', name: 'Petrus' };
}

/**
 * Dvorec 1: vojvoda 10 s hlavní manželkou 11 a vedlejší 12; ženatý syn hlavní manželky 20 (elita)
 * se ženou 21 a dítětem 22; ženatý syn vedlejší manželky 30 se ženou 31. Obydlí 3: mistr 5 a kněz 6.
 */
const court: KinSpec[] = [
  ...couple({ id: LORD, age: 50 }, { id: 11, age: 45 }),
  { id: 12, age: 40, sex: 'female', spouse: LORD },
  ...couple({ id: 20, age: 25, mother: 11, father: LORD }, { id: 21, age: 23 }),
  { id: 22, age: 3, sex: 'male', mother: 21, father: 20 },
  ...couple({ id: 30, age: 22, mother: 12, father: LORD }, { id: 31, age: 20 }),
];

function courtVillage(): VillageState {
  const s = trackedVillage(court, [dwelling(1), dwelling(2, 'srub'), dwelling(3)]);
  s.people.push(stranger(5, 3, 'mason'), stranger(6, 3, 'priest'));
  const son = person(s, 20);
  son.mainWifeSon = true;
  son.elite = true;
  son.name = 'Bořivoj';
  return s;
}

describe('pořadí nadzemního domu (log-house.md – Kdo v domě bydlí)', () => {
  it('mistr → kněz → syn hlavní manželky → syn vedlejší; vojvoda ne', () => {
    const s = courtVillage();
    expect(heads(logHouseFamilies(s, DAY))).toEqual([5, 6, 20, 30]);
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 5)).toBe(2);
    // kdo už v nadzemním domě bydlí, se nestěhuje
    expect(heads(logHouseFamilies(s, DAY))).toEqual([6, 20, 30]);
  });

  it('bez mistra kněz, bez kněze syn hlavní manželky, pak syn vedlejší', () => {
    const s = courtVillage();
    s.people = s.people.filter((p) => p.id !== 5);
    expect(settleLogHouse(s, DAY, 2)).toBe(true);
    expect(home(s, 6)).toBe(2);
    const t = courtVillage();
    t.people = t.people.filter((p) => p.id !== 5 && p.id !== 6);
    expect(heads(logHouseFamilies(t, DAY))).toEqual([20, 30]);
    const u = courtVillage();
    u.people = u.people.filter((p) => ![5, 6, 20, 21, 22].includes(p.id));
    expect(settleLogHouse(u, DAY, 2)).toBe(true);
    expect([30, 31].map((id) => home(u, id))).toEqual([2, 2]);
  });

  it('ženatý syn přijde s manželkou a svobodnými dětmi (kronika založení a odchodu z dvorce)', () => {
    const s = courtVillage();
    s.people = s.people.filter((p) => p.id !== 5 && p.id !== 6);
    expect(settleLogHouse(s, DAY, 2)).toBe(true);
    expect([20, 21, 22].map((id) => home(s, id))).toEqual([2, 2, 2]);
    expect([LORD, 11, 12, 30, 31].map((id) => home(s, id))).toEqual([1, 1, 1, 1, 1]);
    expect(s.chronicle).toEqual([
      { day: DAY, kind: 'household-founded', dwellingId: 2 },
      { day: DAY, kind: 'son-left-manor', name: 'Bořivoj' },
    ]);
  });

  it('svobodný syn hlavní manželky přijde sám; chlapec ani syn hlavní manželky bez elity ne', () => {
    const s = trackedVillage(
      [
        ...couple({ id: LORD, age: 50 }, { id: 11, age: 45 }),
        { id: 20, age: 18, sex: 'male', mother: 11, father: LORD },
        { id: 23, age: 10, sex: 'male', mother: 11, father: LORD },
        { id: 24, age: 17, sex: 'male', mother: 11, father: LORD },
      ],
      [dwelling(1), dwelling(2, 'srub')],
    );
    for (const id of [20, 23]) Object.assign(person(s, id), { mainWifeSon: true, elite: true });
    // 24: syn hlavní manželky bez příznaku elity – není v pořadí
    person(s, 24).mainWifeSon = true;
    expect(heads(logHouseFamilies(s, DAY))).toEqual([20]);
    expect(logHouseWaiting(s, DAY)).toBe(1);
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 20)).toBe(2);
    expect([LORD, 11, 23, 24].map((id) => home(s, id))).toEqual([1, 1, 1, 1]);
  });

  it('vojvoda ve dvorci se nestěhuje, ani syn vedlejší manželky, který je vojvodou', () => {
    const s = trackedVillage(couple({ id: LORD, age: 30 }, { id: 11, age: 28 }), [
      dwelling(1),
      dwelling(2, 'srub'),
    ]);
    expect(person(s, LORD).mainWifeSon).toBeUndefined();
    expect(logHouseFamilies(s, DAY)).toEqual([]);
    expect(logHouseWaiting(s, DAY)).toBe(0);
    occupyEmptyDwellings(s, DAY);
    expect(home(s, LORD)).toBe(1);
  });
});

/** Ves bez rodu: dům 1 plný – rodiče, ženatý dědic 3, ženatý syn 7 a svobodný syn 5 (18). */
function crowded(extraDwellings = [dwelling(2, 'srub')]): VillageState {
  const specs: KinSpec[] = [
    ...couple({ id: 1, age: 46 }, { id: 2, age: 43 }),
    ...couple({ id: 3, age: 25, mother: 2, father: 1 }, { id: 4, age: 23 }),
    ...couple({ id: 7, age: 22, mother: 2, father: 1 }, { id: 8, age: 21 }),
    { id: 5, age: 18, sex: 'male', mother: 2, father: 1 },
  ];
  return village(
    specs.map((k) => kin(k)),
    [dwelling(1), ...extraDwellings],
  );
}

function srubSite(id: number): Construction {
  return {
    id,
    kind: 'dwelling',
    startedDay: DAY - 10,
    cost: 300,
    done: 10,
    dwellingType: 'srub',
    position: { x: 20, z: 20, rotation: 0 },
    dwellingId: null,
    fieldId: null,
  };
}

describe('obyčejná rodina do nadzemního domu nejde', () => {
  it('prázdný srub zůstane prázdný a rodina dál čeká na dům', () => {
    const before = waitingHouseholds(crowded([]), DAY);
    expect(before).toBeGreaterThan(0);
    const s = crowded();
    expect(waitingHouseholds(s, DAY)).toBe(before);
    s.constructions = [srubSite(50)];
    expect(waitingHouseholds(s, DAY)).toBe(before);
    occupyEmptyDwellings(s, DAY);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    expect(settleNewDwelling(s, DAY, 2)).toBe(false);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    expect(s.chronicle).toEqual([]);
    // obyčejné prázdné obydlí rodina obsadí jako dřív
    const t = crowded([dwelling(2, 'srub'), dwelling(3, 'polozemnice')]);
    occupyEmptyDwellings(t, DAY);
    expect([7, 8].map((id) => home(t, id))).toEqual([3, 3]);
    expect(t.people.some((p) => p.dwellingId === 2)).toBe(false);
  });

  it('vystěhovaná domácnost ani rodina od souseda prázdný srub nedostane', () => {
    const s = crowded([dwelling(2, 'srub'), dwelling(3, 'polozemnice')]);
    s.people.push(kin({ id: 40, age: 30, sex: 'male', home: 3 }));
    vacateDwelling(s, DAY, 1);
    expect(s.people.some((p) => p.dwellingId === 2)).toBe(false);
    const t = crowded([dwelling(2, 'srub'), dwelling(3, 'polozemnice')]);
    expect(newcomerHome(t, true)).toBe(3);
    t.dwellings = t.dwellings.filter((d) => d.id !== 3);
    expect(newcomerHome(t, true)).toBe(1);
  });
});

describe('mistr huti a nadzemní dům', () => {
  /** Ves: dům 1 obydlený, dvorec 1; mistr dorazí (`settleArrival`). */
  const arrive = (s: VillageState): Person => {
    expect(settleArrival(s, 'mason', DAY, createRandom(7))).toBe(true);
    return s.people[s.people.length - 1]!;
  };
  const base = (extra = [dwelling(2), dwelling(3, 'srub')]): VillageState =>
    village([kin({ id: 1, age: 40, sex: 'male' })], [dwelling(1), ...extra], { manorId: 1 });

  it('nově příchozí dostane napřed prázdný srub, pak jiné prázdné obydlí, jinak je host', () => {
    expect(arrive(base()).dwellingId).toBe(3);
    expect(arrive(base([dwelling(2)])).dwellingId).toBe(2);
    const s = base([]);
    const guest = arrive(s);
    expect(guest.dwellingId).toBe(1);
    expect(s.displaced).toEqual([{ household: 1, day: DAY, people: [{ id: guest.id, host: 1 }] }]);
  });

  it('srub dostane, i když na obydlí čeká vystěhovaná domácnost', () => {
    const s = base();
    s.people.push(kin({ id: 2, age: 30, sex: 'male' }));
    s.displaced = [{ household: 9, day: DAY - 5, people: [{ id: 2, host: 1 }] }];
    expect(arrive(s).dwellingId).toBe(3);
  });

  it('host ve dvorci se do dostavěného srubu nastěhuje a ze seznamu hostů zmizí', () => {
    const s = base([]);
    const guest = arrive(s);
    s.dwellings.push(dwelling(4, 'srub'));
    expect(settleNewDwelling(s, DAY + 1, 4)).toBe(true);
    expect(guest.dwellingId).toBe(4);
    expect(s.displaced).toBeUndefined();
    expect(s.chronicle.at(-1)).toEqual({ day: DAY + 1, kind: 'household-founded', dwellingId: 4 });
  });

  it('logHouseWaiting počítá lidi z pořadí mimo srub', () => {
    const s = courtVillage();
    expect(logHouseWaiting(s, DAY)).toBe(4);
    occupyEmptyDwellings(s, DAY);
    expect(logHouseWaiting(s, DAY)).toBe(3);
    expect(logHouseWaiting(base(), DAY)).toBe(0);
  });

  it('vcelku = po kouscích (advanceVillage)', () => {
    const s = village(
      [kin({ id: 1, age: 40, sex: 'male' }), stranger(5, 2, 'mason')],
      [dwelling(1), dwelling(2), dwelling(3, 'srub'), dwelling(4, 'srub')],
      {
        storesKg: 100000,
        happiness: { value: 60, deaths: [], toil: [] },
        lodge: {
          circle: 'adriatic',
          invitedDay: DAY - 100,
          arriving: [{ role: 'builder', day: DAY + 20 }],
        },
      },
    );
    const to = DAY + 40;
    const whole = advanceVillage(s, to, null, null);
    let chunked = s;
    for (const end of [DAY + 7, DAY + 20, DAY + 21, DAY + 33, to]) {
      chunked = advanceVillage(chunked, end, null, null);
    }
    expect(chunked).toEqual(whole);
    expect(whole.people.find((p) => p.id === 5)?.dwellingId).toBe(3);
    expect(whole.people.find((p) => p.mason === 'builder')?.dwellingId).toBe(4);
  });
});

// Vypletený dům a pořadí kvality domů (log-house.md – Dům s vypletenými stěnami; Martin 14. 11.
// 2026: „napřed si domy vybírá elita a pak se postupně obsazují podle společenského postavení“).
describe('vypletený dům – elita bydlí v nejlepším volném domě', () => {
  it('prázdný srub i vypletený dům: mistr do srubu, kněz do vypleteného (kvalita před id)', () => {
    const s = trackedVillage(court, [
      dwelling(1),
      dwelling(2, 'vypleteny'),
      dwelling(3),
      dwelling(4, 'srub'),
    ]);
    s.people.push(stranger(5, 3, 'mason'), stranger(6, 3, 'priest'));
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 5)).toBe(4);
    expect(home(s, 6)).toBe(2);
  });

  it('uvolněný srub: přestěhuje se do něj nejvýš postavený z vypleteného domu, vypletený osídlí další', () => {
    const s = trackedVillage(court, [
      dwelling(1),
      dwelling(2, 'vypleteny'),
      dwelling(3),
      dwelling(4, 'srub'),
    ]);
    s.people.push(stranger(5, 2, 'mason'), stranger(6, 3, 'priest'));
    // do srubu smí i mistr z vypleteného domu, do dalšího vypleteného domu jen ostatní z pořadí
    expect(heads(logHouseFamilies(s, DAY, 'srub'))).toEqual([5, 6, 20, 30]);
    expect(heads(logHouseFamilies(s, DAY))).toEqual([6, 20, 30]);
    occupyEmptyDwellings(s, DAY);
    expect(home(s, 5)).toBe(4);
    expect(home(s, 6)).toBe(2);
    // kdo bydlí ve srubu, se nestěhuje; z vypleteného domu by šel jen do srubu
    expect(heads(logHouseFamilies(s, DAY, 'srub'))).toEqual([6, 20, 30]);
    expect(heads(logHouseFamilies(s, DAY))).toEqual([20, 30]);
  });

  it('obyčejná rodina do prázdného vypleteného domu nejde', () => {
    const s = crowded([dwelling(2, 'vypleteny'), dwelling(3, 'polozemnice')]);
    occupyEmptyDwellings(s, DAY);
    expect([7, 8].map((id) => home(s, id))).toEqual([3, 3]);
    expect(s.people.some((p) => p.dwellingId === 2)).toBe(false);
    // rodina od souseda prázdný vypletený dům nedostane – jen přeplněný dům 1
    expect(newcomerHome(crowded([dwelling(2, 'vypleteny')]), true)).toBe(1);
  });

  it('nově příchozí mistr dostane napřed srub, pak vypletený dům', () => {
    const arrive = (s: VillageState): number | undefined => {
      expect(settleArrival(s, 'mason', DAY, createRandom(7))).toBe(true);
      return s.people[s.people.length - 1]!.dwellingId;
    };
    const base = (extra: ReturnType<typeof dwelling>[]): VillageState =>
      village([kin({ id: 1, age: 40, sex: 'male' })], [dwelling(1), ...extra], { manorId: 1 });
    expect(arrive(base([dwelling(2, 'vypleteny'), dwelling(3, 'srub')]))).toBe(3);
    expect(arrive(base([dwelling(2), dwelling(3, 'vypleteny')]))).toBe(3);
  });
});
