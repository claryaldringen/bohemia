import { describe, expect, it } from 'vitest';
import { DAY, kin, village } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, Person } from '../../village/types';
import { defenderRoster, houseGroups } from '../defenders';
import { WAR } from '../rules-war';

// Obránci vsi (war.md – Boj – Dům od domu, Síla; Ztráty – Poslední muž rodu doma).

const house = (id: number, x: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z: 0, rotation: 0 },
});

const lineMan = (id: number, age: number, home = 1): Person => ({
  ...kin({ id, age, sex: 'male', home }),
  line: true,
  arms: { combat: 50, bow: 50, riding: 0 },
});

describe('skupiny domů (war.md – Dům od domu)', () => {
  it('domy blíž než 40 m – i řetězem; samota zvlášť', () => {
    const groups = houseGroups([house(3, 65), house(1, 0), house(2, 30), house(4, 200)]);
    expect([groups.get(1), groups.get(2), groups.get(3), groups.get(4)]).toEqual([0, 0, 0, 1]);
  });
});

describe('soupis obránců (war.md – Síla)', () => {
  const dwellings = [house(1, 0), house(2, 30), house(5, 300)];
  const people: Person[] = [
    lineMan(1, 30),
    kin({ id: 2, age: 30, sex: 'male', home: 2 }),
    kin({ id: 3, age: 30, sex: 'female', home: 2 }),
    kin({ id: 4, age: 50, sex: 'male', home: 5 }),
    kin({ id: 5, age: 15, sex: 'male', home: 5 }),
    kin({ id: 6, age: 10, sex: 'male', home: 5 }),
    { ...kin({ id: 7, age: 25, sex: 'male' }), away: { kind: 'campaign', untilDay: DAY + 5 } },
    { ...kin({ id: 8, age: 25, sex: 'male' }), injuredUntilDay: DAY + 5 },
  ];

  it('muži 16–44 silou vesničana, muž rodu s lukem, ostatní 0,1 jen u domu', () => {
    const roster = defenderRoster(village(people, dwellings), DAY);
    expect(roster.map((d) => d.personId)).toEqual([1, 2, 3, 4, 5]);
    const [lord, man, woman, elder, boy] = roster;
    expect(lord).toMatchObject({ line: true, bow: true, strength: 2, atHouseOnly: false });
    expect(man).toMatchObject({
      strength: WAR.strength.villager,
      atHouseOnly: false,
      houseGroup: 0,
    });
    expect(man!.pos).toEqual({ x: 30, z: 0 });
    for (const d of [woman, elder, boy]) {
      expect(d).toMatchObject({ strength: WAR.strength.defenderOther, atHouseOnly: true });
    }
    expect(elder!.houseGroup).toBe(1);
  });

  it('poslední muž rodu – jediný muž rodu, pokud žádný nežije jinde', () => {
    expect(defenderRoster(village(people, dwellings), DAY)[0]!.lastLine).toBe(true);
    const elsewhere = defenderRoster(village(people, dwellings), DAY, { lineMenElsewhere: 1 });
    expect(elsewhere[0]!.lastLine).toBe(false);
    const withSon = defenderRoster(village([...people, lineMan(9, 3)], dwellings), DAY);
    expect(withSon[0]!.lastLine).toBe(false);
  });
});
