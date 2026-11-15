import { setE2EHook } from '../e2e-hooks';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  FORT_MIN_POINTS,
  insertPoint,
  movePoint,
  nearestOnLoop,
  nearestPoint,
  removePoint,
  type FortEditPoint,
} from '../fort-points';
import { stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import type { FortPointsPreview, PlacementHandlers, PlacementMode } from './village-types';
import type { ActivePlacement } from './village-placement';

/** Kliknutí = stisk a puštění bez tažení (px); delší tah bod posune. */
const CLICK_SLOP_PX = 6;
/** Jak často nejvýš přepočítat náhled během tažení (ms). */
const PREVIEW_INTERVAL_MS = 80;
/** Poloměr kroužku bodu ve scéně (m). */
const HANDLE_M = 1.2;
/** Bod jde chytit do tolika px od kurzoru (nejméně o kroužek dál). */
const HANDLE_PICK_PX = 14;
/** Bod jde chytit nejvýš do takového podílu vzdálenosti k sousednímu bodu. */
const HANDLE_GAP_SHARE = 0.35;
/** Klik do tolika m od vnějšího okraje přidá bod (nejméně; jinak šířka pásu). */
const EDGE_PICK_M = 2;
/** Obrys přes stromy – druhý obrys bez testu hloubky, průsvitný. */
const XRAY_ALPHA = 0.55;
const COLORS = {
  ok: [0.3, 0.85, 0.35],
  bad: [0.92, 0.24, 0.18],
  draw: [0.98, 0.78, 0.3],
  handle: [0.95, 0.95, 0.92],
} as const satisfies Record<string, readonly [number, number, number]>;
type Look = keyof typeof COLORS;

export interface FortEditContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Bod terénu pod pixelem plátna (CSS px) – `terrain-pick.ts`, nebo null. */
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  requestRender(): void;
}

type FortMode = Extract<PlacementMode, { kind: 'fort-points' }>;

/** Stisk levého tlačítka – nad bodem tah bodu, jinde (po puštění) klik na obvod. */
interface Press {
  pointerId: number;
  from: { x: number; y: number };
  /** Bod, který se táhne (index); null – stisk mimo body. */
  index: number | null;
  /** Bod terénu pod stiskem. */
  at: Point;
  remove: boolean;
  dragged: boolean;
  /** Body před tahem – Esc tah vrátí. */
  before: FortEditPoint[];
}

/**
 * Úprava návrhu obvodu opevnění z bodů (fortifications.md – Obvod, Rozhraní). Hra obvod navrhne
 * u prvního bodu kurzoru (`mode.propose` – kolem jádra vsi, bez jádra kruh 20 m u kurzoru); hráč
 * bod táhne (stisk a tažení – myš i trackpad), klik na obvod přidá bod, Ctrl (na Macu i Cmd)
 * + klik bod ubere (nejméně 4). Enter (nebo ikona kladiva v rozhraní) obvod položí, Esc vrátí
 * rozběhnutý tah nebo návrh zahodí, Backspace / Ctrl+Z vrátí poslední úpravu, pravé kliknutí
 * zruší jako u ostatních staveb. Obrys pásu je zelený (projde) / červený (neprojde) a místo
 * problému z kontroly jádra svítí červeně; cena a útočiště jdou do bubliny u kurzoru. S pevnými
 * konci (`mode.fixedEnds` – úsek od brány k bráně, demolition.md – Rozhodnutí) jsou body otevřená trasa
 * od brány k bráně: konce nejdou chytit ani ubrat, bod přibude jen na trase.
 */
export class FortPointsEditor implements ActivePlacement {
  private points: FortEditPoint[] | null = null;
  private history: FortEditPoint[][] = [];
  private press: Press | null = null;
  private rightDown: { x: number; y: number } | null = null;
  private hover: number | null = null;
  private screen: { x: number; y: number } | null = null;
  private removeHeld = false;
  private dirty = true;
  private lastPreview = 0;
  private preview: FortPointsPreview | null = null;
  /** Body, ke kterým patří `preview` – jiné body = nová kontrola (pohyb kurzoru jen překreslí). */
  private checked: FortEditPoint[] | null = null;
  private meshes: Mesh[] = [];
  private readonly lineMaterials: Record<Look, StandardMaterial>;
  private readonly xrayMaterials: Record<Look, StandardMaterial>;
  private done = false;

