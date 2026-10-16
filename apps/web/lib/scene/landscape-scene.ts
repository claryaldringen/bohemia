import '@babylonjs/core/Culling/ray';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { surfaceAt, type Landscape } from '@bohemia/game';
import type { TileInfo } from '../tile-info';
import { createRtsCamera, type RtsCamera } from './camera';
import { HEIGHT_SCALE } from './constants';
import { createEngine, type RendererName } from './create-engine';
import { createTerrainMesh } from './terrain-mesh';
import { tileAt, tileCenter } from './tile-at';
import { createWaterMesh } from './water';

type HoverListener = (tile: TileInfo | null) => void;

/** 3D scéna krajiny – obyčejná třída bez Reactu (adaptér zobrazení). */
export class LandscapeScene {
  private readonly listeners = new Set<HoverListener>();
  private readonly resizeObserver: ResizeObserver;
  private landscape: Landscape | null = null;
  private terrain: Mesh | null = null;
  private rtsCamera: RtsCamera | null = null;
  private hovered: TileInfo | null = null;
  private pointerMoved = false;
  private rendering = false;
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    readonly renderer: RendererName,
  ) {
    this.resizeObserver = new ResizeObserver(() => engine.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    scene.onBeforeRenderObservable.add(() => this.pickHoveredTile());
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { renderer?: 'auto' | 'webgl' } = {},
  ): Promise<LandscapeScene> {
    const { engine, renderer } = await createEngine(canvas, options.renderer ?? 'auto');
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.63, 0.75, 0.85, 1);
    scene.skipPointerMovePicking = true;
    const sky = new HemisphericLight('sky', new Vector3(0.2, 1, 0.1), scene);
    sky.intensity = 0.5;
    sky.groundColor = new Color3(0.32, 0.3, 0.26);
    // Nízké slunce zvýrazní zvlnění terénu.
    const sun = new DirectionalLight('sun', new Vector3(-0.8, -0.55, -0.35), scene);
    sun.intensity = 1.05;
    return new LandscapeScene(canvas, engine, scene, renderer);
  }

  async setLandscape(landscape: Landscape): Promise<void> {
    if (this.disposed) return;
    this.landscape = landscape;
    this.terrain = createTerrainMesh(this.scene, landscape);
    createWaterMesh(this.scene, landscape);
    const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
    this.rtsCamera = createRtsCamera(this.scene, this.canvas, {
      halfExtent: (landscape.size * landscape.cellSizeM) / 2,
      start: { x: site.worldX, z: site.worldZ },
      groundHeight: (x, z) => this.groundHeight(x, z),
    });
    await this.scene.whenReadyAsync();
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    this.engine.runRenderLoop(() => this.scene.render());
  }

  onTileHover(listener: HoverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.rtsCamera?.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private groundHeight(worldX: number, worldZ: number): number {
    const l = this.landscape;
    const tile = l && tileAt(l, worldX, worldZ);
    return l && tile ? l.heights[tile.y * l.size + tile.x]! * HEIGHT_SCALE : 0;
  }

  private readonly onPointerMove = (): void => {
    this.pointerMoved = true;
  };

  private readonly onPointerLeave = (): void => {
    this.pointerMoved = false;
    this.emit(null);
  };

  /** Pick jednou za snímek, ne při každém pohybu myši. */
  private pickHoveredTile(): void {
    if (!this.pointerMoved || !this.landscape || !this.terrain) return;
    this.pointerMoved = false;
    const terrain = this.terrain;
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh === terrain,
    );
    const point = pick?.hit ? pick.pickedPoint : null;
    const tile = point ? tileAt(this.landscape, point.x, point.z) : null;
    if (!tile) {
      this.emit(null);
      return;
    }
    const l = this.landscape;
    const i = tile.y * l.size + tile.x;
    this.emit({
      x: tile.x,
      y: tile.y,
      surface: surfaceAt(l, tile.x, tile.y),
      fertility: l.fertility[i]!,
      heightM: l.heights[i]!,
    });
  }

  private emit(tile: TileInfo | null): void {
    const same =
      tile === this.hovered ||
      (tile !== null &&
        this.hovered !== null &&
        tile.x === this.hovered.x &&
        tile.y === this.hovered.y);
    if (same) return;
    this.hovered = tile;
    for (const listener of this.listeners) listener(tile);
  }
}
