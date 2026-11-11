// Umisťování kostela ve scéně (churches.md – Stavba; web-ui.md – Kostel v rozhraní): průhledný
// model z `church-mesh.ts` a obrys hřbitůvku u kurzoru, kněžištěm na východ. Tah od vstupu ke
// kněžišti určí délku lodi (rotunda průměr) a osu po 15°, krátký klik postaví kostel na místo
// s rozměry z panelu. Rozměry mění panel u potvrzení (`setDims`), Enter nebo kladivo potvrdí.
import '@babylonjs/core/Rendering/outlineRenderer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import {
  churchFootprintWorld,
  churchParts,
  churchyardWorld,
  clampChurchDims,
  wallThickness,
  type ChurchDims,
  type PlacementCheck,
} from '@bohemia/game';
import {
  churchAtCursor,
  churchDimsText,
  churchFromDrag,
  type ChurchLayout,
} from '../church-placement';
import { churchMeshData, type ChurchMeshArrays } from './church-mesh';
import { churchModelRotationY } from './church-renderer';
import { stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import type { ActivePlacement } from './village-placement';
import type { PlacementCost, PlacementHandlers, PlacementMode } from './village-types';

/** Kliknutí = stisk a puštění bez tažení (px); delší tah určí délku a osu. */
const CLICK_SLOP_PX = 6;
const OK_COLOR = new Color3(0.3, 0.85, 0.35);
const BAD_COLOR = new Color3(0.92, 0.24, 0.18);
/** Průhlednost ducha – jako duch obydlí (`village-placement.ts`). */
const GHOST_VISIBILITY = 0.6;

type ChurchMode = Extract<PlacementMode, { kind: 'church' }>;

export interface ChurchPlaceContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  requestRender(): void;
}

interface Press {
  pointerId: number;
  from: { x: number; y: number };
  at: Point;
  dragged: boolean;
}

const DONE = { foundation: 1, walls: 1, roof: 1, decor: 1 };

export class ChurchPlacer implements ActivePlacement {
  private dims: ChurchDims;
  /** Kostel položený klikem nebo tahem – čeká na potvrzení; null = jde s kurzorem. */
  private pinned: ChurchLayout | null = null;
  private hover: ChurchLayout | null = null;
  private press: Press | null = null;
  private rightDown: { x: number; y: number } | null = null;
  private screen: { x: number; y: number } | null = null;
  private shownKey = '';
  private check: (PlacementCheck & { cost?: PlacementCost | null }) | null = null;
  private meshes: Mesh[] = [];
  private readonly ghostMaterial: StandardMaterial;
  private readonly lines: Record<'ok' | 'bad', StandardMaterial>;
  private done = false;

  constructor(
    private readonly context: ChurchPlaceContext,
    readonly mode: ChurchMode,
    private readonly handlers: PlacementHandlers,
  ) {
    this.dims = mode.dims;
    const scene = context.scene;
    this.ghostMaterial = new StandardMaterial('church-ghost', scene);
    this.ghostMaterial.specularColor = Color3.Black();
    this.ghostMaterial.backFaceCulling = false;
    this.lines = {
      ok: createDecalMaterial(scene, 'church-ghost-ok', { emissive: OK_COLOR, zOffset: -6 }),
      bad: createDecalMaterial(scene, 'church-ghost-bad', { emissive: BAD_COLOR, zOffset: -6 }),
    };
    context.canvas.addEventListener('pointerdown', this.onPointerDown);
    context.canvas.addEventListener('pointerup', this.onPointerUp);
    context.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
    context.canvas.style.cursor = 'crosshair';
  }

  /** Rozměry z panelu (+/−) – položený kostel zůstane středem na místě. */
  setDims(dims: ChurchDims): void {
    if (this.done) return;
    this.dims = dims;
    const type = this.mode.type;
    if (this.pinned) this.pinned = { ...this.pinned, dims: clampChurchDims(type, dims) };
    if (this.hover) this.hover = churchAtCursor(type, dims, this.hover.position);
    this.refresh();
  }

  setCursor(point: Point | null, screen: { x: number; y: number } | null): void {
    if (this.done) return;
    this.screen = point ? screen : null;
    const press = this.press;
    if (press && point) {
      if (screen && Math.hypot(screen.x - press.from.x, screen.y - press.from.y) > CLICK_SLOP_PX) {
        press.dragged = true;
      }
      if (press.dragged) {
        this.pinned = churchFromDrag(
          this.mode.type,
          this.dims,
          { x: press.at[0], z: press.at[1] },
          { x: point[0], z: point[1] },
        );
      }
    } else if (!this.pinned) {
      this.hover = point
        ? churchAtCursor(this.mode.type, this.dims, { x: point[0], z: point[1] })
        : null;
    }
    this.refresh();
  }

  tick(): void {
    // náhled se přepočítá při změně kurzoru nebo rozměrů – nic se nehýbe samo
  }

