import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import {
  HAIL,
  hailZone,
  streamHeights,
  tileIndex,
  type HailStrip,
  type Landscape,
} from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { SceneFlood, SceneHail } from '../village-view-scene-types';
import { HEIGHT_SCALE } from './constants';
import {
  floodBox,
  floodDepthAt,
  floodLevel,
  floodMud,
  floodSurface,
  mudWeight,
  overlayGrid,
  type Box,
  type OverlayGrid,
} from './flood-water';
import { RainRenderer, type DropKind } from './rain-renderer';
import { hailCover, hailFall, hailWeight, stormAmount } from './storm';
import { createRippleNormalMap } from './water';

/** Kroupy: bílé kuličky, padají rychleji a skoro svisle; víc vidět než kapky deště. */
const HAIL_KIND: DropKind = {
  name: 'hail',
  color: new Color3(0.9, 0.92, 0.95),
  alpha: 0.9,
  count: 1600,
  look: { fallMps: 16, wind: [0.06, 0.03], streak: 0.006, width: 0.0035 },
};

/** Bílý pás krup na zemi: délka pruhu na obě strany od středu vsi (m) a prolnutí konců. */
const HAIL_BAND_HALF_M = 800;
const HAIL_BAND_FADE_M = 150;
/** Mřížka obtisků na terénu (m) a výška nad ním (m). */
const OVERLAY_STEP_M = 7.5;
const OVERLAY_LIFT_M = 0.12;
const HAIL_COLOR = new Color3(0.93, 0.94, 0.96);
/** Kroupy na zemi svítí i v bouřkové tmě (bílá proti tmavé trávě). */
const HAIL_GLOW = new Color3(0.5, 0.51, 0.53);
const HAIL_ALPHA = 0.9;
/** Skvrny krup ≈ 35 m – místy souvislá bílá, místy jen poprašek. */
const HAIL_PATCH_M = 35;
const MUD_COLOR = new Color3(0.33, 0.26, 0.18);
const MUD_ALPHA = 0.85;
/** Kalná voda povodně – v létě hnědší (bouřky), na jaře šedší (tání). */
const FLOOD_COLOR = { summer: new Color3(0.4, 0.33, 0.23), spring: new Color3(0.42, 0.39, 0.32) };
/** Vlnky na hladině povodně – normálová mapa potoka (water.ts), dlaždice po tolika metrech. */
const FLOOD_RIPPLE_M = 24;

/** Obtisk na zemi (bílý pás krup, bahno povodně): jeden mesh, krytí = váha vrcholu × síla. */
class GroundOverlay {
  private mesh: Mesh | null = null;
  private readonly material: StandardMaterial;
  private amount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly name: string,
    color: Color3,
    private readonly maxAlpha: number,
    glow?: Color3,
  ) {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    if (glow) material.emissiveColor = glow;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    // nad obtisky polí a cest (field-painting.ts −5)
    material.zOffset = -6;
    this.material = material;
  }

  build(grid: OverlayGrid | null): void {
    this.mesh?.dispose();
    this.mesh = null;
    if (!grid) return;
    const mesh = new Mesh(this.name, this.scene);
    const data = new VertexData();
    data.positions = grid.positions;
    data.indices = grid.indices;
    data.colors = grid.colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(grid.positions, grid.indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.hasVertexAlpha = true;
    mesh.material = this.material;
    mesh.isPickable = false;
    // před ostatní průhlednou vodou – potok a povodeň se kreslí přes obtisk
    mesh.alphaIndex = 0;
    mesh.setEnabled(this.amount > 0);
    this.mesh = mesh;
  }

  /** Síla 0–1 (krytí); 0 mesh vypne. Vrátí true, když se něco změnilo. */
  setAmount(amount: number): boolean {
    if (amount === this.amount) return false;
    this.amount = amount;
    this.material.alpha = this.maxAlpha * amount;
    this.mesh?.setEnabled(amount > 0);
    return this.mesh !== null;
  }

  dispose(): void {
    this.mesh?.dispose();
    this.material.dispose();
  }
}

