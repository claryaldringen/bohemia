// Trychtýř smrště (disasters.md – Smršť, Ve scéně): tmavý vířící trychtýř s prachem u země přejde
// v den smrště stopou kolem vsi za ≈ 10 s (`FUNNEL_PASS` ve storm.ts, cesta `funnelPoint`).
// Kreslí se jen v průchodu a jen s animacemi – při omezeném pohybu zůstane jen ztmavení scény
// a stopa (vývraty, polehlá pole, rozmetané stohy). Stín nevrhá (stínová mapa je statická).
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneTornado } from '../village-view';
import type { Rgb } from './season-look';
import { funnelProgress } from './storm';
import { funnelGrowth, funnelPoint } from './tornado-track';

/** Výška trychtýře (m) – nahoře se rozevře do mraku. */
const FUNNEL_HEIGHT_M = 260;
/** Poloměr trychtýře nahoře podle šířky stopy (m) a meze. */
const FUNNEL_TOP = { perWidth: 1, min: 90, max: 260 } as const;
/** Poloměr trychtýře u země (m) – úzký provazec, u široké stopy (`fullWidthM`) o kus širší. */
const FUNNEL_BOTTOM = { min: 3, max: 5, fullWidthM: 350 } as const;
/** Ohyb osy: vrchol posunutý o tolik × poloměr nahoře (osa se ohýbá s výškou na druhou). */
const FUNNEL_BEND = 0.35;
/** Pomalé kývání osy: natočení ohybu a náklon (rad) a jejich rychlost (rad/s). */
const SWAY = { yaw: 0.45, yawSpeed: 0.23, tilt: 0.05, tiltSpeed: 0.41 } as const;
/** Tmavé jádro u osy – poloměr vůči trychtýři. */
const CORE_RADIUS = 0.45;
/** Prachová sukně u země: poloměr podle šířky stopy, výška (m) od úzké po širokou stopu. */
const DUST = { perWidth: 0.18, min: 12, max: 55, heightM: { min: 60, max: 80 } } as const;
/** Druhá vrstva prachu: nižší a širší oblak kolem paty (šířka, výška vůči první). */
const DUST_OUTER = { width: 1.3, height: 0.55 } as const;
/** Otáčky (rad/s): pruhy trychtýře, prach rychleji, druhá vrstva prachu pomaleji opačně. */
const SPIN = { funnel: 1.6, dust: 2.6, dustOuter: -1.1, debris: 1.9 } as const;
const FUNNEL_COLOR: Rgb = [0.34, 0.34, 0.36];
const CORE_COLOR: Rgb = [0.15, 0.15, 0.17];
const DUST_COLOR: Rgb = [0.55, 0.47, 0.38];
const DEBRIS_COLOR: Rgb = [0.14, 0.12, 0.1];
const CORE_ALPHA = 0.85;
const DUST_ALPHA = 0.45;
/** Úlomky (prkna, větve, drny) kroužící kolem prachové sukně. */
const DEBRIS_COUNT = 40;
/** Kroužky a úseky obrysu (lathe). */
const RINGS = 24;
const SEGMENTS = 32;
const TEXTURE_SIZE = 128;

/** Obrys trychtýře 0–1 (vůči poloměru nahoře): u země `bottom`, nahoru se rozevírá. */
function funnelRadius(v: number, bottom: number): number {
  return bottom + (1 - bottom) * v ** 1.6;
}

/** Obrys prachu (vůči poloměru prachu): sukně víru – široká u země, nahoru se zužuje. */
function dustRadius(v: number): number {
  return 0.25 + 1.6 * (1 - v) ** 2;
}

/** Posun osy trychtýře v ose x podle výšky `v` (vůči poloměru nahoře) – ohyb. */
function funnelBend(v: number): number {
  return FUNNEL_BEND * v * v;
}

/**
 * Rotační plocha výšky 1 s poloměrem `radius(v)` a osou posunutou o `bend(v)` v ose x – pozice,
 * normály a uv (3 vertex buffery). Volá se znovu, když se obrys změní (jiná šířka stopy).
 */
function shapeLathe(
  mesh: Mesh,
  radius: (v: number) => number,
  bend: (v: number) => number = () => 0,
): void {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const v = r / RINGS;
    const radiusV = radius(v);
    const cx = bend(v);
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      positions.push(cx + Math.cos(a) * radiusV, v, Math.sin(a) * radiusV);
      uvs.push(s / SEGMENTS, v);
    }
  }
  const row = SEGMENTS + 1;
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const i = r * row + s;
      indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh);
}

