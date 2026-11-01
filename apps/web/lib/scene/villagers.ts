// Postavy ve vsi (docs/design/villagers.md): GLB z 0 A.D. s kostrou a animacemi
// (tools/blender/people_from_0ad.py), animace zapečené do textury matic kostí (Babylon baked
// vertex animation, VAT) a postavy jako thin instances – jeden mesh a jeden draw call na druh
// postavy (žena, muž), každá instance má vlastní klip, fázi a rychlost
// (bakedVertexAnimationSettingsInstanced), barvu oděvu a vlasů (villagerLook). Pod každou
// postavou měkký kruhový stín (thin instances, třetí draw call). Kdo kde je, plánuje
// villager-plan.ts z rozdělení práce dne, pohyb je čistá funkce času (villager-motion.ts).
import { dogPlansKey, type DogPlan } from './dogs';
import { FishingLines, fishingLine } from './fishing-lines';
import { isRiding, rideArea, ridePlansKey, type RidePlan } from './riders';
import type { HuntSpotFn } from './villager-plan-lord';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { ToHalfFloat } from '@babylonjs/core/Misc/halfFloat';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { obstacleIndex, obstacleStatus, obstaclesNear, type ObstacleLayer } from '@bohemia/game';
import { squareObstacles } from './clearing-slash-layout';
import type { SceneVillage } from '../village-view';
import { caravanPoints } from './caravan';
import type { FuneralPlan } from './funeral-plan';
import type { SlaughterPlan } from './slaughter-plan';
import type { WeddingPlan } from './wedding-plan';
import {
  createVillagerPose,
  villagerSeconds,
  walkSpeed,
  isWalkClip,
  type HerdView,
  type PoseFn,
  type VillagerKind,
  type VillagerPose,
  type VillagerStage,
} from './villager-motion';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { carryErrands } from './villager-errands';
import { personFigure } from './villager-plan-cast';
import { phaseWalking, type PhaseName } from './villager-phases';
import { activityStage } from './villager-schedule';
import { dayExtent, scheduledState, Timetable } from './villager-timetable';
import type { ScenePerson } from '../person-view';
import { samePersonState, type PersonFigureState } from '../person-activity';
import { RING_SIZE_M, SelectionRing } from './selection-ring';
import { pickPersonHit, selectedFigure, type Project } from './villager-pick';
import {
  planFunerals,
  planVillagersWithCrew,
  planWeddings,
  type DraftCrew,
  type DraftCrews,
  FIGURE_SCALE,
  type HairLook,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPaths,
  type WalkRouteFn,
} from './villager-plan';
import type { PersonJob } from './villager-roster';

const KINDS: readonly VillagerKind[] = ['woman', 'man'];

/**
 * Tempo chůze ode dveří k práci (m/s – délky z odhadu sítě pěšin, `Timetable.setEstimate`):
 * dospělá žena krokem; jiná velikost postavy jde stejně rychle, nohy jdou tempem podle velikosti.
 */
const SCHEDULE_WALK_M_S = walkSpeed('woman', 'walk', FIGURE_SCALE);

/** Snímků za sekundu zapečené animace (klíče animací 0 A.D.). */
const BAKE_FPS = 24;
/** Jak dlouho (ms) smí jeden kousek pečení VAT držet hlavní vlákno, než ho pustí (`idle`). */
const BAKE_SLICE_MS = 8;
/** Dál od kamery (m) se lidé nehýbou – jsou pár pixelů a pohyb by jen zbytečně kreslil. */
const ANIMATE_RANGE_M = 700;
/** Výška obalu postav nad terénem (m). */
const HEAD_ROOM_M = 2.6;
/**
 * Kruhový stín pod postavou: průměr (m při měřítku 1 – roste s měřítkem postavy i se
 * stylizovaným zvětšením FIGURE_SCALE), krytí uprostřed, výška nad terénem.
 */
const SHADOW_SIZE_M = 1.15;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;
/**
 * Svatební věnec nevěsty (kinship.md – Svatba ve scéně): vlasy po buňkách textury – kolik buněk
 * na šířku textury (kvítek nebo lístek na buňku, GLSL i WGSL číslo s tečkou).
 */
const WREATH_CELLS = '90.0';
/** Kód vlasů pro shader (villagerLook.w). */
const HAIR_CODE: Record<HairLook, number> = { natural: 0, grey: 1, linen: 2, madder: 3, wreath: 4 };

export interface VillagersEnvironment {
  /** Okraj lesa u zvěře pro lov dne (VillageWildlife.huntSpot); bez údaje nejbližší okraj lesa. */
  huntSpot?: HuntSpotFn;
  /** Vrstva překážek krajiny – stromy ke kácení. */
  layer: ObstacleLayer;
  /** Schůdná země (přes celou krajinu, počítaná líně – livestock-placement.ts), bez obydlí null. */
  ground(village: SceneVillage): { walkable(x: number, z: number): boolean } | null;
  /** Přesná výška vykresleného terénu. */
  groundHeight(x: number, z: number): number;
  /** Adresa modelů (…/woman.glb). */
  baseUrl: string;
  /** Stáda v okamžiku `nowMs` (pasáčci). */
  herds(nowMs: number): readonly HerdView[];
  /** Dočetly se modely a lidé se objevili – překreslit. */
  onLoaded(): void;
  /**
   * Je bod v okamžik `nowMs` pod vodou povodně (storm-renderer.ts – `floodedAt`)? Lidé na rozlitou
   * vodu nechodí a kdo tam je, jde domů (villagers.md – Události). Bez údaje sucho.
   */
  flooded?(x: number, z: number, nowMs: number): boolean;
  /** Okno herního dne (skutečný čas) – karavany výprav (caravan.ts); bez hodin null. */
  dayWindow?(day: number): { startMs: number; endMs: number } | null;
  /**
   * Nové plány pohřbů (funeral-plan.ts – průvod, hranice, máry): kreslí je ves (hranice, máry)
   * a mohylu pohřbu do dohoření skryje. Volá se jen při změně.
   */
  onFunerals?(plans: readonly FuneralPlan[]): void;
  /**
   * Nové plány svateb (wedding-plan.ts – průvod, obřad u posvátného místa): oheň obřadu a věnec
   * s pentlemi na posvátném dubu kreslí ves. Volá se jen při změně.
   */
  onWeddings?(plans: readonly WeddingPlan[]): void;
  /**
   * Nový plán porážky (slaughter-plan.ts – stanoviště, kozlina, mršina, kýty): kreslí ho
   * slaughter-renderer; bez porážky (nebo bez modelů postav) null. Volá se jen při změně.
   */
  onSlaughter?(plan: SlaughterPlan | null): void;
  /**
   * Vybraný člověk (villagers.md – Výběr postavy): co jeho postava dělá, kde v pochůzce je a jestli
   * je vidět – volá se jen při změně (výběr, nový plán dne, postava vejde domů nebo vyjde).
   */
  onPersonState?(state: PersonFigureState | null): void;
  /**
   * Noví lidé u spřežení a vozů (`crew` – oráč, honák, vozka) – volá se jen při změně; scéna podle
   * nich přesune výběr člověka u spřežení či vozu (jejich postavy kreslí spřežení a vůz).
   */
  onCrew?(): void;
}

