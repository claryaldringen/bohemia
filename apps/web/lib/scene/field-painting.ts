import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { tileCenterWorld, tileOfWorldPoint, type Landscape, type TileCell } from '@bohemia/game';
import {
  CellSelection,
  cellsBoundary,
  mergeDecalGrids,
  rectangleCells,
  type CellSquare,
  type StrokeMode,
} from './field-cells';
import { decalGrid, smoothstep, stripSegments, type Point } from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';
import type { PlacementHandlers, PlacementMode, SquaresPreview } from './village-types';

/** Kliknutí = stisk a puštění tlačítka bez tažení (px); delší tah maluje obdélník. */
const CLICK_SLOP_PX = 6;
/** Jak často nejvýš přepočítat náhled pole během tažení (ms). */
const PREVIEW_INTERVAL_MS = 80;
/** Mřížka čtverců kolem kurzoru – poloměr ve čtvercích (dál slábne do ztracena). */
const GRID_RADIUS_CELLS = 7;
/** Bodů sítě obtisku na stranu čtverce – 4 sedí na síť terénu, obtisk leží přesně na něm. */
const DECAL_POINTS_PER_CELL = 4;
const GRID_TEXTURE_PX = 128;
const FILL_ALPHA = 0.4;
const ERASE_ALPHA = 0.3;
const COLORS = {
  ok: [0.3, 0.85, 0.35],
  bad: [0.92, 0.24, 0.18],
  draw: [0.98, 0.78, 0.3],
  erase: [0.95, 0.95, 0.92],
} as const satisfies Record<string, readonly [number, number, number]>;
type Look = keyof typeof COLORS;

export interface PaintContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Krajina sídla – převod bodů světa na čtverce (políčka). */
  landscape: Landscape;
  /** Bod terénu pod pixelem plátna (CSS px), nebo null. */
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  requestRender(): void;
}

type FieldMode = Extract<PlacementMode, { kind: 'squares' }>;

/** Rozběhnutý tah levým tlačítkem – obdélník čtverců od `start` po `end`. */
interface Stroke {
  pointerId: number;
  start: TileCell;
  end: TileCell;
  mode: StrokeMode;
  /** Kde tah začal (px plátna) – do CLICK_SLOP_PX je to kliknutí. */
  from: { x: number; y: number };
  dragged: boolean;
}

/**
 * Malování stavby po čtvercích – pole a další stavby malované jako pole (jako v realtime
 * strategiích); co smí kam, říká `mode.preview`. Myš: levé kliknutí přepne čtverec,
 * levé tažení přidá obdélník čtverců, s Ctrl (na Macu i Cmd) ubere; pravé kliknutí malování
 * zruší (jako v 0 A.D.). Krajina se posouvá prostředním tlačítkem, okrajem okna a WASD.
 * Enter potvrdí, Esc zruší tah nebo celé malování, Backspace / Ctrl+Z vrátí poslední tah.
 * Kolem kurzoru je vidět mřížka čtverců, vybrané čtverce zelené (pole projde) / žluté
 * (ještě ne) a zakázané červené.
 */
export class FieldPainter {
  private readonly selection = new CellSelection();
  private stroke: Stroke | null = null;
  private rightDown: { x: number; y: number } | null = null;
  private cursorCell: TileCell | null = null;
  private screen: { x: number; y: number } | null = null;
  /** Ctrl / Cmd drží – tah ubírá. */
  private eraseHeld = false;
  private selectionDirty = true;
  private cursorDirty = true;
  private lastPreview = 0;
  private candidate: TileCell[] = [];
  private preview: SquaresPreview | null = null;
  private selectionMeshes: Mesh[] = [];
  private cursorMeshes: Mesh[] = [];
  private readonly fillMaterial: StandardMaterial;
  private readonly lineMaterials: Record<Look, StandardMaterial>;
  private readonly gridMaterial: StandardMaterial;
  private readonly gridTexture: RawTexture;
  private done = false;

