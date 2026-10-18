import { describe, expect, it } from 'vitest';
import { arrangeMarriages, marriageMove, singles } from '../marriage';
import { occupants } from '../people';
import type { Dwelling, DwellingType, Person, VillageState } from '../types';

// Sňatky mezi domy (population.md; Martin, 18. 10. 2026: „Ano, přidej sňatky mezi domy“, detaily
// návrh Clauda).

const YEAR = 365.25;
const DAY = 100 * YEAR;

const dwelling = (id: number, type: DwellingType = 'zemnice'): Dwelling => ({
  id,
  type,
  builtDay: 0,
  condition: 1,
  position: { x: 0, z: 0, rotation: 0 },
});
/** Domácnost obydlí `dwellingId` s lidmi daného věku (id od `from`). */
const household = (from: number, ages: number[], dwellingId: number): Person[] =>
  ages.map((age, i) => ({ id: from + i, bornDay: DAY - age * YEAR, dwellingId }));
const village = (people: Person[], dwellings: Dwelling[]): VillageState => ({
  seed: 1,
  foundedDay: 0,
  lastDay: DAY,
  nextId: 1000,
  people,
  dwellings,
  fields: [],
  parts: [],
  constructions: [],
  plan: null,
  threshingFromPlan: null,
  storesKg: 0,
  domesticBacklog: 0,
  hungry: false,
  commonLaborHistory: [],
  chronicle: [],
});
const ids = (people: Person[]): number[] => people.map((p) => p.id);
const person = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;

describe('svobodní', () => {
  it('jediný člověk 16–44 v domácnosti, od nejstaršího; pár v domě svobodný není', () => {
    const s = village(
      [
        ...household(10, [42, 19, 2, 1], 1), // pár 42 a 19
        ...household(20, [63, 49, 27, 12, 10, 6], 2), // jen 27
        ...household(30, [50, 31, 15, 3], 3), // jen 31 – patnáctiletý ještě ne
      ],
      [dwelling(1), dwelling(2, 'polozemnice'), dwelling(3)],
    );
    expect(ids(singles(s, DAY))).toEqual([31, 22]);
  });
});

describe('kdo se při sňatku stěhuje', () => {
  it('ten, jehož domácnost se nerozpadne – i do domu s méně místy', () => {
    // Vlkov o tři roky později: v polozemnici zůstane patnáctiletý, ze zemnice by zůstal jen
    // starší s malými dětmi
    const s = village(
      [...household(10, [45, 22, 5, 4], 1), ...household(20, [66, 52, 30, 15, 13, 9], 2)],
      [dwelling(1), dwelling(2, 'polozemnice')],
    );
    const move = marriageMove(s, DAY, person(s, 22), person(s, 11));
    expect(move?.mover.id).toBe(22);
    expect(move?.to.id).toBe(1);
  });

  it('smějí-li oba, do domu s víc volnými místy; při shodě se stěhuje mladší', () => {
    const roomy = village(
      [...household(10, [50, 30, 14, 8], 1), ...household(20, [48, 25, 15, 3], 2)],
      [dwelling(1, 'polozemnice'), dwelling(2)],
    );
    // polozemnice 4 volná místa, zemnice 2 – stěhuje se 25letý ze zemnice
    expect(marriageMove(roomy, DAY, person(roomy, 11), person(roomy, 21))).toMatchObject({
      mover: { id: 21 },
      to: { id: 1 },
    });
    const even = village(
      [...household(10, [50, 30, 14, 8], 1), ...household(20, [48, 25, 15, 3], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(marriageMove(even, DAY, person(even, 11), person(even, 21))?.mover.id).toBe(21);
  });

  it('rozpadly by se obě domácnosti – nikdo; do plného ani přeplněného domu se nestěhuje', () => {
    const both = village(
      [...household(10, [50, 30, 5], 1), ...household(20, [48, 20, 3], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(marriageMove(both, DAY, person(both, 11), person(both, 21))).toBeNull();
    // 30letý by smel odejít, ale protějšek bydlí v přeplněné zemnici (7 lidí)
    const crowded = village(
      [...household(10, [50, 30, 15, 5], 1), ...household(20, [48, 20, 7, 6, 5, 3, 2], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(marriageMove(crowded, DAY, person(crowded, 11), person(crowded, 21))).toBeNull();
    // ani do plné – svatba dům nepřeplní (jinak by se nejstarší dítě stěhovalo tam a zpět)
    const full = village(
      [...household(10, [50, 30, 15, 5], 1), ...household(20, [48, 20, 7, 6, 5, 3], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(marriageMove(full, DAY, person(full, 11), person(full, 21))).toBeNull();
    // s jedním volným místem ano
    const room = village(
      [...household(10, [50, 30, 15, 5], 1), ...household(20, [48, 20, 7, 6, 5], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(marriageMove(room, DAY, person(room, 11), person(room, 21))).toMatchObject({
      mover: { id: 11 },
      to: { id: 2 },
    });
  });
});

describe('sňatky dne', () => {
  it('nejstarší svobodný si vezme dalšího v pořadí – jeden sňatek na člověka, kronika', () => {
    const s = village(
      [
        ...household(10, [50, 40, 15, 5], 1),
        ...household(20, [52, 30, 14, 4], 2),
        ...household(30, [55, 20, 15, 6], 3),
      ],
      [dwelling(1), dwelling(2), dwelling(3)],
    );
    const events = arrangeMarriages(s, DAY);
    expect(events).toEqual([{ day: DAY, kind: 'marriage', fromDwellingId: 2, toDwellingId: 1 }]);
    // 30letý (mladší, stejně volných míst) se přestěhoval ke 40letému, 20letý čeká
    expect(ids(occupants(s, 1))).toEqual([10, 11, 12, 13, 21]);
    expect(person(s, 31).dwellingId).toBe(3);
    expect(arrangeMarriages(s, DAY)).toEqual([]); // novomanželé už svobodní nejsou
  });

  it('žádný sňatek, když má každý protějšek v domě', () => {
    const s = village(
      [...household(10, [30, 28, 5], 1), ...household(20, [25, 24, 3], 2)],
      [dwelling(1), dwelling(2)],
    );
    expect(singles(s, DAY)).toEqual([]);
    expect(arrangeMarriages(s, DAY)).toEqual([]);
  });
});
