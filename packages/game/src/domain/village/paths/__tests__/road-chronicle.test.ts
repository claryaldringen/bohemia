import { describe, expect, it } from 'vitest';
import { chronicleRoadEnds, roadFormedNote } from '../road-chronicle';
import type { RoadEndsNetwork } from '../road-ends';
import type { RoadAnchor } from '../road-anchors';
import type { Road, RoadJunction, VillageState } from '../../types';

// Konce cesty a roky chůze pro kroniku (Martin 14. 11. 2026: „Po 12 letech chůze lidé vyšlapali
// cestu mezi dvorcem a studnou.“).

const FOUNDED = 1000;
const YEAR = 365.25;

const road = (id: number, points: [number, number][]): Road =>
  ({
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: 0,
    grade: 'trodden',
    traffic: [],
    spots: [],
  }) as Road;

const anchor = (x: number, z: number, place: string, kind: RoadAnchor['kind']): RoadAnchor => ({
  x,
  z,
  kind,
  reachM: kind === 'entrance' ? 3 : 7.5,
  place,
});

/** Úsek 1 z (0, 0) do (80, 0); na koncích kotvy `a` a `b` (null = bez kotvy), křižovatka 9 u (82, 0). */
function setup(
  a: string | null,
  b: string | null,
  junctionAtEnd = false,
): { net: RoadEndsNetwork; state: VillageState } {
  const junctions = junctionAtEnd
    ? [
        {
          id: 9,
          x: 82,
          z: 0,
          shape: 'y',
          rotation: 0,
          arms: [1],
          bornDay: 0,
        } as unknown as RoadJunction,
      ]
    : [];
  const points = [
    ...(a ? [anchor(-1, 1, a, a.startsWith('d:') ? 'entrance' : 'goal')] : []),
    ...(b ? [anchor(81, 1, b, b.startsWith('d:') ? 'entrance' : 'goal')] : []),
  ];
  const state = {
    foundedDay: FOUNDED,
    dwellings: [
      { id: 12, type: 'dvorec', builtDay: FOUNDED - 50 },
      { id: 13, type: 'polozemnice', builtDay: FOUNDED + 3 * YEAR, workshop: { craft: 'smith' } },
    ],
    roads: { junctions },
    pens: [{ id: 20, builtDay: FOUNDED + 10 * YEAR }],
  } as unknown as VillageState;
  return {
    net: {
      roads: [
        road(1, [
          [0, 0],
          [80, 0],
        ]),
      ],
      junctions,
      anchors: { points, halfM: 500 },
    },
    state,
  };
}

describe('kronika – konce cesty a roky chůze', () => {
  it('dvorec a kovárna (dílna podle řemesla), rozcestí podle tvaru', () => {
    const { net, state } = setup('d:12', 'd:13');
    expect(chronicleRoadEnds(state, net, 1)).toEqual([
      { kind: 'dwelling', type: 'dvorec' },
      { kind: 'dwelling', type: 'polozemnice', craft: 'smith' },
    ]);
    const y = setup('water', null, true);
    expect(chronicleRoadEnds(y.state, y.net, 1)).toEqual([
      { kind: 'place', place: 'water' },
      { kind: 'junction', shape: 'y' },
    ]);
  });

  it('roky od pozdějšího z konců: stavba podle dne dostavění, voda od založení vsi', () => {
    const day = FOUNDED + 15 * YEAR;
    const { net, state } = setup('d:13', 'water');
    expect(roadFormedNote(state, net, 1, day)).toEqual({
      ends: [
        { kind: 'dwelling', type: 'polozemnice', craft: 'smith' },
        { kind: 'place', place: 'water' },
      ],
      years: 12,
    });
    // dvorec postavený před založením vsi – chodí se od založení
    const manor = setup('d:12', 'pen:20');
    expect(roadFormedNote(manor.state, manor.net, 1, day).years).toBe(5);
  });

  it('křižovatka nic neurčí, pole bez dne roky nedá, konec nikam konce nemá', () => {
    const day = FOUNDED + 15 * YEAR;
    const junction = setup('d:13', null, true);
    expect(roadFormedNote(junction.state, junction.net, 1, day).years).toBe(12);
    const field = setup('d:13', 'field:4');
    expect(roadFormedNote(field.state, field.net, 1, day)).toEqual({
      ends: [
        { kind: 'dwelling', type: 'polozemnice', craft: 'smith' },
        { kind: 'place', place: 'field' },
      ],
    });
    const nowhere = setup('d:13', null);
    expect(roadFormedNote(nowhere.state, nowhere.net, 1, day)).toEqual({});
    expect(roadFormedNote(nowhere.state, nowhere.net, 99, day)).toEqual({});
  });
});