/** Zapečený model: geometrie, textura matic kostí a rozsahy snímků klipů v ní. */
interface BakedModel {
  vertexData: VertexData;
  matricesIndices: Float32Array;
  matricesWeights: Float32Array;
  boneCount: number;
  /**
   * Matice kostí po snímcích (RGBA): half-float (bity v Uint16Array), kde ho engine neumí,
   * float32. Babylon si stejné pole drží pro obnovu po ztrátě kontextu – jiná kopie není.
   */
  vat: Uint16Array | Float32Array;
  frames: number;
  clips: Map<string, { start: number; end: number }>;
  texture: BaseTexture | null;
  /** Maska látky (R) a vlasů (G) ve stejném atlasu (glTF occlusionTexture). */
  mask: BaseTexture | null;
}

interface Kind {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  model: BakedModel;
  matrices: Float32Array;
  settings: Float32Array;
  looks: Float32Array;
}

/**
 * Lidé ve vsi: `update` je rozmístí podle vsi (modely se stáhnou s prvním člověkem), `animate`
 * je posune v čase – jen v záběru, jako zvířata.
 */
export class VillageVillagers {
  private village: SceneVillage | null = null;
  private key = '';
  private herdCount = 0;
  /** Obdélník zemských stezek s karavanami (caravan.ts) – patří do obalu postav. */
  private extent: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private people: PlannedVillager[] = [];
  /** Vlasce rybářů u tůní (fishing-lines.ts) – rybář stojí, čáry se mění jen s postavami. */
  private lines: FishingLines | null = null;
  /** Pohřby (cemetery.md – Pohřeb ve scéně) – průvod a kruh kolem hranice. */
  private funerals: FuneralPlan[] = [];
  private funeralsKey = '';
  /** Svatby (kinship.md – Svatba ve scéně) – průvod, pár a podkova svatebčanů. */
  private weddings: WeddingPlan[] = [];
  private weddingsKey = '';
  /** Porážka dne (diet.md – Porážka ve scéně) – kreslí ji slaughter-renderer. */
  private slaughterKey = '';
  private readonly kinds = new Map<VillagerKind, Kind>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private models: Map<VillagerKind, BakedModel> | null = null;
  private loading: Promise<void> | null = null;
  private readonly pose = createVillagerPose();
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private readonly matrix = new Matrix();
  /** Vyšlapané pěšiny – nosiči a pochůzky pro vodu a dřevo vedou po nich (paths.md). */
  private paths: VillagerPaths | null = null;
  private disposed = false;
  /**
   * Kde postavy naposledy stály (x, y, z po postavách, NaN = není vidět) – výběr kliknutím
   * (`pick`) a kroužek pod vybranou postavou; zapisuje `write`.
   */
  private spots = new Float32Array(0);
  /** Vybraný člověk (id) a jeho kroužek pod nohama (jedna instance – villagers.md). */
  private selected: number | null = null;
  private ring: SelectionRing | null = null;
  private personState: PersonFigureState | null = null;
  /** Spřežení a vozy dne, které kreslí ves (village-renderer.ts – `draftCrews`). */
  private draft: DraftCrews = { teams: 0, carts: [] };
  /** Lidé u spřežení a vozů (oráč, honák, vozka) a co dělají – id člověka → úloha. */
  private crew: DraftCrew = { teams: [], carts: [] };
  private crewJobs = new Map<number, PersonJob>();
  private crewKey = '';
  /** Úsek pochůzky postav vybraného člověka z posledního zápisu (index postavy → úsek). */
  private readonly stages = new Map<number, VillagerStage | null>();
  /**
   * Rozvrhy lidí vsi (villager-timetable.ts – Činnosti od začátku do konce): postava člověka je
   * jeho rozvrh napříč dny. Bez lidí ve scéně (ukázky bez `persons`) null – postavy dne jako dřív.
   */
  private timetable: Timetable | null = null;
  /** Lidé s postavou podle rozvrhu (id). */
  private scheduled = new Set<number>();
  /** Postavy dne bez rozvrhu: cizí (`STRANGER`) a ukázky bez lidí ve scéně. */
  private dayFigures: PlannedVillager[] = [];
  /**
   * Jezdci s trasou (riders.ts): v bloku jízdy sedí na koni vždy – kůň nejede bez jezdce, i kdyby
   * jezdec z rozvrhu ke koni ještě nedošel (villagers.md – Události).
   */
  private mounted = new Map<number, { ride: RidePlan; pose: PoseFn }>();
  /** Vojvoda (role `voivode`) – výběr se mu při vstupu do domu nezruší. */
  private lords = new Set<number>();
  /** Vybraný člověk byl od výběru venku – až zajde do domu, výběr se zruší (kromě vojvody). */
  private selectedOut = false;
  /** Postavy, které právě rybaří (vlasce – `setFishingLines`), jako otisk. */
  private fishingKey = '';

  constructor(
    private readonly scene: Scene,
    private readonly env: VillagersEnvironment,
  ) {}

  /**
   * Lidé podle vsi – plán se přepočítá, jen když se změnilo, co ho určuje (práce dne, obydlí,
   * pole, sady, hřbitovy, překážky, spřežení a vozy dne `draft` – village-renderer.ts,
   * `draftCrews`; bez údaje ty minulé). Vrátí true, když je co překreslit.
   */
  update(village: SceneVillage, nowMs: number, draft: DraftCrews = this.draft): boolean {
    if (this.disposed) return false;
    this.village = village;
    this.draft = draft;
    const key = villageKey(village, draft);
    if (key === this.key) return false;
    this.key = key;
    // v den požáru hasí všichni dospělí – práce vsi může být prázdná, postavy řetězu ne
    if (village.labor && (village.labor.shares.length > 0 || village.fire?.chain)) void this.load();
    return this.rebuild(nowMs);
  }

  /**
   * Jiné hodiny světa (nebo vlastní okno dne ukázky) – karavany a pohřby jdou podle okna herního
   * dne, lidé se rozmístí znovu. Vrátí true, když je co překreslit.
   */
  clockChanged(nowMs: number): boolean {
    if (this.disposed || !this.village) return false;
    this.key = '';
    // okna dnů se posunula – obsazení dnů a činnosti z nich neplatí
    this.timetable?.reset();
    return this.update(this.village, nowMs);
  }

  /**
   * Nové pěšiny (path-renderer.ts) – lidé se rozmístí znovu, ať chodí po nich. Vrátí true, když je
   * co překreslit.
   */
  setPaths(paths: VillagerPaths | null, nowMs: number): boolean {
    if (this.disposed || paths === this.paths) return false;
    this.paths = paths;
    return this.village ? this.rebuild(nowMs) : false;
  }

  /** Posune lidi na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.kinds.size === 0 || !this.village) return false;
    const herds = this.env.herds(nowMs);
    // stáda se objeví až s modely zvířat – pasáčci se pak rozmístí znovu
    if (herds.length !== this.herdCount) {
      this.rebuild(nowMs);
      return true;
    }
    if (this.people.length === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(villagerSeconds(nowMs), herds);
    return true;
  }

  /** Počet postav (pro měření a testy). */
  get count(): number {
    return this.people.length;
  }

  /**
   * Člověk pod kurzorem (villagers.md – Výběr postavy): nejbližší vidět postava člověka vsi, jejíž
   * průmět (od nohou po hlavu) je do PICK_PX od bodu (x, y) v CSS px plátna – `project` převede
   * bod světa na plátno (null = za kamerou). Jen při kliknutí, O(postav). Nic – null.
   */
  pick(x: number, y: number, project: Project): number | null {
    return this.pickHit(x, y, project)?.person ?? null;
  }

  /**
   * Poslední polohy postav (x, y, z po postavách; NaN = není vidět) – divoká zvěř před nimi
   * utíká (wildlife.ts). Jen ke čtení.
   */
  figureSpots(): Float32Array {
    return this.spots;
  }

