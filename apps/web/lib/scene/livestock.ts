import {
  createRideState,
  RIDE_HORSE_SCALE,
  rideArea,
  rideHorsePose,
  isRiding,
  ridePlansKey,
  type RidePlan,
} from './riders';
import { createDogState, DOG_SCALE, dogArea, dogPlansKey, dogPose, type DogPlan } from './dogs';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  HAY_WINTER_MONTHS,
  dateOfDayIndex,
  type ForestField,
  type HerdSpecies,
  type Landscape,
  type Relief,
} from '@bohemia/game';
import {
  CARAVAN_OX_SCALE,
  caravanAnimalPose,
  caravanHerds,
  caravanHerdsKey,
  type CaravanHerd,
} from './caravan-cattle';
import { loadGeometry, writeInstanceMatrix, type FaunaGeometry } from './fauna';
import {
  chickenArea,
  chickenPose,
  createHerdState,
  createLivestockPose,
  herdAnimalPose,
  herdArea,
  herdState,
  keepRouteSpot,
  routeArea,
  type Area,
  type HerdState,
  livestockClock,
  type LivestockClock,
  type LivestockPose,
} from './livestock-motion';
import {
  grazedMeadow,
  grazedPart,
  grazingDay,
  grazingHorses,
  herdCounts,
  herderCount,
  lazyWalkable,
  livestockGround,
  planLivestock,
  type Herd,
  type LivestockGround,
  type LivestockSpecies,
  type LivestockVillage,
  penSquaresOf,
} from './livestock-placement';
import type { StreamCenterline } from './stream-geometry';

const SPECIES: readonly LivestockSpecies[] = [
  'sheep',
  'goat',
  'cow',
  'pig',
  'chicken',
  'horse',
  'foal',
  'dog',
];
/** Dobytek načtený se vsí; psa (`dog.glb`) až ve vsi se psy (`loadDog`). */
const HERD_SPECIES = SPECIES.filter((s) => s !== 'dog');
/** Dál od kamery (m) se zvířata nehýbou – jsou pár pixelů a pohyb by jen zbytečně kreslil. */
const ANIMATE_RANGE_M = 900;
/** Po takovém posunu středu vsi (m) se rastr terénu pro zvířata spočítá znovu. */
const GROUND_RECENTER_M = 60;
/** Náklon do svahu: podíl sklonu terénu, o který se zvíře nakloní do strany. */
const SIDE_TILT = 0.6;
/** Krok, na kterém se měří sklon terénu pod zvířetem (m). */
const SLOPE_STEP_M = 0.6;
/** Výška obalu skupiny nad terénem (m) – nejvyšší zvíře je kráva. */
const HEAD_ROOM_M = 2.5;

export interface LivestockEnvironment {
  landscape: Landscape;
  field: ForestField;
  stream: StreamCenterline;
  relief: Relief;
  /** Přesná výška vykresleného terénu ve scéně – zvířata na něm stojí. */
  groundHeight(x: number, z: number): number;
  /** Adresa modelů (…/sheep.glb). */
  baseUrl: string;
  /** Dočetly se modely a zvířata se objevila – překreslit. */
  onLoaded(): void;
  /**
   * Okno herního dne (skutečný čas) – dobytek karavan výprav jde v herním čase jako lidé
   * (caravan.ts); bez hodin null, bez funkce stojí na postupu dne dat.
   */
  dayWindow?(day: number): { startMs: number; endMs: number } | null;
}

/** Co ze scény potřebuje dobytek karavan výprav (trade.md – Dobytek ve třech druzích). */
type CaravanVillage = Parameters<typeof caravanHerds>[0];

/** Jeden druh: mesh s instancemi, matice a stav pózy (krok, hlava) instancí. */
interface Kind {
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
  count: number;
  dirty: boolean;
}

