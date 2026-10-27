// Trychtýř smrště (disasters.md – Smršť, Ve scéně): tmavý vířící trychtýř s prachem u země přejde
// v den smrště stopou kolem vsi za ≈ 10 s (`FUNNEL_PASS` ve storm.ts, cesta `funnelPoint`).
// Kreslí se jen v průchodu a jen s animacemi – při omezeném pohybu zůstane jen ztmavení scény
// a stopa (vývraty, polehlá pole, rozmetané stohy). Stín nevrhá (stínová mapa je statická).
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneTornado } from '../village-view';
import type { Rgb } from './season-look';
import { funnelProgress } from './storm';
import { funnelGrowth, funnelPoint } from './tornado-track';

/** Výška trychtýře (m) – nahoře se rozšíří do mraku. */
const FUNNEL_HEIGHT_M = 260;
/** Poloměr trychtýře nahoře podle šířky stopy (m) a meze. */
const FUNNEL_TOP = { perWidth: 0.8, min: 70, max: 260 } as const;
/** Prach u země: poloměr podle šířky stopy, výška (m). */
const DUST = { perWidth: 0.3, min: 18, max: 110, heightM: 34 } as const;
/** Otáčky (rad/s) – prach víří rychleji než trychtýř. */
const SPIN = { funnel: 1.6, dust: 2.6 } as const;
const FUNNEL_COLOR: Rgb = [0.3, 0.3, 0.33];
const DUST_COLOR: Rgb = [0.5, 0.43, 0.35];
const DUST_ALPHA = 0.5;
/** Kroužky a úseky obrysu (lathe). */
const RINGS = 18;
const SEGMENTS = 28;
const TEXTURE_SIZE = 64;

/** Obrys trychtýře 0–1: úzký u země, nahoře se rozevře (poloměr podle výšky `v`). */
function funnelRadius(v: number): number {
  return 0.12 + 0.88 * v ** 2.4;
}

/** Obrys prachu 0–1: sukně víru – u země užší, nahoru se rozšiřuje a řídne. */
function dustRadius(v: number): number {
  return 0.6 + 0.4 * v;
}

/** Rotační plocha výšky 1 s poloměrem `radius(v)` – pozice, normály a uv (3 vertex buffery). */
function lathe(name: string, scene: Scene, radius: (v: number) => number): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const v = r / RINGS;
    const radiusV = radius(v);
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(a) * radiusV, v, Math.sin(a) * radiusV);
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
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}

/** Celé číslo → 0–1 (hash bez stavu) – pruhy víru. */
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

/**
 * Textura víru: šikmé pruhy (jas a průhlednost) – po obvodu se opakuje, nahoře a dole slábne
 * (trychtýř se ztrácí v mraku, prach řídne nahoru).
 */
function swirlTexture(scene: Scene, name: string, top: number, bottom: number): RawTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    const v = y / (TEXTURE_SIZE - 1);
    const fade = Math.min(1, (1 - v) / top, v / bottom + 0.15);
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x / TEXTURE_SIZE + v * 0.7;
      const streak = 0.6 * bandNoise(u, 9) + 0.4 * bandNoise(u * 2, 9);
      const i = (y * TEXTURE_SIZE + x) * 4;
      const shade = Math.round(255 * (0.45 + 0.55 * streak));
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = Math.round(255 * Math.max(0, fade) * (0.15 + 0.85 * streak));
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

/**
 * Trychtýř smrště: `set` – smršť vsi a střed vsi (cesta kolem něj), `animate` – poloha, velikost
 * a vír v okamžiku dne světa. Vrátí true, když je třeba překreslit.
 */
export class TornadoFunnel {
  private readonly funnel: Mesh;
  private readonly dust: Mesh;
  private readonly funnelMaterial: StandardMaterial;
  private readonly dustMaterial: StandardMaterial;
  private tornado: SceneTornado | null = null;
  private home: { x: number; z: number } | null = null;
  private tone: Rgb = [1, 1, 1];
  private shown = false;

  constructor(
    scene: Scene,
    private readonly context: { groundHeight: (x: number, z: number) => number },
  ) {
    this.funnel = lathe('tornado-funnel', scene, funnelRadius);
    this.dust = lathe('tornado-dust', scene, dustRadius);
    this.funnelMaterial = swirlMaterial(
      scene,
      'tornado-funnel',
      swirlTexture(scene, 'tornado-funnel', 0.35, 0.05),
    );
    this.dustMaterial = swirlMaterial(
      scene,
      'tornado-dust',
      swirlTexture(scene, 'tornado-dust', 0.7, 0.05),
    );
    this.funnel.material = this.funnelMaterial;
    this.dust.material = this.dustMaterial;
    this.applyTone();
  }

  /** Je trychtýř právě vidět (e2e, náhled)? */
  get visible(): boolean {
    return this.shown;
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
    const [r, g, b] = this.tone.map(Math.sqrt) as unknown as Rgb;
    // bez světla: barva = emisní × textura (jako kapky deště)
    this.funnelMaterial.emissiveColor.set(
      FUNNEL_COLOR[0] * r,
      FUNNEL_COLOR[1] * g,
      FUNNEL_COLOR[2] * b,
    );
    this.dustMaterial.emissiveColor.set(DUST_COLOR[0] * r, DUST_COLOR[1] * g, DUST_COLOR[2] * b);
  }

  /** Skryje trychtýř (mimo průchod, při omezeném pohybu); true, když byl vidět. */
  hide(): boolean {
    if (!this.shown) return false;
    this.shown = false;
    this.funnel.setEnabled(false);
    this.dust.setEnabled(false);
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
    const top = Math.min(FUNNEL_TOP.max, Math.max(FUNNEL_TOP.min, width * FUNNEL_TOP.perWidth));
    const dust = Math.min(DUST.max, Math.max(DUST.min, width * DUST.perWidth));
    const spread = 0.3 + 0.7 * growth;
    this.funnel.position.set(at.x, y, at.z);
    this.funnel.scaling.set(top * spread, FUNNEL_HEIGHT_M * growth, top * spread);
    this.funnel.rotation.y = -seconds * SPIN.funnel;
    this.funnelMaterial.alpha = growth;
    this.dust.position.set(at.x, y, at.z);
    this.dust.scaling.set(dust * spread, DUST.heightM * growth, dust * spread);
    this.dust.rotation.y = -seconds * SPIN.dust;
    this.dustMaterial.alpha = DUST_ALPHA * growth;
    if (!this.shown) {
      this.shown = true;
      this.funnel.setEnabled(true);
      this.dust.setEnabled(true);
    }
    return true;
  }

  dispose(): void {
    this.funnel.dispose();
    this.dust.dispose();
    this.funnelMaterial.dispose(false, true);
    this.dustMaterial.dispose(false, true);
  }
}