/** Obal pruhu krup kolem středu vsi (m), oříznutý mapou. */
function hailBox(strip: HailStrip, mapHalf: number): Box {
  const ax = Math.cos(strip.angle);
  const az = Math.sin(strip.angle);
  // kolmice ke směru (cos, sin) je (−sin, cos) – jako `hailZone`
  const cx = strip.x - az * strip.offsetM;
  const cz = strip.z + ax * strip.offsetM;
  const ex = Math.abs(ax) * HAIL_BAND_HALF_M + (Math.abs(az) * HAIL.widthM) / 2;
  const ez = Math.abs(az) * HAIL_BAND_HALF_M + (Math.abs(ax) * HAIL.widthM) / 2;
  return {
    minX: Math.max(-mapHalf, cx - ex),
    minZ: Math.max(-mapHalf, cz - ez),
    maxX: Math.min(mapHalf, cx + ex),
    maxZ: Math.min(mapHalf, cz + ez),
  };
}

/** Šum skvrn krup (deterministicky – stejný pás u všech hráčů). */
const hailNoise = createNoise2D(
  (() => {
    let state = 0x4a11;
    return (): number => {
      state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return state / 4294967296;
    };
  })(),
);

/**
 * Váha bílého pásu: pruh jako jádro (`hailZone`), ve skvrnách, konce daleko od vsi se prolnou
 * do ztracena; na vodě kroupy hned roztají.
 */
function hailBandWeight(strip: HailStrip, x: number, z: number, onWater: boolean): number {
  const w = onWater ? 0 : hailWeight(strip, x, z);
  if (w === 0) return 0;
  const along = Math.abs(
    (x - strip.x) * Math.cos(strip.angle) + (z - strip.z) * Math.sin(strip.angle),
  );
  const patch =
    0.5 + 0.5 * Math.min(1, Math.max(0, 0.8 * hailNoise(x / HAIL_PATCH_M, z / HAIL_PATCH_M) + 0.5));
  return w * patch * Math.min(1, Math.max(0, (HAIL_BAND_HALF_M - along) / HAIL_BAND_FADE_M));
}

/**
 * Bouřka s kroupami a povodeň ve scéně (disasters.md – Kroupy, Povodeň potoka – Ve scéně):
 * kroupy jako částice v pruhu (rain-renderer.ts – jeden draw call), bílý pás krup na zemi,
 * plocha vody nad zatopenými políčky a hnědé bahno s naplaveninou. Mimo den pohromy a její
 * dozvuk je vše vypnuté (žádný draw call navíc). Ztmavení a záblesky – storm.ts, scéna.
 */
