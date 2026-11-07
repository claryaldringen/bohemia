import { describe, expect, it } from 'vitest';
import type { FortKind, FortTop, TileCell } from '../../types';
import {
  breachStart,
  breachStep,
  breachWork,
  defenderMultiplier,
  fortGaps,
  fortificationArea,
  areaOutline,
  fortSegments,
  refugeAdmit,
  refugeCapacity,
  segmentMultiplier,
  surrenderThreshold,
  type Arrival,
} from '..';
import type { Fortification } from '../types';

// Obrana, útočiště a prolomení (fortifications.md – Obrana, Útočiště, Prolomení).

const GEO = { size: 128, cellSizeM: 15 };
const YEAR = 365;

/** Opevnění 4 × 4 čtverce kolem středu (svět −30…30 m), úseky hotové ve dni 0. */
function fort(kind: FortKind, top?: FortTop, extra: Partial<Fortification> = {}): Fortification {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, GEO);
  if ('error' in area) throw new Error(area.error);
  const shapes = fortSegments(areaOutline(area, kind));
  return {
    id: 1,
    grid: null,
    cells,
    kind,
    ...(top ? { top } : {}),
    segments: shapes.map((s) => ({
      index: s.index,
      builtDay: 0,
      state: 1,
      ...(kind === 'rampart' && top ? { topBuiltDay: 0 } : {}),
    })),
    gates: [],
    ...extra,
  };
}

const NOW = 10;
const seg0 = (f: Fortification): Fortification['segments'][number] => f.segments[0]!;
const inside = { x: 0, z: 25 };
const outside = { x: 0, z: 80 };

describe('násobky opevnění', () => {
  const rows: [string, Fortification, number][] = [
    ['plot', fort('fence'), 1.875],
    ['palisáda', fort('palisade'), 3],
    ['val', fort('rampart'), 2.25],
    ['val s plotem', fort('rampart', 'fence'), 3],
    ['val s palisádou', fort('rampart', 'palisade'), 4.5],
  ];
  it.each(rows)('%s – obránce uvnitř proti útočníkovi vně', (_n, f, expected) => {
    expect(defenderMultiplier(GEO, [f], inside, outside, NOW)).toBeCloseTo(expected, 9);
    expect(segmentMultiplier(f, seg0(f), NOW) * 1.5).toBeCloseTo(expected, 9);
  });

  it('útočník uvnitř obvodu: jen 1,5 u domu', () => {
    expect(defenderMultiplier(GEO, [fort('palisade')], inside, { x: 2, z: 2 }, NOW)).toBe(1.5);
  });

  it('obránce mimo opevnění: 1,5', () => {
    expect(defenderMultiplier(GEO, [fort('palisade')], outside, inside, NOW)).toBe(1.5);
  });

  it('shnilá palisáda na valu = holý val 1,5', () => {
    const f = fort('rampart', 'palisade');
    expect(segmentMultiplier(f, seg0(f), NOW + 25 * YEAR)).toBeCloseTo(1.5, 9);
  });

  it('snížený val (výška 0,5) s palisádou 2,5; bez nástavby holý val 1,25', () => {
    const f = fort('rampart', 'palisade', { rampartHeight: 0.5 });
    expect(segmentMultiplier(f, seg0(f), NOW)).toBeCloseTo(2.5, 9);
    const bare = fort('rampart', undefined, { rampartHeight: 0.5 });
    expect(segmentMultiplier(bare, seg0(bare), NOW)).toBeCloseTo(1.25, 9);
  });

  it('plot v polovině chátrání: 1 + 0,25 × 0,5', () => {
    const f = fort('fence');
    expect(segmentMultiplier(f, seg0(f), 17.5 * YEAR)).toBeCloseTo(1.125, 9);
  });

  it('mezera má násobek 1, obránce u ní bere slabší ze sousedů', () => {
    const f = fort('palisade');
    f.segments[0] = { ...seg0(f), breachedDay: 3 };
    expect(segmentMultiplier(f, seg0(f), NOW)).toBe(1);
    const area = fortificationArea(f.cells!, null, GEO);
    if ('error' in area) throw new Error(area.error);
    const s = fortSegments(areaOutline(area, 'palisade'))[0]!;
    const mid = s.line.length / 2;
    // těsně uvnitř středu mezery (směr dovnitř = doprava od směru úseku)
    const d = {
      x: s.line.x + s.line.dx * mid + s.line.dz * 3,
      z: s.line.z + s.line.dz * mid - s.line.dx * 3,
    };
    expect(defenderMultiplier(GEO, [f], d, outside, NOW)).toBeCloseTo(3, 9);
    f.segments[1] = { ...f.segments[1]!, breachedDay: 3 };
    expect(defenderMultiplier(GEO, [f], d, outside, NOW)).toBeCloseTo(1.5, 9);
  });

  it('mezery: otevřená brána a průlom; zavřená brána mezera není', () => {
    const f = fort('palisade');
    f.gates = [{ segment: 4, offsetM: 7.5, x: 1, z: 2 }];
    f.segments[2] = { ...f.segments[2]!, breachedDay: 1 };
    expect(fortGaps(GEO, f, NOW).map((g) => [g.kind, g.segment])).toEqual([
      ['breach', 2],
      ['gate', 4],
    ]);
    expect(fortGaps(GEO, f, NOW, new Set([4])).map((g) => g.kind)).toEqual(['breach']);
  });
});

