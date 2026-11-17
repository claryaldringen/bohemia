// @vitest-environment jsdom
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CHURCH_EAST_ROTATION, churchLocalToWorld, defaultChurchDims } from '@bohemia/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChurchPlacer } from '../church-placer';
import type { PlacementPreview, PlacementResult } from '../village-types';

const engine = new NullEngine({
  renderWidth: 400,
  renderHeight: 400,
  textureSize: 64,
  deterministicLockstep: false,
  lockstepMaxSteps: 1,
});
const scene = new Scene(engine);

/** Událost ukazatele s polohou v px plátna (1 px = 1 m terénu v testu). */
function pointer(type: string, x: number, y: number, button = 0): Event {
  return Object.assign(new Event(type), { button, offsetX: x, offsetY: y, pointerId: 1 });
}

function setup(ok = true): {
  placer: ChurchPlacer;
  canvas: HTMLCanvasElement;
  previews: (PlacementPreview | null)[];
  confirmed: PlacementResult[];
  move: (x: number, y: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const previews: (PlacementPreview | null)[] = [];
  const confirmed: PlacementResult[] = [];
  const placer = new ChurchPlacer(
    {
      scene,
      canvas,
      pickGround: (x, y) => [x, y],
      decalHeight: () => 0,
      requestRender: () => {},
    },
    {
      kind: 'church',
      type: 'chancel',
      dims: defaultChurchDims('chancel'),
      check: () =>
        ok
          ? { ok: true, reason: null, cost: { laborManDays: 900, trees: 0, stoneM3: 150 } }
          : { ok: false, reason: 'Kostel se překrývá s obydlím.' },
    },
    {
      onConfirm: (result) => confirmed.push(result),
      onCancel: () => {},
      onPreview: (p) => previews.push(p),
    },
  );
  return {
    placer,
    canvas,
    previews,
    confirmed,
    move: (x, y) => placer.setCursor([x, y], { x, y }),
  };
}

let active: ChurchPlacer | null = null;
afterEach(() => {
  active?.dispose();
  active = null;
});

describe('umisťování kostela', () => {
  it('u kurzoru kněžištěm na východ s rozměry a cenou; klik a Enter ho postaví', () => {
    const t = setup();
    active = t.placer;
    t.move(60, 80);
    const hover = t.previews.at(-1)!;
    expect(hover.church).toMatchObject({ type: 'chancel', pinned: false });
    expect(hover.measure).toBe('5 × 8 × 7 m');
    expect(hover.cost?.stoneM3).toBe(150);
    t.canvas.dispatchEvent(pointer('pointerdown', 60, 80));
    t.canvas.dispatchEvent(pointer('pointerup', 60, 80));
    expect(t.previews.at(-1)?.church?.pinned).toBe(true);
    // kurzor jinde – položený kostel zůstane
    t.move(200, 200);
    t.placer.confirm();
    expect(t.confirmed).toEqual([
      {
        kind: 'church',
        type: 'chancel',
        dims: defaultChurchDims('chancel'),
        position: { x: 60, z: 80, rotation: CHURCH_EAST_ROTATION },
      },
    ]);
  });

  it('tah od vstupu jen natáčí osu po 15°, rozměry zůstanou; +/− mění šířku a výšku', () => {
    const t = setup();
    active = t.placer;
    t.move(100, 100);
    t.canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    // tah k jihu (+z): osa −90°, délka lodi zůstane z panelu (8 m)
    t.move(100, 116);
    t.canvas.dispatchEvent(pointer('pointerup', 100, 116));
    const pinned = t.previews.at(-1)!.church!;
    expect(pinned).toMatchObject({ pinned: true, dims: { length: 8 } });
    t.placer.setDims({ kind: 'long', width: 6, length: 8, height: 9 });
    expect(t.previews.at(-1)?.measure).toBe('6 × 8 × 9 m');
    t.placer.confirm();
    const result = t.confirmed[0];
    if (result?.kind !== 'church') throw new Error('kostel');
    expect(result.position.rotation).toBeCloseTo(-Math.PI / 2, 6);
    const entrance = churchLocalToWorld(result.position, -4, 0);
    expect(entrance.x).toBeCloseTo(100, 4);
    expect(entrance.z).toBeCloseTo(100, 4);
  });

  it('neprošlé místo se nepotvrdí; Esc položený kostel uvolní', () => {
    const t = setup(false);
    active = t.placer;
    t.move(30, 30);
    t.canvas.dispatchEvent(pointer('pointerdown', 30, 30));
    t.canvas.dispatchEvent(pointer('pointerup', 30, 30));
    t.placer.confirm();
    expect(t.confirmed).toHaveLength(0);
    expect(t.previews.at(-1)?.check.reason).toBe('Kostel se překrývá s obydlím.');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(t.previews.at(-1)?.church?.pinned).toBe(false);
  });
});
