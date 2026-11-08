import { describe, expect, it } from 'vitest';
import type { FortKind, FortTop } from '../../types';
import {
  segmentBand,
  segmentIsOld,
  segmentIsOpen,
  segmentKind,
  segmentRampart,
  segmentStands,
  segmentState,
  segmentTop,
  segmentWall,
  WALL_ORDER,
} from '..';
import type { Fortification, FortSegment } from '../types';

// Vrstvy úseku opevnění (fortifications.md – Hradby a obrana, Druhy a postup vylepšení): hradba
// a val se čtou přes `segmentWall` / `segmentRampart` – uložené stavy dávají totéž, co dřív četly
// `seg.kind ?? fort.kind` a `segmentTop`.

const YEAR = 365;

type FortHead = Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>;

function fort(kind: FortKind, top?: FortTop, extra: Partial<FortHead> = {}): FortHead {
  return { kind, ...(top ? { top } : {}), ...extra };
}

function seg(extra: Partial<FortSegment> = {}): FortSegment {
  return { index: 0, builtDay: 10, state: 1, ...extra };
}

/** Co dnes čtou `segmentKind` a `segmentTop`: hradba bez valu je druh úseku, na valu nástavba. */
function oldWallKind(f: FortHead, s: FortSegment): FortTop | null {
  const kind = s.kind ?? f.kind;
  return kind === 'rampart' ? segmentTop(f, s) : kind;
}

describe('vrstvy úseku – uložené stavy beze změny', () => {
  const cases: [string, FortHead, FortSegment][] = [
    ['plot', fort('fence'), seg()],
    ['palisáda', fort('palisade'), seg({ state: 0.4 })],
    ['val', fort('rampart'), seg()],
    ['val s palisádou', fort('rampart', 'palisade'), seg({ topBuiltDay: 20 })],
    ['val s rozestavěným plotem', fort('rampart', 'fence'), seg({ topBuiltDay: null })],
    ['rozdělané vylepšení – hotová palisáda', fort('fence'), seg({ kind: 'palisade' })],
    ['rozdělané vylepšení – plot', fort('fence'), seg()],
    ['zbořená nástavba', fort('rampart', 'palisade'), seg({ top: 'none' })],
    ['nedostavěný plot', fort('fence'), seg({ builtDay: null })],
    ['nedostavěný val', fort('rampart'), seg({ builtDay: null })],
  ];

  it.each(cases)('%s: hradba a val jako `segmentKind` a `segmentTop`', (_name, f, s) => {
    const wall = segmentWall(f, s);
    const rampart = segmentRampart(f, s);
    expect(wall?.kind ?? null).toBe(oldWallKind(f, s));
    expect(rampart !== null).toBe((s.kind ?? f.kind) === 'rampart');
    if (rampart) expect(rampart.builtDay).toBe(s.builtDay);
    if (wall && rampart) expect(wall.builtDay).toBe(s.topBuiltDay ?? null);
    if (wall && !rampart) expect(wall.builtDay).toBe(s.builtDay);
    if (wall) expect(wall.state).toBe(s.state);
    expect(segmentKind(f, s)).toBe(s.kind ?? f.kind);
  });

  it('plot: hradba stupně 1, bez valu', () => {
    expect(segmentWall(fort('fence'), seg())).toEqual({ kind: 'fence', builtDay: 10, state: 1 });
    expect(segmentRampart(fort('fence'), seg())).toBeNull();
  });

  it('val: výška dílu, jinak opevnění, jinak plná; vodní příkop podle dne napuštění', () => {
    expect(segmentRampart(fort('rampart'), seg())).toEqual({
      builtDay: 10,
      height: 1,
      outside: false,
      water: false,
    });
    const low = fort('rampart', undefined, { rampartHeight: 0.6 });
    expect(segmentRampart(low, seg())?.height).toBe(0.6);
    expect(segmentRampart(low, seg({ rampartHeight: 0.8 }))?.height).toBe(0.8);
    expect(segmentRampart(low, seg({ moatDay: 30, rampartOutside: true }))).toMatchObject({
      outside: true,
      water: true,
    });
  });

  it('stupně hradby 1–5', () => {
    expect(WALL_ORDER).toEqual(['fence', 'palisade', 'walkway', 'crib', 'chamber']);
  });
});

