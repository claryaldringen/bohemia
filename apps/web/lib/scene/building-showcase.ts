import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { SHOWCASE_BUILDINGS } from './building-showcase-layout';
import { SUN_DIRECTION } from './constants';
import { createEngine, type RendererName } from './create-engine';
import { eaveTufts, type TuftModel } from './dwelling-decor';
import { applyGammaFog } from './gamma-fog';
import { addInstancedModel, loadMergedModel, loadModelParts } from './instanced-model';
import { PitCuts, applyPitCut } from './pit-cut';
import { ShowcaseSites } from './showcase-sites';
import { addSunShadows, type SunShadows } from './sun-shadows';
import { CONSTRUCTION_BASE } from './village-construction';

/** Úhel kamery od svislice ve hře (BETA v camera.ts) – výchozí pohled vývojové stránky. */
const GAME_BETA = 0.85;
/** Pata modelu na rovině – obydlí je o kousek zapuštěné (DWELLING_SINK_M ve village-renderer.ts). */
const BASE_Y = -0.05;
/** Rovná louka kolem staveb (m) a délka opakování textury trávy jako v terénu (m). */
const GROUND_SIZE = { width: 400, depth: 400 };
const GRASS_REPEAT_M = 65;
/** Okolní světlo modelů a trsů trávy jako ve vsi (village-renderer.ts). */
const AMBIENT = new Color3(0.38, 0.38, 0.36);
const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
const TUFT_TINT = new Color3(0.56, 0.86, 0.4);
const TUFT_MODELS: readonly TuftModel[] = ['grass-tuft-1', 'grass-tuft-2'];
/** Díly staveniště: obydlí a jejich rekvizity, řemesla (+ kameny a hlína), uhlíř a milíř. */
const CONSTRUCTION_URLS = [
  '/models/dwellings/construction.glb',
  '/models/crafts/construction.glb',
  '/models/crafts/construction-moss.glb',
];

/**
 * VÝVOJOVÝ NÁHLED – jen pro /dev/buildings: stavby vedle sebe na rovné louce se světlem hry
 * (slunce, obloha, opar a kontrast jako LandscapeScene), jámy a trsy trávy u okapu jako ve vsi,
 * stíny od slunce. Kamera se otáčí levým tlačítkem, posouvá pravým, kolečko přibližuje.
 * Kreslí se jen při změně pohledu.
 */
export class BuildingShowcase {
  private readonly resizeObserver: ResizeObserver;
  private readonly lastView = new Matrix();
  private hasView = false;
  private burstUntil = 0;
  private disposed = false;
  private progress = 1;
  private sites: ShowcaseSites | null = null;
  private shadows: SunShadows | null = null;
  /** Hotové modely a trsy trávy – při stavbě skryté. */
  private readonly finished: Mesh[] = [];
  private readonly tufts: Mesh[] = [];

  private constructor(
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    readonly renderer: RendererName,
    canvas: HTMLCanvasElement,
  ) {
    this.resizeObserver = new ResizeObserver(() => {
      engine.resize();
      this.burst(300);
    });
    this.resizeObserver.observe(canvas);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { renderer?: 'auto' | 'webgl' } = {},
  ): Promise<BuildingShowcase> {
    const { engine, renderer } = await createEngine(canvas, options.renderer ?? 'auto');
    const scene = new Scene(engine);
    // světlo, opar a úprava obrazu jako LandscapeScene.create
    scene.clearColor = new Color4(0.63, 0.75, 0.85, 1);
    scene.ambientColor = new Color3(1, 1, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.00032;
    scene.fogColor = new Color3(0.68, 0.77, 0.86);
    scene.imageProcessingConfiguration.contrast = 1.1;
    scene.skipPointerMovePicking = true;
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

    const start = SHOWCASE_BUILDINGS.find((b) => b.id === 'hrncir')?.focus;
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      GAME_BETA,
      46,
      new Vector3(start?.x ?? 0, 0, start?.z ?? 0),
      scene,
    );
    camera.fov = Math.PI / 4;
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 160;
    camera.lowerBetaLimit = 0.15;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.03;
    camera.panningSensibility = 60;
    camera.mapPanning = true;
    camera.minZ = 0.3;
    camera.maxZ = 2000;
    camera.attachControl(canvas, false);

    const showcase = new BuildingShowcase(engine, scene, camera, renderer, canvas);
    await showcase.build(sun);
    return showcase;
  }

  /** Kamera na stavbu (id ze SHOWCASE_BUILDINGS). */
  focus(id: string): void {
    const building = SHOWCASE_BUILDINGS.find((b) => b.id === id);
    if (!building) return;
    this.setView(building.focus);
  }

  /** Pohled kamery – cíl na zemi, vzdálenost, natočení a náklon (rad); chybějící zůstanou. */
  setView(view: { x?: number; z?: number; radius?: number; alpha?: number; beta?: number }): void {
    const { camera } = this;
    // cíl měnit na místě – přiřazení nového cíle by Babylon přepočítal na úhly ze staré polohy
    camera.target.set(view.x ?? camera.target.x, 0, view.z ?? camera.target.z);
    if (view.radius !== undefined) camera.radius = view.radius;
    if (view.alpha !== undefined) camera.alpha = view.alpha;
    if (view.beta !== undefined) camera.beta = view.beta;
  }