  constructor(
    private readonly context: FortEditContext,
    readonly mode: FortMode,
    private readonly handlers: PlacementHandlers,
  ) {
    const scene = context.scene;
    const line = (look: Look): StandardMaterial =>
      createDecalMaterial(scene, `fort-edit-line-${look}`, {
        emissive: new Color3(...COLORS[look]),
        zOffset: -6,
      });
    const xray = (look: Look): StandardMaterial => {
      const material = createDecalMaterial(scene, `fort-edit-xray-${look}`, {
        emissive: new Color3(...COLORS[look]),
      });
      material.alpha = XRAY_ALPHA;
      material.depthFunction = Constants.ALWAYS;
      material.disableDepthWrite = true;
      return material;
    };
    this.lineMaterials = {
      ok: line('ok'),
      bad: line('bad'),
      draw: line('draw'),
      handle: line('handle'),
    };
    this.xrayMaterials = {
      ok: xray('ok'),
      bad: xray('bad'),
      draw: xray('draw'),
      handle: xray('handle'),
    };
    context.canvas.addEventListener('pointerdown', this.onPointerDown);
    context.canvas.addEventListener('pointerup', this.onPointerUp);
    context.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    context.canvas.style.cursor = 'crosshair';
    setE2EHook('fortPoints', () => (this.points ?? []).map(([x, z]) => [x, z] as const));
  }

  /** Bod terénu pod kurzorem (null mimo krajinu) a kurzor v px plátna – jednou za snímek. */
  setCursor(point: Point | null, screen: { x: number; y: number } | null): void {
    if (this.done) return;
    this.screen = point ? screen : null;
    if (point && this.points === null) {
      this.points = this.mode.propose(point).map(([x, z]): FortEditPoint => [x, z]);
      this.dirty = true;
    }
    const press = this.press;
    if (press && press.index !== null && point && this.points) {
      if (screen && distance(screen, press.from) > CLICK_SLOP_PX) press.dragged = true;
      if (press.dragged) {
        this.points = movePoint(this.points, press.index, [point[0], point[1]]);
        this.dirty = true;
      }
    } else if (!press) {
      const hover = point ? this.handleAt(point, screen) : null;
      if (hover !== this.hover) {
        this.hover = hover;
        this.dirty = true;
      }
    }
    this.updateCursorStyle();
    this.report();
  }

  /** Volá scéna každý snímek – náhled se přepočítá nejvýš po PREVIEW_INTERVAL_MS. */
  tick(now: number): void {
    if (this.done || !this.dirty || now - this.lastPreview < PREVIEW_INTERVAL_MS) return;
    this.lastPreview = now;
    this.refresh();
  }

  /** Položí obvod (Enter, ikona kladiva) – jen když prošel kontrolou. */
  confirm(): void {
    if (this.done || this.press?.dragged || !this.points) return;
    if (this.dirty) this.refresh();
    if (!this.preview?.check.ok) return;
    const points = this.points.map(([x, z]): [number, number] => [x, z]);
    this.dispose();
    this.handlers.onConfirm({ kind: 'fort-points', points, variant: this.mode.variant.id });
  }

