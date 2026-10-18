import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { fieldPartLooks, hayMeadowLooks } from '../field-progress';
import { HAY, feedHay, isHayMeadow, mow, oxenHayCoverage, planMowing } from '../hay';
import { advanceVillage } from '../simulate';
import type { FieldPart, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Seno (oxen.md – Seno): seč úhoru ve fázi louky podle potřeby stáda, zásoba a zimní krmení.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

function meadow(id: number, distanceM: number, sinceYear = 595): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM,
    naturalFertility: 70,
    fertilityShare: 0.8,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: at(sinceYear, 9, 1),
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.fields = [{ id: 1 }];
  return s;
}

describe('plán seče', () => {
  it('seče se jen úhor ve fázi louky, od obydlí, dokud seno nepokryje potřebu stáda', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    s.parts = [meadow(1, 300), meadow(2, 100), meadow(3, 200), meadow(4, 50, 599)];
    expect(isHayMeadow(s.parts[3]!, day)).toBe(false); // mladý příloh
    // 2 kusy × 1,5 t = 3 t → dva hektary nejblíž
    const mowing = planMowing(s, day, 2)!;
    expect(mowing.partIds).toEqual([2, 3]);
    expect(mowing.yieldKg).toBeCloseTo(2 * HAY.yieldKgPerHa, 9);
    // 6 čd/ha, díl 200 m od obydlí o 10 % dráž
    expect(mowing.required).toBeCloseTo(6 + 6 * 1.1, 9);
    // zásoba se odečte, bez potřeby se neseče
    s.hay = { kg: 2500, mowing: null };
    expect(planMowing(s, day, 2)!.partIds).toEqual([2]);
    s.hay.kg = 5000;
    expect(planMowing(s, day, 2)).toBeNull();
  });

  it('posečené seno přibude do zásoby poměrně k práci', () => {
    const s = village(at(600, 6, 1));
    s.hay = { kg: 0, mowing: { partIds: [1], required: 6, done: 0, yieldKg: 1500 } };
    mow(s, 3);
    expect(s.hay.kg).toBeCloseTo(750, 9);
    mow(s, 10);
    expect(s.hay.kg).toBeCloseTo(1500, 9);
  });
});

describe('zimní krmení', () => {
  it('voli dostanou seno první, krávy zbytek; pokrytí volů k 1. 3. i se zbytkem zimy', () => {
    const s = village(at(600, 11, 1));
    s.hay = { kg: 50, mowing: null };
    feedHay(s, 2, 3);
    expect(s.hay.winter).toEqual({ oxenNeedKg: 20, oxenEatenKg: 20 });
    expect(s.hay.kg).toBeCloseTo(0, 9);
    feedHay(s, 2, 3);
    expect(s.hay.winter).toEqual({ oxenNeedKg: 40, oxenEatenKg: 20 });
    // březen bez sena: (20 + 0) / (40 + 2 × 10 × 31)
    expect(oxenHayCoverage(s, 2)).toBeCloseTo(20 / 660, 9);
    expect(oxenHayCoverage(village(at(600, 3, 1)), 0)).toBe(1);
  });
});

describe('simulace – seno za rok', () => {
  it('v červnu a červenci se seče po dílech, stohy stojí a přes zimu se zkrmí', () => {
    const s = village(at(600, 5, 1));
    s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
    s.livestock!.herds.cow = 2;
    const june = advanceVillage(s, at(600, 6, 10), null);
    expect(june.hay!.mowing!.partIds).toEqual([1, 2]);
    const looks = fieldPartLooks(june, june.lastDay);
    expect(looks.get(1)?.look).toBe('mown');
    expect(looks.get(3)?.look).toBe('pasture');
    const summer = advanceVillage(june, at(600, 8, 1), null);
    expect(summer.hay!.kg).toBeCloseTo(3000, 6);
    expect(summer.labor).toBeDefined();
    expect(fieldPartLooks(summer, summer.lastDay).get(2)?.look).toBe('haystacks');
    const spring = advanceVillage(summer, at(601, 4, 1), null);
    expect(spring.hay!.kg).toBeLessThan(summer.hay!.kg);
  });
});

