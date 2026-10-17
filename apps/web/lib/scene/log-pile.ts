import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape, ObstacleChanges, ObstacleLayer } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import {
  PILE_DEPTH_M,
  PILE_WIDTH_M,
  logPileLayout,
  logPileSite,
  pileToWorld,
  type LogPileSite,
} from './log-pile-layout';

/** Úseků kmene po obvodu a po délce (kůra se po délce mírně mění). */
const SIDES = 12;
const LENGTH_SEGMENTS = 4;
const BARK = [0.4, 0.29, 0.19] as const;
const SAPWOOD = [0.86, 0.7, 0.46] as const;
const HEARTWOOD = [0.7, 0.5, 0.3] as const;

/**
 * Hromada klád u vsi (forest.md – „klády leží viditelně složené stranou“): kmeny jako instance
 * jedné vlastní sítě (válec s kůrou a světlými čely), kolik klád, tolik kmenů – nejvýš
 * MAX_SHOWN_LOGS. Místo se hledá jen při změně vsi (obydlí, pole, překážky), počet klád jen
 * přeskládá instance.
 */
export class LogPile {
  private mesh: Mesh | null = null;
  private siteKey = '';
  private site: LogPileSite | null = null;
  private signature = '';

  constructor(
    private readonly scene: Scene,
    private readonly options: {
      landscape: Landscape;
      layer: ObstacleLayer;
      groundHeight: (worldX: number, worldZ: number) => number;
      addShadowCaster: (mesh: Mesh) => void;
    },
  ) {}

  /** Klády podle vsi; vrátí true, když se kreslení změnilo. */
  update(village: SceneVillage, changes: ObstacleChanges): boolean {
    const count = village.woodLogs ?? 0;
    const siteKey = [
      village.dwellings.map((d) => `${d.id}:${d.position.x}:${d.position.z}`).join(','),
      village.fields.map((f) => f.parts.length).join(','),
      (village.cemeteries ?? []).map((c) => c.squares.length).join(','),
      changes.removed.length,
      changes.stumps.length,
    ].join('|');
    if (siteKey !== this.siteKey) {
      this.siteKey = siteKey;
      this.site = logPileSite(this.options.landscape, village, this.options.layer, changes);
    }
    const site = this.site;
    const signature = site && count > 0 ? `${site.x}|${site.z}|${site.rotation}|${count}` : '';
    if (signature === this.signature) return false;
    this.signature = signature;
    if (!site || count <= 0) {
      if (!this.mesh?.isEnabled()) return false;
      this.mesh.setEnabled(false);
      return true;
    }
    const mesh = this.ensureMesh();
    const logs = logPileLayout(count);
    // pata hromady: nejnižší místo pod ní – na svahu klády nevisí ve vzduchu
    const base = Math.min(
      ...[
        [0, 0],
        [-PILE_WIDTH_M / 2, -PILE_DEPTH_M / 2],
        [PILE_WIDTH_M / 2, -PILE_DEPTH_M / 2],
        [PILE_WIDTH_M / 2, PILE_DEPTH_M / 2],
        [-PILE_WIDTH_M / 2, PILE_DEPTH_M / 2],
      ].map(([lx, lz]) => {
        const [x, z] = pileToWorld(site, lx!, lz!);
        return this.options.groundHeight(x, z);
      }),
    );
    const matrices = new Float32Array(logs.length * 16);
    const matrix = new Matrix();
    logs.forEach((log, i) => {
      const [x, z] = pileToWorld(site, log.x, log.z);
      Matrix.ComposeToRef(
        new Vector3(log.radius, log.radius, log.length),
        Quaternion.RotationAxis(Vector3.Up(), site.rotation + log.yaw),
        new Vector3(x, base + log.y - 0.03, z),
        matrix,
      );
      matrix.copyToArray(matrices, i * 16);
    });
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.setEnabled(true);
    return true;
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
  }

  private ensureMesh(): Mesh {
    if (this.mesh) return this.mesh;
    const mesh = new Mesh('village-logs', this.scene);
    logVertexData().applyToMesh(mesh);
    const material = new StandardMaterial('village-logs', this.scene);
    material.diffuseColor = Color3.White();
    material.specularColor = Color3.Black();
    material.ambientColor = new Color3(0.4, 0.38, 0.36);
    // čela i plášť mají vlastní normály – na pořadí vrcholů nezáleží
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.options.addShadowCaster(mesh);
    this.mesh = mesh;
    return mesh;
  }
}

/** Hash → [0, 1) pro drobné změny barvy kůry. */
function noise(i: number): number {
  const h = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Kmen o poloměru 1 a délce 1 podél osy z (instance ho zvětší): plášť s kůrou po úsecích a čela
 * se světlým bělem a tmavším jádrem.
 */
function logVertexData(): VertexData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const push = (
    p: [number, number, number],
    n: [number, number, number],
    c: readonly number[],
  ): number => {
    positions.push(...p);
    normals.push(...n);
    colors.push(c[0]!, c[1]!, c[2]!, 1);
    return positions.length / 3 - 1;
  };
  // plášť
  for (let j = 0; j <= LENGTH_SEGMENTS; j++) {
    const z = j / LENGTH_SEGMENTS - 0.5;
    for (let i = 0; i <= SIDES; i++) {
      const a = (2 * Math.PI * i) / SIDES;
      const shade = 0.82 + 0.3 * noise(j * 31 + (i % SIDES));
      push(
        [Math.cos(a), Math.sin(a), z],
        [Math.cos(a), Math.sin(a), 0],
        BARK.map((v) => v * shade),
      );
    }
  }
  for (let j = 0; j < LENGTH_SEGMENTS; j++) {
    for (let i = 0; i < SIDES; i++) {
      const a = j * (SIDES + 1) + i;
      const b = a + SIDES + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // čela: střed jádro, okraj běl
  for (const side of [-1, 1] as const) {
    const z = side * 0.5;
    const center = push([0, 0, z], [0, 0, side], HEARTWOOD);
    const inner: number[] = [];
    const outer: number[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (2 * Math.PI * i) / SIDES;
      inner.push(push([0.55 * Math.cos(a), 0.55 * Math.sin(a), z], [0, 0, side], SAPWOOD));
      outer.push(
        push(
          [0.97 * Math.cos(a), 0.97 * Math.sin(a), z],
          [0, 0, side],
          SAPWOOD.map((v) => v * 0.85),
        ),
      );
    }
    for (let i = 0; i < SIDES; i++) {
      const k = (i + 1) % SIDES;
      if (side > 0) {
        indices.push(center, inner[i]!, inner[k]!);
        indices.push(inner[i]!, outer[i]!, outer[k]!, inner[i]!, outer[k]!, inner[k]!);
      } else {
        indices.push(center, inner[k]!, inner[i]!);
        indices.push(inner[i]!, outer[k]!, outer[i]!, inner[i]!, inner[k]!, outer[k]!);
      }
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  return data;
}