  constructor(
    private readonly context: PaintContext,
    readonly mode: FieldMode,
    private readonly handlers: PlacementHandlers,
  ) {
    const scene = context.scene;
    this.fillMaterial = createDecalMaterial(scene, 'field-paint-fill', {
      emissive: Color3.White(),
      zOffset: -5,
    });
    const line = (look: Look): StandardMaterial =>
      createDecalMaterial(scene, `field-paint-line-${look}`, {
        emissive: new Color3(...COLORS[look]),
        zOffset: -6,
      });
    this.lineMaterials = {
      ok: line('ok'),
      bad: line('bad'),
      draw: line('draw'),
      erase: line('erase'),
    };
    this.gridTexture = createGridTexture(scene);
    this.gridMaterial = createDecalMaterial(scene, 'field-paint-grid', {
      emissive: new Color3(0.96, 0.95, 0.88),
      zOffset: -7,
    });
    this.gridMaterial.diffuseTexture = this.gridTexture;
    this.gridMaterial.useAlphaFromDiffuseTexture = true;

    context.canvas.addEventListener('pointerdown', this.onPointerDown);
    context.canvas.addEventListener('pointerup', this.onPointerUp);
    context.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    context.canvas.style.cursor = 'crosshair';
  }

  /** Bod terénu pod kurzorem (null mimo krajinu) a kurzor v px plátna – jednou za snímek. */
  setCursor(point: Point | null, screen: { x: number; y: number } | null): void {
    if (this.done) return;
    const cell = point ? tileOfWorldPoint(this.context.landscape, point[0], point[1]) : null;
    if (!sameCell(cell, this.cursorCell)) {
      this.cursorCell = cell;
      this.cursorDirty = true;
    }
    this.screen = cell ? screen : null;
    const stroke = this.stroke;
    if (stroke && cell) {
      if (screen && distance(screen, stroke.from) > CLICK_SLOP_PX) stroke.dragged = true;
      if (!sameCell(cell, stroke.end)) {
        stroke.end = cell;
        this.selectionDirty = true;
      }
    }
    this.report();
  }

  /** Volá scéna každý snímek – náhled pole se přepočítá nejvýš po PREVIEW_INTERVAL_MS. */
  tick(now: number): void {
    if (this.done) return;
    if (this.selectionDirty && now - this.lastPreview >= PREVIEW_INTERVAL_MS) {
      this.lastPreview = now;
      this.refreshSelection();
    }
    if (this.cursorDirty) this.refreshCursor();
  }

  /** Potvrdí pole (Enter, tlačítko Potvrdit) – jen když prošlo kontrolou. */
  confirm(): void {
    if (this.done || this.stroke) return;
    if (this.selectionDirty) this.refreshSelection();
    if (this.candidate.length === 0 || !this.preview?.check.ok) return;
    const cells = this.candidate;
    this.dispose();
    this.handlers.onConfirm({ kind: 'squares', cells });
  }

