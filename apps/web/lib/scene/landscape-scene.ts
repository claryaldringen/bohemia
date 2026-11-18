import { ActivityMemory } from './activity-memory';
// Picking scény (`RegisterRay`) se musí zaregistrovat dřív než ostatní moduly scény – jako před
// rozdělením fasády; pozdější registrace (až s scene-pointer.ts) rozbila tah bodu opevnění
// (e2e fortification.spec.ts – „tah bodu mění cenu“).
import '@babylonjs/core/Culling/ray';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import {
  NO_OBSTACLE_CHANGES,
  OFFICIAL_WORLD,
  type ChurchDims,
  type Landscape,
  type ObstacleLayer,
  type WorldClock,
  planWagonRoad,
  terrainEditsFrom,
  type WagonRoadPlan,
  type MarchGrid,
  type Pos,
} from '@bohemia/game';
import { AmbientSound } from './ambient-sound';
import { createRtsCamera, type RtsCamera } from './camera';
import { SUN_DIRECTION, WATER_FPS } from './constants';
import { createEngine, type RendererName } from './create-engine';
import type { Fauna } from './fauna';
import { ClearingSlash } from './clearing-slash';
import { burningKey, burningSquares, heapFires } from './clearing-fire';
import { ClearingFireRenderer } from './clearing-fire-renderer';
import { FireBuckets } from './fire-buckets';
import { houseFireKey, houseFireKind, houseFires } from './house-fire';
import { gameDayAt } from './smoke-schedule';
import { FelledTrees } from './felled-trees';
import { LogPile } from './log-pile';
import { StonePiles } from './stone-piles';
import { sameClearing, villageClearedForest, type ClearedForest } from './cleared-forest';
import { browserMarchGrid, cursorRoads, roadsKey } from './march-cursor';
import { createForestCanopy, type ForestCanopy } from './forest-canopy';
import type { ScenePerfStats } from './perf-stats';
import { ScenePerf } from './scene-perf';
import type { ImpostorForest } from './impostors';
import { createTerrainMesh, type TerrainMesh } from './terrain-mesh';
import type { RenderSurface } from './render-surface';
import {
  loadSceneryModels,
  nextPaint,
  planScenery,
  sceneGround,
  type SceneGround,
  type SceneProgress,
  type SceneryPlan,
  type SceneStep,
} from './landscape-build';
import { SceneAtmosphere, type DayClock } from './scene-atmosphere';
import { BASE_CONTRAST } from './scene-light';
import { SceneLoop } from './scene-loop';
import { hitPart } from './scene-perf';
import {
  ScenePointer,
  type GatePick,
  type OrderMode,
  type HoverListener,
  type SelectListener,
} from './scene-pointer';
import {
  groundToScreen,
  screenProjector,
  viewFootprint as cameraFootprint,
  type ViewFootprint,
} from './scene-projection';
import { SceneSelection, type DraftListener, type PersonListener } from './scene-selection';
import { SceneWarView } from './scene-war';
import { withoutMen } from './expedition-choreo';
import { journeyHorseIds, type SceneJourney } from './journey-riders';
import { ShadowCasters } from './shadow-casters';
import { chunkGrid } from './scenery-chunks';
import { SceneryCulling } from './scenery-culling';
import { InstanceHider } from './instance-hider';
import { VillageLivestock } from './livestock';
import { VillageWildlife } from './wildlife';
import { ridingHorseIds } from './riders';
import { VillageVillagers } from './villagers';
import type { FuneralTimeline } from './funeral-plan';
import type { WeddingPlan } from './wedding-plan';
import { VillagePaths, type PathStats } from './path-renderer';
import { PitCuts, applyPitCut } from './pit-cut';
import { tornadoTrunks } from './tornado-track';
import { castersChanged } from './sun-shadows';
import { roadsWithContinuations, swathBands, swathBandsKey, swathObstacleIds } from './swath-bands';
import { tileCenter } from './tile-at';
import { PlacementOutlines } from './placement-outlines-view';
import { HoldingsOverlay, type HoldingsOverlaySector } from './holdings-overlay';
import type { SceneWar } from './army-renderer';
import { SelectionHighlight } from './selection-highlight';
import type { VillageTarget } from './village-picking';
import { selectedPeopleIds, selectedPeopleVillage } from './village-selection';
import type { ActivePlacement } from './village-placement';
import { ChurchPlacer } from './church-placer';
import { createPlacement } from './placement-factory';
import { VillageRenderer } from './village-renderer';
import type { SceneVillage } from '../village-view';
import type { SceneChurch } from '../church-view';
import type { PlacementHandlers, PlacementMode } from './village-types';
import { createWaterMesh, type WaterSurface } from './water';
import { PremiumSites } from './premium-sites';

type ViewListener = (view: ViewFootprint) => void;
/** Vymýcený les vsi (null = žádný) – minimapa ho kreslí jako paseku. */
type ClearedListener = (cleared: ClearedForest | null) => void;

/** Žádné stromy v pásech pokračování stezek (`continuationTrees`). */
const NO_IDS: ReadonlySet<number> = new Set();

/** 3D scéna krajiny – obyčejná třída bez Reactu (adaptér zobrazení). */
export type { SceneProgress, SceneStep } from './landscape-build';
export type { DayClock } from './scene-atmosphere';
export type { ViewFootprint } from './scene-projection';

