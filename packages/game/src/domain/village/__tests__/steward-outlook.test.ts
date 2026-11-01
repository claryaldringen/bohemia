import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { averageRotationShare } from '../field-capacity';
import { foundVillage } from '../actions';
import { NO_CRAFTS } from '../productivity';
import { STEWARD } from '../rules-steward';
import { fieldTarget } from '../steward';
import { stewardOutlook } from '../steward-outlook';
import { stewardCrowded } from '../steward-son';
import type { FieldPart, VillageState } from '../types';

const SEPT = dayIndexOf({ year: 504, month: 9, day: 1 });
const JUNE = dayIndexOf({ year: 505, month: 6, day: 1 });

function part(id: number, ha: number): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: ha * 10_000,
    distanceM: 60,
    naturalFertility: 0.8,
    fertilityShare: averageRotationShare(),
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

/** Ves zakladatelů s polem `ha` hektarů (díly po hektaru) a zásobami `storesKg`. */
function village(ha: number, storesKg = 3_000): VillageState {
  const s = foundVillage({ seed: 7, day: SEPT, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.parts = Array.from({ length: ha }, (_, i) => part(i + 1, 1));
  s.storesKg = storesKg;
  return s;
}

describe('výhled vsi – model kapacity (steward.md – Model kapacity vsi)', () => {
  it('malé pole: hrdlem půda, udržitelní = „Pole uživí“', () => {
    const o = stewardOutlook(village(2), SEPT, NO_CRAFTS);
    expect(o.lasting).toBe('land');
    expect(o.bottleneck).toBe('land');
    expect(o.laborHa).toBeGreaterThan(o.landHa);
    expect(o.sustainablePeople).toBeCloseTo(o.landPeople, 6);
  });

  it('velké pole pro pět zakladatelů: hrdlem práce v oknech setí, cíl polí podle práce', () => {
    const s = village(80);
    const o = stewardOutlook(s, SEPT, NO_CRAFTS);
    expect(o.lasting).toBe('labor');
    expect(o.laborHa).toBeLessThan(o.landHa);
    expect(o.sustainablePeople).toBeLessThan(o.landPeople);
    // kopání + setí + vracení přílohu jednou za roky osevu, ≥ kopání a setí bez nástrojů
    expect(o.workPerHa).toBeGreaterThanOrEqual(110);
    const target = fieldTarget(s, SEPT, NO_CRAFTS, o);
    expect(target.need).toBeLessThanOrEqual(
      ((o.landPeople * o.laborHa) / o.landHa) * STEWARD.fieldReserve + 1e-9,
    );
    expect(target.have).toBeGreaterThan(target.need);
    // přelidnění podle udržitelných lidí, ne podle půdy
    expect(stewardCrowded(s, SEPT, NO_CRAFTS, o)).toBe(
      s.people.length > o.sustainablePeople * STEWARD.crowdedShare,
    );
  });

  it('osivo brzdí jen do konce setí – v září bez zásob hrdlem osivo, trvale ne', () => {
    const empty = village(10, 0);
    empty.legumesKg = 0;
    const sept = stewardOutlook(empty, SEPT, NO_CRAFTS);
    expect(sept.seedHa).toBeLessThan(sept.landHa);
    expect(sept.bottleneck).toBe('seed');
    expect(sept.lasting).not.toBe('seed');
    expect(stewardOutlook(empty, JUNE, NO_CRAFTS).seedHa).toBe(Infinity);
  });

  it('je čistý – stav nemění a stejný vstup dá stejný výhled', () => {
    const s = village(30);
    const before = JSON.stringify(s);
    const first = stewardOutlook(s, SEPT, NO_CRAFTS);
    expect(JSON.stringify(s)).toBe(before);
    expect(stewardOutlook(s, SEPT, NO_CRAFTS)).toEqual(first);
  });
});