  /** Jako `pick`, i se vzdáleností průmětu od kurzoru (px) – porovná se se spřežením a vozem. */
  pickHit(x: number, y: number, project: Project): { person: number; distance: number } | null {
    return pickPersonHit(this.people, this.spots, x, y, project);
  }

  /**
   * Co dělá člověk u spřežení nebo vozu (oráč, honák, vozka – villagers.md, Výběr postavy), nebo
   * null – jeho postavu kreslí spřežení či vůz.
   */
  crewJob(id: number): PersonJob | null {
    return this.crewJobs.get(id) ?? null;
  }

  /** Oráč a honák spřežení `team` (id lidí; nikdo – null). */
  teamCrew(team: number): { ploughman: number | null; leader: number | null } | null {
    return this.crew.teams[team] ?? null;
  }

  /** Vozka vozu (id člověka), nebo null. */
  cartDrover(cart: number): number | null {
    return this.crew.carts.find((c) => c.cart === cart)?.drover ?? null;
  }

  /** Jízdy dne vojvodovy rodiny (riders.ts) – koně jezdců kreslí livestock.ts. */
  rides(): readonly RidePlan[] {
    return this.crew.rides ?? [];
  }

  /** Psi dvorce dne (dogs.ts – z plánu postav) – kreslí je livestock.ts. */
  dogs(): readonly DogPlan[] {
    return this.crew.dogs ?? [];
  }

  /** Kde naposledy stála vidět postava člověka (id) – testovací háček; jinak null. */
  spotOf(id: number): { x: number; y: number; z: number } | null {
    const index = this.people.findIndex(
      (p, i) => p.person === id && !Number.isNaN(this.spots[i * 3] ?? NaN),
    );
    if (index < 0) return null;
    const o = index * 3;
    return { x: this.spots[o]!, y: this.spots[o + 1]!, z: this.spots[o + 2]! };
  }

  /**
   * Vybere člověka (id) – kroužek pod jeho postavou ho sleduje; null výběr zruší. Vrátí true, když
   * je co překreslit.
   */
  select(id: number | null): boolean {
    if (id === this.selected) return false;
    this.selected = id;
    this.selectedOut = false;
    this.updateSelection();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.lines?.dispose();
    for (const kind of this.kinds.values()) {
      kind.mesh.material?.dispose();
      kind.manager.texture?.dispose();
      kind.mesh.dispose();
    }
    this.kinds.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
    this.ring?.dispose();
    this.ring = null;
  }

