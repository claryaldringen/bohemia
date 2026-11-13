import { describe, expect, it } from 'vitest';
import { EDGE_BAND_M, edgeDirection, lordClick, orderFromClick } from '../journey-orders';

const MAP = 1920;
const H = MAP / 2;
const cell = { x: 3, y: -2 };
const click = (point: { x: number; z: number } | null, lordSelected = true) =>
  orderFromClick({ lordSelected, point, mapSizeM: MAP, cell });

describe('orderFromClick', () => {
  it('uprostřed mapy dá go na bod kliknutí', () => {
    expect(click({ x: 120, z: -40 })).toEqual({ kind: 'go', pos: { x: 120, z: -40 } });
    expect(click({ x: 0, z: 0 })).toEqual({ kind: 'go', pos: { x: 0, z: 0 } });
  });

  it.each([
    ['N', { x: 0, z: H - 5 }, { x: 3, y: -1 }],
    ['S', { x: 0, z: -H + 5 }, { x: 3, y: -3 }],
    ['E', { x: H - 5, z: 0 }, { x: 4, y: -2 }],
    ['W', { x: -H + 5, z: 0 }, { x: 2, y: -2 }],
    ['NE', { x: H - 5, z: H - 5 }, { x: 4, y: -1 }],
    ['NW', { x: -H + 5, z: H - 5 }, { x: 2, y: -1 }],
    ['SE', { x: H - 5, z: -H + 5 }, { x: 4, y: -3 }],
    ['SW', { x: -H + 5, z: -H + 5 }, { x: 2, y: -3 }],
  ])('okraj %s dá cross na souseda', (_name, point, target) => {
    expect(click(point)).toEqual({ kind: 'cross', cell: target });
  });

  it('hranice pásu: těsně uvnitř pásu cross, těsně před ním go', () => {
    expect(click({ x: H - EDGE_BAND_M + 0.1, z: 0 })?.kind).toBe('cross');
    expect(click({ x: H - EDGE_BAND_M - 0.1, z: 0 })?.kind).toBe('go');
  });

  it('klik mimo terén nebo bez vybraného vojvody nedá rozkaz', () => {
    expect(click(null)).toBeNull();
    expect(click({ x: 10, z: 10 }, false)).toBeNull();
    expect(click({ x: H - 1, z: 0 }, false)).toBeNull();
  });
});

describe('edgeDirection', () => {
  it('střed nic, okraj směr, roh dvě osy', () => {
    expect(edgeDirection({ x: 0, z: 0 }, MAP)).toBeNull();
    expect(edgeDirection({ x: H - 1, z: H - 1 }, MAP)).toBe('NE');
    expect(edgeDirection({ x: -H + 1, z: 0 }, MAP)).toBe('W');
  });
});

describe('lordClick', () => {
  const order = { kind: 'go', pos: { x: 1, z: 2 } } as const;
  it('bez odepření rozkaz odešle', () => {
    expect(lordClick({ order, loading: false, refusal: null })).toEqual({ kind: 'send', order });
  });
  it('odepřený výjezd ukáže důvod a nic neodešle', () => {
    expect(lordClick({ order, loading: false, refusal: 'Vojvoda je raněný.' })).toEqual({
      kind: 'refuse',
      text: 'Vojvoda je raněný.',
    });
  });
  it('při načítání kandidátů a mimo terén nic', () => {
    expect(lordClick({ order, loading: true, refusal: null })).toEqual({ kind: 'none' });
    expect(lordClick({ order: null, loading: false, refusal: 'x' })).toEqual({ kind: 'none' });
  });
});
