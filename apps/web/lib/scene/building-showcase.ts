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
import {
  SHOWCASE_BUILDINGS,
  SHOWCASE_DECOR,
  SHOWCASE_GROUNDS,
  showcaseGrounds,
  showcaseHayMeadows,
  showcaseMeadowDay,
  showcasePloughField,
  type ShowcaseDecorModel,
} from './building-showcase-layout';
import { SUN_DIRECTION, WATER_FPS } from './constants';
import { createEngine, type RendererName } from './create-engine';
import { eaveTufts, type TuftModel } from './dwelling-decor';
import { HomesteadRenderer, type PlotView } from './homestead';
import { applyGammaFog } from './gamma-fog';
import {
  addInstancedModel,
  instanceMatrices,
  loadMergedModel,
  loadModelParts,
  type ModelInstance,
} from './instanced-model';
import { TREE_MODELS, type TreeModel } from './obstacle-scenery';
import { PitCuts, applyPitCut } from './pit-cut';
import { ploughPath } from './plough-team';
import { PloughTeams } from './plough-team-renderer';
import { ShowcaseSites } from './showcase-sites';
import { addSunShadows, type SunShadows } from './sun-shadows';
import { prepareTreeMaterial } from './trees';
import {
  CONSTRUCTION_BASE,
  PLOT_BUILT,
  constructionState,
  type ConstructionKind,
} from './village-construction';
import { createDecalMaterial } from './village-meshes';
import { VillageRenderer } from './village-renderer';
import { WovenFenceRenderer } from './woven-fence-renderer';

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
/**
 * Díly staveniště: obydlí a jejich rekvizity, řemesla (+ kameny a hlína), uhlíř a milíř,
 * modla a svatyně.
 */
const CONSTRUCTION_URLS = [
  '/models/dwellings/construction.glb',
  '/models/crafts/construction.glb',
  '/models/crafts/construction-moss.glb',
  '/models/sacred/idol-construction.glb',
  '/models/sacred/shrine-construction.glb',
];

/** Pata modelu: obydlí a dílny o kousek zapuštěné, posvátná místa leží na terénu (mají vlastní zem). */
function modelBaseY(kind: ConstructionKind): number {
  return kind === 'modla' || kind === 'svatyne' ? 0 : BASE_Y;
}

/** Strom z lesa podle jména souboru (oak-large-1.glb → oak-large-1), jinak undefined. */
function treeModelOf(url: string): TreeModel | undefined {
  const name = url.slice(url.lastIndexOf('/') + 1).replace(/\.glb$/, '');
  return TREE_MODELS.find((model) => model === name);
}

function decorInstance(m: ShowcaseDecorModel): ModelInstance {
  return { x: m.x, y: 0, z: m.z, rotationY: m.rotation, scale: m.scale };
}

/**
 * VÝVOJOVÝ NÁHLED – jen pro /dev/buildings: stavby vedle sebe na rovné louce se světlem hry
 * (slunce, obloha, opar a kontrast jako LandscapeScene), jámy, trsy trávy u okapu a pozemky
 * polozemnice jako ve vsi, stíny od slunce. Za stavbami pole, hřbitov, sad a louka na seno –
 * kreslí je herní `VillageRenderer` podle `showcaseGrounds`; vpravo posvátný dub s obětinami
 * a dubový háj s kameny (`SHOWCASE_DECOR`, bez staveniště); vlevo orá spřežení volů s rádlem
 * (`PloughTeams`). Kamera se otáčí levým tlačítkem, posouvá pravým, kolečko přibližuje.
 * Kreslí se jen při změně pohledu – výjimka je spřežení v záběru (WATER_FPS jako voda,
 * při omezeném pohybu stojí).
 */
