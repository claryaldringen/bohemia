import { describe, expect, it } from 'vitest';
import {
  carriedCartRoutes,
  cartEarthworksOf,
  cartRoutesMemo,
  cartRoutesRequest,
  type CartGoal,
  type CartRoutesResult,
} from '../cart-routes';
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

describe('carriedCartRoutes – pohled jede s posledními trasami, než dojdou nové (D63)', () => {
  const field: CartGoal = { to: { x: 10, z: 20 }, reachM: 3 };
  const forest: CartGoal = { to: { x: -40, z: 5 }, reachM: 3 };
  const plough: CartGoal = { to: { x: 60, z: 60 }, reachM: 2 };
  const sceneOf = (carts: { id: number; goal?: CartGoal }[], outGoals?: CartGoal[]): SceneVillage =>
    ({
      carts: carts.map((c) => ({ kind: 'two-wheel', x: 0, z: 0, ...c })),
      ...(outGoals ? { ploughLegs: { outGoals } } : {}),
    }) as unknown as SceneVillage;
  const route = (x: number): { x: number; z: number }[] => [
    { x: 0, z: 0 },
    { x, z: x },
  ];

  it('vůz se stejným id a cílem a spřežení se stejnými cíli jedou po poslední trase', () => {
    const before = sceneOf(
      [
        { id: 1, goal: field },
        { id: 2, goal: forest },
      ],
      [plough],
    );
    const request = cartRoutesRequest(before)!;
    const result: CartRoutesResult = {
      carts: [route(1), route(2)],
      vias: [{ points: route(5), drop: { x: 5, z: 5 } }, null],
      out: route(3),
      home: null,
    };
    const memo = cartRoutesMemo(before, request, result);
    // další den: vůz 2 jede jinam, přibyl vůz 3, spřežení má tytéž cíle
    const after = sceneOf(
      [
        { id: 3, goal: field },
        { id: 1, goal: field },
        { id: 2, goal: field },
      ],
      [plough],
    );
    const carried = carriedCartRoutes(after, cartRoutesRequest(after)!, memo);
    expect(carried.carts).toEqual([null, route(1), null]);
    expect(carried.vias).toEqual([null, { points: route(5), drop: { x: 5, z: 5 } }, null]);
    expect(carried.out).toEqual(route(3));
    expect(carried.home).toBeNull();
  });

  it('bez paměti nebo s jinými cíli spřežení zatím bez tras', () => {
    const scene = sceneOf([{ id: 1, goal: field }], [plough]);
    const request = cartRoutesRequest(scene)!;
    expect(carriedCartRoutes(scene, request, null)).toEqual({
      carts: [null],
      out: null,
      home: null,
    });
    const memo = cartRoutesMemo(scene, request, { carts: [route(1)], out: route(3), home: null });
    const moved = sceneOf([{ id: 1, goal: field }], [forest]);
    expect(carriedCartRoutes(moved, cartRoutesRequest(moved)!, memo)).toEqual({
      carts: [route(1)],
      out: null,
      home: null,
    });
  });
});
