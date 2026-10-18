import '@babylonjs/core/Rendering/outlineRenderer';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  DWELLING_FOOTPRINT_M,
  dwellingGarden,
  type DwellingType,
  type Position,
} from '@bohemia/game';
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

/** Krok otáčení obydlí klávesami [ a ] (jako otáčení budovy v 0 A.D.). */
const ROTATE_STEP = Math.PI / 12;
/** Kliknutí = stisk a puštění tlačítka bez tažení (px). */
const CLICK_SLOP_PX = 6;
const OK_COLOR = new Color3(0.3, 0.85, 0.35);
const BAD_COLOR = new Color3(0.92, 0.24, 0.18);
const GHOST_VISIBILITY = 0.6;
const DWELLING_NAMES: Record<DwellingType, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
};

/** Běžící umisťování ve scéně – obydlí (PlacementController) nebo malování pole (FieldPainter). */
export interface ActivePlacement {
  /** Bod terénu pod kurzorem (null mimo krajinu) a kurzor v px plátna – jednou za snímek. */
  setCursor(point: Point | null, screen: { x: number; y: number } | null): void;
  /** Volá scéna každý snímek. */
  tick(now: number): void;
  /** Potvrdí umístění jako Enter (jen když projde kontrolou). */
  confirm(): void;
  /** Zruší umisťování a ohlásí to (`onCancel`). */
  cancel(): void;
  /** Uklidí bez ohlášení. */
  dispose(): void;
}

type DwellingMode = Extract<PlacementMode, { kind: 'dwelling' }>;

export interface PlacementContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Bod terénu pod pixelem plátna (CSS px), nebo null. */
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  /** Natočení kamery (alpha) – obydlí se poprvé natočí vchodem ke kameře. */
  cameraAlpha(): number;
  ghostModel(type: DwellingType): Mesh | null;
  baseHeight(d: Pick<SceneDwelling, 'type' | 'position'>): number;
  requestRender(): void;
}

/**
 * Umisťování obydlí jako v 0 A.D.: duch u kurzoru, levé kliknutí postaví, se Shiftem postaví
 * a umisťuje dál další kus; pravé kliknutí nebo Esc zruší. Klávesy [ a ] otáčejí obydlím,
 * Enter postaví pod kurzorem. Kurzor nad terénem dodává scéna jednou za snímek (`setCursor`).
 */
export class PlacementController implements ActivePlacement {
  private readonly ghost: Mesh[] = [];
  private readonly materials: Record<'ok' | 'bad', StandardMaterial>;
  private readonly fillMaterials: Record<'ok' | 'bad', StandardMaterial>;
  private cursor: Point | null = null;
  private screen: { x: number; y: number } | null = null;
  private rotation: number;
  private downs = new Map<number, { x: number; y: number }>();
  private model: Mesh | null = null;
  private done = false;

  constructor(
    private readonly context: PlacementContext,
    readonly mode: DwellingMode,
    private readonly handlers: PlacementHandlers,
  ) {
    const scene = context.scene;
    const material = (name: string, color: Color3, zOffset: number): StandardMaterial =>
      createDecalMaterial(scene, `village-ghost-${name}`, { emissive: color, zOffset });
    this.materials = {
      ok: material('ok', OK_COLOR, -6),
      bad: material('bad', BAD_COLOR, -6),
    };
    this.fillMaterials = {
      ok: material('fill-ok', OK_COLOR, -5),
      bad: material('fill-bad', BAD_COLOR, -5),
    };
    // Vchod ke kameře: kamera stojí ve směru (cos α, sin α) od cíle, vchod míří (sin r, cos r).
    this.rotation = Math.PI / 2 - context.cameraAlpha();
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
    this.refresh();
  }

  /** Obydlí se překresluje hned při pohybu kurzoru. */
  tick(): void {}

  /** Postaví obydlí pod kurzorem jako kliknutí (Enter). */
  confirm(): void {
    if (this.cursor) this.place(this.cursor, false);
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
    this.clearGhost();
    this.model?.setEnabled(false);
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
    if (event.button === 0) {
      const point = this.context.pickGround(event.offsetX, event.offsetY);
      if (point) this.place(point, event.shiftKey);
    } else if (event.button === 2) {
      this.cancel();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.ctrlKey || event.metaKey || target?.closest('input, textarea, select')) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault();
      this.rotation += event.code === 'BracketRight' ? ROTATE_STEP : -ROTATE_STEP;
      this.refresh();
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      this.confirm();
    }
  };

  /**
   * Postaví obydlí na bodě terénu, když projde kontrolou. `keepPlacing` (Shift) – umisťování
   * běží dál a duch se hned ověří znovu (rozhraní už zná právě postavené obydlí).
   */
  private place(point: Point, keepPlacing: boolean): void {
    const position = this.position(point);
    if (!this.mode.check(position).ok) {
      this.refresh();
      return;
    }
    const type = this.mode.type;
    if (keepPlacing) {
      this.handlers.onConfirm({ kind: 'dwelling', type, position }, true);
      this.refresh();
      return;
    }
    this.dispose();
    this.handlers.onConfirm({ kind: 'dwelling', type, position });
  }

  private position(point: Point): Position {
    return { x: point[0], z: point[1], rotation: normalizeAngle(this.rotation) };
  }

  /** Překreslí ducha podle kurzoru a ohlásí stav rozhraní. */
  private refresh(): void {
    if (this.done) return;
    this.clearGhost();
    this.refreshDwelling(this.mode);
    this.context.requestRender();
  }

  private refreshDwelling(mode: DwellingMode): void {
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
    // zahrádka polozemnice – světlejší obrys vedle domu (patří k obydlí, nesmí na pole ani do vody)
    const garden = dwellingGarden(mode.type, position)?.map(([x, z]): Point => [x, z]);
    if (garden) {
      this.addFill(garden, look, 0.18);
      this.addStrip(stripSegments(garden, true, 0.12, 1), look);
    }
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

  private addFill(polygon: readonly Point[], look: 'ok' | 'bad', alpha: number, soft = 0.3): void {
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

  private addStrip(segments: Point[][], look: 'ok' | 'bad'): void {
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
