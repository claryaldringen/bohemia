import { describe, expect, it } from 'vitest';
import {
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  dwellingBuildLabor,
  fieldPartsFromCells,
  orchardPartsFromCells,
  packObstacles,
  type Landscape,
  type ObstaclePlacement,
  type PlacementVillage,
} from '@bohemia/game';
import { BUILD_ITEMS, buildItem, buildItemForKey, dwellingPlacementCost } from '../build-items';

const key = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('zkratky staveb', () => {
  it('Z zemnice, X polozemnice, C pole, V hřbitov, B sad – nekolidují s kamerou (WASD, Q/E, R)', () => {
    expect(buildItemForKey(key('KeyZ'))?.kind).toBe('zemnice');
    expect(buildItemForKey(key('KeyX'))?.kind).toBe('polozemnice');
    expect(buildItemForKey(key('KeyC'))?.kind).toBe('field');
    expect(buildItemForKey(key('KeyV'))?.kind).toBe('cemetery');
    expect(buildItemForKey(key('KeyB'))?.kind).toBe('orchard');
    expect(new Set(BUILD_ITEMS.map((item) => item.hotkey)).size).toBe(BUILD_ITEMS.length);
    const camera = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'];
    expect(BUILD_ITEMS.filter((item) => camera.includes(item.hotkey))).toEqual([]);
  });

  it('s modifikátorem nic (Ctrl+Z vrací tah pole)', () => {
    expect(buildItemForKey(key('KeyZ', { ctrlKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { metaKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { shiftKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyQ'))).toBeNull();
  });
});

describe('hřbitov', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  const item = buildItem('cemetery');

  it('maluje se po čtvercích; blízko obydlí jen varuje', () => {
    if (item.placement !== 'squares') throw new Error('Hřbitov se maluje po čtvercích.');
    const near = item.check(landscape, village, [{ x: 18, y: 16 }]);
    expect(near.check.ok).toBe(true);
    expect(near.check.warning).toMatch(/^Blízko obydlí \(\d+ m\)$/);
    expect(near.warningCells).toEqual([{ x: 18, y: 16 }]);
    const far = item.check(landscape, village, [{ x: 30, y: 30 }]);
    expect(far.check.ok).toBe(true);
    expect(far.check.warning).toBeUndefined();
    const over = item.check(landscape, village, [{ x: 16, y: 16 }]);
    expect(over.check.reason).toBe('Hřbitov se překrývá s obydlím.');
  });
});

describe('sad', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [{ cell: { x: 20, y: 20 } }],
  };
  const item = buildItem('orchard');

  it('maluje se po čtvercích jako pole – i jeden čtverec, ne přes pole ani obydlí', () => {
    if (item.placement !== 'squares') throw new Error('Sad se maluje po čtvercích.');
    expect(item.icon).toBe('sad');
    expect(item.check(landscape, village, [{ x: 18, y: 18 }]).check).toEqual({
      ok: true,
      reason: null,
    });
    const over = item.check(landscape, village, [{ x: 20, y: 20 }]);
    expect(over.check.reason).toBe('Sad se překrývá s polem.');
    expect(over.blockedCells).toEqual([{ x: 20, y: 20 }]);
    expect(item.check(landscape, village, [{ x: 16, y: 16 }]).check.reason).toBe(
      'Sad se překrývá s obydlím.',
    );
  });
});

describe('cena u kurzoru', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const home = { x: 0, z: 0, rotation: 0 };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: home }],
    constructions: [],
    parts: [],
  };
  const homes = [home];
  // pole musí mít aspoň 5 čtverců
  const cells = [24, 25, 26, 27, 28].map((x) => ({ x, y: 24 }));

  it('pole, sad a hřbitov: práce celkem (i s překážkami), jen u prošlého umístění', () => {
    const expected = {
      field: fieldPartsFromCells(landscape, village, cells, homes).foundingCost,
      orchard: orchardPartsFromCells(landscape, village, cells, homes).plantingCost,
      cemetery: cemeteryPartsFromCells(landscape, village, cells, homes).foundingCost,
    };
    for (const kind of ['field', 'orchard', 'cemetery'] as const) {
      const item = buildItem(kind);
      if (item.placement !== 'squares') throw new Error(`${kind} se maluje po čtvercích.`);
      const ok = item.check(landscape, village, cells);
      expect(ok.check.ok).toBe(true);
      expect(ok.cost).toEqual({ laborManDays: expected[kind], trees: 0 });
      expect(expected[kind]).toBeGreaterThan(0);
      expect(item.check(landscape, village, []).cost).toBeNull();
    }
  });

  it('obydlí: stavba a překážky, dřevo z hromady klád práci nestojí; neprošlé bez ceny', () => {
    const item = buildItem('zemnice');
    if (item.placement !== 'footprint') throw new Error('Zemnice se umisťuje půdorysem.');
    const position = { x: 60, z: 0, rotation: 0 };
    const placed = checkDwellingPlacement(landscape, village, 'zemnice', position);
    const ok = item.check(landscape, village, position, 7);
    expect(ok.ok).toBe(true);
    expect(ok.cost).toEqual({
      laborManDays: dwellingBuildLabor('zemnice') + placed.obstacleCost,
      trees: 0,
    });
    const over = item.check(landscape, village, home, 7);
    expect(over.ok).toBe(false);
    expect(over.cost).toBeNull();
  });

  it('obydlí bez dost klád: skácí nejbližší dospělé stromy – kácení v ceně, stromy u ikony', () => {
    const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
      id,
      kind: 'tree',
      look: 'oak-1',
      x,
      z,
      rotation: 0,
      scale: 1,
    });
    // pět stromů blízko (do 100 m – 2 člověkodny za strom), pět daleko (300 m – o 20 % dráž)
    const forest = packObstacles(
      [
        ...[1, 2, 3, 4, 5].map((id) => tree(id, 50, id * 4)),
        ...[6, 7, 8, 9, 10].map((id) => tree(id, 300, id * 4 - 20)),
      ],
      SIZE,
      15,
    );
    const position = { x: 0, z: 0, rotation: 0 };
    const site = { obstacleCost: 3, obstacleIds: [], clearedTrees: 0 };
    const base = dwellingBuildLabor('zemnice') + 3;
    const cost = (
      logs: number,
      v: PlacementVillage = village,
    ): ReturnType<typeof dwellingPlacementCost> =>
      dwellingPlacementCost(landscape, v, 'zemnice', position, site, logs, forest);
    expect(cost(2)).toEqual({ laborManDays: base + 5 * 2, trees: 5 });
    expect(cost(7)).toEqual({ laborManDays: base, trees: 0 });
    // stromy vyhrazené jinou stavbou se nekácí – vezmou se vzdálenější
    const far = cost(2, { ...village, reservedTrees: [1, 2, 3, 4, 5] });
    expect(far.trees).toBe(5);
    expect(far.laborManDays).toBeGreaterThan(base + 5 * 2 * 1.19);
    // stromy z vyklízené plochy jdou nejdřív na hromadu
    const cleared = dwellingPlacementCost(
      landscape,
      village,
      'zemnice',
      position,
      { obstacleCost: 3, obstacleIds: [1, 2], clearedTrees: 2 },
      2,
      forest,
    );
    expect(cleared.trees).toBe(3);
  });
});