export class BuildingShowcase {
  private readonly resizeObserver: ResizeObserver;
  private readonly lastView = new Matrix();
  private hasView = false;
  private burstUntil = 0;
  private disposed = false;
  private progress = 1;
  private sites: ShowcaseSites | null = null;
  /** Pole, hřbitov a sad – herní renderer vsi bez obydlí. */
  private grounds: VillageRenderer | null = null;
  /** Pozemky polozemnic – plot a záhony po fázích jako ve vsi (homestead.ts). */
  private plots: HomesteadRenderer | null = null;
  private fences: WovenFenceRenderer | null = null;
  private shadows: SunShadows | null = null;
  /** Vrhače stínu přidané dřív, než vznikne stínová mapa. */
  private readonly pendingCasters: Mesh[] = [];
  /** Hotové modely a trsy trávy – při stavbě skryté. */
  private readonly finished: Mesh[] = [];
  private readonly tufts: Mesh[] = [];
  /** Spřežení volů s rádlem (ukázka „Orání“). */
  private teams: PloughTeams | null = null;
  /** Poslední snímek animace spřežení (ms) – nejvýš WATER_FPS za sekundu. */
  private lastAnimation = 0;
  /** Při omezeném pohybu stojí – stačí ho jednou postavit. */
  private frozenWritten = false;
  /** Kamera jede za spřežením. */
  private following = false;
  private readonly reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

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

