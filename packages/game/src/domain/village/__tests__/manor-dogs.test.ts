import { describe, expect, it } from 'vitest';
import { dogsWanted, huntingDogs, huntPool } from '../hunt-party';
import { lordFamily } from '../lord';
import { dogsYear, feedDogs } from '../manor-dogs';
import { MANOR_DOGS, WILDLIFE_LAND } from '../rules-wildlife';
import type { VillageState } from '../types';
import { freshWildlife } from '../wildlife';
import { at, horseVillage } from './horse-fixtures';

// Psi dvorce (wildlife.md – Psi – smečka dvorce): chce 1 psa na lovce + 1, nejvýš 8; 1. 5. nejvýš
// 2 štěňata a −10 %; bez obilí smečka nedoroste.

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

  it('nakrmená smečka zeslábne o 10 % bez lovců; nenakrmená nedoroste', () => {
    const s = village();
    s.wildlife!.dogs = { count: 3, fed: false };
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(2.7, 9);
    s.people = s.people.filter((p) => p.sex === 'female');
    s.wildlife!.dogs!.fed = true;
    dogsYear(s, MAY);
    expect(s.wildlife!.dogs!.count).toBeCloseTo(2.43, 9);
    expect(huntingDogs(s)).toBe(2);
  });
});

describe('krmení', () => {
  it('0,3 kg obilí denně na psa; hlad a nedostatek zásob psy nekrmí', () => {
    const s = village();
    s.wildlife!.dogs = { count: 4, fed: true };
    s.storesKg = 1000;
    feedDogs(s, MAY, 10_000, 100);
    expect(s.storesKg).toBeCloseTo(1000 - 4 * MANOR_DOGS.grainKgPerDay, 9);
    expect(s.wildlife!.dogs!.fed).toBe(true);
    feedDogs(s, MAY, 50, 100);
    expect(s.wildlife!.dogs!.fed).toBe(false);
    s.hungry = true;
    feedDogs(s, MAY, 10_000, 100);
    expect(s.wildlife!.dogs!.fed).toBe(false);
  });
});