export class StormRenderer {
  private readonly particles: RainRenderer;
  private readonly cover: GroundOverlay;
  private readonly mud: GroundOverlay;
  private readonly waterMaterial: StandardMaterial;
  private water: Mesh | null = null;
  private hail: SceneHail | null = null;
  private flood: SceneFlood | null = null;
  private stormNow = 0;
  private level = 0;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      landscape: Landscape;
      groundHeight: (x: number, z: number) => number;
    },
  ) {
    this.particles = new RainRenderer(scene, HAIL_KIND);
    this.cover = new GroundOverlay(scene, 'hail-cover', HAIL_COLOR, HAIL_ALPHA, HAIL_GLOW);
    this.mud = new GroundOverlay(scene, 'flood-mud', MUD_COLOR, MUD_ALPHA);
    const material = new StandardMaterial('flood-water', scene);
    material.diffuseColor = FLOOD_COLOR.summer;
    material.specularColor = new Color3(0.55, 0.55, 0.5);
    material.specularPower = 90;
    material.backFaceCulling = false;
    const ripples = createRippleNormalMap(scene);
    ripples.level = 0.35;
    material.bumpTexture = ripples;
    this.waterMaterial = material;
  }

  /** Síla bouřky 0–1 (po desetinách) – ztmavení scény a déšť. */
  get storm(): number {
    return this.stormNow;
  }

  /** Krupobití vsi (`SceneVillage.hail`): pruh pro kroupy a bílý pás; null – bez krup. */
  setHail(hail: SceneHail | null): void {
    this.hail = hail;
    if (!hail) {
      this.particles.setArea(null);
      this.cover.build(null);
      return;
    }
    const { strip } = hail;
    this.particles.setArea((x, z) => hailZone(strip, x, z) !== null);
    const { landscape, groundHeight } = this.context;
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const above = streamHeights(landscape);
    this.cover.build(
      overlayGrid(
        hailBox(strip, half),
        OVERLAY_STEP_M,
        (x, z) => hailBandWeight(strip, x, z, above[tileIndex(landscape, x, z)] === 0),
        groundHeight,
        OVERLAY_LIFT_M,
      ),
    );
  }

  /** Povodeň (`SceneVillage.flood`): plocha vody a bahno; null – bez povodně. */
  setFlood(flood: SceneFlood | null): void {
    this.flood = flood;
    this.water?.dispose();
    this.water = null;
    this.level = 0;
    if (!flood) {
      this.mud.build(null);
      return;
    }
    const { landscape, groundHeight } = this.context;
    // výška políček nad potokem – stejná funkce jako jádro (flood.ts), ať voda sedí se škodami
    const above = streamHeights(landscape);
    const surface = floodSurface(landscape, above, flood.heightM);
    if (surface) {
      const mesh = new Mesh('flood-water', this.scene);
      const data = new VertexData();
      data.positions = surface.positions;
      data.indices = surface.indices;
      const normals: number[] = [];
      VertexData.ComputeNormals(surface.positions, surface.indices, normals);
      data.normals = normals;
      // vlnky po dlaždicích ve světě, krytí podle hloubky (u břehu průzračnější)
      const uvs = new Float32Array((surface.positions.length / 3) * 2);
      const colors = new Float32Array((surface.positions.length / 3) * 4);
      for (let v = 0; v < surface.alphas.length; v++) {
        uvs[v * 2] = surface.positions[v * 3]! / FLOOD_RIPPLE_M;
        uvs[v * 2 + 1] = surface.positions[v * 3 + 2]! / FLOOD_RIPPLE_M;
        colors.set([1, 1, 1, surface.alphas[v]!], v * 4);
      }
      data.uvs = uvs;
      data.colors = colors;
      data.applyToMesh(mesh);
      mesh.hasVertexAlpha = true;
      this.waterMaterial.diffuseColor = FLOOD_COLOR[flood.season];
      mesh.material = this.waterMaterial;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.water = mesh;
    }
    const box = floodBox(landscape, above, flood.heightM);
    this.mud.build(
      box &&
        overlayGrid(
          box,
          OVERLAY_STEP_M,
          (x, z) => mudWeight(floodDepthAt(landscape, above, flood.heightM, x, z)),
          groundHeight,
          OVERLAY_LIFT_M,
        ),
    );
  }

  /**
   * Stav pohrom v okamžiku `gameDay` (desetinný den světa): síla bouřky, kroupy, bílý pás, výška
   * vody a bahno – vše po desetinách. Vrátí true, když se něco změnilo (překreslit).
   */
  update(gameDay: number): boolean {
    let changed = false;
    const t = this.hail ? gameDay - this.hail.day : Number.NaN;
    const storm = stormAmount(t);
    if (storm !== this.stormNow) {
      this.stormNow = storm;
      changed = true;
    }
    if (this.particles.setAmount(hailFall(t))) changed = true;
    if (this.cover.setAmount(hailCover(t))) changed = true;
    const f = this.flood ? gameDay - this.flood.day : Number.NaN;
    const level = this.water && this.flood ? floodLevel(f) : 0;
    if (level !== this.level && this.water && this.flood) {
      this.level = level;
      // voda ustupuje celá naráz – plocha klesá a terén ji postupně zakryje
      this.water.position.y = -(1 - level) * this.flood.heightM * HEIGHT_SCALE;
      this.water.setEnabled(level > 0);
      changed = true;
    }
    if (this.mud.setAmount(floodMud(f))) changed = true;
    return changed;
  }

  /** Kroupy padají kolem cíle kamery (jen když padají) – true, když je třeba překreslit. */
  animate(seconds: number, target: Vector3, eye: Vector3, radius: number): boolean {
    return this.particles.animate(seconds, target, eye, radius);
  }

  dispose(): void {
    this.particles.dispose();
    this.cover.dispose();
    this.mud.dispose();
    this.water?.dispose();
    this.waterMaterial.dispose(false, true);
  }
}
