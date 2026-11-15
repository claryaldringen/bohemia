import { describe, expect, it } from 'vitest';
import { chronicleRoadEnds, overgrownRoadNote, roadFormedNote } from '../road-chronicle';
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
      { id: 12, type: 'dvorec', builtDay: FOUNDED - 50, position: { x: -40, z: 0 } },
      {
        id: 13,
        type: 'polozemnice',
        builtDay: FOUNDED + 3 * YEAR,
        workshop: { craft: 'smith' },
        position: { x: 40, z: 30 },
      },
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
    // rozcestí podle nejbližšího významného místa – kovárna 52 m od něj (D66)
    expect(chronicleRoadEnds(y.state, y.net, 1)).toEqual([
      { kind: 'place', place: 'water' },
      {
        kind: 'junction',
        shape: 'y',
        near: { kind: 'dwelling', type: 'polozemnice', craft: 'smith', at: 'at' },
      },
    ]);
  });

  it('voda u řeky nese `water:river`, u potoka jen `water`', () => {
    const { net, state } = setup('water:river', 'water');
    expect(chronicleRoadEnds(state, net, 1)).toEqual([
      { kind: 'place', place: 'water:river' },
      { kind: 'place', place: 'water' },
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

describe('kronika – zarostlá cesta (D67)', () => {
  it('konce cesty hráče a její úseky; konec nikam konce nemá', () => {
    const { net, state } = setup('d:12', 'water');
    expect(overgrownRoadNote(state, net, 1)).toEqual({
      chain: [1],
      ends: [
        { kind: 'dwelling', type: 'dvorec' },
        { kind: 'place', place: 'water' },
      ],
    });
    const nowhere = setup('d:12', null);
    expect(overgrownRoadNote(nowhere.state, nowhere.net, 1)).toEqual({ chain: [1] });
    // opuštěný kus pod stavbou – konce cesty z řezu (`Road.formerEnds`), jen část cesty
    const former: Road = {
      ...road(7, [
        [0, 50],
        [0, 60],
      ]),
      abandoned: true,
      formerEnds: [
        { kind: 'dwelling', type: 'dvorec' },
        { kind: 'place', place: 'water' },
      ],
    };
    const cut = { ...nowhere.net, roads: [...nowhere.net.roads, former] };
    expect(overgrownRoadNote(nowhere.state, cut, 7)).toEqual({
      chain: [],
      ends: former.formerEnds,
      part: true,
    });
    expect(overgrownRoadNote(nowhere.state, cut, 99)).toEqual({ chain: [] });
  });
});
