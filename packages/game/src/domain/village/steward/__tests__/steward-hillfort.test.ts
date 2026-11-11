import { describe, expect, it } from 'vitest';
import { STEWARD } from '../../rules/rules-steward';
import { stewardDeparture } from '../steward-son';
import { importsDomainFood, setStewardOn } from '../steward-state';
import type { VillageState } from '../../types';
import { DAY, trackedVillage } from '../../__tests__/kin-fixtures';
import { AUG31, barren, barrenObstacles, lordVillage } from './steward-son-fixtures';

// Převzaté hradiště (hillfort.md – Hradiště staví hráč, 8. 11. 2026): ves z `steward-son-fixtures.ts`.

function stripSteward(s: VillageState): void {
  delete (s as { steward?: unknown }).steward;
}

describe('převzaté hradiště', () => {
  it('importsDomainFood: jídlo domény za posledních 365 dní', () => {
    expect(importsDomainFood({}, DAY)).toBe(false);
    expect(importsDomainFood({ domainFoodDay: DAY - 364 }, DAY)).toBe(true);
    expect(importsDomainFood({ domainFoodDay: DAY - STEWARD.hillfortImportDays }, DAY)).toBe(false);
  });

  it('zapnutí správce posoudí hradiště, vypnutí ho smaže', () => {
    const s = trackedVillage([], [], { storesKg: 0 });
    s.domainFoodDay = DAY - 100;
    stripSteward(s);
    setStewardOn(s, DAY, true);
    expect(s.steward?.hillfort).toBe(true);
    setStewardOn(s, DAY + 1, false);
    expect(s.steward?.hillfort).toBeUndefined();
    s.domainFoodDay = DAY - 400;
    setStewardOn(s, DAY + 2, true);
    expect(s.steward?.hillfort).toBeUndefined();
    s.domainFoodDay = DAY;
    setStewardOn(s, DAY + 3, false);
    setStewardOn(s, DAY + 4, true);
    expect(s.steward?.hillfort).toBe(true);
  });

  it('starý dovoz (400 dní) hradiště nedělá, ves bez dovozu také ne', () => {
    const old = trackedVillage([], [], { storesKg: 0 });
    old.domainFoodDay = DAY - 400;
    stripSteward(old);
    setStewardOn(old, DAY, true);
    expect(old.steward?.hillfort).toBeUndefined();
    const none = trackedVillage([], [], { storesKg: 0 });
    stripSteward(none);
    setStewardOn(none, DAY, true);
    expect(none.steward?.hillfort).toBeUndefined();
  });

  it('v hradišti správce syna neposílá ani při hladu, bez hradiště ano', () => {
    const plain = lordVillage();
    plain.steward!.hungerPeak = STEWARD.departureHungerDays;
    expect(stewardDeparture(plain, AUG31, barren, barrenObstacles)).toBe(true);
    const fort = lordVillage();
    fort.steward!.hungerPeak = STEWARD.departureHungerDays;
    fort.steward!.hillfort = true;
    expect(stewardDeparture(fort, AUG31, barren, barrenObstacles)).toBe(false);
    expect(fort.steward?.departures ?? []).toHaveLength(0);
  });
});
