import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneGrainPit } from '../grain-pit-view';
import { grainPitGeometry, grainPitsKey } from './grain-pit-layout';
import type { HeightFn } from './ore-site-layout';
import { applySeasonRelief } from './season-materials';

// Otevřené obilné jámy ve scéně (production-chains.md – Obilné jámy): hrdlo s valem, zrno uvnitř
// a hroudy pečeti vedle (grain-pit-layout.ts). Zapečetěné jámy scéna nemá – nejsou vidět. Jedna
// síť pro všechny otevřené jámy, přestaví se jen při změně jámy nebo její plnosti
// (`grainPitsKey`). V zimě zapadá sněhem jako terén (`applySeasonRelief`).

export class GrainPitRenderer {
  private key = '';
  private mesh: Mesh | null = null;
  private material: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      /** Přesná výška vykresleného terénu (s převýšením). */
      decalHeight: HeightFn;
    },
  ) {}

  /** Překreslí otevřené jámy, když se změnily; vrátí true, když se něco změnilo. */
  update(pits: readonly SceneGrainPit[] | undefined): boolean {
    const key = grainPitsKey(pits);
    if (key === this.key) return false;
    this.key = key;
    this.mesh?.dispose();
    this.mesh = null;
    const geometry = grainPitGeometry(pits ?? [], this.context.decalHeight);
    if (geometry.indices.length === 0) return true;
    const data = new VertexData();
    data.positions = geometry.positions;
    data.indices = geometry.indices;
    const colors: number[] = [];
    for (let i = 0; i < geometry.colors.length; i += 3) {
      colors.push(geometry.colors[i]!, geometry.colors[i + 1]!, geometry.colors[i + 2]!, 1);
    }
    data.colors = colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
    data.normals = normals;
    const mesh = new Mesh('village-grain-pits', this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.earthMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.mesh = mesh;
    return true;
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
    this.material?.dispose();
  }

  /** Hlína, zrno a stín hrdla – barvy vrcholů, matné. */
  private earthMaterial(): StandardMaterial {
    if (this.material) return this.material;
    const m = new StandardMaterial('village-grain-pit', this.scene);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    // dno jámy leží jen kousek nad terénem – bez problikávání louky skrz
    m.zOffset = -2;
    applySeasonRelief(m);
    this.material = m;
    return m;
  }
}
