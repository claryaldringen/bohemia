import { describe, expect, it } from 'vitest';
import { parseJourneyOrder } from '../journey-input';

// Tvar vstupu výjezdu od klienta (Review Focus 3): význam (bod na mapě, soused) ověřují use-casy.

describe('parseJourneyOrder', () => {
  it('přijme go s konečnými čísly, cross s celými čísly a home', () => {
    expect(parseJourneyOrder({ kind: 'go', pos: { x: 12.5, z: -40 } })).toEqual({
      kind: 'go',
      pos: { x: 12.5, z: -40 },
    });
    expect(parseJourneyOrder({ kind: 'cross', cell: { x: 3, y: -2 } })).toEqual({
      kind: 'cross',
      cell: { x: 3, y: -2 },
    });
    expect(parseJourneyOrder({ kind: 'home' })).toEqual({ kind: 'home' });
  });

  it('odmítne NaN, Infinity, řetězce a necelá čísla políčka', () => {
    expect(parseJourneyOrder({ kind: 'go', pos: { x: NaN, z: 0 } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'go', pos: { x: 0, z: Infinity } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'go', pos: { x: '5', z: 0 } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'cross', cell: { x: 1.5, y: 0 } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'cross', cell: { x: '1', y: 0 } })).toBeNull();
  });

  it('odmítne chybějící části, neznámý druh a přebytečná pole', () => {
    expect(parseJourneyOrder({ kind: 'go' })).toBeNull();
    expect(parseJourneyOrder({ kind: 'cross' })).toBeNull();
    expect(parseJourneyOrder({ kind: 'fly' })).toBeNull();
    expect(parseJourneyOrder({ kind: 'home', pos: { x: 0, z: 0 } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'go', pos: { x: 0, z: 0, y: 1 } })).toBeNull();
    expect(parseJourneyOrder({ kind: 'go', pos: { x: 0, z: 0 }, cell: { x: 0, y: 0 } })).toBeNull();
    expect(parseJourneyOrder(null)).toBeNull();
    expect(parseJourneyOrder([])).toBeNull();
    expect(parseJourneyOrder('home')).toBeNull();
  });
});
