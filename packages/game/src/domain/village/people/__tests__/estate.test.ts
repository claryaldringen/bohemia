import { describe, expect, it } from 'vitest';
import { DAY, dwelling, LINE_LORD_ID, trackedVillage } from '../../__tests__/kin-fixtures';
import { chronicleEstate, chroniclePerson, deathWho } from '../estate';
import type { Workshop } from '../../types';

// Postavení v zápisu kroniky (Martin 15. 11. 2026: „Ve věku 64 let zemřel sedlák Bořivoj.“).

function estateVillage(): ReturnType<typeof trackedVillage> {
  const smithy = dwelling(2);
  smithy.workshop = { craft: 'smith', felling: null, fuelKg: 0 } as unknown as Workshop;
  const s = trackedVillage(
    [
      // dvorec: vojvoda s matkou, ženou a synem
      { id: LINE_LORD_ID, age: 40, sex: 'male', spouse: 11, mother: 13 },
      { id: 11, age: 36, sex: 'female', spouse: LINE_LORD_ID },
      { id: 12, age: 10, sex: 'male', father: LINE_LORD_ID, mother: 11 },
      { id: 13, age: 66, sex: 'female' },
      // kovárna: kovář, žena a dcera
      { id: 20, age: 35, sex: 'male', home: 2, spouse: 21 },
      { id: 21, age: 30, sex: 'female', home: 2, spouse: 20 },
      { id: 22, age: 5, sex: 'female', home: 2, father: 20, mother: 21 },
      // sedlák, ženatý syn se snachou a vnuk; kněz
      { id: 30, age: 64, sex: 'male', home: 3 },
      { id: 31, age: 25, sex: 'male', home: 3, father: 30, spouse: 32 },
      { id: 32, age: 22, sex: 'female', home: 3, spouse: 31 },
      { id: 33, age: 2, sex: 'male', home: 3, father: 31, mother: 32 },
      { id: 40, age: 45, sex: 'male', home: 3 },
    ],
    [dwelling(1, 'dvorec'), smithy, dwelling(3)],
  );
  const lord = s.people.find((p) => p.id === LINE_LORD_ID)!;
  lord.name = 'Bořivoj';
  s.people.find((p) => p.id === 12)!.name = 'Radim';
  s.people.find((p) => p.id === 40)!.priest = true;
  return s;
}

describe('chronicleEstate – postavení v kronice', () => {
  const s = estateVillage();
  const of = (id: number): ReturnType<typeof chronicleEstate> =>
    chronicleEstate(
      s,
      s.people.find((p) => p.id === id)!,
      DAY,
    );

  it('dvorec: vojvoda, jeho žena, syn a matka se jménem vojvody', () => {
    expect(of(LINE_LORD_ID)).toEqual({ title: 'voivode', kin: 'head' });
    expect(of(11)).toEqual({ title: 'voivode', kin: 'wife', female: true });
    expect(of(12)).toEqual({ title: 'voivode', kin: 'child', headName: 'Bořivoj' });
    expect(of(13)).toEqual({ title: 'voivode', kin: 'parent', headName: 'Bořivoj', female: true });
  });

  it('dílna řemesla, rolník, snacha, vnouče a kněz', () => {
    expect(of(20)).toEqual({ title: 'smith', kin: 'head' });
    expect(of(21)).toEqual({ title: 'smith', kin: 'wife', female: true });
    expect(of(22)).toEqual({ title: 'smith', kin: 'child', female: true });
    expect(of(30)).toEqual({ title: 'farmer', kin: 'head' });
    expect(of(31)).toEqual({ title: 'farmer', kin: 'child' });
    expect(of(32)).toEqual({ title: 'farmer', kin: 'in-law', female: true });
    expect(of(33)).toEqual({ title: 'farmer', kin: 'grandchild' });
    expect(of(40)).toEqual({ title: 'priest', kin: 'head' });
  });

  it('zápis úmrtí a člověk návratu nesou postavení (s pohlavím) a jméno muže rodu', () => {
    const lord = s.people.find((p) => p.id === LINE_LORD_ID)!;
    expect(deathWho(s, lord, DAY)).toEqual({
      name: 'Bořivoj',
      personId: LINE_LORD_ID,
      estate: { title: 'voivode', kin: 'head' },
    });
    expect(
      chroniclePerson(
        s,
        s.people.find((p) => p.id === 21)!,
        DAY,
      ),
    ).toEqual({
      estate: { title: 'smith', kin: 'wife', female: true },
    });
  });
});