  /** Náklon kamery jako ve hře (natočení a přiblížení zůstanou). */
  gameView(): void {
    this.camera.beta = GAME_BETA;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.sites?.dispose();
    this.camera.detachControl();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  /**
   * Průběh stavby všech staveb 0–1 (1 = hotové): staveniště po fázích jako ve vsi
   * (village-construction.ts) – díly, jáma, drn, vytyčení, hromada hlíny a rekvizity.
   */
  setProgress(progress: number): void {
    this.progress = Math.min(1, Math.max(0, progress));
    this.applyProgress();
  }

  private async build(sun: DirectionalLight): Promise<void> {
    const scene = this.scene;
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    const pitCuts = new PitCuts();

    const ground = CreateGround(
      'showcase-ground',
      { width: GROUND_SIZE.width, height: GROUND_SIZE.depth },
      scene,
    );
    ground.isPickable = false;
    ground.receiveShadows = true;
    const grassMaterial = new StandardMaterial('showcase-grass', scene);
    grassMaterial.specularColor = Color3.Black();
    const grass = new Texture('/textures/terrain/grass.jpg', scene);
    grass.uScale = GROUND_SIZE.width / GRASS_REPEAT_M;
    grass.vScale = GROUND_SIZE.depth / GRASS_REPEAT_M;
    grass.anisotropicFilteringLevel = 8;
    grassMaterial.diffuseTexture = grass;
    applyPitCut(grassMaterial, pitCuts);
    ground.material = grassMaterial;

    const casters: Mesh[] = [];
    const parts = new Map<string, Mesh>();
    await Promise.all([
      ...models.map(async (m, i) => {
        try {
          const mesh = await loadMergedModel(
            scene,
            m.url,
            `showcase-model-${i}`,
            prepareModelMaterial,
          );
          if (!mesh) return;
          mesh.position.set(m.x, BASE_Y, m.z);
          mesh.rotation.y = m.rotation;
          casters.push(mesh);
          this.finished.push(mesh);
        } catch (error) {
          console.warn(`Model ${m.url} se nepodařilo načíst.`, error);
        }
      }),
      ...TUFT_MODELS.map(async (name) => {
        const instances = models
          .flatMap((m, i) => {
            const base = CONSTRUCTION_BASE[m.kind];
            return base ? eaveTufts(base, m, i + 1) : [];
          })
          .filter((t) => t.model === name)
          .map((t) => ({ x: t.x, y: -0.04, z: t.z, rotationY: t.rotationY, scale: t.scale }));
        try {
          const mesh = await addInstancedModel(
            scene,
            `/models/dwellings/${name}.glb`,
            `showcase-${name}`,
            instances,
            prepareTuftMaterial,
          );
          if (!mesh) return;
          casters.push(mesh);
          this.tufts.push(mesh);
        } catch (error) {
          console.warn('Trsy trávy se nepodařilo načíst.', error);
        }
      }),
      ...CONSTRUCTION_URLS.map(async (url) => {
        try {
          const loaded = await loadModelParts(scene, url, 'showcase-site-', prepareModelMaterial);
          for (const [name, mesh] of loaded ?? []) {
            mesh.setEnabled(false);
            parts.set(name, mesh);
            casters.push(mesh);
          }
        } catch (error) {
          console.warn(`Díly staveniště ${url} se nepodařilo načíst.`, error);
        }
      }),
    ]);
    if (this.disposed) return;
    this.sites = new ShowcaseSites(scene, models, parts, pitCuts, BASE_Y);
    this.shadows = addSunShadows(sun, { casters, receivers: [ground], extentM: GROUND_SIZE.width });
    this.applyProgress();
    await scene.whenReadyAsync();
    if (this.disposed) return;
    this.burst(1500);
    this.engine.runRenderLoop(() => this.frame());
  }

  /** Hotové modely a trsy u okapu jen při 100 %, jinak staveniště; stíny znovu. */
  private applyProgress(): void {
    if (!this.sites) return;
    const built = this.progress >= 1;
    for (const mesh of this.finished) mesh.setEnabled(built);
    for (const mesh of this.tufts) mesh.setEnabled(built);
    this.sites.update(this.progress);
    this.shadows?.refresh();
    this.burst(400);
  }

  /** Kreslí jen při změně pohledu (a chvíli po načtení, než se dokončí shadery a textury). */
  private frame(): void {
    this.camera.update();
    const view = this.camera.getViewMatrix(true);
    const changed = !this.hasView || !view.equals(this.lastView);
    this.lastView.copyFrom(view);
    this.hasView = true;
    if (!changed && performance.now() > this.burstUntil) return;
    this.scene.render(false);
  }

  private burst(ms: number): void {
    this.burstUntil = Math.max(this.burstUntil, performance.now() + ms);
  }
}

function prepareModelMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
}

function prepareTuftMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.alphaCutOff = 0.3;
  material.ambientColor = PLANT_AMBIENT;
  material.directIntensity = 0.75;
  material.albedoColor = TUFT_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
}
