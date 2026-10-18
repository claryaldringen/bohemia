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
import { type ForestField, type Landscape, type Relief } from '@bohemia/game';
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
  grazedPart,
  grazingDay,
  livestockGround,
  planLivestock,
  type Herd,
  type LivestockGround,
  type LivestockSpecies,
  type LivestockVillage,
} from './livestock-placement';
import type { StreamCenterline } from './stream-geometry';

const SPECIES: readonly LivestockSpecies[] = ['sheep', 'goat', 'cow', 'pig', 'chicken'];
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
}

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
  /** Kde byla zvířata naposled zapsaná – i odtud je musí kamera „pustit“. */
  written: BoundingInfo | null;
  current: BoundingInfo;
}

/**
 * Domácí zvířata vsi (ozdoba, bez herní mechaniky): slepice kolem hotových obydlí, ovce
 * s kozami a krávy na loukách, prasata v lese u okraje (livestock-placement.ts). Modely z 0 A.D.
 * jako u ryb a ptáků (fauna.ts) – každý druh jeden mesh s instancemi, krok a sklonění hlavy
 * jsou přechody mezi klíčovými pózami ve vertex shaderu. Kde zvíře je a co dělá, je čistá
 * funkce času (livestock-motion.ts); `animate` pohne jen skupinami v záběru. Modely se stahují
 * až s prvním zvířetem; když se některý nenačte, ten druh chybí (zaloguje se varování).
 */
export class VillageLivestock {
  private ground: { grid: LivestockGround; x: number; z: number } | null = null;
  private village: LivestockVillage | null = null;
  private key = '';
  private groups: Group[] = [];
  /** Stáda posledního rozmístění – nová stáda po přepočtu zůstanou na své pastvině. */
  private herds: Herd[] = [];
  private readonly kinds = new Map<LivestockSpecies, Kind>();
  private geometries: Map<LivestockSpecies, FaunaGeometry> | null = null;
  private loading: Promise<void> | null = null;
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
  update(village: LivestockVillage, nowMs: number): boolean {
    if (this.disposed) return false;
    const key = villageKey(village);
    if (key === this.key) return false;
    this.key = key;
    this.village = village;
    if (village.dwellings.some((d) => d.built)) void this.load();
    return this.rebuild(nowMs);
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
  herdViews(nowMs: number): (HerdState & { kind: Herd['kind']; radiusM: number })[] {
    const clock = this.clock(nowMs);
    return this.herds.map((herd) => ({
      ...herdState(herd, clock, createHerdState()),
      kind: herd.kind,
      radiusM: herd.radiusM,
    }));
  }

  /**
   * Terén kolem vsi (rastr schůdné země, luk a okraje lesa) – sdílí ho postavy, aby se drahé
   * dotazy na potok a les nepočítaly dvakrát. Bez obydlí null.
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

  /** Nové rozmístění podle poslední vsi (po změně vsi a po načtení modelů). */
  private rebuild(nowMs: number): boolean {
    const village = this.village;
    if (!village || !this.geometries) {
      const had = this.groups.length > 0;
      this.groups = [];
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      return had;
    }
    const built = village.dwellings.filter((d) => d.built);
    const planned =
      built.length > 0
        ? planLivestock(village, this.groundAround(built), villageSeed(this.env.landscape))
        : { chickens: [], herds: [] };
    // Stádo stejného druhu a pořadí zůstane na pastvině, kde právě je (když ji nová trasa má).
    const clock = this.clock(nowMs);
    const plan = {
      ...planned,
      herds: planned.herds.map((herd) => {
        const sameKind = planned.herds.filter((h) => h.kind === herd.kind);
        const previous = this.herds.filter((h) => h.kind === herd.kind)[sameKind.indexOf(herd)];
        return previous ? keepRouteSpot(previous, herd, clock) : herd;
      }),
    };
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
        SPECIES.map((species) => loadGeometry(this.scene, `${this.env.baseUrl}${species}.glb`)),
      );
      const geometries = new Map<LivestockSpecies, FaunaGeometry>();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          geometries.set(SPECIES[i]!, standOnGround(result.value));
        } else if (result.status === 'rejected') {
          console.warn(`Model zvířete ${SPECIES[i]} se nepodařilo načíst.`, result.reason);
        }
      });
      if (this.disposed) return;
      this.geometries = geometries;
      if (this.rebuild(Date.now())) this.env.onLoaded();
    })();
    return this.loading;
  }

  private createKind(species: LivestockSpecies, geometry: FaunaGeometry): Kind {
    // Jméno mimo předpony vrhačů stínů (trees-, impostors-, decor-) – stínová mapa je statická.
    const mesh = new Mesh(`livestock-${species}`, this.scene);
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

    const material = new StandardMaterial(`livestock-${species}-material`, this.scene);
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
    return {
      mesh,
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
        member.slot,
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
        member.scale,
      );
      kind.states[member.slot * 2] = pose.stride;
      kind.states[member.slot * 2 + 1] = pose.head;
      kind.dirty = true;
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

/** Co z vsi rozhoduje o zvířatech: obydlí (i staveniště jako překážky), pole, hřbitovy a sady. */
function villageKey(village: LivestockVillage): string {
  const dwellings = village.dwellings.map(
    (d) =>
      `${d.id}:${d.type}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:` +
      `${d.position.x.toFixed(2)},${d.position.z.toFixed(2)},${d.position.rotation.toFixed(3)}`,
  );
  // díl pole, na kterém se pase (úhor), stádům nepřekáží – změna stadia přeplánuje pastviny
  const parts = village.fields
    .flatMap((f) => f.parts)
    .map(
      (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}${grazedPart(p, grazingDay(village)) ? 'g' : ''}`,
    );
  const squares = [
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
    ...(village.orchards ?? []).flatMap((o) => o.squares),
  ].map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`);
  return `${dwellings.join(';')}|${parts.join(';')}|${squares.join(';')}`;
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
function standOnGround(geometry: FaunaGeometry): FaunaGeometry {
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
class LivestockPlugin extends MaterialPluginBase {
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