/** Skupina zvířat, která se vykreslí (a pohne) vcelku – slepice jednoho domu, jedno stádo. */
interface Group {
  members: { species: LivestockSpecies; slot: number; scale: number }[];
  /** Připraví čas (stav stáda) a vrátí, kde zvířata právě jsou. */
  prepare(clock: LivestockClock): Area;
  pose(index: number, clock: LivestockClock, out: LivestockPose): LivestockPose;
  /**
   * Zvíře teď není vidět (dobytek karavany za krajem mapy nebo na cestě druhým směrem) – zapíše
   * se s nulovým měřítkem. Bez funkce vidět vždy.
   */
  hidden?(index: number, clock: LivestockClock): boolean;
  /**
   * Skupina teď stojí (jezdecký kůň u kůlu – riders.ts): jednou se zapíše a dál se nepřekresluje.
   * Bez funkce se hýbe vždy.
   */
  still?(clock: LivestockClock): boolean;
  /** Stojící skupina je zapsaná (`still`). */
  settled?: boolean;
  /** Kde byla zvířata naposled zapsaná – i odtud je musí kamera „pustit“. */
  written: BoundingInfo | null;
  current: BoundingInfo;
}

/**
 * Domácí zvířata vsi (skutečná stáda – diet.md): slepice kolem hotových obydlí, ovce
 * s kozami a krávy na loukách, prasata v lese u okraje (livestock-placement.ts). Modely z 0 A.D.
 * jako u ryb a ptáků (fauna.ts) – každý druh jeden mesh s instancemi, krok a sklonění hlavy
 * jsou přechody mezi klíčovými pózami ve vertex shaderu. Kde zvíře je a co dělá, je čistá
 * funkce času (livestock-motion.ts); `animate` pohne jen skupinami v záběru. Modely se stahují
 * až s prvním zvířetem; když se některý nenačte, ten druh chybí (zaloguje se varování).
 */