  /** Zruší malování a ohlásí to (`onCancel`). */
  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.handlers.onCancel();
  }

  /** Uklidí meshe a posluchače bez ohlášení. */
  dispose(): void {
    if (this.done) return;
    this.done = true;
    const canvas = this.context.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    canvas.style.cursor = '';
    disposeAll(this.selectionMeshes);
    disposeAll(this.cursorMeshes);
    for (const m of [this.fillMaterial, this.gridMaterial, ...Object.values(this.lineMaterials)]) {
      m.dispose();
    }
    this.gridTexture.dispose();
    this.handlers.onPreview?.(null);
    this.context.requestRender();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      this.rightDown = { x: event.offsetX, y: event.offsetY };
      return;
    }
    if (event.button !== 0) return;
    const cell = this.cellAt(event.offsetX, event.offsetY);
    if (!cell) return;
    try {
      this.context.canvas.setPointerCapture(event.pointerId);
    } catch {
      // bez zachycení tah skončí na okraji plátna – nevadí
    }
    this.stroke = {
      pointerId: event.pointerId,
      start: cell,
      end: cell,
      mode: event.ctrlKey || event.metaKey ? 'remove' : 'add',
      from: { x: event.offsetX, y: event.offsetY },
      dragged: false,
    };
    this.markSelection();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) {
      const down = this.rightDown;
      this.rightDown = null;
      if (!down || distance(down, { x: event.offsetX, y: event.offsetY }) > CLICK_SLOP_PX) return;
      this.cancel();
      return;
    }
    const stroke = this.stroke;
    if (event.button !== 0 || !stroke) return;
    this.endStroke();
    const at = { x: event.offsetX, y: event.offsetY };
    const end = this.cellAt(at.x, at.y) ?? stroke.end;
    if (!stroke.dragged && distance(at, stroke.from) <= CLICK_SLOP_PX) {
      if (stroke.mode === 'remove') this.selection.apply([stroke.start], 'remove');
      else this.selection.toggle(stroke.start);
    } else {
      this.selection.apply(rectangleCells(stroke.start, end), stroke.mode);
    }
    this.markSelection();
  };

  private readonly onPointerCancel = (): void => {
    if (!this.stroke) return;
    this.endStroke();
    this.markSelection();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select')) return;
    if (event.key === 'Control' || event.key === 'Meta') {
      this.setErase(true);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      this.undo();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    switch (event.code) {
      case 'Escape':
        event.preventDefault();
        if (this.stroke) {
          this.endStroke();
          this.markSelection();
        } else {
          this.cancel();
        }
        return;
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
    if (event.key === 'Control' || event.key === 'Meta') this.setErase(false);
  };

  private readonly onBlur = (): void => {
    this.setErase(false);
  };

  private setErase(held: boolean): void {
    if (this.eraseHeld === held) return;
    this.eraseHeld = held;
    this.cursorDirty = true;
  }

  private endStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return;
    try {
      this.context.canvas.releasePointerCapture(stroke.pointerId);
    } catch {
      // zachycení už skončilo samo
    }
  }

  private undo(): void {
    if (this.stroke || !this.selection.undo()) return;
    this.markSelection();
  }

  private markSelection(): void {
    this.selectionDirty = true;
    this.cursorDirty = true;
    this.lastPreview = 0;
  }

  private cellAt(x: number, y: number): TileCell | null {
    const point = this.context.pickGround(x, y);
    return point ? tileOfWorldPoint(this.context.landscape, point[0], point[1]) : null;
  }

  private square(cell: TileCell): CellSquare {
    const l = this.context.landscape;
    const center = tileCenterWorld(l, cell.x, cell.y);
    return { cell, x: center.x, z: center.z, size: l.cellSizeM };
  }

  /** Výběr po rozběhnutém tahu, jeho kontrola a obtisky. */
  private refreshSelection(): void {
    this.selectionDirty = false;
    const stroke = this.stroke;
    const strokeCells = stroke ? rectangleCells(stroke.start, stroke.end) : [];
    this.candidate = stroke
      ? this.selection.preview(strokeCells, stroke.mode)
      : this.selection.cells();
    this.preview = this.candidate.length > 0 ? this.mode.preview(this.candidate) : null;

    disposeAll(this.selectionMeshes);
    const ok = this.preview?.check.ok ?? false;
    const blocked = new Set((this.preview?.blockedCells ?? []).map((c) => cellKey(c)));
    const squares = this.candidate.map((cell) => this.square(cell));
    const fills = squares.map((s) => ({
      square: s,
      look: (blocked.has(cellKey(s.cell)) ? 'bad' : ok ? 'ok' : 'draw') as Look,
      alpha: FILL_ALPHA,
    }));
    if (stroke?.mode === 'remove') {
      for (const cell of strokeCells) {
        if (this.selection.has(cell)) {
          fills.push({ square: this.square(cell), look: 'erase', alpha: ERASE_ALPHA });
        }
      }
    }
    if (fills.length > 0) this.selectionMeshes.push(this.fillMesh(fills));
    if (squares.length > 0) {
      const look: Look = ok ? 'ok' : blocked.size > 0 ? 'bad' : 'draw';
      this.selectionMeshes.push(
        this.lineMesh('field-paint-outline', cellsBoundary(squares), look, 0.35),
      );
    }
    if (stroke && (stroke.dragged || !sameCell(stroke.start, stroke.end))) {
      const look: Look = stroke.mode === 'remove' ? 'bad' : 'erase';
      const rect = cellsBoundary(strokeCells.map((c) => this.square(c)));
      this.selectionMeshes.push(this.lineMesh('field-paint-stroke', rect, look, 0.25));
    }
    this.report();
    this.context.requestRender();
  }

  /** Mřížka kolem kurzoru a obrys čtverce pod ním. */
  private refreshCursor(): void {
    this.cursorDirty = false;
    disposeAll(this.cursorMeshes);
    const cell = this.cursorCell;
    if (cell) {
      this.cursorMeshes.push(this.gridMesh(cell));
      if (!this.stroke) {
        const look: Look = this.eraseHeld || this.selection.has(cell) ? 'bad' : 'erase';
        const hover = cellsBoundary([this.square(cell)]);
        this.cursorMeshes.push(this.lineMesh('field-paint-hover', hover, look, 0.3));
      }
    }
    this.context.requestRender();
  }

  /** Ohlásí rozhraní kontrolu, popisek a kurzor pro bublinu. */
  private report(): void {
    if (this.done) return;
    const preview = this.preview;
    // Prázdný výběr není chyba – bez důvodu (rozhraní pak u kurzoru nic neukáže).
    this.handlers.onPreview?.({
      check: preview?.check ?? { ok: false, reason: null },
      label: preview?.label ?? '',
      screen: this.screen,
    });
  }

  private fillMesh(fills: { square: CellSquare; look: Look; alpha: number }[]): Mesh {
    const { grid, colors } = mergeDecalGrids(
      fills.map(({ square, look, alpha }) => {
        const half = square.size / 2;
        return {
          grid: decalGrid(
            {
              minX: square.x - half,
              maxX: square.x + half,
              minZ: square.z - half,
              maxZ: square.z + half,
            },
            square.size / DECAL_POINTS_PER_CELL,
            () => 1,
          ),
          color: COLORS[look],
          alpha,
        };
      }),
    );
    const mesh = createDecalMesh(this.context.scene, 'field-paint-fill', grid, {
      height: this.context.decalHeight,
      lift: 0.09,
      color: (_x, _z, v) => [colors[v * 3]!, colors[v * 3 + 1]!, colors[v * 3 + 2]!],
    });
    mesh.material = this.fillMaterial;
    mesh.alphaIndex = 10;
    mesh.receiveShadows = false;
    return mesh;
  }

  private lineMesh(name: string, lines: Point[][], look: Look, width: number): Mesh {
    const mesh = createStripMesh(
      this.context.scene,
      name,
      lines.flatMap((line) => stripSegments(line, false, width, 1.5)),
      this.context.decalHeight,
      0.13,
    );
    mesh.material = this.lineMaterials[look];
    mesh.receiveShadows = false;
    return mesh;
  }

  /** Mřížka čtverců kolem kurzoru – čáry z textury, ke kraji slábne. */
  private gridMesh(center: TileCell): Mesh {
    const l = this.context.landscape;
    const size = l.cellSizeM;
    const half = (l.size * size) / 2;
    const from = (v: number): number => Math.max(0, v - GRID_RADIUS_CELLS);
    const to = (v: number): number => Math.min(l.size, v + GRID_RADIUS_CELLS + 1);
    const c = tileCenterWorld(l, center.x, center.y);
    const reach = GRID_RADIUS_CELLS * size;
    const grid = decalGrid(
      {
        minX: -half + from(center.x) * size,
        maxX: -half + to(center.x) * size,
        minZ: -half + from(center.y) * size,
        maxZ: -half + to(center.y) * size,
      },
      size / DECAL_POINTS_PER_CELL,
      (x, z) => 1 - smoothstep(reach * 0.35, reach, Math.hypot(x - c.x, z - c.z)),
    );
    const mesh = createDecalMesh(this.context.scene, 'field-paint-grid', grid, {
      height: this.context.decalHeight,
      lift: 0.1,
      color: [1, 1, 1],
      alpha: 0.7,
      uv: (x, z) => [(x + half) / size, (z + half) / size],
    });
    mesh.material = this.gridMaterial;
    mesh.alphaIndex = 11;
    mesh.receiveShadows = false;
    return mesh;
  }
}

/** Textura jednoho čtverce mřížky: tenká čára po okraji (opakuje se přes celou mřížku). */
function createGridTexture(scene: Scene): RawTexture {
  const n = GRID_TEXTURE_PX;
  const data = new Uint8Array(n * n * 4);
  const edge = (i: number): number =>
    i === 0 || i === n - 1 ? 255 : i === 1 || i === n - 2 ? 90 : 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      data.set([255, 255, 255, Math.max(edge(x), edge(y))], (y * n + x) * 4);
    }
  }
  const texture = RawTexture.CreateRGBATexture(
    data,
    n,
    n,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = 'field-paint-grid-texture';
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.hasAlpha = true;
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

function cellKey(cell: TileCell): string {
  return `${cell.x},${cell.y}`;
}

function sameCell(a: TileCell | null, b: TileCell | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function disposeAll(meshes: Mesh[]): void {
  for (const mesh of meshes) mesh.dispose();
  meshes.length = 0;
}
