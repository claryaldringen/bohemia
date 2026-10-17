import '@babylonjs/core/Rendering/outlineRenderer';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  DWELLING_FOOTPRINT_M,
  type DwellingType,
  type PlacementCheck,
  type Position,
} from '@bohemia/game';
import { instanceMatrices } from './instanced-model';
import {
  decalGrid,
  footprintCorners,
  localToWorld,
  polygonBounds,
  softCoverage,
  stripSegments,
  type Point,
} from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';
import type { PlacementHandlers, PlacementMode, SceneDwelling } from './village-types';

/** Krok otáčení obydlí klávesami Q/E. */
const ROTATE_STEP = Math.PI / 12;
/** Kliknutí = stisk a puštění tlačítka bez tažení (px) – tažení posouvá / otáčí kameru. */
const CLICK_SLOP_PX = 6;
/** Dvojklik: druhé kliknutí do tolika ms a px od prvního uzavře obrys pole. */
const DOUBLE_CLICK_MS = 450;
const DOUBLE_CLICK_PX = 8;
/** Kliknutí blíž než tolik px k prvnímu bodu obrys uzavře. */
const CLOSE_PX = 14;
/** Jak často nejvýš volat `preview` pole během tažení kurzoru (ms). */
const PREVIEW_INTERVAL_MS = 80;
const OK_COLOR = new Color3(0.3, 0.85, 0.35);
const BAD_COLOR = new Color3(0.92, 0.24, 0.18);
const DRAW_COLOR = new Color3(0.95, 0.85, 0.45);
const GHOST_VISIBILITY = 0.6;
const DWELLING_NAMES: Record<DwellingType, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
};
const FIELD_HINT = 'Klikáním přidej body obrysu pole (aspoň tři)';

export interface PlacementContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Bod terénu pod pixelem plátna (CSS px), nebo null. */
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  /** Kolik metrů terénu připadá na pixel u cíle kamery (pro tolerance kliknutí). */
  metersPerPixel(): number;
  /** Natočení kamery (alpha) – obydlí se poprvé natočí vchodem ke kameře. */
  cameraAlpha(): number;
  /** Q/E otáčí kamerou – při umisťování obydlí otáčí obydlím. */
  setCameraKeyRotation(enabled: boolean): void;
  ghostModel(type: DwellingType): Mesh | null;
  baseHeight(d: Pick<SceneDwelling, 'type' | 'position'>): number;
  requestRender(): void;
}

/**
 * Umisťování obydlí a kreslení pole. Myš: levé tlačítko bez tažení potvrdí / přidá bod (tažení
 * dál posouvá kameru), pravé bez tažení zruší obydlí / ubere bod pole (tažení dál otáčí kamerou).
 * Klávesy: Q/E otáčí obydlím, Esc ruší, u pole Backspace ubere bod a Enter nebo dvojklik uzavře
 * obrys. Kurzor nad terénem dodává scéna jednou za snímek (`setCursor`).
 */
export class PlacementController {
  private readonly ghost: Mesh[] = [];
  private readonly materials: Record<'ok' | 'bad' | 'draw', StandardMaterial>;
  private readonly fillMaterials: Record<'ok' | 'bad' | 'draw', StandardMaterial>;
  private readonly pegs: Mesh;
  private cursor: Point | null = null;
  private screen: { x: number; y: number } | null = null;
  private rotation: number;
  private readonly points: Point[] = [];
  private downs = new Map<number, { x: number; y: number }>();
  private lastClick: { x: number; y: number; time: number } | null = null;
  private dirty = true;
  private lastPreview = 0;
  /** Výsledek kontroly obrysu (ne)uzavřeného pole – zobrazený, dokud se obrys nezmění. */
  private closeFailure: PlacementCheck | null = null;
  private model: Mesh | null = null;
  private done = false;

  constructor(
    private readonly context: PlacementContext,
    readonly mode: PlacementMode,
    private readonly handlers: PlacementHandlers,
  ) {
    const scene = context.scene;
    const material = (name: string, color: Color3, zOffset: number): StandardMaterial =>
      createDecalMaterial(scene, `village-ghost-${name}`, { emissive: color, zOffset });
    this.materials = {
      ok: material('ok', OK_COLOR, -6),
      bad: material('bad', BAD_COLOR, -6),
      draw: material('draw', DRAW_COLOR, -6),
    };
    this.fillMaterials = {
      ok: material('fill-ok', OK_COLOR, -5),
      bad: material('fill-bad', BAD_COLOR, -5),
      draw: material('fill-draw', DRAW_COLOR, -5),
    };
    this.pegs = CreateBox('village-ghost-pegs', { width: 0.18, depth: 0.18, height: 1.4 }, scene);
    this.pegs.isPickable = false;
    this.pegs.material = this.materials.draw;
    this.pegs.setEnabled(false);
    // Vchod ke kameře: kamera stojí ve směru (cos α, sin α) od cíle, vchod míří (sin r, cos r).
    this.rotation = Math.PI / 2 - context.cameraAlpha();
    if (mode.kind === 'dwelling') context.setCameraKeyRotation(false);
    context.canvas.addEventListener('pointerdown', this.onPointerDown);
    context.canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    context.canvas.style.cursor = 'crosshair';
  }

