import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { averageRotationShare, harvestPerPersonKg } from '../../fields/field-capacity';
import { fieldFoodShare } from '../../fields/field-food';
import { foundVillage } from '../../core/actions';
import { NO_CRAFTS } from '../../core/productivity';
import { SOWERS } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { fieldTarget } from '../steward';
import { stewardOutlook } from '../steward-outlook';
import type { FieldPart, VillageState } from '../../types';

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
    // kopání + setí + vracení přílohu jednou za roky osevu, ≥ kopání a setí bez nástrojů (100 + 3,3
    // – setí motykou 1 / 0,3 čd/ha od 9. 11. 2026, dřív 100 + 10)
    expect(o.workPerHa).toBeGreaterThanOrEqual(100 + 1 / SOWERS.hoeHaPerDay - 1e-9);
    const target = fieldTarget(s, SEPT, NO_CRAFTS, o);
    expect(target.need).toBeLessThanOrEqual(
      ((o.landPeople * o.laborHa) / o.landHa) * STEWARD.fieldReserve + 1e-9,
    );
    expect(target.have).toBeGreaterThan(target.need);
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

  it('cíl polí = maximum, které ves oseje, bez ohledu na stravu (D99, Martin 18. 11. 2026)', () => {
    // táž ves jen s obilím (podíl z pole 1) a s masem, mlékem a ovocem (z pole jen 55 % jídla);
    // v červnu osivo neomezuje – osev podle práce
    const grain = village(30);
    const meat: VillageState = {
      ...grain,
      fieldFood: { needKg: 1_000, fieldKg: 550, share: 0.55, longShare: 0.55 },
    };
    expect(fieldFoodShare(meat)).toBeLessThan(fieldFoodShare(grain));
    const of = (s: VillageState): { need: number; have: number; harvestKg: number } => {
      const o = stewardOutlook(s, JUNE, NO_CRAFTS);
      const target = fieldTarget(s, JUNE, NO_CRAFTS, o);
      // cíl = `workable` – lidé, které uživí osev podle práce a osiva, × rezerva
      const sowable = Math.min(o.laborHa, o.seedHa);
      expect(target.need).toBeCloseTo(
        ((o.landPeople * sowable) / o.landHa) * STEWARD.fieldReserve,
        9,
      );
      return { ...target, harvestKg: target.need * harvestPerPersonKg(s, JUNE) };
    };
    const a = of(grain);
    const b = of(meat);
    // v lidech „Pole uživí“ víc lidí s masem, úroda cíle a poměr k dnešním polím stejné
    expect(b.have).toBeGreaterThan(a.have);
    expect(b.harvestKg).toBeCloseTo(a.harvestKg, 6);
    expect(b.need / b.have).toBeCloseTo(a.need / a.have, 9);
  });

  it('ves bez pole v oběhu: opatrný cíl z potřeby s celou potřebou z pole (D99)', () => {
    // plná pojistka – doplnění nepotřebuje, cíl jen z lidí za 2 roky
    const grain = village(0, 20_000);
    const meat: VillageState = {
      ...grain,
      fieldFood: { needKg: 1_000, fieldKg: 550, share: 0.55, longShare: 0.55 },
    };
    expect(stewardOutlook(grain, SEPT, NO_CRAFTS).landHa).toBe(0);
    const a = fieldTarget(grain, SEPT, NO_CRAFTS);
    const b = fieldTarget(meat, SEPT, NO_CRAFTS);
    expect(a.have).toBe(0);
    expect(b.have).toBe(0);
    // lidé za 2 roky × rezerva (÷ úroda let s počasím, ≤ 1) – s podílem 1 jako dřív
    expect(a.need).toBeGreaterThanOrEqual(grain.people.length * STEWARD.fieldReserve);
    // strava cíl nezmenší: úroda, kterou cíl chce, je s masem stejná jako jen s obilím
    expect(b.need * harvestPerPersonKg(meat, SEPT)).toBeCloseTo(
      a.need * harvestPerPersonKg(grain, SEPT),
      6,
    );
    // bez lidí žádný cíl
    expect(fieldTarget({ ...grain, people: [] }, SEPT, NO_CRAFTS)).toEqual({ need: 0, have: 0 });
  });

  it('je čistý – stav nemění a stejný vstup dá stejný výhled', () => {
    const s = village(30);
    const before = JSON.stringify(s);
    const first = stewardOutlook(s, SEPT, NO_CRAFTS);
    expect(JSON.stringify(s)).toBe(before);
    expect(stewardOutlook(s, SEPT, NO_CRAFTS)).toEqual(first);
  });
});