export class VillageLivestock {
  private ground: { grid: LivestockGround; x: number; z: number } | null = null;
  /** Schůdná země přes celou krajinu pro postavy (`lazyWalkable`) – buňky se pamatují. */
  private walk: ((x: number, z: number) => boolean) | null = null;
  private village: LivestockVillage | null = null;
  private key = '';
  /** Dobytek karavan výprav a jeho klíč (trade.md – Dobytek ve třech druzích). */
  private caravans: CaravanHerd[] = [];
  private caravansKey = '';
  /** Jízdy dne (riders.ts – z plánu postav) a jejich klíč. */
  private rides: readonly RidePlan[] = [];
  private ridesKey = '';
  /** Psi dvorce dne (dogs.ts – z plánu postav) a jejich klíč. */
  private dogs: readonly DogPlan[] = [];
  private dogsKey = '';
  /** Poslední rozmístění kuřat a stád – dobytek karavan ho nepřeplánuje. */
  private plan: { chickens: ReturnType<typeof planLivestock>['chickens']; herds: Herd[] } | null =
    null;
  private groups: Group[] = [];
  /** Stáda posledního rozmístění – nová stáda po přepočtu zůstanou na své pastvině. */
  private herds: Herd[] = [];
  private readonly kinds = new Map<LivestockSpecies, Kind>();
  private geometries: Map<LivestockSpecies, FaunaGeometry> | null = null;
  private loading: Promise<void> | null = null;
  private dogLoading: Promise<void> | null = null;
  private dogGeometry: FaunaGeometry | null = null;
  private readonly pose = createLivestockPose();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: LivestockEnvironment,
  ) {}

  /**
   * Zvířata podle vsi – rozmístění se přepočítá, jen když se změnila obydlí, pole nebo
   * hřbitovy. Vrátí true, když se ve scéně něco změnilo (je co překreslit).
   */
  update(village: LivestockVillage & CaravanVillage, nowMs: number): boolean {
    if (this.disposed) return false;
    const key = villageKey(village);
    // dobytek karavan výprav (trade.md – Dobytek ve třech druzích) – jen přidá skupiny
    const caravans = caravanHerds(village);
    const caravansKey = caravanHerdsKey(caravans);
    if (key === this.key && caravansKey === this.caravansKey) return false;
    const replan = key !== this.key;
    this.key = key;
    this.caravansKey = caravansKey;
    this.caravans = caravans;
    this.village = village;
    if (village.dwellings.some((d) => d.built) || caravans.length > 0) void this.load();
    return this.rebuild(nowMs, replan);
  }

  /**
   * Jezdečtí koně dne (riders.ts – plány jízd z plánu postav, villagers.ts `rides`). Vrátí true,
   * když se ve scéně něco změnilo.
   */
  setRides(rides: readonly RidePlan[], nowMs: number): boolean {
    if (this.disposed) return false;
    const key = ridePlansKey(rides);
    if (key === this.ridesKey) return false;
    this.ridesKey = key;
    this.rides = rides;
    return this.rebuild(nowMs, false);
  }

  /**
   * Psi dvorce dne (dogs.ts – plány psů z plánu postav, villagers.ts `dogs`). Vrátí true, když se
   * ve scéně něco změnilo.
   */
  setDogs(dogs: readonly DogPlan[], nowMs: number): boolean {
    if (this.disposed) return false;
    const key = dogPlansKey(dogs);
    if (key === this.dogsKey) return false;
    this.dogsKey = key;
    this.dogs = dogs;
    if (dogs.length > 0) {
      void this.load();
      void this.loadDog();
    }
    return this.rebuild(nowMs, false);
  }

  /**
   * Posune zvířata v záběru `camera` na okamžik `nowMs` (bez kamery všechna). Vrátí true,
   * když se v záběru něco pohnulo.
   */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.groups.length === 0) return false;
    const clock = this.clock(nowMs);
    let moved = false;
    for (const group of this.groups) {
      // stojící jezdecký kůň se zapíše jednou – nastaví překreslení jen jedoucí
      const still = group.still?.(clock) ?? false;
      if (still && group.settled) continue;
      const area = group.prepare(clock);
      this.setBounds(group.current, area);
      if (camera) {
        const visible =
          camera.isInFrustum(group.current) ||
          (group.written !== null && camera.isInFrustum(group.written));
        if (!visible) continue;
        const center = group.current.boundingSphere.centerWorld;
        if (Vector3.Distance(camera.globalPosition, center) > ANIMATE_RANGE_M) continue;
      }
      this.writeGroup(group, clock);
      group.settled = still;
      moved = true;
    }
    for (const kind of this.kinds.values()) {
      if (!kind.dirty) continue;
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('livestockState');
      kind.dirty = false;
    }
    return moved;
  }

  /** Střed, poloměr a stěhování stád v okamžiku `nowMs` – pasáčci (villagers.ts). */
  herdViews(nowMs: number): (HerdState & {
    kind: Herd['kind'];
    radiusM: number;
    tended: boolean;
    species: HerdSpecies;
  })[] {
    const clock = this.clock(nowMs);
    return this.herds.map((herd) => ({
      ...herdState(herd, clock, createHerdState()),
      kind: herd.kind,
      radiusM: herd.radiusM,
      tended: herd.tended,
      species: herdSpecies(herd),
    }));
  }

  /**
   * Schůdná země pro postavy přes celou krajinu (pole až 800 m od obydlí, voda daleko) – buňky
   * se počítají při prvním dotazu a pamatují (`lazyWalkable`). Bez obydlí null.
   */
  walkGroundFor(village: LivestockVillage): { walkable(x: number, z: number): boolean } | null {
    if (village.dwellings.length === 0) return null;
    this.walk ??= lazyWalkable(this.env.landscape, this.env);
    const walk = this.walk;
    return { walkable: walk };
  }

  /** Je bod na schůdné souši (ne voda, ne strmý svah)? Bez obydlí nezávisle na vsi. */
  isWalkable(x: number, z: number): boolean {
    this.walk ??= lazyWalkable(this.env.landscape, this.env);
    return this.walk(x, z);
  }

  /**
   * Terén kolem vsi (rastr schůdné země, luk a okraje lesa pro zvířata). Bez obydlí null.
   */
  groundFor(village: LivestockVillage): LivestockGround | null {
    const built = village.dwellings.filter((d) => d.built);
    const around = built.length > 0 ? built : village.dwellings;
    return around.length > 0 ? this.groundAround(around) : null;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of this.kinds.values()) {
      kind.mesh.material?.dispose();
      kind.mesh.dispose();
    }
    this.kinds.clear();
    this.groups = [];
  }

  /** Skutečný čas, ne herní – ve zrychleném světě se zvířata hýbou stejně klidně. */
  private clock(nowMs: number): LivestockClock {
    return livestockClock(nowMs);
  }

  /**
   * Nové rozmístění podle poslední vsi (po změně vsi a po načtení modelů); `replan` false –
   * změnil se jen dobytek karavan, kuřata a stáda zůstanou, jak byla rozmístěná.
   */
  private rebuild(nowMs: number, replan = true): boolean {
    const village = this.village;
    if (!village || !this.geometries) {
      const had = this.groups.length > 0;
      this.groups = [];
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      return had;
    }
    const clock = this.clock(nowMs);
    let plan = this.plan;
    if (replan || !plan) {
      const built = village.dwellings.filter((d) => d.built);
      const planned =
        built.length > 0
          ? planLivestock(village, this.groundAround(built), villageSeed(this.env.landscape))
          : { chickens: [], herds: [] };
      // Stádo stejného druhu a pořadí zůstane na pastvině, kde právě je (když ji nová trasa má).
      plan = {
        chickens: planned.chickens,
        herds: planned.herds.map((herd) => {
          const same = (h: Herd): boolean => h.kind === herd.kind && h.tended === herd.tended;
          const sameKind = planned.herds.filter(same);
          const previous = this.herds.filter(same)[sameKind.indexOf(herd)];
          return previous ? keepRouteSpot(previous, herd, clock) : herd;
        }),
      };
      this.plan = plan;
    }
    this.herds = plan.herds;

    const counts = new Map<LivestockSpecies, number>();
    const slot = (species: LivestockSpecies): number => {
      const n = counts.get(species) ?? 0;
      counts.set(species, n + 1);
      return n;
    };
    const groups: Group[] = [];
    const areas = new Map<LivestockSpecies, Area[]>();
    const addArea = (species: LivestockSpecies, area: Area): void => {
      const list = areas.get(species) ?? [];
      list.push(area);
      areas.set(species, list);
    };
    for (const flock of plan.chickens) {
      const area = chickenArea(flock);
      addArea('chicken', area);
      groups.push({
        members: flock.chickens.map((c) => ({
          species: 'chicken',
          slot: slot('chicken'),
          scale: c.scale,
        })),
        prepare: () => area,
        pose: (index, clock, out) => chickenPose(flock, index, clock, out),
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
      });
    }
    for (const herd of plan.herds) {
      const state: HerdState = createHerdState();
      const whole = routeArea(herd);
      for (const animal of herd.animals) addArea(animal.species, whole);
      groups.push({
        members: herd.animals.map((a) => ({
          species: a.species,
          slot: slot(a.species),
          scale: a.scale,
        })),
        prepare: (clock) => herdArea(herd, herdState(herd, clock, state)),
        pose: (index, clock, out) => herdAnimalPose(herd, index, clock, state, out),
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
      });
    }
    // dobytek karavan výprav – krávy i voli modelem krávy (vůl o kus větší) po zemské stezce
    for (const herd of this.caravans) {
      const area = herd.area;
      addArea('cow', area);
      const shown = herd.animals.map(() => true);
      const window = this.env.dayWindow?.(herd.expedition.day) ?? null;
      groups.push({
        members: herd.animals.map((a) => ({
          species: 'cow',
          slot: slot('cow'),
          scale: a.animal.kind === 'ox' ? CARAVAN_OX_SCALE : 1,
        })),
        prepare: () => area,
        pose: (index, clock, out) => {
          shown[index] = caravanAnimalPose(herd, index, window, clock, out);
          return out;
        },
        hidden: (index) => !shown[index],
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
      });
    }

    // jezdečtí koně dne (horses.md – Ve scéně; riders.ts) – na trase objížďky, jinak u kůlu
    for (const plan of this.rides) {
      const area = rideArea(plan);
      addArea('horse', area);
      const state = createRideState();
      groups.push({
        members: [{ species: 'horse', slot: slot('horse'), scale: RIDE_HORSE_SCALE }],
        prepare: () => area,
        pose: (_index, clock, out) => rideHorsePose(plan, clock.seconds, state, out),
        // mimo blok jízdy je kůň v ohradě (village-pens.ts) – tady se nekreslí
        still: (clock) => !isRiding(plan, clock.seconds),
        hidden: (_index, clock) => !isRiding(plan, clock.seconds),
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
      });
    }

    // psi dvorce (wildlife.md – Psi; dogs.ts) – u dvorce, s lovci, s hlídkou
    for (const plan of this.dogs) {
      const area = dogArea(plan);
      addArea('dog', area);
      const state = createDogState();
      groups.push({
        members: [{ species: 'dog', slot: slot('dog'), scale: DOG_SCALE }],
        prepare: () => area,
        pose: (_index, clock, out) => dogPose(plan, clock.seconds, state, out),
        written: null,
        current: new BoundingInfo(Vector3.Zero(), Vector3.Zero()),
      });
    }

    let changed = this.groups.length > 0 || groups.length > 0;
    for (const species of SPECIES) {
      const count = counts.get(species) ?? 0;
      const geometry = this.geometries.get(species);
      let kind = this.kinds.get(species);
      if (count === 0 || !geometry) {
        kind?.mesh.setEnabled(false);
        continue;
      }
      kind ??= this.createKind(species, geometry);
      this.kinds.set(species, kind);
      kind.count = count;
      kind.matrices = new Float32Array(count * 16);
      kind.states = new Float32Array(count * 2);
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer('livestockState', kind.states, 2, false);
      // Pevný obal přes všechna místa, kam se zvířata druhu dostanou – podle něj se ořezává.
      const box = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
      this.setBounds(box, mergeAreas(areas.get(species) ?? []));
      kind.mesh.setBoundingInfo(box);
      kind.mesh.setEnabled(true);
      changed = true;
    }
    // Skupiny druhů bez modelu se nevykreslí.
    this.groups = groups
      .map((g) => ({ ...g, members: g.members.filter((m) => this.kinds.get(m.species)) }))
      .filter((g) => g.members.length > 0);
    // Póza v tomto okamžiku – při omezeném pohybu zvířata takhle zůstanou.
    this.animate(nowMs, null);
    return changed;
  }

  /** Rastr terénu kolem středu vsi (přepočítá se, až se ves hodně posune). */
  private groundAround(built: LivestockVillage['dwellings']): LivestockGround {
    const x = built.reduce((sum, d) => sum + d.position.x, 0) / built.length;
    const z = built.reduce((sum, d) => sum + d.position.z, 0) / built.length;
    const current = this.ground;
    if (current && Math.hypot(current.x - x, current.z - z) < GROUND_RECENTER_M) {
      return current.grid;
    }
    const { landscape, field, stream, relief } = this.env;
    const grid = livestockGround(landscape, { field, stream, relief }, { x, z });
    this.ground = { grid, x, z };
    return grid;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const results = await Promise.allSettled(
        HERD_SPECIES.map((species) =>
          loadGeometry(this.scene, `${this.env.baseUrl}${species}.glb`),
        ),
      );
      const geometries = new Map<LivestockSpecies, FaunaGeometry>();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          geometries.set(HERD_SPECIES[i]!, standOnGround(result.value));
        } else if (result.status === 'rejected') {
          console.warn(`Model zvířete ${HERD_SPECIES[i]} se nepodařilo načíst.`, result.reason);
        }
      });
      if (this.disposed) return;
      if (this.dogGeometry) geometries.set('dog', this.dogGeometry);
      this.geometries = geometries;
      if (this.rebuild(Date.now())) this.env.onLoaded();
    })();
    return this.loading;
  }

  /** Model psa – líně, až když má ves psy (wildlife.md – Psi). */
  private loadDog(): Promise<void> {
    this.dogLoading ??= (async (): Promise<void> => {
      try {
        const geometry = await loadGeometry(this.scene, `${this.env.baseUrl}dog.glb`);
        if (geometry) this.dogGeometry = standOnGround(geometry);
      } catch (error) {
        console.warn('Model zvířete dog se nepodařilo načíst.', error);
      }
      if (this.disposed || !this.dogGeometry || !this.geometries) return;
      this.geometries.set('dog', this.dogGeometry);
      if (this.rebuild(Date.now())) this.env.onLoaded();
    })();
    return this.dogLoading;
  }

  private createKind(species: LivestockSpecies, geometry: FaunaGeometry): Kind {
    return {
      mesh: createAnimalMesh(this.scene, `livestock-${species}`, geometry),
      matrices: new Float32Array(0),
      states: new Float32Array(0),
      count: 0,
      dirty: false,
    };
  }

  /** Zapíše pózy všech zvířat skupiny – výška a náklon podle terénu pod nimi. */
  private writeGroup(group: Group, clock: LivestockClock): void {
    const height = this.env.groundHeight;
    group.members.forEach((member, index) => {
      const kind = this.kinds.get(member.species);
      if (!kind) return;
      const pose = group.pose(index, clock, this.pose);
      const scale = group.hidden?.(index, clock) ? 0 : member.scale;
      writeAnimalPose(kind, member.slot, pose, scale, height);
    });
    const written = group.written ?? new BoundingInfo(Vector3.Zero(), Vector3.Zero());
    written.reConstruct(group.current.minimum, group.current.maximum);
    group.written = written;
  }

  /** Obal oblasti s výškou terénu (vzorky v mřížce) a místem na zvířata nad ním. */
  private setBounds(box: BoundingInfo, area: Area): void {
    let low = Infinity;
    let high = -Infinity;
    for (let j = 0; j <= 4; j++) {
      for (let i = 0; i <= 4; i++) {
        const h = this.env.groundHeight(
          area.minX + ((area.maxX - area.minX) * i) / 4,
          area.minZ + ((area.maxZ - area.minZ) * j) / 4,
        );
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    }
    box.reConstruct(
      new Vector3(area.minX, low - 1, area.minZ),
      new Vector3(area.maxX, high + HEAD_ROOM_M, area.maxZ),
    );
  }
}

