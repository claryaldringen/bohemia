import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { WovenFenceRenderer } from './woven-fence-renderer';
import type { Scene } from '@babylonjs/core/scene';
import {
  dateOfDayIndex,
  DRAFT_OXEN,
  OFFICIAL_WORLD,
  realTimeOf,
  threshingFloorFootprint,
  type DwellingType,
  type ObstacleLayer,
  type SacredBuildingKind,
  type WorldClock,
} from '@bohemia/game';
import type {
  SceneKiln,
  SceneKilnRemnant,
  SceneThreshingFloor,
  SceneVillage,
} from '../village-view';
import { buildingClearings } from './building-clearings';
import { CemeteryRenderer } from './cemetery-renderer';
import { withoutHiddenMounds, type FuneralPlan } from './funeral-plan';
import { FuneralRenderer } from './funeral-renderer';
import type { WeddingPlan } from './wedding-plan';
import { WeddingRenderer } from './wedding-renderer';
import { ChurchSiteRenderer } from './church-site-renderer';
import { OreSiteRenderer } from './ore-sites';
import { GrainPitRenderer } from './grain-pits';
import { ThreshingFloorRenderer } from './threshing-floor-renderer';
import { CraftYardRenderer } from './craft-yard-renderer';
import { smeltVents, type CraftYardView } from './craft-yard-layout';
import { floorSiteLook } from './threshing-floor-layout';
import {
  DECAY_LOOKS,
  decayModelParts,
  decayModelType,
  decayNettles,
  logHouseRemains,
  ruinHollowData,
  type DecayStage,
  type LogHouseRemain,
  ruinHollowY,
  ruinLook,
  ruinPitShape,
} from './dwelling-decay';
import { eaveTufts, smokeVent, type TuftModel } from './dwelling-decor';
import { hasPit, pitShapeOf, type PitCut } from './dwelling-pit';
import { FieldRenderer } from './field-renderer';
import type { Track } from './track-mask';
import type { HayMeadow } from './hay-meadows';
import { HomesteadRenderer } from './homestead';
import { plotInward } from './homestead-layout';
import { loadMergedModel, loadModelParts, type ModelInstance } from './instanced-model';
import { OrchardRenderer } from './orchard-renderer';
import { PenAnimals } from './pen-animals';
import { penAnimalsFor } from './pen-layout';
import { PenRenderer } from './pen-renderer';
import { TrainingGroundRenderer } from './training-ground';
import { trainingGroundOf } from './training-ground-layout';
import {
  PLOUGH_DAY_DEBUG,
  dayStints,
  splitStints,
  startOfDayVillage,
  type DayStint,
} from './plough-day';
import { ploughFront, ploughTeamCount } from './plough-front';
import { ploughPath } from './plough-team';
import { PloughTeams } from './plough-team-renderer';
import { CartRenderer } from './cart-renderer';
import type { DraftPick, DraftSelection } from './draft-pick';
import type { Project } from './villager-pick';
import type { DraftCrews } from './villager-plan';
import { buildingCartPlans, draftTeamsToday, villageCartPlans } from './village-carts';
import { penHerds, scenePenViews } from './village-pens';
import { SACRED_SITE_KIND, sacredBuildingKey } from './sacred-layout';
import { SacredRenderer } from './sacred-renderer';
import { ChurchRenderer } from './church-renderer';
import type { SceneChurch } from '../church-view';
import type { SlaughterPlan } from './slaughter-plan';
import { SlaughterRenderer } from './slaughter-renderer';
import { ROUND_SITE_M, constructionState, sitePropPlace } from './village-construction';
import {
  decalGrid,
  dwellingHideShape,
  footprintRect,
  localToWorld,
  polygonBounds,
  rectCorners,
  sceneFrame,
  shapedToWorld,
  softCoverage,
  type HideShape,
  type Point,
  type ShapedSceneDwelling,
} from './village-layout';
import { createDecalMesh } from './village-meshes';
import { StakingPegs, pegInstances } from './staking';
import { closedLine } from './staking-layout';
import { WildGrowthRenderer } from './wild-growth-renderer';
import type { Rgb } from './season-look';
import { VillageSmoke, type SmokeSource } from './village-smoke';
import { burningSquares, slashPlumes } from './clearing-fire';
import { houseFirePlumes } from './house-fire';
import { gameDayAt } from './smoke-schedule';
import type { SceneDwelling, SceneRuin } from './village-types';
import {
  CRAFT_MODEL,
  forestKilnAnchor,
  kilnLook,
  milirCircle,
  milirFootPoints,
  kilnVents,
  milirHideShape,
  milirPlace,
  workshopVents,
  type KilnLook,
} from './workshop-layout';
import {
  CRAFT_MODEL_BASE_URL,
  CRAFT_MODEL_KEYS,
  CRAFT_SITE_FILES,
  CHURCH_KILN_SMOKE_SEED,
  CRAFT_SMOKE_SEED,
  SLASH_SMOKE_SEED,
  HOUSE_FIRE_SMOKE_SEED,
  DECAY_MODEL_URL,
  DWELLING_SINK_M,
  DWELLING_TYPES,
  DraftRenderState,
  DwellingView,
  KILN_DRAW_PROPS,
  KILN_REMNANT_ALPHA,
  KILN_REMNANT_COLOR,
  KILN_REMNANT_RADIUS_M,
  LIFT,
  LAZY_DWELLING_TYPES,
  isLazyDwelling,
  lazyDwellingUrls,
  type LazyDwellingType,
  MODEL_BASE_URL,
  ModelKey,
  RuinView,
  SMOKE_TEXTURE_URL,
  THRESHING_FLOOR_ALPHA,
  THRESHING_FLOOR_ALPHA_INDEX,
  THRESHING_FLOOR_Z_OFFSET,
  THRESHING_FLOOR_COLOR,
  THRESHING_FLOOR_SOFT_M,
  TRAMPLED_SOFT_M,
  TUFT_MODELS,
  VillageContext,
  dwellingDecay,
  dwellingKey,
  houseHideShape,
  isCraftModel,
  kilnDwelling,
  kilnKey,
  plotViews,
  prepareDecayMaterial,
  prepareDwellingMaterial,
  prepareTuftMaterial,
  ruinId,
  ruinKey,
  setInstances,
  shapeableAs,
  siteKind,
} from './village-renderer-shared';
import {
  constructionSite,
  decalMaterial,
  dwellingGround,
  milirGround,
  milirSite,
  pitMaterial,
  ruinMaterial,
  stakingLine,
} from './village-renderer-meshes';
import type { MeshHost } from './village-renderer-meshes';
import { FortificationRenderer } from './fortification-renderer';
export type { DraftRenderState } from './village-renderer-shared';

/**
 * Ves ve scéně: hotová obydlí jako modely (thin instances, jeden mesh na typ) nad vyhloubenou
 * jámou se schody, kolem nich vyšlapaná hlína a trsy trávy u okapu, z dýmníku občas dým;
 * staveniště po fázích (village-construction.ts) z dílů modelu a rekvizit v instancích, jáma
 * se prohlubuje s průběhem; pole a louky na seno (field-renderer.ts);
 * pohřebiště s plotem a mohylkami (cemetery-renderer.ts); jabloňové sady (orchard-renderer.ts).
 * `update` mění jen to, co se změnilo.
 */
