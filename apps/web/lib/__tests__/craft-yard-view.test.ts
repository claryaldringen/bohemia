import { describe, expect, it } from 'vitest';
import {
  CARPENTRY,
  dayIndexOf,
  foundVillage,
  type VillageState,
  type WorkshopActivity,
} from '@bohemia/game';
import {
  CART_BUILD_STAGES,
  CRAFT_YARD_STEPS,
  cartBuildStage,
  craftYard,
  workshopSmokes,
  yardStage,
} from '../village-view-crafts';

// Dvůr kovárny a hrnčíře v pohledu na ves (production-chains.md – Kovář; crafts.md – Hlína
// hrnčíře): činnost kováře dne, měchař, houba a hřivny po stupních, hlína v jámě a šlapání.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const born = (age: number): number => DAY - age * 365 - 30;

/** Ves s kovárnou 50 (kovář 41 let, syn 11 let) a hrnčířem 60. */
function yardVillage(smith: WorkshopActivity, potter: WorkshopActivity, clayKg = 0): VillageState {
  const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -50, z: -50, rotation: 0 } });
  const base = { type: 'polozemnice' as const, builtDay: DAY - 400, condition: 1 };
  s.dwellings.push(
    {
      ...base,
      id: 50,
      position: { x: 0, z: 0, rotation: 0 },
      workshop: { craft: 'smith', felling: null, fuelKg: 0, activity: smith },
    },
    {
      ...base,
      id: 60,
      position: { x: 20, z: 0, rotation: 0 },
      workshop: { craft: 'potter', felling: null, fuelKg: 0, activity: potter, clayKg },
    },
  );
  s.people.push(
    { id: 900, bornDay: born(41), dwellingId: 50, sex: 'male' },
    { id: 901, bornDay: born(11), dwellingId: 50, sex: 'male', fatherId: 900 },
    { id: 910, bornDay: born(35), dwellingId: 60, sex: 'male' },
  );
  s.crafts = { charcoalKg: 100, potteryKg: 0, bloomKg: 4, ironBarsKg: 25 };
  return s;
}

const dwelling = (s: VillageState, id: number): VillageState['dwellings'][number] =>
  s.dwellings.find((d) => d.id === id)!;

describe('dvůr dílny v pohledu na ves (production-chains.md – Kovář)', () => {
  it('stupně zásob – hranice CRAFT_YARD_STEPS', () => {
    expect(yardStage(0, CRAFT_YARD_STEPS.bloomKg)).toBe(0);
    expect(yardStage(1, CRAFT_YARD_STEPS.bloomKg)).toBe(1);
    expect(yardStage(4, CRAFT_YARD_STEPS.bloomKg)).toBe(2);
    expect(yardStage(50, CRAFT_YARD_STEPS.bloomKg)).toBe(3);
  });

  it('tavba – kovář s měchařem z domácnosti, houba a hřivny po stupních', () => {
    const s = yardVillage('smelting', 'idle');
    // dospělý bratr kováře šlape měch (production-chains.md – Kovář, Měch)
    s.people.push({ id: 902, bornDay: born(22), dwellingId: 50, sex: 'male' });
    const yard = craftYard(s, dwelling(s, 50), DAY, 1);
    expect(yard).toEqual({ task: 'smelt', bellows: true, bloom: 2, bars: 3 });
    // zásoba je společná – dvě kovárny ji dělí
    expect(craftYard(s, dwelling(s, 50), DAY, 2)).toMatchObject({ bloom: 1, bars: 2 });
    expect(workshopSmokes(dwelling(s, 50).workshop!)).toBe(true);
  });

  it('kovář sám – syn u měchu jen podle rozdělení práce dne, jinak bez měchaře', () => {
    const s = yardVillage('smelting', 'idle');
    expect(craftYard(s, dwelling(s, 50), DAY, 1)?.bellows).toBeUndefined();
  });

  it('překování a kování nástrojů – kouří výheň, měchař u tavby není', () => {
    for (const [activity, task] of [
      ['refining', 'refine'],
      ['producing', 'forge'],
    ] as const) {
      const s = yardVillage(activity, 'idle');
      const yard = craftYard(s, dwelling(s, 50), DAY, 1);
      expect(yard?.task).toBe(task);
      expect(yard?.bellows).toBeUndefined();
      expect(workshopSmokes(dwelling(s, 50).workshop!)).toBe(true);
    }
    const idle = yardVillage('digging', 'idle');
    expect(craftYard(idle, dwelling(idle, 50), DAY, 1)?.task).toBeUndefined();
    expect(workshopSmokes(dwelling(idle, 50).workshop!)).toBe(false);
  });

  it('hrnčíř – hlína v jámě po stupních, šlape jen když vyrábí', () => {
    const s = yardVillage('idle', 'producing', 80);
    expect(craftYard(s, dwelling(s, 60), DAY, 1)).toEqual({ clay: 2, treading: true });
    const resting = yardVillage('idle', 'digging', 200);
    expect(craftYard(resting, dwelling(resting, 60), DAY, 1)).toEqual({ clay: 3 });
    const empty = yardVillage('idle', 'no-clay', 0);
    expect(craftYard(empty, dwelling(empty, 60), DAY, 1)).toBeNull();
  });
});

describe('rozdělaný vůz u tesaře (villagers.md – Fáze činností, Tesař; úloha 11)', () => {
  /** Ves s tesařem 70 a rozdělaným vozem (`done` člověkodní dřevěné práce). */
  function carpenterVillage(done: number | null): VillageState {
    const s = foundVillage({
      seed: 7,
      day: DAY,
      dwellingPosition: { x: -50, z: -50, rotation: 0 },
    });
    s.dwellings.push({
      type: 'polozemnice',
      builtDay: DAY - 400,
      condition: 1,
      id: 70,
      position: { x: 0, z: 0, rotation: 0 },
      workshop: {
        craft: 'carpenter',
        felling: null,
        fuelKg: 0,
        activity: 'producing',
        ...(done === null ? {} : { cart: { kind: 'two-wheel' as const, done } }),
      },
    });
    return s;
  }

  it('fáze stavby podle průběhu dřevěné práce – korba, kola, hotový vůz', () => {
    expect(cartBuildStage(0)).toBe(1);
    expect(cartBuildStage(CART_BUILD_STAGES.wheels - 0.01)).toBe(1);
    expect(cartBuildStage(CART_BUILD_STAGES.wheels)).toBe(2);
    expect(cartBuildStage(0.99)).toBe(2);
    expect(cartBuildStage(1)).toBe(3);
  });

  it('vůz vzniká se dny výroby – den po dni přibývá práce, fáze roste', () => {
    const total = CARPENTRY.cartManDays['two-wheel'];
    expect(craftYard(carpenterVillage(null), dwelling(carpenterVillage(null), 70), DAY, 0)).toBe(
      null,
    );
    // tesař dělá vůz den po dni (workCarpenter) – fáze dvora sleduje průběh
    const stages = [0, 0.3, 0.6, 0.9, 1].map((share) => {
      const s = carpenterVillage(share * total);
      return craftYard(s, dwelling(s, 70), DAY, 0)?.cart;
    });
    expect(stages).toEqual([
      { kind: 'two-wheel', stage: 1 },
      { kind: 'two-wheel', stage: 1 },
      { kind: 'two-wheel', stage: 2 },
      { kind: 'two-wheel', stage: 2 },
      { kind: 'two-wheel', stage: 3 },
    ]);
    // tesař netopí
    expect(workshopSmokes(dwelling(carpenterVillage(0), 70).workshop!)).toBe(false);
  });
});
