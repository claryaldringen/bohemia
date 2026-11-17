import { describe, expect, it } from 'vitest';
import {
  CHURCH,
  CHURCH_EAST_ROTATION,
  churchCost,
  churchLocalToWorld,
  defaultChurchDims,
  type Landscape,
  type PlacementVillage,
} from '@bohemia/game';
import { buildItem, buildItemForKey } from '../build-items';
import {
  churchAtCursor,
  churchDimsText,
  churchFromDrag,
  recallChurchDims,
  rememberChurchDims,
  churchPlacementCost,
  stepChurchDims,
} from '../church-placement';

describe('tah kostela', () => {
  it('krátký klik – výchozí rozměry a kněžištěm na východ, střed pod kurzorem', () => {
    const layout = churchAtCursor('rotunda', defaultChurchDims('rotunda'), { x: 5, z: 7 });
    expect(layout.position).toEqual({ x: 5, z: 7, rotation: CHURCH_EAST_ROTATION });
    expect(layout.dims).toEqual(defaultChurchDims('rotunda'));
  });

  it('tah na východ: vstup zůstane, kde tah začal, rozměry se nemění', () => {
    const layout = churchFromDrag(
      'chancel',
      defaultChurchDims('chancel'),
      { x: 0, z: 0 },
      { x: 12, z: 0 },
    );
    expect(layout.position.rotation).toBeCloseTo(0);
    expect(layout.dims).toMatchObject({ kind: 'long', length: 8, width: 5, height: 7 });
    const entrance = churchLocalToWorld(layout.position, -4, 0);
    expect(entrance.x).toBeCloseTo(0, 6);
    expect(entrance.z).toBeCloseTo(0, 6);
  });

  it('osa se přichytí po 15° a míří ke konci tahu (konvence budov)', () => {
    // 50° od východu proti směru hodin v rovině x–z (z dolů) → 45°
    const a = (50 * Math.PI) / 180;
    const to = { x: 20 * Math.cos(a), z: -20 * Math.sin(a) };
    const layout = churchFromDrag('apse', defaultChurchDims('apse'), { x: 0, z: 0 }, to);
    expect(layout.position.rotation).toBeCloseTo(Math.PI / 4, 6);
    // bod osy 20 m od vstupu (střed lodi je od vstupu o polovinu délky dál)
    const chancelEnd = churchLocalToWorld(
      layout.position,
      20 - (layout.dims.kind === 'long' ? layout.dims.length : 0) / 2,
      0,
    );
    expect(Math.hypot(chancelEnd.x - to.x, chancelEnd.z - to.z)).toBeLessThan(20 * 0.15);
  });

  it('tah rozměry nemění ani u rotundy; zadané rozměry se ořežou do mezí', () => {
    const r = churchFromDrag(
      'rotunda',
      defaultChurchDims('rotunda'),
      { x: 0, z: 0 },
      { x: 0, z: 30 },
    );
    expect(r.dims).toEqual(defaultChurchDims('rotunda'));
    const big = { kind: 'long', width: 5, length: 99, height: 7 } as const;
    const long = churchFromDrag('chancel', big, { x: 0, z: 0 }, { x: 9, z: 0 });
    expect(long.dims).toMatchObject({ length: CHURCH.limits.length.max });
  });

  it('rozměry z panelu se pamatují ve vsi a typu', () => {
    expect(recallChurchDims('v1', 'chancel')).toEqual(defaultChurchDims('chancel'));
    const dims = stepChurchDims('chancel', defaultChurchDims('chancel'), 'length', 1);
    rememberChurchDims('v1', 'chancel', dims);
    expect(recallChurchDims('v1', 'chancel')).toEqual(dims);
    expect(recallChurchDims('v2', 'chancel')).toEqual(defaultChurchDims('chancel'));
    expect(recallChurchDims(null, 'chancel')).toEqual(defaultChurchDims('chancel'));
  });

  it('+/− po 0,5 m v mezích', () => {
    const d = defaultChurchDims('chancel');
    expect(stepChurchDims('chancel', d, 'width', 1)).toMatchObject({ width: 5.5 });
    expect(stepChurchDims('chancel', d, 'height', -1)).toMatchObject({ height: 6.5 });
    const top = { kind: 'long', width: CHURCH.limits.width.max, length: 8, height: 7 } as const;
    expect(stepChurchDims('chancel', top, 'width', 1)).toMatchObject({
      width: CHURCH.limits.width.max,
    });
    expect(stepChurchDims('rotunda', defaultChurchDims('rotunda'), 'diameter', 1)).toMatchObject({
      diameter: 7,
    });
  });

  it('rozměry a cena u kurzoru z churchCost', () => {
    expect(churchDimsText(defaultChurchDims('rotunda'))).toBe('Ø 6,5 × 6 m');
    expect(churchDimsText(defaultChurchDims('chancel'))).toBe('5 × 8 × 7 m');
    const dims = defaultChurchDims('rotunda');
    const cost = churchPlacementCost('rotunda', dims, 3);
    const raw = churchCost('rotunda', dims);
    expect(cost.stoneM3).toBe(Math.round(raw.stoneM3));
    expect(cost.sandM3).toBe(Math.round(raw.sandM3));
    expect(cost.limeT).toBeCloseTo(raw.limeT, 1);
    expect(cost.logs).toBe(Math.ceil(raw.woodKg / CHURCH.woodKgPerLog));
    const work = Object.values(raw.work).reduce((a, b) => a + b, 0);
    expect(cost.laborManDays).toBe(Math.round(work + 3));
  });
});

describe('kostel v katalogu staveb', () => {
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

  it('malý [I] a velký [Y] kostel – umístění tahem', () => {
    expect(
      buildItemForKey({
        code: 'KeyI',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })?.kind,
    ).toBe('church-small');
    expect(
      buildItemForKey({
        code: 'KeyY',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })?.kind,
    ).toBe('church-large');
    expect(buildItem('church-small').placement).toBe('church');
  });

  it('kontrola jako na serveru: volné místo s cenou, přes obydlí neprojde', () => {
    const item = buildItem('church-small');
    if (item.placement !== 'church') throw new Error('kostel');
    const dims = defaultChurchDims('rotunda');
    const free = item.check(landscape, village, 'rotunda', dims, {
      x: 90,
      z: 90,
      rotation: Math.PI / 4,
    });
    expect(free.ok).toBe(true);
    expect(free.cost?.stoneM3).toBeGreaterThan(100);
    const over = item.check(landscape, village, 'rotunda', dims, { x: 0, z: 0, rotation: 0 });
    expect(over.ok).toBe(false);
    expect(over.cost).toBeNull();
  });
});
