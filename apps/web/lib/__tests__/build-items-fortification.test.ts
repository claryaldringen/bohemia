import { describe, expect, it } from 'vitest';
import { circlePoints, dayIndexOf, type Landscape, type PlacementVillage } from '@bohemia/game';
import {
  BUILD_ITEMS,
  buildItem,
  buildItemForKey,
  FORT_VARIANTS,
  fortVariantsBlocked,
} from '../build-items';

// Opevnění v katalogu staveb (fortifications.md – Rozhraní): rozcestník druhů, návrh obvodu z bodů,
// cena u kurzoru roste s tažením bodu, útočiště, důvod „Chybí N klád.“ a místo problému; roštová
// a komorová hradba podle roku a kamene (Hradby a obrana – Druhy, Cena).

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
  it('je rozcestník plot, palisáda, roštová, komorová, val se zkratkou P bez kolize', () => {
    // roštová a komorová hradba od 8. 11. 2026 (Hradby a obrana – Druhy); ikony zatím palisády
    expect(item.variants.map((v) => v.id)).toEqual([
      'fence',
      'palisade',
      'crib',
      'chamber',
      'rampart',
    ]);
    expect(FORT_VARIANTS.map((v) => v.icon)).toEqual([
      'fort-fence',
      'fort-palisade',
      'fort-crib',
      'fort-chamber',
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
    const keyed = BUILD_ITEMS.filter((i) => i.hotkey !== 'None'); // rozcestníky zkratku nemají
    expect(new Set(keyed.map((i) => i.hotkey)).size).toBe(keyed.length);
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
    // obvod 2π · 25 ≈ 157 m palisády: 200 klád na 100 m
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

  it('roštová zašedlá do 31. 12. 789 s důvodem, 1. 1. 790 dostupná; komorová až od 830', () => {
    const eve = dayIndexOf({ year: 789, month: 12, day: 31 });
    expect(fortVariantsBlocked(eve)).toEqual({
      crib: 'Roštová hradba až od roku 790.',
      chamber: 'Komorová hradba až od roku 830.',
    });
    expect(fortVariantsBlocked(eve + 1)).toEqual({ chamber: 'Komorová hradba až od roku 830.' });
    expect(fortVariantsBlocked(dayIndexOf({ year: 830, month: 1, day: 1 }))).toEqual({});
  });

  it('roštová bez kamene a lomu „Chybí N m³ kamene. Ves nemá lom.“; s kamenem či lomem cena i s kamenem', () => {
    const points = circle(25);
    const none = item.check(landscape, village, points, 'crib', { woodSupply: 9999 });
    expect(none.check.ok).toBe(false);
    expect(none.check.reason).toMatch(/^Chybí \d+ m³ kamene\. Ves nemá lom\.$/);
    expect(none.cost).toBeNull();
    const quarry = item.check(landscape, village, points, 'crib', {
      woodSupply: 9999,
      stoneSupply: { m3: 0, quarry: true },
    });
    expect(quarry.check.ok).toBe(true);
    // obvod 2π · 25 ≈ 157 m: 100 m³ kamene na 100 m, 620 čd bez kácení a lámání
    expect(quarry.cost!.stoneM3).toBeGreaterThan(150);
    expect(quarry.cost!.laborManDays).toBeGreaterThan(900);
    const pile = item.check(landscape, village, points, 'crib', {
      woodSupply: 9999,
      stoneSupply: { m3: 500, quarry: false },
    });
    expect(pile.check.ok).toBe(true);
    expect(pile.cost).toEqual(quarry.cost);
    // palisáda kámen nechce
    const palisade = item.check(landscape, village, points, 'palisade', { woodSupply: 9999 });
    expect(palisade.cost!.stoneM3).toBeUndefined();
  });
});
