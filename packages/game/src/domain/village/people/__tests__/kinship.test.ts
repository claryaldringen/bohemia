import { describe, expect, it } from 'vitest';
import { hasCloseKinIn, parentIndex, removePeople, withKinship } from '../kinship';
import type { Person } from '../../types';
import { DAY, YEAR, couple, dwelling, kin, village } from '../../__tests__/kin-fixtures';

// Příbuzenství a pohlaví (kinship.md; Martin, 18. 10. 2026: „Pojďme na příbuzenství a pohlaví“).

/**
 * Tři generace: prarodiče 1 a 2; jejich děti 3 (otec rodu) a 4 (teta); 3 si vzal 5 (z okolí),
 * mají děti 6 a 7; teta 4 má s mužem 8 (z okolí) dceru 9 (sestřenice 6 a 7); 10 a 11 nepříbuzní.
 */
function family(): Person[] {
  return [
    ...couple({ id: 1, age: 70 }, { id: 2, age: 66 }),
    ...couple({ id: 3, age: 44, father: 1, mother: 2 }, { id: 5, age: 40 }),
    ...couple({ id: 8, age: 41 }, { id: 4, age: 38, father: 1, mother: 2 }),
    { id: 6, age: 18, sex: 'male' as const, father: 3, mother: 5 },
    { id: 7, age: 15, sex: 'female' as const, father: 3, mother: 5 },
    { id: 9, age: 16, sex: 'female' as const, father: 8, mother: 4 },
    { id: 10, age: 18, sex: 'female' as const },
    { id: 11, age: 20, sex: 'male' as const },
  ].map((spec) => kin(spec));
}

describe('rodokmen zemřelých', () => {
  it('zemřelí prarodiče zůstanou jen jako id a rodiče – rodokmen zůstane i po jejich smrti', () => {
    const s = village(family());
    removePeople(s, new Set([1, 2, 3, 4]));
    // zemřel otec 3 a teta 4 – jsou rodiči žijících, zůstanou v rodokmenu i s rodiči 1 a 2
    expect(s.ancestors?.map((a) => a.id)).toEqual([3, 4]);
    expect(s.ancestors?.find((a) => a.id === 3)).toEqual({ id: 3, fatherId: 1, motherId: 2 });
    expect(parentIndex(s).get(6)).toMatchObject({ fatherId: 3, motherId: 5 });
    // vdovy: manželé zemřelých manžela nemají
    expect(s.people.find((p) => p.id === 5)?.spouseId).toBeUndefined();
    expect(s.people.find((p) => p.id === 8)?.spouseId).toBeUndefined();
  });

  it('předek, který už není rodičem nikoho žijícího, se zapomene – rodokmen neroste', () => {
    const s = village(family());
    removePeople(s, new Set([3]));
    expect(s.ancestors?.map((a) => a.id)).toEqual([3]);
    removePeople(s, new Set([6, 7]));
    expect(s.ancestors).toEqual([]);
  });
});

describe('převod starých vsí', () => {
  /** Ves z doby před příbuzenstvím – lidé bez pohlaví a vazeb. */
  const old = (): ReturnType<typeof village> =>
    village(
      [
        { id: 1, age: 63, home: 1 },
        { id: 2, age: 49, home: 1 },
        { id: 3, age: 27, home: 1 },
        { id: 4, age: 12, home: 1 },
        { id: 5, age: 43, home: 2 },
        { id: 6, age: 19, home: 2 },
        { id: 7, age: 2, home: 2 },
      ].map(({ id, age, home }) => ({
        id,
        bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
        dwellingId: home,
      })),
      [dwelling(1, 'polozemnice'), dwelling(2)],
    );

  it('pohlaví střídavě od nejstaršího, manželé z párů v domě do 15 let rozdílu, rodiče neznámí', () => {
    const s = withKinship(old());
    expect(s.people.map((p) => p.sex)).toEqual([
      'male',
      'female',
      'male',
      'female',
      'male',
      'female',
      'male',
    ]);
    expect(s.people.find((p) => p.id === 1)?.spouseId).toBe(2);
    expect(s.people.find((p) => p.id === 2)?.spouseId).toBe(1);
    // 43 a 19 ne – rozdíl 24 let
    expect(s.people.find((p) => p.id === 5)?.spouseId).toBeUndefined();
    expect(s.people.every((p) => p.motherId === undefined && p.fatherId === undefined)).toBe(true);
  });

  it('převod je idempotentní – převedená ves se vrací beze změny (týž objekt), vstup se nemění', () => {
    const input = old();
    const s = withKinship(input);
    expect(withKinship(s)).toBe(s);
    expect(input.people.every((p) => p.sex === undefined)).toBe(true);
  });
});

describe('příbuzní v sousední vsi (válka – war.md)', () => {
  it('nevěsta z okolí a její muž mají příbuzné ve vsi, odkud přišla – jinde ne', () => {
    const s = village(
      couple({ id: 1, age: 25 }, { id: 2, age: 20, origin: 'NE' }).map((k) => kin(k)),
    );
    expect(hasCloseKinIn(s, 2, 'NE')).toBe(true);
    expect(hasCloseKinIn(s, 1, 'NE')).toBe(true);
    expect(hasCloseKinIn(s, 1, 'S')).toBe(false);
  });

  it('dcera vdaná pryč zůstane v rodokmenu se směrem – rodiče, sourozenci i švagři tam mají příbuzné', () => {
    const s = village([
      ...couple({ id: 1, age: 50 }, { id: 2, age: 46 }).map((k) => kin(k)),
      kin({ id: 3, age: 20, sex: 'female', father: 1, mother: 2 }),
      ...couple({ id: 4, age: 24, father: 1, mother: 2 }, { id: 5, age: 21 }).map((k) => kin(k)),
      ...couple({ id: 6, age: 30 }, { id: 7, age: 26, father: 1, mother: 2 }).map((k) => kin(k)),
      kin({ id: 8, age: 30, sex: 'male' }),
    ]);
    removePeople(s, new Set([3]), new Map([[3, 'W']]));
    expect(s.emigrants).toEqual([
      {
        id: 3,
        sex: 'female',
        bornDay: DAY - Math.ceil(20.5 * YEAR),
        direction: 'W',
        motherId: 2,
        fatherId: 1,
      },
    ]);
    expect(hasCloseKinIn(s, 1, 'W')).toBe(true); // otec
    expect(hasCloseKinIn(s, 4, 'W')).toBe(true); // bratr
    expect(hasCloseKinIn(s, 6, 'W')).toBe(true); // muž její sestry
    expect(hasCloseKinIn(s, 5, 'W')).toBe(true); // žena jejího bratra – manželova sestra tam
    expect(hasCloseKinIn(s, 8, 'W')).toBe(false);
    expect(hasCloseKinIn(s, 1, 'E')).toBe(false);
  });

  it('záznam o vdané pryč se zapomene, když ve vsi nezůstane její rodič, sourozenec ani dítě', () => {
    const s = village([
      ...couple({ id: 1, age: 50 }, { id: 2, age: 46 }).map((k) => kin(k)),
      kin({ id: 3, age: 20, sex: 'female', father: 1, mother: 2 }),
      kin({ id: 8, age: 30, sex: 'male' }),
    ]);
    removePeople(s, new Set([3]), new Map([[3, 'SW']]));
    expect(s.emigrants).toHaveLength(1);
    removePeople(s, new Set([1, 2]));
    expect(s.emigrants).toEqual([]);
  });
});
