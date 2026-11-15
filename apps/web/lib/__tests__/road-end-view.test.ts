import { describe, expect, it } from 'vitest';
import { neighbourOf, type Road, type VillageState } from '@bohemia/game';
import { roadEndView } from '../road-end-view';
import { toVillage } from '../village-name-cases';

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
      name: 'Potok',
      target: null,
      log: 'water',
    });
    // u řeky klíč `water:river` (D44)
    expect(
      roadEndView(state, roads, { kind: 'place', place: 'water:river', anchor: 'goal' }),
    ).toMatchObject({ name: 'Řeka', icon: '/icons/resources/jar.png', target: null });
  });

  it('svatyně, rudiště a hliniště se dají vybrat', () => {
    const st = {
      ...state,
      sacredBuildings: [{ id: 5, kind: 'shrine' }],
    } as unknown as VillageState;
    expect(
      roadEndView(st, roads, { kind: 'place', place: 'sacred:5', anchor: 'entrance' }),
    ).toMatchObject({ name: 'Svatyně', target: { kind: 'sacred', id: 5 }, alert: false });
    expect(roadEndView(st, roads, { kind: 'place', place: 'ore:2', anchor: 'goal' })).toMatchObject(
      { name: 'Rudiště', target: { kind: 'ore-site', id: 2 } },
    );
    expect(
      roadEndView(st, roads, { kind: 'place', place: 'clay:3', anchor: 'goal' }),
    ).toMatchObject({ name: 'Hliniště', target: { kind: 'clay-site', id: 3 } });
  });

  it('křižovatka, kraj mapy, jiná cesta (id cesty hráče) a nikam', () => {
    expect(roadEndView(state, roads, { kind: 'junction', id: 565 })).toMatchObject({
      name: 'Křižovatka',
      target: { kind: 'junction', id: 565 },
    });
    // podle významného místa u ní (D66)
    const junction = { kind: 'junction', id: 565 } as const;
    expect(
      roadEndView(state, roads, junction, { kind: 'dwelling', type: 'dvorec', at: 'below' }),
    ).toMatchObject({ name: 'Křižovatka pod dvorcem', target: { kind: 'junction', id: 565 } });
    expect(
      roadEndView(state, roads, junction, { kind: 'place', place: 'water', at: 'at' }).name,
    ).toBe('Křižovatka u potoka');
    // cesta přes kraj mapy se jmenuje podle souseda, ke kterému vede (Martin 15. 11. 2026)
    const north = neighbourOf(state.seed, 'N').name;
    expect(roadEndView(state, roads, { kind: 'edge', direction: 'N' })).toMatchObject({
      name: `Cesta ${toVillage(north)}`,
      arrow: '↑',
      target: null,
    });
    expect(roadEndView(state, roads, { kind: 'road', roadId: 7 })).toMatchObject({
      target: { kind: 'road', id: 3 },
      alert: true,
      name: 'Cesta končí na jiné cestě bez křižovatky.',
      log: 'road 3 (!)',
    });
    expect(roadEndView(state, roads, { kind: 'none' })).toMatchObject({
      kind: 'none',
      alert: true,
      name: 'Cesta tu nikam nevede.',
      target: null,
    });
  });
});