/**
 * Mesh zvířete s klíčovými pózami jako vertex atributy (krok, krok, hlava dolů) a materiálem
 * s `LivestockPlugin` – dobytek i divoká zvěř (wildlife.ts). Instance a stav přidá volající.
 */
export function createAnimalMesh(scene: Scene, name: string, geometry: FaunaGeometry): Mesh {
  // Jméno mimo předpony vrhačů stínů (trees-, impostors-, decor-) – stínová mapa je statická.
  const mesh = new Mesh(name, scene);
  geometry.vertexData.applyToMesh(mesh);
  mesh.setVerticesData('livestockKeyA', geometry.keyA, false, 3);
  mesh.setVerticesData('livestockKeyB', geometry.keyB, false, 3);
  mesh.setVerticesData(
    'livestockKeyC',
    geometry.keyC ?? new Float32Array(geometry.keyA.length),
    false,
    3,
  );
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();

  const material = new StandardMaterial(`${name}-material`, scene);
  // Bez mipmap jako u ryb a ptáků: ostrůvky textury leží na černém pozadí, nejmenší mipmapa
  // by zvíře z dálky ztmavila.
  geometry.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  material.diffuseTexture = geometry.texture;
  material.specularColor = Color3.Black();
  // Uši, ocasy a hřebínky jsou jednoduché plochy – kreslí se z obou stran.
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  // Textura se čte v barvách obrazovky (`loadGeometry`) – StandardMaterial ji bere tak, jak je.
  new LivestockPlugin(material);
  mesh.material = material;
  return mesh;
}

