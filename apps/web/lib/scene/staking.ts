// Vytyčení staveniště ve scéně: kolíky v instancích a napnutý provázek mezi nimi. Kde stojí,
// určuje staking-layout.ts. Provázek je tenká stuha ve výšce špiček kolíků (rovně mezi nimi,
// na svahu šikmo), světlá, aby byla vidět i z dálky.
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { instanceMatrices, type ModelInstance } from './instanced-model';
import { stakingLine, stakingPegs } from './staking-layout';
import type { Point } from './village-layout';
import type { HeightFn } from './village-meshes';

/** Kolík: průřez a délka (m), do země jde kousek; provázek je přivázaný těsně pod špičkou. */
const PEG_SIZE_M = 0.16;
const PEG_LENGTH_M = 1.25;
const PEG_SINK_M = 0.2;
const STRING_HEIGHT_M = 0.85;
/** Šířka stuhy provázku (m) – o něco víc než skutečný provázek, jinak by z dálky zmizel. */
const STRING_WIDTH_M = 0.1;
const PEG_AMBIENT = new Color3(0.5, 0.48, 0.44);

/** Instance kolíků pro dané čáry vytyčení (paty v terénu). */
export function pegInstances(
  lines: readonly (readonly Point[])[],
  height: HeightFn,
  spacing?: number,
): ModelInstance[] {
  return stakingPegs(lines, spacing).map(([x, z]) => ({
    x,
    y: height(x, z) - PEG_SINK_M,
    z,
    rotationY: 0,
    scale: 1,
  }));
}

/**
 * Provázek podél čar: stuha mezi špičkami sousedních kolíků – vodorovná a svislá, aby byla
 * vidět shora i ze strany.
 */
export function createStringMesh(
  scene: Scene,
  name: string,
  lines: readonly (readonly Point[])[],
  height: HeightFn,
  material: Material,
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    normal: [number, number, number],
  ): void => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) normals.push(...normal);
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  };
  const half = STRING_WIDTH_M / 2;
  for (const line of lines) {
    const points = stakingLine(line);
    for (let k = 0; k + 1 < points.length; k++) {
      const [ax, az] = points[k]!;
      const [bx, bz] = points[k + 1]!;
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-6) continue;
      const nx = (-(bz - az) / length) * half;
      const nz = ((bx - ax) / length) * half;
      const ay = height(ax, az) + STRING_HEIGHT_M;
      const by = height(bx, bz) + STRING_HEIGHT_M;
      quad(
        [ax + nx, ay, az + nz],
        [ax - nx, ay, az - nz],
        [bx + nx, by, bz + nz],
        [bx - nx, by, bz - nz],
        [0, 1, 0],
      );
      quad(
        [ax, ay + half, az],
        [ax, ay - half, az],
        [bx, by + half, bz],
        [bx, by - half, bz],
        [nx, 0, nz],
      );
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

/** Světlý materiál provázku (nezávisí na světle, aby se neztratil ve stínu). */
export function createStringMaterial(scene: Scene): Material {
  const m = new StandardMaterial('village-staking-string', scene);
  m.diffuseColor = new Color3(0.93, 0.88, 0.72);
  m.emissiveColor = new Color3(0.35, 0.32, 0.24);
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  return m;
}

/** Sdílený mesh kolíků vytyčení – instance všech stavenišť, nastavuje je vlastník. */
export class StakingPegs {
  private mesh: Mesh | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly addShadowCaster?: (mesh: Mesh) => void,
  ) {}

  set(instances: readonly ModelInstance[]): void {
    if (instances.length === 0) {
      this.mesh?.setEnabled(false);
      return;
    }
    this.mesh ??= this.create();
    this.mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
    this.mesh.setEnabled(true);
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
  }

  /** Hranol se zúženou špičkou, pata v počátku. */
  private create(): Mesh {
    const h = PEG_SIZE_M / 2;
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    const positions: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      const i = positions.length / 3;
      positions.push(
        ax,
        0,
        az,
        bx,
        0,
        bz,
        bx * 0.7,
        PEG_LENGTH_M,
        bz * 0.7,
        ax * 0.7,
        PEG_LENGTH_M,
        az * 0.7,
      );
      indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    const mesh = new Mesh('village-staking-pegs', this.scene);
    data.applyToMesh(mesh);
    const material = new StandardMaterial('village-staking-peg', this.scene);
    material.diffuseColor = new Color3(0.92, 0.82, 0.62);
    material.ambientColor = PEG_AMBIENT;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.addShadowCaster?.(mesh);
    return mesh;
  }
}