  /** Zapíše pózy všech postav v čase `t` (s) do instancí a přepočítá obal. */
  private write(t: number, herds: readonly HerdView[]): void {
    const slots = new Map<VillagerKind, number>();
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    const height = this.env.groundHeight;
    if (this.spots.length !== this.people.length * 3) {
      this.spots = new Float32Array(this.people.length * 3).fill(NaN);
    }
    const spots = this.spots;
    const selected = this.selected;
    const stages = this.stages;
    stages.clear();
    let fishing = '';
    this.people.forEach((person, index) => {
      const kind = this.kinds.get(person.kind);
      if (!kind) return;
      const slot = slots.get(person.kind) ?? 0;
      slots.set(person.kind, slot + 1);
      this.pose.hidden = false;
      this.pose.stage = undefined;
      this.pose.lift = undefined;
      const pose = person.pose(t, herds, this.pose);
      const y = height(pose.x, pose.z);
      const at = index * 3;
      spots[at] = pose.hidden ? NaN : pose.x;
      spots[at + 1] = y;
      spots[at + 2] = pose.z;
      if (selected !== null && person.person === selected) stages.set(index, pose.stage ?? null);
      // karavana výpravy za krajem mapy (caravan.ts) – nulové měřítko, postava ani stín se nekreslí
      const scale = pose.hidden ? 0 : person.scale;
      // jezdec sedí na koni – matice o výšku sedla výš (riders.ts), výběr a stín zůstanou u země
      const lifted = y + (pose.lift ?? 0);
      writeFigure(kind.matrices, slot, pose.x, lifted, pose.z, pose.headingX, pose.headingZ, scale);
      const clip = kind.model.clips.get(pose.clip) ?? kind.model.clips.get('idle')!;
      const length = clip.end - clip.start + 1;
      const o = slot * 4;
      kind.settings[o] = clip.start;
      kind.settings[o + 1] = clip.end;
      kind.settings[o + 2] = person.phase * length;
      kind.settings[o + 3] = BAKE_FPS * pose.pace;
      if (this.shadow) this.writeShadow(index, pose.x, y, pose.z, scale);
      if (pose.hidden) return;
      if (pose.clip === 'fish') fishing += `${index},`;
      minX = Math.min(minX, pose.x);
      maxX = Math.max(maxX, pose.x);
      minZ = Math.min(minZ, pose.z);
      maxZ = Math.max(maxZ, pose.z);
      low = Math.min(low, y);
      high = Math.max(high, lifted);
    });
    const time = (t % 3600) + 3600;
    for (const kind of this.kinds.values()) {
      if (!kind.mesh.isEnabled()) continue;
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
    // karavany výprav jdou po celé zemské stezce (caravan.ts) – obal zahrne celé stezky, ať se
    // postavy hýbou, kdykoli je kterákoli část stezky v záběru
    const extent = this.extent;
    if (extent) {
      minX = Math.min(minX, extent.minX);
      maxX = Math.max(maxX, extent.maxX);
      minZ = Math.min(minZ, extent.minZ);
      maxZ = Math.max(maxZ, extent.maxZ);
      if (low > high) {
        low = height(extent.minX, extent.minZ);
        high = low;
      }
    }
    if (minX <= maxX) {
      this.bounds.reConstruct(
        new Vector3(minX - 2, low - 1, minZ - 2),
        new Vector3(maxX + 2, high + HEAD_ROOM_M, maxZ + 2),
      );
    }
    // rybář s rozvrhem přijde k vodě a odejde – vlasce se překreslí, jen když se změní, kdo rybaří
    if (fishing !== this.fishingKey) this.setFishingLines(t);
    if (selected !== null) this.showSelected(t, herds);
  }

  /** Kroužek a stav vybraného člověka podle posledních poloh postav (bez nového pohybu). */
  private updateSelection(): void {
    const selected = this.selected;
    if (selected === null) {
      this.ring?.hide();
      this.emitPerson(null);
      return;
    }
    // jen postavy vybraného člověka (nejvýš dvě) – póza teď, bez přepisu instancí
    const nowMs = Date.now();
    const t = villagerSeconds(nowMs);
    const herds = this.env.herds(nowMs);
    this.stages.clear();
    this.people.forEach((p, index) => {
      const o = index * 3;
      if (p.person !== selected || o + 2 >= this.spots.length) return;
      this.pose.hidden = false;
      this.pose.stage = undefined;
      const pose = p.pose(t, herds, this.pose);
      this.spots[o] = pose.hidden ? NaN : pose.x;
      this.spots[o + 1] = this.env.groundHeight(pose.x, pose.z);
      this.spots[o + 2] = pose.z;
      this.stages.set(index, pose.stage ?? null);
    });
    this.showSelected(t, herds);
  }

  /**
   * Kroužek pod postavou vybraného člověka a ohlášení jeho stavu (jen při změně). Člověk s rozvrhem
   * (villagers.md – Výběr postavy): úloha a cesta z rozběhnuté činnosti, i přes přelom dne; když
   * zajde do domu, ohlásí `indoors` – výběr se zruší (kromě vojvody).
   */
  private showSelected(t: number, herds: readonly HerdView[]): void {
    const id = this.selected;
    if (id === null) return;
    // oráč, honák a vozka – postavu i kroužek kreslí spřežení a vůz (village-renderer.ts)
    const crewJob = this.crewJobs.get(id);
    if (crewJob) {
      this.ring?.hide();
      this.emitPerson({ id, job: crewJob, stage: null, hidden: false, herd: null });
      return;
    }
    const shown = selectedFigure(this.people, id, (i) => Number.isNaN(this.spots[i * 3] ?? NaN));
    const figure = shown ? this.people[shown.index] : undefined;
    if (figure && shown && !shown.hidden) {
      const o = shown.index * 3;
      const ring = (this.ring ??= new SelectionRing(this.scene, 'villagers-ring'));
      ring.show(
        this.env.groundHeight,
        this.spots[o]!,
        this.spots[o + 1]!,
        this.spots[o + 2]!,
        RING_SIZE_M * figure.scale,
      );
    } else this.ring?.hide();
    let job = figure?.job ?? null;
    let leg: 'out' | 'back' | null = null;
    let indoors = false;
    let phase: PhaseName | null = null;
    const timetable = this.timetable;
    if (timetable && this.scheduled.has(id) && !this.mountedAt(id, t)) {
      const state = scheduledState(
        timetable.activity(id, t),
        t,
        this.selectedOut,
        this.lords.has(id),
        timetable.phase(id, t),
      );
      if (!state.home) this.selectedOut = true;
      ({ job, leg, indoors, phase } = state);
    }
    const herd = job?.kind === 'herd' ? (herds[job.herd]?.species ?? null) : null;
    this.emitPerson({
      id,
      job,
      stage: shown ? (this.stages.get(shown.index) ?? null) : null,
      hidden: shown?.hidden ?? true,
      herd,
      leg,
      ...(phase ? { phase } : {}),
      ...(indoors ? { indoors: true as const } : {}),
    });
  }

  private emitPerson(state: PersonFigureState | null): void {
    if (samePersonState(state, this.personState)) return;
    this.personState = state;
    this.env.onPersonState?.(state);
  }

  /** Stín položený na terén (nakloněný podle svahu pod postavou). */
  private writeShadow(index: number, x: number, y: number, z: number, scale: number): void {
    const shadow = this.shadow!;
    surfaceMatrix(
      this.env.groundHeight,
      x,
      y + SHADOW_LIFT_M,
      z,
      SHADOW_SIZE_M * scale,
      this.matrix,
    );
    this.matrix.copyToArray(shadow.matrices, index * 16);
  }

  /** Nový plán podle poslední vsi (po změně vsi, po načtení modelů, po objevení stád). */
  private rebuild(nowMs: number): boolean {
    const had = this.people.length > 0;
    const village = this.village;
    const herds = this.env.herds(nowMs);
    this.herdCount = herds.length;
    const ground =
      village &&
      (this.models || (village.funerals?.length ?? 0) > 0 || (village.weddings?.length ?? 0) > 0)
        ? this.groundFor(village)
        : null;
    // pohřby i bez modelů postav – hranici a máry kreslí ves, mohylu do dohoření skryje
    this.setFunerals(
      village && ground
        ? planFunerals(village, ground, {
            seed: villageSeed(village),
            paths: this.paths,
            dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
          })
        : [],
    );
    // svatby i bez modelů postav – oheň obřadu a věnec na dubu kreslí ves
    this.setWeddings(
      village && ground
        ? planWeddings(village, ground, {
            seed: villageSeed(village),
            paths: this.paths,
            dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
          })
        : [],
    );
    if (!village || !this.models || !ground) {
      this.people = [];
      this.dayFigures = [];
      this.scheduled.clear();
      this.setCrew({ teams: [], carts: [] });
      this.setSlaughter(null);
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      this.shadow?.mesh.setEnabled(false);
      return had;
    }
    const t = villagerSeconds(nowMs);
    const plan = planVillagersWithCrew(village, ground, {
      seed: villageSeed(village),
      nowMs,
      // pasák jen u stád na pastvě – ta jsou v plánu napřed (livestock-placement.ts)
      herds: herds.filter((h) => h.tended !== false).length,
      herdPlaces: herds,
      paths: this.paths,
      dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
      funerals: this.funerals,
      weddings: this.weddings,
      draft: this.draft,
      ...(this.env.huntSpot ? { huntSpot: this.env.huntSpot } : {}),
    });
    this.setCrew(plan.crew);
    this.setSlaughter(plan.slaughter);
    const persons = village.labor?.persons;
    const living = persons ? new Set(persons.map((person) => person.id)) : undefined;
    const timetable = persons && village.labor ? this.scheduleDay(village, persons, plan, t) : null;
    // lidé vsi jdou z rozvrhu i na události (villagers.md – Události přerušují); postavy dne jen
    // cizí (`STRANGER`) a ukázky bez lidí
    const day = plan.people.filter(
      (p) => this.models?.has(p.kind) && (!timetable || p.person === undefined),
    );
    this.mounted = new Map();
    if (timetable) {
      const poses = new Map(plan.people.map((p) => [p.person, p.pose]));
      for (const ride of plan.crew.rides ?? []) {
        const pose = poses.get(ride.riderId);
        if (ride.route && pose) this.mounted.set(ride.riderId, { ride, pose });
      }
    }
    // pochůzka postavy dne je celý cyklus (villagers.md – Pochůzka se dokončí): cizí na cestě dojde
    this.dayFigures = carryErrands(this.dayFigures, day, t, living);
    const scheduled = timetable && persons ? this.personFigures(persons, timetable) : [];
    this.scheduled = new Set(scheduled.map((p) => p.person!));
    this.people = [...scheduled, ...this.dayFigures];
    this.setFishingLines(t);
    // obal i z dveří lidí s rozvrhem, míst úloh dne a tras jízd (pevné za den) – kdo vyjde z domu
    // mimo poslední pózy, hýbe se hned, ne až s dalším přeplánováním
    this.extent = unionExtent(
      caravanExtent(village),
      timetable && persons
        ? dayExtent(
            plan.tasks,
            persons.map((p) => plan.doors.get(p.home) ?? null),
          )
        : null,
      ...[...this.mounted.values()].map((m) => rideArea(m.ride)),
      ...this.funerals.map((f) => f.extent),
      ...this.weddings.map((w) => w.extent),
    );
    for (const name of KINDS) {
      const people = this.people.filter((p) => p.kind === name);
      const model = this.models.get(name);
      let kind = this.kinds.get(name);
      if (people.length === 0 || !model) {
        kind?.mesh.setEnabled(false);
        continue;
      }
      kind ??= this.createKind(name, model);
      this.kinds.set(name, kind);
      kind.matrices = new Float32Array(people.length * 16);
      kind.settings = new Float32Array(people.length * 4);
      kind.looks = new Float32Array(people.length * 4);
      people.forEach((p, i) => {
        kind.looks.set([...p.look.cloth, HAIR_CODE[p.look.hair]], i * 4);
      });
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('villagerLook', kind.looks, 4, true);
      kind.mesh.setEnabled(true);
    }
    const shadow = (this.shadow ??= this.createShadow());
    shadow.matrices = new Float32Array(Math.max(1, this.people.length) * 16);
    shadow.mesh.thinInstanceSetBuffer('matrix', shadow.matrices, 16, false);
    shadow.mesh.thinInstanceCount = this.people.length;
    shadow.mesh.setEnabled(this.people.length > 0);
    this.write(villagerSeconds(nowMs), herds);
    return had || this.people.length > 0;
  }

  /**
   * Obsazení dne do rozvrhů (villager-timetable.ts): den práce vsi od začátku jeho okna (bez hodin
   * od teď), dveře domů lidí a vojvoda. Jiná ves (seed) – nové rozvrhy.
   */
  private scheduleDay(
    village: SceneVillage,
    persons: readonly ScenePerson[],
    plan: {
      tasks: Parameters<Timetable['setDay']>[2];
      doors: ReadonlyMap<number, { x: number; z: number }>;
      walk: WalkRouteFn;
    },
    t: number,
  ): Timetable {
    const seed = villageSeed(village);
    if (this.timetable?.seed !== seed) this.timetable = new Timetable(seed, SCHEDULE_WALK_M_S);
    const timetable = this.timetable;
    timetable.setDoors(new Map(persons.map((p) => [p.id, plan.doors.get(p.home) ?? null])));
    // délky chůze z odhadu po síti pěšin, přesná trasa jen pro kreslenou pózu (villagers.md –
    // Cesty postav; úloha 6)
    const paths = this.paths;
    timetable.setEstimate(paths?.walkLength ? (a, b) => paths.walkLength!(a, b) : null);
    const homes = new Map(persons.map((p) => [p.id, p.home]));
    timetable.setRouter((id, from, to) => plan.walk(from, to, homes.get(id)));
    // povodeň – na rozlitou vodu se nechodí (villagers.md – Události)
    const flooded = this.env.flooded;
    timetable.setWet(flooded ? (x, z, at) => flooded(x, z, at * 1000 + LIVESTOCK_EPOCH_MS) : null);
    const day = village.labor!.day;
    const window = this.env.dayWindow?.(day) ?? null;
    timetable.setDay(day, window ? villagerSeconds(window.startMs) : t, plan.tasks);
    timetable.retain(new Set(persons.map((p) => p.id)));
    this.lords = new Set(persons.filter((p) => p.role === 'voivode').map((p) => p.id));
    return timetable;
  }

  /**
   * Postava každého člověka vsi podle jeho rozvrhu: vzhled podle člověka, póza z činnosti. Skrytá,
   * když ho dnes kreslí postava dne (událost, jízda) nebo spřežení a vůz (oráč, honák, vozka).
   * Rozvrh se počítá, jen když se póza kreslí (ves v záběru) nebo je člověk vybraný.
   */
  private personFigures(persons: readonly ScenePerson[], timetable: Timetable): PlannedVillager[] {
    const out: PlannedVillager[] = [];
    for (const person of persons) {
      const id = person.id;
      let kind: VillagerKind = 'man';
      let scale = 1;
      const figure = personFigure(timetable.seed, person, (t, herds, pose): VillagerPose => {
        timetable.pose(id, t, herds, pose);
        // chůze rovně ode dveří jde tempem `SCHEDULE_WALK_M_S` – nohy podle velikosti postavy
        const a = timetable.activity(id, t);
        if (a.kind !== 'errand' || a.retreat) {
          // tempo po trase (poměr délky a času – activityPose) × nohy podle velikosti a klipu
          // (cesta ode dveří, domů a ke kroku jinde – villager-phases.ts; s košem, s úlovkem)
          const stage = activityStage(a, t);
          const walking =
            stage === 'out' || stage === 'back'
              ? isWalkClip(pose.clip) || stage === 'back'
              : stage === 'work' && phaseWalking(timetable.phase(id, t));
          if (walking) pose.pace *= SCHEDULE_WALK_M_S / walkSpeed(kind, pose.clip, scale);
        }
        // v bloku jízdy na koni (kůň nejede bez jezdce)
        const mount = this.mountedAt(id, t);
        if (mount) mount.pose(t, herds, pose);
        else if (this.crewJobs.has(id)) pose.hidden = true;
        return pose;
      });
      kind = figure.kind;
      scale = figure.scale;
      if (this.models?.has(figure.kind)) out.push(figure);
    }
    return out;
  }

  /** Jízda jezdce `id`, když je v okamžik `t` v bloku jízdy (riders.ts – `isRiding`). */
  private mountedAt(id: number, t: number): { ride: RidePlan; pose: PoseFn } | null {
    const mount = this.mounted.get(id);
    return mount && isRiding(mount.ride, t) ? mount : null;
  }

  /** Vlasce rybářů (klip `fish`) – rybář stojí, poloha z pózy v čase `t`. */
  private setFishingLines(t: number): void {
    const lines: number[][] = [];
    let key = '';
    for (const [index, person] of this.people.entries()) {
      this.pose.hidden = false;
      this.pose.stage = undefined;
      this.pose.lift = undefined;
      const pose = person.pose(t, [], this.pose);
      if (pose.clip !== 'fish' || pose.hidden) continue;
      key += `${index},`;
      lines.push(
        fishingLine(pose, person.kind, person.scale, (x, z) => this.env.groundHeight(x, z)),
      );
    }
    this.fishingKey = key;
    if (lines.length === 0 && !this.lines) return;
    this.lines ??= new FishingLines(this.scene);
    this.lines.set(lines);
  }

  /**
   * Noví lidé u spřežení a vozů – úlohy oráče, honáka a vozky (stálé objekty, dokud se lidé
   * nezmění); scéně to ohlásí (`onCrew`), jen když se změnili.
   */
  private setCrew(crew: DraftCrew): void {
    const key = `${JSON.stringify({ teams: crew.teams, carts: crew.carts })}#${ridePlansKey(crew.rides ?? [])}#${dogPlansKey(crew.dogs ?? [])}`;
    if (key === this.crewKey) return;
    this.crewKey = key;
    this.crew = crew;
    const jobs = new Map<number, PersonJob>();
    crew.teams.forEach((team, k) => {
      if (team.ploughman !== null) {
        jobs.set(team.ploughman, { kind: 'plough', team: k, role: 'ploughman' });
      }
      if (team.leader !== null) jobs.set(team.leader, { kind: 'plough', team: k, role: 'leader' });
    });
    for (const { cart, drover } of crew.carts) {
      if (drover !== null) jobs.set(drover, { kind: 'cart', cart });
    }
    this.crewJobs = jobs;
    if (this.selected !== null) this.updateSelection();
    this.env.onCrew?.();
  }

  /** Nové plány pohřbů – ohlásí je scéně (`onFunerals`), jen když se změnily. */
  private setFunerals(plans: FuneralPlan[]): void {
    this.funerals = plans;
    const key = plans
      .map(
        (p) =>
          `${p.key}:${p.timeline.startMs}:${p.path.length.toFixed(2)}:${p.members.length}:` +
          `${p.pyre.x},${p.pyre.z}`,
      )
      .join('|');
    if (key === this.funeralsKey) return;
    this.funeralsKey = key;
    this.env.onFunerals?.(plans);
  }

  /** Nové plány svateb – ohlásí je scéně (`onWeddings`), jen když se změnily. */
  private setWeddings(plans: WeddingPlan[]): void {
    this.weddings = plans;
    const key = plans
      .map(
        (p) =>
          `${p.key}:${p.timeline.startMs}:${p.site.kind}:${p.site.couple.x},${p.site.couple.z}:` +
          `${p.members.length}`,
      )
      .join('|');
    if (key === this.weddingsKey) return;
    this.weddingsKey = key;
    this.env.onWeddings?.(plans);
  }

  /** Nový plán porážky – ohlásí ho scéně (`onSlaughter`), jen když se změnil. */
  private setSlaughter(plan: SlaughterPlan | null): void {
    const key = plan
      ? `${plan.day}:${plan.window.startMs}:${plan.window.endMs}:` +
        plan.stations
          .map((st) => `${st.key}:${st.x.toFixed(2)},${st.z.toFixed(2)}:${st.crew.join(',')}`)
          .join('|')
      : '';
    if (key === this.slaughterKey) return;
    this.slaughterKey = key;
    this.env.onSlaughter?.(plan);
  }

  private treesToken?: { layer: ObstacleLayer; key: string; token: object };

  /** Terén pro plán: schůdná země z rastru zvířat, stromy z vrstvy překážek. */
  private groundFor(village: SceneVillage): VillagerGround | null {
    const grid = this.env.ground(village);
    if (!grid) return null;
    const layer = this.env.layer;
    const status = obstacleStatus(village.obstacles);
    // stromy se mění jen s vrstvou překážek a pokácením / pařezy / sazenicemi – skupinky stromů
    // pro dřevo (villager-plan-traffic.ts) se mezi přeplánováními nepočítají znovu
    const o = village.obstacles;
    const key = o ? `${o.removed.length},${o.stumps.length},${o.saplings.length}` : '';
    if (this.treesToken?.layer !== layer || this.treesToken.key !== key) {
      this.treesToken = { layer, key, token: {} };
    }
    return {
      treesToken: this.treesToken.token,
      walkable: (x, z) => grid.walkable(x, z),
      tree: (id) => {
        const i = obstacleIndex(layer, id);
        return i >= 0 ? { x: layer.x[i]!, z: layer.z[i]! } : null;
      },
      squareObstacles: (part) => squareObstacles(layer, part),
      treesIn: (x, z, half, max) => {
        const found: { x: number; z: number }[] = [];
        for (const i of obstaclesNear(layer, x - half, z - half, x + half, z + half)) {
          if (found.length >= max) break;
          const tx = layer.x[i]!;
          const tz = layer.z[i]!;
          if (Math.abs(tx - x) > half || Math.abs(tz - z) > half) continue;
          if (status.kindOf(layer, i) === 'tree') found.push({ x: tx, z: tz });
        }
        return found;
      },
    };
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const results = await Promise.allSettled(
        KINDS.map((name) => loadBakedModel(this.scene, `${this.env.baseUrl}${name}.glb`)),
      );
      const models = new Map<VillagerKind, BakedModel>();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) models.set(KINDS[i]!, result.value);
        else if (result.status === 'rejected') {
          console.warn(`Model postavy ${KINDS[i]} se nepodařilo načíst.`, result.reason);
        }
      });
      if (this.disposed) return;
      this.models = models;
      if (this.rebuild(Date.now())) this.env.onLoaded();
    })();
    return this.loading;
  }

  private createKind(name: VillagerKind, model: BakedModel): Kind {
    // Jméno mimo předpony vrhačů stínů – stínová mapa je statická (lidé mají vlastní stín).
    const mesh = new Mesh(`villagers-${name}`, this.scene);
    model.vertexData.applyToMesh(mesh);
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, model.matricesIndices, false, 4);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, model.matricesWeights, false, 4);
    // Kostra jen kvůli definicím shaderu (skinning) – matice kostí čte shader z VAT textury.
    const skeleton = new Skeleton(`villagers-${name}-skeleton`, `villagers-${name}`, this.scene);
    for (let i = 0; i < model.boneCount; i++) new Bone(`b${i}`, skeleton);
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 4;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;

    const vat = RawTexture.CreateRGBATexture(
      model.vat,
      (model.boneCount + 1) * 4,
      model.frames,
      this.scene,
      false,
      false,
      Texture.NEAREST_NEAREST,
      model.vat instanceof Uint16Array
        ? Constants.TEXTURETYPE_HALF_FLOAT
        : Constants.TEXTURETYPE_FLOAT,
    );
    vat.name = `villagers-${name}-vat`;
    const manager = new BakedVertexAnimationManager(this.scene);
    manager.texture = vat;
    mesh.bakedVertexAnimationManager = manager;

    const material = new StandardMaterial(`villagers-${name}-material`, this.scene);
    // Bez mipmap jako u zvířat: ostrůvky atlasu na tmavém pozadí by z dálky ztmavly.
    model.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    material.diffuseTexture = model.texture;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    model.mask?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    new VillagerPlugin(material, model.texture?.gammaSpace === false, model.mask);
    mesh.material = material;
    return {
      mesh,
      manager,
      model,
      matrices: new Float32Array(0),
      settings: new Float32Array(0),
      looks: new Float32Array(0),
    };
  }

  /** Měkký kruhový stín – čtverec s průhledným kruhem, jedna instance na postavu. */
  private createShadow(): { mesh: Mesh; matrices: Float32Array } {
    const mesh = new Mesh('villagers-shadow', this.scene);
    const data = new VertexData();
    data.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 2, 1, 0, 3, 2];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    // po obtiscích vsi a polí (alphaIndex 1–2), před náhledem umisťování (10+)
    mesh.alphaIndex = 5;
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
        const a = Math.max(0, 1 - r);
        pixels[(j * size + i) * 4 + 3] = Math.round(255 * SHADOW_OPACITY * a * a * (3 - 2 * a));
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      size,
      size,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = 'villagers-shadow';
    const material = new StandardMaterial('villagers-shadow-material', this.scene);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = Color3.Black();
    material.disableLighting = true;
    material.opacityTexture = texture;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    material.zOffset = -2;
    mesh.material = material;
    return { mesh, matrices: new Float32Array(16) };
  }
}

