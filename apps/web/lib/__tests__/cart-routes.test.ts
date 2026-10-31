import { describe, expect, it } from 'vitest';
import { cartEarthworksOf, cartRoutesRequest } from '../cart-routes';
import type { SceneVillage } from '../village-view-scene-types';

describe('vstup vozových tras ze scény (cart-routes.ts)', () => {
  it('valy vozových cest se sestaví ze zemních prací scény – stejné hodnoty i pořadí klíčů', () => {
    const earthworks = [
      {
        id: 7,
        profile: [
          { x: 1.5, z: -2, y: 3.25 },
          { x: 4, z: -2.5, y: 3.5 },
        ],
        reachedM: 2.4,
        shownM: 3,
        pieces: [],
      },
    ] as unknown as SceneVillage['earthworks'];
    const sent = [
      {
        profile: [
          { x: 1.5, y: 3.25, z: -2 },
          { x: 4, y: 3.5, z: -2.5 },
        ],
        reachedM: 2.4,
      },
    ];
    expect(JSON.stringify(cartEarthworksOf({ earthworks }))).toBe(JSON.stringify(sent));
    const scene = {
      earthworks,
      carts: [{ kind: 'two-wheel', goal: { to: { x: 0, z: 0 }, reachM: 1 } }],
      cartWorld: {
        pens: [],
        village: { earthworks: [] },
        changes: null,
        earthworksAsScene: true,
      },
    } as unknown as SceneVillage;
    expect(cartRoutesRequest(scene)!.world!.village.earthworks).toEqual(sent);
    // bez příznaku zůstanou valy, jak je server poslal
    const plain = { ...scene, cartWorld: { ...scene.cartWorld!, earthworksAsScene: undefined } };
    expect(cartRoutesRequest(plain)!.world!.village.earthworks).toEqual([]);
  });
});
