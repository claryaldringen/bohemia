import { describe, expect, it } from 'vitest';
import { roadChainEnds, type RoadEndsNetwork } from '../paths/road-ends';
import type { RoadAnchor } from '../paths/road-anchors';
import type { Road, RoadJunction } from '../types';

// Konce cesty hráče (paths.md – pravidlo 11; Martin 25. 10. 2026: „Žádná cesta nemůže existovat
// jen tak sama v prostoru, vždycky musí spojovat dvě místa – kombinaci budov a křižovatek.“).

const road = (id: number, points: [number, number][]): Road =>
  ({
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: 0,
    grade: 'trodden',
    traffic: [],
    spots: [],
  }) as Road;

const junction = (id: number, x: number, z: number, arms: number[]): RoadJunction =>
  ({ id, x, z, shape: 'y', rotation: 0, arms, bornDay: 0 }) as unknown as RoadJunction;

const anchor = (x: number, z: number, place: string, kind: RoadAnchor['kind']): RoadAnchor => ({
  x,
  z,
  kind,
  reachM: kind === 'entrance' ? 3 : 7.5,
  place,
});

const net = (
  roads: Road[],
  junctions: RoadJunction[] = [],
  points: RoadAnchor[] = [],
): RoadEndsNetwork => ({ roads, junctions, anchors: { points, halfM: 500 } });

describe('konce cesty hráče', () => {
  it('od vchodu stavby ke křižovatce – klíč místa z trasy a id křižovatky', () => {
    const ends = roadChainEnds(
      net(
        [
          road(1, [
            [0, 0],
            [40, 0],
          ]),
          road(2, [
            [40, 0],
            [80, 0],
          ]),
        ],
        [junction(9, 82, 0, [2, 5, 6])],
        [anchor(-1, 1, 'd:12', 'entrance')],
      ),
      2,
    );
    expect(ends).toEqual([
      { kind: 'place', place: 'd:12', anchor: 'entrance' },
      { kind: 'junction', id: 9 },
    ]);
  });

  it('krátký úsek od křižovatky k bráně má křižovatku jen na bližším konci', () => {
    const ends = roadChainEnds(
      net(
        [
          road(3, [
            [0, 0],
            [8, 0],
          ]),
        ],
        [junction(4, 8, 0, [3, 7, 8])],
      ),
      3,
    );
    expect(ends).toEqual([{ kind: 'none' }, { kind: 'junction', id: 4 }]);
  });

  it('kraj mapy – směr podle strany (sever = +z), cíl bez vchodu (voda)', () => {
    const ends = roadChainEnds(
      net(
        [
          road(1, [
            [100, 0],
            [100, 495],
          ]),
        ],
        [],
        [anchor(102, 0, 'water', 'goal')],
      ),
      1,
    );
    expect(ends).toEqual([
      { kind: 'place', place: 'water', anchor: 'goal' },
      { kind: 'edge', direction: 'N' },
    ]);
  });

  it('kotva kraje mapy z trasy k sousedovi nese směr z klíče', () => {
    const ends = roadChainEnds(
      net(
        [
          road(1, [
            [0, 0],
            [-60, 0],
          ]),
        ],
        [],
        [anchor(-62, 0, 'edge:W', 'edge')],
      ),
      1,
    );
    expect(ends?.[1]).toEqual({ kind: 'edge', direction: 'W' });
  });

  it('napojení na jinou cestu bez křižovatky a konec nikam', () => {
    const ends = roadChainEnds(
      net([
        road(1, [
          [0, 0],
          [0, 50],
        ]),
        road(2, [
          [-30, 52],
          [30, 52],
        ]),
      ]),
      1,
    );
    expect(ends).toEqual([{ kind: 'none' }, { kind: 'road', roadId: 2 }]);
  });

  it('neznámý úsek nemá konce', () => {
    expect(roadChainEnds(net([]), 1)).toBeNull();
  });
});