const TMP_A = new Vector3();
const TMP_B = new Vector3();
const TMP_C = new Vector3();

/**
 * Čtverec `size` položený na terén v bodě (x, y, z) – osy podle svahu pod ním (stín a kroužek
 * výběru), výsledek do `out`.
 */
function surfaceMatrix(
  height: (x: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  size: number,
  out: Matrix,
): void {
  const e = 0.4;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  // osy: x podél svahu ve směru x, z ve směru z, y = normála (kolmo k oběma)
  const ax = TMP_A.set(1, gx, 0).normalize();
  const az = TMP_B.set(0, gz, 1).normalize();
  const ay = Vector3.CrossToRef(az, ax, TMP_C).normalize();
  Matrix.FromValuesToRef(
    ax.x * size,
    ax.y * size,
    ax.z * size,
    0,
    ay.x,
    ay.y,
    ay.z,
    0,
    az.x * size,
    az.y * size,
    az.z * size,
    0,
    x,
    y,
    z,
    1,
    out,
  );
}

/** Instance: postava na (x, y, z) natočená ve směru (hx, hz), zvětšená `scale`. */
function writeFigure(
  m: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  hx: number,
  hz: number,
  scale: number,
): void {
  const o = index * 16;
  // osa X = vpravo (nahoru × dopředu), Y = nahoru, Z = dopředu (model míří na +Z)
  m[o] = hz * scale;
  m[o + 1] = 0;
  m[o + 2] = -hx * scale;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = scale;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = hx * scale;
  m[o + 9] = 0;
  m[o + 10] = hz * scale;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}

/**
 * Co z vsi rozhoduje o lidech: rozdělení práce dne, obydlí (i průběh staveniště – kopání
 * jámy), stadia polí, výsadba sadů, hřbitovy a odstraněné stromy.
 */
function villageKey(village: SceneVillage, draft: DraftCrews): string {
  const dwellings = village.dwellings.map(
    (d) =>
      `${d.id}:${d.type}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:${d.progress < 0.25 ? 0 : 1}:` +
      `${d.position.x.toFixed(2)},${d.position.z.toFixed(2)},${d.position.rotation.toFixed(3)}`,
  );
  const fields = village.fields.map(
    (f) =>
      `${f.id}:${f.parts
        .map(
          (p) =>
            `${p.x.toFixed(1)},${p.z.toFixed(1)},${p.stage},${p.look ?? ''},${p.work ?? ''},${p.before ?? ''}`,
        )
        .join(';')}`,
  );
  const orchards = (village.orchards ?? []).map(
    (o) =>
      `${o.id}:${o.squares.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.planting >= 1 ? 1 : 0}`).join(';')}`,
  );
  const cemeteries = (village.cemeteries ?? []).map(
    (c) =>
      `${c.id}:${c.squares.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.pending ? 1 : 0}`).join(';')}`,
  );
  const obstacles = village.obstacles
    ? `${village.obstacles.removed.length},${village.obstacles.stumps.length}`
    : '';
  return JSON.stringify([
    village.labor ?? null,
    draft,
    // vozka jde k podílu svozu svého vozu (villager-plan.ts – `draftStaff`)
    (village.carts ?? []).map((c) => [c.id, c.job, c.route?.length ?? 0]),
    village.expeditions ?? null,
    village.funerals ?? null,
    village.weddings ?? null,
    (village.trails ?? []).map((t) => [t.id, t.points.length]),
    // lov, psi, hlídka, děti s řehtačkou a rybáři dne (wildlife.md – Ve scéně)
    village.wildlife
      ? [
          village.wildlife.hunt ?? null,
          village.wildlife.dogs ?? 0,
          village.wildlife.patrol ?? false,
          village.wildlife.watchParts ?? null,
          village.wildlife.pools ?? null,
        ]
      : null,
    dwellings,
    fields,
    orchards,
    cemeteries,
    obstacles,
    // řetěz s vědry v den požáru (disasters.md – Hašení)
    village.fire?.chain ?? null,
  ]);
}

