import { describe, expect, it } from 'vitest';
import { newWorkshop } from '../../crafts/crafts';
import { availableSettlers, occupyEmptyDwellings } from '../households';
import { isEmptyLogHouse, isLogHouse, logHouseWaiting } from '../log-house-settle';
import { logHouseCovered } from '../../steward/steward-log-house';
import type { Construction, Dwelling, VillageState } from '../../types';
import { DAY, couple, dwelling, kin, trackedVillage, village } from '../../__tests__/kin-fixtures';

// workshops.md – Rozhodnutí 4: v nadzemní dílně bydlí rodina jako v dnešní dílně, ne lidé
// z pořadí nadzemního domu.

const home = (s: VillageState, id: number): number | undefined =>
  s.people.find((p) => p.id === id)?.dwellingId;

/** Prázdná nadzemní dílna `type` kováře (id 2). */
const workshopHouse = (type: 'srub' | 'vypleteny' = 'srub'): Dwelling => ({
  ...dwelling(2, type),
  workshop: newWorkshop('smith'),
});

/** Plná zemnice 1: dva bratři se ženami a dětmi – mladší pár smí odejít. */
const brothers = [
  ...couple({ id: 20, age: 30, mother: 91, father: 90 }, { id: 21, age: 27 }),
  ...couple({ id: 30, age: 26, mother: 91, father: 90 }, { id: 31, age: 24 }),
  { id: 40, age: 4, sex: 'male' as const, mother: 21, father: 20 },
  { id: 41, age: 2, sex: 'female' as const, mother: 31, father: 30 },
];

function crowded(dwellings: Dwelling[]): VillageState {
  return village(
    brothers.map((k) => kin(k)),
    dwellings,
  );
}

const siteOf = (craft: boolean): Construction => ({
  id: 500,
  kind: 'dwelling',
  startedDay: DAY,
  cost: 300,
  done: 0,
  dwellingType: 'srub',
  position: { x: 20, z: 0, rotation: 0 },
  dwellingId: null,
  fieldId: null,
  ...(craft ? { craft: 'smith' as const } : {}),
});

describe('obsazení nadzemní dílny', () => {
  it('prázdnou nadzemní kovárnu osídlí rodina ženatého syna z přeplněného domu', () => {
    for (const type of ['srub', 'vypleteny'] as const) {
      const s = crowded([dwelling(1), workshopHouse(type)]);
      occupyEmptyDwellings(s, DAY);
      expect([30, 31, 41].map((id) => home(s, id))).toEqual([2, 2, 2]);
      expect([20, 21, 40].map((id) => home(s, id))).toEqual([1, 1, 1]);
    }
  });

  it('není to nadzemní dům z pořadí – isLogHouse ani isEmptyLogHouse', () => {
    const s = crowded([dwelling(1), workshopHouse()]);
    const smithy = s.dwellings[1]!;
    expect(isLogHouse(smithy)).toBe(false);
    expect(isEmptyLogHouse(s, smithy)).toBe(false);
    // nadzemní dům bez dílny dál je
    const plain = dwelling(3, 'srub');
    expect(isLogHouse(plain)).toBe(true);
    expect(isEmptyLogHouse(s, plain)).toBe(true);
  });

  it('rozestavěná nadzemní dílna sníží availableSettlers o 1 jako dnešní dílna', () => {
    const base = crowded([dwelling(1)]);
    expect(availableSettlers(base, DAY)).toBe(1);
    const building = crowded([dwelling(1)]);
    building.constructions.push(siteOf(true));
    expect(availableSettlers(building, DAY)).toBe(0);
    // nadzemní dům bez dílny rodinu nečeká (obyčejná rodina do něj nejde)
    const house = crowded([dwelling(1)]);
    house.constructions.push(siteOf(false));
    expect(availableSettlers(house, DAY)).toBe(1);
  });

  it('rozestavěná dílna se nepočítá jako rozestavěný nadzemní dům správce', () => {
    // mistr huti čeká na nadzemní dům (rodina z pořadí)
    const waiting = (): VillageState => {
      const s = trackedVillage([], [dwelling(1), dwelling(3)]);
      s.people.push({
        ...kin({ id: 5, age: 30, sex: 'male', home: 3 }),
        mason: 'mason',
        name: 'Petrus',
      });
      return s;
    };
    const plain = waiting();
    expect(logHouseWaiting(plain, DAY)).toBe(1);
    plain.constructions.push(siteOf(false));
    expect(logHouseCovered(plain, DAY)).toBe(1);
    const workshop = waiting();
    workshop.constructions.push(siteOf(true));
    expect(logHouseCovered(workshop, DAY)).toBe(0);
  });
});