  confirm(): void {
    if (this.done || this.press?.dragged) return;
    const layout = this.pinned ?? this.hover;
    if (!layout) return;
    const check = this.mode.check(layout.dims, layout.position);
    if (!check.ok) return;
    this.dispose();
    this.handlers.onConfirm({
      kind: 'church',
      type: this.mode.type,
      dims: layout.dims,
      position: layout.position,
    });
  }

  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.handlers.onCancel();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    const canvas = this.context.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.endPress();
    canvas.style.cursor = '';
    this.clear();
    this.ghostMaterial.dispose();
    this.lines.ok.dispose();
    this.lines.bad.dispose();
    this.handlers.onPreview?.(null);
    this.context.requestRender();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      this.rightDown = { x: event.offsetX, y: event.offsetY };
      return;
    }
    if (event.button !== 0) return;
    const at = this.context.pickGround(event.offsetX, event.offsetY);
    if (!at) return;
    try {
      this.context.canvas.setPointerCapture(event.pointerId);
    } catch {
      // bez zachycení tah skončí na okraji plátna – nevadí
    }
    this.press = {
      pointerId: event.pointerId,
      from: { x: event.offsetX, y: event.offsetY },
      at,
      dragged: false,
    };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) {
      const down = this.rightDown;
      this.rightDown = null;
      if (!down || Math.hypot(down.x - event.offsetX, down.y - event.offsetY) > CLICK_SLOP_PX) {
        return;
      }
      this.cancel();
      return;
    }
    const press = this.press;
    if (event.button !== 0 || !press) return;
    this.endPress();
    // krátký klik: kostel na místo kliku kněžištěm na východ s rozměry z panelu
    if (!press.dragged) {
      this.pinned = churchAtCursor(this.mode.type, this.dims, { x: press.at[0], z: press.at[1] });
    } else if (this.pinned) {
      // délka (rotunda průměr) z tahu jde dál do panelu
      this.dims = this.pinned.dims;
    }
    this.refresh();
  };

  private readonly onPointerCancel = (): void => {
    this.endPress();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      // položený kostel se zase rozjede s kurzorem, jinak umisťování skončí
      if (this.pinned && !this.press) {
        this.pinned = null;
        this.refresh();
      } else {
        this.cancel();
      }
      return;
    }
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      this.confirm();
    }
  };

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

  /** Kontrola, náhled u kurzoru a duch – duch se staví znovu jen při jiné poloze či rozměrech. */
  private refresh(): void {
    const layout = this.pinned ?? this.hover;
    if (!layout) {
      this.clear();
      this.shownKey = '';
      this.handlers.onPreview?.(null);
      this.context.requestRender();
      return;
    }
    const key = JSON.stringify(layout);
    if (key !== this.shownKey) {
      this.check = this.mode.check(layout.dims, layout.position);
      this.draw(layout, this.check.ok);
      this.shownKey = key;
    }
    const check = this.check ?? { ok: false, reason: null };
    this.handlers.onPreview?.({
      check,
      label: '',
      screen: this.screen,
      cost: check.ok ? (check.cost ?? null) : null,
      measure: churchDimsText(layout.dims),
      church: { type: this.mode.type, dims: layout.dims, pinned: this.pinned !== null },
    });
  }

  private draw(layout: ChurchLayout, ok: boolean): void {
    this.clear();
    const { scene, decalHeight } = this.context;
    const type = this.mode.type;
    const parts = churchParts(type, layout.dims);
    const data = churchMeshData(parts, DONE, wallThickness);
    const { x, z, rotation } = layout.position;
    let base = -Infinity;
    for (const outline of churchFootprintWorld(type, layout.dims, layout.position)) {
      for (const p of outline) base = Math.max(base, decalHeight(p.x, p.z));
    }
    if (!Number.isFinite(base)) base = decalHeight(x, z);
    for (const [name, arrays] of [
      ['walls', data.walls],
      ['roofs', data.roofs],
    ] as const) {
      const mesh = ghostMesh(scene, `church-ghost-${name}`, arrays);
      if (!mesh) continue;
      mesh.material = this.ghostMaterial;
      mesh.position.set(x, base, z);
      mesh.rotation.y = churchModelRotationY(rotation);
      mesh.isPickable = false;
      mesh.visibility = GHOST_VISIBILITY;
      mesh.renderOverlay = true;
      mesh.overlayColor = ok ? OK_COLOR : BAD_COLOR;
      mesh.overlayAlpha = 0.35;
      this.meshes.push(mesh);
    }
    // obrys hřbitůvku – zabírá ho kostel i staveniště (pec v jeho pásu)
    const yard = churchyardWorld(type, layout.dims, layout.position).map(([px, pz]): Point => [
      px,
      pz,
    ]);
    const strip = createStripMesh(
      scene,
      'church-ghost-yard',
      stripSegments(yard, true, 0.25, 1),
      decalHeight,
      0.12,
    );
    strip.material = this.lines[ok ? 'ok' : 'bad'];
    strip.receiveShadows = false;
    strip.isPickable = false;
    this.meshes.push(strip);
    this.context.requestRender();
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
  }
}

function ghostMesh(scene: Scene, name: string, a: ChurchMeshArrays): Mesh | null {
  if (a.indices.length === 0) return null;
  const data = new VertexData();
  data.positions = a.positions;
  data.normals = a.normals;
  data.colors = a.colors;
  data.indices = a.indices;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}