describe('útočiště', () => {
  it('4 × 4 čtverce (převedené na body): plot ≈ 337 lidí, val ≈ 162', () => {
    expect(Math.floor(refugeCapacity(GEO, fort('fence')) / 10)).toBe(337);
    expect(Math.round(refugeCapacity(GEO, fort('rampart')) / 10)).toBe(162);
  });

  const a = (kind: Arrival['kind'], count: number, tick = 1): Arrival => ({ kind, count, tick });

  it('pořadí při nedostatku místa: lidé → koně a voli → skot → drobný dobytek', () => {
    const r = refugeAdmit(
      100,
      [a('sheep', 8, 1), a('cow', 2, 2), a('ox', 1, 3), a('adult', 6, 4)],
      99,
    );
    const got = (k: string): number => r.admitted.find((x) => x.kind === k)?.count ?? 0;
    expect(got('adult')).toBe(6);
    expect(got('ox')).toBe(1);
    expect(got('cow')).toBe(1);
    expect(got('sheep')).toBe(0);
    expect(r.outside.find((x) => x.kind === 'cow')?.count).toBe(1);
    expect(r.usedM2).toBe(100);
  });

  it('po zavření brány zůstane venku; zásoby zvenku 25 / 10 kg, domácí nic', () => {
    const r = refugeAdmit(
      1000,
      [
        a('adult', 2, 5),
        { ...a('adult', 3, 5), homeInside: true },
        a('child', 1, 6),
        a('adult', 4, 50),
      ],
      10,
    );
    expect(r.outside).toEqual([a('adult', 4, 50)]);
    expect(r.carriedKg).toBe(2 * 25 + 10);
  });

  it('drobný dobytek zabírá čtvrt kusu', () => {
    expect(refugeAdmit(100, [a('sheep', 100)], 9).admitted[0]!.count).toBe(20);
  });
});

describe('prolomení', () => {
  const work = (f: Fortification, at: 'gate' | 'wall'): number => breachWork(f, seg0(f), at);

  it('práce 0 / 2 / 12 / 96, val podle nástavby', () => {
    expect([work(fort('fence'), 'gate'), work(fort('fence'), 'wall')]).toEqual([0, 2]);
    expect([work(fort('palisade'), 'gate'), work(fort('palisade'), 'wall')]).toEqual([12, 96]);
    expect(work(fort('rampart'), 'wall')).toBe(0);
    expect(work(fort('rampart', 'palisade'), 'wall')).toBe(96);
  });

  it('brána palisády se 4 muži za 3 hodiny, zeď za den, pátý muž nezrychlí', () => {
    expect(breachStep(breachStart(12), 4, 3).breached).toBe(true);
    expect(breachStep(breachStart(12), 4, 2.9).breached).toBe(false);
    expect(breachStep(breachStart(96), 4, 24).breached).toBe(true);
    expect(breachStep(breachStart(96), 5, 23).breached).toBe(false);
    expect(breachStep(breachStart(96), 5, 23).done).toBe(92);
    expect(breachStart(0).breached).toBe(true);
  });

  it('20 obránců za palisádou se vzdá až při 61 útočnících', () => {
    const limit = surrenderThreshold(20, 2);
    expect(limit).toBe(60);
    expect(60 > limit).toBe(false);
    expect(61 > limit).toBe(true);
  });
});