describe('seno ze všech luk', () => {
  it('s krajinou se seče i přirozená louka do 600 m od obydlí – nejbližší napřed', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    // obydlí uprostřed krajiny 16 × 16 políček po 15 m, louka všude kromě lesa vlevo
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    s.parts = [meadow(1, 400)];
    const landscape = makeLandscape({ surface: (x) => (x < 4 ? 'forest' : 'meadow') });
    const mowing = planMowing(s, day, 2, landscape)!;
    // 3 t sena = 2 ha ≈ 89 políček přirozené louky nejblíž obydlí (díl úhoru je dál)
    expect(mowing.squares!.length).toBeGreaterThan(80);
    expect(mowing.squares![0]!.cell).toBeDefined();
    expect(mowing.squares!.every((sq) => sq.partId === undefined)).toBe(true);
    const distances = mowing.squares!.map((sq) => sq.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    // žádné políčko lesa ani pod obydlím
    expect(mowing.squares!.some((sq) => (sq.cell?.x ?? 99) < 4)).toBe(false);
    expect(mowing.yieldKg).toBeGreaterThanOrEqual(3000);
  });

  it('louky se řadí podle chůze po pěšinách – díly i přirozené louky (paths.md)', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    // díl úhoru rovně 400 m, po pěšině jen 5 m – seče se první
    s.parts = [{ ...meadow(1, 400), areaM2: 2_000, walkDistanceM: 5 }];
    const landscape = makeLandscape();
    // po pěšině na východ (x > 0) se jde o pětinu rychleji
    const measured: number[] = [];
    const walk = (targets: readonly { x: number; z: number }[]): number[] => {
      measured.push(targets.length);
      return targets.map((t) => Math.hypot(t.x, t.z) * (t.x > 0 ? 0.8 : 1));
    };
    const mowing = planMowing(s, day, 2, landscape, walk)!;
    expect(mowing.squares![0]!.partId).toBe(1);
    expect(mowing.squares![0]!.distanceM).toBe(5);
    const natural = mowing.squares!.filter((sq) => sq.cell !== undefined);
    const east = natural.filter((sq) => sq.cell!.x >= 8).length;
    expect(east).toBeGreaterThan(natural.length - east);
    const distances = mowing.squares!.map((sq) => sq.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    // síť měří jen louky, které se do seče mohou dostat (chůze ≥ 3/4 přímé vzdálenosti)
    expect(measured).toHaveLength(1);
    expect(measured[0]!).toBeGreaterThan(natural.length);
    expect(measured[0]!).toBeLessThan(16 * 16 - 1);
    // bez sítě pěšin (null) se měří rovně
    const straight = planMowing(s, day, 2, landscape, () => null)!;
    const straightNatural = straight.squares!.filter((sq) => sq.cell !== undefined);
    const straightEast = straightNatural.filter((sq) => sq.cell!.x >= 8).length;
    expect(Math.abs(2 * straightEast - straightNatural.length)).toBeLessThan(
      east * 2 - natural.length,
    );
  });

  it('posečená přirozená louka má vzhled seče, stohy od poloviny července', () => {
    const s = village(at(600, 5, 30));
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    s.livestock!.herds.cow = 1;
    const landscape = makeLandscape();
    const june = advanceVillage(s, at(600, 6, 10), null, landscape);
    const looks = hayMeadowLooks(june, june.lastDay);
    expect(looks.length).toBeGreaterThan(0);
    expect(looks.some((v) => v.look === 'mown')).toBe(true);
    const august = advanceVillage(june, at(600, 8, 1), null, landscape);
    expect(hayMeadowLooks(august, august.lastDay).every((v) => v.look === 'haystacks')).toBe(true);
    expect(august.hay!.kg).toBeGreaterThan(1000);
  });
});
