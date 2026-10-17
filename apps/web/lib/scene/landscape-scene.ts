import '@babylonjs/core/Culling/ray';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { surfaceAt, type Landscape } from '@bohemia/game';
import type { TileInfo } from '../tile-info';
import { AmbientSound } from './ambient-sound';
import { createRtsCamera, type RtsCamera } from './camera';
import { HEIGHT_SCALE, SUN_DIRECTION } from './constants';
import { createEngine, type RendererName } from './create-engine';
import { decorPlacements } from './decor-placement';
import { addDecorations } from './decorations';
import { addFauna, type Fauna } from './fauna';
import { birdFlocks, fishSchools } from './fauna-placement';
import { createCanopyMesh } from './forest-canopy';
import { buildForestField } from './forest-field';
import { impostorPlacements } from './impostor-placement';
import { addImpostors } from './impostors';
import { meadowTreePlacements } from './meadow-trees';
import { createTerrainMesh } from './terrain-mesh';
import { buildRenderSurface } from './render-surface';
import { terrainMeshHeight } from './drape';
import { InstanceHider } from './instance-hider';
import { addSunShadows, type SunShadows } from './sun-shadows';
import { buildRelief } from './terrain-relief';
import { tileAt, tileCenter } from './tile-at';
import { treePlacements } from './tree-placement';
import { addTrees } from './trees';
import { FieldPainter } from './field-painting';
import { PlacementController, type ActivePlacement } from './village-placement';
import { VillageRenderer } from './village-renderer';
import type { SceneVillage } from '../village-view';
import type { PlacementHandlers, PlacementMode } from './village-types';
import { createWaterMesh, type WaterSurface } from './water';
import { deadwoodPlacements, pinePlacements, youngTreePlacements } from './woodland-placement';

type HoverListener = (tile: TileInfo | null) => void;

/** 3D scéna krajiny – obyčejná třída bez Reactu (adaptér zobrazení). */
/**
 * Snímků za sekundu animace vody (vlnky po proudu) a zvířat; kamera v pohybu kreslí rychleji.
 */
const WATER_FPS = 30;

