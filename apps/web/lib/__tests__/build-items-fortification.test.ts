import { describe, expect, it } from 'vitest';
import { type Landscape, type PlacementVillage, type TileCell } from '@bohemia/game';
import { BUILD_ITEMS, buildItem, buildItemForKey, FORT_VARIANTS } from '../build-items';

// Opevnění v katalogu staveb (fortifications.md – Rozhraní): rozcestník druhů, cena u kurzoru
// roste s plochou, útočiště a důvod „Chybí N klád.“.

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

const square = (size: number, x0 = 20, y0 = 20): TileCell[] => {
  const cells: TileCell[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) cells.push({ x: x0 + i, y: y0 + j });
  return cells;
};

const item = buildItem('fortification');
if (item.placement !== 'squares') throw new Error('Opevnění se kreslí po čtvercích.');

describe('opevnění v katalogu staveb', () => {
  it('je rozcestník plot, palisáda, val se zkratkou P bez kolize', () => {
    expect(item.variants?.map((v) => v.id)).toEqual(['fence', 'palisade', 'rampart']);
    expect(FORT_VARIANTS.map((v) => v.icon)).toEqual([
      'fort-fence',
      'fort-palisade',
      'fort-rampart',
    ]);
    expect(
      buildItemForKey({
        code: 'KeyP',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })?.kind,
    ).toBe('fortification');
    expect(new Set(BUILD_ITEMS.map((i) => i.hotkey)).size).toBe(BUILD_ITEMS.length);
  });

  it('cena u kurzoru (práce, klády) roste s plochou a nese útočiště', () => {
    const small = item.check(landscape, village, square(3), undefined, 'palisade', {
      woodSupply: 9999,
    });
    const large = item.check(landscape, village, square(5), undefined, 'palisade', {
      woodSupply: 9999,
    });
    expect(small.check.ok).toBe(true);
    expect(large.check.ok).toBe(true);
    expect(large.cost!.laborManDays).toBeGreaterThan(small.cost!.laborManDays);
    expect(large.cost!.logs).toBeGreaterThan(small.cost!.logs!);
    expect(large.cost!.refuge).toBeGreaterThan(small.cost!.refuge!);
    // 3 × 3 čtverce palisády ≈ 3 × 15 × 4 = 180 m obvodu: 80 čd a 70 klád na 100 m
    expect(small.cost!.logs).toBeGreaterThan(100);
    expect(small.outline?.length).toBeGreaterThan(1);
  });

  it('val nepotřebuje klády; plot s menší cenou než palisáda', () => {
    const rampart = item.check(landscape, village, square(3), undefined, 'rampart', {
      woodSupply: 0,
    });
    expect(rampart.check.ok).toBe(true);
    expect(rampart.cost!.logs).toBe(0);
    const fence = item.check(landscape, village, square(3), undefined, 'fence', {
      woodSupply: 9999,
    });
    const palisade = item.check(landscape, village, square(3), undefined, 'palisade', {
      woodSupply: 9999,
    });
    expect(fence.cost!.laborManDays).toBeLessThan(palisade.cost!.laborManDays);
  });

  it('bez dřeva červeně „Chybí N klád.“ a bez ceny', () => {
    const short = item.check(landscape, village, square(3), undefined, 'palisade', {
      woodSupply: 20,
    });
    expect(short.check.ok).toBe(false);
    expect(short.check.reason).toMatch(/^Chybí \d+ klád\.$/);
    expect(short.cost).toBeNull();
  });

  it('důvody z jádra: přes obydlí a nesouvislá plocha (bez obvodu)', () => {
    const over = item.check(
      landscape,
      { ...village, dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }] },
      square(3, 15, 15),
      undefined,
      'fence',
    );
    expect(over.check.ok).toBe(false);
    const split = item.check(
      landscape,
      village,
      [...square(2), ...square(2, 25, 25)],
      undefined,
      'fence',
    );
    // nesouvislé čtverce nemají obvod – body chybí (UI bodů je další krok)
    expect(split.check.reason).toBe('Obvod chce aspoň 4 body.');
    expect(split.blockedCells).toEqual([]);
  });
});