export class LandscapeScene {
  /** Kurzor, kliknutí a výběr, pick terénu (scene-pointer.ts). */
  private readonly pointer: ScenePointer;
  private readonly viewListeners = new Set<ViewListener>();
  private readonly clearedListeners = new Set<ClearedListener>();
  /** Výběr rozhraní – vybraný člověk, spřežení a vůz (scene-selection.ts). */
  private readonly selection: SceneSelection;
  /** Vojsko, boj a mlha války (scene-war.ts). */
  private readonly war: SceneWarView;
  /** Výšková síť terénu (i s úpravami vozových cest). */
  private surface: RenderSurface | null = null;
  /** Poslední náhled vozové cesty – pro stejnou ves a cestu se nepočítá znovu. */
  private wagonPlan: { key: string; plan: WagonRoadPlan } | null = null;
  /** Vymýcený les podle posledního stavu vsi (applyVillage). */
  private cleared: ClearedForest | null = null;
  /** Mapa rodu nebo vazala – stezka pokračuje nad mlhou (`setFriendlyMap`). */
  private friendlyMap = false;
  /**
   * Mřížka pochodu pro kurzor rozkazu (`marchGrid`) – znovu jen se změnou jejích vstupů; `key` –
   * obsah os cest (`roadsKey`), `village` – stav vsi, pro který klíč platí.
   */
  private cursorGrid: {
    landscape: Landscape;
    obstacles: ObstacleLayer | null;
    cleared: ClearedForest | null;
    village: SceneVillage | null;
    key: string;
    grid: MarchGrid;
  } | null = null;
  private highlight: SelectionHighlight | null = null;
  /** Vývojový překryv úseků hospodářství (fields.md – Hospodaření podle polohy domů). */
  private holdings: HoldingsOverlay | null = null;
  private holdingSectors: readonly HoldingsOverlaySector[] | null = null;
  /** Hranice stávajících objektů – jen při malování pole, sadu a hřbitova. */
  private outlines: PlacementOutlines | null = null;
  private groundHeight: ((x: number, z: number) => number) | null = null;
  private readonly resizeObserver: ResizeObserver;
  /** Klidová smyčka – kreslí jen při změně (`requestRender`), takt animací (scene-loop.ts). */
  private readonly loop: SceneLoop;
  private landscape: Landscape | null = null;
  private terrain: Mesh | null = null;
  /** Terén s přepočtem ztmavení pod vykácenými stromy. */
  private terrainGround: TerrainMesh | null = null;
  /** Plocha korun vnitřku lesa – nad pasekou zapadne pod zem. */
  private canopy: ForestCanopy | null = null;
  private water: WaterSurface | null = null;
  /** Ozdobné ryby a ptáci – hýbou se jako voda, dokud jsou v záběru. */
  private fauna: Fauna | null = null;
  private rtsCamera: RtsCamera | null = null;
  private rendering = false;
  private disposed = false;
  /** Poslední kostely od Reactu – použijí se i pro ves vytvořenou později. */
  private churchList: readonly SceneChurch[] = [];
  /** Zvuky krajiny – vznikají až po přípravě scény. */
  private ambient: AmbientSound | null = null;
  private soundEnabled = true;
  /** Vrhače stínu – stínová mapa slunce a co na ni čeká (shadow-casters.ts). */
  private readonly casters = new ShadowCasters();
  /** Roční období, světlo dne, déšť, bouřka a smršť (scene-atmosphere.ts). */
  private readonly atmosphere: SceneAtmosphere;
  /** Stromy, keře a kameny krajiny, které ves odstranila nebo vykácela (a ozdoby pod stavbami). */
  private readonly hider = new InstanceHider((mesh, matrices, hidden, colors) =>
    this.culling?.setInstances(mesh, matrices, hidden, colors),
  );
  /**
   * Ořez stromů, dekorací, impostorů, lesa vsi, pařezů a stromů u cest podle záběru po čtvercích
   * (scenery-culling.ts) – kamera kreslí jen instance čtverců v záběru, stínová mapa všechny.
   */
  private culling: SceneryCulling | null = null;
  /** Vrstva překážek krajiny (herní data – stejná jako na serveru). */
  private obstacles: ObstacleLayer | null = null;
  /** Stromy v pásech pokračování stezek – paměť podle vrstvy a pásů. */
  private continuationIds: { layer: ObstacleLayer; key: string; ids: Set<number> } | null = null;
  /** Pařezy a nálet po pokácených stromech. */
  private felled: FelledTrees | null = null;
  private logPile: LogPile | null = null;
  private stonePiles: StonePiles | null = null;
  private clearingSlash: ClearingSlash | null = null;
  /** Ohně pálení paseky na hromadách větví (clearing-fire-renderer.ts). */
  private clearingFire: ClearingFireRenderer | null = null;
  /** Požár (disasters.md – Požár, Ve scéně): plameny hořících domů a vědra řetězu hašení. */
  private houseFire: ClearingFireRenderer | null = null;
  private fireBuckets: FireBuckets | null = null;
  /** Prvky prémiové krajiny (premium-sites.ts) – obtisky, přístaviště, kůly, úly, tůňky. */
  private premiumSites: PremiumSites | null = null;
  private village: VillageRenderer | null = null;
  /** Domácí zvířata vsi (ozdoba) – slepice u obydlí, stáda na loukách a v lese. */
  private livestock: VillageLivestock | null = null;
  /** Divoká zvěř u vsi (wildlife.md – Ve scéně) – terén sdílí s dobytkem. */
  private wildlife: VillageWildlife | null = null;
  /** Lidé ve vsi – kde ves dnes pracuje (rozdělení práce dne, villagers.md). */
  private villagers: VillageVillagers | null = null;
  /** Vyšlapané pěšiny vsi (paths.md) – lidé po nich chodí. */
  private paths: VillagePaths | null = null;
  /** Poslední stav vsi od rozhraní – vykreslí se, jakmile je krajina hotová. */
  private villageState: SceneVillage | null = null;
  /** Výjezdy vojvody na mapě a koně jejich jezdců (ohrada je nekreslí). */
  private journeyList: readonly SceneJourney[] = [];
  private journeyHorses: ReadonlySet<number> = new Set();
  /** Muži vsi, kteří přijíždějí z výjezdu do dvorce (expedition-choreo.ts) – den rodiny je nekreslí. */
  private arrivingMen: ReadonlySet<number> = new Set();
  /** Koně, které ohrada naposled nekreslila (e2e). */
  private awayHorses: ReadonlySet<number> = new Set();
  /** Ves, jak přišla ze serveru – `villageState` je doplněná o běžící činnosti (`activities`). */
  private villageSource: SceneVillage | null = null;
  /** Karavany a lov, které ve skutečném čase ještě běží (activity-memory.ts). */
  private readonly activities = new ActivityMemory();
  private placement: ActivePlacement | null = null;
  /** Jámy obydlí – terén a obtisky se v nich prořezávají (pit-cut.ts). */
  private readonly pitCuts = new PitCuts();
  private worldClock: WorldClock | null = null;
  /** Vývojové ukázky: vlastní okno herního dne pro práci za den (orba, svoz – ladicí). */
  private workDayClock: ((day: number) => { startMs: number; endMs: number }) | null = null;
  private smokeAlways = false;
  /** Vnitřek lesa – v zimě vrhá stín ze zimního atlasu (holé koruny). */
  private impostorForest: ImpostorForest | null = null;
  /** Vývojový ukazatel výkonu (jen /dev/landscape – `enablePerfStats`). */
  private perf: ScenePerf | null = null;
  /** Pole dostala pás pěšin ze stálých tras před první stavbou (`applyVillage`). */
  private pathTrackPrimed = false;
  /** Odložené předání pásu pěšin dne polím (`VillagePaths.onChange`). */
  private pathTrackTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    readonly renderer: RendererName,
  ) {
    this.loop = new SceneLoop(engine, scene, () => this.perf);
    this.atmosphere = new SceneAtmosphere({
      scene,
      requestRender: () => this.loop.requestRender(),
      reducedMotion: () => this.loop.reducedMotion,
      casters: this.casters,
      worldClock: () => this.worldClock ?? OFFICIAL_WORLD,
      village: () => this.villageState,
      camera: () => this.rtsCamera?.camera ?? null,
      villageRenderer: () => this.village,
      impostorForest: () => this.impostorForest,
      water: () => this.water,
      fauna: () => this.fauna,
      ambient: () => this.ambient,
    });
    this.resizeObserver = new ResizeObserver(() => {
      engine.resize();
      this.loop.renderBurst(300);
    });
    this.resizeObserver.observe(canvas);
    this.atmosphere.updateSeason(true);
    this.selection = new SceneSelection({
      villagers: () => this.villagers,
      villageRenderer: () => this.village,
    });
    this.war = new SceneWarView({
      scene,
      canvas,
      requestRender: () => this.loop.requestRender(),
      reducedMotion: () => this.loop.reducedMotion,
      camera: () => this.rtsCamera?.camera ?? null,
    });
    this.pointer = new ScenePointer({
      scene,
      canvas,
      engine,
      camera: () => this.rtsCamera,
      landscape: () => this.landscape,
      terrain: () => this.terrainGround,
      placement: () => this.placement,
      perf: () => this.perf,
      groundHeight: () => this.groundHeight,
      village: () => this.villageState,
      villageRenderer: () => this.village,
      villagers: () => this.villagers,
      wildlife: () => this.wildlife,
      logPiles: () => this.logPile?.pickable() ?? [],
      riderHit: (x, y, project) => this.war.riderHit(x, y, project),
    });
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
    // a schová opakování textur v dálce. Hustotu a barvu nastavuje roční období.
    scene.fogMode = Scene.FOGMODE_EXP2;
    // Úprava obrazu jako v 0 A.D. (temperate: kontrast 1,05) – sytější stíny a světla.
    scene.imageProcessingConfiguration.contrast = BASE_CONTRAST;
    scene.skipPointerMovePicking = true;
    // Obloha a slunce jako v 0 A.D. (biom temperate). Slunce je níž než v poledne (≈ 35°) –
    // zvlnění terénu je tak lépe vidět. Barvy a síla světel podle ročního období (konstruktor).
    new HemisphericLight('sky', new Vector3(0.2, 1, 0.1), scene);
    new DirectionalLight(
      'sun',
      new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
      scene,
    );
    return new LandscapeScene(canvas, engine, scene, renderer);
  }

  /**
   * Postaví scénu krajiny. Mezi náročnými kroky hlásí průběh (`SceneStep` – rozhraní z nich dělá
   * značky User Timing `scene:<krok>`) a nechá prohlížeč překreslit stránku, aby ukazatel
   * načítání nezamrzl. Kroky jdou v pevném pořadí – pořadí vzniku meshů je i pořadí kreslení.
   */
  async setLandscape(
    landscape: Landscape,
    onProgress: (progress: SceneProgress) => void = () => undefined,
  ): Promise<void> {
    if (this.disposed) return;
    this.landscape = landscape;
    // dřív než první modely – zařadí každý mesh s nehybnými instancemi, i les vsi a pařezy
    this.culling?.dispose();
    this.culling = new SceneryCulling(this.scene, chunkGrid(landscape.size * landscape.cellSizeM));
    const report = async (step: SceneStep, done: number): Promise<void> => {
      onProgress({ step, done });
      await nextPaint();
    };
    await report('terrain', 0.3);
    if (this.disposed) return;
    const ground = sceneGround(landscape);
    this.surface = ground.surface;
    this.groundHeight = ground.groundHeight;
    const village = this.buildVillageRenderer(landscape, ground);
    this.buildOverlays(ground);
    await report('forest', 0.4);
    if (this.disposed) return;
    const plan = planScenery(landscape, ground);
    this.obstacles = plan.obstacles;
    if (village.setObstacles(plan.obstacles)) this.loop.renderWhenReady();
    this.buildForestRemnants(landscape, ground, plan.obstacles);
    this.buildWeatherAndFires(landscape, ground);
    this.buildVillageLife(landscape, ground, plan);
    await report('surface', 0.5);
    if (this.disposed) return;
    const camera = this.buildTerrain(landscape, ground, plan);
    await report('models', 0.6);
    if (this.disposed) return;
    let loaded = 0;
    const sceneryMeshes = await loadSceneryModels(
      this.scene,
      camera.camera,
      plan,
      ground.groundHeight,
      {
        loaded: () => onProgress({ step: 'models', done: 0.6 + 0.075 * ++loaded }),
        impostorsChanged: (shadowAtlasChanged) => {
          if (shadowAtlasChanged) this.casters.refresh();
          this.loop.renderWhenReady();
        },
        impostorsLoaded: (forest) => {
          this.impostorForest = forest;
          const light = this.atmosphere.light;
          if (light) forest?.setTone(light.tone);
        },
        faunaLoaded: (fauna) => {
          this.fauna = fauna;
          this.applyFaunaAbundance();
        },
      },
    );
    if (this.disposed) return;
    // Odstraněné a vykácené překážky se skryjí podle id, ozdoby pod stavbami podle polohy paty.
    this.hider.track(sceneryMeshes);
    this.casters.create(this.scene, this.terrain, landscape.size * landscape.cellSizeM);
    this.atmosphere.updateSeason(true);
    this.applyVillage();
    await report('shaders', 0.92);
    if (this.disposed) return;
    await this.scene.whenReadyAsync();
    onProgress({ step: 'shaders', done: 1 });
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    this.startAmbient(ground, plan.field);
    this.loop.renderBurst(1500);
    this.loop.start(() => this.frame());
  }

  /** Krok `terrain`: renderer vsi – stavby, pole, cesty, dým; dostane hodiny, období a vynucení. */
  private buildVillageRenderer(landscape: Landscape, ground: SceneGround): VillageRenderer {
    const village = new VillageRenderer(this.scene, {
      groundHeight: ground.groundHeight,
      decalHeight: ground.decalHeight,
      addShadowCaster: (mesh) => this.casters.addVillage(mesh),
      onAsyncChange: () => {
        this.casters.refresh();
        this.loop.renderWhenReady();
      },
      requestRender: () => this.loop.renderWhenReady(),
      pitCuts: this.pitCuts,
      sunDirection: SUN_DIRECTION,
      landscape,
      walkable: (x, z) => this.livestock?.isWalkable(x, z) ?? true,
      animated: () => !this.loop.reducedMotion,
      // vybrané spřežení nebo vůz (villagers.md – Výběr postavy) – co dělá, panel výběru
      onDraftState: (state) => this.selection.draftChanged(state),
    });
    this.village = village;
    if (this.churchList.length > 0) village.setChurches(this.churchList);
    if (this.worldClock) village.setWorldClock(this.worldClock);
    if (this.workDayClock) village.setPloughClock(this.workDayClock);
    const look = this.atmosphere.look;
    if (look) village.setSeason(this.atmosphere.seasonDayOfYear(), look.snow);
    village.setSmokeAlways(this.smokeAlways);
    village.setDisasterDay(this.atmosphere.forcedDisasterDay);
    return village;
  }

  /** Krok `terrain`: obrysy při malování, zvýraznění výběru a vývojový překryv hospodářství. */
  private buildOverlays(ground: SceneGround): void {
    this.outlines = new PlacementOutlines(this.scene, ground.decalHeight, () => {
      this.loop.requestRender();
    });
    this.highlight = new SelectionHighlight(this.scene, ground.decalHeight);
    this.holdings = new HoldingsOverlay(this.scene, ground.decalHeight);
    this.holdings.show(this.holdingSectors);
  }

  /** Krok `forest`: pařezy a nálet, hromady klád a kamení, větve na pasece. */
  private buildForestRemnants(
    landscape: Landscape,
    ground: SceneGround,
    obstacles: ObstacleLayer,
  ): void {
    const { groundHeight } = ground;
    this.felled = new FelledTrees(this.scene, {
      groundHeight,
      addShadowCaster: (mesh) => this.casters.add(mesh),
      onAsyncChange: () => {
        this.casters.refresh();
        this.loop.renderWhenReady();
      },
    });
    // hromada klád u vsi (forest.md) – vlastní síť kmenů, kolik klád, tolik kmenů
    this.logPile?.dispose();
    this.logPile = new LogPile(this.scene, {
      landscape,
      layer: obstacles,
      groundHeight,
      addShadowCaster: (mesh) => this.casters.add(mesh),
    });
    // hromady kamení u cest a lomy na výchozech (fortifications.md – Kámen)
    this.stonePiles?.dispose();
    this.stonePiles = new StonePiles(this.scene, {
      groundHeight,
      addShadowCaster: (mesh) => this.casters.add(mesh),
      onAsyncChange: () => {
        this.casters.refresh();
        this.loop.renderWhenReady();
      },
    });
    // hromady větví na pasece a ohořelé zbytky na spálenině (forest.md – Klučení lesa pro pole)
    this.clearingSlash?.dispose();
    this.clearingSlash = new ClearingSlash(this.scene, {
      layer: obstacles,
      groundHeight,
      addShadowCaster: (mesh) => this.casters.add(mesh),
    });
  }

  /**
   * Krok `forest`: déšť a bouřka, vojsko, smršť (v tomto pořadí – pořadí meshů), ohně pálení
   * paseky, požár domů a vědra.
   */
  private buildWeatherAndFires(landscape: Landscape, ground: SceneGround): void {
    const { groundHeight, decalHeight } = ground;
    // ohně pálení na hromadách větví (forest.md – Klučení lesa pro pole – postup, bod 3)
    this.clearingFire?.dispose();
    this.atmosphere.buildRainAndStorm(landscape, decalHeight);
    this.war.build(landscape, decalHeight);
    this.atmosphere.buildTornado(decalHeight);
    this.clearingFire = new ClearingFireRenderer(this.scene, { groundHeight });
    if (this.worldClock) this.clearingFire.setWorldClock(this.worldClock);
    // požár – plameny domů ohněm paseky s vlastním rozvrhem, den světa jako pohromy (vývojově vynucený)
    this.houseFire?.dispose();
    this.houseFire = new ClearingFireRenderer(this.scene, {
      groundHeight,
      kind: houseFireKind(() => this.atmosphere.disasterDay()),
    });
    this.fireBuckets?.dispose();
    this.fireBuckets = new FireBuckets(this.scene, { groundHeight });
  }

  /** Krok `forest`: domácí zvířata, divoká zvěř, lidé ve vsi a vyšlapané pěšiny. */
  private buildVillageLife(landscape: Landscape, ground: SceneGround, scenery: SceneryPlan): void {
    const { surface, groundHeight, decalHeight } = ground;
    const { field, obstacles } = scenery;
    // Domácí zvířata vsi – rozmístí se podle vsi (applyVillage), modely až s prvním zvířetem.
    this.livestock?.dispose();
    this.livestock = new VillageLivestock(this.scene, {
      landscape,
      field,
      stream: surface.stream,
      relief: scenery.relief,
      groundHeight: decalHeight,
      baseUrl: '/models/fauna/',
      onLoaded: () => this.loop.renderWhenReady(),
      // dobytek karavan výprav jde v herním čase jako lidé (caravan.ts)
      dayWindow: (day) => this.village?.gameDayWindow(day) ?? null,
    });
    // Divoká zvěř – na okraji lesa a loukách kolem vsi, před lidmi utíká; terén jako dobytek.
    this.wildlife?.dispose();
    this.wildlife = new VillageWildlife(this.scene, {
      landscape,
      groundHeight: decalHeight,
      ground: (village) => this.livestock?.groundFor(village) ?? null,
      threats: () => this.villagers?.figureSpots() ?? new Float32Array(0),
      baseUrl: '/models/fauna/',
      onLoaded: () => this.loop.renderWhenReady(),
    });
    // Lidé ve vsi – kde ves dnes pracuje; schůdnou zemi sdílejí se zvířaty, děti pasou stáda.
    this.villagers?.dispose();
    this.villagers = new VillageVillagers(this.scene, {
      layer: obstacles,
      ground: (village) => this.livestock?.walkGroundFor(village) ?? null,
      groundHeight: decalHeight,
      baseUrl: '/models/people/',
      herds: (nowMs) => this.livestock?.herdViews(nowMs) ?? [],
      onLoaded: () => this.loop.renderWhenReady(),
      // karavany výprav jdou v herním čase (caravan.ts) – okno herního dne jako orba za den
      dayWindow: (day) => this.village?.gameDayWindow(day) ?? null,
      // povodeň (villagers.md – Události): na rozlitou vodu se nechodí, kdo tam je, jde domů
      flooded: (x, z, nowMs) => this.atmosphere.floodedAt(x, z, nowMs),
      // pohřby (cemetery.md – Pohřeb ve scéně): máry, hranice a oheň kreslí ves
      onFunerals: (plans) => {
        if (this.village?.setFunerals(plans, Date.now())) this.loop.renderWhenReady();
      },
      // svatby (kinship.md – Svatba ve scéně): oheň obřadu a věnec na dubu kreslí ves
      onWeddings: (plans) => {
        if (this.village?.setWeddings(plans, Date.now())) this.loop.renderWhenReady();
      },
      // porážka (diet.md – Porážka ve scéně): kozlina, mršina a kýty kreslí ves
      onSlaughter: (plan) => {
        if (this.village?.setSlaughter(plan, Date.now())) this.loop.renderWhenReady();
      },
      // vybraný člověk (villagers.md – Výběr postavy) – co dělá, panel postavy
      onPersonState: (state) => this.selection.personChanged(state),
      // noví lidé u spřežení a vozů – výběr oráče, honáka či vozky jde za jejich spřežením
      onCrew: () => {
        this.selection.syncDraft();
        // jezdečtí koně jdou s jezdci (riders.ts) – plány jízd z plánu postav
        if (this.livestock?.setRides(this.villagers?.rides() ?? [], Date.now())) {
          this.loop.renderWhenReady();
        }
        // psi dvorce (dogs.ts) – u dvorce, s lovci a s hlídkou; plány z plánu postav
        if (this.livestock?.setDogs(this.villagers?.dogs() ?? [], Date.now())) {
          this.loop.renderWhenReady();
        }
        // odjezd a příjezd výjezdu vojvody (expedition-choreo.ts) – místa dvorce z plánu postav
        this.war.setExpeditionYard(this.villagers?.yard() ?? null);
        this.war.setChoreoPeople(this.villagers?.choreoPeople() ?? null);
      },
      // lovci jdou k okraji lesa u zvěře (wildlife.md – Ve scéně) – zvěř se plánuje před postavami
      huntSpot: (target) => this.wildlife?.huntSpot(target) ?? null,
    });
    this.villagers.select(this.selection.personId);
    this.selection.syncDraft();
    // Vyšlapané pěšiny – síť se počítá z vsi a krajiny (odloženě), lidé po ní chodí; pevné cesty
    // a stromy u nich z dat vsi (roads.md).
    this.paths?.dispose();
    this.pathTrackPrimed = false;
    this.paths = new VillagePaths(this.scene, {
      landscape,
      layer: obstacles,
      decalHeight,
      groundHeight,
      // původní terén (bez úvozů a náspů vozových cest) – hlína na svazích podle rozdílu
      baseHeight: (x, z) => this.terrainGround?.baseHeightAt(x, z) ?? decalHeight(x, z),
      pitCuts: this.pitCuts,
      addShadowCaster: (mesh) => this.casters.addVillage(mesh),
      // nová síť pěšin mění jen obtisky a trasy postav – stromy u cest obnoví stíny samy
      // (refreshShadows), stínová mapa se kvůli pěšinám nepřekresluje
      onChange: () => {
        this.villagers?.setPaths(this.paths?.paths() ?? null, Date.now());
        this.loop.renderWhenReady();
        // Pod pěšinami dne obilí neroste – bloky polí se přestaví jen s novou sítí pěšin, a to až
        // v další úloze: výpočet sítě a přestavba polí jsou dvě kratší úlohy, mezi které se vejde
        // snímek (pohyb kamery se nezasekne na jejich součet).
        if (this.pathTrackTimer !== null) clearTimeout(this.pathTrackTimer);
        this.pathTrackTimer = setTimeout(() => {
          this.pathTrackTimer = null;
          if (this.disposed) return;
          if (this.village?.setPathTrack(this.paths?.pathTrack() ?? null))
            this.loop.renderWhenReady();
        }, 0);
      },
      requestRender: () => this.loop.renderWhenReady(),
      refreshShadows: () => {
        this.casters.refresh();
        this.loop.renderWhenReady();
      },
    });
  }

  /** Krok `surface`: síť terénu, voda, prvky prémiové krajiny, koruny lesa a kamera. */
  private buildTerrain(landscape: Landscape, ground: SceneGround, plan: SceneryPlan): RtsCamera {
    const { surface, groundHeight, decalHeight } = ground;
    const { field } = plan;
    this.terrainGround = createTerrainMesh(this.scene, landscape, surface, {
      field,
      trees: plan.trees,
    });
    this.terrain = this.terrainGround.mesh;
    if (this.terrain.material) applyPitCut(this.terrain.material, this.pitCuts);
    this.water = createWaterMesh(this.scene, surface);
    this.premiumSites?.dispose();
    this.premiumSites = new PremiumSites(this.scene, landscape, plan.premium, {
      decalHeight,
      groundHeight,
      waters: surface.stream,
      addShadowCaster: (mesh) => this.casters.addVillage(mesh),
      requestRender: () => this.loop.renderWhenReady(),
    });
    this.canopy = createForestCanopy(this.scene, surface, field);
    const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
    const camera = createRtsCamera(this.scene, this.canvas, {
      halfExtent: (landscape.size * landscape.cellSizeM) / 2,
      start: { x: site.worldX, z: site.worldZ },
      groundHeight,
      // levé tažení posouvá krajinu, jen když se nic neumisťuje (malování pole tahem maluje)
      leftDragPans: () => this.placement === null,
    });
    this.rtsCamera = camera;
    return camera;
  }

  /**
   * Krok `shaders` (konec): zvuky krajiny se stahují až teď – nezdrží přípravu scény; mix sleduje
   * pohled kamery ve `frame()`.
   */
  private startAmbient(ground: SceneGround, field: SceneryPlan['field']): void {
    this.ambient = new AmbientSound({
      environment: { stream: ground.surface.stream, rivers: ground.surface.rivers, forest: field },
      enabled: this.soundEnabled,
      onStateChange: (state) => {
        this.canvas.dataset.sound = state;
      },
    });
    const season = this.atmosphere.look;
    if (season) this.ambient.setSeason({ ...season.sound, ice: season.ice });
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
  setVillage(source: SceneVillage): void {
    if (this.disposed) return;
    this.villageSource = source;
    // kostely vsi (churches.md – Scéna) – ves bez kostela nic nemění
    if (source.churches || this.churchList.length > 0) this.setChurches(source.churches ?? []);
    // karavany a lov se dohrají ve skutečném čase, i když je data dalšího dne už nemají
    const village = this.activities.apply(
      source,
      Date.now(),
      (day) => this.village?.gameDayWindow(day) ?? null,
    );
    this.villageState = village;
    this.syncLitBands();
    this.journeyHorses = journeyHorseIds(village, this.journeyList);
    this.applyVillage();
    this.atmosphere.villageChanged();
  }

  /**
   * Válka ve scéně (war.md – Ve scéně): poslední snímek boje po taktu, pochod, útěk vsi, odehnané
   * stádo a mlha války; null – nic. Mezi takty se muži posouvají plynule v `animate()`.
   */
  setWar(war: SceneWar | null): void {
    this.war.set(war);
  }

  /** Meshe vojska, které se kreslí, a počty instancí (e2e, měření). */
  armyStats(): { name: string; count: number }[] {
    return this.war.stats();
  }

  /**
   * Výjezdy vojvody na mapě vsi (journey.md – Scéna vsi): vlastní i cizí jezdci, praporek cíle;
   * koně jezdců vlastní vsi ohrada nekreslí.
   */
  setJourneys(list: readonly SceneJourney[]): void {
    this.journeyList = list;
    this.journeyHorses = journeyHorseIds(this.villageState, list);
    this.war.setJourneys(list);
  }

  /**
   * Mlha cizí mapy výjezdu (journey.md – Scéna cizí mapy): závoj jako při tažení – odkryté ze stopy
   * rodu (`SeenCell.trail`) šeré, okolí vlastních jezdců jasné; null – bez mlhy. Ve scéně tažení
   * stopa jen přidá odkryté k mlze války (Úloha 12b).
   */
  setJourneyFog(trail: readonly (readonly [number, number])[] | null): void {
    this.war.setJourneyFog(trail);
  }

  /**
   * Mapa rodu nebo vazala (Martin 16. 11. 2026: „Když je to mapa rodu nebo vazala, ať je vidět
   * celá, stejným způsobem jako mapa vlastní. Pokud to bude mapa nepřítele nebo neutrála, ať je
   * tam fog of war“): pokračování zemských stezek (`SceneVillage.trailContinuations`) je nad
   * závojem celé; na cizí mapě (výchozí) zůstává pod ním jako ostatní krajina. Nic jiného se
   * nemění.
   */
  setFriendlyMap(friendly: boolean): void {
    this.friendlyMap = friendly;
    this.syncLitBands();
  }

  /** Pásy pokračování stezek nad závojem podle `friendlyMap` a stavu vsi scény. */
  private syncLitBands(): void {
    const bands = this.friendlyMap ? swathBands(this.villageState?.trailContinuations) : [];
    this.war.setLitBands(bands.length > 0 ? bands : null, swathBandsKey(bands));
  }

  /** Mlha v bodě (e2e): neobjevené, objevené (šeré), v dohledu; bez závoje null. */
  fogAt(x: number, z: number): 'hidden' | 'explored' | 'seen' | 'lit' | null {
    return this.war.fogAt(x, z);
  }

  /** Výjezdy ve scéně pro e2e – muži, praporek, dny na hodinách, odjezd a koně mimo ohradu. */
  journeyStats(): ReturnType<SceneWarView['journeyStats']> & { awayHorses: number[] } {
    return { ...this.war.journeyStats(), awayHorses: [...this.awayHorses] };
  }

  /** Ves pro postavy – bez mužů, kteří přijíždějí z výjezdu do dvorce (expedition-choreo.ts). */
  private peopleVillage(): SceneVillage | null {
    return this.villageState ? withoutMen(this.villageState, this.arrivingMen) : null;
  }

  /**
   * Kostely vsi (churches.md – Scéna): hotové i staveniště podle postupu. Jde volat kdykoli, i před
   * dokončením `setLandscape` – kostely se ukážou s vsí. Prázdný seznam = beze změny pro ves.
   */
  setChurches(list: readonly SceneChurch[]): void {
    if (this.disposed) return;
    this.churchList = list;
    if (this.village?.setChurches(list)) this.loop.renderWhenReady();
  }

  setDisasterDay(day: number | null): void {
    this.atmosphere.setDisasterDay(day);
    // požár – dým a plameny podle vynuceného dne
    this.village?.setDisasterDay(day);
    this.village?.animateSmoke(Date.now(), null);
    if (this.houseFire?.animate(Date.now(), null)) this.loop.requestRender();
  }

  /** Vytyčení tras vozových cest (vývojová ukázka – osy bez plánu); prázdné zruší. */
  setWagonPreview(lines: readonly (readonly { x: number; z: number }[])[]): void {
    this.paths?.setWagonPreview(lines);
    this.loop.renderWhenReady();
  }

  /**
   * Náhled vozové cesty (roads.md – Vozová cesta) pro cestu hráče `roadId`: stejná funkce jako
   * server při zahájení stavby (`planWagonRoad`) nad vsí scény, krajinou a vrstvou překážek scény;
   * trasa se vytyčí kolíky a provázkem (`show`). Pro stejnou ves a cestu z mezipaměti. `null` –
   * náhled zruší. Bez krajiny null.
   */
  previewWagonRoad(roadId: number | null, show = true): WagonRoadPlan | null {
    if (roadId === null || !this.landscape || !this.villageState) {
      this.paths?.setWagonPreview([]);
      return null;
    }
    const village = this.villageState;
    const cached = this.wagonPlan;
    const key = wagonPreviewKey(village, roadId);
    const plan =
      cached && cached.key === key
        ? cached.plan
        : planWagonRoad({
            landscape: this.landscape,
            layer: this.obstacles,
            changes: village.obstacles ?? NO_OBSTACLE_CHANGES,
            claimed: new Set(village.reservedTrees ?? []),
            village,
            roads: (village.roads ?? []).map((r) => ({
              ...r,
              ...(r.cartTrips ? { cartTraffic: [r.cartTrips] } : {}),
            })),
            earthworks: village.earthworks ?? [],
            roadId,
            home: village.home ?? null,
            woodLogs: village.woodLogs ?? 0,
          });
    this.wagonPlan = { key, plan };
    this.paths?.setWagonPreview(show && plan.ok ? [plan.profile] : []);
    this.loop.renderWhenReady();
    return plan;
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
      this.loop.requestRender();
    };
    const controlled: PlacementHandlers = {
      onConfirm: (result, keepPlacing) => {
        if (!keepPlacing && this.placement === controller) {
          this.placement = null;
          this.outlines?.hide();
        }
        handlers.onConfirm(result, keepPlacing);
      },
      onCancel: () => {
        if (this.placement === controller) {
          this.placement = null;
          this.outlines?.hide();
        }
        handlers.onCancel();
      },
      onPreview: handlers.onPreview ? (preview) => handlers.onPreview?.(preview) : undefined,
    };
    const controller = createPlacement(
      mode,
      {
        scene: this.scene,
        canvas: this.canvas,
        landscape,
        village,
        pickGround: (x, y) => this.pointer.pickGround(x, y),
        cameraAlpha: () => camera.camera.alpha,
        requestRender,
        roads: () => this.villageState?.roads ?? [],
      },
      controlled,
    );
    this.placement = controller;
    if (mode.kind === 'squares' || mode.kind === 'fort-points') {
      this.outlines?.show(this.villageState);
    } else {
      this.outlines?.hide();
    }
    if (mode.kind !== 'squares' && mode.kind !== 'fort-points' && mode.kind !== 'church') {
      // Model ducha se načte (jednou) a pak naskočí pod kurzorem.
      const models =
        mode.kind === 'sacred'
          ? village.loadSacredModels()
          : mode.kind === 'workshop'
            ? Promise.all([village.loadModels(), village.loadCraftModels()])
            : village.loadModels();
      void models.then(() => {
        if (this.placement === controller) this.pointer.repick();
      });
    }
    this.pointer.repick();
    this.loop.renderWhenReady();
  }

  /**
   * Svět, podle jehož herního dne se v obydlích topí (dým ráno a večer). Bez volání ostrý svět;
   * testovací svět (WORLD_START, WORLD_END) sem předá rozhraní.
   */
  setWorldClock(world: WorldClock): void {
    this.village?.setWorldClock(world);
    this.clearingFire?.setWorldClock(world);
    this.houseFire?.setWorldClock(world);
    this.worldClock = world;
    this.atmosphere.updateSeason(true);
    // skok v čase mění herní den – ohně a kouř se přestaví a jednou nakreslí i bez změny vsi
    if (this.updateClearingFires()) {
      this.clearingFire?.animate(Date.now(), null);
      this.loop.renderWhenReady();
    }
    // karavany a pohřby jdou podle okna herního dne – rozmístit lidi podle nových hodin
    if (this.villagers?.clockChanged(Date.now())) this.loop.renderWhenReady();
  }

  /**
   * Vývojová volba: vlastní okno herního dne pro práci za den (orba a svoz projeté za herní den –
   * PLOUGH_DAY_DEBUG), null = z hodin světa. Ukázky bez hodin světa (/dev/landscape) tak vozí
   * zrychleně jako ve hře.
   */
  setWorkDayClock(clock: ((day: number) => { startMs: number; endMs: number }) | null): void {
    this.workDayClock = clock;
    this.village?.setPloughClock(clock);
    if (this.villageSource) this.setVillage(this.villageSource);
    if (this.villagers?.clockChanged(Date.now())) this.loop.renderWhenReady();
  }

  /**
   * Vývojová volba: roční období podle zadaného dne v roce (1–366, i desetinného – plynulé
   * přetáčení), null = zpět podle herního data.
   */
  setSeasonDay(day: number | null): void {
    this.atmosphere.setSeasonDay(day);
  }

  /** Vývojové vynucení deště 0–1 (null = dny deště podle seedu dne v deštivém létě). */
  setRainOverride(amount: number | null): void {
    this.atmosphere.setRainOverride(amount);
  }

  /**
   * Den a noc (zatím jen vývojová stránka): hodiny dne, null = bez denní doby (pevné odpolední
   * slunce jako dřív). Slunce pak jde po obloze plynule v taktu animací (DAY_LIGHT_MS), při
   * omezeném pohybu po krocích jednou za sekundu; stínová mapa se obnoví po SHADOW_STEP_DEG.
   */
  setDayClock(clock: DayClock | null): void {
    this.atmosphere.setDayClock(clock);
  }

  /** Vývojová volba: vyšlapané pěšiny a pevné cesty (i se stromy u nich) vidět / skrýt. */
  setPathsVisible(visible: boolean): void {
    this.paths?.setVisible(visible);
  }

  /** Vývojová volba: teplotní mapa provozu na pěšinách (cest za den). */
  setPathHeatmap(enabled: boolean): void {
    this.paths?.setHeatmap(enabled);
  }

  /** Vývojová volba: obrysy úseků hospodářství v barvách domů (null = skrýt). */
  setHoldingsOverlay(sectors: readonly HoldingsOverlaySector[] | null): void {
    this.holdingSectors = sectors;
    this.holdings?.show(sectors);
    this.loop.renderWhenReady();
  }

  /** Čísla posledního výpočtu pěšin (doba, buňky, trasy, pěšiny, cesty, stromy); bez výpočtu null. */
  pathStats(): PathStats | null {
    return this.paths?.stats ?? null;
  }

  /** Vývojový ukazatel výkonu – zapne měření (něco stojí, proto jen na vývojové stránce). */
  enablePerfStats(): void {
    if (this.disposed) return;
    this.perf ??= new ScenePerf(this.scene, this.engine, this.renderer);
  }

  /** Čísla výkonu scény; bez `enablePerfStats` null. */
  perfStats(): ScenePerfStats | null {
    return this.perf?.stats(performance.now(), this.loop.animationFps()) ?? null;
  }

  /** Vývojová volba: dým ze všech hotových obydlí pořád (kontrola vzhledu dýmu). */
  setSmokeAlways(enabled: boolean): void {
    this.smokeAlways = enabled;
    this.village?.setSmokeAlways(enabled);
    if (this.village?.animateSmoke(Date.now(), null)) this.loop.requestRender();
  }

  /** Zruší umisťování (zavolá jeho `onCancel`); bez umisťování nic nedělá. */
  cancelPlacement(): void {
    this.placement?.cancel();
  }

  /** Rozměry kostela z panelu u potvrzení (+/−); mimo umisťování kostela nic nedělá. */
  setChurchDims(dims: ChurchDims): void {
    if (this.placement instanceof ChurchPlacer) this.placement.setDims(dims);
  }

  /** Potvrdí umisťování jako Enter (tlačítko Potvrdit u pole); neprošlé zůstane běžet. */
  confirmPlacement(): void {
    this.placement?.confirm();
  }

  onTileHover(listener: HoverListener): () => void {
    return this.pointer.onTileHover(listener);
  }

  /**
   * Kliknutí do scény mimo umisťování (jako v 0 A.D.): levé na obydlí, díl pole nebo hřbitov ho
   * vybere, na prázdnou zem a pravé výběr zruší (null); s Ctrl (Cmd) nebo Shiftem ohlásí
   * `additive` – rozhraní obydlí přidá k výběru nebo ho ubere; druhé kliknutí řady ohlásí
   * `double` – rozhraní vybere celé pole či sad. Zvýraznění nastaví až rozhraní (`setSelection`).
   */
  onSelect(listener: SelectListener): () => void {
    return this.pointer.onSelect(listener);
  }

  /**
   * Zapne přidávání brány opevnění: levé kliknutí do krajiny pošle bod terénu `handler`, pravé
   * `null` (zrušení); `null` vrací běžný výběr.
   */
  setGatePick(handler: GatePick | null): void {
    this.pointer.setGatePick(handler);
  }

  /**
   * Zapne ovládání vybraných lidí (expeditions.md): pravé kliknutí do krajiny pošle bod terénu
   * `mode.order`, pohyb kurzoru `mode.hover`; `null` vrací běžné pravé tlačítko (zrušení výběru).
   */
  setOrderMode(mode: OrderMode | null): void {
    this.pointer.setOrderMode(mode);
  }

  /** Dvorec vsi scény pro kurzor „Domů“ (`SceneVillage.manorArea`); bez hotového dvorce null. */
  manorArea(): SceneVillage['manorArea'] | null {
    return this.villageState?.manorArea ?? null;
  }

  /**
   * Mřížka pochodu mapy pro kurzor nad místem, kam skupina nedojde (march-cursor.ts): krajina,
   * vrstva překážek, vymýcený les vsi a průseky cest (`cursorRoads` – i kusy stezek ke kraji).
   * Staví se líně při prvním dotazu a znovu jen se změnou vstupů. Bez krajiny null.
   */
  marchGrid(): MarchGrid | null {
    const landscape = this.landscape;
    if (!landscape) return null;
    const village = this.villageState;
    const known = this.cursorGrid;
    const same =
      known !== null &&
      known.landscape === landscape &&
      known.obstacles === this.obstacles &&
      known.cleared === this.cleared;
    if (same && known.village === village) return known.grid;
    // každá aktualizace vsi je nové pole z JSON – mřížka se staví znovu jen se změnou os cest
    const roads = cursorRoads(village);
    const key = roadsKey(roads);
    if (same && known.key === key) {
      known.village = village;
      return known.grid;
    }
    const grid = browserMarchGrid(landscape, this.obstacles, this.cleared, roads);
    this.cursorGrid = {
      landscape,
      obstacles: this.obstacles,
      cleared: this.cleared,
      village,
      key,
      grid,
    };
    return grid;
  }

  /** Střed obydlí (nebo staveniště) `id` ve světě mapy – odkud vyráží skupina z domu; neznámé null. */
  dwellingPoint(id: number): Pos | null {
    const d = this.villageState?.dwellings.find((x) => x.id === id);
    return d ? { x: d.position.x, z: d.position.z } : null;
  }

  /**
   * Zvýrazní vybrané obydlí / pole / hřbitov rámečkem na zemi, vybranou postavu žlutým kroužkem
   * pod nohama (null = nic).
   */
  setSelection(target: VillageTarget | null): void {
    this.selection.target = target;
    this.highlight?.show(this.villageState, target, this.logPile?.pickable() ?? []);
    // lidé: první je „vybraný“ (stav a panel), ostatní mají jen kroužek (expeditions.md – Výběr)
    const people = selectedPeopleIds(target);
    // lidé jiné vsi hráče (`villageId`) postavy ve vsi scény nemají – id osoby platí jen ve vsi
    const village = selectedPeopleVillage(target);
    const home = village === undefined ? people : [];
    this.villagers?.select(home[0] ?? null);
    this.villagers?.selectMore(home.slice(1));
    // lidé na výpravě – kroužek jede s jezdcem (journey.md – Výběr)
    this.war.selectJourneyMen(people, village);
    this.selection.syncDraft();
    this.loop.renderWhenReady();
  }

  /**
   * Co dělá vybrané spřežení nebo vůz (i když je vybraný oráč, honák či vozka – oxen.md, wagons.md)
   * a kdo je u nich – hned ohlásí současný stav, pak jen při změně.
   */
  onDraftState(listener: DraftListener): () => void {
    return this.selection.onDraftState(listener);
  }

  /**
   * Co dělá vybraný člověk (villagers.md – Výběr postavy): jeho postava dne, úsek pochůzky
   * a jestli je vidět – hned ohlásí současný stav, pak jen při změně.
   */
  onPersonState(listener: PersonListener): () => void {
    return this.selection.onPersonState(listener);
  }

  /** Změny záběru kamery (minimapa) – hned ohlásí ten současný, pak jen při změně. */
  onViewChange(listener: ViewListener): () => void {
    this.viewListeners.add(listener);
    const view = this.viewFootprint();
    if (view) listener(view);
    return () => this.viewListeners.delete(listener);
  }

  /**
   * Změny vymýceného lesa (minimapa) – hned ohlásí ten současný, pak jen při znatelné změně
   * (`sameClearing`). Počítá se jednou ve scéně z její vrstvy překážek.
   */
  onClearedForestChange(listener: ClearedListener): () => void {
    this.clearedListeners.add(listener);
    listener(this.cleared);
    return () => this.clearedListeners.delete(listener);
  }

  /**
   * Přesune pohled na bod krajiny (klik do minimapy); s `radiusM` i přiblížení a s `alpha`
   * natočení kamery (vývojový náhled – prvek prémiové krajiny).
   */
  moveCameraTo(x: number, z: number, radiusM?: number, alpha?: number): void {
    this.rtsCamera?.moveTo(x, z);
    const camera = this.rtsCamera?.camera;
    if (camera && radiusM !== undefined) {
      camera.radius = Math.min(
        camera.upperRadiusLimit ?? radiusM,
        Math.max(camera.lowerRadiusLimit ?? radiusM, radiusM),
      );
      camera.inertialRadiusOffset = 0;
    }
    if (camera && alpha !== undefined) {
      camera.alpha = alpha;
      camera.inertialAlphaOffset = 0;
    }
    this.loop.requestRender();
  }

  /** Kam se dívat na porážku (vývojová ukázka): kozlina prvního stanoviště; bez porážky null. */
  slaughterFocus(): { x: number; z: number } | null {
    return this.village?.slaughterFocus() ?? null;
  }

  /**
   * Kam se dívat na pohřeb (vývojová ukázka – cemetery.md, Pohřeb ve scéně): máry v průvodu,
   * jinak hranice, a časy obřadu prvního pohřbu; bez pohřbu null.
   */
  funeralFocus(nowMs = Date.now()): { x: number; z: number; timeline: FuneralTimeline } | null {
    return this.village?.funeralFocus(nowMs) ?? null;
  }

  /**
   * Kam se dívat na svatbu (vývojová ukázka – kinship.md, Svatba ve scéně): průvod, pár u místa
   * obřadu, cesta domů – a plán první svatby; bez svatby null.
   */
  weddingFocus(nowMs = Date.now()): { x: number; z: number; plan: WeddingPlan } | null {
    return this.village?.weddingFocus(nowMs) ?? null;
  }

  /** Kam vrátí pohled klávesa R – ves (první obydlí). */
  setCameraHome(x: number, z: number): void {
    this.rtsCamera?.setHome(x, z);
  }

  /**
   * Postava vybraného člověka na obrazovce (CSS px – testovací háček), nebo null, když není vidět.
   */
  projectPerson(id: number): { x: number; y: number } | null {
    const camera = this.rtsCamera?.camera;
    const spot = this.villagers?.spotOf(id);
    if (!camera || !spot) return null;
    return screenProjector(this.engine, this.canvas, camera)(spot.x, spot.y + 0.9, spot.z);
  }

  /** Testovací háček: jména a připravenost meshů porážky (`slaughter-*`) ve scéně. */
  slaughterMeshes(): { name: string; ready: boolean }[] {
    return this.scene.meshes
      .filter((mesh) => mesh.name.startsWith('slaughter-'))
      .map((mesh) => ({ name: mesh.name, ready: mesh.isReady(true) }));
  }

  /** Meshe divoké zvěře (`wild-*`, připravené ke kreslení) a kusy, které jsou teď vidět. */
  wildAnimals(): {
    meshes: { name: string; ready: boolean }[];
    animals: { species: string; model: string; x: number; z: number }[];
    groups: { species: string; x: number; z: number }[];
  } {
    return {
      groups: this.wildlife?.plannedGroups() ?? [],
      meshes: this.scene.meshes
        .filter((mesh) => mesh.name.startsWith('wild-'))
        .map((mesh) => ({ name: mesh.name, ready: mesh.isReady(true) })),
      animals: this.wildlife?.visibleAnimals() ?? [],
    };
  }

  /** Bod krajiny (x, z) na obrazovce v CSS px plátna, nebo null mimo záběr (testovací háček). */
  projectToScreen(x: number, z: number): { x: number; y: number } | null {
    const camera = this.rtsCamera?.camera;
    if (!camera || !this.groundHeight) return null;
    return groundToScreen(this.engine, this.canvas, camera, x, this.groundHeight(x, z), z);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pathTrackTimer !== null) clearTimeout(this.pathTrackTimer);
    this.viewListeners.clear();
    this.clearedListeners.clear();
    this.selection.dispose();
    this.highlight?.dispose();
    this.holdings?.dispose();
    this.outlines?.dispose();
    this.placement?.dispose();
    this.placement = null;
    this.village?.dispose();
    this.culling?.dispose();
    this.livestock?.dispose();
    this.wildlife?.dispose();
    this.villagers?.dispose();
    this.paths?.dispose();
    this.premiumSites?.dispose();
    this.resizeObserver.disconnect();
    this.pointer.dispose();
    this.loop.dispose();
    this.ambient?.dispose();
    this.atmosphere.dispose();
    this.war.dispose();
    this.rtsCamera?.dispose();
    this.perf?.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  /**
   * Ryby a vrány krajiny podle jádra (wildlife.md – Ve scéně): hejna ryb podle biomasy, hejna
   * vran z jádra; bez zvěře všechna. Vrátí true, když se něco změnilo.
   */
  private applyFaunaAbundance(): boolean {
    const wild = this.villageState?.wildlife;
    return (
      this.fauna?.setAbundance(
        wild ? { fishShare: wild.fishShare, crowFlocks: wild.crowFlocks } : null,
      ) ?? false
    );
  }

  /** Záběr kamery na zemi (scene-projection.ts); bez kamery null. */
  private viewFootprint(): ViewFootprint | null {
    const camera = this.rtsCamera?.camera;
    return camera ? cameraFootprint(this.scene, this.canvas, camera) : null;
  }

  /**
   * Stromy a keře vrstvy překážek v pásech průseků pokračování stezek (`swathObstacleIds`) –
   * jen pro pásy pokračování, průseky vsi skrývá stav vsi. Počítá se jen při změně pásů.
   */
  private continuationTrees(): ReadonlySet<number> {
    const continued = swathBands(this.villageState?.trailContinuations);
    const layer = this.obstacles;
    if (!layer || continued.length === 0) return NO_IDS;
    const key = swathBandsKey(continued);
    if (this.continuationIds?.layer === layer && this.continuationIds.key === key) {
      return this.continuationIds.ids;
    }
    const ids = swathObstacleIds(layer, continued);
    this.continuationIds = { layer, key, ids };
    return ids;
  }

  /**
   * Překreslí ves podle posledního stavu: skryje stromy, keře a kameny, které ves odstranila
   * nebo vykácela (podle id ze stavu vsi), na místo pokácených stromů dá pařez nebo nálet,
   * u obydlí nejblíž lesu složí hromadu klád. Kde les zmizel, přestane ho kreslit: tráva se pod
   * vykácenými stromy neztmaví, plocha korun nad pasekou zapadne pod zem a stínová mapa se
   * jednou překreslí.
   */
  private applyVillage(): void {
    const village = this.village;
    if (!village || !this.villageState) return;
    // úvozy a náspy vozových cest (roads.md – Vozová cesta) – terén napřed, ať se pole, cesty
    // a pařezy položí už na nový
    const terrainChanged = this.applyTerrainEdits();
    if (!this.pathTrackPrimed) {
      // první ves: pole se postaví rovnou s pásem pěšin dne ze stálých tras – bez něj by se bloky
      // u pěšin stavěly dvakrát (při otevření hry ≈ 0,6 s navíc); síť pěšin pak dá týž pás
      this.pathTrackPrimed = true;
      const track = this.paths?.initialTrack(this.villageState) ?? null;
      if (track) village.setPathTrack(track);
    }
    const changed = village.update(this.villageState) || terrainChanged;
    const changes = this.villageState.obstacles ?? NO_OBSTACLE_CHANGES;
    const sacred = this.villageState.sacred;
    // uschlý posvátný dub kreslí posvátná místa jako souš, padlý jako padlý kmen – strom zmizí
    const deadOaks = [
      ...(sacred?.oaks ?? []).filter((oak) => oak.snag),
      ...(sacred?.fallenOaks ?? []),
    ].map((oak) => oak.id);
    // průsek pokračování zemské stezky sousední vsi (trade.md) – stromy a keře v pásu se nekreslí
    const swaths = swathBands(roadsWithContinuations(this.villageState));
    const hiddenIds = new Set([
      ...this.continuationTrees(),
      ...changes.removed,
      ...changes.stumps,
      ...changes.saplings,
      ...deadOaks,
    ]);
    // posvátné duby se postupně zvětší (jen vzhled, mění se nejvýš jednou za herní rok)
    const growth = new Map((sacred?.oaks ?? []).map((oak) => [oak.id, oak.growth ?? 1]));
    const hidden = this.hider.apply(village.hideShapes(), hiddenIds, growth);
    const shaded = this.terrainGround?.setHiddenTrees(hiddenIds) ?? false;
    const clearing =
      this.obstacles && this.landscape
        ? villageClearedForest(this.landscape, this.obstacles, this.villageState)
        : null;
    // průseky lesem (roads.md) – pás podél os cest, plocha korun nad ním zapadne
    const cleared = this.canopy?.setCleared(clearing, swaths) ?? false;
    if (!sameClearing(this.cleared, clearing)) {
      this.cleared = clearing;
      for (const listener of this.clearedListeners) listener(clearing);
    }
    const felled = this.obstacles
      ? (this.felled?.update(
          this.obstacles,
          changes,
          this.villageState.plantedSaplings,
          tornadoTrunks(this.villageState.tornado),
        ) ?? false)
      : false;
    const logPiles = this.logPile?.update(this.villageState, changes) ?? false;
    const stonePiles = this.stonePiles?.update(this.villageState) ?? false;
    const piles = logPiles || stonePiles;
    const slash = this.clearingSlash?.update(this.villageState) ?? false;
    const fires = this.updateClearingFires();
    const burning = this.updateHouseFires();
    const logs = piles || slash || fires || burning;
    const animals = this.livestock?.update(this.villageState, Date.now()) ?? false;
    const wild = this.wildlife?.update(this.villageState, Date.now()) ?? false;
    const abundance = this.applyFaunaAbundance();
    // oráč, honák a vozka jsou lidé vsi – kolik spřežení a vozů ves dnes kreslí
    const people =
      this.villagers?.update(this.peopleVillage()!, Date.now(), village.draftCrews()) ?? false;
    // pěšiny se přepočítají odloženě a překreslí samy (onChange)
    this.paths?.update(this.villageState);
    // Rozhraní posílá stav vsi opakovaně (dotaz každých pár sekund) – beze změny nic.
    // Vybrané pole mohlo změnit čtverce (zarůstání), vybrané obydlí zaniknout.
    if (changed) {
      this.highlight?.show(
        this.villageState,
        this.selection.target,
        this.logPile?.pickable() ?? [],
      );
      this.outlines?.update(this.villageState);
    }
    if (
      !changed &&
      !hidden &&
      !shaded &&
      !cleared &&
      !felled &&
      !logs &&
      !animals &&
      !wild &&
      !abundance &&
      !people
    ) {
      return;
    }
    // Dým a ohně hned na místě – i při omezeném pohybu, kdy se pak už nehýbe.
    village.animateSmoke(Date.now(), null);
    this.clearingFire?.animate(Date.now(), null);
    this.houseFire?.animate(Date.now(), null);
    this.fireBuckets?.animate(Date.now(), null);
    const scene = { village: changed, hidden, felled, logs, shade: shaded, canopy: cleared };
    if (castersChanged({ ...scene, animals, people })) this.casters.refresh();
    this.loop.renderWhenReady();
  }

  /**
   * Úpravy terénu vozových cest ze vsi (`SceneVillage.earthworks` – stejná funkce jako jádro):
   * síť terénu, pick a výšky scény se změní jen kolem cest a jen při změně profilu; pole a cesty
   * tam se přestaví. Vrátí, jestli se terén změnil.
   */
  private applyTerrainEdits(): boolean {
    const ground = this.terrainGround;
    if (!ground || !this.villageState) return false;
    // terén scény i s rozestavěným úsekem podle průběhu (`shownM`)
    const edits = terrainEditsFrom(
      (this.villageState.earthworks ?? []).map((e) => ({ ...e, reachedM: e.shownM })),
    );
    const region = ground.setTerrainEdits(edits);
    if (!region || !this.surface) return false;
    const a = this.surface.position(region.j0 * this.surface.resolution + region.i0);
    const b = this.surface.position(region.j1 * this.surface.resolution + region.i1);
    const bounds = { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
    this.village?.terrainChanged(bounds);
    this.paths?.terrainChanged(bounds);
    this.casters.refresh();
    return true;
  }

  /**
   * Krajina je statická – kreslí se jen při změně pohledu nebo velikosti okna. Šetří to
   * výkon i baterii (tisíce stromů) a nezahlcuje prohlížeč bez grafické karty. Animace
   * a dokreslování po načtení (`renderBurst`) jdou v taktu WATER_FPS (na pozadí méně), ne
   * s displejem; pohyb kamery se kreslí s displejem (smyčka a takt – scene-loop.ts).
   */
  private frame(): void {
    const camera = this.rtsCamera;
    if (!camera) return;
    const now = performance.now();
    const step = this.loop.step(now);
    this.atmosphere.checkSeason(now);
    // na pozadí (okno bez fokusu, hráč dvě minuty nic nedělá) jdou animace pomaleji; při
    // omezeném pohybu animace stojí a takt slouží jen dokreslování po načtení
    const moving = !this.loop.reducedMotion;
    const fps = moving ? this.loop.animationFps() : WATER_FPS;
    // omezený pohyb zapnutý během záblesku – scéna nesmí zůstat rozsvícená
    if (!moving) this.atmosphere.stopFlash();
    // Voda teče a zvířata se hýbou sama – výjimka z kreslení jen při změně, dokud jsou v záběru.
    if (this.loop.animationTick(now, fps) && moving && this.animate(now, camera.camera)) {
      this.loop.requestRender();
    }
    if (camera.update(step)) {
      this.loop.requestRender();
      // při omezeném pohybu kapky a kroupy stojí – po posunu kamery se přeskládají kolem cíle
      if (!moving) this.atmosphere.placeDrops();
      // obilí z dálky řídne (trsy), pole pak nese obtisk porostu
      this.village?.setView(camera.camera.radius);
      // Pod nehybným kurzorem je po pohybu kamery jiné políčko.
      this.pointer.cameraMoved();
      const { target, radius } = camera.camera;
      this.ambient?.setView({ x: target.x, z: target.z, radius });
      if (this.viewListeners.size > 0) {
        const view = this.viewFootprint();
        if (view) for (const listener of this.viewListeners) listener(view);
      }
    }
    this.pointer.pickHoveredTile();
    this.placement?.tick(now);
    this.loop.draw(now);
  }

  /**
   * Hořící hromady větví podle vsi a dnešního dne (hodiny světa) – přestaví se jen při změně
   * pálení (`burningKey`). Vrátí true, když se ohně změnily.
   */
  private updateClearingFires(): boolean {
    const fire = this.clearingFire;
    const slash = this.clearingSlash;
    if (!fire || !slash || !this.villageState) return false;
    const village = this.villageState;
    const day = Math.floor(gameDayAt(Date.now(), this.worldClock ?? OFFICIAL_WORLD));
    const squares = burningSquares(village, day);
    const key = burningKey(squares, day);
    if (key === fire.currentKey()) return false;
    return fire.set(
      heapFires(village, squares, day, (part) => slash.obstaclesOf(part)),
      key,
    );
  }

  /**
   * Hořící domy a řetěz s vědry v den požáru (`SceneVillage.fire`) – přestaví se jen při změně
   * požáru (`houseFireKey`). Vrátí true, když se ohně nebo řetěz změnily.
   */
  private updateHouseFires(): boolean {
    const fire = this.villageState?.fire;
    const flames = this.houseFire;
    let changed = this.fireBuckets?.set(fire) ?? false;
    const key = houseFireKey(fire);
    if (flames && key !== flames.currentKey()) {
      flames.set(houseFires(fire), key);
      changed = true;
    }
    return changed;
  }

  /** Voda, ryby a ptáci, dým, zvířata, lidé, voli a obilí – true, když se něco v záběru hnulo. */
  private animate(now: number, camera: Camera): boolean {
    const perf = this.perf;
    if (!perf) return this.animateParts(now, camera, null);
    const started = performance.now();
    const animated = this.animateParts(now, camera, (name) => perf.animated(name, started));
    perf.animateTime(performance.now() - started);
    return animated;
  }

  /** `animate` – `hit` (jen s ukazatelem výkonu) dostane jméno animace, která chce kreslit. */
  private animateParts(now: number, camera: Camera, hit: ((name: string) => void) | null): boolean {
    let animated = false;
    // zamrzlá voda neteče – v záběru jen led a stojí, nepřekresluje se
    if (this.water?.flowsInView(camera)) {
      this.water.animate(now / 1000);
      animated = true;
      hit?.('voda');
    }
    if (this.fauna?.animate(now / 1000, camera)) animated = hitPart(hit, 'fauna');
    // déšť, bouřka s kroupami a záblesky, smršť (scene-atmosphere.ts)
    if (this.atmosphere.animate(now, hit)) animated = true;
    // dým z obydlí – rozvrh ohně podle herního dne, proto skutečný čas
    const epochMs = Date.now();
    if (this.village?.animateSmoke(epochMs, camera)) animated = hitPart(hit, 'dým');
    // ohně pálení paseky – podle herního dne jako dým
    if (this.clearingFire?.animate(epochMs, camera)) animated = hitPart(hit, 'pálení');
    // požár – plameny domů a vědra řetězu (jen v den požáru)
    if (this.houseFire?.animate(epochMs, camera)) animated = hitPart(hit, 'požár');
    if (this.fireBuckets?.animate(epochMs, camera)) animated = hitPart(hit, 'vědra');
    // domácí zvířata – skutečný čas (epoch ms), ne herní: stejný okamžik = stejná póza
    if (this.livestock?.animate(epochMs, camera)) animated = hitPart(hit, 'dobytek');
    // koně na jízdě nestojí v ohradě (riders.ts, village-pens.ts)
    // koně mužů na výjezdu vojvody jsou pryč i s jezdci (journey-riders.ts)
    const riding = ridingHorseIds(this.villagers?.rides() ?? [], epochMs);
    for (const id of this.journeyHorses) riding.add(id);
    // odjezd a příjezd: kůň mezi ohradou a kůlem, muži cestou do dvorce (expedition-choreo.ts)
    const away = this.war.journeyAway();
    for (const id of away.horses) riding.add(id);
    // lidé ve scénáři výprav nemají postavu vsi (sedlání, připojení, návrat)
    if (this.villagers?.setScripted(away.hidden)) animated = hitPart(hit, 'lidé');
    this.awayHorses = riding;
    if (this.village?.setRidingHorses(riding)) {
      animated = hitPart(hit, 'jízda');
    }
    if (!sameIds(away.men, this.arrivingMen)) {
      // den rodiny je převezme, až příjezd skončí
      this.arrivingMen = new Set(away.men);
      const people = this.peopleVillage();
      if (
        people &&
        this.village &&
        this.villagers?.update(people, epochMs, this.village.draftCrews())
      ) {
        animated = hitPart(hit, 'lidé');
      }
    }
    // lidé ve vsi – skutečný čas jako zvířata
    if (this.villagers?.animate(epochMs, camera)) animated = hitPart(hit, 'lidé');
    // vojsko a boj – mezi takty plynule, šípy a prach (army-renderer.ts)
    if (this.war.animate(epochMs, camera)) animated = hitPart(hit, 'vojsko');
    // divoká zvěř – skutečný čas; po lidech, před kterými utíká
    if (this.wildlife?.animate(epochMs, camera)) animated = hitPart(hit, 'zvěř');
    // voli a krávy v ohradách a spřežení na poli (oxen.md) – skutečný čas jako zvířata
    if (this.village?.animateOxen(epochMs, camera)) animated = hitPart(hit, 'voli');
    // porážka – překreslí se jen při změně stavu (pád, zavěšení, čtvrtiny, kýty, miska)
    if (this.village?.animateSlaughter(epochMs, camera)) animated = hitPart(hit, 'porážka');
    // obilí ve větru – jen zralé a zelené v záběru
    if (this.village?.animateFields(epochMs, camera)) animated = hitPart(hit, 'obilí');
    // den a noc – slunce jde po obloze (scene-atmosphere.ts)
    if (this.atmosphere.animateDaylight(now, hit)) animated = true;
    return animated;
  }
}