/**
 * Obdélník cest, po kterých jdou karavany výprav a nákupů (zemské stezky, čáry krajinou ke kraji
 * mapy – caravan.ts); bez výprav null.
 */
function caravanExtent(
  village: SceneVillage,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const points = (village.expeditions ?? []).flatMap((e) => caravanPoints(e, village.trails));
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}

type Extent = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Obdélník přes všechny dané (karavany, pohřby); bez žádného null. */
function unionExtent(...extents: (Extent | null)[]): Extent | null {
  let out: Extent | null = null;
  for (const e of extents) {
    if (!e) continue;
    out = out
      ? {
          minX: Math.min(out.minX, e.minX),
          maxX: Math.max(out.maxX, e.maxX),
          minZ: Math.min(out.minZ, e.minZ),
          maxZ: Math.max(out.maxZ, e.maxZ),
        }
      : { ...e };
  }
  return out;
}

/** Náhoda postav podle vsi – první obydlí (stejná ves = stejní lidé). */
function villageSeed(village: SceneVillage): number {
  const first = village.dwellings[0]?.position;
  return first ? (Math.round(first.x * 13) * 31 + Math.round(first.z * 7)) | 0 : 1;
}

/** Počká, až má prohlížeč volno (nejdéle 50 ms); bez `requestIdleCallback` (Safari) další úloha. */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 50 });
    else setTimeout(resolve, 0);
  });
}