/**
 * Zapíše pózu zvířete do instancí (matice a stav kroku a hlavy) – výška a náklon podle terénu
 * pod ním (`height`). Nulové měřítko = zvíře není vidět.
 */
export function writeAnimalPose(
  kind: { matrices: Float32Array; states: Float32Array; dirty: boolean },
  slot: number,
  pose: LivestockPose,
  scale: number,
  height: (x: number, z: number) => number,
): void {
  const { x, z } = pose;
  const e = SLOPE_STEP_M;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  // Dopředu podél svahu (hlava do kopce výš), do strany jen částečně.
  const fy = gx * pose.forwardX + gz * pose.forwardZ;
  const length = Math.hypot(pose.forwardX, fy, pose.forwardZ);
  const nx = -gx;
  const nz = -gz;
  const nLength = Math.hypot(nx, 1, nz);
  writeInstanceMatrix(
    kind.matrices,
    slot,
    {
      x,
      y: height(x, z),
      z,
      forwardX: pose.forwardX / length,
      forwardY: fy / length,
      forwardZ: pose.forwardZ / length,
      tiltX: (nx / nLength) * SIDE_TILT,
      tiltZ: (nz / nLength) * SIDE_TILT,
    },
    scale,
  );
  kind.states[slot * 2] = pose.stride;
  kind.states[slot * 2 + 1] = pose.head;
  kind.dirty = true;
}