  /** Kamera na stavbu (id ze SHOWCASE_BUILDINGS, SHOWCASE_GROUNDS nebo SHOWCASE_DECOR). */
  focus(id: string): void {
    const target = [...SHOWCASE_BUILDINGS, ...SHOWCASE_GROUNDS, ...SHOWCASE_DECOR].find(
      (b) => b.id === id,
    );
    if (!target) return;
    this.setView(target.focus);
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

  /** Kamera na spřežení (střed mezi jhem a rádlem); `radius` = vzdálenost kamery (m). */
  focusTeam(radius = 16): void {
    const center = this.teams?.center();
    if (!center) return;
    this.setView({ x: center.x, z: center.z, radius });
  }

  /** Kamera jede za spřežením (zapnuto / vypnuto); vrátí nový stav. */
  followTeam(on: boolean): boolean {
    this.following = on && this.teams !== null;
    if (this.following) this.focusTeam(this.camera.radius > 60 ? 24 : this.camera.radius);
    return this.following;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.sites?.dispose();
    this.grounds?.dispose();
    this.plots?.dispose();
    this.fences?.dispose();
    this.teams?.dispose();
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

    const casters = this.pendingCasters;
    const parts = new Map<string, Mesh>();
    // dekorace podle souboru: stromy jako v lese, obětiny, kameny háje po uzlech
    const decor = new Map<string, ShowcaseDecorModel[]>();
    for (const m of SHOWCASE_DECOR.flatMap((g) => g.models)) {
      decor.set(m.url, [...(decor.get(m.url) ?? []), m]);
    }
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
          mesh.position.set(m.x, modelBaseY(m.kind), m.z);
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
      ...[...decor].map(async ([url, list], i) => {
        try {
          if (list.some((m) => m.part !== undefined)) {
            const loaded = await loadModelParts(
              scene,
              url,
              'showcase-decor-',
              prepareModelMaterial,
            );
            for (const [name, mesh] of loaded ?? []) {
              const mine = list.filter((m) => m.part === name);
              if (mine.length === 0) {
                mesh.dispose();
                continue;
              }
              mesh.thinInstanceSetBuffer(
                'matrix',
                instanceMatrices(mine.map(decorInstance)),
                16,
                true,
              );
              casters.push(mesh);
            }
            return;
          }
          const tree = list[0]?.tree ? treeModelOf(url) : undefined;
          const mesh = await addInstancedModel(
            scene,
            url,
            `showcase-decor-${i}`,
            list.map(decorInstance),
            tree ? (material) => prepareTreeMaterial(tree, material) : prepareModelMaterial,
          );
          if (mesh) casters.push(mesh);
        } catch (error) {
          console.warn(`Dekoraci ${url} se nepodařilo načíst.`, error);
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
    this.sites = new ShowcaseSites(scene, models, parts, pitCuts, BASE_Y, modelBaseY);
    this.grounds = new VillageRenderer(scene, {
      groundHeight: () => 0,
      decalHeight: () => 0,
      addShadowCaster: (mesh) => {
        if (this.shadows) this.shadows.addCaster(mesh);
        else casters.push(mesh);
      },
      onAsyncChange: () => {
        this.shadows?.refresh();
        this.burst(600);
      },
      requestRender: () => this.burst(300),
      // jámy obydlí patří staveništím (ShowcaseSites) – pole a hřbitov mají vlastní, prázdné
      pitCuts: new PitCuts(),
      sunDirection: SUN_DIRECTION,
    });
    this.grounds.setHayMeadows(showcaseHayMeadows());
    this.grounds.setSeason(showcaseMeadowDay(this.progress), 0);
    this.grounds.update(showcaseGrounds(this.progress).village);
    const pathMaterial = createDecalMaterial(scene, 'showcase-plot-path', {
      texture: 'grass-dirt',
    });
    applyPitCut(pathMaterial, pitCuts);
    const addCaster = (mesh: Mesh): void => {
      if (this.shadows) this.shadows.addCaster(mesh);
      else casters.push(mesh);
    };
    const onAsyncChange = (): void => {
      this.shadows?.refresh();
      this.burst(600);
    };
    this.fences = new WovenFenceRenderer(scene, {
      height: () => 0,
      addShadowCaster: addCaster,
      onAsyncChange,
      prepareMaterial: prepareModelMaterial,
    });
    this.plots = new HomesteadRenderer(scene, {
      groundHeight: () => 0,
      decalHeight: () => 0,
      addShadowCaster: addCaster,
      onAsyncChange,
      pathMaterial: () => pathMaterial,
      prepareMaterial: prepareModelMaterial,
      fences: this.fences,
    });
    this.teams = new PloughTeams(scene, {
      baseUrl: '/models/plough/',
      groundHeight: () => 0,
      prepareMaterial: prepareModelMaterial,
      onLoaded: () => this.burst(600),
    });
    this.teams.setPaths([ploughPath(showcasePloughField())]);
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
    this.grounds?.setSeason(showcaseMeadowDay(this.progress), 0);
    this.grounds?.update(showcaseGrounds(this.progress).village);
    this.plots?.update(this.plotViews());
    this.shadows?.refresh();
    this.burst(400);
  }

  /** Pozemky polozemnic při průběhu stavby (hotové celé, staveniště podle fáze plotu). */
  private plotViews(): PlotView[] {
    return SHOWCASE_BUILDINGS.flatMap((b) => b.models).flatMap((m, i) => {
      if (!m.plot) return [];
      const progress =
        this.progress >= 1 ? PLOT_BUILT : constructionState(m.kind, this.progress).plot;
      return [{ id: i + 1, square: m.plot, variant: m.plot.variant, progress }];
    });
  }

  /**
   * Kreslí jen při změně pohledu (a chvíli po načtení, než se dokončí shadery a textury) –
   * výjimka je spřežení v záběru: hýbe se samo, nejvýš WATER_FPS snímků za sekundu.
   */
  private frame(): void {
    const now = performance.now();
    let animated = false;
    if (this.teams) {
      if (this.reducedMotion?.matches) {
        // omezený pohyb: spřežení stojí uprostřed první řady
        if (!this.frozenWritten && this.teams.animate(0, null, true)) {
          this.frozenWritten = true;
          animated = true;
        }
      } else if (now - this.lastAnimation >= 1000 / WATER_FPS) {
        this.frozenWritten = false;
        // skutečný čas (epoch ms) jako zvířata – stejný okamžik = stejná póza
        const camera = this.following ? null : this.camera;
        if (this.teams.animate(Date.now(), camera)) {
          this.lastAnimation = now;
          animated = true;
        }
      }
      if (this.following) {
        const center = this.teams.center();
        if (center) this.camera.target.set(center.x, 0, center.z);
      }
    }
    this.camera.update();
    const view = this.camera.getViewMatrix(true);
    const changed = !this.hasView || !view.equals(this.lastView);
    this.lastView.copyFrom(view);
    this.hasView = true;
    if (!changed && !animated && now > this.burstUntil) return;
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
