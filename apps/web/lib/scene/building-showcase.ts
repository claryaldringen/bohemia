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
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import {
  SHOWCASE_BUILDINGS,
  SHOWCASE_CARTS,
  SHOWCASE_DECAY,
  SHOWCASE_ROADS,
  SHOWCASE_DECOR,
  SHOWCASE_GROUNDS,
  SHOWCASE_PEN,
  showcaseCartGround,
  showcaseCarts,
  showcaseDecay,
  showcaseRoads,
  showcaseGrounds,
  showcaseHayMeadows,
  showcaseMeadowDay,
  showcasePlough,
  showcasePloughDay,
  type ShowcaseDecorModel,
} from './building-showcase-layout';
import { CartRenderer } from './cart-renderer';
import { SUN_DIRECTION, WATER_FPS } from './constants';
import { createEngine, type RendererName } from './create-engine';
import type { PitCut } from './dwelling-pit';
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
import { PenAnimals } from './pen-animals';
import { PenRenderer } from './pen-renderer';
import { PitCuts, applyPitCut } from './pit-cut';
import { ploughFront } from './plough-front';
import { ploughPath } from './plough-team';
import { PloughTeams } from './plough-team-renderer';
import { RoadWorks, roadRibbonMeshes } from './road-works';
import { REFERENCE_DAY, seasonLook, type SeasonLight } from './season-look';
import {
  applySeasonGround,
  applySeasonModel,
  applySeasonSnow,
  setSeasonShaderState,
} from './season-materials';
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
/** Zimní den ukázky (konec ledna – souvislý sníh, holé stromy). */
const WINTER_DAY = 30;
/** Světlo ukázky v létě (jako LandscapeScene) – v zimě ho nahradí světlo období. */
const SUMMER_LIGHT: SeasonLight = {
  sunIntensity: 1.05,
  sunColor: [1.03, 0.98, 0.88],
  skyIntensity: 0.5,
  skyColor: [0.93, 0.96, 1.05],
  groundColor: [0.32, 0.3, 0.26],
  clearColor: [0.63, 0.75, 0.85],
  fogColor: [0.68, 0.77, 0.86],
  fogDensity: 0.00032,
};
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
  '/models/dwellings/dvorec-construction.glb',
  '/models/crafts/construction.glb',
  '/models/crafts/construction-moss.glb',
  '/models/sacred/idol-construction.glb',
  '/models/sacred/shrine-construction.glb',
];

/**
 * Jámy jednoho vlastníka (staveniště ukázky, rozpad obydlí): jeho obtisky prořezává jen jeho
 * jámy, louku ukázky všechny (`onChange` je složí).
 */
class PitCutsPart extends PitCuts {
  private cuts: readonly PitCut[] = [];

  constructor(private readonly onChange: () => void) {
    super();
  }

  override set(cuts: readonly PitCut[]): void {
    super.set(cuts);
    this.cuts = cuts;
    this.onChange();
  }