/**
 * Co z vsi rozhoduje o zvířatech: obydlí s pozemky (i staveniště jako překážky), pole, louky
 * letošní seče, hřbitovy, sady a pasáci dne.
 */
function villageKey(village: LivestockVillage): string {
  const dwellings = village.dwellings.map(
    (d) =>
      `${d.id}:${d.type}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:` +
      `${d.position.x.toFixed(2)},${d.position.z.toFixed(2)},${d.position.rotation.toFixed(3)}` +
      (d.plot ? `:${JSON.stringify(d.plot)}` : ''),
  );
  // louka před sečí stádům překáží, otava se pase
  const meadows = (village.hayMeadows ?? []).map(
    (m) => `${m.x.toFixed(1)},${m.z.toFixed(1)}${grazedMeadow(m, grazingDay(village)) ? 'g' : ''}`,
  );
  // kolik stád jde na pastvu s pasákem a jestli je zima (ovce, kozy a krávy u domů)
  const day = village.labor?.day;
  const winter = day !== undefined && HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const herders = `${herderCount(village.labor)}${winter ? 'w' : ''}`;
  // díl pole, na kterém se pase (úhor), stádům nepřekáží – změna stadia přeplánuje pastviny
  const parts = village.fields
    .flatMap((f) => f.parts)
    .map(
      (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}${grazedPart(p, grazingDay(village)) ? 'g' : ''}`,
    );
  const squares = [
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
    ...(village.orchards ?? []).flatMap((o) => o.squares),
    ...(village.pens ?? []).flatMap(penSquaresOf),
  ].map(
    (s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}${s.rotation ? `@${s.rotation.toFixed(3)}` : ''}`,
  );
  // skutečné počty stád (diet.md) – narození, porážka a krávy v ohradě přeplánují stáda
  const counts = herdCounts(village);
  const horses = grazingHorses(village).map((h) => `${h.id}${h.kind[0]}`);
  const herds = `${counts.sheep},${counts.goat},${counts.pig},${counts.cow},${horses.join('.')}`;
  return `${dwellings.join(';')}|${parts.join(';')}|${meadows.join(';')}|${squares.join(';')}|${herds}|${herders}`;
}

