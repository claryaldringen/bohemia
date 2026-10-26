// Porážka ve scéně (diet.md – Porážka ve scéně; Martin 26. 10. 2026: sekvence omráčení –
// vykrvení – zavěšení – vyvržení – rozčtvrcení – odnos, bez krve kromě tmavé hladiny v misce,
// zvíře se srstí, vnitřnosti se nekreslí). Kdy co je, říká plán porážky (slaughter-plan.ts) –
// čistá funkce času; lidi party kreslí villagers.ts. Tady jen věci stanoviště:
// - rekvizity ze slaughter.glb (kozlina velká a malá, necky, špalek, miska) – díly v instancích
//   (instance = stanoviště), nehybné, matice se zapíšou při novém plánu; miska až od zavěšení;
// - mršina carcass-<druh>.glb – jeden mesh na druh, instance = stanoviště; póza je morph ve
//   vertex shaderu (CarcassPlugin: 1 stojí, 0 leží, −1 visí) a useknuté čtvrtiny zahodí
//   fragment shader (`discard` podle bitů stavu);
// - kýty na prkně špalku – komolý kužel v instancích (4 místa na stanoviště).
// Zapisuje se jen při změně stavu (pád a zvednutí na háky plynule, jinak skokově), při omezeném
// pohybu stojí (animate se nevolá – zůstane stav ze `set`). Modely se načtou, až je porážka.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { HerdSpecies } from '@bohemia/game';
import { loadGeometry, type FaunaGeometry } from './fauna';
import { applyGammaFog } from './gamma-fog';
import { loadModelParts } from './instanced-model';
import {
  BLOCK,
  createSlaughterState,
  slaughterState,
  type SlaughterPlan,
  type SlaughterState,
} from './slaughter-plan';

const PROPS_URL = '/models/slaughter/slaughter.glb';
const CARCASS_URL = '/models/fauna/carcass-';

/** Díly slaughter.glb (tools/blender/slaughter.py). */
type PropPart = 'trestle-large' | 'trestle-small' | 'trough' | 'block' | 'bowl';
const PROP_PARTS: readonly PropPart[] = [
  'trestle-large',
  'trestle-small',
  'trough',
  'block',
  'bowl',
];

/** Kýta na prkně: komolý kužel podél prkna napříč (m) – stejná na všechny druhy, jen měřítko. */
const LEG = { length: 0.3, thick: 0.12, thin: 0.06 } as const;
const LEG_SCALE: Record<HerdSpecies, number> = { cow: 1.2, pig: 1, sheep: 0.85, goat: 0.85 };
const MEAT_COLOR = new Color3(0.5, 0.2, 0.16);
/** Okolní světlo dílů – jako modely vsi (village-renderer.ts). */
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Dál od kamery (m) se porážka nepřepisuje – jako pohřeb. */
const ANIMATE_RANGE_M = 1500;
/** Kotva háku: vrcholy visící pózy nejvýš tolik (m) pod jejím vrcholem – kopyta zadních nohou. */
const HOOK_BAND_M = 0.08;
/** Okraj obalu stanoviště (kozlina, ležící kráva, špalek, miska) a výška nad zemí (m). */
const STATION_REACH_M = 3.5;
const STATION_HEIGHT_M = 3;
/** Kolik čísel stavu stanoviště se porovnává se zapsaným (viz `noteState`). */
const STATE_FIELDS = 10;

export interface SlaughterRendererEnvironment {
  /** Výška terénu (s převýšením). */
  groundHeight(x: number, z: number): number;
  /** Modely se načetly – překreslit. */
  onLoaded(): void;
}

interface Slots {
  mesh: Mesh;
  matrices: Float32Array;
}

interface CarcassSlots extends Slots {
  /** Stav instance: póza (1 stojí, 0 leží, −1 visí) a bity useknutých čtvrtin. */
  states: Float32Array;
}

/**
 * Porážka ve vsi: `set` dostane plán dne (villagers.ts ho spočítá s partou), `animate` přepíše
 * mršinu, kýty a misku na okamžik `nowMs` (skutečný čas) – jen když se stav změnil.
 */