  /** Bod terénu pod kurzorem (null mimo krajinu) a kurzor v px plátna. */
  setCursor(point: Point | null, screen: { x: number; y: number } | null): void {
    if (this.done) return;
    this.cursor = point;
    this.screen = point ? screen : null;
    this.dirty = true;
    if (this.mode.kind === 'dwelling') this.refresh();
  }

  /** Volá scéna každý snímek – kreslení pole se překresluje nejvýš po PREVIEW_INTERVAL_MS. */
  tick(now: number): void {
    if (this.done || !this.dirty) return;
    if (this.mode.kind === 'field' && now - this.lastPreview < PREVIEW_INTERVAL_MS) return;
    this.lastPreview = now;
    this.refresh();
  }

  /** Zruší umisťování a ohlásí to (`onCancel`). */
  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.handlers.onCancel();
  }

  /** Uklidí ducha a posluchače bez ohlášení. */
  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.context.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.context.canvas.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    this.context.canvas.style.cursor = '';
    this.context.setCameraKeyRotation(true);
    this.clearGhost();
    this.model?.setEnabled(false);
    this.pegs.dispose();
    for (const m of [...Object.values(this.materials), ...Object.values(this.fillMaterials)])
      m.dispose();
    this.handlers.onPreview?.(null);
    this.context.requestRender();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.downs.set(event.button, { x: event.offsetX, y: event.offsetY });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.downs.get(event.button);
    this.downs.delete(event.button);
    if (!down || Math.hypot(event.offsetX - down.x, event.offsetY - down.y) > CLICK_SLOP_PX) return;
    if (event.button === 0) this.onClick(event.offsetX, event.offsetY, event.timeStamp);
    else if (event.button === 2) this.onRightClick();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.ctrlKey || event.metaKey || target?.closest('input, textarea, select')) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (this.mode.kind === 'dwelling') {
      if (event.code === 'KeyQ' || event.code === 'KeyE') {
        event.preventDefault();
        this.rotation += event.code === 'KeyE' ? ROTATE_STEP : -ROTATE_STEP;
        this.refresh();
      }
      return;
    }
    if (event.code === 'Backspace') {
      event.preventDefault();
      this.removeLastPoint();
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      this.closeField();
    }
  };

  private onClick(x: number, y: number, time: number): void {
    const point = this.context.pickGround(x, y);
    const last = this.lastClick;
    this.lastClick = { x, y, time };
    if (this.mode.kind === 'dwelling') {
      if (!point) return;
      const position = this.position(point);
      const check = this.mode.check(position);
      if (!check.ok) {
        this.refresh();
        return;
      }
      const type = this.mode.type;
      this.dispose();
      this.handlers.onConfirm({ kind: 'dwelling', type, position });
      return;
    }
    // Druhé kliknutí dvojkliku uzavře obrys (první už bod přidalo).
    if (
      last &&
      time - last.time < DOUBLE_CLICK_MS &&
      Math.hypot(x - last.x, y - last.y) < DOUBLE_CLICK_PX
    ) {
      this.lastClick = null;
      this.closeField();
      return;
    }
    if (!point) return;
    const first = this.points[0];
    if (
      first &&
      this.points.length >= 3 &&
      Math.hypot(point[0] - first[0], point[1] - first[1]) <
        CLOSE_PX * this.context.metersPerPixel()
    ) {
      this.closeField();
      return;
    }
    this.points.push(point);
    this.closeFailure = null;
    this.dirty = true;
    this.lastPreview = 0;
  }

  private onRightClick(): void {
    if (this.mode.kind === 'dwelling' || this.points.length === 0) {
      this.cancel();
      return;
    }
    this.removeLastPoint();
  }

  private removeLastPoint(): void {
    this.points.pop();
    this.closeFailure = null;
    this.dirty = true;
    this.lastPreview = 0;
  }

  private closeField(): void {
    if (this.mode.kind !== 'field') return;
    if (this.points.length < 3) {
      this.closeFailure = { ok: false, reason: FIELD_HINT };
      this.refresh();
      return;
    }
    const outline = this.points.map((p): [number, number] => [p[0], p[1]]);
    const result = this.mode.preview(outline);
    if (!result.check.ok) {
      this.closeFailure = result.check;
      this.refresh();
      return;
    }
    this.dispose();
    this.handlers.onConfirm({ kind: 'field', outline });
  }

  private position(point: Point): Position {
    return { x: point[0], z: point[1], rotation: normalizeAngle(this.rotation) };
  }

  /** Překreslí ducha podle kurzoru a ohlásí stav rozhraní. */
  private refresh(): void {
    if (this.done) return;
    this.dirty = false;
    this.clearGhost();
    if (this.mode.kind === 'dwelling') this.refreshDwelling(this.mode);
    else this.refreshField(this.mode);
    this.context.requestRender();
  }

  private refreshDwelling(mode: Extract<PlacementMode, { kind: 'dwelling' }>): void {
    this.model ??= this.context.ghostModel(mode.type);
    if (!this.cursor) {
      this.model?.setEnabled(false);
      this.handlers.onPreview?.(null);
      return;
    }
    const position = this.position(this.cursor);
    const check = mode.check(position);
    const look = check.ok ? 'ok' : 'bad';
    const { width, depth } = DWELLING_FOOTPRINT_M[mode.type];
    const corners = footprintCorners(position, width, depth);
    this.addFill(corners, look, 0.35);
    this.addStrip(stripSegments(corners, true, 0.2, 1), look);
    // Šipka před vchodem – kam bude obydlí otevřené.
    const tip = localToWorld(position, 0, depth / 2 + 1.6);
    const left = localToWorld(position, -0.7, depth / 2 + 0.5);
    const right = localToWorld(position, 0.7, depth / 2 + 0.5);
    this.addFill([left, tip, right], look, 0.85, 0.1);
    if (this.model) {
      this.model.position.set(
        position.x,
        this.context.baseHeight({ type: mode.type, position }),
        position.z,
      );
      this.model.rotation.set(0, position.rotation, 0);
      this.model.visibility = GHOST_VISIBILITY;
      this.model.renderOverlay = true;
      this.model.overlayColor = check.ok ? OK_COLOR : BAD_COLOR;
      this.model.overlayAlpha = 0.35;
      this.model.setEnabled(true);
    }
    this.handlers.onPreview?.({
      check,
      label: DWELLING_NAMES[mode.type],
      screen: this.screen,
    });
  }

  private refreshField(mode: Extract<PlacementMode, { kind: 'field' }>): void {
    const candidate: Point[] =
      this.cursor && !this.closeFailure ? [...this.points, this.cursor] : [...this.points];
    let check: PlacementCheck = this.closeFailure ?? { ok: false, reason: FIELD_HINT };
    let label = '';
    if (candidate.length >= 3) {
      const result = mode.preview(candidate.map((p): [number, number] => [p[0], p[1]]));
      label = result.label;
      if (!this.closeFailure) check = result.check;
    }
    const look = candidate.length < 3 ? 'draw' : check.ok ? 'ok' : 'bad';
    if (candidate.length >= 3) this.addFill(candidate, look, 0.32, 0.6);
    if (candidate.length >= 2)
      this.addStrip(stripSegments(candidate, candidate.length >= 3, 0.3, 1.5), look);
    if (this.points.length > 0) {
      this.pegs.thinInstanceSetBuffer(
        'matrix',
        instanceMatrices(
          this.points.map(([x, z]) => ({
            x,
            y: this.context.decalHeight(x, z) + 0.5,
            z,
            rotationY: 0,
            scale: 1,
          })),
        ),
        16,
        true,
      );
      this.pegs.material = this.materials[look];
      this.pegs.setEnabled(true);
    } else {
      this.pegs.setEnabled(false);
    }
    this.handlers.onPreview?.({ check, label, screen: this.screen });
  }

  private addFill(
    polygon: readonly Point[],
    look: 'ok' | 'bad' | 'draw',
    alpha: number,
    soft = 0.3,
  ): void {
    const b = polygonBounds(polygon);
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    // Síť nejvýš ≈ 150 × 150 bodů – i obrys přes půl krajiny se překreslí rychle.
    const step = Math.max(0.4, span / 150);
    const grid = decalGrid(
      { minX: b.minX - soft, maxX: b.maxX + soft, minZ: b.minZ - soft, maxZ: b.maxZ + soft },
      step,
      softCoverage(polygon, soft),
    );
    if (grid.indices.length === 0) return;
    const mesh = createDecalMesh(this.context.scene, 'village-ghost-fill', grid, {
      height: this.context.decalHeight,
      lift: 0.08,
      color: [1, 1, 1],
      alpha,
    });
    mesh.material = this.fillMaterials[look];
    mesh.alphaIndex = 10;
    mesh.receiveShadows = false;
    this.ghost.push(mesh);
  }

  private addStrip(segments: Point[][], look: 'ok' | 'bad' | 'draw'): void {
    if (segments.length === 0) return;
    const mesh = createStripMesh(
      this.context.scene,
      'village-ghost-line',
      segments,
      this.context.decalHeight,
      0.12,
    );
    mesh.material = this.materials[look];
    mesh.receiveShadows = false;
    this.ghost.push(mesh);
  }

  private clearGhost(): void {
    for (const mesh of this.ghost) mesh.dispose();
    this.ghost.length = 0;
  }
}

function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