/** Náhoda zvířat podle krajiny – v každé vsi se stáda pasou jinde. */
function villageSeed(l: Landscape): number {
  return (l.villageSite.x * 131 + l.villageSite.y * 7919) | 0;
}

function mergeAreas(areas: readonly Area[]): Area {
  return {
    minX: Math.min(...areas.map((a) => a.minX)),
    maxX: Math.max(...areas.map((a) => a.maxX)),
    minZ: Math.min(...areas.map((a) => a.minZ)),
    maxZ: Math.max(...areas.map((a) => a.maxZ)),
  };
}

/** Model vystředěný na počátku (fauna_from_0ad.py) postaví nohama na zem: nejnižší bod y = 0. */
export function standOnGround(geometry: FaunaGeometry): FaunaGeometry {
  const positions = geometry.vertexData.positions;
  if (!positions) return geometry;
  let low = Infinity;
  for (let i = 1; i < positions.length; i += 3) low = Math.min(low, positions[i]!);
  const shifted = Float32Array.from(positions);
  for (let i = 1; i < shifted.length; i += 3) shifted[i] = shifted[i]! - low;
  geometry.vertexData.positions = shifted;
  return geometry;
}

/**
 * Pózy dobytka ve vertex shaderu (GLSL i WGSL) nad StandardMaterialem: krok je parabola přes
 * tři pózy (noha vpředu, stoj, druhá noha vpředu – livestockKeyA/B, stav x), sklonění hlavy
 * lineárně ke třetí klíčové póze (livestockKeyC, stav y).
 */
