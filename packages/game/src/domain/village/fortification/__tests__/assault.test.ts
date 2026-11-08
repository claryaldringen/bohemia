import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  assaultHours,
  assaultSteps,
  crossingLayers,
  climbTicks,
  fatigueFactor,
  fortOccupancy,
  moatFrozen,
  rampartFatigue,
  rampartPace,
  type AssaultMethod,
  type AssaultStep,
  type CrossingLayers,
} from '..';
import type { WallKind } from '../../types';
import type { FortSegment, Fortification } from '../types';

// Přechod hradby (fortifications.md – Přechod hradby): řádky tabulky se 4 muži.

const layers = (
  kind: WallKind | null,
  extra: Partial<CrossingLayers> & { state?: number } = {},
): CrossingLayers => ({
  wall: kind ? { kind, state: extra.state ?? 1 } : null,
  rampart: extra.rampart ?? null,
  gate: extra.gate ?? null,
});
const hours = (l: CrossingLayers, m: AssaultMethod, men = 4, d = 0): number => {
  const s = assaultSteps(l).find((x) => x.method === m);
  if (!s) throw new Error(`chybí postup ${m}`);
  return assaultHours(s, men, d);
};
const gate = { pincer: false, tower: false };

describe('postupy přes hradbu', () => {
  it('brána plotu 0, plot 2 mužohodiny, brána palisády 3 h, roštové 6 h', () => {
    expect(hours(layers('fence', { gate }), 'cut')).toBe(0);
    expect(hours(layers('fence'), 'cut')).toBe(0.5);
    expect(hours(layers('palisade', { gate }), 'cut')).toBe(3);
    expect(hours(layers('crib', { gate }), 'cut')).toBe(6);
    expect(hours(layers('chamber', { gate }), 'cut')).toBe(6);
  });
  it('vypálit bránu 6 h, palisádu 12 h; sekat 24 h, odkopat 20 h', () => {
    expect(hours(layers('palisade', { gate }), 'burn')).toBe(6);
    expect(hours(layers('palisade'), 'burn')).toBe(12);
    expect(hours(layers('palisade'), 'cut')).toBe(24);
    expect(hours(layers('palisade'), 'dig')).toBe(20);
    expect(hours(layers('walkway'), 'cut')).toBe(24);
  });
  it('podkop roštové 120 h, komorové 180 h, žebřík 1 h', () => {
    expect(hours(layers('crib'), 'mine')).toBe(120);
    expect(hours(layers('chamber'), 'mine')).toBe(180);
    expect(hours(layers('crib'), 'ladder')).toBe(1);
  });
  it('nehoří plot, roštová ani komorová mimo bránu; roštová nemá sekání ani odkopání', () => {
    const ms = (l: CrossingLayers): AssaultMethod[] => assaultSteps(l).map((s) => s.method);
    expect(ms(layers('fence'))).not.toContain('burn');
    expect(ms(layers('crib'))).toEqual(['ladder', 'mine']);
    expect(ms(layers('chamber'))).toEqual(['ladder', 'mine']);
    expect(ms(layers('crib', { gate }))).toContain('burn');
  });
  it('stav 0 nebo bez hradby je mezera', () => {
    expect(assaultSteps(layers('palisade', { state: 0 })).map((s) => s.method)).toEqual(['open']);
    expect(assaultSteps(layers(null)).map((s) => s.method)).toEqual(['open']);
  });
  it('palisáda na 50 % má poloviční práci', () => {
    expect(hours(layers('palisade', { state: 0.5 }), 'cut')).toBe(12);
    expect(hours(layers('palisade', { state: 0.5 }), 'burn')).toBe(6);
  });
  it('otepi ze 200 m dvojnásobek sběru, dál úměrně', () => {
    expect(hours(layers('palisade'), 'burn', 4, 200)).toBe(8 + 8);
    expect(hours(layers('palisade'), 'burn', 4, 50)).toBe(12);
  });
  it('nejvýš 4 muži na místo', () => {
    expect(hours(layers('palisade'), 'cut', 9)).toBe(24);
  });
});

describe('val a příkop', () => {
  const rampart = { height: 1, water: false };
  it('zasypat val pro oheň 20 h, jen pro palisádu; ostatní postupy bez zasypání', () => {
    const l = layers('palisade', { rampart });
    const burn = assaultSteps(l).find((s) => s.method === 'burn')!;
    expect(burn.fill).toBe('rampart');
    expect(burn.fillManHours / 4).toBe(20);
    expect(assaultSteps(l).find((s) => s.method === 'cut')!.fill).toBeNull();
  });
  it('vodní příkop 12 h před každým postupem; zamrzlý jako suchý', () => {
    const wet = assaultSteps(layers('crib', { rampart: { height: 1, water: true } }));
    expect(wet.every((s) => s.fill === 'moat' && s.fillManHours === 48)).toBe(true);
    expect(assaultSteps(layers('crib', { rampart })).every((s) => s.fill === null)).toBe(true);
  });
  it('brána má přes vodní příkop hráz či most – branou bez zasypání (návrh Clauda)', () => {
    const wet = { height: 1, water: true };
    expect(
      assaultSteps(layers('palisade', { rampart: wet, gate })).every((s) => s.fill === null),
    ).toBe(true);
    expect(assaultSteps(layers(null, { rampart: wet, gate }))).toEqual([
      expect.objectContaining({ method: 'open', fill: null }),
    ]);
  });
  it('tempo a únava podle výšky', () => {
    expect(rampartPace(1)).toBe(0.25);
    expect(rampartPace(0)).toBe(1);
    expect(rampartFatigue(1)).toBeCloseTo(0.85);
    expect(fatigueFactor(0.85, 0)).toBeCloseTo(0.85);
    expect(fatigueFactor(0.85, 60)).toBeCloseTo(0.925);
    expect(fatigueFactor(0.85, 500)).toBe(1);
  });
});