  /** Zahodí návrh a ohlásí to (`onCancel`). */
  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.handlers.onCancel();
  }

  /** Uklidí meshe a posluchače bez ohlášení. */
  dispose(): void {
    if (this.done) return;
    this.done = true;
    setE2EHook('paintProblems', undefined);
    setE2EHook('fortPoints', undefined);
    const canvas = this.context.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.endPress();
    canvas.style.cursor = '';
    disposeAll(this.meshes);
    for (const m of [...Object.values(this.lineMaterials), ...Object.values(this.xrayMaterials)]) {
      m.dispose();
    }
    this.handlers.onPreview?.(null);
    this.context.requestRender();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      this.rightDown = { x: event.offsetX, y: event.offsetY };
      return;
    }
    if (event.button !== 0 || !this.points) return;
    const at = this.context.pickGround(event.offsetX, event.offsetY);
    if (!at) return;
    const screen = { x: event.offsetX, y: event.offsetY };
    const index = this.handleAt(at, screen);
    try {
      this.context.canvas.setPointerCapture(event.pointerId);
    } catch {
      // bez zachycení tah skončí na okraji plátna – nevadí
    }
    this.press = {
      pointerId: event.pointerId,
      from: screen,
      index,
      at,
      remove: event.ctrlKey || event.metaKey,
      dragged: false,
      before: this.points,
    };
    this.updateCursorStyle();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) {
      const down = this.rightDown;
      this.rightDown = null;
      if (!down || distance(down, { x: event.offsetX, y: event.offsetY }) > CLICK_SLOP_PX) return;
      this.cancel();
      return;
    }
    const press = this.press;
    if (event.button !== 0 || !press) return;
    this.endPress();
    if (press.dragged) {
      // tah bodu skončil – jedna úprava do historie
      this.history.push(press.before);
      this.dirty = true;
      return;
    }
    const points = this.points;
    if (!points) return;
    if (press.index !== null) {
      // Ctrl + klik na bod ho ubere (nejméně 4); klik bez Ctrl bod jen chytí
      const fewer = press.remove ? removePoint(points, press.index, this.minPoints()) : null;
      if (fewer) this.edit(fewer);
      return;
    }
    // otvor po bráně má jen pevné konce (D45); Ctrl + klik bod neubere
    if (press.remove || this.mode.fixedRoute === true) return;
    // klik na obvod (do šířky pásu, nejméně 2 m od vnějšího okraje) přidá bod na křivku
    const open = this.mode.fixedEnds === true;
    const edge = this.preview?.outline?.[0];
    const near = edge ? nearestOnLoop(edge, press.at[0], press.at[1], open) : null;
    if (!near || near.distance > Math.max(EDGE_PICK_M, this.mode.bandM)) return;
    const more = insertPoint(points, near.point, open);
    if (more) this.edit(more);
  };

  private readonly onPointerCancel = (): void => {
    const press = this.press;
    if (!press) return;
    this.endPress();
    if (press.dragged) {
      this.points = press.before;
      this.dirty = true;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select')) return;
    if (event.key === 'Control' || event.key === 'Meta') {
      this.setRemove(true);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      this.undo();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    switch (event.code) {
      case 'Escape': {
        event.preventDefault();
        const press = this.press;
        if (press?.dragged) {
          this.endPress();
          this.points = press.before;
          this.dirty = true;
        } else {
          this.cancel();
        }
        return;
      }
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault();
        this.confirm();
        return;
      case 'Backspace':
        event.preventDefault();
        this.undo();
        return;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Control' || event.key === 'Meta') this.setRemove(false);
  };

  private readonly onBlur = (): void => {
    this.setRemove(false);
  };

  private setRemove(held: boolean): void {
    if (this.removeHeld === held) return;
    this.removeHeld = held;
    this.dirty = true;
    this.updateCursorStyle();
  }

  /** Nejméně bodů – obvod 4, trasa úseku jinudy jen pevné konce. */
  private minPoints(): number {
    return this.mode.fixedEnds ? 2 : FORT_MIN_POINTS;
  }

  private edit(points: FortEditPoint[]): void {
    if (this.points) this.history.push(this.points);
    this.points = points;
    this.hover = null;
    this.dirty = true;
  }

  private undo(): void {
    if (this.press?.dragged) return;
    const previous = this.history.pop();
    if (!previous) return;
    this.points = previous;
    this.dirty = true;
  }

  private endPress(): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    try {
      this.context.canvas.releasePointerCapture(press.pointerId);
    } catch {
      // zachycení už skončilo samo
    }
  }

  /**
   * Bod obvodu pod kurzorem – do HANDLE_PICK_PX (převedeno na metry u kurzoru), nejvýš ale
   * HANDLE_GAP_SHARE vzdálenosti k sousednímu bodu, ať klik na obvod mezi body při oddálené
   * kameře přidá bod a nechytí sousední; nebo null.
   */
  private handleAt(point: Point, screen: { x: number; y: number } | null): number | null {
    const points = this.points;
    if (!points) return null;
    const least = HANDLE_M * 1.5;
    let radius = least;
    if (screen) {
      const side = this.context.pickGround(screen.x + HANDLE_PICK_PX, screen.y);
      if (side) radius = Math.max(radius, Math.hypot(side[0] - point[0], side[1] - point[1]));
    }
    const index = nearestPoint(points, point[0], point[1], radius);
    if (index === null) return null;
    const n = points.length;
    // konce trasy úseku jinudy leží pevně v branách
    if (this.mode.fixedEnds && (index === 0 || index === n - 1)) return null;
    const p = points[index]!;
    const gap = Math.min(
      ...[points[(index + n - 1) % n]!, points[(index + 1) % n]!].map((q) =>
        Math.hypot(q[0] - p[0], q[1] - p[1]),
      ),
    );
    const reach = Math.max(least, Math.min(radius, gap * HANDLE_GAP_SHARE));
    return Math.hypot(p[0] - point[0], p[1] - point[1]) <= reach ? index : null;
  }

  private updateCursorStyle(): void {
    const style = this.press?.dragged
      ? 'grabbing'
      : this.hover !== null
        ? this.removeHeld
          ? 'not-allowed'
          : 'grab'
        : 'crosshair';
    if (this.context.canvas.style.cursor !== style) this.context.canvas.style.cursor = style;
  }

  /** Přepočítá kontrolu a překreslí obrys, brány, místo problému a body. */
  private refresh(): void {
    this.dirty = false;
    disposeAll(this.meshes);
    const points = this.points;
    if (!points) return;
    if (this.checked !== points || !this.preview) {
      this.preview = this.mode.preview(points);
      this.checked = points;
    }
    const preview = this.preview;
    const look: Look = preview.check.ok ? 'ok' : 'bad';
    const loops = (preview.outline ?? []).map((line) => line.map(([x, z]): Point => [x, z]));
    if (loops.length > 0) {
      this.meshes.push(this.lineMesh('fort-edit-outline', loops, look, 0.45, true));
    }
    const gates = (preview.gates ?? []).map((line) => line.map(([x, z]): Point => [x, z]));
    if (gates.length > 0) {
      this.meshes.push(this.lineMesh('fort-edit-gates', gates, 'handle', 1.6));
    }
    // místo problému (ohyb, křížení, stavba, voda, jiné opevnění) – červeně, i skrz terén
    const problem = (preview.problem ?? []).map((line) => line.map(([x, z]): Point => [x, z]));
    setE2EHook('paintProblems', () => problem.length);
    if (problem.length > 0) {
      this.meshes.push(this.lineMesh('fort-edit-problem', problem, 'bad', 0.7, true));
    }
    // body obvodu – kroužky; bod pod kurzorem (a tažený) větší, s Ctrl červený (ubere se)
    const active = this.press?.index ?? this.hover;
    const rings = points.map(([x, z], i) => ring(x, z, i === active ? HANDLE_M * 1.4 : HANDLE_M));
    this.meshes.push(this.lineMesh('fort-edit-points', rings, 'handle', 0.3, true, true));
    if (active !== null && this.removeHeld && points.length > this.minPoints()) {
      const [x, z] = points[active]!;
      this.meshes.push(
        this.lineMesh('fort-edit-remove', [ring(x, z, HANDLE_M * 1.4)], 'bad', 0.4, false, true),
      );
    }
    this.report();
    this.context.requestRender();
  }

  /** Ohlásí rozhraní kontrolu, cenu a kurzor pro bublinu. */
  private report(): void {
    if (this.done) return;
    const preview = this.preview;
    this.handlers.onPreview?.({
      check: preview?.check ?? { ok: false, reason: null },
      label: '',
      screen: this.screen,
      cost: preview?.check.ok ? (preview.cost ?? null) : null,
      variant: this.mode.variant,
    });
  }

  private lineMesh(
    name: string,
    lines: Point[][],
    look: Look,
    width: number,
    xray = false,
    closed = false,
  ): Mesh {
    const segments = lines.flatMap((line) => stripSegments(line, closed, width, 1.5));
    const mesh = createStripMesh(
      this.context.scene,
      name,
      segments,
      this.context.decalHeight,
      0.15,
    );
    mesh.material = this.lineMaterials[look];
    mesh.receiveShadows = false;
    if (xray) {
      // druhý obrys přes stromy a terén – body pod korunami jdou chytit
      const through = createStripMesh(
        this.context.scene,
        `${name}-xray`,
        segments,
        this.context.decalHeight,
        0.15,
      );
      through.material = this.xrayMaterials[look];
      through.alphaIndex = 12;
      through.receiveShadows = false;
      this.meshes.push(through);
    }
    return mesh;
  }
}

/** Kroužek bodu – dvanáctiúhelník kolem (x, z). */
function ring(x: number, z: number, r: number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    out.push([x + Math.cos(t) * r, z + Math.sin(t) * r]);
  }
  return out;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function disposeAll(meshes: Mesh[]): void {
  for (const mesh of meshes) mesh.dispose();
  meshes.length = 0;
}