/**
 * Klíč náhledu vozové cesty – na čem trasa závisí (cesty, zemní práce, stavby, díly polí, ploty
 * a překážky), bez práce dne: vybraná cesta se nepřepočítává každý herní den.
 */
function wagonPreviewKey(village: SceneVillage, roadId: number): string {
  const changes = village.obstacles;
  return JSON.stringify([
    roadId,
    (village.roads ?? []).map((r) => [
      r.id,
      r.points.length,
      r.grade,
      r.cart ?? 0,
      r.cartTrips ?? 0,
    ]),
    (village.earthworks ?? []).map((e) => [e.id, Math.round(e.reachedM)]),
    village.dwellings.map((d) => [d.id, d.built, d.position.x, d.position.z]),
    village.fields.map((f) => f.parts.map((p) => `${p.cell.x},${p.cell.y},${p.stage}`).join(';')),
    (village.orchards ?? []).map((o) => o.squares.length),
    (village.cemeteries ?? []).map((c) => c.squares.length),
    (village.pens ?? []).map((p) => [p.id, p.x, p.z]),
    village.woodLogs ?? 0,
    changes ? [changes.removed.length, changes.stumps.length, (changes.added ?? []).length] : 0,
  ]);
}

/** Stejná id (pořadí nehraje roli)? */
function sameIds(list: readonly number[], set: ReadonlySet<number>): boolean {
  return list.length === set.size && list.every((id) => set.has(id));
}