export class LivestockPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'Livestock', 200, { LIVESTOCK: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['LIVESTOCK'] = true;
  }

  override getClassName(): string {
    return 'LivestockPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('livestockKeyA', 'livestockKeyB', 'livestockKeyC', 'livestockState');
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType !== 'vertex') return null;
    return wgsl
      ? {
          CUSTOM_VERTEX_DEFINITIONS: `attribute livestockKeyA: vec3f;
attribute livestockKeyB: vec3f;
attribute livestockKeyC: vec3f;
attribute livestockState: vec2f;`,
          CUSTOM_VERTEX_UPDATE_POSITION: `{
  let livestockStride = vertexInputs.livestockState.x;
  positionUpdated = positionUpdated + vertexInputs.livestockKeyA * livestockStride + vertexInputs.livestockKeyB * (livestockStride * livestockStride) + vertexInputs.livestockKeyC * vertexInputs.livestockState.y;
}`,
        }
      : {
          CUSTOM_VERTEX_DEFINITIONS: `attribute vec3 livestockKeyA;
attribute vec3 livestockKeyB;
attribute vec3 livestockKeyC;
attribute vec2 livestockState;`,
          CUSTOM_VERTEX_UPDATE_POSITION: `{
  float livestockStride = livestockState.x;
  positionUpdated += livestockKeyA * livestockStride + livestockKeyB * (livestockStride * livestockStride) + livestockKeyC * livestockState.y;
}`,
        };
  }
}

/** Kterých zvířat je ve stádě nejvíc (pasák „pase ovce“ – villagers.md, Výběr postavy). */
export function herdSpecies(herd: Pick<Herd, 'kind' | 'animals'>): HerdSpecies {
  if (herd.kind === 'cattle') return 'cow';
  if (herd.kind === 'swine') return 'pig';
  const sheep = herd.animals.filter((a) => a.species === 'sheep').length;
  return sheep * 2 >= herd.animals.length ? 'sheep' : 'goat';
}