export class LandscapeScene {
  private readonly listeners = new Set<HoverListener>();
  private readonly resizeObserver: ResizeObserver;
  private landscape: Landscape | null = null;
  private terrain: Mesh | null = null;
  private water: WaterSurface | null = null;
  /** Ozdobné ryby a ptáci – hýbou se jako voda, dokud jsou v záběru. */
  private fauna: Fauna | null = null;
  /** Poslední snímek animace vody (ms) – voda se překresluje nejvýš WATER_FPS za sekundu. */
  private lastWaterFrame = 0;
  /**
   * Systémové „omezit pohyb“ – voda pak stojí a scéna se kreslí jen při změně. Hodnota se mění
   * živě (MediaQueryList). Zapínají ho i e2e testy: bezhlavý prohlížeč kreslí softwarově
   * a nepřetržité kreslení by zdrželo vstupy myši.
   */
  private readonly reducedMotion =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  private rtsCamera: RtsCamera | null = null;
  private hovered: TileInfo | null = null;
  private pointerMoved = false;
  private pointerInside = false;
  private needsRender = true;
  /** Do kdy kreslit každý snímek (shadery a textury se po načtení dokončují asynchronně). */
  private renderBurstUntil = 0;
  private rendering = false;
  private disposed = false;
  /** Zvuky krajiny – vznikají až po přípravě scény. */
  private ambient: AmbientSound | null = null;
  private soundEnabled = true;
  private shadows: SunShadows | null = null;
  /** Vrhače stínu vsi, které vznikly dřív než stínová mapa. */
  private readonly pendingCasters: Mesh[] = [];
  /** Stromy a kameny krajiny, které se skrývají pod stavbami a poli. */
  private readonly hider = new InstanceHider();
  private village: VillageRenderer | null = null;
  /** Poslední stav vsi od rozhraní – vykreslí se, jakmile je krajina hotová. */
  private villageState: SceneVillage | null = null;
  private placement: ActivePlacement | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    readonly renderer: RendererName,
  ) {
    this.resizeObserver = new ResizeObserver(() => {
      engine.resize();
      this.renderBurst(300);
    });
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { renderer?: 'auto' | 'webgl' } = {},
  ): Promise<LandscapeScene> {
    const { engine, renderer } = await createEngine(canvas, options.renderer ?? 'auto');
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.63, 0.75, 0.85, 1);
    // Působí jen na materiály s vlastní ambientColor (stromy), ostatní ji mají černou.
    scene.ambientColor = new Color3(1, 1, 1);
    // Opar (vzdušná perspektiva): vzdálená krajina slábne do barvy oblohy – dodá hloubku
    // a schová opakování textur v dálce. Do 300 m skoro nic, na 1,5 km asi pětina.
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.00032;
    scene.fogColor = new Color3(0.68, 0.77, 0.86);
    // Úprava obrazu jako v 0 A.D. (temperate: kontrast 1,05) – sytější stíny a světla.
    scene.imageProcessingConfiguration.contrast = 1.1;
    scene.skipPointerMovePicking = true;
    // Letní světlo jako v 0 A.D. (biom temperate): modravá obloha, teplé slunce. Slunce je
    // níž než v poledne (≈ 35°) – zvlnění terénu je tak lépe vidět.
    const sky = new HemisphericLight('sky', new Vector3(0.2, 1, 0.1), scene);
    sky.intensity = 0.5;
    sky.diffuse = new Color3(0.93, 0.96, 1.05);
    sky.groundColor = new Color3(0.32, 0.3, 0.26);
    const sun = new DirectionalLight(
      'sun',
      new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
      scene,
    );
    sun.intensity = 1.05;
    sun.diffuse = new Color3(1.03, 0.98, 0.88);
    return new LandscapeScene(canvas, engine, scene, renderer);
  }

  /**
   * Postaví scénu krajiny. Mezi náročnými kroky hlásí průběh a nechá prohlížeč překreslit
   * stránku, aby ukazatel načítání nezamrzl.
   */
  async setLandscape(
    landscape: Landscape,
    onProgress: (progress: SceneProgress) => void = () => undefined,
  ): Promise<void> {
    if (this.disposed) return;
    this.landscape = landscape;
    const report = async (step: SceneStep, done: number): Promise<void> => {
      onProgress({ step, done });
      await nextPaint();
    };
    await report('terrain', 0.3);
    if (this.disposed) return;
    const surface = buildRenderSurface(landscape);
    const groundHeight = (x: number, z: number): number => surface.heightAt(x, z) * HEIGHT_SCALE;
    this.village = new VillageRenderer(this.scene, {
      groundHeight,
      decalHeight: (x, z) => terrainMeshHeight(surface, x, z),
      addShadowCaster: (mesh) => {
        if (this.shadows) this.shadows.addCaster(mesh);
        else this.pendingCasters.push(mesh);
      },
      onAsyncChange: () => {
        this.shadows?.refresh();
        this.renderWhenReady();
      },
      requestRender: () => this.renderWhenReady(),
    });
    await report('forest', 0.4);
    if (this.disposed) return;
    const field = buildForestField(landscape);
    // Okraj lesa, v loukách osamělé stromy a skupinky, podél potoka břehový porost, na skalách
    // borovice, před lesem mladé stromky; souše, padlé stromy, pařezy a kmeny v potoce.
    const relief = buildRelief(landscape);
    const meadowTrees = meadowTreePlacements(landscape, field, surface.stream);
    const pines = pinePlacements(landscape, field, surface.stream, relief, meadowTrees);
    const trees = [
      ...treePlacements(landscape, field, surface.stream),
      ...meadowTrees,
      ...pines,
      ...youngTreePlacements(landscape, field, surface.stream),
    ];
    const decor = [
      ...decorPlacements(landscape, surface.stream, field, {
        relief,
        trees: [...meadowTrees, ...pines],
      }),
      ...deadwoodPlacements(landscape, field, surface.stream),
    ];
    // Ozdobná zvířata podle 0 A.D.: hejna ryb v tůních, kroužící vrány a káně.
    const fauna = {
      fish: fishSchools(surface),
      birds: birdFlocks(landscape, field, surface.stream, groundHeight),
    };
    await report('surface', 0.5);
    if (this.disposed) return;
    this.terrain = createTerrainMesh(this.scene, landscape, surface, { field, trees });
    this.water = createWaterMesh(this.scene, surface);
    createCanopyMesh(this.scene, surface, field);
    const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
    this.rtsCamera = createRtsCamera(this.scene, this.canvas, {
      halfExtent: (landscape.size * landscape.cellSizeM) / 2,
      start: { x: site.worldX, z: site.worldZ },
      groundHeight,
    });
    // Okraj lesa 2–3 řady 3D stromů, za nimi vnitřek lesa z impostorů.
    const impostors = impostorPlacements(landscape, field, surface.stream);
    await report('models', 0.6);
    if (this.disposed) return;
    let loaded = 0;
    const counted = <T>(promise: Promise<T>): Promise<T> =>
      promise.finally(() => onProgress({ step: 'models', done: 0.6 + 0.075 * ++loaded }));
    await Promise.all([
      counted(addTrees(this.scene, trees, { baseUrl: '/models/trees/', groundHeight })),
      counted(addDecorations(this.scene, decor, { baseUrl: '/models/decor/', groundHeight })),
      counted(
        addImpostors(this.scene, this.rtsCamera.camera, impostors, groundHeight).catch((error) =>
          console.warn(
            'Atlas stromů se nepodařilo načíst – vnitřek lesa zůstane bez stromů.',
            error,
          ),
        ),
      ),
      counted(
        addFauna(this.scene, fauna, { baseUrl: '/models/fauna/' }).then(
          (result) => {
            this.fauna = result;
          },
          (error) => console.warn('Zvířata krajiny se nepodařilo načíst.', error),
        ),
      ),
    ]);
    if (this.disposed) return;
    // Stromy a dekorace pod stavbami a poli vsi se skryjí (thin instances podle polohy paty).
    this.hider.track(
      this.scene.meshes.filter(
        (mesh): mesh is Mesh => mesh instanceof Mesh && /^(trees|decor)-/.test(mesh.name),
      ),
    );
    const sun = this.scene.getLightByName('sun');
    if (sun instanceof DirectionalLight) {
      this.shadows = addSunShadows(sun, {
        casters: [
          ...this.scene.meshes.filter(
            (mesh): mesh is Mesh =>
              mesh instanceof Mesh && /^(trees|impostors|decor)-/.test(mesh.name),
          ),
          ...this.pendingCasters.filter((mesh) => !mesh.isDisposed()),
        ],
        receivers: this.terrain ? [this.terrain] : [],
        extentM: landscape.size * landscape.cellSizeM,
      });
      this.pendingCasters.length = 0;
    }
    this.applyVillage();
    await report('shaders', 0.92);
    if (this.disposed) return;
    await this.scene.whenReadyAsync();
    onProgress({ step: 'shaders', done: 1 });
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    // Zvuky se stahují až teď – nezdrží přípravu scény; mix sleduje pohled kamery ve frame().
    this.ambient = new AmbientSound({
      environment: { stream: surface.stream, forest: field },
      enabled: this.soundEnabled,
      onStateChange: (state) => {
        this.canvas.dataset.sound = state;
      },
    });
    this.renderBurst(1500);
    this.engine.runRenderLoop(() => this.frame());
  }

  /** Zapne nebo vypne zvuky krajiny – volat přímo z kliknutí (prohlížeč pustí zvuk po gestu). */
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.ambient?.setEnabled(enabled);
  }

  /**
   * Vykreslí ves (inkrementálně – přestaví jen obydlí a pole, která se změnila; krajina zůstane).
   * Jde volat kdykoli, i před dokončením `setLandscape` – ves se pak ukáže s krajinou.
   */
  setVillage(village: SceneVillage): void {
    if (this.disposed) return;
    this.villageState = village;
    this.applyVillage();
  }

  /**
   * Umisťování obydlí (PlacementController) nebo malování pole po čtvercích (FieldPainter).
   * Běžící umisťování se nejdřív zruší (jeho `onCancel`). Po potvrzení nebo zrušení skončí samo.
   */
  startPlacement(mode: PlacementMode, handlers: PlacementHandlers): void {
    if (this.disposed) return;
    this.placement?.cancel();
    const camera = this.rtsCamera;
    const village = this.village;
    const landscape = this.landscape;
    if (!camera || !village || !landscape) {
      throw new Error('Umisťovat jde až po načtení krajiny.');
    }
    const requestRender = (): void => {
      this.needsRender = true;
    };
    const controlled: PlacementHandlers = {
      onConfirm: (result) => {
        if (this.placement === controller) this.placement = null;
        handlers.onConfirm(result);
      },
      onCancel: () => {
        if (this.placement === controller) this.placement = null;
        handlers.onCancel();
      },
      onPreview: handlers.onPreview ? (preview) => handlers.onPreview?.(preview) : undefined,
    };
    const controller: ActivePlacement =
      mode.kind === 'field'
        ? new FieldPainter(
            {
              scene: this.scene,
              canvas: this.canvas,
              landscape,
              pickGround: (x, y) => this.pickGround(x, y),
              decalHeight: (x, z) => village.decalHeight(x, z),
              setLeftButtonPan: (enabled) => camera.setLeftButtonPan(enabled),
              requestRender,
            },
            mode,
            controlled,
          )
        : new PlacementController(
            {
              scene: this.scene,
              canvas: this.canvas,
              pickGround: (x, y) => this.pickGround(x, y),
              decalHeight: (x, z) => village.decalHeight(x, z),
              cameraAlpha: () => camera.camera.alpha,
              setCameraKeyRotation: (enabled) => camera.setKeyRotation(enabled),
              ghostModel: (type) => village.ghostModel(type),
              baseHeight: (d) => village.baseHeight(d),
              requestRender,
            },
            mode,
            controlled,
          );
    this.placement = controller;
    if (mode.kind === 'dwelling') {
      // Model ducha se načte (jednou) a pak naskočí pod kurzorem.
      void village.loadModels().then(() => {
        if (this.placement === controller) this.pointerMoved = this.pointerInside;
      });
    }
    this.pointerMoved = this.pointerInside;
    this.renderWhenReady();
  }

  /** Zruší umisťování (zavolá jeho `onCancel`); bez umisťování nic nedělá. */
  cancelPlacement(): void {
    this.placement?.cancel();
  }

  /** Potvrdí umisťování jako Enter (tlačítko Potvrdit u pole); neprošlé zůstane běžet. */
  confirmPlacement(): void {
    this.placement?.confirm();
  }

  onTileHover(listener: HoverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.placement?.dispose();
    this.placement = null;
    this.village?.dispose();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.ambient?.dispose();
    this.rtsCamera?.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private readonly onPointerMove = (): void => {
    this.pointerInside = true;
    this.pointerMoved = true;
  };

  private readonly onPointerLeave = (): void => {
    this.pointerInside = false;
    this.pointerMoved = false;
    this.placement?.setCursor(null, null);
    this.emit(null);
  };

  /** Překreslí ves podle posledního stavu a skryje stromy a kameny pod ní. */
  private applyVillage(): void {
    const village = this.village;
    if (!village || !this.villageState) return;
    const changed = village.update(this.villageState);
    const hidden = this.hider.apply(village.hideShapes());
    // Rozhraní posílá stav vsi opakovaně (dotaz každých pár sekund) – beze změny nic.
    if (!changed && !hidden) return;
    this.shadows?.refresh();
    this.renderWhenReady();
  }

  /**
   * Překreslit hned a znovu, až budou hotové shadery a textury nových meshů (kompilují se
   * a stahují asynchronně – bez toho by do dalšího pohybu kamery zůstal neúplný obraz).
   */
  private renderWhenReady(): void {
    this.renderBurst(300);
    void this.scene.whenReadyAsync().then(() => {
      if (!this.disposed) this.renderBurst(300);
    });
  }

  /** Bod terénu pod pixelem plátna (CSS px) jako [x, z], nebo null mimo krajinu. */
  private pickGround(x: number, y: number): [number, number] | null {
    const terrain = this.terrain;
    if (!terrain || !this.landscape) return null;
    const pick = this.scene.pick(x, y, (mesh) => mesh === terrain);
    const point = pick?.hit ? pick.pickedPoint : null;
    if (!point || !tileAt(this.landscape, point.x, point.z)) return null;
    return [point.x, point.z];
  }

  /**
   * Krajina je statická – kreslí se jen při změně pohledu nebo velikosti okna. Šetří to
   * výkon i baterii (tisíce stromů) a nezahlcuje prohlížeč bez grafické karty.
   */
  private frame(): void {
    const camera = this.rtsCamera;
    if (!camera) return;
    const now = performance.now();
    if (now < this.renderBurstUntil) this.needsRender = true;
    // Voda teče a zvířata se hýbou sama – výjimka z kreslení jen při změně, dokud jsou v záběru.
    const moving = !this.reducedMotion?.matches;
    if (moving && now - this.lastWaterFrame >= 1000 / WATER_FPS) {
      let animated = false;
      if (this.water && camera.camera.isInFrustum(this.water.mesh)) {
        this.water.animate(now / 1000);
        animated = true;
      }
      if (this.fauna?.animate(now / 1000, camera.camera)) animated = true;
      if (animated) {
        this.lastWaterFrame = now;
        this.needsRender = true;
      }
    }
    if (camera.update(this.engine.getDeltaTime() / 1000)) {
      this.needsRender = true;
      // Pod nehybným kurzorem je po pohybu kamery jiné políčko.
      if (this.pointerInside) this.pointerMoved = true;
      const { target, radius } = camera.camera;
      this.ambient?.setView({ x: target.x, z: target.z, radius });
    }
    this.pickHoveredTile();
    this.placement?.tick(now);
    if (!this.needsRender) return;
    this.needsRender = false;
    this.scene.render(false);
  }

  /**
   * Chvíli kreslit každý snímek: WebGL kompiluje shadery paralelně a první snímky po načtení
   * nebo změně velikosti nemusí obsahovat vše – bez toho by na obrazovce zůstal neúplný obraz.
   */
  private renderBurst(durationMs: number): void {
    this.renderBurstUntil = Math.max(this.renderBurstUntil, performance.now() + durationMs);
    this.needsRender = true;
  }

  /** Pick jednou za snímek, ne při každém pohybu myši – políčko pod kurzorem i umisťování. */
  private pickHoveredTile(): void {
    if (!this.pointerMoved || !this.landscape || !this.terrain) return;
    this.pointerMoved = false;
    const { pointerX, pointerY } = this.scene;
    const point = this.pickGround(pointerX, pointerY);
    this.placement?.setCursor(point, point ? { x: pointerX, y: pointerY } : null);
    const tile = point ? tileAt(this.landscape, point[0], point[1]) : null;
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

/** Kroky přípravy scény – texty k nim ukazuje rozhraní. */
export type SceneStep = 'terrain' | 'forest' | 'surface' | 'models' | 'shaders';

/** Průběh přípravy scény: právě probíhající krok a celkový podíl hotové práce 0–1. */
export interface SceneProgress {
  step: SceneStep;
  done: number;
}

/**
 * Počká, až prohlížeč vykreslí snímek (ukazatel průběhu se překreslí i mezi synchronními
 * kroky). Ve skrytém panelu requestAnimationFrame neběží – pak stačí krátká pauza.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
}
