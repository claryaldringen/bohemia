import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ObstacleLayer } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage } from '../village-view';
import {
  clearingHeaps,
  clearingHeapsKey,
  squareObstacles,
  type ClearingHeap,
  type ClearingHeapKind,
} from './clearing-slash-layout';
import { applyGammaFog } from './gamma-fog';
import { applySeasonSnow } from './season-materials';
import type { Point } from './village-layout';

/** Hromada větví (sítě v metrech při velikosti 1): poloosy kupy napříč a výška. */
const HEAP_A = 1.5;
const HEAP_B = 0.95;
const HEAP_H = 0.55;
/** Klacků na hromadě a na ohořelém zbytku. */
const HEAP_STICKS = 28;
const CHAR_STICKS = 7;
/** Úseků kupy po obvodu a od paty k vrcholu. */
const SEGMENTS = 12;
const RINGS = 4;
/**
 * Barvy (gama): suché jehličí a listí v kupě, kůra větví, ohořelé dřevo a popel. Popel je tmavý
 * (šedá k okraji jen o málo světlejší) – světlý okraj působil pod ohněm jako talíř.
 */
const LITTER = [0.42, 0.33, 0.2] as const;
const LITTER_OLIVE = [0.36, 0.35, 0.21] as const;
const BARK = [0.38, 0.3, 0.22] as const;
const BARK_LIGHT = [0.55, 0.47, 0.36] as const;
const CHARCOAL = [0.07, 0.06, 0.055] as const;
const ASH_DARK = [0.16, 0.15, 0.14] as const;
const ASH = [0.24, 0.23, 0.215] as const;
const ASH_LIGHT = [0.33, 0.32, 0.3] as const;
/** Placka popela vůči půdorysu kupy (HEAP_A × HEAP_B) – menší než kupa, ať pod ohněm nevyčnívá. */
const ASH_SPREAD = 0.75;

type Rgb = readonly [number, number, number];

/**
 * Hromady větví na pasece a ohořelé zbytky na spálenině (forest.md – Klučení lesa pro pole –
 * postup): dvě vlastní sítě (kupa klestí s klacky, popel s ohořelými pahýly) jako thin instances
 * – jen pozice, normála, barva a matice instance (7 vertex bufferů, WebGPU ≤ 8). Místa počítá
 * clearing-slash-layout.ts; přestaví se jen při změně klíče dílů a fází.
 */
export class ClearingSlash {
  private readonly meshes = new Map<ClearingHeapKind, Mesh>();
  private readonly avoid = new Map<string, Point[]>();
  private key = '';

  constructor(
    private readonly scene: Scene,
    private readonly options: {
      layer: ObstacleLayer;
      groundHeight: (worldX: number, worldZ: number) => number;
      addShadowCaster: (mesh: Mesh) => void;
    },
  ) {}

  /** Hromady podle vsi; vrátí true, když se kreslení změnilo. */
  update(village: Pick<SceneVillage, 'fields' | 'dwellings'>): boolean {
    const key = clearingHeapsKey(village);
    if (key === this.key) return false;
    this.key = key;
    const heaps = key ? clearingHeaps(village, (part) => this.avoidOf(part)) : [];
    const slash = this.apply(
      'slash',
      heaps.filter((h) => h.kind === 'slash'),
    );
    const char = this.apply(
      'char',
      heaps.filter((h) => h.kind === 'char'),
    );
    return slash || char;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
  }

  /**
   * Překážky čtverce (pařezy, stromy, kameny) z vrstvy – stálé, proto v mezipaměti. Podle nich
   * leží hromady (slashHeapSites) – ohně pálení (clearing-fire.ts) je hledají stejně.
   */
  obstaclesOf(part: SceneFieldPart): Point[] {
    return this.avoidOf(part);
  }

  private avoidOf(part: SceneFieldPart): Point[] {
    const key = `${part.cell.x},${part.cell.y},${part.x},${part.z},${part.rotation ?? 0}`;
    let points = this.avoid.get(key);
    if (!points) {
      points = squareObstacles(this.options.layer, part);
      this.avoid.set(key, points);
    }
    return points;
  }

  private apply(kind: ClearingHeapKind, heaps: readonly ClearingHeap[]): boolean {
    if (heaps.length === 0) {
      const mesh = this.meshes.get(kind);
      if (!mesh?.isEnabled()) return false;
      mesh.setEnabled(false);
      return true;
    }
    const mesh = this.ensureMesh(kind);
    const matrices = new Float32Array(heaps.length * 16);
    const matrix = new Matrix();
    heaps.forEach((heap, i) => {
      // pata kupy: nejnižší místo pod ní – na svahu nevisí ve vzduchu
      const reach = HEAP_A * heap.scale * 0.8;
      const ground = Math.min(
        ...[
          [0, 0],
          [reach, 0],
          [-reach, 0],
          [0, reach],
          [0, -reach],
        ].map(([dx, dz]) => this.options.groundHeight(heap.x + dx!, heap.z + dz!)),
      );
      Matrix.ComposeToRef(
        new Vector3(heap.scale, heap.scale, heap.scale),
        Quaternion.RotationAxis(Vector3.Up(), heap.yaw),
        new Vector3(heap.x, ground - (kind === 'slash' ? 0.05 : 0.01), heap.z),
        matrix,
      );
      matrix.copyToArray(matrices, i * 16);
    });
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.setEnabled(true);
    return true;
  }

