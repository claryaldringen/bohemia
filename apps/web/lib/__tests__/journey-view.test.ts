import { describe, expect, it } from 'vitest';
import type { JourneyView } from '@bohemia/game';
import {
  interpolateJourney,
  journeyReason,
  knownEyeState,
  nextKnownCell,
  UNKNOWN_MAP,
} from '../journey-view';

describe('journeyReason', () => {
  it('vrací přesně texty z rozhraní', () => {
    expect(journeyReason('unreachable')).toBe('Tam vojvoda nedojde.');
    expect(journeyReason('lord-wounded')).toBe('Vojvoda je raněný.');
    expect(journeyReason('lord-away')).toBe('Vojvoda je na tažení.');
    expect(journeyReason('village-attacked')).toBe('Ves je napadena.');
    expect(journeyReason('war-there')).toBe('Tam je válka.');
  });

  it('každý důvod má český text bez dlouhé pomlčky', () => {
    for (const r of [
      'no-lord',
      'lord-young',
      'lord-wounded',
      'lord-away',
      'village-attacked',
      'journey-active',
      'bad-retinue',
      'unreachable',
      'war-there',
      'refused',
    ] as const) {
      expect(journeyReason(r)).toMatch(/\S.*\.$/);
      expect(journeyReason(r)).not.toContain('—');
    }
  });
});

const view = (over: Partial<JourneyView> = {}): JourneyView => ({
  journeyId: 'j1',
  tick: 10,
  day: 5,
  phase: 'out',
  cell: { x: 1, y: 1 },
  home: { x: 0, y: 0 },
  men: [],
  group: { pos: { x: 0, z: 0 }, goal: null, arrived: false },
  waitDaysLeft: null,
  controllable: true,
  seen: null,
  ...over,
});

describe('interpolateJourney', () => {
  it('posune polohu skupiny mezi dvěma stavy na téže mapě', () => {
    const next = view({ tick: 12, group: { pos: { x: 10, z: 20 }, goal: null, arrived: false } });
    expect(interpolateJourney(view(), next, 0.5).group.pos).toEqual({ x: 5, z: 10 });
  });

  it('na jiné mapě, bez předchozího stavu nebo po čase stojí rovnou v novém', () => {
    const next = view({
      cell: { x: 2, y: 1 },
      group: { pos: { x: 9, z: 9 }, goal: null, arrived: false },
    });
    expect(interpolateJourney(view(), next, 0.5)).toBe(next);
    expect(interpolateJourney(null, next, 0.5)).toBe(next);
    expect(interpolateJourney(view(), next, 1)).toBe(next);
  });
});

describe('nextKnownCell', () => {
  const known = [
    { cell: { x: 2, y: 0 }, houseId: 'b' },
    { cell: { x: 1, y: 0 }, houseId: 'b' },
    { cell: { x: 5, y: 5 }, houseId: 'c' },
    { cell: { x: 9, y: 9 }, houseId: null },
  ];

  it('rod bez známé mapy → null, text zašedlého oka je z rozhraní', () => {
    expect(nextKnownCell(known, 'zzz', null)).toBeNull();
    expect(UNKNOWN_MAP).toBe('Tu mapu rod nezná.');
  });

  it('první klik otevře první mapu rodu, další klik další a po poslední znovu první', () => {
    const first = nextKnownCell(known, 'b', null);
    expect(first).toEqual({ x: 1, y: 0 });
    const second = nextKnownCell(known, 'b', first);
    expect(second).toEqual({ x: 2, y: 0 });
    expect(nextKnownCell(known, 'b', second)).toEqual({ x: 1, y: 0 });
  });

  it('jediná mapa zůstává; poslední otevřená z jiného rodu se ignoruje', () => {
    expect(nextKnownCell(known, 'c', { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(nextKnownCell(known, 'c', { x: 1, y: 0 })).toEqual({ x: 5, y: 5 });
  });
});

describe('knownEyeState', () => {
  const known = [{ cell: { x: 1, y: 0 }, houseId: 'b' }];

  it('bez cíle (houseId null) oko chybí', () => {
    expect(knownEyeState('ready', known, null, null)).toEqual({ kind: 'hidden' });
    expect(knownEyeState('loading', known, null, null)).toEqual({ kind: 'hidden' });
  });

  it('seznam se načítá nebo dotaz selhal → zašedlé bez důvodu', () => {
    expect(knownEyeState('loading', [], 'b', null)).toEqual({ kind: 'pending' });
    expect(knownEyeState('error', [], 'b', null)).toEqual({ kind: 'pending' });
  });

  it('načtený seznam: mapa je známá → otevře; není → „Tu mapu rod nezná.“', () => {
    expect(knownEyeState('ready', known, 'b', null)).toEqual({
      kind: 'open',
      cell: { x: 1, y: 0 },
    });
    expect(knownEyeState('ready', known, 'c', null)).toEqual({ kind: 'unknown' });
  });
});