export class SlaughterRenderer {
  private plan: SlaughterPlan | null = null;
  private readonly props = new Map<PropPart, Slots>();
  private readonly carcasses = new Map<HerdSpecies, CarcassSlots>();
  private meat: Slots | null = null;
  private propsLoading: Promise<void> | null = null;
  private readonly carcassLoading = new Set<HerdSpecies>();
  private states: SlaughterState[] = [];
  /** Instance stanoviště v meshi jeho druhu. */
  private slotOf: number[] = [];
  /** Naposledy zapsaný stav stanovišť (STATE_FIELDS čísel na stanoviště). */
  private last = new Float64Array(0);
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: SlaughterRendererEnvironment,
  ) {}

  /** Nový plán porážky (bez porážky null); vrátí true, když je co překreslit. */
  set(plan: SlaughterPlan | null, nowMs: number): boolean {
    if (this.disposed) return false;
    const had = this.plan !== null;
    this.plan = plan && plan.stations.length > 0 ? plan : null;
    const stations = this.plan?.stations ?? [];
    this.states = stations.map(() => createSlaughterState());
    if (this.plan) {
      void this.loadProps();
      for (const species of new Set(stations.map((s) => s.species))) this.loadCarcass(species);
    }
    this.allocate();
    this.updateBounds();
    this.write(nowMs);
    return had || this.plan !== null;
  }

  /** Posune mršinu, kýty a misku na okamžik `nowMs`; true, když se v záběru něco změnilo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (!this.plan) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    return this.write(nowMs);
  }

  /** Kam namířit kameru (vývojová ukázka): na kozlinu prvního stanoviště; bez porážky null. */
  focus(): { x: number; z: number } | null {
    const station = this.plan?.stations[0];
    return station ? { x: station.x, z: station.z } : null;
  }

  dispose(): void {
    this.disposed = true;
    this.plan = null;
    for (const slots of this.props.values()) slots.mesh.dispose(false, true);
    this.props.clear();
    for (const slots of this.carcasses.values()) slots.mesh.dispose(false, true);
    this.carcasses.clear();
    this.meat?.mesh.dispose(false, true);
    this.meat = null;
  }

  /** Buffery instancí pro současná stanoviště a nehybné rekvizity (kozlina, necky, špalek). */
  private allocate(): void {
    const stations = this.plan?.stations ?? [];
    const n = Math.max(1, stations.length);
    for (const [part, slots] of this.props) {
      slots.matrices = new Float32Array(n * 16);
      let shown = 0;
      stations.forEach((st, i) => {
        const spot =
          part === `trestle-${st.trestle}`
            ? st
            : part === 'trough'
              ? st.trough
              : part === 'block'
                ? st.block
                : null;
        if (!spot) return;
        writeMatrix(
          slots.matrices,
          i,
          spot.x,
          this.env.groundHeight(spot.x, spot.z),
          spot.z,
          spot.headingX,
          spot.headingZ,
          1,
        );
        shown++;
      });
      slots.mesh.thinInstanceSetBuffer('matrix', slots.matrices, 16, false);
      slots.mesh.thinInstanceCount = stations.length;
      // miska se ukáže až v `write`
      slots.mesh.setEnabled(shown > 0);
    }
    this.slotOf = [];
    for (const [species, slots] of this.carcasses) {
      const own = stations.filter((st) => st.species === species).length;
      let k = 0;
      stations.forEach((st, i) => {
        if (st.species === species) this.slotOf[i] = k++;
      });
      slots.matrices = new Float32Array(Math.max(1, own) * 16);
      slots.states = new Float32Array(Math.max(1, own) * 2);
      slots.mesh.thinInstanceSetBuffer('matrix', slots.matrices, 16, false);
      slots.mesh.thinInstanceSetBuffer('carcassState', slots.states, 2, false);
      slots.mesh.thinInstanceCount = own;
      slots.mesh.setEnabled(false);
    }
    if (this.meat) {
      this.meat.matrices = new Float32Array(n * BLOCK.legSlots.length * 16);
      this.meat.mesh.thinInstanceSetBuffer('matrix', this.meat.matrices, 16, false);
      this.meat.mesh.thinInstanceCount = stations.length * BLOCK.legSlots.length;
      this.meat.mesh.setEnabled(false);
    }
    // po novém plánu nebo načtení modelu se zapíše všechno znovu
    this.last = new Float64Array(stations.length * STATE_FIELDS).fill(Number.NaN);
  }

  /** Obal stanovišť (kozlina, kde zvíře leží, špalek, miska) – podle něj se nepřepisuje mimo záběr. */
  private updateBounds(): void {
    const stations = this.plan?.stations ?? [];
    if (stations.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    for (const st of stations) {
      for (const p of [st, st.animal, st.block]) {
        minX = Math.min(minX, p.x - STATION_REACH_M);
        maxX = Math.max(maxX, p.x + STATION_REACH_M);
        minZ = Math.min(minZ, p.z - STATION_REACH_M);
        maxZ = Math.max(maxZ, p.z + STATION_REACH_M);
        const y = this.env.groundHeight(p.x, p.z);
        low = Math.min(low, y - 1);
        high = Math.max(high, y + STATION_HEIGHT_M);
      }
    }
    this.bounds.reConstruct(new Vector3(minX, low, minZ), new Vector3(maxX, high, maxZ));
  }

  /** Zapíše mršiny, kýty a misky stanovišť, která se od posledního zápisu změnila. */
  private write(nowMs: number): boolean {
    const plan = this.plan;
    if (!plan) return false;
    const height = this.env.groundHeight;
    const bowl = this.props.get('bowl');
    let changed = false;
    plan.stations.forEach((st, i) => {
      const state = slaughterState(plan, st, nowMs, this.states[i]);
      if (!this.noteState(i, state)) return;
      changed = true;
      const c = state.carcass;
      const carcass = this.carcasses.get(st.species);
      const slot = this.slotOf[i];
      if (carcass && slot !== undefined) {
        const show = c.visible ? 1 : 0;
        writeMatrix(
          carcass.matrices,
          slot,
          c.x,
          height(c.x, c.z) + c.lift,
          c.z,
          c.headingX,
          c.headingZ,
          show,
        );
        carcass.states[slot * 2] = c.pose;
        carcass.states[slot * 2 + 1] = c.cutMask;
      }
      if (this.meat) {
        const { x, z, headingX: hx, headingZ: hz } = st.block;
        const scale = LEG_SCALE[st.species];
        const y = height(x, z) + BLOCK.boardY + (LEG.thick / 2) * scale;
        BLOCK.legSlots.forEach((along, k) => {
          // místa podél prkna = místní X špalku (hz, −hx)
          const show = k < state.legsOnBoard ? scale : 0;
          writeMatrix(
            this.meat!.matrices,
            i * BLOCK.legSlots.length + k,
            x + along * hz,
            y,
            z - along * hx,
            hx,
            hz,
            show,
          );
        });
      }
      if (bowl && st.bowl) {
        const show = state.bowlOnGround ? 1 : 0;
        writeMatrix(
          bowl.matrices,
          i,
          st.bowl.x,
          height(st.bowl.x, st.bowl.z),
          st.bowl.z,
          0,
          1,
          show,
        );
      }
    });
    if (!changed) return false;
    for (const slots of this.carcasses.values()) {
      slots.mesh.thinInstanceBufferUpdated('matrix');
      slots.mesh.thinInstanceBufferUpdated('carcassState');
      slots.mesh.setEnabled(anyShown(slots.matrices, slots.mesh.thinInstanceCount));
    }
    for (const slots of [this.meat, bowl]) {
      if (!slots) continue;
      slots.mesh.thinInstanceBufferUpdated('matrix');
      slots.mesh.setEnabled(anyShown(slots.matrices, slots.mesh.thinInstanceCount));
    }
    return true;
  }

  /** Uloží stav stanoviště `i`; vrátí true, když se od posledního zápisu změnil. */
  private noteState(i: number, state: SlaughterState): boolean {
    const c = state.carcass;
    const last = this.last;
    const o = i * STATE_FIELDS;
    let changed = false;
    const note = (k: number, value: number): void => {
      if (last[o + k] === value) return;
      last[o + k] = value;
      changed = true;
    };
    note(0, c.visible ? 1 : 0);
    note(1, c.pose);
    note(2, c.x);
    note(3, c.z);
    note(4, c.lift);
    note(5, c.headingX);
    note(6, c.headingZ);
    note(7, c.cutMask);
    note(8, state.legsOnBoard);
    note(9, state.bowlOnGround ? 1 : 0);
    return changed;
  }

  private loadProps(): Promise<void> {
    this.propsLoading ??= (async (): Promise<void> => {
      const parts = await loadModelParts(
        this.scene,
        PROPS_URL,
        'slaughter-',
        prepareMaterial,
      ).catch((error: unknown) => {
        console.warn('Rekvizity porážky se nepodařilo načíst.', error);
        return null;
      });
      if (!parts || this.disposed || this.scene.isDisposed) {
        for (const mesh of parts?.values() ?? []) mesh.dispose();
        return;
      }
      for (const [name, mesh] of parts) {
        if (!(PROP_PARTS as readonly string[]).includes(name)) {
          mesh.dispose();
          continue;
        }
        // dočasné díly (jen den porážky) – ne vrhače stínové mapy; obal přes instance by se
        // přepočítával
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.isPickable = false;
        this.props.set(name as PropPart, { mesh, matrices: new Float32Array(16) });
      }
      this.meat = this.createMeat();
      this.allocate();
      this.write(Date.now());
      this.env.onLoaded();
    })();
    return this.propsLoading;
  }

  private loadCarcass(species: HerdSpecies): void {
    if (this.carcassLoading.has(species)) return;
    this.carcassLoading.add(species);
    loadGeometry(this.scene, `${CARCASS_URL}${species}.glb`).then(
      (geometry) => {
        if (!geometry || this.disposed || this.scene.isDisposed) return;
        this.carcasses.set(species, this.createCarcass(species, alignCarcass(geometry)));
        this.allocate();
        this.write(Date.now());
        this.env.onLoaded();
      },
      (error: unknown) => console.warn(`Mršinu ${species} se nepodařilo načíst.`, error),
    );
  }

  /** Mesh mršiny: leží (základ), klíče stojí a visí, stav instance – 7 vertex bufferů. */
  private createCarcass(species: HerdSpecies, geometry: FaunaGeometry): CarcassSlots {
    const mesh = new Mesh(`slaughter-carcass-${species}`, this.scene);
    geometry.vertexData.applyToMesh(mesh);
    mesh.setVerticesData('carcassKeyA', geometry.keyA, false, 3);
    mesh.setVerticesData('carcassKeyB', geometry.keyB, false, 3);
    mesh.isPickable = false;
    // póza z morphu přesahuje obal základu (visí 2 m vysoko) – vybírá se vždy, je jich pár
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.freezeWorldMatrix();
    const material = new StandardMaterial(`slaughter-carcass-${species}-material`, this.scene);
    // bez mipmap jako dobytek (livestock.ts) – ostrůvky textury leží na černém pozadí
    geometry.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    material.diffuseTexture = geometry.texture;
    material.specularColor = Color3.Black();
    // uši, ocas a řez čtvrtin – kreslí se z obou stran
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    new CarcassPlugin(material);
    mesh.material = material;
    mesh.setEnabled(false);
    return { mesh, matrices: new Float32Array(16), states: new Float32Array(2) };
  }

  /** Kýta: komolý kužel ležící podél místní osy Z (napříč prknem), spodkem na počátku. */
  private createMeat(): Slots {
    const mesh = CreateCylinder(
      'slaughter-meat',
      { height: LEG.length, diameterTop: LEG.thick, diameterBottom: LEG.thin, tessellation: 8 },
      this.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.bakeCurrentTransformIntoVertices();
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const material = new StandardMaterial('slaughter-meat-material', this.scene);
    material.diffuseColor = MEAT_COLOR;
    material.specularColor = Color3.Black();
    mesh.material = material;
    mesh.setEnabled(false);
    return { mesh, matrices: new Float32Array(16) };
  }
}

/**
 * Natočení kolem svislé osy (místní +Z = směr (hx, hz), místní +X = (hz, −hx)) a měřítko;
 * měřítko 0 = skrytá instance (nulová matice).
 */
function writeMatrix(
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
  if (scale === 0) {
    m.fill(0, o, o + 16);
    return;
  }
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

/** Má aspoň jedna z prvních `count` instancí nenulovou matici? */
function anyShown(matrices: Float32Array, count: number): boolean {
  for (let i = 0; i < count; i++) if (matrices[i * 16 + 15] !== 0) return true;
  return false;
}

/** Materiál rekvizit z GLB (PBR): opar jako modely vsi. */
function prepareMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
}

/** Posun pózy mršiny (odečte se od jejích vrcholů). */
export interface CarcassShift {
  x: number;
  y: number;
  z: number;
}

/**
 * Posuny póz mršiny (scéna, po převodu os z glTF) změřené z vrcholů: ležící střed obalu na
 * počátek a spodkem na zem, stojící totéž (stojí na zemi uprostřed místa), visící kotvou háku
 * (kopyta zadních nohou – vrcholy do `HOOK_BAND_M` pod vrcholem) nad počátek a výška beze změny
 * (počátek visícího = hroty háků − CARCASS.hangTop, slaughter-plan.ts).
 */
export function carcassShifts(
  base: ArrayLike<number>,
  keyA: ArrayLike<number>,
  keyB: ArrayLike<number>,
): { lie: CarcassShift; stand: CarcassShift; hang: CarcassShift } {
  const n = Math.floor(base.length / 3);
  const lo = { lie: [Infinity, Infinity, Infinity], stand: [Infinity, Infinity, Infinity] };
  const hi = { lie: [-Infinity, -Infinity, -Infinity], stand: [-Infinity, -Infinity, -Infinity] };
  let top = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const p = base[j]!;
      const s = p + keyA[j]! + keyB[j]!;
      lo.lie[c] = Math.min(lo.lie[c]!, p);
      hi.lie[c] = Math.max(hi.lie[c]!, p);
      lo.stand[c] = Math.min(lo.stand[c]!, s);
      hi.stand[c] = Math.max(hi.stand[c]!, s);
    }
    top = Math.max(top, base[i * 3 + 1]! - keyA[i * 3 + 1]! + keyB[i * 3 + 1]!);
  }
  let ax = 0;
  let az = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const hang = (c: number): number => base[i * 3 + c]! - keyA[i * 3 + c]! + keyB[i * 3 + c]!;
    if (hang(1) < top - HOOK_BAND_M) continue;
    ax += hang(0);
    az += hang(2);
    count++;
  }
  const centre = (pose: 'lie' | 'stand'): CarcassShift => ({
    x: (lo[pose][0]! + hi[pose][0]!) / 2,
    y: lo[pose][1]!,
    z: (lo[pose][2]! + hi[pose][2]!) / 2,
  });
  return {
    lie: centre('lie'),
    stand: centre('stand'),
    hang: { x: count > 0 ? ax / count : 0, y: 0, z: count > 0 ? az / count : 0 },
  };
}

