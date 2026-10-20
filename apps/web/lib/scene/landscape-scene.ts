import '@babylonjs/core/Culling/ray';
import { Ray as PickingRay } from '@babylonjs/core/Culling/ray.core';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import {
  GRID_TURNS,
  buildForestField,
  buildRelief,
  NO_OBSTACLE_CHANGES,
  OFFICIAL_WORLD,
  obstaclesOf,
  rotatedPlot,
  rotationTurn,
  surfaceAt,
  tileOfWorldPoint,
  type DwellingType,
  type Landscape,
  type ObstacleLayer,
  type WorldClock,
  planWagonRoad,
  terrainEditsFrom,
  type WagonRoadPlan,
} from '@bohemia/game';
import type { TileInfo } from '../tile-info';
import { AmbientSound } from './ambient-sound';
import { createRtsCamera, type RtsCamera } from './camera';
import { isDrag, nextClick, type ClickRecord } from './camera-input';
import { HEIGHT_SCALE, SUN_DIRECTION, WATER_FPS } from './constants';
import { createEngine, type RendererName } from './create-engine';
import { decorPlacements } from './decor-placement';
import { addDecorations } from './decorations';
import { addFauna, type Fauna } from './fauna';
import { birdFlocks, fishSchools } from './fauna-placement';
import { FelledTrees } from './felled-trees';
import { LogPile } from './log-pile';
import { sameClearing, villageClearedForest, type ClearedForest } from './cleared-forest';
import { createForestCanopy, type ForestCanopy } from './forest-canopy';
import type { ScenePerfStats } from './perf-stats';
import { ScenePerf } from './scene-perf';
import { addImpostors, type ImpostorForest } from './impostors';
import { obstacleScenery } from './obstacle-scenery';
import { createTerrainMesh, type TerrainMesh } from './terrain-mesh';
import { animationFps, loopStep, nextTick, tickDue } from './render-loop';
import { buildRenderSurface, type RenderSurface } from './render-surface';
import { chunkGrid } from './scenery-chunks';
import { SceneryCulling } from './scenery-culling';
import { terrainMeshHeight } from './drape';
import { InstanceHider } from './instance-hider';
import { VillageLivestock } from './livestock';
import { VillageVillagers } from './villagers';
import type { FuneralTimeline } from './funeral-plan';
import type { WeddingPlan } from './wedding-plan';
import { VillagePaths, type PathStats } from './path-renderer';
import { PitCuts, applyPitCut } from './pit-cut';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import { dayLight, dayLightDistance, type DayLight } from './day-light';
import { seasonDayAt, seasonLook, seasonLookDistance, type SeasonLook } from './season-look';
import { isDeciduousMesh } from './season-foliage';
import { setSeasonShaderState } from './season-materials';
import { SHADOW_DARKNESS, addSunShadows, castersChanged, type SunShadows } from './sun-shadows';
import { swathBands } from './swath-bands';
import { tileAt, tileCenter } from './tile-at';
import { addTrees } from './trees';
import { FieldPainter } from './field-painting';
import { PlacementOutlines } from './placement-outlines-view';
import { HoldingsOverlay, type HoldingsOverlaySector } from './holdings-overlay';
import { SelectionHighlight } from './selection-highlight';
import type { PersonFigureState } from '../person-activity';
import { sameDraftState, type DraftFigureState } from '../draft-activity';
import { pickVillageTarget, rayAtHeight, type Ray, type VillageTarget } from './village-picking';
import { PlacementController, type ActivePlacement } from './village-placement';
import { draftHitTarget, draftSelectionFor } from './draft-pick';
import { VillageRenderer, type DraftRenderState } from './village-renderer';
import type { SceneVillage } from '../village-view';
import type { PlacementHandlers, PlacementMode } from './village-types';
import { createWaterMesh, type WaterSurface } from './water';

type HoverListener = (tile: TileInfo | null) => void;
/** Kliknutí do scény mimo umisťování: vybrané obydlí / pole, nebo null (zrušit výběr). */
/**
 * Výběr kliknutím: co je pod kurzorem, jestli hráč držel Ctrl (Cmd) nebo Shift – přidá / ubere
 * obydlí z výběru (migration.md – Výběr víc obydlí) – a dvojklik (`double` – druhé kliknutí řady,
 * celé pole či sad – fields.md, Co hráč vidí).
 */
type SelectListener = (target: VillageTarget | null, additive: boolean, double: boolean) => void;
type PersonListener = (state: PersonFigureState | null) => void;
type DraftListener = (state: DraftFigureState | null) => void;
/** Záběr kamery na zemi (4 rohy obrazovky jako body krajiny [x, z]) a natočení kamery. */
export interface ViewFootprint {
  corners: [number, number][];
  /** Natočení kamery kolem svislé osy (rad, Babylon alpha). */
  alpha: number;
}
type ViewListener = (view: ViewFootprint) => void;
/** Vymýcený les vsi (null = žádný) – minimapa ho kreslí jako paseku. */
type ClearedListener = (cleared: ClearedForest | null) => void;

/** 3D scéna krajiny – obyčejná třída bez Reactu (adaptér zobrazení). */
/**
 * Roční období: jak často (ms) se podívá na herní datum a od jaké změny vzhledu (season-look.ts)
 * scénu překreslí. Datum se mění jednou za herní den (≈ 86 s), změna za den je pár procent.
 */
const SEASON_CHECK_MS = 1000;
const SEASON_EPSILON = 0.002;
/** Stíny v zimě – holé listnáče propouštějí světlo (jen uniforma, mapa se nepřekresluje). */
const WINTER_SHADOW_DARKNESS = 0.6;
/**
 * Pod tímto množstvím listí (season-look.ts) 3D listnáče nevrhají stín – holá koruna by vrhala
 * stín plného listí (stínová mapa listí nezná) – a impostory vrhají stín holých korun ze
 * zimního atlasu. Stínová mapa se překreslí jen při přechodu.
 */
const BARE_SHADOW_LEAVES = 0.3;
/**
 * Den a noc (day-light.ts): jak často (ms) se při plynulém pohybu přepočítá světlo dne a od jaké
 * změny (`dayLightDistance`) se scéna překreslí. Slunce oběhne oblohu za herní den (≈ 86 s) –
 * 10× za sekundu je to pod půl stupně, světlo se mění plynule a kreslí se jen 10 snímků za sekundu.
 */
const DAY_LIGHT_MS = 100;
const DAY_LIGHT_EPSILON = 0.002;
/** Slabší hlavní světlo (× síla stínu) stín nevrhá – stínová mapa se kvůli němu neobnovuje. */
const SHADOW_VISIBLE = 0.03;
/** Hodiny dne: hodina 0–24 v okamžiku `nowMs` (epoch ms). */
export type DayClock = (nowMs: number) => number;

