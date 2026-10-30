import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  averageRotationShare,
  averageSownShare,
  fieldCapacity,
  netYieldPerHa,
  ROTATION,
  ROTATION_FACTOR,
} from '../field-capacity';
import { FOOD_NEED_KG_PER_YEAR } from '../rules';
import type { FieldPart, Person, VillageState } from '../types';

// Pole uživí ≈ N lidí (fields.md – Co hráč vidí, Pole uživí).

const DAY = dayIndexOf({ year: 510, month: 3, day: 1 });
const adult = (id: number): Person =>
  ({ id, bornDay: DAY - 30 * 365, sex: 'male' }) as unknown as Person;
const people = (n: number): Person[] => Array.from({ length: n }, (_, i) => adult(i + 1));
const part = (over: Partial<FieldPart> = {}): FieldPart =>
  ({
    id: 1,
    fieldId: 1,
    areaM2: 10_000,
    naturalFertility: 56,
    fertilityShare: 1,
    state: 'sown',
    ...over,
  }) as FieldPart;
const state = (
  parts: FieldPart[],
  n: number,
): Pick<VillageState, 'parts' | 'people' | 'fieldFood'> => ({
  parts,
  people: people(n),
  fieldFood: undefined,
});

describe('oběh odpočatého dílu', () => {
  it('ozim 95 %, jař 83 %, úhor 5 let zpět na 95 % – pole ≈ 3,5× osevu, průměr osevu 0,89', () => {
    expect(ROTATION).toEqual({ sown: 2, fallow: 5 });
    expect(ROTATION_FACTOR).toBeCloseTo(3.5, 9);
    expect(averageSownShare()).toBeCloseTo(0.89, 9);
  });
});

describe('ustálený podíl oběhu', () => {
  it('průměr let 95, 83, 71, 76, 81, 86, 91 % = 583 / 7', () => {
    expect(averageRotationShare()).toBeCloseTo(583 / 700, 9);
    expect(averageRotationShare()).toBeLessThan(averageSownShare());
  });
});

describe('fieldCapacity s dnešní půdou', () => {
  const base = fieldCapacity(state([part({ fertilityShare: averageRotationShare() })], 5), DAY)!;

  it('ustálená půda N nemění (soil = 1)', () => {
    expect(base.soil).toBeCloseTo(1, 9);
  });

  it('čerstvá půda (1) N nezvedne', () => {
    const fresh = fieldCapacity(state([part({ fertilityShare: 1 })], 5), DAY)!;
    expect(fresh.soil).toBe(1);
    expect(fresh.people).toBeCloseTo(base.people, 9);
  });

  it('vyčerpaná půda sníží N úměrně a váží plochou', () => {
    const half = averageRotationShare() / 2;
    const worn = fieldCapacity(state([part({ fertilityShare: half })], 5), DAY)!;
    expect(worn.soil).toBeCloseTo(0.5, 9);
    expect(worn.people).toBeCloseTo(base.people * 0.5, 9);
    const mixed = fieldCapacity(
      state(
        [part({ fertilityShare: 1 }), part({ id: 2, fertilityShare: half, areaM2: 30_000 })],
        5,
      ),
      DAY,
    )!;
    expect(mixed.soil).toBeCloseTo(
      (1 * 1 + 0.5 * averageRotationShare() * 3) / 4 / averageRotationShare(),
      9,
    );
  });
});

describe('fieldCapacity', () => {
  it('ves bez lidí nebo bez pole nemá odpověď', () => {
    expect(fieldCapacity(state([part()], 0), DAY)).toBeNull();
    expect(fieldCapacity(state([], 5), DAY)).toBeNull();
    expect(fieldCapacity(state([part({ state: 'founding' })], 5), DAY)).toBeNull();
  });

  it('osev je pole v oběhu děleno oběhem a nezáleží na tom, kolik lidí ve vsi je', () => {
    const parts = [part({ areaM2: 50_000 }), part({ id: 2, areaM2: 30_000, state: 'fallow' })];
    const few = fieldCapacity(state(parts, 4), DAY)!;
    const many = fieldCapacity(state(parts, 40), DAY)!;
    expect(few.rotationHa).toBeCloseTo(8, 6);
    expect(few.sownHa).toBeCloseTo(8 / ROTATION_FACTOR, 6);
    expect(many.people).toBeCloseTo(few.people, 6);
  });

  it('víc pole uživí úměrně víc lidí a lepší půda víc než horší', () => {
    const one = fieldCapacity(state([part()], 5), DAY)!;
    const two = fieldCapacity(state([part({ areaM2: 20_000 })], 5), DAY)!;
    const rich = fieldCapacity(state([part({ naturalFertility: 80 })], 5), DAY)!;
    expect(two.people).toBeCloseTo(2 * one.people, 6);
    expect(rich.people).toBeGreaterThan(one.people);
  });

  it('dospělý potřebuje z pole víc než zlomek jeho roční potřeby – pojistka zásob se přidává', () => {
    const cap = fieldCapacity(state([part({ areaM2: 100_000 })], 5), DAY)!;
    const harvestKg = cap.sownHa * netYieldPerHa(56);
    expect(cap.people).toBeLessThan(harvestKg / FOOD_NEED_KG_PER_YEAR.adult);
    expect(cap.people).toBeGreaterThan(0.4 * (harvestKg / FOOD_NEED_KG_PER_YEAR.adult));
  });

  it('zarostlý příloh a zakládaný díl do oběhu nepatří', () => {
    const cap = fieldCapacity(
      state(
        [
          part(),
          part({ id: 2, state: 'fallow', overgrowthYears: 30 }),
          part({ id: 3, state: 'founding' }),
        ],
        5,
      ),
      DAY,
    )!;
    expect(cap.rotationHa).toBeCloseTo(1, 6);
  });
});
