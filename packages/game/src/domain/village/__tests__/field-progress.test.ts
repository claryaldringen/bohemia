import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import {
  fieldCropStates,
  fieldFrontiers,
  frontierPart,
  partCropState,
  partsWorked,
  taskPosition,
  taskSpans,
  type CropState,
} from '../field-progress';
import { laborReport } from '../labor-report';
import { advanceVillage } from '../simulate';
import type { FieldPart, VillageState } from '../types';
import { planPartIds } from '../year-plan';

// Postup práce po čtvercích (fields.md; Martin, 18. 10. 2026): kopání, setí a sklizeň mění díl, až
// k němu práce dojde – díly plodiny v pořadí plánu (nejblíž obydlím první), čelo práce je díl,
// na kterém se právě pracuje; vzejití a zrání jdou podle kalendáře.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const field = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 150 + ((i * 37) % 200), // různé vzdálenosti – pořadí podle nich
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
const byId = (s: VillageState): Map<number, FieldPart> => new Map(s.parts.map((p) => [p.id, p]));
/** Stav obilí dílů plodiny v pořadí postupu. */
const statesInOrder = (s: VillageState, partIds: number[]): CropState[] => {
  const states = fieldCropStates(s, s.lastDay);
  return partIds.map((id) => states.get(id)!);
};
const LEVEL: Record<CropState, number> = {
  bare: 0,
  plowed: 1,
  sown: 2,
  sprouted: 2,
  growing: 2,
  ripe: 2,
  stubble: 3,
};

describe('pořadí a úseky dílů', () => {
  it('díly plodiny jdou od obydlí, úseky pokryjí celou práci, čelo je první nedokončený', () => {
    const s = advanceVillage(village(), at(601, 9, 1), null);
    const winter = s.plan!.winter!;
    const distances = winter.partIds.map((id) => s.parts.find((p) => p.id === id)!.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const spans = taskSpans(winter, byId(s), 'dig', s.lastDay);
    expect(spans.map((x) => x.id)).toEqual(winter.partIds);
    expect(spans[0]!.start).toBe(0);
    expect(spans.at(-1)!.end).toBeCloseTo(1, 9);
    const position = taskPosition(winter, 'dig');
    const frontier = frontierPart(winter, byId(s), 'dig', s.lastDay);
    expect(spans.find((x) => x.id === frontier)!.end).toBeGreaterThan(position);
    expect(spans.find((x) => x.id === frontier)!.start).toBeLessThanOrEqual(position + 1e-9);
  });
});

describe('postup po čtvercích', () => {
  it('kopání a setí ozimu: hotové díly v pořadí, zbytek čeká; čelo dne mezi nimi', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const states = statesInOrder(s, winter.partIds);
    // od obydlí: nejdřív zasetí, pak zkopaní, pak nedotčení – nikdy naopak
    const levels = states.map((x) => LEVEL[x]);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(states).toContain('plowed');
    expect(states).toContain('bare');
    const dug = states.filter((x) => x !== 'bare').length / states.length;
    expect(dug).toBeCloseTo(taskPosition(winter, 'dig'), 1);
    // čelo kopání ukazuje fieldFrontiers
    const frontier = frontierPart(winter, byId(s), 'dig', s.lastDay)!;
    expect(fieldFrontiers(s, s.lastDay).get(frontier)).toContain('dig');
  });

  it('rozdělení práce dne míří na díly, přes které dnes práce postoupila', () => {
    const before = advanceVillage(village(), at(601, 9, 19), null);
    const s = advanceVillage(before, at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const shares = laborReport(s)!.shares.filter(
      (x) => (x.activity === 'dig' || x.activity === 'sow') && x.target.kind === 'field',
    );
    expect(shares.length).toBeGreaterThan(0);
    for (const share of shares) {
      const parts = share.target.kind === 'field' ? (share.target.parts ?? []) : [];
      expect(parts.length).toBeGreaterThan(0);
      const task = share.activity as 'dig' | 'sow';
      const worked = partsWorked(
        winter,
        byId(s),
        task,
        s.lastDay,
        before.plan!.winter!.done[task],
        winter.done[task],
      ).map((x) => x.id);
      expect(parts).toEqual(worked);
    }
    // jen díly plánu, v pořadí postupu
    const inPlan = planPartIds(s.plan!);
    for (const share of shares) {
      if (share.target.kind !== 'field') continue;
      for (const id of share.target.parts ?? []) expect(inPlan).toContain(id);
    }
  });

  it('sklizeň ozimu v červenci: sklizené díly strniště, nesklizené zůstanou zralé', () => {
    const s = advanceVillage(village(), at(602, 7, 10), null);
    const states = statesInOrder(s, s.plan!.winter!.partIds);
    expect(states).toContain('stubble');
    expect(states).toContain('ripe');
    const levels = states.map((x) => LEVEL[x]);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });
});

describe('přirozená stadia podle kalendáře', () => {
  it('ozim: v září zasetý, přes zimu vzešlý, na jaře zelený, v červenci zralý; jař v srpnu', () => {
    let s = advanceVillage(village(), at(601, 9, 1), null);
    const winter = s.plan!.winter!.partIds;
    const spring = s.plan!.partIds;
    // 1. 9. se už začíná kopat – nic není zasetého
    for (const state of statesInOrder(s, winter)) expect(['bare', 'plowed']).toContain(state);
    s = advanceVillage(s, at(601, 9, 30), null);
    expect(statesInOrder(s, winter)).toContain('sown');
    s = advanceVillage(s, at(601, 11, 15), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['sprouted']));
    if (spring.length > 0) expect(statesInOrder(s, spring)).not.toContain('sprouted');
    s = advanceVillage(s, at(602, 5, 15), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['growing']));
    s = advanceVillage(s, at(602, 7, 1), null);
    // 1. 7. zraje a hned se začíná žnout od obydlí
    expect(statesInOrder(s, winter)).toContain('ripe');
    for (const state of statesInOrder(s, winter)) expect(['ripe', 'stubble']).toContain(state);
    s = advanceVillage(s, at(602, 8, 1), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['stubble']));
    if (spring.length > 0) expect(statesInOrder(s, spring)).toContain('ripe');
  });

  it('mimo osev null', () => {
    const s = village();
    const ready = { ...s.parts[0]!, state: 'ready' as const };
    expect(partCropState(s, ready, s.lastDay)).toBeNull();
  });
});
