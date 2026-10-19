import '@babylonjs/core/Rendering/outlineRenderer';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  CRAFT_NAMES,
  DWELLING_FOOTPRINT_M,
  SACRED_BUILDINGS,
  WORKSHOP_PORCH_M,
  rotatedSquareCorners,
  workshopFootprints,
  type DwellingPlot,
  type PlacementCheck,
  type DwellingType,
  type PlotVariant,
  type Position,
  type SacredBuildingKind,
  type TileCell,
} from '@bohemia/game';
import { nextPlotVariant, plotHouse, type PlotSquare } from './homestead-layout';
import { sacredStakeLines } from './sacred-layout';
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
import type {
  PlacementCost,
  PlacementHandlers,
  PlacementMode,
  PlacementResult,
} from './village-types';
import { CRAFT_MODEL, milirPlace, type WorkshopModel } from './workshop-layout';

/** Krok otáčení obydlí klávesami [ a ] (jako otáčení budovy v 0 A.D.). */
const ROTATE_STEP = Math.PI / 12;
/** Kliknutí = stisk a puštění tlačítka bez tažení (px). */
const CLICK_SLOP_PX = 6;
const OK_COLOR = new Color3(0.3, 0.85, 0.35);
const BAD_COLOR = new Color3(0.92, 0.24, 0.18);
const GHOST_VISIBILITY = 0.6;
const FOOTPRINT_NAMES: Record<DwellingType | SacredBuildingKind, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
  dvorec: 'Dvorec',
  idol: 'Modla',
  shrine: 'Svatyně',
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

/**
 * Stavba s půdorysem u kurzoru – obydlí (volně nebo na pozemku), řemeslná dílna (crafts.md),
 * modla či svatyně (happiness.md).
 */
type FootprintMode = Extract<PlacementMode, { kind: 'dwelling' | 'plot' | 'sacred' | 'workshop' }>;
/** Model ducha: obydlí, dílna nebo milíř uhlíře, modla či svatyně. */
export type GhostType = DwellingType | SacredBuildingKind | WorkshopModel | 'milir';

/** Šířka a hloubka půdorysu stavby (m); dílna s přístřeškem (vpředu delší). */
function footprintSize(mode: FootprintMode): { width: number; depth: number } {
  if (mode.kind === 'workshop') {
    const { width, depth } = DWELLING_FOOTPRINT_M[mode.type];
    return { width, depth: depth + WORKSHOP_PORCH_M[mode.craft] };
  }
  if (mode.kind !== 'sacred') return DWELLING_FOOTPRINT_M[mode.type];
  const size = SACRED_BUILDINGS[mode.type].footprintM;
  return { width: size, depth: size };
}
/** Česky pojmenované varianty pozemku pro bublinu u kurzoru. */
const VARIANT_NAMES: Record<PlotVariant, string> = {
  center: 'dům uprostřed',
  'back-left': 'dům vzadu vlevo',
  'back-right': 'dům vzadu vpravo',
  'front-right': 'dům vpředu vpravo',
  'front-left': 'dům vpředu vlevo',
};

export interface PlacementContext {
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Bod terénu pod pixelem plátna (CSS px), nebo null. */
  pickGround(x: number, y: number): Point | null;
  decalHeight: HeightFn;
  /** Natočení kamery (alpha) – obydlí se poprvé natočí vchodem ke kameře. */
  cameraAlpha(): number;
  /** Políčko krajiny pod bodem (pozemek) se středem a stranou, nebo null mimo krajinu. */
  cellAt(x: number, z: number): (PlotSquare & { cell: TileCell }) | null;
  /**
   * Pozemek natočený o `rotation` (násobek 15°) pod bodem v ukládané podobě (`rotatedPlot` –
   * střed na cm; natočení o násobek 90° se přichytí na políčko pod bodem) a jeho čtverec ve
   * světě; null mimo krajinu.
   */
  plotAt(
    x: number,
    z: number,
    rotation: number,
    variant: PlotVariant,
  ): { plot: DwellingPlot; square: PlotSquare } | null;
  ghostModel(type: GhostType): Mesh | null;
  /** Pata modelu stavby na místě (obydlí, dílna, milíř, modla, svatyně). */
  baseHeight(type: GhostType, position: Position): number;
  requestRender(): void;
}

