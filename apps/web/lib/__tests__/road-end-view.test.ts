import { describe, expect, it } from 'vitest';
import type { Road, VillageState } from '@bohemia/game';
import { roadEndView } from '../road-end-view';

// Konce cesty v panelu (paths.md – pravidlo 11, Co hráč vidí; Martin 25. 10. 2026).

const state = {
  dwellings: [{ id: 12, type: 'polozemnice' }],
  roads: { roads: [], junctions: [{ id: 565, shape: 'cross' }] },
} as unknown as VillageState;

const roads = [
  {
    id: 3,
    points: [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ],
  },
  {
    id: 7,
    points: [
      { x: 10, z: 0 },
      { x: 20, z: 0 },
    ],
  },
] as unknown as Road[];

describe('roadEndView', () => {
  it('brána domu – obydlí s typem, vybere obydlí', () => {
    expect(
      roadEndView(state, roads, { kind: 'place', place: 'd:12', anchor: 'entrance' }),
    ).toMatchObject({
      name: 'Obydlí – polozemnice',
      icon: '/icons/build/polozemnice.png',
      target: { kind: 'dwelling', id: 12 },
      log: 'dwelling 12',
    });
  });

  it('stavba a cíl bez výběru (voda)', () => {
    expect(
      roadEndView(state, roads, { kind: 'place', place: 'pen:4', anchor: 'entrance' }),
    ).toMatchObject({
      name: 'Ohrada',
      target: { kind: 'pen', id: 4 },
    });
    expect(
      roadEndView(state, roads, { kind: 'place', place: 'water', anchor: 'goal' }),
    ).toMatchObject({
      name: 'Voda',
      target: null,
      log: 'water',
    });
  });

  it('křižovatka, kraj mapy, jiná cesta (id cesty hráče) a nikam', () => {
    expect(roadEndView(state, roads, { kind: 'junction', id: 565 })).toMatchObject({
      name: 'Křižovatka',
      target: { kind: 'junction', id: 565 },
    });
    expect(roadEndView(state, roads, { kind: 'edge', direction: 'N' })).toMatchObject({
      name: 'Kraj mapy – sever',
      arrow: '↑',
      target: null,
    });
    expect(roadEndView(state, roads, { kind: 'road', roadId: 7 })).toMatchObject({
      target: { kind: 'road', id: 3 },
      log: 'road 3',
    });
    expect(roadEndView(state, roads, { kind: 'none' })).toMatchObject({
      kind: 'none',
      name: 'Cesta tu nikam nevede.',
      target: null,
    });
  });
});