/**
 * Mršina srovnaná na místo (`carcassShifts`): základ a klíče přepočítané tak, aby ležící
 * a stojící zvíře mělo střed na počátku a spodek na zemi a visící kotvu háku nad počátkem.
 * Stojící souřadnice vrcholu (`position + keyA + keyB` – podle nich se dělí čtvrtiny) pak mají
 * střed na počátku: strana x, podél těla z (hlava +z).
 */
export function alignCarcass(geometry: FaunaGeometry): FaunaGeometry {
  const base = geometry.vertexData.positions;
  if (!base) return geometry;
  const { keyA, keyB } = geometry;
  const shift = carcassShifts(base, keyA, keyB);
  const lie = [shift.lie.x, shift.lie.y, shift.lie.z];
  const stand = [shift.stand.x, shift.stand.y, shift.stand.z];
  const hang = [shift.hang.x, shift.hang.y, shift.hang.z];
  const positions = new Float32Array(base.length);
  const a = new Float32Array(base.length);
  const b = new Float32Array(base.length);
  for (let j = 0; j < base.length; j++) {
    const c = j % 3;
    const p = base[j]! - lie[c]!;
    const s = base[j]! + keyA[j]! + keyB[j]! - stand[c]!;
    const h = base[j]! - keyA[j]! + keyB[j]! - hang[c]!;
    positions[j] = p;
    // parabola přes tři pózy jako loadGeometry: −1 visí, 0 leží, +1 stojí
    a[j] = (s - h) / 2;
    b[j] = (s + h) / 2 - p;
  }
  geometry.vertexData.positions = positions;
  return { ...geometry, keyA: a, keyB: b };
}