describe('hradba stojí, val pod ní se staví', () => {
  const f = fort('rampart', 'palisade');
  const s = seg({ kind: 'rampart', top: 'palisade', builtDay: null, topBuiltDay: 100 });

  it('hradba stojí, val nedostavěný, úsek není otevřený', () => {
    expect(segmentWall(f, s)).toEqual({ kind: 'palisade', builtDay: 100, state: 1 });
    expect(segmentRampart(f, s)?.builtDay).toBeNull();
    expect(segmentIsOpen(s)).toBe(false);
    expect(segmentStands(f, s)).toBe(true);
  });

  it('stárne hradba – stav a dožití podle dne hradby', () => {
    expect(segmentState(f, s, 100 + 10 * YEAR)).toBe(1);
    expect(segmentIsOld(f, s, 100 + 20 * YEAR)).toBe(true);
    expect(segmentState(f, s, 100 + 25 * YEAR)).toBe(0);
    expect(segmentStands(f, { ...s, state: 0 })).toBe(false);
  });
});

describe('otevřený úsek', () => {
  it('nedostavěný, prolomený nebo zbořený', () => {
    expect(segmentIsOpen(seg())).toBe(false);
    expect(segmentIsOpen(seg({ builtDay: null }))).toBe(true);
    expect(segmentIsOpen(seg({ builtDay: null, topBuiltDay: null }))).toBe(true);
    expect(segmentIsOpen(seg({ breachedDay: 5 }))).toBe(true);
    expect(segmentIsOpen(seg({ demolishedDay: 5 }))).toBe(true);
  });
});

describe('pás úseku', () => {
  it('hradba bez valu – pás druhu dovnitř', () => {
    expect(segmentBand(fort('fence'), seg())).toEqual({ inM: 1, outM: 0 });
    expect(segmentBand(fort('palisade'), seg())).toEqual({ inM: 1.5, outM: 0 });
    expect(segmentBand(fort('fence'), seg({ kind: 'palisade' }))).toEqual({ inM: 1.5, outM: 0 });
    expect(segmentBand(fort('walkway'), seg())).toEqual({ inM: 5.5, outM: 0 });
    expect(segmentBand(fort('crib'), seg())).toEqual({ inM: 7, outM: 0 });
    expect(segmentBand(fort('chamber'), seg())).toEqual({ inM: 8, outM: 0 });
  });

  it('val a hradba na valu', () => {
    expect(segmentBand(fort('rampart'), seg())).toEqual({ inM: 10, outM: 0 });
    expect(segmentBand(fort('rampart', 'palisade'), seg())).toEqual({ inM: 10, outM: 0 });
    expect(segmentBand(fort('rampart', 'palisade'), seg({ top: 'none' }))).toEqual({
      inM: 10,
      outM: 0,
    });
    expect(segmentBand(fort('rampart', 'walkway'), seg())).toEqual({ inM: 12.5, outM: 0 });
    expect(segmentBand(fort('rampart', 'chamber'), seg())).toEqual({ inM: 15, outM: 0 });
  });

  it('val doplněný vně hradby – 7 m ven, dovnitř hradba, nejméně 3 m', () => {
    const outside = { rampartOutside: true as const };
    expect(segmentBand(fort('rampart', 'palisade'), seg(outside))).toEqual({ inM: 3, outM: 7 });
    expect(segmentBand(fort('rampart', 'chamber'), seg(outside))).toEqual({ inM: 8, outM: 7 });
  });
});
