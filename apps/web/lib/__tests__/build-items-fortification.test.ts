import { describe, expect, it } from 'vitest';
import { circlePoints, type Landscape, type PlacementVillage } from '@bohemia/game';
import { BUILD_ITEMS, buildItem, buildItemForKey, FORT_VARIANTS } from '../build-items';

// Opevnění v katalogu staveb (fortifications.md – Rozhraní): rozcestník druhů, návrh obvodu z bodů,
// cena u kurzoru roste s tažením bodu, útočiště, důvod „Chybí N klád.“ a místo problému.

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

import { movePoint } from '../fort-points';

/** Kruh bodů o poloměru `r` kolem (x, z) – po nejvýš 15 m. */
const circle = (r: number, x = 80, z = 80): [number, number][] =>
  circlePoints([x, z], r).map(([px, pz]): [number, number] => [px, pz]);

const item = buildItem('fortification');
if (item.placement !== 'fort-points') throw new Error('Opevnění se upravuje po bodech.');

describe('opevnění v katalogu staveb', () => {
  it('je rozcestník plot, palisáda, val se zkratkou P bez kolize', () => {
    expect(item.variants.map((v) => v.id)).toEqual(['fence', 'palisade', 'rampart']);
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

  it('návrh obejme jádro vsi a projde; bez jádra kruh 20 m u kurzoru', () => {
    const points = item.propose(landscape, village, { x: 100, z: 100 }, 'palisade');
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(item.check(landscape, village, points, 'palisade', { woodSupply: 9999 }).check.ok).toBe(
      true,
    );
    // zemnice (0, 0) leží uvnitř návrhu – průměr bodů kolem ní
    const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    expect(Math.abs(cx)).toBeLessThan(10);
    const empty = { ...village, dwellings: [] };
    const ring = item.propose(landscape, empty, { x: 100, z: 100 }, 'palisade');
    for (const [x, z] of ring) expect(Math.hypot(x - 100, z - 100)).toBeCloseTo(20, 6);
  });

  it('tažení bodu ven mění cenu (práce, klády) i útočiště', () => {
    const points = circle(25);
    const before = item.check(landscape, village, points, 'palisade', { woodSupply: 9999 });
    const [x, z] = points[0]!;
    const pulled = movePoint(points, 0, [x + (x - 80) * 0.3, z + (z - 80) * 0.3]);
    const after = item.check(landscape, village, pulled, 'palisade', { woodSupply: 9999 });
    expect(before.check.ok).toBe(true);
    expect(after.check.ok).toBe(true);
    expect(after.cost!.laborManDays).toBeGreaterThan(before.cost!.laborManDays);
    expect(after.cost!.logs).toBeGreaterThan(before.cost!.logs!);
    expect(after.cost!.refuge).toBeGreaterThan(before.cost!.refuge!);
    // obvod 2π · 25 ≈ 157 m palisády: 70 klád na 100 m
    expect(before.cost!.logs).toBeGreaterThan(100);
    // obrys: vnější okraj a vnitřní okraj pásu – uzavřené čáry
    expect(before.outline).toHaveLength(2);
    for (const loop of before.outline!) expect(loop[0]).toEqual(loop[loop.length - 1]);
  });

  it('val nepotřebuje klády; plot s menší cenou než palisáda', () => {
    const rampart = item.check(landscape, village, circle(30), 'rampart', { woodSupply: 0 });
    expect(rampart.check.ok).toBe(true);
    expect(rampart.cost!.logs).toBe(0);
    const fence = item.check(landscape, village, circle(30), 'fence', { woodSupply: 9999 });
    const palisade = item.check(landscape, village, circle(30), 'palisade', { woodSupply: 9999 });
    expect(fence.cost!.laborManDays).toBeLessThan(palisade.cost!.laborManDays);
  });

  it('bez dřeva červeně „Chybí N klád.“ a bez ceny', () => {
    const short = item.check(landscape, village, circle(25), 'palisade', { woodSupply: 20 });
    expect(short.check.ok).toBe(false);
    expect(short.check.reason).toMatch(/^Chybí \d+ klád\.$/);
    expect(short.cost).toBeNull();
  });

  it('místo problému: obvod přes obydlí, ostrý ohyb a křížení – důvod a červená značka', () => {
    // kruh přes zemnici (0, 0) – pás vede přes ni
    const over = item.check(landscape, village, circle(20, 20, 0), 'fence');
    expect(over.check.reason).toBe('Opevnění nevede přes obydlí.');
    expect(over.problem?.length).toBeGreaterThan(0);
    // bod vytažený do špičky – ohyb ostřejší než poloměr palisády
    const points = circle(25);
    const spike = movePoint(points, 0, [points[0]![0], points[0]![1] + 30]);
    const sharp = item.check(landscape, village, spike, 'palisade', { woodSupply: 9999 });
    expect(sharp.check.reason).toBe('Tady je ohyb moc ostrý.');
    expect(sharp.problem?.length).toBeGreaterThan(0);
    // dva protější body prohozené – obvod se kříží
    const crossed = [...points];
    [crossed[1], crossed[5]] = [crossed[5]!, crossed[1]!];
    const cross = item.check(landscape, village, crossed, 'palisade', { woodSupply: 9999 });
    expect(cross.check.ok).toBe(false);
    expect(cross.problem?.length).toBeGreaterThan(0);
  });
});