  private ensureMesh(kind: ClearingHeapKind): Mesh {
    const existing = this.meshes.get(kind);
    if (existing) return existing;
    const name = `clearing-${kind}`;
    const mesh = new Mesh(name, this.scene);
    (kind === 'slash' ? slashHeapVertexData() : charRemnantVertexData()).applyToMesh(mesh);
    // PBR jako modely vsi: opar podle gama (applyGammaFog) a v zimě sníh na horních plochách
    const material = new PBRMaterial(name, this.scene);
    material.albedoColor = Color3.White();
    material.metallic = 0;
    material.roughness = 1;
    material.ambientColor = new Color3(0.38, 0.38, 0.36);
    applyGammaFog(material);
    applySeasonSnow(material);
    // klacky jsou tenké hranoly bez čel – vidět musí být z obou stran
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    // ohořelý zbytek je placka popela – stín nevrhá
    if (kind === 'slash') this.options.addShadowCaster(mesh);
    this.meshes.set(kind, mesh);
    return mesh;
  }
}

/** Hash → [0, 1) pro tvar kupy a klacků (jen vzhled). */
function noise(i: number, k: number): number {
  const h = Math.sin(i * 127.1 + k * 311.7 + 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Sběr vrcholů sítě – barvy v gama, PBR počítá lineárně. */
class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  push(p: readonly number[], n: readonly number[], c: Rgb): number {
    const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    this.positions.push(p[0]!, p[1]!, p[2]!);
    this.normals.push(n[0]! / length, n[1]! / length, n[2]! / length);
    this.colors.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1);
    return this.positions.length / 3 - 1;
  }

  /**
   * Klacek – čtyřboký hranol od `from` k `to`, u konce tenčí (bez čel, jen plášť).
   */
  stick(from: readonly number[], to: readonly number[], radius: number, color: Rgb): void {
    const d = [to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!];
    const length = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    const dir = d.map((v) => v / length);
    // kolmice k ose klacku (vodorovná) a druhá kolmice
    let u = [-dir[2]!, 0, dir[0]!];
    const ul = Math.hypot(u[0]!, u[2]!);
    u = ul > 1e-4 ? u.map((v) => v / ul) : [1, 0, 0];
    const w = [
      dir[1]! * u[2]! - dir[2]! * u[1]!,
      dir[2]! * u[0]! - dir[0]! * u[2]!,
      dir[0]! * u[1]! - dir[1]! * u[0]!,
    ];
    const rings: number[][] = [];
    for (const [end, r] of [
      [from, radius],
      [to, radius * 0.5],
    ] as const) {
      const ring: number[] = [];
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const n = [0, 1, 2].map((j) => u[j]! * Math.cos(a) + w[j]! * Math.sin(a));
        ring.push(
          this.push(
            [0, 1, 2].map((j) => end[j]! + n[j]! * r),
            n,
            color,
          ),
        );
      }
      rings.push(ring);
    }
    const [a, b] = rings as [number[], number[]];
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      this.indices.push(a[k]!, b[k]!, a[k1]!, a[k1]!, b[k]!, b[k1]!);
    }
  }

  build(): VertexData {
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.colors = this.colors;
    data.indices = this.indices;
    return data;
  }
}

function mix(a: Rgb, b: Rgb, t: number, shade = 1): Rgb {
  return [0, 1, 2].map((j) => (a[j]! + (b[j]! - a[j]!) * t) * shade) as unknown as Rgb;
}

/**
 * Hromada větví při velikosti 1 (≈ 3 × 1,9 m, výška ≈ 0,8 m): nízká kupa suchého klestí
 * (jehličí a listí) a na ní klacky větví podél delší osy kupy, různě nakloněné a dlouhé.
 */
