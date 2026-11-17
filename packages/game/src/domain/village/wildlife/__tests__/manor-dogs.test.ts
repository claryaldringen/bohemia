import { describe, expect, it } from 'vitest';
import { dogsWanted, huntingDogs, huntPool } from '../hunt-party';
import { lordFamily } from '../../people/lord';
import { dogsYear } from '../manor-dogs';
import { MANOR_DOGS, WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { advanceVillage } from '../../core/simulate';
import type { VillageState } from '../../types';
import { freshWildlife } from '../wildlife';
import { at, horseVillage } from '../../__tests__/horse-fixtures';

// Psi dvorce (wildlife.md – Psi – smečka dvorce): chce 1 psa na lovce + 1, nejvýš 8; 1. 5. nejvýš
// 2 štěňata a −10 %; psi nic nespotřebovávají (Martin 17. 11. 2026).

const MAY = at(601, 5, 1);

function village(): VillageState {
  const s = horseVillage(null, 2, 4);
  for (const p of s.people) if (p.sex === 'male') p.arms = { bow: 50, combat: 50, riding: 50 };
  s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  return s;
}

describe('kolik psů dvorec chce', () => {
  it('1 na lovce rodu od 14 let + 1 (vojvoda a syn 17 let = 3 psi)', () => {
    const s = village();
    expect(dogsWanted(huntPool(s, MAY, lordFamily(s, MAY)))).toBe(3);
  });

  it('nejvýš 8 psů', () => {
    expect(dogsWanted({ manor: Array.from({ length: 12 }, () => ({}) as never), away: [] })).toBe(
      MANOR_DOGS.max,
    );
  });
});

describe('chov 1. 5.', () => {
  it('nová smečka: nejvýš 2 štěňata ročně, pak do chtěného počtu', () => {
    const s = village();
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBe(2);
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(3, 9);
    // nad počet nepřibývá, jen −10 % a štěňata do doplnění
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(3, 9);
  });

  it('smečka zeslábne o 10 % a štěňata přibývají vždy, i s prázdnými zásobami vsi', () => {
    const s = village();
    s.storesKg = 0;
    s.hungry = true;
    // starší uložená ves s `fed: false` se chová stejně
    s.wildlife!.dogs = { count: 1, fed: false };
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(2.9, 9);
    expect(s.storesKg).toBe(0);
    s.people = s.people.filter((p) => p.sex === 'female');
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(2.61, 9);
    expect(huntingDogs(s)).toBe(2);
  });
});

describe('psi nejedí', () => {
  it('ves se psy a bez nich spotřebuje týž počet kg obilí', () => {
    const run = (dogs: number): number => {
      const s = village();
      s.storesKg = 1000;
      if (dogs > 0) s.wildlife!.dogs = { count: dogs };
      return advanceVillage(s, s.lastDay + 5, null, null).storesKg;
    };
    expect(run(4)).toBeCloseTo(run(0), 9);
  });
});