/**
 * Načte GLB postavy a zapeče všechny její animace do pole matic kostí (VAT): pro každý klip
 * snímky po 1/24 s včetně posledního (= prvního, smyčka navazuje). Matice i vrcholy se převedou
 * do souřadnic scény (převod os glTF – zrcadlení – se zapeče, mesh pak nemá rodiče). VAT je
 * half-float (polovina paměti; posuny kostí do ±3 m na ≈ 2 mm), peče se po kouscích
 * `BAKE_SLICE_MS` mezi volnými chvílemi hlavního vlákna.
 */
export async function loadBakedModel(scene: Scene, url: string): Promise<BakedModel | null> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) return null;
  container.addAllToScene();
  for (const group of container.animationGroups) group.stop();
  // pečení jde po kouscích a scéna mezitím kreslí – zdrojový model nesmí být vidět
  for (const mesh of container.meshes) mesh.setEnabled(false);
  const source = container.meshes.find(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !!mesh.skeleton,
  );
  const skeleton = source?.skeleton;
  if (!source || !skeleton) {
    container.dispose();
    throw new Error(`${url}: model bez kostry`);
  }
  const world = source.computeWorldMatrix(true).clone();
  const inverse = world.clone().invert();

  // Klidová póza uzlů – před každým klipem se vrátí (klip nemusí mít kanál pro každý uzel).
  const nodes = new Set<TransformNode>();
  for (const group of container.animationGroups) {
    for (const t of group.targetedAnimations) nodes.add(t.target as TransformNode);
  }
  const rest = [...nodes].map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotationQuaternion?.clone() ?? null,
    scaling: node.scaling.clone(),
  }));

  const boneCount = skeleton.bones.length;
  const floatsPerFrame = (boneCount + 1) * 16;
  const groups = container.animationGroups.map((group) => {
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const durationS = (group.to - group.from) / fps;
    return { group, fps, durationS, count: Math.max(1, Math.round(durationS * BAKE_FPS)) + 1 };
  });
  const frames = groups.reduce((sum, g) => sum + g.count, 0);
  // jedno pole rovnou ve formátu textury – žádné kusy po klipech ani jejich spojování
  const half = scene.getEngine().getCaps().textureHalfFloat;
  const vat = half
    ? new Uint16Array(floatsPerFrame * frames)
    : new Float32Array(floatsPerFrame * frames);
  const row = new Float32Array(floatsPerFrame);
  const clips = new Map<string, { start: number; end: number }>();
  let frame = 0;
  const m = new Matrix();
  const tmp = new Matrix();
  let slice = performance.now();
  for (const { group, fps, durationS, count } of groups) {
    for (const r of rest) {
      r.node.position.copyFrom(r.position);
      if (r.rotation) (r.node.rotationQuaternion ??= new Quaternion()).copyFrom(r.rotation);
      r.node.scaling.copyFrom(r.scaling);
    }
    for (let k = 0; k < count; k++) {
      const at = group.from + Math.min(durationS, k / BAKE_FPS) * fps;
      for (const { animation, target } of group.targetedAnimations) {
        const value: unknown = animation.evaluate(at);
        const property = animation.targetProperty as 'position' | 'rotationQuaternion' | 'scaling';
        const node = target as TransformNode;
        if (property === 'rotationQuaternion') {
          (node.rotationQuaternion ??= new Quaternion()).copyFrom(value as Quaternion);
        } else {
          node[property].copyFrom(value as Vector3);
        }
      }
      skeleton.prepare(true);
      const matrices = skeleton.getTransformMatrices(source);
      for (let b = 0; b <= boneCount; b++) {
        Matrix.FromArrayToRef(matrices, b * 16, m);
        // matice v souřadnicích meshe -> ve scéně: W⁻¹ · M · W (řádkové vektory Babylonu)
        inverse.multiplyToRef(m, tmp);
        tmp.multiplyToRef(world, m);
        m.copyToArray(row, b * 16);
      }
      const o = (frame + k) * floatsPerFrame;
      if (vat instanceof Uint16Array) {
        for (let i = 0; i < floatsPerFrame; i++) vat[o + i] = ToHalfFloat(row[i]!);
      } else {
        vat.set(row, o);
      }
      // pečení po kouscích – hlavní vlákno mezi nimi kreslí a reaguje (žádná dlouhá úloha)
      if (performance.now() - slice > BAKE_SLICE_MS) {
        await idle();
        if (scene.isDisposed) {
          container.dispose();
          return null;
        }
        slice = performance.now();
      }
    }
    clips.set(group.name, { start: frame, end: frame + count - 1 });
    frame += count;
  }

  const positions = source.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = source.getVerticesData(VertexBuffer.NormalKind);
  const uvs = source.getVerticesData(VertexBuffer.UVKind);
  const outPositions = new Float32Array(positions.length);
  const outNormals = normals ? new Float32Array(normals.length) : null;
  const p = new Vector3();
  for (let i = 0; i < positions.length / 3; i++) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!,
      world,
      p,
    );
    outPositions.set([p.x, p.y, p.z], i * 3);
    if (normals && outNormals) {
      Vector3.TransformNormalFromFloatsToRef(
        normals[i * 3]!,
        normals[i * 3 + 1]!,
        normals[i * 3 + 2]!,
        world,
        p,
      );
      p.normalize();
      outNormals.set([p.x, p.y, p.z], i * 3);
    }
  }
  const vertexData = new VertexData();
  vertexData.positions = outPositions;
  vertexData.indices = Array.from(source.getIndices() ?? []);
  if (outNormals) vertexData.normals = outNormals;
  if (uvs) vertexData.uvs = uvs;
  const matricesIndices = Float32Array.from(
    source.getVerticesData(VertexBuffer.MatricesIndicesKind)!,
  );
  const matricesWeights = Float32Array.from(
    source.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
  );
  const material = source.material;
  const texture = material instanceof PBRMaterial ? material.albedoTexture : null;
  const mask = material instanceof PBRMaterial ? material.ambientTexture : null;

  for (const group of container.animationGroups) group.dispose();
  for (const mesh of container.meshes) mesh.dispose(false, false);
  for (const node of container.transformNodes) node.dispose(false, false);
  for (const s of container.skeletons) s.dispose();
  for (const used of container.materials) used.dispose(false, false);
  return {
    vertexData,
    matricesIndices,
    matricesWeights,
    boneCount,
    vat,
    frames,
    clips,
    texture,
    mask,
  };
}