function lathe(name: string, scene: Scene, radius?: (v: number) => number): Mesh {
  const mesh = new Mesh(name, scene);
  if (radius) shapeLathe(mesh, radius);
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}

/** Celé číslo → 0–1 (hash bez stavu) – pruhy víru a úlomky. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Plynulý šum po obvodu (opakuje se po `period`). */
function bandNoise(u: number, period: number): number {
  const x = u * period;
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(((i % period) + period) % period);
  const b = hash01((((i + 1) % period) + period) % period);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Vzhled textury víru: slábnutí nahoře a dole, šikmost pruhů a jejich počet dole a nahoře. */
interface SwirlLook {
  fadeTop: number;
  fadeBottom: number;
  slant: number;
  bands: { bottom: number; top: number };
  /** Ostré pruhy s kontrastem 0,2–1 a tmavší dolní část (trychtýř), jinak měkké (prach). */
  sharp: boolean;
}

/**
 * Textura víru: šikmé pruhy (jas a průhlednost) – po obvodu se opakuje, nahoře a dole slábne
 * (trychtýř se ztrácí v mraku, prach řídne nahoru).
 */
function swirlTexture(scene: Scene, name: string, look: SwirlLook): RawTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    const v = y / (TEXTURE_SIZE - 1);
    const fade = Math.min(1, (1 - v) / look.fadeTop, v / look.fadeBottom + 0.15);
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x / TEXTURE_SIZE + v * look.slant;
      const low = 0.6 * bandNoise(u, look.bands.bottom) + 0.4 * bandNoise(u * 2, look.bands.bottom);
      const high = 0.6 * bandNoise(u, look.bands.top) + 0.4 * bandNoise(u * 2, look.bands.top);
      const noise = low + (high - low) * v;
      const streak = look.sharp ? 0.2 + 0.8 * smoothstep(0.32, 0.68, noise) : noise;
      let shade = look.sharp ? streak : 0.45 + 0.55 * streak;
      // dolní část trychtýře je tmavší (prach a úlomky v něm)
      if (look.sharp) shade *= 0.55 + 0.45 * Math.min(1, v / 0.4);
      const i = (y * TEXTURE_SIZE + x) * 4;
      const value = Math.round(255 * shade);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      // prach v chomáčích s mezerami – obrys sukně se trhá
      const density = look.sharp ? 0.15 + 0.85 * streak : streak * streak;
      data[i + 3] = Math.round(255 * Math.max(0, fade) * density);
    }
  }
  const texture = RawTexture.CreateRGBATexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = name;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.hasAlpha = true;
  return texture;
}

function swirlMaterial(scene: Scene, name: string, texture: RawTexture): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.specularColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.backFaceCulling = false;
  material.separateCullingPass = true;
  return material;
}

function setTinted(color: Color3, base: Rgb, tone: Rgb): void {
  color.set(base[0] * tone[0], base[1] * tone[1], base[2] * tone[2]);
}

/**
 * Trychtýř smrště: `set` – smršť vsi a střed vsi (cesta kolem něj), `animate` – poloha, velikost
 * a vír v okamžiku dne světa. Vrátí true, když je třeba překreslit.
 */
export class TornadoFunnel {
  private readonly funnel: Mesh;
  private readonly core: Mesh;
  private readonly dust: Mesh;
  private readonly dustOuter: Mesh;
  private readonly debris: Mesh;
  private readonly funnelTexture: RawTexture;
  private readonly funnelMaterial: StandardMaterial;
  private readonly coreMaterial: StandardMaterial;
  private readonly dustMaterial: StandardMaterial;
  private readonly debrisMaterial: StandardMaterial;
  private readonly debrisMatrices = new Float32Array(DEBRIS_COUNT * 16);
  /** Poloměr u země vůči poloměru nahoře, pro který je obrys trychtýře postavený. */
  private shapedBottom = -1;
  private tornado: SceneTornado | null = null;
  private home: { x: number; z: number } | null = null;
  private tone: Rgb = [1, 1, 1];
  private shown = false;