/**
 * Umisťování obydlí (a modly či svatyně) jako v 0 A.D.: duch u kurzoru, levé kliknutí postaví,
 * se Shiftem postaví a umisťuje dál další kus; pravé kliknutí nebo Esc zruší. Klávesy [ a ]
 * otáčejí stavbou po 15° – u obydlí na pozemku (polozemnice) celým pozemkem (Martin 18. 10. 2026,
 * varianta a): bez natočení a po 90° je pozemek políčko pod kurzorem, jinak natočený čtverec se
 * středem pod kurzorem; Tab (se Shiftem zpět) přepíná variantu, kde na pozemku dům stojí. Enter
 * postaví pod kurzorem. Kurzor nad terénem dodává scéna jednou za snímek (`setCursor`).
 */
export class PlacementController implements ActivePlacement {
  private readonly ghost: Mesh[] = [];
  private readonly materials: Record<'ok' | 'bad', StandardMaterial>;
  private readonly fillMaterials: Record<'ok' | 'bad', StandardMaterial>;
  private cursor: Point | null = null;
  private screen: { x: number; y: number } | null = null;
  private rotation: number;
  private variant: PlotVariant = 'center';
  /** Natočení pozemku (polozemnice) – začíná v osách krajiny jako dřív. */
  private plotRotation = 0;
  private downs = new Map<number, { x: number; y: number }>();
  private model: Mesh | null = null;
  /** Druhý duch – milíř uhlíře kus od zemnice. */
  private milir: Mesh | null = null;
  private done = false;

  constructor(
    private readonly context: PlacementContext,
    readonly mode: FootprintMode,
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
    this.milir?.setEnabled(false);
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
      const step = event.code === 'BracketRight' ? 1 : -1;
      if (this.mode.kind === 'plot') this.plotRotation += step * ROTATE_STEP;
      else this.rotation += step * ROTATE_STEP;
      this.refresh();
    } else if (event.code === 'Tab' && this.mode.kind === 'plot') {
      event.preventDefault();
      this.variant = nextPlotVariant(this.variant, event.shiftKey ? -1 : 1);
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
    const result = this.result(point);
    if (!result) {
      this.refresh();
      return;
    }
    if (keepPlacing) {
      this.handlers.onConfirm(result, true);
      this.refresh();
      return;
    }
    this.dispose();
    this.handlers.onConfirm(result);
  }

  /** Prošlé umístění na bodě terénu, nebo null (neprošlo / mimo krajinu). */
  private result(point: Point): PlacementResult | null {
    const mode = this.mode;
    if (mode.kind === 'plot') {
      const plot = this.plot(point);
      if (!plot) return null;
      const check = mode.check(plot);
      if (!check.ok || !check.position) return null;
      return { kind: 'dwelling', type: mode.type, position: check.position, plot };
    }
    const position = this.position(point);
    if (!mode.check(position).ok) return null;
    if (mode.kind === 'workshop') return { kind: 'workshop', craft: mode.craft, position };
    return mode.kind === 'sacred'
      ? { kind: 'sacred', type: mode.type, position }
      : { kind: 'dwelling', type: mode.type, position };
  }

  /** Pozemek pod bodem: natočený čtverec (nebo políčko) a vybraná varianta (null mimo krajinu). */
  private plot(point: Point): DwellingPlot | null {
    return this.plotAt(point)?.plot ?? null;
  }

