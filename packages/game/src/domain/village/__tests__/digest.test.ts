import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { domainFoodReadyYear, villageFoodBalance } from '../../vassalage/domain-food';
import { foundVillage } from '../actions';
import { VILLAGE_DIGEST_VERSION, isCurrentDigest, villageDigest } from '../digest';
import type { FarmSeason, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Souhrn vsi – pole jídla domény (hillfort.md – Jídlo domény; plán hradiště Ú6).

const SEP_15 = dayIndexOf({ year: 600, month: 9, day: 15 });
const AUG_1 = dayIndexOf({ year: 600, month: 8, day: 1 });

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  return s;
}

function threshingPlan(startDay: number): FarmSeason {
  return { startDay, crops: [] } as unknown as FarmSeason;
}

describe('villageDigest – jídlo domény', () => {
  it('nese verzi 4', () => {
    expect(VILLAGE_DIGEST_VERSION).toBe(4);
    expect(isCurrentDigest(villageDigest(village(SEP_15)))).toBe(true);
    expect(isCurrentDigest({ v: 3 })).toBe(false);
  });

  it('ves po výmlatu má domainReadyYear = rok', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    expect(villageDigest(s).domainReadyYear).toBe(600);
  });

  it('ves před žněmi nebo se snopy má domainReadyYear null', () => {
    expect(villageDigest(village(AUG_1)).domainReadyYear).toBeNull();
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.sheaves = { grainKg: 500, legumesKg: 0 };
    expect(villageDigest(s).domainReadyYear).toBeNull();
  });

  it('food je villageFoodBalance a domainReadyYear doména', () => {
    const s = village(SEP_15);
    const digest = villageDigest(s);
    expect(digest.food).toEqual(villageFoodBalance(s, s.lastDay));
    expect(digest.domainReadyYear).toBe(domainFoodReadyYear(s, s.lastDay));
  });

  it('ves bez lidí má food null', () => {
    const s = village(SEP_15);
    s.people = [];
    expect(villageDigest(s).food).toBeNull();
  });
});
