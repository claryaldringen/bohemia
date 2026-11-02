import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { craftCoverage } from '../crafts';
import { fieldOutlook } from '../field-outlook';
import { partYearWork } from '../field-progress';
import { foundVillage, type PartInput } from '../actions';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { seasonCrop, springCrop } from '../year-plan';

// Výhled osetých dílů pro panel dílu a pole (fields.md – Co hráč vidí, Očekávaná úroda a jestli
// práce stačí; návrh Clauda): úroda stejným výpočtem jako sklizeň, práce proti volné práci vsi.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const field = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 150 + ((i * 37) % 200),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
const village = (): VillageState =>
  foundVillage({
    seed: 42,
    day: at(600, 3, 15),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { parts: field(75) },
  });
const outlookOf = (s: VillageState): ReturnType<typeof fieldOutlook> =>
  fieldOutlook(s, s.lastDay, craftCoverage(s, s.lastDay), null);

describe('očekávaná úroda dílu', () => {
  it('na podzim: díly ozimu mají úrodu z úrodnosti a vlivy z ní ubírají', () => {
    const s = advanceVillage(village(), at(601, 9, 22), null);
    const winter = seasonCrop(s.season!, 'winter')!;
    const outlook = outlookOf(s);
    expect(winter.partIds.length).toBeGreaterThan(0);
    for (const id of winter.partIds) {
      const o = outlook.get(id)!;
      expect(o.crop).toBe('winter');
      expect(o.fullKg).toBeGreaterThan(0);
      // setí ozimu ještě běží – nedodělaná práce úrodu nebere
      expect(o.work).toBe(0);
      const kept = (1 - o.weather) * (1 - o.wildlife) * (1 - o.disasters) * (1 - o.work);
      expect(o.kg).toBeCloseTo(o.fullKg * kept, 6);
    }
    // díly mimo letošní osev výhled nemají
    const planned = new Set(s.season!.crops.flatMap((c) => c.partIds));
    for (const p of s.parts.filter((x) => !planned.has(x.id)))
      expect(outlook.has(p.id)).toBe(false);
  });

  it('den před žní dá výhled ozimu tolik, kolik ves sklidí', () => {
    const before = advanceVillage(village(), at(602, 7, 30), null);
    const winter = seasonCrop(before.season!, 'winter')!;
    const outlook = outlookOf(before);
    const expected = winter.partIds.reduce((sum, id) => sum + (outlook.get(id)?.kg ?? 0), 0);
    const after = advanceVillage(before, at(602, 7, 31), null);
    const harvested = seasonCrop(after.season!, 'winter')!.harvestedKg!;
    expect(harvested).toBeGreaterThan(0);
    expect(Math.abs(expected - harvested) / harvested).toBeLessThan(0.05);
    // sklizený ozim už výhled nemá
    const afterOutlook = outlookOf(after);
    for (const id of winter.partIds) expect(afterOutlook.has(id)).toBe(false);
  });

  it('nedodělané pletí po konci okna ubere úrodu jaře', () => {
    const s = advanceVillage(village(), at(602, 7, 10), null);
    const spring = springCrop(s.season!);
    const full = outlookOf(s);
    spring.done.weed = 0;
    const unweeded = outlookOf(s);
    const id = spring.partIds.find((x) => (unweeded.get(x)?.work ?? 0) > 0)!;
    expect(id).toBeDefined();
    expect(unweeded.get(id)!.kg).toBeLessThan(full.get(id)!.kg);
  });
});

describe('stačí práce do konce okna', () => {
  it('ves s dost lidmi práci stihne – díly nemají varování', () => {
    const s = advanceVillage(village(), at(601, 3, 20), null);
    const outlook = outlookOf(s);
    expect(outlook.size).toBeGreaterThan(0);
    for (const o of outlook.values()) expect(o.short).toEqual([]);
  });

  it('setí jaře nad síly vsi: nezaseté díly hlásí přípravu a setí do konce dubna, zaseté ne', () => {
    const s = advanceVillage(village(), at(601, 3, 25), null);
    const spring = springCrop(s.season!);
    spring.required.sow *= 50;
    spring.done.sow = Math.min(spring.done.sow, spring.required.sow);
    const work = partYearWork(s, s.lastDay);
    const outlook = fieldOutlook(s, s.lastDay, craftCoverage(s, s.lastDay), null, work);
    let warned = 0;
    for (const id of spring.partIds) {
      const o = outlook.get(id)!;
      const sown = (work.get(id)?.crop?.sow ?? 0) >= 1;
      const short = o.short.find((x) => x.endMonth === 4);
      if (sown) {
        expect(short?.steps.includes('sow') ?? false).toBe(false);
        continue;
      }
      expect(short).toBeDefined();
      expect(short!.steps).toContain('sow');
      expect(short!.manDays).toBeGreaterThan(0);
      warned++;
    }
    expect(warned).toBeGreaterThan(0);
  });
});