/**
 * Póza mršiny a rozčtvrcení ve shaderu (GLSL i WGSL) nad StandardMaterialem: vrcholy mají
 * koeficienty carcassKeyA/B (parabola přes visí – leží – stojí), instance stav carcassState
 * (póza, bity useknutých čtvrtin – QUARTER_BITS). Čtvrtina vrcholu se určí ze stojících
 * souřadnic (`position + A + B` – vertex shader je pošle dál): přední = z > 0 (hlava), pravá =
 * x > 0; bit 1 přední pravá, 2 přední levá, 4 zadní pravá, 8 zadní levá. Fragment useknuté
 * čtvrtiny zahodí – řez je rovný, vnitřnosti se nekreslí.
 */
export class CarcassPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'Carcass', 200, { CARCASS: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['CARCASS'] = true;
  }

  override getClassName(): string {
    return 'CarcassPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('carcassKeyA', 'carcassKeyB', 'carcassState');
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `attribute carcassKeyA: vec3f;
attribute carcassKeyB: vec3f;
attribute carcassState: vec2f;
varying vCarcassCut: vec3f;`,
            CUSTOM_VERTEX_UPDATE_POSITION: `{
  let carcassPose = vertexInputs.carcassState.x;
  let carcassStand = vertexInputs.position + vertexInputs.carcassKeyA + vertexInputs.carcassKeyB;
  vertexOutputs.vCarcassCut = vec3f(carcassStand.x, carcassStand.z, vertexInputs.carcassState.y);
  positionUpdated = positionUpdated + vertexInputs.carcassKeyA * carcassPose + vertexInputs.carcassKeyB * (carcassPose * carcassPose);
}`,
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: `attribute vec3 carcassKeyA;
attribute vec3 carcassKeyB;
attribute vec2 carcassState;
varying vec3 vCarcassCut;`,
            CUSTOM_VERTEX_UPDATE_POSITION: `{
  float carcassPose = carcassState.x;
  vec3 carcassStand = position + carcassKeyA + carcassKeyB;
  vCarcassCut = vec3(carcassStand.x, carcassStand.z, carcassState.y);
  positionUpdated += carcassKeyA * carcassPose + carcassKeyB * (carcassPose * carcassPose);
}`,
          };
    }
    if (shaderType !== 'fragment') return null;
    // bit čtvrtiny: floor((maska + 0,5) / 2^q) liché = useknutá (+0,5 proti zaokrouhlení varying)
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vCarcassCut: vec3f;`,
          CUSTOM_FRAGMENT_MAIN_BEGIN: `{
  let carcassCut = fragmentInputs.vCarcassCut;
  let carcassQuarter = select(2.0, 0.0, carcassCut.y > 0.0) + select(1.0, 0.0, carcassCut.x > 0.0);
  let carcassBit = floor((carcassCut.z + 0.5) / exp2(carcassQuarter));
  if (carcassBit - 2.0 * floor(carcassBit * 0.5) > 0.5) { discard; }
}`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vec3 vCarcassCut;`,
          CUSTOM_FRAGMENT_MAIN_BEGIN: `{
  float carcassQuarter = (vCarcassCut.y > 0.0 ? 0.0 : 2.0) + (vCarcassCut.x > 0.0 ? 0.0 : 1.0);
  float carcassBit = floor((vCarcassCut.z + 0.5) / exp2(carcassQuarter));
  if (carcassBit - 2.0 * floor(carcassBit * 0.5) > 0.5) discard;
}`,
        };
  }
}
