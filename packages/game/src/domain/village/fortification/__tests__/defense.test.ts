import { describe, expect, it } from 'vitest';
import type { FortKind, FortTop, TileCell } from '../../types';
import {
  breachStart,
  breachStep,
  breachWork,
  fortGaps,
  fortificationArea,
  areaOutline,
  fortSegments,
  fortHasWall,
  fortsContaining,
  refugeAdmit,
  refugeCapacity,
  segmentIsGap,
  type Arrival,
} from '..';
import type { Fortification } from '../types';

// Obrana, útočiště a prolomení (fortifications.md – Obrana, Útočiště, Prolomení).

const GEO = { size: 128, cellSizeM: 15 };

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

// Násobek obrany zrušen 8. 11. 2026 (fortifications.md – Obrana bez násobku; Martin: „Násobek obrany
// je píčovina.“) – testy násobků (tabulka, „zná místo“ 1,5, výška valu, chátrání, mezera s násobkem
// 1 a slabší soused) jsou pryč; zůstává mezera a nově kdo stojí uvnitř obvodu.
describe('mezery a obvod (Obrana bez násobku)', () => {
  it('průlom je mezera, stojící úsek ne', () => {
    const f = fort('palisade');
    f.segments[0] = { ...seg0(f), breachedDay: 3 };
    expect(segmentIsGap(f, seg0(f), NOW)).toBe(true);
    expect(segmentIsGap(f, f.segments[1]!, NOW)).toBe(false);
  });

  it('kdo stojí uvnitř obvodu: pořadí opevnění, mimo null', () => {
    const f = fort('palisade');
    expect(fortsContaining(GEO, [f], [inside, outside])).toEqual([0, null]);
    expect(fortsContaining(GEO, [], [inside])).toEqual([null]);
  });

  it('za opevněním se dá schovat, jen když stojí aspoň jeden úsek', () => {
    const f = fort('palisade');
    expect(fortHasWall(f, NOW)).toBe(true);
    const planned = { ...f, segments: f.segments.map((x) => ({ ...x, builtDay: null })) };
    expect(fortHasWall(planned, NOW)).toBe(false);
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
});