describe('zamrznutí příkopu', () => {
  const d = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
  it('měsíce 12, 1, 2', () => {
    expect(moatFrozen(d(501, 1, 15))).toBe(true);
    expect(moatFrozen(d(500, 11, 30))).toBe(false);
    expect(moatFrozen(d(500, 12, 1))).toBe(true);
    expect(moatFrozen(d(504, 2, 29))).toBe(true);
    expect(moatFrozen(d(501, 3, 1))).toBe(false);
  });
});

describe('pohyb a obsazenost', () => {
  it('časy lezení v taktech (4 za s)', () => {
    expect(climbTicks('fence')).toEqual({ lean: 0, up: 8, overLadder: 0, down: 0 });
    expect(climbTicks('palisade')).toEqual({ lean: 8, up: 16, overLadder: 16, down: 16 });
    expect(climbTicks('walkway')).toEqual({ lean: 8, up: 16, overLadder: 0, down: 8 });
    expect(climbTicks('crib')).toEqual({ lean: 8, up: 20, overLadder: 0, down: 12 });
    expect(climbTicks('chamber')).toEqual({ lean: 8, up: 24, overLadder: 0, down: 12 });
  });
  it('obsazenost 1 obránce na 5 m', () => {
    expect(fortOccupancy(3, 15)).toBe(1);
    expect(fortOccupancy(1, 15)).toBeCloseTo(1 / 3);
    expect(fortOccupancy(0, 15)).toBe(0);
  });
});

describe('crossingLayers', () => {
  const fort = {
    id: 1,
    grid: null,
    cells: [],
    kind: 'rampart',
    top: 'palisade',
    segments: [],
    gates: [{ segment: 0, offsetM: 5, x: 0, z: 0, pincerDay: 3, towerDay: null }],
  } as unknown as Fortification;
  const seg = {
    index: 0,
    builtDay: 0,
    topBuiltDay: 0,
    state: 1,
    moatDay: 1,
  } as unknown as FortSegment;
  it('val s palisádou, voda v létě, brána s klešťovou', () => {
    const l = crossingLayers(fort, seg, dayIndexOf({ year: 500, month: 7, day: 1 }), true);
    expect(l.wall?.kind).toBe('palisade');
    expect(l.rampart).toEqual({ height: 1, water: true });
    expect(l.gate).toEqual({ pincer: true, tower: false });
  });
  it('v zimě voda zamrzne, mimo bránu bez brány, prolomený úsek bez vrstev', () => {
    const l = crossingLayers(fort, seg, dayIndexOf({ year: 500, month: 1, day: 10 }), false);
    expect(l.rampart?.water).toBe(false);
    expect(l.gate).toBeNull();
    const b = crossingLayers(fort, { ...seg, breachedDay: 5 }, 10, false);
    expect(b.wall).toBeNull();
    expect(b.rampart).toBeNull();
  });
});

// dřív `breachWork` a `breachStep` v defense.test.ts (plán hradeb Úloha 14 – `breach.ts` nahradil
// `assault.ts`): práce prolomení z vrstev skutečného úseku
describe('prolomení podle vrstev úseku', () => {
  const fortOf = (kind: Fortification['kind'], top?: WallKind): Fortification =>
    ({ id: 1, kind, ...(top ? { top } : {}), segments: [], gates: [] }) as unknown as Fortification;
  const seg = { index: 0, builtDay: 0, topBuiltDay: 0, state: 1 } as FortSegment;
  const cut = (fort: Fortification, atGate: boolean): number | null =>
    assaultSteps(crossingLayers(fort, seg, 10, atGate)).find((s) => s.method === 'cut')?.manHours ??
    null;
  it('práce 0 / 2 / 12 / 96, val podle nástavby', () => {
    expect([cut(fortOf('fence'), true), cut(fortOf('fence'), false)]).toEqual([0, 2]);
    expect([cut(fortOf('palisade'), true), cut(fortOf('palisade'), false)]).toEqual([12, 96]);
    const bare = assaultSteps(crossingLayers(fortOf('rampart'), seg, 10, false));
    expect(bare.map((s) => s.method)).toEqual(['open']);
    expect(cut(fortOf('rampart', 'palisade'), false)).toBe(96);
  });
  it('brána palisády se 4 muži za 3 hodiny, zeď za den, pátý muž nezrychlí', () => {
    const steps = (atGate: boolean): AssaultStep =>
      assaultSteps(crossingLayers(fortOf('palisade'), seg, 10, atGate)).find(
        (s) => s.method === 'cut',
      )!;
    expect(assaultHours(steps(true), 4, 0)).toBe(3);
    expect(assaultHours(steps(false), 4, 0)).toBe(24);
    expect(assaultHours(steps(false), 5, 0)).toBe(24);
  });
});
