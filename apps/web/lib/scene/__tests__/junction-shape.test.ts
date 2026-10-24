import { junctionArmDirs, junctionEntranceM, roadLandWidthM } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneJunction, SceneRoad } from '../../village-view';
import {
  junctionLandmarkPieces,
  junctionRibbons,
  junctionShape,
  junctionsKey,
  nearestJunction,
} from '../junction-shape';
import { pathRibbons, ROAD_WORN_LAYER } from '../path-ribbon';
import { pickVillageTarget, targetExists } from '../village-picking';

/** Cesta z bodu (x, z) do středu (0, 0). */
const road = (id: number, x: number, z: number, extra: Partial<SceneRoad> = {}): SceneRoad => ({
  id,
  points: [
    { x, z },
    { x: 0, z: 0 },
  ],
  grade: 'trodden',
  ...extra,
});

const junction = (extra: Partial<SceneJunction> = {}): SceneJunction => ({
  id: 7,
  x: 0,
  z: 0,
  shape: 'cross',
  rotation: 0,
  arms: [1, 2, 3, 4],
  landmark: { kind: 'post', x: 6, z: 6, turn: 1, look: 2 },
  bornDay: 0,
  ...extra,
});

const cross = (): SceneRoad[] => [
  road(1, 30, 0),
  road(2, 0, 30),
  road(3, -30, 0, { grade: 'improved' }),
  road(4, 0, -30),
];

describe('tvar křižovatky (paths.md – Křižovatky)', () => {
  it('ramena končí ve vchodech a obrys je v šířce nejširší cesty', () => {
    const shape = junctionShape(junction(), cross())!;
    const width = roadLandWidthM({ grade: 'improved' });
    const entrance = junctionEntranceM([width]);
    expect(shape.entranceM).toBeCloseTo(entrance, 9);
    expect(shape.arms).toHaveLength(4);
    // každý vchod je na kružnici entranceM od středu a v jeho okolí je obrys široký právě šířku cesty
    for (const arm of shape.arms) {
      expect(Math.hypot(arm.entrance.x, arm.entrance.z)).toBeCloseTo(entrance, 6);
      const corners = shape.outline.filter(
        (p) => Math.hypot(p.x - arm.entrance.x, p.z - arm.entrance.z) <= width / 2 + 1e-6,
      );
      expect(corners).toHaveLength(2);
      expect(Math.hypot(corners[0]!.x - corners[1]!.x, corners[0]!.z - corners[1]!.z)).toBeCloseTo(
        width,
        6,
      );
    }
  });

  it('žádný kruh – obrys je mnohoúhelník s dvěma rohy na rameno a vnitřním rohem mezi rameny', () => {
    const shape = junctionShape(junction(), cross())!;
    expect(shape.outline).toHaveLength(4 * 3);
    // vnitřní roh kříže leží u středu (půl šířky ± nepravidelnost), ne na kružnici vchodů
    const radii = shape.outline.map((p) => Math.hypot(p.x, p.z));
    expect(Math.min(...radii)).toBeLessThan(shape.entranceM / 2);
  });

  it('Y se třemi rameny a rameno bez cesty se vynechá', () => {
    const y = junction({
      shape: 'y',
      spread: Math.PI / 4,
      rotation: 0.5,
      arms: [1, 2, null],
    });
    const shape = junctionShape(y, cross())!;
    expect(shape.arms).toHaveLength(2);
    expect(junctionArmDirs('y', 0.5, Math.PI / 4)).toHaveLength(3);
    expect(junctionShape(junction({ arms: [1, null, null, null] }), cross())).toBeNull();
  });

  it('tvar je pro stejnou křižovatku stejný a vykreslí se bez kruhového plácku', () => {
    const a = junctionShape(junction(), cross())!;
    const b = junctionShape(junction(), cross())!;
    expect(a).toEqual(b);
    const { trodden, improved } = junctionRibbons([junction()], cross());
    // v křižovatce končí upravená cesta – plácek patří k upravené vrstvě
    expect(trodden).toEqual([]);
    expect(improved).toHaveLength(1);
    expect(improved[0]!.outline).toEqual(a.outline);
    const grid = pathRibbons([], ROAD_WORN_LAYER, undefined, undefined, improved);
    // střed + obrys + měkký okraj, ne 20 úseků kruhu
    expect(grid.positions.length / 2).toBe(1 + a.outline.length * 2);
  });

  it('vozová cesta v křižovatce dává vozový plácek', () => {
    const roads = [road(1, 30, 0, { cart: true }), road(2, 0, 30), road(3, -30, 0)];
    const j = junction({ shape: 'y', spread: Math.PI / 3, arms: [1, 2, 3] });
    expect(junctionRibbons([j], roads).cart).toHaveLength(1);
  });

  it('znamení: kámen a kůl dostanou model podle podoby, strom ne (ten je mezi stromy u cest)', () => {
    const pieces = junctionLandmarkPieces([
      junction(),
      junction({ id: 8, landmark: { kind: 'stone', x: -5, z: 3, turn: 2, look: 1 } }),
      junction({ id: 9, landmark: { kind: 'tree', x: 1, z: 1, turn: 0, look: 1, treeId: 5 } }),
    ]);
    expect(pieces.map((p) => p.model)).toEqual(['junction-post-2', 'junction-stone-1']);
    expect(pieces[0]).toMatchObject({ x: 6, z: 6, rotationY: 1 });
  });

  it('výběr: nejbližší křižovatka do 3 m od středu, jinak nic', () => {
    const js = [junction(), junction({ id: 8, x: 40, z: 0 })];
    expect(nearestJunction(js, { x: 2, z: 1 }, 3)).toBe(7);
    expect(nearestJunction(js, { x: 38, z: 0 }, 3)).toBe(8);
    expect(nearestJunction(js, { x: 20, z: 0 }, 3)).toBeNull();
    expect(nearestJunction(undefined, { x: 0, z: 0 }, 3)).toBeNull();
  });

  it('klíč se mění s tvarem a znamením', () => {
    const base = junctionsKey([junction()]);
    expect(junctionsKey([junction()])).toBe(base);
    expect(junctionsKey([junction({ rotation: 0.1 })])).not.toBe(base);
    expect(junctionsKey(undefined)).toBe('');
  });

  it('klik do 3 m od středu vybere křižovatku, před cestou, která do ní vbíhá', () => {
    const village = { dwellings: [], fields: [], roads: cross(), junctions: [junction()] };
    const options = (x: number, z: number) => ({
      ground: { x, z },
      groundHeight: () => 0,
      cellOf: () => ({ x: 0, y: 0 }),
    });
    const ray = { origin: { x: 0, y: 50, z: 0 }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickVillageTarget(village, ray, options(1.5, 1))).toEqual({ kind: 'junction', id: 7 });
    // dál po ose je to zas cesta
    expect(pickVillageTarget(village, ray, options(10, 1))).toMatchObject({ kind: 'road' });
    expect(targetExists(village, { kind: 'junction', id: 7 })).toBe(true);
    expect(targetExists(village, { kind: 'junction', id: 8 })).toBe(false);
  });
});