  private plotAt(point: Point): { plot: DwellingPlot; square: PlotSquare } | null {
    return this.context.plotAt(point[0], point[1], normalizeAngle(this.plotRotation), this.variant);
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

  private refreshDwelling(mode: FootprintMode): void {
    const ghostType: GhostType = mode.kind === 'workshop' ? CRAFT_MODEL[mode.craft] : mode.type;
    this.model ??= this.context.ghostModel(ghostType);
    if (mode.kind === 'workshop' && mode.craft === 'burner') {
      this.milir ??= this.context.ghostModel('milir');
    }
    if (!this.cursor) {
      this.model?.setEnabled(false);
      this.milir?.setEnabled(false);
      this.handlers.onPreview?.(null);
      return;
    }
    let position: Position;
    let check: PlacementCheck & { cost?: PlacementCost | null };
    let label = mode.kind === 'workshop' ? CRAFT_NAMES[mode.craft] : FOOTPRINT_NAMES[mode.type];
    if (mode.kind === 'plot') {
      const at = this.plotAt(this.cursor);
      if (!at) {
        this.model?.setEnabled(false);
        this.handlers.onPreview?.(null);
        return;
      }
      const { plot, square } = at;
      const plotCheck = mode.check(plot);
      check = plotCheck;
      position = plotCheck.position ?? plotHouse(square, this.variant);
      label = `${label} – ${VARIANT_NAMES[this.variant]}`;
      // celý pozemek (políčko, natočený čtverec) – světlejší plocha s obrysem
      const corners: Point[] = rotatedSquareCorners(
        square.x,
        square.z,
        square.size,
        square.rotation ?? 0,
      ).map(([x, z]): Point => [x, z]);
      const look = check.ok ? 'ok' : 'bad';
      this.addFill(corners, look, 0.18);
      this.addStrip(stripSegments(corners, true, 0.2, 1), look);
    } else {
      position = this.position(this.cursor);
      check = mode.check(position);
    }
    const look = check.ok ? 'ok' : 'bad';
    const { width, depth } = footprintSize(mode);
    // dílna: půdorys s přístřeškem vpředu a u uhlíře i čtverec milíře (herní jádro)
    const outlines =
      mode.kind === 'workshop'
        ? workshopFootprints(mode.craft, position).map((polygon) =>
            polygon.map(([x, z]): Point => [x, z]),
          )
        : [footprintCorners(position, width, depth)];
    for (const corners of outlines) {
      this.addFill(corners, look, 0.35);
      this.addStrip(stripSegments(corners, true, 0.2, 1), look);
    }
    // Šipka před vchodem – kam bude obydlí otevřené (dílna: před přístřeškem).
    const front =
      mode.kind === 'workshop' ? depth - DWELLING_FOOTPRINT_M[mode.type].depth / 2 : depth / 2;
    const tip = localToWorld(position, 0, front + 1.6);
    const left = localToWorld(position, -0.7, front + 0.5);
    const right = localToWorld(position, 0.7, front + 0.5);
    this.addFill([left, tip, right], look, 0.85, 0.1);
    // modla a svatyně: obrys vytyčení (kruh, u svatyně i okvětí příkopu)
    if (mode.kind === 'sacred') {
      for (const line of sacredStakeLines(mode.type)) {
        const world = line.map(([x, z]) => localToWorld(position, x, z));
        this.addStrip(stripSegments(world, false, 0.12, 1), look);
      }
    }
    if (this.model) {
      this.model.position.set(position.x, this.context.baseHeight(ghostType, position), position.z);
      this.model.rotation.set(0, position.rotation, 0);
      showGhost(this.model, check.ok);
    }
    if (this.milir) {
      const milir = milirPlace(position);
      this.milir.position.set(milir.x, this.context.baseHeight('milir', position), milir.z);
      this.milir.rotation.set(0, milir.rotation, 0);
      showGhost(this.milir, check.ok);
    }
    this.handlers.onPreview?.({
      check,
      label,
      screen: this.screen,
      cost: check.ok ? (check.cost ?? null) : null,
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

/** Průhledný duch modelu zbarvený podle kontroly (zeleně prošlo, červeně ne). */
function showGhost(mesh: Mesh, ok: boolean): void {
  mesh.visibility = GHOST_VISIBILITY;
  mesh.renderOverlay = true;
  mesh.overlayColor = ok ? OK_COLOR : BAD_COLOR;
  mesh.overlayAlpha = 0.35;
  mesh.setEnabled(true);
}

function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