export class LandscapeScene {
  private readonly listeners = new Set<HoverListener>();
  private readonly selectListeners = new Set<SelectListener>();
  private readonly viewListeners = new Set<ViewListener>();
  private readonly clearedListeners = new Set<ClearedListener>();
  private readonly personListeners = new Set<PersonListener>();
  /** Poslední stav vybraného člověka (villagers.md – Výběr postavy). */
  private personState: PersonFigureState | null = null;
  private readonly draftListeners = new Set<DraftListener>();
  /** Vybrané spřežení nebo vůz (i s lidmi u nich) – stav z vsi a poslední ohlášený. */
  private draftRender: DraftRenderState | null = null;
  private draftState: DraftFigureState | null = null;
  /** Výšková síť terénu (i s úpravami vozových cest). */
  private surface: RenderSurface | null = null;
  /** Poslední náhled vozové cesty – pro stejnou ves a cestu se nepočítá znovu. */
  private wagonPlan: { key: string; plan: WagonRoadPlan } | null = null;
  /** Vymýcený les podle posledního stavu vsi (applyVillage). */
  private cleared: ClearedForest | null = null;
  /** Stisknutá tlačítka myši nad plátnem: kde a jestli zrovna běželo umisťování. */
  private readonly downs = new Map<number, { x: number; y: number; placing: boolean }>();
  /** Poslední kliknutí levým tlačítkem mimo umisťování – dvojklik (`nextClick`). */
  private lastClick: ClickRecord | null = null;
  private selection: VillageTarget | null = null;
  private highlight: SelectionHighlight | null = null;
  /** Vývojový překryv úseků hospodářství (fields.md – Hospodaření podle polohy domů). */
  private holdings: HoldingsOverlay | null = null;
  private holdingSectors: readonly HoldingsOverlaySector[] | null = null;
  /** Hranice stávajících objektů – jen při malování pole, sadu a hřbitova. */
  private outlines: PlacementOutlines | null = null;
  private groundHeight: ((x: number, z: number) => number) | null = null;
  private readonly resizeObserver: ResizeObserver;
  private landscape: Landscape | null = null;
  private terrain: Mesh | null = null;
  /** Terén s přepočtem ztmavení pod vykácenými stromy. */
  private terrainGround: TerrainMesh | null = null;
  /** Plocha korun vnitřku lesa – nad pasekou zapadne pod zem. */
  private canopy: ForestCanopy | null = null;
  private water: WaterSurface | null = null;
  /** Ozdobné ryby a ptáci – hýbou se jako voda, dokud jsou v záběru. */
  private fauna: Fauna | null = null;
  /**
   * Poslední takt animací a dokreslování (ms) – voda, zvířata a lidé se překreslují nejvýš
   * WATER_FPS za sekundu a stejně často se kontroluje, jestli se v záběru něco hýbe.
   */
  private lastAnimationTick = Number.NEGATIVE_INFINITY;
  /** Smyčka kreslení (requestAnimationFrame) a čas jejího posledního průchodu. */
  private loopHandle = 0;
  private lastLoopAt: number | null = null;
  /** WebGL ztratil kontext – do obnovení se nekreslí (jako ve smyčce Babylonu). */
  private contextLost = false;
  /**
   * Okno má fokus a kdy hráč naposledy něco udělal (myš, klávesy, kolečko, dotyk) – na pozadí
   * jdou animace pomaleji (`animationFps`).
   */
  private focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  private lastInputAt = performance.now();
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
  /** Pařezy a nálet po pokácených stromech. */
  private felled: FelledTrees | null = null;
  private logPile: LogPile | null = null;
  private village: VillageRenderer | null = null;
  /** Domácí zvířata vsi (ozdoba) – slepice u obydlí, stáda na loukách a v lese. */
  private livestock: VillageLivestock | null = null;
  /** Lidé ve vsi – kde ves dnes pracuje (rozdělení práce dne, villagers.md). */
  private villagers: VillageVillagers | null = null;
  /** Vyšlapané pěšiny vsi (paths.md) – lidé po nich chodí. */
  private paths: VillagePaths | null = null;
  /** Poslední stav vsi od rozhraní – vykreslí se, jakmile je krajina hotová. */
  private villageState: SceneVillage | null = null;
  private placement: ActivePlacement | null = null;
  /** Jámy obydlí – terén a obtisky se v nich prořezávají (pit-cut.ts). */
  private readonly pitCuts = new PitCuts();
  private worldClock: WorldClock | null = null;
  /** Vývojové ukázky: vlastní okno herního dne pro práci za den (orba, svoz – ladicí). */
  private workDayClock: ((day: number) => { startMs: number; endMs: number }) | null = null;
  private smokeAlways = false;
  /** Vývojový přepínač dne v roce (null = podle herního data). */
  private seasonDay: number | null = null;
  /** Naposledy nastavený vzhled ročního období a kdy se znovu podívat na datum. */
  private season: SeasonLook | null = null;
  private seasonCheckAt = 0;
  /** Listnáče ve stínové mapě a jestli jsou zrovna vyřazené (holé). */
  private deciduousCasters: Mesh[] = [];
  private bareShadows = false;
  /** Vnitřek lesa – v zimě vrhá stín ze zimního atlasu (holé koruny). */
  private impostorForest: ImpostorForest | null = null;
  /** Den a noc: hodiny dne (null = bez denní doby – pevné odpolední slunce jako dřív). */
  private dayClock: DayClock | null = null;
  /** Naposledy nastavené světlo dne a kdy se počítalo (performance.now). */
  private daylight: DayLight | null = null;
  private daylightAt = 0;
  /** Paprsek pro pick terénu pod kurzorem (bez alokace při každém pohybu myši). */
  private readonly pickRay = PickingRay.Zero();
  /** Vývojový ukazatel výkonu (jen /dev/landscape – `enablePerfStats`). */
  private perf: ScenePerf | null = null;
  /** Odložené předání pásu pěšin dne polím (`VillagePaths.onChange`). */
  private pathTrackTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.updateSeason(true);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, this.onInput, { capture: true, passive: true });
    }
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
    scene.imageProcessingConfiguration.contrast = 1.1;
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
   * Postaví scénu krajiny. Mezi náročnými kroky hlásí průběh a nechá prohlížeč překreslit
   * stránku, aby ukazatel načítání nezamrzl.
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
    const surface = buildRenderSurface(landscape);
    this.surface = surface;
    const groundHeight = (x: number, z: number): number => surface.heightAt(x, z) * HEIGHT_SCALE;
    this.groundHeight = groundHeight;
    this.village = new VillageRenderer(this.scene, {
      groundHeight,
      decalHeight: (x, z) => terrainMeshHeight(surface, x, z),
      addShadowCaster: (mesh) => this.addVillageCaster(mesh),
      onAsyncChange: () => {
        this.shadows?.refresh();
        this.renderWhenReady();
      },
      requestRender: () => this.renderWhenReady(),
      pitCuts: this.pitCuts,
      sunDirection: SUN_DIRECTION,
      landscape,
      animated: () => !this.reducedMotion?.matches,
      // vybrané spřežení nebo vůz (villagers.md – Výběr postavy) – co dělá, panel výběru
      onDraftState: (state) => {
        this.draftRender = state;
        this.publishDraft();
      },
    });
    if (this.worldClock) this.village.setWorldClock(this.worldClock);
    if (this.workDayClock) this.village.setPloughClock(this.workDayClock);
    if (this.season) {
      this.village.setSeason(this.seasonDayOfYear(), this.season.snow);
    }
    this.village.setSmokeAlways(this.smokeAlways);
    this.outlines = new PlacementOutlines(
      this.scene,
      (x, z) => terrainMeshHeight(surface, x, z),
      () => {
        this.needsRender = true;
      },
    );
    this.highlight = new SelectionHighlight(this.scene, (x, z) => terrainMeshHeight(surface, x, z));
    this.holdings = new HoldingsOverlay(this.scene, (x, z) => terrainMeshHeight(surface, x, z));
    this.holdings.show(this.holdingSectors);
    await report('forest', 0.4);
    if (this.disposed) return;
    // Stromy, keře a kameny jsou herní data – vrstva překážek z herního jádra, stejná jako na
    // serveru: okraj lesa a jeho vnitřek (impostory), stromy v loukách a na břehu, borovice na
    // skalách, mladé stromky, souše, padlé stromy, pařezy, keře, kameny a skalní výchozy.
    // pole lesa napřed (zapamatuje se) – vrstva překážek ho převezme, nepočítá se dvakrát
    const field = buildForestField(landscape);
    const obstacles = obstaclesOf(landscape);
    this.obstacles = obstacles;
    if (this.village.setObstacles(obstacles)) this.renderWhenReady();
    const scenery = obstacleScenery(obstacles);
    const trees = scenery.trees;
    // ozdoby vody (rákos, lekníny, kmeny v potoce) nejsou překážky – jen vzhled scény
    const decor = [...scenery.decor, ...decorPlacements(landscape, surface.stream)];
    this.felled = new FelledTrees(this.scene, {
      groundHeight,
      addShadowCaster: (mesh) => {
        if (this.shadows) this.shadows.addCaster(mesh);
        else this.pendingCasters.push(mesh);
      },
      onAsyncChange: () => {
        this.shadows?.refresh();
        this.renderWhenReady();
      },
    });
    // hromada klád u vsi (forest.md) – vlastní síť kmenů, kolik klád, tolik kmenů
    this.logPile?.dispose();
    this.logPile = new LogPile(this.scene, {
      landscape,
      layer: obstacles,
      groundHeight,
      addShadowCaster: (mesh) => {
        if (this.shadows) this.shadows.addCaster(mesh);
        else this.pendingCasters.push(mesh);
      },
    });
    const relief = buildRelief(landscape);
    // Domácí zvířata vsi – rozmístí se podle vsi (applyVillage), modely až s prvním zvířetem.
    this.livestock?.dispose();
    this.livestock = new VillageLivestock(this.scene, {
      landscape,
      field,
      stream: surface.stream,
      relief,
      groundHeight: (x, z) => terrainMeshHeight(surface, x, z),
      baseUrl: '/models/fauna/',
      onLoaded: () => this.renderWhenReady(),
    });
    // Lidé ve vsi – kde ves dnes pracuje; schůdnou zemi sdílejí se zvířaty, děti pasou stáda.
    this.villagers?.dispose();
    this.villagers = new VillageVillagers(this.scene, {
      layer: obstacles,
      ground: (village) => this.livestock?.walkGroundFor(village) ?? null,
      groundHeight: (x, z) => terrainMeshHeight(surface, x, z),
      baseUrl: '/models/people/',
      herds: (nowMs) => this.livestock?.herdViews(nowMs) ?? [],
      onLoaded: () => this.renderWhenReady(),
      // karavany výprav jdou v herním čase (caravan.ts) – okno herního dne jako orba za den
      dayWindow: (day) => this.village?.gameDayWindow(day) ?? null,
      // pohřby (cemetery.md – Pohřeb ve scéně): máry, hranice a oheň kreslí ves
      onFunerals: (plans) => {
        if (this.village?.setFunerals(plans, Date.now())) this.renderWhenReady();
      },
      // svatby (kinship.md – Svatba ve scéně): oheň obřadu a věnec na dubu kreslí ves
      onWeddings: (plans) => {
        if (this.village?.setWeddings(plans, Date.now())) this.renderWhenReady();
      },
      // vybraný člověk (villagers.md – Výběr postavy) – co dělá, panel postavy
      onPersonState: (state) => {
        this.personState = state;
        for (const listener of this.personListeners) listener(state);
      },
      // noví lidé u spřežení a vozů – výběr oráče, honáka či vozky jde za jejich spřežením
      onCrew: () => this.syncDraftSelection(),
    });
    this.villagers.select(this.selection?.kind === 'person' ? this.selection.id : null);
    this.syncDraftSelection();
    // Vyšlapané pěšiny – síť se počítá z vsi a krajiny (odloženě), lidé po ní chodí; pevné cesty
    // a stromy u nich z dat vsi (roads.md).
    this.paths?.dispose();
    this.paths = new VillagePaths(this.scene, {
      landscape,
      layer: obstacles,
      decalHeight: (x, z) => terrainMeshHeight(surface, x, z),
      groundHeight,
      // původní terén (bez úvozů a náspů vozových cest) – hlína na svazích podle rozdílu
      baseHeight: (x, z) =>
        this.terrainGround?.baseHeightAt(x, z) ?? terrainMeshHeight(surface, x, z),
      pitCuts: this.pitCuts,
      addShadowCaster: (mesh) => this.addVillageCaster(mesh),
      // nová síť pěšin mění jen obtisky a trasy postav – stromy u cest obnoví stíny samy
      // (refreshShadows), stínová mapa se kvůli pěšinám nepřekresluje
      onChange: () => {
        this.villagers?.setPaths(this.paths?.paths() ?? null, Date.now());
        this.renderWhenReady();
        // Pod pěšinami dne obilí neroste – bloky polí se přestaví jen s novou sítí pěšin, a to až
        // v další úloze: výpočet sítě a přestavba polí jsou dvě kratší úlohy, mezi které se vejde
        // snímek (pohyb kamery se nezasekne na jejich součet).
        if (this.pathTrackTimer !== null) clearTimeout(this.pathTrackTimer);
        this.pathTrackTimer = setTimeout(() => {
          this.pathTrackTimer = null;
          if (this.disposed) return;
          if (this.village?.setPathTrack(this.paths?.pathTrack() ?? null)) this.renderWhenReady();
        }, 0);
      },
      requestRender: () => this.renderWhenReady(),
      refreshShadows: () => {
        this.shadows?.refresh();
        this.renderWhenReady();
      },
    });
    // Ozdobná zvířata podle 0 A.D.: hejna ryb v tůních, kroužící vrány a káně.
    const fauna = {
      fish: fishSchools(surface),
      birds: birdFlocks(landscape, field, surface.stream, groundHeight),
    };
    await report('surface', 0.5);
    if (this.disposed) return;
    this.terrainGround = createTerrainMesh(this.scene, landscape, surface, { field, trees });
    this.terrain = this.terrainGround.mesh;
    if (this.terrain.material) applyPitCut(this.terrain.material, this.pitCuts);
    this.water = createWaterMesh(this.scene, surface);
    this.canopy = createForestCanopy(this.scene, surface, field);
    const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
    this.rtsCamera = createRtsCamera(this.scene, this.canvas, {
      halfExtent: (landscape.size * landscape.cellSizeM) / 2,
      start: { x: site.worldX, z: site.worldZ },
      groundHeight,
      // levé tažení posouvá krajinu, jen když se nic neumisťuje (malování pole tahem maluje)
      leftDragPans: () => this.placement === null,
    });
    // Okraj lesa 2–3 řady 3D stromů, za nimi vnitřek lesa z impostorů.
    const impostors = scenery.impostors;
    await report('models', 0.6);
    if (this.disposed) return;
    let loaded = 0;
    const counted = <T>(promise: Promise<T>): Promise<T> =>
      promise.finally(() => onProgress({ step: 'models', done: 0.6 + 0.075 * ++loaded }));
    // stromy, dekorace a impostory krajiny – jen ty skrývá InstanceHider (les vsi ne)
    const sceneryMeshes: Mesh[] = [];
    const collect = (meshes: Mesh[]): void => {
      sceneryMeshes.push(...meshes);
    };
    await Promise.all([
      counted(
        addTrees(this.scene, trees, { baseUrl: '/models/trees/', groundHeight }).then(collect),
      ),
      counted(
        addDecorations(this.scene, decor, { baseUrl: '/models/decor/', groundHeight }).then(
          collect,
        ),
      ),
      counted(
        addImpostors(
          this.scene,
          this.rtsCamera.camera,
          impostors,
          groundHeight,
          (shadowAtlasChanged) => {
            if (shadowAtlasChanged) this.shadows?.refresh();
            this.renderWhenReady();
          },
        ).then(
          (forest) => {
            this.impostorForest = forest;
            if (this.daylight) forest?.setTone(this.daylight.tone);
            if (forest) collect(forest.meshes);
          },
          (error) =>
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
    // Odstraněné a vykácené překážky se skryjí podle id, ozdoby pod stavbami podle polohy paty.
    this.hider.track(sceneryMeshes);
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
      // impostory listnáčů v zimě nevypadnou – vrhají stín ze zimního atlasu (setBareShadows)
      this.deciduousCasters = this.scene.meshes.filter(
        (mesh): mesh is Mesh =>
          mesh instanceof Mesh && isDeciduousMesh(mesh.name) && !mesh.name.startsWith('impostors-'),
      );
    }
    this.updateSeason(true);
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
    if (this.season) this.ambient.setSeason({ ...this.season.sound, ice: this.season.ice });
    this.renderBurst(1500);
    this.startLoop();
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

  /** Vytyčení tras vozových cest (vývojová ukázka – osy bez plánu); prázdné zruší. */
  setWagonPreview(lines: readonly (readonly { x: number; z: number }[])[]): void {
    this.paths?.setWagonPreview(lines);
    this.renderWhenReady();
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
          });
    this.wagonPlan = { key, plan };
    this.paths?.setWagonPreview(show && plan.ok ? [plan.profile] : []);
    this.renderWhenReady();
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
      this.needsRender = true;
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
    const controller: ActivePlacement =
      mode.kind === 'squares'
        ? new FieldPainter(
            {
              scene: this.scene,
              canvas: this.canvas,
              landscape,
              pickGround: (x, y) => this.pickGround(x, y),
              decalHeight: (x, z) => village.decalHeight(x, z),
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
              cellAt: (x, z) => {
                const cell = tileAt(landscape, x, z);
                if (!cell) return null;
                const center = tileCenter(landscape, cell.x, cell.y);
                return { cell, x: center.worldX, z: center.worldZ, size: landscape.cellSizeM };
              },
              plotAt: (x, z, rotation, variant) => {
                // natočený pozemek (fields.md – Natočené stavby): po 90° políčko pod kurzorem,
                // jinak čtverec se středem pod kurzorem – v ukládané podobě jako na serveru
                let cx = x;
                let cz = z;
                if ((rotationTurn(rotation) ?? 0) % GRID_TURNS === 0) {
                  const cell = tileAt(landscape, x, z);
                  if (!cell) return null;
                  const center = tileCenter(landscape, cell.x, cell.y);
                  cx = center.worldX;
                  cz = center.worldZ;
                }
                const plot = rotatedPlot(landscape, { x: cx, z: cz, rotation }, variant);
                if (!plot) return null;
                const size = landscape.cellSizeM;
                if (plot.square) return { plot, square: { ...plot.square, size } };
                const center = tileCenter(landscape, plot.cell.x, plot.cell.y);
                return { plot, square: { x: center.worldX, z: center.worldZ, size } };
              },
              ghostModel: (type) => village.ghostModel(type),
              baseHeight: (type, position) => {
                if (type === 'idol' || type === 'shrine') {
                  return village.sacredBaseHeight(type, position);
                }
                // milíř uhlíře se měří u svého místa – `position` je poloha zemnice
                if (type === 'milir') return village.milirBaseHeight(position);
                const base = mode.kind === 'workshop' ? mode.type : null;
                return village.baseHeight({ type: base ?? (type as DwellingType), position });
              },
              requestRender,
            },
            mode,
            controlled,
          );
    this.placement = controller;
    if (mode.kind === 'squares') this.outlines?.show(this.villageState);
    else this.outlines?.hide();
    if (mode.kind !== 'squares') {
      // Model ducha se načte (jednou) a pak naskočí pod kurzorem.
      const models =
        mode.kind === 'sacred'
          ? village.loadSacredModels()
          : mode.kind === 'workshop'
            ? Promise.all([village.loadModels(), village.loadCraftModels()])
            : village.loadModels();
      void models.then(() => {
        if (this.placement === controller) this.pointerMoved = this.pointerInside;
      });
    }
    this.pointerMoved = this.pointerInside;
    this.renderWhenReady();
  }

  /**
   * Svět, podle jehož herního dne se v obydlích topí (dým ráno a večer). Bez volání ostrý svět;
   * testovací svět (WORLD_START, WORLD_END) sem předá rozhraní.
   */
  setWorldClock(world: WorldClock): void {
    this.village?.setWorldClock(world);
    this.worldClock = world;
    this.updateSeason(true);
    // karavany a pohřby jdou podle okna herního dne – rozmístit lidi podle nových hodin
    if (this.villagers?.clockChanged(Date.now())) this.renderWhenReady();
  }

  /**
   * Vývojová volba: vlastní okno herního dne pro práci za den (orba a svoz projeté za herní den –
   * PLOUGH_DAY_DEBUG), null = z hodin světa. Ukázky bez hodin světa (/dev/landscape) tak vozí
   * zrychleně jako ve hře.
   */
  setWorkDayClock(clock: ((day: number) => { startMs: number; endMs: number }) | null): void {
    this.workDayClock = clock;
    this.village?.setPloughClock(clock);
    if (this.villageState) this.setVillage(this.villageState);
    if (this.villagers?.clockChanged(Date.now())) this.renderWhenReady();
  }

  /**
   * Vývojová volba: roční období podle zadaného dne v roce (1–366, i desetinného – plynulé
   * přetáčení), null = zpět podle herního data.
   */
  setSeasonDay(day: number | null): void {
    this.seasonDay = day;
    this.updateSeason(true);
  }

  /**
   * Den a noc (zatím jen vývojová stránka): hodiny dne, null = bez denní doby (pevné odpolední
   * slunce jako dřív). Slunce pak jde po obloze plynule v taktu animací (DAY_LIGHT_MS), při
   * omezeném pohybu po krocích jednou za sekundu; stínová mapa se obnoví po SHADOW_STEP_DEG.
   */
  setDayClock(clock: DayClock | null): void {
    this.dayClock = clock;
    // Filtr obrazu soumraku a noci (ColorCurves) – zapnutí přeloží shadery všech materiálů,
    // proto jednou při prvních hodinách dne a už se nevypíná (bez filtru obraz nemění).
    const processing = this.scene.imageProcessingConfiguration;
    if (clock && !processing.colorCurvesEnabled) {
      processing.colorCurves ??= new ColorCurves();
      processing.colorCurvesEnabled = true;
    }
    if (this.applyLight(true)) this.needsRender = true;
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
    this.renderWhenReady();
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
    return this.perf?.stats(performance.now(), this.animationFps()) ?? null;
  }

  /** Vývojová volba: dým ze všech hotových obydlí pořád (kontrola vzhledu dýmu). */
  setSmokeAlways(enabled: boolean): void {
    this.smokeAlways = enabled;
    this.village?.setSmokeAlways(enabled);
    if (this.village?.animateSmoke(Date.now(), null)) this.needsRender = true;
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

  /**
   * Kliknutí do scény mimo umisťování (jako v 0 A.D.): levé na obydlí, díl pole nebo hřbitov ho
   * vybere, na prázdnou zem a pravé výběr zruší (null); s Ctrl (Cmd) nebo Shiftem ohlásí
   * `additive` – rozhraní obydlí přidá k výběru nebo ho ubere; druhé kliknutí řady ohlásí
   * `double` – rozhraní vybere celé pole či sad. Zvýraznění nastaví až rozhraní (`setSelection`).
   */
  onSelect(listener: SelectListener): () => void {
    this.selectListeners.add(listener);
    return () => this.selectListeners.delete(listener);
  }

  /**
   * Zvýrazní vybrané obydlí / pole / hřbitov rámečkem na zemi, vybranou postavu žlutým kroužkem
   * pod nohama (null = nic).
   */
  setSelection(target: VillageTarget | null): void {
    this.selection = target;
    this.highlight?.show(this.villageState, target);
    this.villagers?.select(target?.kind === 'person' ? target.id : null);
    this.syncDraftSelection();
    this.renderWhenReady();
  }

  /**
   * Co dělá vybrané spřežení nebo vůz (i když je vybraný oráč, honák či vozka – oxen.md, wagons.md)
   * a kdo je u nich – hned ohlásí současný stav, pak jen při změně.
   */
  onDraftState(listener: DraftListener): () => void {
    this.draftListeners.add(listener);
    listener(this.draftState);
    return () => this.draftListeners.delete(listener);
  }

  /**
   * Výběr spřežení a vozu ve vsi podle výběru rozhraní: spřežení / vůz celé, člověk u nich
   * (oráč, honák, vozka – úlohu zná plán postav) kroužkem pod ním; jinak nic.
   */
  private syncDraftSelection(): void {
    const target = this.selection;
    const job = target?.kind === 'person' ? (this.villagers?.crewJob(target.id) ?? null) : null;
    this.village?.selectDraft(draftSelectionFor(target, job));
    this.publishDraft();
  }

  /** Stav vybraného spřežení / vozu i s lidmi u nich – posluchačům jen při změně. */
  private publishDraft(): void {
    const render = this.draftRender;
    let state: DraftFigureState | null = null;
    if (render?.kind === 'team') {
      const crew = this.villagers?.teamCrew(render.team) ?? null;
      state = {
        kind: 'team',
        team: render.team,
        activity: render.activity,
        ploughman: crew?.ploughman ?? null,
        leader: crew?.leader ?? null,
      };
    } else if (render?.kind === 'cart') {
      state = {
        kind: 'cart',
        cart: render.cart,
        leg: render.leg,
        loaded: render.loaded,
        hidden: render.hidden,
        drover: this.villagers?.cartDrover(render.cart) ?? null,
      };
    }
    if (sameDraftState(state, this.draftState)) return;
    this.draftState = state;
    for (const listener of this.draftListeners) listener(state);
  }

  /**
   * Co dělá vybraný člověk (villagers.md – Výběr postavy): jeho postava dne, úsek pochůzky
   * a jestli je vidět – hned ohlásí současný stav, pak jen při změně.
   */
  onPersonState(listener: PersonListener): () => void {
    this.personListeners.add(listener);
    listener(this.personState);
    return () => this.personListeners.delete(listener);
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

  /** Přesune pohled na bod krajiny (klik do minimapy). */
  moveCameraTo(x: number, z: number): void {
    this.rtsCamera?.moveTo(x, z);
    this.needsRender = true;
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
   * Převod bodu světa na CSS px plátna pro výběr postav – matice kamery jednou na kliknutí; bod za
   * kamerou null.
   */
  private projector(
    camera: Camera,
  ): (wx: number, wy: number, wz: number) => { x: number; y: number } | null {
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const transform = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const viewport = camera.viewport.toGlobal(width, height);
    const scaleX = this.canvas.clientWidth / Math.max(1, width);
    const scaleY = this.canvas.clientHeight / Math.max(1, height);
    const identity = Matrix.Identity();
    const world = new Vector3();
    return (wx, wy, wz) => {
      const point = Vector3.Project(world.set(wx, wy, wz), identity, transform, viewport);
      if (point.z < 0 || point.z > 1) return null;
      return { x: point.x * scaleX, y: point.y * scaleY };
    };
  }

  /**
   * Postava vybraného člověka na obrazovce (CSS px – testovací háček), nebo null, když není vidět.
   */
  projectPerson(id: number): { x: number; y: number } | null {
    const camera = this.rtsCamera?.camera;
    const spot = this.villagers?.spotOf(id);
    if (!camera || !spot) return null;
    return this.projector(camera)(spot.x, spot.y + 0.9, spot.z);
  }

  /** Bod krajiny (x, z) na obrazovce v CSS px plátna, nebo null mimo záběr (testovací háček). */
  projectToScreen(x: number, z: number): { x: number; y: number } | null {
    const camera = this.rtsCamera?.camera;
    if (!camera || !this.groundHeight) return null;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const point = Vector3.Project(
      new Vector3(x, this.groundHeight(x, z), z),
      Matrix.Identity(),
      camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)),
      camera.viewport.toGlobal(width, height),
    );
    if (point.z < 0 || point.z > 1) return null;
    const scaleX = this.canvas.clientWidth / width;
    const scaleY = this.canvas.clientHeight / height;
    const screen = { x: point.x * scaleX, y: point.y * scaleY };
    const inside =
      screen.x >= 0 &&
      screen.y >= 0 &&
      screen.x <= this.canvas.clientWidth &&
      screen.y <= this.canvas.clientHeight;
    return inside ? screen : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pathTrackTimer !== null) clearTimeout(this.pathTrackTimer);
    this.listeners.clear();
    this.selectListeners.clear();
    this.viewListeners.clear();
    this.clearedListeners.clear();
    this.personListeners.clear();
    this.draftListeners.clear();
    this.highlight?.dispose();
    this.holdings?.dispose();
    this.outlines?.dispose();
    this.placement?.dispose();
    this.placement = null;
    this.village?.dispose();
    this.culling?.dispose();
    this.livestock?.dispose();
    this.villagers?.dispose();
    this.paths?.dispose();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
    for (const type of INPUT_EVENTS) {
      window.removeEventListener(type, this.onInput, { capture: true });
    }
    this.ambient?.dispose();
    this.rtsCamera?.dispose();
    this.perf?.dispose();
    if (this.loopHandle !== 0) cancelAnimationFrame(this.loopHandle);
    this.loopHandle = 0;
    this.scene.dispose();
    this.engine.dispose();
  }

  private readonly onFocus = (): void => {
    this.focused = true;
    this.lastInputAt = performance.now();
  };

  private readonly onBlur = (): void => {
    this.focused = false;
  };

  private readonly onInput = (): void => {
    this.lastInputAt = performance.now();
  };

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

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.downs.set(event.button, {
      x: event.offsetX,
      y: event.offsetY,
      placing: this.placement !== null,
    });
  };

  /** Kliknutí mimo umisťování vybírá (levé) a ruší výběr (pravé); tah krajinou nevybírá. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.downs.get(event.button);
    this.downs.delete(event.button);
    const at = { x: event.offsetX, y: event.offsetY };
    const clicked =
      down !== undefined &&
      !down.placing &&
      this.placement === null &&
      !isDrag(down, at) &&
      !(event.button === 0 && this.rtsCamera?.leftPressPanned());
    // dvojklik jen ze dvou levých kliknutí po sobě – tah, pravé tlačítko i umisťování řadu přeruší
    if (!clicked || event.button !== 0) this.lastClick = null;
    if (!clicked) return;
    if (event.button === 0) {
      this.lastClick = nextClick(this.lastClick, { ...at, at: event.timeStamp });
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      this.emitSelect(this.pickTarget(at.x, at.y), additive, this.lastClick.count >= 2);
    } else if (event.button === 2) this.emitSelect(null, false, false);
  };

  private emitSelect(target: VillageTarget | null, additive: boolean, double: boolean): void {
    for (const listener of this.selectListeners) listener(target, additive, double);
  }

  /**
   * Postava, obydlí, pole nebo hřbitov pod pixelem plátna (CSS px) – postavy mají přednost před
   * stavbami pod nimi (villagers.md – Výběr postavy).
   */
  private pickTarget(x: number, y: number): VillageTarget | null {
    const camera = this.rtsCamera?.camera;
    const landscape = this.landscape;
    const groundHeight = this.groundHeight;
    if (!camera || !landscape || !groundHeight || !this.villageState) return null;
    const project = this.projector(camera);
    // postava, nebo spřežení a vůz (i oráč, honák a vozka u nich) – bližší průmět vyhraje
    const person = this.villagers?.pickHit(x, y, project) ?? null;
    const draft = this.village?.pickDraft(x, y, project) ?? null;
    if (person && (!draft || person.distance <= draft.distance)) {
      return { kind: 'person', id: person.person };
    }
    if (draft) return draftHitTarget(draft, this.villagers);
    const pick = this.scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
    const ray: Ray = {
      origin: { x: pick.origin.x, y: pick.origin.y, z: pick.origin.z },
      direction: { x: pick.direction.x, y: pick.direction.y, z: pick.direction.z },
    };
    const ground = this.pickGround(x, y);
    return pickVillageTarget(this.villageState, ray, {
      ground: ground ? { x: ground[0], z: ground[1] } : null,
      groundHeight,
      cellOf: (wx, wz) => tileOfWorldPoint(landscape, wx, wz),
    });
  }

  /** Záběr kamery na zemi – rohy obrazovky promítnuté do roviny cíle kamery. */
  private viewFootprint(): ViewFootprint | null {
    const camera = this.rtsCamera?.camera;
    if (!camera) return null;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return null;
    const groundY = camera.target.y;
    const corners: [number, number][] = [];
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ] as const) {
      const pick = this.scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
      const point = rayAtHeight(
        {
          origin: { x: pick.origin.x, y: pick.origin.y, z: pick.origin.z },
          direction: { x: pick.direction.x, y: pick.direction.y, z: pick.direction.z },
        },
        groundY,
      );
      if (!point) return null;
      corners.push([point.x, point.z]);
    }
    return { corners, alpha: camera.alpha };
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
    const changed = village.update(this.villageState) || terrainChanged;
    const changes = this.villageState.obstacles ?? NO_OBSTACLE_CHANGES;
    const sacred = this.villageState.sacred;
    // uschlý posvátný dub kreslí posvátná místa jako souš, padlý jako padlý kmen – strom zmizí
    const deadOaks = [
      ...(sacred?.oaks ?? []).filter((oak) => oak.snag),
      ...(sacred?.fallenOaks ?? []),
    ].map((oak) => oak.id);
    const hiddenIds = new Set([
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
    const cleared = this.canopy?.setCleared(clearing, swathBands(this.villageState.roads)) ?? false;
    if (!sameClearing(this.cleared, clearing)) {
      this.cleared = clearing;
      for (const listener of this.clearedListeners) listener(clearing);
    }
    const felled = this.obstacles
      ? (this.felled?.update(this.obstacles, changes, this.villageState.plantedSaplings) ?? false)
      : false;
    const logs = this.logPile?.update(this.villageState, changes) ?? false;
    const animals = this.livestock?.update(this.villageState, Date.now()) ?? false;
    // oráč, honák a vozka jsou lidé vsi – kolik spřežení a vozů ves dnes kreslí
    const people =
      this.villagers?.update(this.villageState, Date.now(), village.draftCrews()) ?? false;
    // pěšiny se přepočítají odloženě a překreslí samy (onChange)
    this.paths?.update(this.villageState);
    // Rozhraní posílá stav vsi opakovaně (dotaz každých pár sekund) – beze změny nic.
    // Vybrané pole mohlo změnit čtverce (zarůstání), vybrané obydlí zaniknout.
    if (changed) {
      this.highlight?.show(this.villageState, this.selection);
      this.outlines?.update(this.villageState);
    }
    if (!changed && !hidden && !shaded && !cleared && !felled && !logs && !animals && !people) {
      return;
    }
    // Dým hned na místě – i při omezeném pohybu, kdy se pak už nehýbe.
    village.animateSmoke(Date.now(), null);
    const scene = { village: changed, hidden, felled, logs, shade: shaded, canopy: cleared };
    if (castersChanged({ ...scene, animals, people })) this.shadows?.refresh();
    this.renderWhenReady();
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
    this.shadows?.refresh();
    return true;
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
    const ground = this.terrainGround;
    const camera = this.rtsCamera?.camera;
    if (!ground || !camera || !this.landscape) return null;
    const started = this.perf ? performance.now() : 0;
    // Stejný paprsek jako `scene.pick` a stejné trojúhelníky, jen po výškové síti – jen políčka
    // pod paprskem místo celé sítě terénu (terrain-pick.ts).
    this.scene.createPickingRayToRef(x, y, Matrix.Identity(), this.pickRay, camera, false);
    const point = ground.pick(this.pickRay);
    this.perf?.pick(performance.now() - started);
    if (!point || !tileAt(this.landscape, point.x, point.z)) return null;
    return [point.x, point.z];
  }

  /**
   * Vlastní smyčka místo `engine.runRenderLoop`: ta otevírá a uzavírá snímek enginu
   * (`beginFrame` / `endFrame`) při každém snímku displeje, i když se nic nekreslí – WebGPU pak
   * pokaždé odešle příkazy (`flushFramebuffer`). Tady vzniká snímek enginu jen při kreslení.
   */
  private startLoop(): void {
    this.engine.onContextLostObservable.add(() => {
      this.contextLost = true;
    });
    this.engine.onContextRestoredObservable.add(() => {
      this.contextLost = false;
      this.renderBurst(300);
    });
    const tick = (): void => {
      this.loopHandle = 0;
      if (this.disposed) return;
      this.frame();
      if (!this.disposed) this.loopHandle = requestAnimationFrame(tick);
    };
    this.loopHandle = requestAnimationFrame(tick);
  }

  /**
   * Krajina je statická – kreslí se jen při změně pohledu nebo velikosti okna. Šetří to
   * výkon i baterii (tisíce stromů) a nezahlcuje prohlížeč bez grafické karty. Animace
   * a dokreslování po načtení (`renderBurst`) jdou v taktu WATER_FPS (na pozadí méně), ne
   * s displejem; pohyb kamery se kreslí s displejem.
   */
  private frame(): void {
    const camera = this.rtsCamera;
    if (!camera) return;
    const now = performance.now();
    const step = loopStep(now, this.lastLoopAt);
    this.lastLoopAt = now;
    this.perf?.loop(now);
    if (now >= this.seasonCheckAt) this.updateSeason(false);
    // na pozadí (okno bez fokusu, hráč dvě minuty nic nedělá) jdou animace pomaleji; při
    // omezeném pohybu animace stojí a takt slouží jen dokreslování po načtení
    const moving = !this.reducedMotion?.matches;
    const fps = moving ? this.animationFps() : WATER_FPS;
    if (tickDue(now, this.lastAnimationTick, fps)) {
      // takt se posouvá při každé kontrole – kontroly animací nejvýš `fps` za sekundu
      this.lastAnimationTick = nextTick(now, this.lastAnimationTick, fps);
      if (now < this.renderBurstUntil) this.needsRender = true;
      // Voda teče a zvířata se hýbou sama – výjimka z kreslení jen při změně, dokud jsou v záběru.
      if (moving && this.animate(now, camera.camera)) {
        this.needsRender = true;
      }
    }
    if (camera.update(step)) {
      this.needsRender = true;
      // obilí z dálky řídne (trsy), pole pak nese obtisk porostu
      this.village?.setView(camera.camera.radius);
      // Pod nehybným kurzorem je po pohybu kamery jiné políčko.
      if (this.pointerInside) this.pointerMoved = true;
      const { target, radius } = camera.camera;
      this.ambient?.setView({ x: target.x, z: target.z, radius });
      if (this.viewListeners.size > 0) {
        const view = this.viewFootprint();
        if (view) for (const listener of this.viewListeners) listener(view);
      }
    }
    this.pickHoveredTile();
    this.placement?.tick(now);
    if (!this.needsRender || this.contextLost || this.engine.isDisposed) return;
    this.needsRender = false;
    this.engine.beginFrame();
    this.scene.render(false);
    this.engine.endFrame();
    this.perf?.frameDrawn(now);
  }

  /** Voda, ryby a ptáci, dým, zvířata, lidé, voli a obilí – true, když se něco v záběru hnulo. */
  private animate(now: number, camera: Camera): boolean {
    let animated = false;
    // zamrzlá voda neteče – v záběru jen led a stojí, nepřekresluje se
    if (this.water?.flowsInView(camera)) {
      this.water.animate(now / 1000);
      animated = true;
    }
    if (this.fauna?.animate(now / 1000, camera)) animated = true;
    // dým z obydlí – rozvrh ohně podle herního dne, proto skutečný čas
    const epochMs = Date.now();
    if (this.village?.animateSmoke(epochMs, camera)) animated = true;
    // domácí zvířata – skutečný čas (epoch ms), ne herní: stejný okamžik = stejná póza
    if (this.livestock?.animate(epochMs, camera)) animated = true;
    // lidé ve vsi – skutečný čas jako zvířata
    if (this.villagers?.animate(epochMs, camera)) animated = true;
    // voli a krávy v ohradách a spřežení na poli (oxen.md) – skutečný čas jako zvířata
    if (this.village?.animateOxen(epochMs, camera)) animated = true;
    // obilí ve větru – jen zralé a zelené v záběru
    if (this.village?.animateFields(epochMs, camera)) animated = true;
    // den a noc – slunce jde po obloze (světlo se mění pomalu, stačí DAY_LIGHT_MS)
    if (this.dayClock && now - this.daylightAt >= DAY_LIGHT_MS && this.applyLight(false)) {
      animated = true;
    }
    return animated;
  }

  /**
   * Plynulost animací (snímků za sekundu) – při omezeném pohybu stojí, na pozadí méně
   * (render-loop.ts – `animationFps`).
   */
  private animationFps(): number {
    if (this.reducedMotion?.matches) return 0;
    return animationFps({
      focused: this.focused,
      idleMs: performance.now() - this.lastInputAt,
    });
  }

  /**
   * Vrhač stínu ze vsi (stavby, jabloně sadu – vznikají až po krajině). Listnáče (jabloně) se
   * zařadí mezi holé v zimě, ať nevrhají stín plného listí.
   */
  private addVillageCaster(mesh: Mesh): void {
    const deciduous = isDeciduousMesh(mesh.name) && !this.deciduousCasters.includes(mesh);
    if (deciduous) this.deciduousCasters.push(mesh);
    if (!this.shadows) {
      this.pendingCasters.push(mesh);
      return;
    }
    this.shadows.addCaster(mesh);
    if (deciduous && this.bareShadows) this.shadows.setCastersEnabled([mesh], false);
  }

  /** Den v roce scény – vývojový přepínač, jinak podle herního data světa. */
  private seasonDayOfYear(): number {
    return this.seasonDay ?? seasonDayAt(Date.now(), this.worldClock ?? OFFICIAL_WORLD);
  }

  /**
   * Roční období podle herního data (nebo vývojového přepínače): když se vzhled znatelně
   * změnil, nastaví světlo, opar, vodu, stíny, zvuky a uniformy materiálů a scénu jednou
   * překreslí. Vzhled se mění nejvýš jednou za herní den – žádné kreslení navíc.
   */
  private updateSeason(force: boolean): void {
    this.seasonCheckAt = performance.now() + SEASON_CHECK_MS;
    const day = this.seasonDayOfYear();
    const look = seasonLook(day);
    // pole podle dne (odhad vzhledu, seč luk) a sněhu – přestaví se, jen když se něco změnilo
    if (this.village?.setSeason(day, look.snow)) {
      this.shadows?.refresh();
      this.needsRender = true;
    }
    if (!force && this.season && seasonLookDistance(look, this.season) < SEASON_EPSILON) {
      // den a noc při omezeném pohybu (animace stojí): světlo po krocích jednou za sekundu
      if (this.dayClock && this.reducedMotion?.matches && this.applyLight(false)) {
        this.needsRender = true;
      }
      return;
    }
    this.season = look;
    setSeasonShaderState(this.scene, look);
    const bare = look.leaves < BARE_SHADOW_LEAVES;
    if (this.shadows && bare !== this.bareShadows) {
      this.bareShadows = bare;
      this.shadows.setCastersEnabled(this.deciduousCasters, !bare);
      // obnoví i stínovou mapu – setCastersEnabled ji překreslí
      this.impostorForest?.setBareShadows(bare);
    }
    this.fauna?.setIce(look.ice);
    this.ambient?.setSeason({ ...look.sound, ice: look.ice });
    this.applyLight(true);
    this.needsRender = true;
  }

  /**
   * Světlo scény z ročního období a denní doby (day-light.ts): slunce (v noci měsíc) a jeho
   * směr, obloha, opar, okolní světlo, stíny, tón impostorů a dýmu a odraz oblohy na vodě. Bez
   * hodin dne světlo ročního období a pevné slunce SUN_DIRECTION jako dřív. Vrátí true, když se
   * světlo (znatelně) změnilo – scénu je třeba překreslit.
   */
  private applyLight(force: boolean): boolean {
    const look = this.season;
    if (!look) return false;
    this.daylightAt = performance.now();
    const hour = this.dayClock ? this.dayClock(Date.now()) : null;
    const day = dayLight(look, this.seasonDayOfYear(), hour);
    if (!force && this.daylight && dayLightDistance(day, this.daylight) < DAY_LIGHT_EPSILON) {
      return false;
    }
    this.daylight = day;
    const { light } = day;
    const scene = this.scene;
    const sun = scene.getLightByName('sun');
    if (sun instanceof DirectionalLight) {
      sun.intensity = light.sunIntensity;
      sun.diffuse.set(...light.sunColor);
      sun.specular.set(...day.specular);
      const { x, y, z } = day.direction;
      if (this.shadows) {
        this.shadows.aim(day.direction, light.sunIntensity * day.shadowStrength > SHADOW_VISIBLE);
      } else if (sun.direction.x !== x || sun.direction.y !== y || sun.direction.z !== z) {
        sun.direction.set(x, y, z);
      }
    }
    const sky = scene.getLightByName('sky');
    if (sky instanceof HemisphericLight) {
      sky.intensity = light.skyIntensity;
      sky.diffuse.set(...light.skyColor);
      sky.groundColor.set(...light.groundColor);
    }
    scene.ambientColor.set(...day.ambient);
    const curves = scene.imageProcessingConfiguration.colorCurves;
    if (scene.imageProcessingConfiguration.colorCurvesEnabled && curves) {
      curves.globalHue = day.grade.hue;
      curves.globalDensity = day.grade.density;
      curves.globalSaturation = day.grade.saturation;
    }
    scene.clearColor.set(...light.clearColor, 1);
    scene.fogColor.set(...light.fogColor);
    scene.fogDensity = light.fogDensity;
    // v zimě holé listnáče propouštějí světlo; nízké slunce a měsíc vrhají slabší stín
    const darkness =
      SHADOW_DARKNESS + (WINTER_SHADOW_DARKNESS - SHADOW_DARKNESS) * (1 - look.leaves);
    this.shadows?.setDarkness(
      day.shadowStrength >= 1 ? darkness : 1 - (1 - darkness) * day.shadowStrength,
    );
    this.impostorForest?.setTone(day.tone);
    this.village?.setLightTone(day.tone);
    this.water?.setSeason(look.water.tint, day.waterSky, look.ice);
    return true;
  }

  /**
   * Chvíli kreslit v taktu animací (WATER_FPS): WebGL kompiluje shadery paralelně a první snímky
   * po načtení nebo změně velikosti nemusí obsahovat vše – bez toho by na obrazovce zůstal
   * neúplný obraz. Hned teď se kreslí vždy.
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

/** Vstupy hráče, po kterých jdou animace zase plně (nižší plynulost po nečinnosti). */
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

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
    changes ? [changes.removed.length, changes.stumps.length, (changes.added ?? []).length] : 0,
  ]);
}