  get list(): readonly PitCut[] {
    return this.cuts;
  }
}

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
 * (`PloughTeams`) po čtvercích – orba postupuje po dnech ukázky a spřežení stojí na čele jako ve
 * hře (`ploughFront`, další den dojde dál) – a vedle zemnice stojí ohrada s přístřeškem, dvěma
 * voly a krávou (`PenRenderer`, `PenAnimals`). `setWinter` přepne světlo a uniformy období na zimu (sníh na
 * střechách a louce). Kamera se otáčí levým tlačítkem, posouvá pravým, kolečko přibližuje.
 * Kreslí se jen při změně pohledu – výjimka je spřežení a zvířata v ohradě v záběru
 * (WATER_FPS jako voda, při omezeném pohybu stojí).
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
  /** Rozpad obydlí – herní renderer vsi s opuštěnými obydlími a zbytky jam (showcaseDecay). */
  private decay: VillageRenderer | null = null;
  /** Posuvník rozpadu 0–1 (building-showcase-layout.ts – decayAt). */
  private decayT = 0;
  /** Řada opuštěných staveb ukazuje místo rozpadu opravu (abandonment.md – Oprava). */
  private repair = false;
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
  /** Den ukázky orby (showcasePloughDay) – po něm se posune čelo orby a spřežení dojde dál. */
  private ploughDay = showcasePloughDay(Date.now());
  /** Vozy se spřežením na pahorku (ukázka „Vozy“ – wagons.md). */
  private carts: CartRenderer | null = null;
  /** Poslední snímek vozů (ms) a stálá póza při omezeném pohybu. */
  private lastCartAnimation = 0;
  private cartsFrozen = false;
  /** Vůz, za kterým jede kamera (null = žádný), a vůz, na který se kamera podívala naposledy. */
  private followedCart: number | null = null;
  private focusedCart = -1;
  /** Ohrada s přístřeškem a zvířata v ní (ukázka „Ohrada“). */
  private pens: PenRenderer | null = null;
  private penAnimals: PenAnimals | null = null;
  /** Pevné cesty – vyšlapaná, úprava a hať s lávkou po fázích (ukázka „Cesty“). */
  private roadWorks: RoadWorks | null = null;
  private roadMeshes: Mesh[] = [];
  private roadMaterials: { worn: Material; earth: Material } | null = null;
  /** Zimní vzhled (sníh na střechách a louce) – jinak léto. */
  private winter = false;
  /** Poslední snímek animace spřežení (ms) – nejvýš WATER_FPS za sekundu. */
  private lastAnimation = 0;
  /** Při omezeném pohybu stojí – stačí ho jednou postavit. */
  private frozenWritten = false;
  /** Kamera jede za spřežením. */
  private following = false;
  /** Poslední snímek zvířat v ohradě (ms) a jejich stálá póza při omezeném pohybu. */
  private lastPenAnimation = 0;
  private penFrozen = false;
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
    scene.clearColor = new Color4(...SUMMER_LIGHT.clearColor, 1);
    scene.ambientColor = new Color3(1, 1, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = SUMMER_LIGHT.fogDensity;
    scene.fogColor = new Color3(...SUMMER_LIGHT.fogColor);
    scene.imageProcessingConfiguration.contrast = 1.1;
    scene.skipPointerMovePicking = true;
    const sky = new HemisphericLight('sky', new Vector3(0.2, 1, 0.1), scene);
    sky.intensity = SUMMER_LIGHT.skyIntensity;
    sky.diffuse = new Color3(...SUMMER_LIGHT.skyColor);
    sky.groundColor = new Color3(...SUMMER_LIGHT.groundColor);
    const sun = new DirectionalLight(
      'sun',
      new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
      scene,
    );
    sun.intensity = SUMMER_LIGHT.sunIntensity;
    sun.diffuse = new Color3(...SUMMER_LIGHT.sunColor);

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

  /**
   * Kamera na stavbu (id ze SHOWCASE_BUILDINGS, SHOWCASE_GROUNDS, SHOWCASE_DECOR, SHOWCASE_PEN
   * nebo SHOWCASE_DECAY).
   */
  focus(id: string): void {
    const target = [
      ...SHOWCASE_BUILDINGS,
      ...SHOWCASE_GROUNDS,
      ...SHOWCASE_DECOR,
      SHOWCASE_PEN,
      ...SHOWCASE_DECAY,
      SHOWCASE_ROADS,
      SHOWCASE_CARTS,
    ].find((b) => b.id === id);
    if (!target) return;
    this.setView(target.focus);
  }

  /**
   * Pohled kamery – cíl na zemi (výška `y`, jinak louka), vzdálenost, natočení a náklon (rad);
   * chybějící zůstanou.
   */
  setView(view: {
    x?: number;
    y?: number;
    z?: number;
    radius?: number;
    alpha?: number;
    beta?: number;
  }): void {
    const { camera } = this;
    // cíl měnit na místě – přiřazení nového cíle by Babylon přepočítal na úhly ze staré polohy
    camera.target.set(view.x ?? camera.target.x, view.y ?? 0, view.z ?? camera.target.z);
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

  /**
   * Zimní vzhled (zapnuto / vypnuto): světlo, opar a uniformy období jako ve hře v zimě (sníh
   * na střechách, stozích a louce, nízké trsy pod sněhem). Vrátí nový stav.
   */
  setWinter(on: boolean): boolean {
    this.winter = on;
    const look = seasonLook(on ? WINTER_DAY : REFERENCE_DAY);
    const light: SeasonLight = on ? look.light : SUMMER_LIGHT;
    const scene = this.scene;
    const sun = scene.getLightByName('sun');
    if (sun instanceof DirectionalLight) {
      sun.intensity = light.sunIntensity;
      sun.diffuse.set(...light.sunColor);
    }
    const sky = scene.getLightByName('sky');
    if (sky instanceof HemisphericLight) {
      sky.intensity = light.skyIntensity;
      sky.diffuse.set(...light.skyColor);
      sky.groundColor.set(...light.groundColor);
    }
    scene.clearColor.set(...light.clearColor, 1);
    scene.fogColor.set(...light.fogColor);
    scene.fogDensity = light.fogDensity;
    setSeasonShaderState(scene, look);
    // pole a louky: nízké trsy pod sněhem zmizí
    this.grounds?.setSeason(showcaseMeadowDay(this.progress), this.snow());
    this.shadows?.refresh();
    this.burst(600);
    return this.winter;
  }

  /** Kamera jede za spřežením (zapnuto / vypnuto); vrátí nový stav. */
  followTeam(on: boolean): boolean {
    this.following = on && this.teams !== null;
    if (this.following) this.followedCart = null;
    if (this.following) this.focusTeam(this.camera.radius > 60 ? 24 : this.camera.radius);
    return this.following;
  }

  /**
   * Kamera na vůz `index` (bez čísla další vůz po tom, na který se dívala naposledy);
   * `radius` = vzdálenost kamery (m). Vrátí index vozu.
   */
  focusCart(index?: number, radius = 14): number {
    const count = showcaseCarts().length;
    const i = index ?? (this.focusedCart + 1) % count;
    this.focusedCart = i;
    if (this.followedCart !== null) this.followedCart = i;
    const center = this.carts?.center(i);
    if (center) {
      const y = showcaseCartGround(center.x, center.z);
      this.setView({ x: center.x, y, z: center.z, radius });
    }
    return i;
  }

  /** Kamera jede za vozem, na který se dívá (zapnuto / vypnuto); vrátí nový stav. */
  followCart(on: boolean): boolean {
    this.followedCart = on && this.carts ? Math.max(0, this.focusedCart) : null;
    if (this.followedCart !== null) {
      this.following = false;
      this.focusCart(this.followedCart, this.camera.radius > 60 ? 18 : this.camera.radius);
    }
    return this.followedCart !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.sites?.dispose();
    this.grounds?.dispose();
    this.decay?.dispose();
    this.plots?.dispose();
    this.fences?.dispose();
    this.teams?.dispose();
    this.carts?.dispose();
    this.pens?.dispose();
    this.penAnimals?.dispose();
    this.roadWorks?.dispose();
    for (const mesh of this.roadMeshes) mesh.dispose();
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

  /**
   * Rozpad obydlí 0–1 (posuvník): stav opuštěné zemnice a polozemnice klesá ze 100 na 0 %, pak
   * zbytek jámy zarůstá (building-showcase-layout.ts – decayAt). Řada stupňů zůstává.
   */
  setDecay(t: number): void {
    this.decayT = Math.min(1, Math.max(0, t));
    this.applyDecay();
  }

  /**
   * Řada opuštěných staveb ukáže opravu – posuvník je pak průběh opravy (modla, svatyně a ohrada
   * z rozpadlého stavu, plot hřbitova ze spadlého – abandonment.md, Oprava).
   */
  setRepair(repair: boolean): void {
    this.repair = repair;
    this.applyDecay();
  }

  private applyDecay(): void {
    if (!this.decay?.update(showcaseDecay(this.decayT, this.repair))) return;
    this.shadows?.refresh();
    this.burst(400);
  }

  private async build(sun: DirectionalLight): Promise<void> {
    const scene = this.scene;
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    // louka se prořízne jámami stavenišť i rozpadlých obydlí a zbytků jam
    const pitCuts = new PitCuts();
    const mergeCuts = (): void => pitCuts.set([...siteCuts.list, ...decayCuts.list]);
    const siteCuts = new PitCutsPart(mergeCuts);
    const decayCuts = new PitCutsPart(mergeCuts);

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
    // v zimě zasněžená louka (vzor sněhu jako na terénu)
    applySeasonGround(grassMaterial);
    ground.material = grassMaterial;
    const hill = createCartHill(scene, grassMaterial);

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
    this.sites = new ShowcaseSites(scene, models, parts, siteCuts, BASE_Y, modelBaseY);
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
    // rozpad obydlí – opuštěná obydlí a zbytky jam kreslí herní renderer vsi
    this.decay = new VillageRenderer(scene, {
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
      pitCuts: decayCuts,
      sunDirection: SUN_DIRECTION,
    });
    this.decay.update(showcaseDecay(this.decayT, this.repair));
    this.grounds.setHayMeadows(showcaseHayMeadows());
    this.grounds.setSeason(showcaseMeadowDay(this.progress), this.snow());
    this.grounds.update(showcaseGrounds(this.progress, this.ploughDay).village);
    const pathMaterial = createDecalMaterial(scene, 'showcase-plot-path', {
      texture: 'grass-dirt',
    });
    applyPitCut(pathMaterial, pitCuts);
    applySeasonGround(pathMaterial, 0.85);
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
      prepareWeedMaterial: prepareTuftMaterial,
      fences: this.fences,
    });
    this.teams = new PloughTeams(scene, {
      baseUrl: '/models/plough/',
      groundHeight: () => 0,
      prepareMaterial: prepareModelMaterial,
      onLoaded: () => this.burst(600),
    });
    this.teams.setPaths(this.ploughPaths());
    this.carts = new CartRenderer(scene, {
      baseUrl: '/models/',
      groundHeight: showcaseCartGround,
      prepareMaterial: prepareModelMaterial,
      onLoaded: () => this.burst(600),
    });
    this.carts.setCarts(showcaseCarts());
    const mudMaterial = createDecalMaterial(scene, 'showcase-pen-mud', { texture: 'mud' });
    // ušlapaný sníh v ohradě – bláto pod ním prosvítá
    applySeasonGround(mudMaterial, 0.45);
    this.pens = new PenRenderer(scene, {
      groundHeight: () => 0,
      decalHeight: () => 0,
      addShadowCaster: addCaster,
      onAsyncChange,
      prepareMaterial: prepareModelMaterial,
      mudMaterial: () => mudMaterial,
      fences: this.fences,
    });
    this.penAnimals = new PenAnimals(scene, {
      groundHeight: () => 0,
      onLoaded: () => this.burst(600),
    });
    // pevné cesty (roads.md) – obtisky a díly vylepšení jako ve vsi
    const roadWorn = createDecalMaterial(scene, 'showcase-roads-worn', {
      texture: 'grass-dirt',
      zOffset: -3.5,
    });
    const roadEarth = createDecalMaterial(scene, 'showcase-roads-earth', {
      texture: 'mud',
      zOffset: -4,
    });
    applySeasonGround(roadWorn, 0.55);
    applySeasonGround(roadEarth, 0.55);
    this.roadMaterials = { worn: roadWorn, earth: roadEarth };
    this.roadWorks = new RoadWorks(scene, {
      groundHeight: () => 0,
      addShadowCaster: addCaster,
      requestRender: () => this.burst(300),
      refreshShadows: () => {
        this.shadows?.refresh();
        this.burst(600);
      },
    });
    this.shadows = addSunShadows(sun, {
      casters,
      receivers: [ground, hill],
      extentM: GROUND_SIZE.width,
    });
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
    this.grounds?.setSeason(showcaseMeadowDay(this.progress), this.snow());
    this.grounds?.update(showcaseGrounds(this.progress, this.ploughDay).village);
    this.plots?.update(this.plotViews());
    this.pens?.update([
      {
        id: 1,
        square: SHOWCASE_PEN.square,
        facing: SHOWCASE_PEN.facing,
        progress: this.progress,
      },
    ]);
    this.penAnimals?.set(this.pens?.builtLayouts().flatMap((layout) => layout.animals) ?? []);
    this.updateRoads();
    this.shadows?.refresh();
    this.burst(400);
  }

  /** Ukázka cest při průběhu stavby – obtisky znovu, díly vylepšení podle fáze. */
  private updateRoads(): void {
    const materials = this.roadMaterials;
    if (!materials) return;
    const roads = showcaseRoads(this.progress);
    for (const mesh of this.roadMeshes) mesh.dispose();
    this.roadMeshes = roadRibbonMeshes(this.scene, roads, {
      height: () => 0,
      smoothHeight: () => 0,
      material: (kind) => materials[kind],
      lift: { worn: 0.05, earth: 0.055 },
      alphaIndex: { worn: 3, earth: 3.5 },
    });
    this.roadWorks?.update(roads);
  }

  /** Sněhová pokrývka ukázky (0 v létě). */
  private snow(): number {
    return this.winter ? seasonLook(WINTER_DAY).snow : 0;
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

  /** Dráhy spřežení v dnešní den ukázky orby – stejně jako ve vsi (`ploughFront`). */
  private ploughPaths(): ReturnType<typeof ploughPath>[] {
    const village = showcasePlough(this.ploughDay);
    return ploughFront({ ...village, pens: [] }).map((a) => ploughPath(a.field));
  }

  /**
   * Další den ukázky orby: čelo orby se posune (obtisk pole) a spřežení dojde na nový pruh.
   * Vrátí true, když se den změnil.
   */
  private advancePlough(nowMs: number): boolean {
    const day = showcasePloughDay(nowMs);
    if (day === this.ploughDay || !this.teams) return false;
    this.ploughDay = day;
    this.grounds?.update(showcaseGrounds(this.progress, day).village);
    this.teams.setPaths(this.ploughPaths(), nowMs);
    this.frozenWritten = false;
    this.burst(600);
    return true;
  }

  /**
   * Kreslí jen při změně pohledu (a chvíli po načtení, než se dokončí shadery a textury) –
   * výjimka je spřežení v záběru: hýbe se samo, nejvýš WATER_FPS snímků za sekundu.
   */
  private frame(): void {
    const now = performance.now();
    let animated = this.advancePlough(Date.now());
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
    if (this.carts) {
      if (this.reducedMotion?.matches) {
        if (!this.cartsFrozen && this.carts.animate(0, null, true)) {
          this.cartsFrozen = true;
          animated = true;
        }
      } else if (now - this.lastCartAnimation >= 1000 / WATER_FPS) {
        this.cartsFrozen = false;
        const camera = this.followedCart !== null ? null : this.camera;
        if (this.carts.animate(Date.now(), camera)) {
          this.lastCartAnimation = now;
          animated = true;
        }
      }
      if (this.followedCart !== null) {
        const center = this.carts.center(this.followedCart);
        if (center) {
          const y = showcaseCartGround(center.x, center.z);
          this.camera.target.set(center.x, y, center.z);
        }
      }
    }
    if (this.penAnimals) {
      if (this.reducedMotion?.matches) {
        if (!this.penFrozen && this.penAnimals.animate(0, null, true)) {
          this.penFrozen = true;
          animated = true;
        }
      } else if (now - this.lastPenAnimation >= 1000 / WATER_FPS) {
        this.penFrozen = false;
        if (this.penAnimals.animate(Date.now(), this.camera)) {
          this.lastPenAnimation = now;
          animated = true;
        }
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

/**
 * Pahorek ukázky vozů: síť nad loukou (výška `showcaseCartGround`, mimo pahorek pod loukou),
 * tráva se stejným materiálem a uv jako louka (`GROUND_SIZE`), ať na sebe navazují.
 */
function createCartHill(scene: Scene, material: StandardMaterial): Mesh {
  const { x: cx, z: cz, radius } = SHOWCASE_CARTS.hill;
  const size = 2 * radius + 4;
  const mesh = CreateGround(
    'showcase-cart-hill',
    { width: size, height: size, subdivisions: 72 },
    scene,
  );
  mesh.position.set(cx, 0, cz);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = cx + positions[i * 3]!;
    const z = cz + positions[i * 3 + 2]!;
    const inside = Math.hypot(x - cx, z - cz) < radius;
    positions[i * 3 + 1] = inside ? showcaseCartGround(x, z) : -0.05;
    uvs[i * 2] = (x + GROUND_SIZE.width / 2) / GROUND_SIZE.width;
    uvs[i * 2 + 1] = (z + GROUND_SIZE.depth / 2) / GROUND_SIZE.depth;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  mesh.refreshBoundingInfo();
  mesh.isPickable = false;
  mesh.material = material;
  return mesh;
}

function prepareModelMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // v zimě sníh na střechách a plochách obrácených nahoru (jako obydlí ve vsi)
  applySeasonSnow(material);
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
  // trsy na podzim usychají a přes zimu stojí suché (jako ve vsi)
  applySeasonModel(material, 'grass-tuft');
}
