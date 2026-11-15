import { describe, expect, it } from 'vitest';
import { junctionLandmark, roadEndLandmarks, type LandmarkTerrain } from '../road-landmarks';
import type { RoadEndsNetwork } from '../road-ends';
import type { RoadJunction, VillageState } from '../../types';

// Křižovatka podle nejbližšího významného místa (D66; Martin 15. 11. 2026: „Třeba poblíž kterého
// významného místa se nacházejí?“).

const dwelling = (id: number, type: string, x: number, z: number, craft?: string): object => ({
  id,
  type,
  position: { x, z, rotation: 0 },
  ...(craft ? { workshop: { craft } } : {}),
});

const villageOf = (parts: object): VillageState =>
  ({ dwellings: [], ...parts }) as unknown as VillageState;

/** Krajina na zkoušku: výška podle bodu, voda (do `maxM`), polovina strany mapy. */
function terrainOf(
  heightAt: (x: number, z: number) => number,
  water: { distanceM: number; level: number; river: boolean } | null = null,
  halfM = 1000,
): LandmarkTerrain {
  return {
    heightAt,
    waterNear: (_x, _z, maxM) => (water && water.distanceM <= maxM ? water : null),
    halfM,
  };
}

describe('křižovatka u významného místa (D66)', () => {
  const state = villageOf({
    dwellings: [
      dwelling(1, 'dvorec', 0, 0),
      dwelling(2, 'srub', 50, 0, 'smith'),
      dwelling(5, 'zemnice', 32, 0),
    ],
    churches: [{ id: 3, position: { x: 100, z: 0, rotation: 0 } }],
    cemeteries: [
      {
        id: 4,
        squares: [
          { x: 0, z: 45 },
          { x: 0, z: 55 },
        ],
      },
    ],
  });

  it('nejbližší stavba do 60 m – dílna podle řemesla, kostel, hřbitov po čtvercích; obydlí ne', () => {
    expect(junctionLandmark(state, { x: 33, z: 0 })).toEqual({
      kind: 'dwelling',
      type: 'srub',
      craft: 'smith',
      at: 'at',
    });
    expect(junctionLandmark(state, { x: 95, z: 0 })).toEqual({
      kind: 'place',
      place: 'church',
      at: 'at',
    });
    expect(junctionLandmark(state, { x: 0, z: 40 })).toEqual({
      kind: 'place',
      place: 'cemetery',
      at: 'at',
    });
    // místo na druhém konci cesty se přeskočí
    expect(junctionLandmark(state, { x: 10, z: 0 }, null, 'd:1')).toMatchObject({
      kind: 'dwelling',
      craft: 'smith',
    });
  });

  it('pod a nad podle výšky; voda nikdy pod; brána a kraj mapy vždy u', () => {
    const manor = villageOf({ dwellings: [dwelling(1, 'dvorec', 0, 0)] });
    const hill = (junction: number) => (x: number, z: number) =>
      x === 0 && z === 0 ? 20 : junction;
    expect(junctionLandmark(manor, { x: 30, z: 0 }, terrainOf(hill(10)))).toMatchObject({
      type: 'dvorec',
      at: 'below',
    });
    expect(junctionLandmark(manor, { x: 30, z: 0 }, terrainOf(hill(26)))).toMatchObject({
      at: 'above',
    });
    expect(junctionLandmark(manor, { x: 30, z: 0 }, terrainOf(hill(18)))).toMatchObject({
      at: 'at',
    });
    const stream = (level: number, river = false) =>
      terrainOf(hill(10), { distanceM: 10, level, river });
    expect(junctionLandmark(manor, { x: 30, z: 0 }, stream(2))).toEqual({
      kind: 'place',
      place: 'water',
      at: 'above',
    });
    expect(junctionLandmark(manor, { x: 30, z: 0 }, stream(30, true))).toEqual({
      kind: 'place',
      place: 'water:river',
      at: 'at',
    });
    const fort = villageOf({
      dwellings: [dwelling(1, 'dvorec', 0, 0)],
      fortifications: [
        {
          gates: [
            { x: 35, z: 0 },
            { x: 31, z: 0, demolishedDay: 5 },
          ],
        },
      ],
    });
    expect(junctionLandmark(fort, { x: 30, z: 0 }, terrainOf(hill(0)))).toEqual({
      kind: 'place',
      place: 'gate',
      at: 'at',
    });
    expect(junctionLandmark(manor, { x: 30, z: 60 }, terrainOf(hill(0), null, 100))).toEqual({
      kind: 'edge',
      direction: 'N',
    });
  });

  it('bez místa blízko: uprostřed vsi, na straně vsi, mimo zástavbu; ves bez obydlí nic', () => {
    const plain = villageOf({
      dwellings: [
        dwelling(1, 'zemnice', 0, 0),
        dwelling(2, 'zemnice', 40, 0),
        dwelling(3, 'zemnice', 0, 40),
        dwelling(4, 'zemnice', 40, 40),
      ],
    });
    expect(junctionLandmark(plain, { x: 20, z: 20 })).toEqual({ kind: 'village' });
    expect(junctionLandmark(plain, { x: 20, z: 60 })).toEqual({ kind: 'village', direction: 'N' });
    expect(junctionLandmark(plain, { x: 200, z: 20 })).toEqual({
      kind: 'village',
      direction: 'E',
      outside: true,
    });
    expect(junctionLandmark(villageOf({}), { x: 0, z: 0 })).toBeNull();
  });

  it('konce cesty: místo u křižovatky bez místa na druhém konci', () => {
    const village = villageOf({
      dwellings: [dwelling(12, 'dvorec', 82, 50), dwelling(13, 'srub', 60, 0, 'smith')],
    });
    const net: RoadEndsNetwork = {
      roads: [],
      junctions: [{ id: 9, x: 82, z: 0, shape: 'y', arms: [1] } as unknown as RoadJunction],
      anchors: { points: [], halfM: 500 },
    };
    expect(
      roadEndLandmarks(village, net, [
        { kind: 'place', place: 'd:13', anchor: 'entrance' },
        { kind: 'junction', id: 9 },
      ]),
    ).toEqual([null, { kind: 'dwelling', type: 'dvorec', at: 'at' }]);
    expect(junctionLandmark(village, { x: 82, z: 0 })).toMatchObject({ craft: 'smith' });
  });
});
