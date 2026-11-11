import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { dayMealInput, emergencySlaughter } from '../emergency-slaughter';
import { slaughter } from '../livestock';
import { advanceVillage } from '../../core/simulate';
import type { HerdSpecies, VillageState } from '../../types';
import { withBuiltFirstDwelling, withRoomyPens } from '../../__tests__/village-fixtures';

// Kusy poražené dnes (`LaborDay.slaughterHeads`) – jen hlášení pro scénu (porážka ve scéně).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.meatKg = 0;
  s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
  withRoomyPens(s);
  return s;
}

describe('kusy poražené dnes', () => {
  it('1. 11.: hned poražené kusy (bez těch, co čekají na zimní porážku)', () => {
    const day = at(600, 11, 1);
    const s = village(day);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 60 });
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    if (event?.kind !== 'slaughter') throw new Error('bez porážky');
    const waiting = s.livestock!.culling?.pig ?? 0;
    expect(s.livestock!.slaughtered!.day).toBe(day);
    expect(s.livestock!.slaughtered!.heads.pig).toBeCloseTo(event.animals.pig! - waiting, 1);
  });

  it('zimní den: kusy ubyvší z čekajících; den bez porážky nic nehlásí', () => {
    const day = at(600, 11, 1);
    const s = village(day - 1);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 8 });
    const nov = advanceVillage(s, day, null);
    const before = nov.livestock!.culling!.pig;
    const next = advanceVillage(nov, day + 1, null);
    const eaten = before - (next.livestock!.culling?.pig ?? 0);
    expect(eaten).toBeGreaterThan(0);
    expect(next.labor!.day).toBe(day + 1);
    expect(next.labor!.slaughterHeads!.pig).toBeCloseTo(eaten, 2);
    // léto: nic se neporáží – hlášení chybí
    const summer = advanceVillage(next, at(601, 6, 10), null);
    expect(summer.labor!.slaughterHeads).toBeUndefined();
  });

  it('nouzová porážka: kusy podle události', () => {
    const day = at(600, 12, 1);
    const s = village(day);
    s.livestock!.herds = herds({ pig: 60, sheep: 30 });
    const input = dayMealInput(s, day, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    const event = emergencySlaughter(s, day, 0, 1);
    if (event?.kind !== 'emergency-slaughter') throw new Error('bez porážky');
    expect(s.livestock!.slaughtered!.day).toBe(day);
    const heads = s.livestock!.slaughtered!.heads;
    expect(Object.keys(heads).sort()).toEqual(Object.keys(event.animals).sort());
    for (const [species, n] of Object.entries(event.animals)) {
      expect(heads[species as HerdSpecies]).toBeCloseTo(n, 1);
    }
  });

  it('nouzová porážka přes advanceVillage: hlášení je v rozvrhu práce toho dne', () => {
    const day = at(600, 12, 1);
    const s = village(day - 1);
    s.livestock!.herds = herds({ pig: 60, sheep: 30 });
    const input = dayMealInput(s, day, 0, 1);
    s.storesKg = 0.75 * input.needPerDay * input.daysToHarvest;
    const next = advanceVillage(s, day, null);
    expect(next.livestock!.slaughtered?.day).toBe(day);
    expect(next.labor!.day).toBe(day);
    expect(next.labor!.slaughterHeads).toEqual(next.livestock!.slaughtered!.heads);
  });

  it('dopočet vcelku = po kouscích (hlášení nemění stav)', () => {
    const start = village(at(600, 10, 25));
    start.livestock!.herds = herds({ pig: 40, sheep: 20, cow: 3 });
    const end = at(600, 12, 20);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 3, 17, 40];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % 4]!), null);
    }
    expect(chunked).toEqual(whole);
    expect(whole.labor!.slaughterHeads).toBeDefined();
  });
});
