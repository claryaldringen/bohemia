import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../../village/actions';
import { craftCoverage } from '../../village/crafts';
import { yearlyFieldNeed } from '../../village/field-food';
import { fieldSowingTargets } from '../../village/simulate-plan';
import { stewardOutlook } from '../../village/steward-outlook';
import { SEED_KG_PER_HA } from '../../village/rules-fields';
import type { FarmSeason, FieldPart, VillageState } from '../../village/types';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import {
  cattleFoodKg,
  domainFoodReadyYear,
  domainNeedKg,
  domainOffer,
  lastSowingSeedKg,
  villageFoodBalance,
} from '../domain-food';
import { VASSALAGE } from '../rules-vassalage';
import { cattleSpare } from '../spare';

// Jídlo domény – ves (hillfort.md – Jídlo domény). Ves ve tvaru Vlkova jako ve spare.test.ts.

const SEP_15 = dayIndexOf({ year: 600, month: 9, day: 15 });
const OCT_1 = dayIndexOf({ year: 600, month: 10, day: 1 });
const FEB_1 = dayIndexOf({ year: 601, month: 2, day: 1 });

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 10_000;
  return s;
}

/** Plán u výmlatu: ozim a luštěniny s osivem, jař s osivem; len bez obilného osiva. */
function threshingPlan(startDay: number): FarmSeason {
  const crop = (name: string, seedKg: number): unknown => ({ crop: name, partIds: [], seedKg });
  return {
    startDay,
    crops: [crop('winter', 200), crop('spring', 100), crop('legume', 50), crop('flax', 20)],
  } as unknown as FarmSeason;
}

describe('domainFoodReadyYear', () => {
  it('po žni se snopy čeká, bez snopů je ves připravená, 1. 10. i se snopy, v únoru ne', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.sheaves = { grainKg: 500, legumesKg: 0 };
    expect(domainFoodReadyYear(s, SEP_15)).toBeNull();
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    expect(domainFoodReadyYear(s, SEP_15)).toBe(600);
    s.sheaves = { grainKg: 500, legumesKg: 0 };
    s.threshingSeason = null;
    expect(domainFoodReadyYear(s, OCT_1)).toBe(600);
    expect(domainFoodReadyYear(s, FEB_1)).toBeNull();
  });

  it('bez plánu u výmlatu a před 1. 10. ve vsi bez sklizně null', () => {
    expect(domainFoodReadyYear(village(SEP_15), SEP_15)).toBeNull();
  });
});

describe('lastSowingSeedKg', () => {
  it('osivo obilí z plánu u výmlatu – luštěniny a len ne', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    expect(lastSowingSeedKg(s, SEP_15)).toBe(300);
  });

  it('bez plánu osev, který ves zvládne, jako ve výhledu přebytku', () => {
    const s = village(OCT_1);
    const o = stewardOutlook(s, OCT_1, craftCoverage(s, OCT_1));
    expect(lastSowingSeedKg(s, OCT_1)).toBe(Math.min(o.landHa, o.laborHa) * SEED_KG_PER_HA);
  });
});

describe('domainOffer', () => {
  it('obilí nad dvě roční potřeby jídla a osiva, dobytek nad chovné jádro', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.storesKg = 10_000;
    const keep = VASSALAGE.reserveYears * (yearlyFieldNeed(s, SEP_15) + 300);
    const offer = domainOffer(s, SEP_15);
    expect(offer.grainKg).toBe(Math.floor(10_000 - keep));
    expect(offer.cattle).toEqual(cattleSpare(s, SEP_15));
  });

  it('nevymlácené snopy se počítají, chudá ves nedá nic, ves v hladu také', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.storesKg = 0;
    expect(domainOffer(s, SEP_15).grainKg).toBe(0);
    s.sheaves = { grainKg: 20_000, legumesKg: 0 };
    expect(domainOffer(s, SEP_15).grainKg).toBeGreaterThan(0);
    s.hungry = true;
    expect(domainOffer(s, SEP_15)).toEqual({
      grainKg: 0,
      cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
    });
  });
});

describe('domainNeedKg', () => {
  it('je týž výhled jako správce v nouzi (shortKg)', () => {
    const s = village(OCT_1);
    s.storesKg = 10;
    const need = domainNeedKg(s, OCT_1);
    expect(need).toBe(fieldSowingTargets(s, OCT_1, craftCoverage(s, OCT_1)).shortKg);
    expect(need).toBeGreaterThan(0);
  });

  it('ves bez lidí nepotřebuje nic', () => {
    const s = village(OCT_1);
    s.people = [];
    expect(domainNeedKg(s, OCT_1)).toBe(0);
  });
});

describe('cattleFoodKg', () => {
  it('kus je 72 kg obilí (120 kg masa × 0,6)', () => {
    expect(cattleFoodKg({ cows: 2, youngOxen: 1, trainedOxen: 0 })).toBe(216);
  });
});

describe('villageFoodBalance', () => {
  it('ves s polem má kladnou úrodu i potřebu, ves bez lidí null', () => {
    const s = village(OCT_1);
    // pole v oběhu: hektar osetého dílu
    s.parts = [
      {
        id: 1,
        fieldId: 1,
        areaM2: 10_000,
        naturalFertility: 56,
        fertilityShare: 1,
        state: 'sown',
      } as FieldPart,
    ];
    const balance = villageFoodBalance(s, OCT_1);
    expect(balance).not.toBeNull();
    expect(balance!.growsKg).toBeGreaterThan(0);
    expect(balance!.needsKg).toBeGreaterThan(0);
    s.people = [];
    expect(villageFoodBalance(s, OCT_1)).toBeNull();
  });
});

describe('čistota', () => {
  it('žádná funkce nemění vstupní stav', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    const before = structuredClone(s);
    domainFoodReadyYear(s, SEP_15);
    lastSowingSeedKg(s, SEP_15);
    domainOffer(s, SEP_15);
    domainNeedKg(s, SEP_15);
    villageFoodBalance(s, SEP_15);
    expect(s).toEqual(before);
  });
});