/**
 * Materiál postav (GLSL i WGSL): lineárně čtenou texturu z GLB převede zpět do barev obrazovky
 * (jako u dobytka), oděv obarví barvou instance podle masky látky (villagerMask.r) a vlasy podle
 * kódu (villagerLook.w: 1 šediny, 2 lněný šátek, 3 šátek barvený mořenou, 4 svatební věnec
 * z kvítků) podle masky vlasů (villagerMask.g) – stínování textury zůstane. Maska je textura, ne
 * atribut vrcholů: WebGPU dovoluje nejvýš 8 vertex bufferů a postava (kostra, VAT, barva
 * instance) jich má právě 8.
 */
export class VillagerPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly linearTexture: boolean,
    private readonly mask: BaseTexture | null,
  ) {
    super(material, 'Villagers', 200, {
      VILLAGERS: false,
      VILLAGERS_GAMMA: false,
      VILLAGERS_MASK: false,
    });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['VILLAGERS'] = true;
    defines['VILLAGERS_GAMMA'] = this.linearTexture;
    defines['VILLAGERS_MASK'] = this.mask !== null;
  }

  override getClassName(): string {
    return 'VillagerPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('villagerLook');
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('villagerMask');
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    if (this.mask) uniformBuffer.setTexture('villagerMask', this.mask);
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    if (this.mask) activeTextures.push(this.mask);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `attribute villagerLook: vec4f;
varying vVillagerLook: vec4f;`,
            CUSTOM_VERTEX_MAIN_END: `vertexOutputs.vVillagerLook = vertexInputs.villagerLook;`,
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: `attribute vec4 villagerLook;
varying vec4 vVillagerLook;`,
            CUSTOM_VERTEX_MAIN_END: `vVillagerLook = villagerLook;`,
          };
    }
    if (shaderType !== 'fragment') return null;
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vVillagerLook: vec4f;
#ifdef VILLAGERS_MASK
var villagerMaskSampler: sampler;
var villagerMask: texture_2d<f32>;
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef VILLAGERS_GAMMA
baseColor = vec4f(pow(baseColor.rgb, vec3f(1.0 / 2.2)), baseColor.a);
#endif
#if defined(VILLAGERS_MASK) && defined(DIFFUSE)
{
  let villagerPart = textureSample(villagerMask, villagerMaskSampler, fragmentInputs.vDiffuseUV).rg;
  let villagerLook = fragmentInputs.vVillagerLook;
  var villagerRgb = baseColor.rgb * mix(vec3f(1.0), villagerLook.rgb, villagerPart.x);
  var villagerHair = vec3f(0.6, 0.3, 0.22);
  if (villagerLook.w < 1.5) {
    villagerHair = vec3f(0.6, 0.58, 0.55);
  } else if (villagerLook.w < 2.5) {
    villagerHair = vec3f(0.86, 0.82, 0.72);
  } else if (villagerLook.w > 3.5) {
    // svatební věnec – kvítky a listí po buňkách textury
    let villagerCell = floor(fragmentInputs.vDiffuseUV * ${WREATH_CELLS});
    let villagerPick = fract(sin(dot(villagerCell, vec2f(12.9898, 78.233))) * 43758.5453);
    villagerHair = vec3f(0.36, 0.56, 0.22);
    if (villagerPick > 0.84) {
      villagerHair = vec3f(0.98, 0.82, 0.25);
    } else if (villagerPick > 0.68) {
      villagerHair = vec3f(0.36, 0.5, 0.95);
    } else if (villagerPick > 0.5) {
      villagerHair = vec3f(0.92, 0.2, 0.12);
    } else if (villagerPick > 0.3) {
      villagerHair = vec3f(0.98, 0.96, 0.86);
    }
  }
  let villagerLuma = dot(villagerRgb, vec3f(0.299, 0.587, 0.114));
  let villagerHairMix = villagerPart.y * step(0.5, villagerLook.w);
  villagerRgb = mix(villagerRgb, villagerHair * clamp(villagerLuma / 0.27, 0.55, 1.35), villagerHairMix);
  baseColor = vec4f(villagerRgb, baseColor.a);
}
#endif`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vec4 vVillagerLook;
#ifdef VILLAGERS_MASK
uniform sampler2D villagerMask;
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef VILLAGERS_GAMMA
baseColor.rgb = pow(baseColor.rgb, vec3(1.0 / 2.2));
#endif
#if defined(VILLAGERS_MASK) && defined(DIFFUSE)
{
  vec2 villagerPart = texture2D(villagerMask, vDiffuseUV).rg;
  baseColor.rgb *= mix(vec3(1.0), vVillagerLook.rgb, villagerPart.x);
  vec3 villagerHair = vVillagerLook.w < 1.5 ? vec3(0.6, 0.58, 0.55) : vVillagerLook.w < 2.5 ? vec3(0.86, 0.82, 0.72) : vec3(0.6, 0.3, 0.22);
  if (vVillagerLook.w > 3.5) {
    // svatební věnec – kvítky a listí po buňkách textury
    float villagerPick = fract(sin(dot(floor(vDiffuseUV * ${WREATH_CELLS}), vec2(12.9898, 78.233))) * 43758.5453);
    villagerHair = villagerPick > 0.84 ? vec3(0.98, 0.82, 0.25) : villagerPick > 0.68 ? vec3(0.36, 0.5, 0.95) : villagerPick > 0.5 ? vec3(0.92, 0.2, 0.12) : villagerPick > 0.3 ? vec3(0.98, 0.96, 0.86) : vec3(0.36, 0.56, 0.22);
  }
  float villagerLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  float villagerHairMix = villagerPart.y * step(0.5, vVillagerLook.w);
  baseColor.rgb = mix(baseColor.rgb, villagerHair * clamp(villagerLuma / 0.27, 0.55, 1.35), villagerHairMix);
}
#endif`,
        };
  }
}