export function slashHeapVertexData(): VertexData {
  const b = new MeshBuilder();
  // kupa – zploštělý polokulovitý vrchlík s nerovným obrysem
  const ring = (j: number, i: number): number => {
    const phi = (j / RINGS) * (Math.PI / 2);
    const a = (2 * Math.PI * i) / SEGMENTS;
    const wobble = 1 + 0.14 * (noise(i % SEGMENTS, j) - 0.5) * 2;
    const r = Math.cos(phi) * wobble;
    const x = HEAP_A * r * Math.cos(a);
    const z = HEAP_B * r * Math.sin(a);
    const y = HEAP_H * Math.sin(phi) * (0.9 + 0.2 * noise(i % SEGMENTS, j + 7));
    const color = mix(LITTER, LITTER_OLIVE, noise(i % SEGMENTS, j + 13), 0.8 + 0.3 * phi);
    return b.push([x, y, z], [x / HEAP_A ** 2, y / HEAP_H ** 2, z / HEAP_B ** 2], color);
  };
  const grid: number[][] = [];
  for (let j = 0; j < RINGS; j++) {
    const row: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) row.push(ring(j, i));
    grid.push(row);
  }
  const top = b.push([0, HEAP_H, 0], [0, 1, 0], mix(LITTER, LITTER_OLIVE, 0.5, 1.2));
  for (let j = 0; j < RINGS - 1; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const p = grid[j]!;
      const q = grid[j + 1]!;
      b.indices.push(p[i]!, q[i]!, p[i + 1]!, p[i + 1]!, q[i]!, q[i + 1]!);
    }
  }
  const last = grid[RINGS - 1]!;
  for (let i = 0; i < SEGMENTS; i++) b.indices.push(last[i]!, top, last[i + 1]!);
  // klacky na povrchu kupy, většinou podél delší osy
  for (let s = 0; s < HEAP_STICKS; s++) {
    const a = 2 * Math.PI * noise(s, 1);
    const rho = 0.15 + 0.8 * noise(s, 2);
    const cx = HEAP_A * rho * Math.cos(a);
    const cz = HEAP_B * rho * Math.sin(a);
    const cy = HEAP_H * Math.sqrt(Math.max(0, 1 - rho * rho)) * 0.95 + 0.04;
    const yaw = (noise(s, 3) - 0.5) * 1.3 + (noise(s, 9) < 0.2 ? Math.PI / 2 : 0);
    const slope = (noise(s, 4) - 0.5) * 0.5;
    const length = 1.1 + 1.7 * noise(s, 5);
    const dir = [Math.cos(yaw), slope, Math.sin(yaw)];
    const half = length / 2;
    const radius = 0.025 + 0.045 * noise(s, 6);
    const color = noise(s, 7) < 0.2 ? BARK_LIGHT : mix(BARK, BARK, 0, 0.75 + 0.4 * noise(s, 8));
    b.stick(
      [cx - dir[0]! * half, Math.max(0.02, cy - dir[1]! * half), cz - dir[2]! * half],
      [cx + dir[0]! * half, Math.max(0.02, cy + dir[1]! * half), cz + dir[2]! * half],
      radius,
      color,
    );
  }
  return b.build();
}

/**
 * Ohořelý zbytek hromady při velikosti 1: placka popela (uprostřed tmavá, k okraji šedá)
 * a na ní pár ohořelých pahýlů větví.
 */
export function charRemnantVertexData(): VertexData {
  const b = new MeshBuilder();
  const center = b.push([0, 0.07, 0], [0, 1, 0], ASH_DARK);
  const rings: number[][] = [];
  for (const [t, y, color] of [
    [0.55 * ASH_SPREAD, 0.05, ASH],
    [ASH_SPREAD, 0, ASH_LIGHT],
  ] as const) {
    const row: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS;
      const wobble = 1 + 0.18 * (noise(i % SEGMENTS, 21) - 0.5) * 2;
      row.push(
        b.push(
          [HEAP_A * 0.95 * t * wobble * Math.cos(a), y, HEAP_B * t * wobble * Math.sin(a)],
          [0, 1, 0],
          mix(color, ASH_DARK, 0.25 * noise(i % SEGMENTS, 22)),
        ),
      );
    }
    rings.push(row);
  }
  const [inner, outer] = rings as [number[], number[]];
  for (let i = 0; i < SEGMENTS; i++) {
    b.indices.push(center, inner[i]!, inner[i + 1]!);
    b.indices.push(inner[i]!, outer[i]!, inner[i + 1]!, inner[i + 1]!, outer[i]!, outer[i + 1]!);
  }
  for (let s = 0; s < CHAR_STICKS; s++) {
    const a = 2 * Math.PI * noise(s, 31);
    const rho = 0.6 * noise(s, 32);
    const cx = HEAP_A * rho * Math.cos(a);
    const cz = HEAP_B * rho * Math.sin(a);
    const yaw = 2 * Math.PI * noise(s, 33);
    const half = 0.25 + 0.3 * noise(s, 34);
    const radius = 0.03 + 0.03 * noise(s, 35);
    const y = 0.06 + radius;
    b.stick(
      [cx - Math.cos(yaw) * half, y, cz - Math.sin(yaw) * half],
      [cx + Math.cos(yaw) * half, y + 0.03, cz + Math.sin(yaw) * half],
      radius,
      mix(CHARCOAL, ASH_DARK, 0.4 * noise(s, 36)),
    );
  }
  return b.build();
}