export class VillageRenderer {
  private readonly dwellings = new Map<number, DwellingView>();
  /** Milíře uhlířů v lese (crafts.md – Uhlíř) – ušlapaná zem, vytyčení a kolíky podle fáze. */
  private readonly kilns = new Map<
    number,
    { key: string; meshes: Mesh[]; shape: HideShape; pegs: ModelInstance[] }
  >();
  /** Milířiště po rozebraných milířích – černá uhlíkatá zem, která zarůstá (crafts.md). */
  private readonly kilnRemnants = new Map<number, { key: string; mesh: Mesh }>();
  /** Obtisky mlatu humen (`updateThreshingFloors`); zbytek humna kreslí `threshing`. */
  private readonly threshingFloors = new Map<number, { key: string; mesh: Mesh }>();
  private readonly models = new Map<ModelKey, Mesh | null>();
  private readonly ghosts = new Map<ModelKey, Mesh>();
  /** Modely dílen a milíře se načítají, až jsou potřeba (dílna ve vsi, duch při umisťování). */
  private craftLoading: Promise<void> | null = null;
  private craftSiteLoading: Promise<void> | null = null;
  /**
   * Dvorec vojvody (trade.md), nadzemní dům a srubový dvorec (log-house.md) – model a díly
   * staveniště se načtou až s prvním takovým obydlím ve vsi nebo s duchem při umisťování.
   */
  private readonly lazyLoading = new Map<LazyDwellingType, Promise<void>>();
  private readonly tufts = new Map<TuftModel, Mesh | null>();
  /** Pozemky polozemnic – plot, záhony a cestička (homestead.ts). */
  private readonly plots: HomesteadRenderer;
  /** Pletené ploty pozemků a hřbitovů (woven-fence-renderer.ts). */
  private readonly fences: WovenFenceRenderer;
  /** Opevnění (fortifications.md – Ve scéně): palisáda, plot, val s příkopem a brány. */
  private readonly fortifications: FortificationRenderer;
  private readonly materials = new Map<string, Material>();
  private loading: Promise<void> | null = null;
  private builtKey = '';
  /** Díly staveniště a rekvizity z construction.glb podle jména uzlu (zemnice-thatch-1, site-spoil…). */
  private readonly siteParts = new Map<string, Mesh>();
  private siteLoading: Promise<void> | null = null;
  private siteKey = '';
  /** Díly rozpadu z decay.glb podle jména uzlu (zemnice-2-thatch, polozemnice-ruin, nettle…). */
  private readonly decayParts = new Map<string, Mesh>();
  private decayLoading: Promise<void> | null = null;
  private decayKey = '';
  /** Zbytky jam po zaniklých obydlích (klíč = id a den zániku). */
  private readonly ruins = new Map<string, RuinView>();
  private readonly smoke: VillageSmoke;
  private readonly cemeteries: CemeteryRenderer;
  /** Pohřby – máry, hranice, oheň a dým (cemetery.md – Pohřeb ve scéně). */
  private readonly funerals: FuneralRenderer;
  /** Svatby – oheň obřadu a věnec na posvátném dubu (kinship.md – Svatba ve scéně). */
  private readonly weddings: WeddingRenderer;
  private readonly slaughter: SlaughterRenderer;
  /** Mohyly, které hranice ještě nenechala nasypat (klíč pro změnu). */
  private hiddenMoundsKey = '';
  /** Rudiště kovářů – jámy a hromady rudy (crafts.md – Uhlí a ruda kováře). */
  private readonly ores: OreSiteRenderer;
  /** Otevřené obilné jámy (production-chains.md – Obilné jámy). */
  private readonly grainPits: GrainPitRenderer;
  /** Humna kromě obtisku mlatu – vytyčení, hromady, klasy, zrno a stoh slámy. */
  private readonly threshing: ThreshingFloorRenderer;
  /** Dvory kovárny a hrnčíře – redukční pec, houba, hřivny, jáma s hlínou (craft-yard-renderer.ts). */
  private readonly craftYards: CraftYardRenderer;
  private readonly pegs: StakingPegs;
  private readonly orchards: OrchardRenderer;
  private readonly sacred: SacredRenderer;
  private readonly churches: ChurchRenderer;
  private readonly churchSites: ChurchSiteRenderer;
  /** Kostely vsi naposled předané scéně – dým pece staveniště. */
  private churchList: readonly SceneChurch[] = [];
  private readonly fields: FieldRenderer;
  /** Keře a stromky na zarůstajícím přílohu a les vsi (fields.md – Zarůstání). */
  private readonly wild: WildGrowthRenderer;
  /** Ohrady s přístřeškem, zvířata v nich a spřežení na poli (oxen.md – village-pens.ts). */
  private readonly pens: PenRenderer;
  /** Cvičiště vojvodovy rodiny na dvorku dvorce (lord.md – training-ground.ts). */
  private readonly training: TrainingGroundRenderer;
  private readonly penAnimals: PenAnimals;
  private penInput: { village: SceneVillage; oxenOut: number } | null = null;
  private ridingHorses: ReadonlySet<number> = new Set();
  private ridingKey = '';
  private readonly teams: PloughTeams;
  private teamsKey = '';
  /** Vozy se spřežením – svoz a výprava, vůz bez jízdy u ohrady (wagons.md – village-carts.ts). */
  private readonly carts: CartRenderer;
  private cartsKey = '';
  /** Zapřažené vozy dne (id) – mají vozku (villager-plan.ts – `draftStaff`). */
  private cartCrews: number[] = [];
  /** Vybrané spřežení / vůz a jejich poslední stav (villagers.md – Výběr postavy). */
  private draftSelection: DraftSelection | null = null;
  private teamState: DraftRenderState | null = null;
  private cartState: DraftRenderState | null = null;
  private draftState: DraftRenderState | null = null;
  /** Hodiny světa – kdy herní den rozdělení práce začíná a končí (orba za herní den). */
  private worldClock: WorldClock | null = null;
  /** Vlastní okno herního dne (vývojová ukázka „Orání“ – den ukázky), jinak z hodin světa. */
  private ploughClock: ((day: number) => { startMs: number; endMs: number }) | null = null;
  /** Dnešní orba projížděná za herní den (ladicí – oxen.md, Orba za herní den), nebo null. */
  private ploughDay: { stints: DayStint[]; window: { startMs: number; endMs: number } } | null =
    null;
  private readonly meshHost: MeshHost;
  private village: SceneVillage = { dwellings: [], fields: [] };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: VillageContext,
  ) {
    this.meshHost = {
      scene,
      context,
      materials: this.materials,
      baseHeight: (d) => this.baseHeight(d),
    };
    this.smoke = new VillageSmoke(scene, SMOKE_TEXTURE_URL);
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
    this.fences = new WovenFenceRenderer(scene, {
      height: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
    });
    this.fortifications = new FortificationRenderer(scene, {
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
      fences: this.fences,
      pitCuts: context.pitCuts,
      earthMaterial: () => pitMaterial(this.meshHost),
    });
    this.cemeteries = new CemeteryRenderer(scene, {
      decalHeight: context.decalHeight,
      groundHeight: context.groundHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      requestRender: () => context.requestRender(),
      fences: this.fences,
    });
    this.funerals = new FuneralRenderer(scene, {
      groundHeight: context.groundHeight,
      onLoaded: () => context.requestRender(),
    });
    this.weddings = new WeddingRenderer(scene, { groundHeight: context.groundHeight });
    this.slaughter = new SlaughterRenderer(scene, {
      groundHeight: context.groundHeight,
      onLoaded: () => context.requestRender(),
    });
    this.ores = new OreSiteRenderer(scene, {
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
    });
    this.grainPits = new GrainPitRenderer(scene, { decalHeight: context.decalHeight });
    this.threshing = new ThreshingFloorRenderer(scene, {
      groundHeight: context.groundHeight,
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
    });
    this.craftYards = new CraftYardRenderer(scene, { decalHeight: context.decalHeight });
    this.orchards = new OrchardRenderer(scene, context);
    this.plots = new HomesteadRenderer(scene, {
      groundHeight: context.groundHeight,
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      pathMaterial: () => decalMaterial(this.meshHost, 'grass-dirt'),
      prepareMaterial: prepareDwellingMaterial,
      prepareWeedMaterial: prepareTuftMaterial,
      fences: this.fences,
    });
    this.sacred = new SacredRenderer(scene, context);
    this.churches = new ChurchRenderer(scene, {
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
    });
    this.churchSites = new ChurchSiteRenderer(scene, {
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
    });
    this.fields = new FieldRenderer(scene, context);
    this.wild = new WildGrowthRenderer(scene, {
      groundHeight: context.groundHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
    });
    if (context.landscape) this.fields.setLandscape(context.landscape, null);
    // ozdobné louky na seno vypnuté – seč úhoru i přirozených luk posílá herní jádro po dílech
    // a políčkách (`SceneVillage.hayMeadows` – oxen.md, Seno)
    this.fields.setHayMeadows([]);
    this.pens = new PenRenderer(scene, {
      groundHeight: context.groundHeight,
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
      mudMaterial: () => decalMaterial(this.meshHost, 'mud'),
      fences: this.fences,
    });
    this.training = new TrainingGroundRenderer(scene, {
      groundHeight: context.groundHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
    });
    this.penAnimals = new PenAnimals(scene, {
      groundHeight: context.groundHeight,
      onLoaded: () => context.requestRender(),
    });
    this.teams = new PloughTeams(scene, {
      baseUrl: '/models/plough/',
      groundHeight: context.groundHeight,
      prepareMaterial: prepareDwellingMaterial,
      onLoaded: () => context.requestRender(),
      onSelected: (state) => {
        this.teamState = state ? { kind: 'team', ...state } : null;
        this.emitDraftState();
      },
    });
    this.carts = new CartRenderer(scene, {
      baseUrl: '/models/',
      groundHeight: context.groundHeight,
      prepareMaterial: prepareDwellingMaterial,
      onLoaded: () => context.requestRender(),
      onSelected: (state) => {
        this.cartState = state ? { kind: 'cart', ...state } : null;
        this.emitDraftState();
      },
    });
  }

  /** Vrátí true, když se ve scéně něco změnilo (je co překreslit). */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    this.village = village;
    const dwellings = this.updateDwellings(village.dwellings);
    const kilns = this.updateKilns(village.kilns ?? []);
    const remnants = this.updateKilnRemnants(village.kilnRemnants ?? []);
    // obě části humna se překreslí vždy (ne zkráceným „||“)
    const floorDecals = this.updateThreshingFloors(village.threshingFloors ?? []);
    const floors = this.threshing.update(village.threshingFloors ?? []) || floorDecals;
    const ruins = this.updateRuins(village.ruins ?? []);
    const yards = this.craftYards.update(craftYardViews(village.dwellings));
    if (dwellings || ruins) this.updatePitCuts();
    // ladicí orba za herní den: dnešní díly orby na začátku dne, zbytek přibývá brázdou za rádlem
    this.ploughDay = this.ploughDayOf(village);
    const fields = this.fields.update(
      this.ploughDay ? startOfDayVillage(village, this.ploughDay.stints) : village,
    );
    const wild = this.wild.update(village);
    const cemeteries = this.cemeteries.update(this.shownCemeteries(Date.now()), village.dwellings);
    const ores = this.ores.update(village.oreSites, village.orePits);
    const grainPits = this.grainPits.update(village.grainPits);
    const orchards = this.orchards.update(
      village.orchards ?? [],
      buildingClearings(village.dwellings),
    );
    const plots = this.plots.update(plotViews(village.dwellings));
    const forts = this.fortifications.update(village.forts ?? []);
    const sacred = this.sacred.update(village.sacred);
    const pens = this.updatePens(village);
    const training = this.training.update(trainingGroundOf(village));
    const models = this.updateModels();
    const sites = this.updateConstruction();
    const decay = this.updateDecay();
    const smoke = this.updateSmokeSources();
    return (
      dwellings ||
      ruins ||
      fields ||
      wild ||
      cemeteries ||
      ores ||
      grainPits ||
      orchards ||
      plots ||
      forts ||
      sacred ||
      pens ||
      training ||
      models ||
      sites ||
      decay ||
      smoke ||
      kilns ||
      remnants ||
      floors ||
      yards
    );
  }

  /** Zvířata v ohradách podle poslední vsi a koní na jízdě (`setRidingHorses`). */
  private applyPenHerds(): boolean {
    if (!this.penInput) return false;
    const herds = penHerds(this.penInput.village, this.penInput.oxenOut, this.ridingHorses);
    return this.penAnimals.set(
      this.pens.builtPens().flatMap(({ id, layout }) => {
        const herd = herds.get(id);
        return herd ? penAnimalsFor(layout, herd) : [];
      }),
    );
  }

  /**
   * Koně, kteří jsou teď na jízdě (riders.ts) – nestojí v ohradě (village-pens.ts). Vrátí true,
   * když se ohrady změnily.
   */
  setRidingHorses(ids: ReadonlySet<number>): boolean {
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (key === this.ridingKey) return false;
    this.ridingKey = key;
    this.ridingHorses = ids;
    return this.applyPenHerds();
  }

  /**
   * Ohrady (stavba po fázích), zvířata v nich a spřežení na čele orby (oxen.md – Spřežení
   * postupuje s orbou: pruh u čáry práce, další den dojde na nové čelo). Vrátí true, když se
   * něco změnilo.
   */
  private updatePens(village: SceneVillage): boolean {
    const pens = this.pens.update(scenePenViews(village));
    const day = this.ploughDay;
    // vůl táhne buď vůz, nebo rádlo (oxen.md – Voli se sdílí) – orba jen s páry, které nevozí
    const draft = draftTeamsToday(village, ploughTeamCount(village));
    const routes = day
      ? day.stints.length > 0
        ? splitStints(day.stints, draft.plough)
        : Array.from({ length: draft.plough }, (): DayStint[] => [])
      : null;
    const front = routes ? [] : ploughFront(village).slice(0, draft.plough);
    const pairs = routes ? routes.length : front.length;
    const oxenOut = pairs * DRAFT_OXEN.ard + draft.cartOxen;
    this.penInput = { village, oxenOut };
    const animals = this.applyPenHerds();
    let teams = false;
    if (day && routes) {
      // celá dnešní orba za herní den (ladicí): trasy po dílech dne, brázda za rádlem
      const key = JSON.stringify([
        'day',
        day.window,
        routes.map((r) => r.map((s) => [s.partId, s.from, s.to])),
        village.ploughLegs ?? null,
      ]);
      if (key !== this.teamsKey) {
        this.teamsKey = key;
        this.teams.setRoutes(routes, day.window, Date.now(), village.ploughLegs ?? null);
        teams = true;
      }
      if (this.fields.setFurrows(this.teams.furrows(Date.now()))) teams = true;
    } else {
      const key = JSON.stringify(front.map((a) => a.field));
      if (key !== this.teamsKey) {
        this.teamsKey = key;
        // spřežení, které už orá, dojde na nový pruh pěšky (skutečný čas jako zvířata)
        this.teams.setPaths(
          front.map((a) => ploughPath(a.field)),
          Date.now(),
          front.map((a) => ({ fieldId: a.fieldId, partId: a.partId })),
        );
        teams = true;
      }
      if (this.fields.setFurrows([])) teams = true;
    }
    const carts = this.updateCarts(village);
    return pens || animals || teams || carts;
  }

  /**
   * Vozy (wagons.md – fáze 3): svoz tam a zpět po trase dne tempem volů ve skutečném čase, výprava
   * po stezce, vůz bez jízdy u ohrady. Vrátí true při změně.
   */
  private updateCarts(village: SceneVillage): boolean {
    const pens = this.pens.builtPens();
    // vozy výprav jedou v karavaně podle postupu výpravy v herním čase (caravan.ts)
    const caravans = (village.expeditions ?? []).filter((e) => e.carts.length > 0);
    // rozdělané vozy u tesařů (fáze stavby – craft-yard-layout.ts)
    const building = buildingCartPlans(carpenterYardViews(village.dwellings));
    const key = JSON.stringify([
      village.carts ?? [],
      building,
      pens.map((p) => [p.id, p.layout.square, p.layout.front, p.layout.side]),
      caravans,
      caravans.map((e) => this.dayWindow(e.startDay ?? e.day)),
    ]);
    if (key === this.cartsKey) return false;
    this.cartsKey = key;
    const plans = villageCartPlans(
      village,
      pens,
      (day) => this.dayWindow(day),
      this.context.walkable,
    );
    // vůz se spřežením má vozku (jede, nebo v karavaně), stojící u ohrady ne
    this.cartCrews = plans.flatMap((p) => (!('parked' in p) && p.id !== undefined ? [p.id] : []));
    this.carts.setCarts([...plans, ...building], Date.now());
    return true;
  }

  /**
   * Spřežení a vozy, které ves dnes kreslí (po `update`): kolik spřežení s rádlem a id
   * zapřažených vozů – lidé u nich (oráč, honák, vozka) jsou lidé vsi (villager-plan.ts).
   */
  draftCrews(): DraftCrews {
    return { teams: this.teams.teams, carts: this.cartCrews };
  }

  /**
   * Spřežení nebo vůz pod kurzorem (x, y – CSS px): bližší z obou (vůl, rádlo, korba, oráč,
   * honák, vozka). Jen při kliknutí. Nic – null.
   */
  pickDraft(x: number, y: number, project: Project): DraftPick | null {
    const team = this.teams.pick(x, y, project);
    const cart = this.carts.pick(x, y, project);
    if (cart && (!team || cart.distance < team.distance)) {
      return { kind: 'cart', cart: cart.cart, part: cart.part, distance: cart.distance };
    }
    return team
      ? { kind: 'team', team: team.index, part: team.part, distance: team.distance }
      : null;
  }

  /**
   * Vybere spřežení nebo vůz (celé, nebo člověka u nich) – kroužek sleduje pohyb, co dělá hlásí
   * `onDraftState`; null výběr zruší.
   */
  selectDraft(selection: DraftSelection | null): void {
    this.draftSelection = selection;
    const nowMs = Date.now();
    this.teams.select(
      selection?.kind === 'team' ? { team: selection.team, figure: selection.figure } : null,
      nowMs,
    );
    this.carts.select(
      selection?.kind === 'cart' ? { cart: selection.cart, figure: selection.figure } : null,
      nowMs,
    );
    this.emitDraftState();
  }

  /** Stav vybraného spřežení / vozu – jen při změně. */
  private emitDraftState(): void {
    const kind = this.draftSelection?.kind;
    const state = kind === 'team' ? this.teamState : kind === 'cart' ? this.cartState : null;
    if (state === this.draftState) return;
    this.draftState = state;
    this.context.onDraftState?.(state);
  }

  /**
   * Dnešní orba projížděná za herní den (ladicí – PLOUGH_DAY_DEBUG): pruhy dílů podle rozdělení
   * práce a okno herního dne (z hodin světa, nebo vlastní – `setPloughClock`); bez orby, hodin
   * nebo s vypnutým přepínačem null.
   */
  private ploughDayOf(
    village: SceneVillage,
  ): { stints: DayStint[]; window: { startMs: number; endMs: number } } | null {
    if (!PLOUGH_DAY_DEBUG || !village.labor) return null;
    // při omezeném pohybu se brázda nepřidává – pole ukáže konec dne
    if (this.context.animated && !this.context.animated()) return null;
    const window = this.dayWindow(village.labor.day);
    if (!window) return null;
    const stints = dayStints(village);
    if (stints.length > 0) return { stints, window };
    // spřežení na poli v den bez orby stojí u čela orby (oxen.md – Spřežení zůstane na poli)
    return village.ploughLegs?.stand ? { stints, window } : null;
  }

  /**
   * Kdy herní den `day` začíná a končí (skutečný čas, ms) – z hodin světa, nebo z vlastního okna
   * (vývojové ukázky); karavany výprav (caravan.ts) jdou podle něj.
   */
  gameDayWindow(day: number): { startMs: number; endMs: number } | null {
    return this.dayWindow(day);
  }

  /** Kdy herní den `day` začíná a končí (skutečný čas, ms). */
  private dayWindow(day: number): { startMs: number; endMs: number } | null {
    if (this.ploughClock) return this.ploughClock(day);
    const clock = this.worldClock;
    if (!clock) return null;
    try {
      return {
        startMs: realTimeOf(dateOfDayIndex(day), clock),
        endMs: realTimeOf(dateOfDayIndex(day + 1), clock),
      };
    } catch {
      return null;
    }
  }

  /**
   * Vlastní okno herního dne pro orbu za herní den (vývojová ukázka „Orání“ – den ukázky trvá
   * kratší dobu); null = z hodin světa.
   */
  setPloughClock(clock: ((day: number) => { startMs: number; endMs: number }) | null): void {
    this.ploughClock = clock;
  }

  /** Střed vozu (mezi jhem a korbou, stojící vůz korba) – kam namířit kameru (vývojová ukázka). */
  cartCenter(index = 0): { x: number; z: number } | null {
    return this.carts.center(index);
  }

  /** Střed spřežení (jho a rádlo) – kam namířit kameru (vývojová ukázka). */
  ploughTeamCenter(index = 0): { x: number; z: number } | null {
    return this.teams.center(index);
  }

  /**
   * Posune zvířata v ohradách a spřežení na poli na okamžik `nowMs` (jen v záběru kamery; bez
   * kamery všechno). Vrátí true, když je co překreslit.
   */
  animateOxen(nowMs: number, camera: Camera | null, frozen = false): boolean {
    const animals = this.penAnimals.animate(nowMs, camera, frozen);
    const teams = this.teams.animate(nowMs, camera, frozen);
    const carts = this.carts.animate(nowMs, camera, frozen);
    // brázda za rádlem přibývá s trasou spřežení (ladicí orba za herní den)
    const furrows =
      this.ploughDay !== null && !frozen && this.fields.setFurrows(this.teams.furrows(nowMs));
    return animals || teams || carts || furrows;
  }

  /**
   * Posune dým z obydlí na okamžik `nowMs` (jen dým v záběru kamery; bez kamery všechen).
   * Vrátí true, když je co překreslit.
   */
  animateSmoke(nowMs: number, camera: Camera | null): boolean {
    const smoke = this.smoke.animate(nowMs, camera);
    // pohřební hranice a máry; mohyla se nasype, až hranice vychladne
    const funerals = this.funerals.animate(nowMs, camera);
    const mounds = this.refreshMounds(nowMs);
    // svatby: oheň obřadu, věnec na dubu
    const weddings = this.weddings.animate(nowMs, camera);
    // kovárna: žár a jiskry z redukční pece při tavbě
    const furnaces = this.craftYards.animate(nowMs, camera);
    return smoke || funerals || mounds || weddings || furnaces;
  }

  /**
   * Svatby (kinship.md – Svatba ve scéně): plány s průvodem z villagers.ts – oheň obřadu a věnec
   * s pentlemi na posvátném dubu. Vrátí true, když je co překreslit.
   */
  setWeddings(plans: readonly WeddingPlan[], nowMs: number): boolean {
    return this.weddings.set(plans, nowMs);
  }

  /** Kam namířit kameru na svatbu – průvod, pár (vývojová ukázka). */
  weddingFocus(nowMs: number): ReturnType<WeddingRenderer['focus']> {
    return this.weddings.focus(nowMs);
  }

  /**
   * Pohřby (cemetery.md – Pohřeb ve scéně): plány s průvodem z villagers.ts – máry, hranice
   * a oheň; mohylu pohřbu skryje, dokud hranice nevychladne. Vrátí true, když je co překreslit.
   */
  setFunerals(plans: readonly FuneralPlan[], nowMs: number): boolean {
    const funerals = this.funerals.set(plans, nowMs);
    const mounds = this.refreshMounds(nowMs);
    return funerals || mounds;
  }

  /**
   * Porážka (diet.md – Porážka ve scéně): plán dne z villagers.ts – kozlina, necky, špalek,
   * miska, mršina a kýty (slaughter-renderer.ts). Vrátí true, když je co překreslit.
   */
  setSlaughter(plan: SlaughterPlan | null, nowMs: number): boolean {
    return this.slaughter.set(plan, nowMs);
  }

  /**
   * Posune mršinu, kýty a misku porážky na okamžik `nowMs` – true jen při změně stavu (pád
   * a zvednutí na háky plynule, jinak skokově) a jen v záběru kamery.
   */
  animateSlaughter(nowMs: number, camera: Camera | null): boolean {
    return this.slaughter.animate(nowMs, camera);
  }

  /** Kam namířit kameru na porážku – kozlina prvního stanoviště (vývojová ukázka). */
  slaughterFocus(): { x: number; z: number } | null {
    return this.slaughter.focus();
  }

  /** Kam namířit kameru na pohřeb – máry v průvodu, jinak hranice (vývojová ukázka). */
  funeralFocus(nowMs: number): ReturnType<FuneralRenderer['focus']> {
    return this.funerals.focus(nowMs);
  }

  /** Hřbitovy bez mohyl, které ještě nejsou nasypané (hranice hoří nebo doutná). */
  private shownCemeteries(nowMs: number): NonNullable<SceneVillage['cemeteries']> {
    const hidden = this.funerals.hiddenMounds(nowMs);
    this.hiddenMoundsKey = [...hidden].sort().join('|');
    return withoutHiddenMounds(this.village.cemeteries ?? [], hidden);
  }

  /** Mohyla se nasype po dohoření – překreslí hřbitovy, když se to změnilo. */
  private refreshMounds(nowMs: number): boolean {
    const hidden = [...this.funerals.hiddenMounds(nowMs)].sort().join('|');
    if (hidden === this.hiddenMoundsKey) return false;
    return this.cemeteries.update(this.shownCemeteries(nowMs), this.village.dwellings);
  }

  /** Vývojová volba: dým ze všech hotových obydlí pořád. */
  setSmokeAlways(enabled: boolean): void {
    this.smoke.setAlways(enabled);
  }

  /** Vývojově vynucený den světa pro dým hořícího domu (null = podle hodin světa). */
  setDisasterDay(day: number | null): void {
    this.smoke.setDisasterDay(day);
  }

  /** Den a noc: tón materiálů bez světla (dým) – day-light.ts. */
  setLightTone(tone: Rgb): void {
    this.smoke.setTone(tone);
    this.funerals.setTone(tone);
  }

  /**
   * Vrstva překážek krajiny (skalní výchozy pro stromy sadu, louky na seno bez stromů); vrátí
   * true, když je co překreslit.
   */
  setObstacles(layer: ObstacleLayer): boolean {
    const orchards = this.orchards.setObstacles(layer);
    const meadows = this.fields.setLandscape(this.context.landscape ?? null, layer);
    // věnec na kmeni posvátného dubu podle modelu a měřítka stromu (svatba)
    this.weddings.setObstacles(layer);
    return orchards || meadows;
  }

  /**
   * Den v roce (roční období scény) a sněhová pokrývka – podle dne se odhaduje vzhled polí (dokud
   * ho server neposílá) a seče louky, pod sněhem zmizí nízké trsy, v zimě zamrzne vodní příkop.
   * Vrátí true, když je co překreslit.
   */
  setSeason(dayOfYear: number, snow: number): boolean {
    const day = this.fields.setDay(dayOfYear);
    const covered = this.fields.setSnow(snow);
    // vodní příkop v zimě zamrzne (fortification-renderer.ts)
    const ice = this.fortifications.setSeason(dayOfYear);
    return day || covered || ice;
  }

  /** Vzdálenost kamery – obilí z dálky řídne. Vrátí true, když je co překreslit. */
  setView(radius: number): boolean {
    return this.fields.setView(radius);
  }

  /** Obilí ve větru (jen v záběru); vrátí true, když je co překreslit. */
  animateFields(nowMs: number, camera: Camera | null): boolean {
    return this.fields.animate(nowMs, camera);
  }

  /**
   * Pás pěšin dne (path-renderer.ts) – pod ním pole nekreslí obilí; volá se s novou sítí pěšin.
   * Vrátí true, když je co překreslit.
   */
  setPathTrack(track: Track | null): boolean {
    return this.fields.setPaths(track);
  }

  /**
   * Terén se změnil (úvoz a násep vozové cesty – roads.md, Vozová cesta) v obdélníku `bounds` (m):
   * pole tam se přestaví na novém terénu. Vrátí true, když je co překreslit.
   */
  terrainChanged(bounds: { minX: number; minZ: number; maxX: number; maxZ: number }): boolean {
    return this.fields.terrainChanged(bounds);
  }

  /** Vývojový náhled: louky na seno dané přímo (bez krajiny). */
  setHayMeadows(meadows: HayMeadow[] | null): boolean {
    return this.fields.setHayMeadows(meadows);
  }

  /** Svět, podle jehož herního dne se v obydlích topí (ráno a večer). */
  setWorldClock(world: WorldClock): void {
    this.smoke.setWorldClock(world);
    const changed = this.worldClock !== world;
    this.worldClock = world;
    // orba za herní den potřebuje okno dne – hodiny mohly přijít až po datech vsi
    if (changed && PLOUGH_DAY_DEBUG && this.village.labor) this.update(this.village);
  }

  /** Oblasti, kde se mají skrýt stromy a kameny krajiny. */
  hideShapes(): HideShape[] {
    const shapes: HideShape[] = [];
    for (const view of this.dwellings.values()) shapes.push(...view.shapes);
    for (const view of this.kilns.values()) shapes.push(view.shape);
    for (const view of this.ruins.values()) shapes.push(view.shape);
    shapes.push(...this.fields.hideShapes());
    shapes.push(...this.cemeteries.hideShapes());
    shapes.push(...this.orchards.hideShapes());
    shapes.push(...this.sacred.hideShapes());
    return shapes;
  }

  /**
   * Průhledný model obydlí, řemeslné dílny, milíře, modly nebo svatyně pro ducha při umisťování
   * (null, dokud se model nenačte).
   */
  ghostModel(type: ModelKey | SacredBuildingKind): Mesh | null {
    if (type === 'idol' || type === 'shrine') return this.sacred.ghostModel(type);
    if (isCraftModel(type)) void this.loadCraftModels();
    else void this.loadModels();
    if (isLazyDwelling(type)) void this.loadLazyDwelling(type);
    return this.ghosts.get(type) ?? null;
  }

  /** Načte modely obydlí a trsů (jednou); po načtení se ves překreslí. */
  loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  /**
   * Načte model obydlí z `LAZY_DWELLING_TYPES` a díly jeho staveniště (jednou – dvorec vojvody,
   * nadzemní dům, srubový dvorec); po načtení se ves překreslí.
   */
  private loadLazyDwelling(type: LazyDwellingType): Promise<void> {
    const loading = this.lazyLoading.get(type);
    if (loading) return loading;
    const urls = lazyDwellingUrls(type);
    const promise = (async () => {
      await this.loadModel(type, urls.model);
      try {
        const parts = await loadModelParts(
          this.scene,
          urls.site,
          'village-site-',
          prepareDwellingMaterial,
        );
        for (const [name, mesh] of parts ?? []) {
          // díly nadzemního domu dostanou kosti variant rozměrů, dvorce ne (shapeableAs)
          shapeableAs(mesh, name);
          mesh.setEnabled(false);
          this.context.addShadowCaster(mesh);
          this.siteParts.set(name, mesh);
        }
      } catch (error) {
        console.warn(`Díly staveniště ${type} se nepodařilo načíst.`, error);
      }
      if (this.disposed) return;
      this.builtKey = '';
      this.siteKey = '';
      this.updateModels();
      this.updateConstruction();
      this.context.onAsyncChange();
    })();
    this.lazyLoading.set(type, promise);
    return promise;
  }

  /**
   * Zbytky nadzemních srubů (`logHouseRemains`, log-house.md – Scéna): zřícený prázdný srub
   * a zbytek po zániku – díly staveniště v instancích (`updateConstruction`).
   */
  private logHouseRemainViews(): {
    key: string;
    at: SceneDwelling | SceneRuin;
    parts: LogHouseRemain[];
  }[] {
    const views: { key: string; at: SceneDwelling | SceneRuin; parts: LogHouseRemain[] }[] = [];
    for (const d of this.village.dwellings) {
      const parts = d.built && !d.craft ? logHouseRemains(d.type, dwellingDecay(d)) : null;
      if (parts && parts.length > 0) views.push({ key: `r${dwellingKey(d)}`, at: d, parts });
    }
    for (const r of this.village.ruins ?? []) {
      const parts = logHouseRemains(r.type, 'ruin', r.overgrowth);
      if (parts && parts.length > 0) views.push({ key: ruinKey(r), at: r, parts });
    }
    return views;
  }

  /**
   * Kreslí nadzemní dům stupně `stage` místo hotového modelu zbytky (díly staveniště už jsou
   * načtené)?
   */
  private remainsShown(type: DwellingType, stage: DecayStage): boolean {
    const parts = logHouseRemains(type, stage);
    return parts !== null && parts.every((r) => this.siteParts.has(r.part));
  }

  /** Načte modely obydlí ve vsi, které se nenačítají hned (`LAZY_DWELLING_TYPES`). */
  private loadLazyDwellings(dwellings: readonly Pick<SceneDwelling, 'type' | 'craft'>[]): void {
    for (const type of LAZY_DWELLING_TYPES) {
      if (dwellings.some((d) => !d.craft && d.type === type)) void this.loadLazyDwelling(type);
    }
  }

  /** Načte modely řemeslných dílen a milíře (jednou); po načtení se ves překreslí. */
  loadCraftModels(): Promise<void> {
    this.craftLoading ??= (async () => {
      await Promise.all(
        CRAFT_MODEL_KEYS.map((key) => this.loadModel(key, `${CRAFT_MODEL_BASE_URL}${key}.glb`)),
      );
      if (this.disposed) return;
      this.builtKey = '';
      this.updateModels();
      this.context.onAsyncChange();
    })();
    return this.craftLoading;
  }

  /**
   * Pata milíře: střed, nebo průměr bodů na okraji kupy, když je níž (svah), o kousek zapuštěná
   * jako obydlí.
   */
  milirBaseHeight(position: SceneDwelling['position']): number {
    const h = this.context.groundHeight;
    const [center, ...rim] = milirFootPoints(position);
    const mean = rim.reduce((sum, [x, z]) => sum + h(x, z), 0) / rim.length;
    return Math.min(h(center![0], center![1]), mean) - DWELLING_SINK_M;
  }

  /**
   * Milíře uhlířů – samostatné stavby u skácených buků (crafts.md – Milíř u skácených buků): kotva
   * (poloha „zemnice“, ke které by milíř patřil – `forestKilnAnchor`), vzhled podle fáze a klíč pro
   * přestavbu.
   */
  private kilnPlaces(): { key: string; anchor: SceneDwelling['position']; look: KilnLook }[] {
    return (this.village.kilns ?? []).map((k) => ({
      key: kilnKey(k),
      anchor: forestKilnAnchor(k),
      look: kilnLook(k),
    }));
  }

  /** Instance hotového milíře (pálí se, vypálený, rozebíraný) na milířišti kotvy `anchor`. */
  private milirInstance(
    anchor: SceneDwelling['position'],
    model: NonNullable<KilnLook['model']>,
  ): ModelInstance {
    const milir = milirPlace(anchor);
    return {
      x: milir.x,
      y: this.milirBaseHeight(anchor),
      z: milir.z,
      rotationY: milir.rotation,
      scale: model.scale,
      ...(model.scaleY !== model.scale ? { scaleY: model.scaleY } : {}),
    };
  }

  /** Načte modely modly a svatyně (duch při umisťování). */
  loadSacredModels(): Promise<void> {
    return this.sacred.loadModels();
  }

  /** Pata modly nebo svatyně (duch při umisťování). */
  /** Kostely vsi (churches.md – Scéna); vrátí true, když se něco změnilo. */
  setChurches(list: readonly SceneChurch[]): boolean {
    this.churchList = list;
    const walls = this.churches.setChurches(list);
    const yards = this.churchSites.update(list);
    const smoke = this.updateSmokeSources();
    return walls || yards || smoke;
  }

  sacredBaseHeight(kind: SacredBuildingKind, position: SceneDwelling['position']): number {
    return this.sacred.baseHeight({ kind, position });
  }

  dispose(): void {
    this.disposed = true;
    this.smoke.dispose();
    this.funerals.dispose();
    this.weddings.dispose();
    this.slaughter.dispose();
    this.cemeteries.dispose();
    this.fortifications.dispose();
    this.ores.dispose();
    this.grainPits.dispose();
    this.threshing.dispose();
    this.craftYards.dispose();
    this.plots.dispose();
    // ohrady uvolní své ploty – před sdílenými ploty
    this.pens.dispose();
    this.training.dispose();
    this.fences.dispose();
    this.orchards.dispose();
    this.sacred.dispose();
    this.churches.dispose();
    this.churchSites.dispose();
    this.penAnimals.dispose();
    this.teams.dispose();
    this.carts.dispose();
    this.pegs.dispose();
    this.fields.dispose();
    this.wild.dispose();
    for (const view of this.dwellings.values()) for (const mesh of view.meshes) mesh.dispose();
    this.dwellings.clear();
    for (const view of this.kilns.values()) for (const mesh of view.meshes) mesh.dispose();
    this.kilns.clear();
    for (const view of this.kilnRemnants.values()) view.mesh.dispose();
    this.kilnRemnants.clear();
    for (const view of this.threshingFloors.values()) view.mesh.dispose();
    this.threshingFloors.clear();
    for (const view of this.ruins.values()) for (const mesh of view.meshes) mesh.dispose();
    this.ruins.clear();
  }

  /**
   * Milíře uhlířů v lese (crafts.md – Uhlíř): kruh ušlapané země a vytyčení podle fáze milíře
   * (staveniště milíře `constructionState('milir', …)`), hotový milíř jen ušlapaná zem. Díly a model
   * kreslí `updateConstruction` a `updateModels`, dým `updateSmokeSources`. Vrátí true při změně.
   */
  private updateKilns(kilns: readonly SceneKiln[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const kiln of kilns) {
      seen.add(kiln.id);
      const key = kilnKey(kiln);
      const current = this.kilns.get(kiln.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      const pseudo = kilnDwelling(kiln);
      const site = kilnLook(kiln).site;
      const state = site !== null ? constructionState('milir', site) : null;
      const meshes = state
        ? milirSite(this.meshHost, pseudo, state)
        : [milirGround(this.meshHost, pseudo)];
      const lines =
        state && state.outline > 0
          ? [closedLine(milirCircle(pseudo.position, ROUND_SITE_M.milir.outline))]
          : [];
      this.kilns.set(kiln.id, {
        key,
        meshes,
        shape: milirHideShape(pseudo.position),
        pegs: lines.length > 0 ? pegInstances(lines, this.context.groundHeight) : [],
      });
    }
    for (const [id, view] of this.kilns) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.kilns.delete(id);
      changed = true;
    }
    if (changed) this.refreshPegs();
    return changed;
  }

  /**
   * Milířiště po rozebraných milířích (crafts.md – Milíř u skácených buků): černá kruhová plocha
   * uhlíkaté zeminy, která za 10 let zaroste – krytí ubývá se zarůstáním (po 5 % ze scény vsi).
   * Vrátí true při změně.
   */
  private updateKilnRemnants(remnants: readonly SceneKilnRemnant[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const r of remnants) {
      const alpha = KILN_REMNANT_ALPHA * Math.pow(Math.max(0, 1 - r.overgrowth), 0.8);
      if (alpha < 0.03) continue;
      seen.add(r.id);
      const key = [r.x, r.z, r.overgrowth].join('|');
      const current = this.kilnRemnants.get(r.id);
      if (current?.key === key) continue;
      changed = true;
      current?.mesh.dispose();
      const area = milirCircle(forestKilnAnchor(r), KILN_REMNANT_RADIUS_M);
      const b = polygonBounds(area);
      const pad = TRAMPLED_SOFT_M;
      const mesh = createDecalMesh(
        this.scene,
        `village-kiln-remnant-${r.id}`,
        decalGrid(
          { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
          0.6,
          softCoverage(area, TRAMPLED_SOFT_M * 1.5),
        ),
        {
          height: this.context.decalHeight,
          smoothHeight: this.context.groundHeight,
          lift: LIFT.worn,
          color: KILN_REMNANT_COLOR,
          alpha,
          uv: 20,
        },
      );
      mesh.material = decalMaterial(this.meshHost, 'mud');
      mesh.alphaIndex = 1;
      this.kilnRemnants.set(r.id, { key, mesh });
    }
    for (const [id, view] of this.kilnRemnants) {
      if (seen.has(id)) continue;
      view.mesh.dispose();
      this.kilnRemnants.delete(id);
      changed = true;
    }
    return changed;
  }

  /**
   * Humna (production-chains.md – Humno) – obtisk udusané mlatové plochy přes půdorys, staveniště
   * slaběji podle fáze stavby (`floorSiteLook` – při vytyčení žádný). Stoh, hromady a klasy kreslí
   * `ThreshingFloorRenderer`. Vrátí true při změně.
   */
  private updateThreshingFloors(floors: readonly SceneThreshingFloor[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const f of floors) {
      seen.add(f.id);
      const cover = floorSiteLook(f).decal;
      const { x, z, rotation } = f.position;
      const key = [x, z, rotation, cover].join('|');
      const current = this.threshingFloors.get(f.id);
      if (current?.key === key) continue;
      changed = true;
      current?.mesh.dispose();
      if (cover <= 0) {
        this.threshingFloors.delete(f.id);
        continue;
      }
      const area = threshingFloorFootprint(f.position).map(([px, pz]): Point => [px, pz]);
      const b = polygonBounds(area);
      const pad = THRESHING_FLOOR_SOFT_M;
      const mesh = createDecalMesh(
        this.scene,
        `village-threshing-floor-${f.id}`,
        decalGrid(
          { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
          0.5,
          softCoverage(area, THRESHING_FLOOR_SOFT_M),
        ),
        {
          height: this.context.decalHeight,
          smoothHeight: this.context.groundHeight,
          lift: LIFT.turf,
          color: THRESHING_FLOOR_COLOR,
          alpha: THRESHING_FLOOR_ALPHA * cover,
          uv: 20,
        },
      );
      mesh.material = decalMaterial(this.meshHost, 'mud', THRESHING_FLOOR_Z_OFFSET);
      mesh.alphaIndex = THRESHING_FLOOR_ALPHA_INDEX;
      this.threshingFloors.set(f.id, { key, mesh });
    }
    for (const [id, view] of this.threshingFloors) {
      if (seen.has(id)) continue;
      view.mesh.dispose();
      this.threshingFloors.delete(id);
      changed = true;
    }
    return changed;
  }

  /** Kolíky vytyčení stavenišť obydlí a milířů v lese. */
  private refreshPegs(): void {
    this.pegs.set([
      ...[...this.dwellings.values()].flatMap((view) => view.pegs),
      ...[...this.kilns.values()].flatMap((view) => view.pegs),
    ]);
  }

  /** Načte jeden hotový model (obydlí, dílna, milíř) i s duchem pro umisťování. */
  private async loadModel(key: ModelKey, url: string): Promise<void> {
    try {
      const model = await loadMergedModel(
        this.scene,
        url,
        `village-${key}`,
        prepareDwellingMaterial,
      );
      if (!model) return;
      // Víc materiálů v GLB → po spojení meshů je ořez stěn opačně než u jednomateriálových
      // modelů (instanced-model.ts nastavuje CCW) – otočit zpět. Atlas = jeden materiál.
      const material = model.material;
      if (material instanceof MultiMaterial && material.subMaterials.length > 1) {
        for (const m of material.subMaterials)
          if (m) m.sideOrientation = Material.ClockWiseSideOrientation;
      }
      // Duch dřív, než mesh dostane instance – klon by je jinak nesl s sebou.
      const ghost = model.clone(`village-ghost-${key}`);
      ghost.setEnabled(false);
      ghost.isPickable = false;
      this.ghosts.set(key, ghost);
      // varianty rozměrů domů (population.md) – kosti oblastí až po klonu ducha (ten dostává tvar
      // přímo do vrcholů – shapeGhost)
      shapeableAs(model, key);
      model.setEnabled(false);
      this.models.set(key, model);
      this.context.addShadowCaster(model);
    } catch (error) {
      console.warn(`Model ${key} se nepodařilo načíst.`, error);
      this.models.set(key, null);
    }
  }

  private async load(): Promise<void> {
    await Promise.all([
      ...DWELLING_TYPES.map((type) => this.loadModel(type, `${MODEL_BASE_URL}${type}.glb`)),
      ...TUFT_MODELS.map(async (name) => {
        try {
          const tuft = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${name}.glb`,
            `village-${name}`,
            prepareTuftMaterial,
          );
          if (tuft) {
            tuft.setEnabled(false);
            this.context.addShadowCaster(tuft);
          }
          this.tufts.set(name, tuft);
        } catch (error) {
          console.warn('Trsy trávy u obydlí se nepodařilo načíst.', error);
          this.tufts.set(name, null);
        }
      }),
    ]);
    if (this.disposed) return;
    this.builtKey = '';
    this.updateModels();
    this.context.onAsyncChange();
  }

  private updateDwellings(dwellings: readonly SceneDwelling[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const dwelling of dwellings) {
      seen.add(dwelling.id);
      const key = dwellingKey(dwelling);
      const current = this.dwellings.get(dwelling.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      const state = dwelling.built
        ? null
        : constructionState(siteKind(dwelling), dwelling.progress);
      // nadzemní srub stojí na zemi – terén pod ním zůstává celý (log-house.md – Scéna)
      const dug = hasPit(dwelling.type) && (!state || state.pitDepth > 0);
      // dílna uhlíře je jen zemnice – milíř je samostatná stavba u skácených buků (crafts.md –
      // Milíř u skácených buků, `updateKilns`)
      const meshes = state
        ? constructionSite(this.meshHost, dwelling, state)
        : dwellingGround(this.meshHost, dwelling);
      const lines: Point[][] = [];
      if (state && state.outline > 0) lines.push(stakingLine(this.meshHost, dwelling));
      this.dwellings.set(dwelling.id, {
        key,
        dwelling,
        meshes,
        shapes: [dwellingHideShape(dwelling)],
        cut: dug ? { position: dwelling.position, shape: pitShapeOf(dwelling) } : null,
        pegs: lines.length > 0 ? pegInstances(lines, this.context.groundHeight) : [],
      });
    }
    for (const [id, view] of this.dwellings) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.dwellings.delete(id);
      changed = true;
    }
    if (changed) this.refreshPegs();
    return changed;
  }

  /** Jámy obydlí a zbytků jam prořezávané do terénu (pit-cut.ts). */
  private updatePitCuts(): void {
    const cuts: PitCut[] = [];
    for (const view of this.dwellings.values()) if (view.cut) cuts.push(view.cut);
    for (const view of this.ruins.values()) if (view.cut) cuts.push(view.cut);
    this.context.pitCuts.set(cuts);
  }

  /**
   * Zbytky jam po zaniklých obydlích (dwelling-decay.ts): zarostlá prohlubeň se přestaví, jen
   * když zarostla o další krok (RUIN_LOOK_STEPS). Trámy a kopřivy kreslí `updateDecay`.
   */
  private updateRuins(ruins: readonly SceneRuin[]): boolean {
    let changed = false;
    const seen = new Set<string>();
    for (const ruin of ruins) {
      const id = ruinId(ruin);
      seen.add(id);
      const key = ruinKey(ruin);
      const current = this.ruins.get(id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      // po nadzemním srubu prohlubeň nezbude – jen kameny a kmeny (`logHouseRemains`)
      const pit = hasPit(ruin.type);
      this.ruins.set(id, {
        key,
        ruin,
        meshes: pit ? [this.ruinHollow(ruin)] : [],
        cut: pit
          ? { position: ruin.position, shape: ruinPitShape(ruin.type, sceneFrame(ruin)) }
          : null,
        shape: houseHideShape(ruin),
      });
    }
    for (const [id, view] of this.ruins) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.ruins.delete(id);
      changed = true;
    }
    return changed;
  }

  /** Zarostlá prohlubeň zbytku jámy – tráva z terénu, dole tmavší (barvy ve vrcholech). */
  private ruinHollow(ruin: SceneRuin): Mesh {
    const look = ruinLook(ruin.type, ruin.overgrowth);
    const data = ruinHollowData(
      ruin.type,
      ruin.position,
      {
        base: this.baseHeight(ruin),
        depth: look.depth,
        rim: this.context.decalHeight,
        overgrowth: ruin.overgrowth,
        ...(ruin.charred ? { charred: true } : {}),
      },
      sceneFrame(ruin),
    );
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.uvs = data.uvs;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    const normals = new Float32Array(data.positions.length);
    VertexData.ComputeNormals(data.positions, data.indices, normals);
    vertexData.normals = normals;
    const mesh = new Mesh(`village-ruin-${ruinId(ruin)}`, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = ruinMaterial(this.meshHost);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /**
   * Díly rozpadu (decay.glb) v instancích: rozpadlá obydlí podle stupně místo hotového modelu,
   * kopřivy kolem nich, trámy zbytků jam a kopřivy v nich – přepočítají se, jen když se
   * změnil stupeň některého obydlí nebo krok zarůstání zbytku jámy.
   */
  private updateDecay(): boolean {
    const decayed = this.village.dwellings.filter((d) => d.built && dwellingDecay(d) > 0);
    const ruins = this.village.ruins ?? [];
    const key = [...decayed.map(dwellingKey), ...ruins.map(ruinKey)].join(';');
    if (key === this.decayKey) return false;
    if (decayed.length > 0 || ruins.length > 0) void this.loadDecay();
    if (!this.decayLoading) return false;
    this.decayKey = key;
    const instances = new Map<string, ModelInstance[]>();
    const push = (name: string, instance: ModelInstance): void => {
      const list = instances.get(name);
      if (list) list.push(instance);
      else instances.set(name, [instance]);
    };
    const ground = this.context.groundHeight;
    for (const d of decayed) {
      const stage = dwellingDecay(d);
      const frame = sceneFrame(d);
      const house = {
        x: d.position.x,
        y: this.baseHeight(d),
        z: d.position.z,
        rotationY: d.position.rotation,
        scale: 1,
        shape: frame,
      };
      for (const part of decayModelParts(d.type, stage)) push(part, house);
      for (const n of decayNettles(
        d.type,
        d.position,
        d.id,
        DECAY_LOOKS[stage].nettles,
        1,
        'house',
        frame,
      )) {
        push('nettle', {
          x: n.x,
          y: ground(n.x, n.z) - 0.03,
          z: n.z,
          rotationY: n.rotationY,
          scale: n.scale,
        });
      }
    }
    for (const r of ruins) {
      const look = ruinLook(r.type, r.overgrowth);
      const frame = sceneFrame(r);
      const base = this.baseHeight(r);
      const hollow = {
        base,
        depth: look.depth,
        rim: this.context.decalHeight,
        overgrowth: r.overgrowth,
      };
      const floor = {
        x: r.position.x,
        z: r.position.z,
        rotationY: r.position.rotation,
        scale: 1,
        shape: frame,
      };
      if (look.beams && hasPit(r.type)) {
        push(`${decayModelType(r.type)}-${look.beams}`, { ...floor, y: base - look.depth });
      }
      const nettles = decayNettles(
        r.type,
        r.position,
        r.id * 31 + r.since,
        look.nettles.count,
        look.nettles.scale,
        'pit',
        frame,
      );
      for (const n of nettles) {
        const y = ruinHollowY(r.type, r.position, hollow, n.x, n.z, frame) - 0.03;
        push('nettle', { x: n.x, y, z: n.z, rotationY: n.rotationY, scale: n.scale });
      }
    }
    for (const [name, mesh] of this.decayParts) setInstances(mesh, instances.get(name) ?? []);
    return true;
  }

  /** Načte díly rozpadu (jednou); po načtení se rozpadlá obydlí a zbytky jam překreslí. */
  private loadDecay(): Promise<void> {
    this.decayLoading ??= (async () => {
      try {
        const parts = await loadModelParts(
          this.scene,
          DECAY_MODEL_URL,
          'village-decay-',
          prepareDecayMaterial,
        );
        if (!parts) return;
        for (const [name, mesh] of parts) {
          shapeableAs(mesh, name);
          mesh.setEnabled(false);
          mesh.receiveShadows = true;
          this.context.addShadowCaster(mesh);
          this.decayParts.set(name, mesh);
        }
      } catch (error) {
        console.warn('Díly rozpadu obydlí se nepodařilo načíst.', error);
      }
      if (this.disposed) return;
      this.decayKey = '';
      this.builtKey = '';
      this.updateModels();
      this.updateDecay();
      this.context.onAsyncChange();
    })();
    return this.decayLoading;
  }

  /**
   * Dýmníky hotových obývaných obydlí, pece, výhně a milíře pracujících dílen, ohniště svatyní
   * a pálení paseky (nejvýš MAX_SLASH_PLUMES čtverců) pro dým.
   */
  private updateSmokeSources(): boolean {
    const sources: SmokeSource[] = this.village.dwellings
      .filter((d) => d.built && d.inhabited !== false)
      .map((d) => {
        // dýmník roste s domem (population.md – Varianty rozměrů)
        const vent = smokeVent(d.type, sceneFrame(d));
        const [x, z] = localToWorld(d.position, 0, vent.z);
        return { seed: d.id, x, y: this.baseHeight(d) + vent.y, z };
      });
    // dílna, která dnes vyrábí – pec nebo výheň (uhlíř topí jen v milíři – níž)
    for (const d of this.village.dwellings) {
      if (!d.built || !d.craft || !d.working) continue;
      // kovář při tavbě topí v redukční peci před kovárnou, ne ve výhni (craft-yard-layout.ts)
      const vents =
        d.craft === 'smith' && d.yard?.task === 'smelt'
          ? smeltVents({ id: d.id, craft: d.craft, position: d.position, frame: sceneFrame(d) })
          : workshopVents(d.craft, d.position, sceneFrame(d));
      for (const vent of vents) {
        const milir = vent.kind === 'milir';
        sources.push({
          seed: CRAFT_SMOKE_SEED + d.id * 4 + (milir ? 2 : 1),
          x: vent.x,
          y: (milir ? this.milirBaseHeight(d.position) : this.baseHeight(d)) + vent.y,
          z: vent.z,
          kind: vent.kind,
        });
      }
    }
    // milíře uhlířů – dým jen při pálení (crafts.md – Milíř u skácených buků)
    for (const kiln of this.village.kilns ?? []) {
      if (!kilnLook(kiln).smoke) continue;
      const anchor = forestKilnAnchor(kiln);
      for (const vent of kilnVents(anchor)) {
        sources.push({
          seed: CRAFT_SMOKE_SEED + kiln.id * 4 + 3,
          x: vent.x,
          y: this.milirBaseHeight(anchor) + vent.y,
          z: vent.z,
          kind: vent.kind,
        });
      }
    }
    // vápenná pec staveniště kostela při pálení (churches.md – Stavba): dým jako z milíře
    for (const church of this.churchList) {
      if (!church.site?.burning) continue;
      const { x, z } = church.site.kiln;
      sources.push({
        seed: CHURCH_KILN_SMOKE_SEED + church.id,
        x,
        y: this.context.groundHeight(x, z) + 0.6,
        z,
        kind: 'milir',
      });
    }
    // ohniště hotových svatyní – občas dým jako z obydlí (happiness.md)
    sources.push(...this.sacred.smokeSources());
    // pálení paseky a doutnající spálenina (forest.md – Klučení lesa pro pole – postup)
    const today = Math.floor(gameDayAt(Date.now(), this.worldClock ?? OFFICIAL_WORLD));
    for (const plume of slashPlumes(burningSquares(this.village, today))) {
      sources.push({
        seed: SLASH_SMOKE_SEED + plume.seed,
        x: plume.x,
        y: this.context.groundHeight(plume.x, plume.z) + 0.4,
        z: plume.z,
        kind: 'slash',
        burn: plume.burn,
      });
    }
    // hořící domy v den požáru – hustý dým nad stavbou (disasters.md – Požár, Ve scéně)
    for (const plume of houseFirePlumes(this.village.fire)) {
      sources.push({
        seed: HOUSE_FIRE_SMOKE_SEED + plume.id,
        x: plume.x,
        y: this.context.groundHeight(plume.x, plume.z) + 2.5,
        z: plume.z,
        kind: 'house-fire',
        burn: { burnedDay: plume.day, order: plume.order },
      });
    }
    return this.smoke.setSources(sources);
  }

  /**
   * Díly staveniště (z construction.glb) a rekvizity v instancích – přepočítají se, jen když
   * se změnilo některé staveniště.
   */
  private updateConstruction(): boolean {
    const sites = this.village.dwellings.filter((d) => !d.built);
    // rekvizity stavenišť modly a svatyně (rýč, koš, drny) jsou díly téhož GLB; hromádka
    // kamenů (site-stones) je jen v construction.glb řemesel, který ves nenačítá – nekreslí se
    const sacredSites = (this.village.sacred?.buildings ?? []).filter((b) => !b.built);
    // milíře u dílen i v lese, které se chystají, nebo se rozebírají (koše na uhlí)
    const kilnSites = this.kilnPlaces().filter((k) => k.look.site !== null || k.look.baskets);
    const remains = this.logHouseRemainViews();
    const key = [
      ...sites.map(dwellingKey),
      ...sacredSites.map(sacredBuildingKey),
      ...kilnSites.map((k) => k.key),
      ...remains.map((r) => r.key),
    ].join(';');
    if (key === this.siteKey) return false;
    if (sites.length > 0 || sacredSites.length > 0 || kilnSites.length > 0 || remains.length > 0) {
      void this.loadConstruction();
    }
    if (sites.some((d) => d.craft) || kilnSites.some((k) => k.look.site !== null)) {
      void this.loadCraftConstruction();
    }
    this.loadLazyDwellings([...sites, ...remains.map((r) => r.at)]);
    if (!this.siteLoading) return false;
    this.siteKey = key;
    const instances = new Map<string, ModelInstance[]>();
    const push = (name: string, instance: ModelInstance): void => {
      const list = instances.get(name);
      if (list) list.push(instance);
      else instances.set(name, [instance]);
    };
    for (const d of sites) {
      const kind = siteKind(d);
      const state = constructionState(kind, d.progress);
      const base = this.baseHeight(d);
      const rotationY = d.position.rotation;
      const frame = sceneFrame(d);
      const house = {
        x: d.position.x,
        y: base,
        z: d.position.z,
        rotationY,
        scale: 1,
        shape: frame,
      };
      for (const part of state.parts) push(`${kind}-${part}`, house);
      const inward = d.plot ? plotInward(d.plot.variant) : undefined;
      for (const { prop, scale } of state.props) {
        // hromada hlíny je vlastní síť staveniště (leží na terénu, barvy jako jáma)
        if (prop === 'spoil') continue;
        // rekvizity se s variantou domu posunou, velikost mají svou
        const place = sitePropPlace(kind, prop, inward);
        const [x, z] = shapedToWorld(d.position, frame, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: rotationY + place.rotation,
          scale,
        });
      }
    }
    for (const { at, parts } of remains) {
      const base = this.baseHeight(at);
      for (const { part, drop } of parts) {
        push(part, {
          x: at.position.x,
          y: base - drop,
          z: at.position.z,
          rotationY: at.position.rotation,
          scale: 1,
          shape: sceneFrame(at),
        });
      }
    }
    // milíře: hromada polen roste s připravenými buky, pak se milíř staví po fázích; u rozebíraného
    // stojí koše na uhlí a rýč (crafts.md – Milíř stojí vždy, Milíř u skácených buků)
    for (const { anchor, look } of kilnSites) {
      const milir = milirPlace(anchor);
      const props =
        look.site !== null
          ? constructionState('milir', look.site).props
          : KILN_DRAW_PROPS.map((prop) => ({ prop, scale: 1 }));
      const parts = look.site !== null ? constructionState('milir', look.site).parts : [];
      const heap = {
        x: milir.x,
        y: this.milirBaseHeight(anchor),
        z: milir.z,
        rotationY: milir.rotation,
        scale: 1,
      };
      for (const part of parts) push(`milir-${part}`, heap);
      for (const { prop, scale } of props) {
        const place = sitePropPlace('milir', prop);
        const [x, z] = localToWorld(milir, place.x, place.z);
        const pile = prop === 'timber' ? scale * look.timber : scale;
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: milir.rotation + place.rotation,
          scale: pile,
        });
      }
    }
    for (const b of sacredSites) {
      const kind = SACRED_SITE_KIND[b.kind];
      for (const { prop, scale } of constructionState(kind, b.progress).props) {
        const place = sitePropPlace(kind, prop);
        const [x, z] = localToWorld(b.position, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: b.position.rotation + place.rotation,
          scale,
        });
      }
    }
    for (const [name, mesh] of this.siteParts) setInstances(mesh, instances.get(name) ?? []);
    return true;
  }

  /** Načte díly staveniště (jednou); po načtení se staveniště překreslí. */
  private loadConstruction(): Promise<void> {
    this.siteLoading ??= (async () => {
      try {
        const parts = await loadModelParts(
          this.scene,
          `${MODEL_BASE_URL}construction.glb`,
          'village-site-',
          prepareDwellingMaterial,
        );
        if (!parts) return;
        for (const [name, mesh] of parts) {
          shapeableAs(mesh, name);
          mesh.setEnabled(false);
          this.context.addShadowCaster(mesh);
          this.siteParts.set(name, mesh);
        }
      } catch (error) {
        console.warn('Díly staveniště se nepodařilo načíst.', error);
      }
      if (this.disposed) return;
      this.siteKey = '';
      this.updateConstruction();
      this.context.onAsyncChange();
    })();
    return this.siteLoading;
  }

  /**
   * Díly staveniště řemeslných dílen a milíře (construction.glb a construction-moss.glb
   * řemesel – jednou); po načtení se staveniště překreslí.
   */
  private loadCraftConstruction(): Promise<void> {
    this.craftSiteLoading ??= (async () => {
      await Promise.all(
        CRAFT_SITE_FILES.map(async (file) => {
          try {
            const parts = await loadModelParts(
              this.scene,
              `${CRAFT_MODEL_BASE_URL}${file}`,
              'village-site-',
              prepareDwellingMaterial,
            );
            for (const [name, mesh] of parts ?? []) {
              shapeableAs(mesh, name);
              // díly mají v GLB řemesel jiná jména než u obydlí – kdyby se přesto opakovaly,
              // kreslí se jen první
              if (this.siteParts.has(name)) {
                mesh.dispose();
                continue;
              }
              mesh.setEnabled(false);
              this.context.addShadowCaster(mesh);
              this.siteParts.set(name, mesh);
            }
          } catch (error) {
            console.warn(`Díly staveniště dílny ${file} se nepodařilo načíst.`, error);
          }
        }),
      );
      if (this.disposed) return;
      this.siteKey = '';
      this.updateConstruction();
      this.context.onAsyncChange();
    })();
    return this.craftSiteLoading;
  }

  /**
   * Modely hotových obydlí, řemeslných dílen (u uhlíře i milíř) a trsy u okapu – přepočítají se,
   * jen když se změnila hotová obydlí.
   */
  private updateModels(): boolean {
    const built = this.village.dwellings.filter((d) => d.built);
    // milíře v lese, které už stojí – pálí se, nebo vypálené čekají a rozebírají se
    const kilns = (this.village.kilns ?? []).filter((k) => kilnLook(k).model !== null);
    const key = [...built.map(dwellingKey), ...kilns.map(kilnKey)].join(';');
    if (key === this.builtKey) return false;
    if (built.length > 0 || kilns.length > 0) void this.loadModels();
    if (built.some((d) => d.craft) || kilns.length > 0) void this.loadCraftModels();
    this.loadLazyDwellings(built);
    if (!this.loading) return false;
    this.builtKey = key;
    const instances = new Map<ModelKey, ModelInstance[]>();
    const push = (model: ModelKey, instance: ModelInstance): void => {
      const list = instances.get(model);
      if (list) list.push(instance);
      else instances.set(model, [instance]);
    };
    // rozpadlé obydlí kreslí díly rozpadu (updateDecay) – hotový model jen do jejich načtení
    const decayReady = this.decayParts.size > 0;
    for (const d of built) {
      const stage = dwellingDecay(d);
      // zřícený nadzemní srub kreslí jeho zbytky z dílů staveniště (`logHouseRemains`)
      if (hasPit(d.type) ? decayReady && stage > 0 : this.remainsShown(d.type, stage)) continue;
      push(d.craft ? CRAFT_MODEL[d.craft] : d.type, {
        x: d.position.x,
        y: this.baseHeight(d),
        z: d.position.z,
        rotationY: d.position.rotation,
        scale: 1,
        shape: sceneFrame(d),
      });
    }
    for (const kiln of kilns) {
      push('milir', this.milirInstance(forestKilnAnchor(kiln), kilnLook(kiln).model!));
    }
    for (const [model, mesh] of this.models) {
      if (mesh) setInstances(mesh, instances.get(model) ?? []);
    }
    const tufts = built.flatMap((d) => eaveTufts(d.type, d.position, d.id, sceneFrame(d)));
    for (const name of TUFT_MODELS) {
      const mesh = this.tufts.get(name);
      if (!mesh) continue;
      setInstances(
        mesh,
        tufts
          .filter((t) => t.model === name)
          .map((t) => ({
            x: t.x,
            y: this.context.groundHeight(t.x, t.z) - 0.04,
            z: t.z,
            rotationY: t.rotationY,
            scale: t.scale,
          })),
      );
    }
    return true;
  }

  /** Výška vykresleného terénu (obtisky ducha při umisťování). */
  decalHeight(x: number, z: number): number {
    return this.context.decalHeight(x, z);
  }

  /**
   * Pata modelu: střed, nebo průměr rohů půdorysu (podle varianty rozměrů), když je níž (svah),
   * o kousek zapuštěná.
   */
  baseHeight(d: ShapedSceneDwelling & Pick<SceneDwelling, 'position'>): number {
    const h = this.context.groundHeight;
    const corners = rectCorners(d.position, footprintRect(d));
    const mean = corners.reduce((sum, [x, z]) => sum + h(x, z), 0) / corners.length;
    return Math.min(h(d.position.x, d.position.z), mean) - DWELLING_SINK_M;
  }
}

/** Hotové kovárny a hrnčíři pro dvory dílen (craft-yard-layout.ts). */
/** Hotové dílny tesařů s rozdělaným vozem (`SceneCraftYard.cart`). */
function carpenterYardViews(dwellings: SceneVillage['dwellings']): CraftYardView[] {
  return dwellings.flatMap((d): CraftYardView[] =>
    d.built && d.craft === 'carpenter' && d.yard?.cart
      ? [{ id: d.id, craft: d.craft, position: d.position, frame: sceneFrame(d), yard: d.yard }]
      : [],
  );
}

function craftYardViews(dwellings: SceneVillage['dwellings']): CraftYardView[] {
  return dwellings.flatMap((d): CraftYardView[] =>
    d.built && (d.craft === 'smith' || d.craft === 'potter')
      ? [
          {
            id: d.id,
            craft: d.craft,
            position: d.position,
            frame: sceneFrame(d),
            ...(d.yard ? { yard: d.yard } : {}),
          },
        ]
      : [],
  );
}