  constructor(
    scene: Scene,
    private readonly context: { groundHeight: (x: number, z: number) => number },
  ) {
    this.funnel = lathe('tornado-funnel', scene);
    this.core = lathe('tornado-core', scene);
    this.dust = lathe('tornado-dust', scene, dustRadius);
    this.dustOuter = lathe('tornado-dust-outer', scene, dustRadius);
    this.funnelTexture = swirlTexture(scene, 'tornado-funnel', {
      fadeTop: 0.35,
      fadeBottom: 0.04,
      slant: 2.5,
      bands: { bottom: 16, top: 7 },
      sharp: true,
    });
    this.funnelMaterial = swirlMaterial(scene, 'tornado-funnel', this.funnelTexture);
    // jádro sdílí texturu trychtýře – víří s ním
    this.coreMaterial = swirlMaterial(scene, 'tornado-core', this.funnelTexture);
    this.dustMaterial = swirlMaterial(
      scene,
      'tornado-dust',
      swirlTexture(scene, 'tornado-dust', {
        // řídne nahoru i k širokému okraji u země – hustý jen kolem paty trychtýře
        fadeTop: 0.55,
        fadeBottom: 0.35,
        slant: 0.7,
        bands: { bottom: 11, top: 7 },
        sharp: false,
      }),
    );
    this.funnel.material = this.funnelMaterial;
    this.core.material = this.coreMaterial;
    this.dust.material = this.dustMaterial;
    this.dustOuter.material = this.dustMaterial;
    this.shapeFunnel(FUNNEL_BOTTOM.min / FUNNEL_TOP.min);

    // úlomky: kvádry jako tenké instance, matice se počítají v animate()
    this.debris = CreateBox('tornado-debris', { size: 1 }, scene);
    this.debris.isPickable = false;
    // instance létají daleko od počátku meshe – obal z kvádru by je ořízl
    this.debris.alwaysSelectAsActiveMesh = true;
    this.debris.thinInstanceSetBuffer('matrix', this.debrisMatrices, 16, false);
    this.debrisMaterial = new StandardMaterial('tornado-debris', scene);
    this.debrisMaterial.disableLighting = true;
    this.debrisMaterial.diffuseColor = Color3.Black();
    this.debrisMaterial.specularColor = Color3.Black();
    this.debris.material = this.debrisMaterial;
    this.debris.setEnabled(false);
    this.applyTone();
  }

  /** Je trychtýř právě vidět (e2e, náhled)? */
  get visible(): boolean {
    return this.shown;
  }

  private get meshes(): Mesh[] {
    return [this.funnel, this.core, this.dust, this.dustOuter, this.debris];
  }

  /** Smršť vsi (`SceneVillage.tornado`) a střed vsi; bez smrště se trychtýř skryje. */
  set(tornado: SceneTornado | null, home: { x: number; z: number } | null): void {
    this.tornado = tornado;
    this.home = home;
    if (!tornado) this.hide();
  }

  /** Tón materiálů bez světla (`DayLight.tone` – za bouřky a v noci tmavší). */
  setTone(tone: Rgb): void {
    this.tone = tone;
    this.applyTone();
  }

  private applyTone(): void {
    // za bouřky je tón tmavý – trychtýř jen poloviční mírou, ať jsou vidět pruhy víru
    const tone: Rgb = [Math.sqrt(this.tone[0]), Math.sqrt(this.tone[1]), Math.sqrt(this.tone[2])];
    // bez světla: barva = emisní × textura (jako kapky deště)
    setTinted(this.funnelMaterial.emissiveColor, FUNNEL_COLOR, tone);
    setTinted(this.coreMaterial.emissiveColor, CORE_COLOR, tone);
    setTinted(this.dustMaterial.emissiveColor, DUST_COLOR, tone);
    setTinted(this.debrisMaterial.emissiveColor, DEBRIS_COLOR, tone);
  }

  /** Obrys trychtýře a jádra pro poloměr u země `bottom` (vůči poloměru nahoře). */
  private shapeFunnel(bottom: number): void {
    if (bottom === this.shapedBottom) return;
    this.shapedBottom = bottom;
    shapeLathe(this.funnel, (v) => funnelRadius(v, bottom), funnelBend);
    shapeLathe(this.core, (v) => CORE_RADIUS * funnelRadius(v, bottom), funnelBend);
  }

  /** Skryje trychtýř (mimo průchod, při omezeném pohybu); true, když byl vidět. */
  hide(): boolean {
    if (!this.shown) return false;
    this.shown = false;
    for (const mesh of this.meshes) mesh.setEnabled(false);
    return true;
  }

  /**
   * Trychtýř v okamžiku `gameDay` (desetinný den světa) a `seconds` (vír): v průchodu po stopě
   * roste ze země, víří a na konci se rozplyne. Vrátí true, když je třeba překreslit.
   */
  animate(gameDay: number, seconds: number): boolean {
    const tornado = this.tornado;
    const progress = tornado ? funnelProgress(gameDay - tornado.day) : null;
    if (!tornado || progress === null) return this.hide();
    const growth = funnelGrowth(progress);
    const at = funnelPoint(tornado.track, this.home, progress);
    const y = this.context.groundHeight(at.x, at.z) - 1;
    const width = tornado.track.widthM;
    const wide = Math.min(1, width / FUNNEL_BOTTOM.fullWidthM);
    const top = Math.min(FUNNEL_TOP.max, Math.max(FUNNEL_TOP.min, width * FUNNEL_TOP.perWidth));
    const bottomM = FUNNEL_BOTTOM.min + (FUNNEL_BOTTOM.max - FUNNEL_BOTTOM.min) * wide;
    this.shapeFunnel(bottomM / top);
    const dust = Math.min(DUST.max, Math.max(DUST.min, width * DUST.perWidth));
    const dustHeight = DUST.heightM.min + (DUST.heightM.max - DUST.heightM.min) * wide;
    const spread = 0.3 + 0.7 * growth;

    // osa se ohýbá proti směru postupu a pomalu se kývá; pruhy víří posunem textury
    const lean = -(tornado.track.angle + Math.PI) + SWAY.yaw * Math.sin(seconds * SWAY.yawSpeed);
    const tilt = SWAY.tilt * Math.sin(seconds * SWAY.tiltSpeed + 1.3);
    for (const mesh of [this.funnel, this.core]) {
      mesh.position.set(at.x, y, at.z);
      mesh.scaling.set(top * spread, FUNNEL_HEIGHT_M * growth, top * spread);
      mesh.rotation.set(0, lean, tilt);
    }
    this.funnelTexture.uOffset = -((seconds * SPIN.funnel) / (Math.PI * 2)) % 1;
    this.funnelMaterial.alpha = growth;
    this.coreMaterial.alpha = CORE_ALPHA * growth;

    this.dust.position.set(at.x, y, at.z);
    this.dust.scaling.set(dust * spread, dustHeight * growth, dust * spread);
    this.dust.rotation.y = -seconds * SPIN.dust;
    this.dustOuter.position.set(at.x, y, at.z);
    this.dustOuter.scaling.set(
      dust * spread * DUST_OUTER.width,
      dustHeight * growth * DUST_OUTER.height,
      dust * spread * DUST_OUTER.width,
    );
    this.dustOuter.rotation.y = -seconds * SPIN.dustOuter;
    this.dustMaterial.alpha = DUST_ALPHA * growth;

    this.placeDebris(at.x, y, at.z, dust * spread, dustHeight * growth, seconds, growth);
    if (!this.shown) {
      this.shown = true;
      for (const mesh of this.meshes) mesh.setEnabled(true);
    }
    return true;
  }

  /** Úlomky krouží kolem sukně v různé výšce a vzdálenosti a převalují se. */
  private placeDebris(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    seconds: number,
    growth: number,
  ): void {
    const matrix = new Matrix();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const position = new Vector3();
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const h1 = hash01(i * 4 + 101);
      const h2 = hash01(i * 4 + 102);
      const h3 = hash01(i * 4 + 103);
      const h4 = hash01(i * 4 + 104);
      // blíž k ose rychleji, výš řidčeji
      const r = radius * (0.3 + 1.1 * h1);
      const angle = h3 * Math.PI * 2 - seconds * SPIN.debris * (0.7 + 0.6 * h4) * (1.4 - 0.6 * h1);
      const lift = (2 + h2 ** 1.5 * height * 1.1 + 4 * Math.sin(seconds * 0.9 + h1 * 6)) * growth;
      position.set(x + Math.cos(angle) * r, y + Math.max(0.5, lift), z + Math.sin(angle) * r);
      // prkna a větve – podlouhlé, tenké
      const size = (0.5 + 2 * h4 * h4) * growth;
      scale.set(size * 2.5, size * 0.25, size * 0.7);
      Quaternion.RotationYawPitchRollToRef(
        seconds * (1 + 2 * h2) + h1 * 6,
        seconds * (0.7 + h3) + h2 * 6,
        seconds * (0.5 + h1) + h3 * 6,
        rotation,
      );
      Matrix.ComposeToRef(scale, rotation, position, matrix);
      matrix.copyToArray(this.debrisMatrices, i * 16);
    }
    this.debris.thinInstanceBufferUpdated('matrix');
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.funnelMaterial.dispose(false, true);
    // textura trychtýře je sdílená – uvolní ji materiál trychtýře
    this.coreMaterial.dispose(false, false);
    this.dustMaterial.dispose(false, true);
    this.debrisMaterial.dispose();
  }
}
