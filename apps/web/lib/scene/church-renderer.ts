// Kostely ve scéně (churches.md – Scéna): model složený jen z `churchParts` jádra (church-mesh.ts)
// – zdi z omítky nebo holého kamene, šindelové střechy, tmavá okna a vchod, při stavbě zdí
// lešení. Hotový i rozestavěný kostel je tentýž model podle `progress`. Sítě mají barvy ve
// vrcholech, takže stačí jeden PBR materiál (světlá omítka × holý kámen jsou barvy vrcholů);
// opar `applyGammaFog` jako u ostatních staveb. Kreslí se jen při změně – `setChurches` vrací,
// zda se něco změnilo (scéna pak požádá o překreslení).
import { churchFootprintWorld, churchParts, wallThickness } from '@bohemia/game';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneChurch } from '../church-view';
import {
  churchMeshData,
  churchScaffoldData,
  type ChurchMeshArrays,
  type ChurchProgress,
} from './church-mesh';
import { applyGammaFog } from './gamma-fog';
import type { HeightFn } from './village-meshes';

/**
 * Natočení modelu kostela kolem y (Babylon) z `position.rotation` – stejné jako u budov, takže
 * model sedí s obrysem `churchFootprintWorld` (test `church-renderer.test.ts`).
 */
export function churchModelRotationY(rotation: number): number {
  return rotation;
}

/** Co renderer potřebuje od scény vsi. */
export interface ChurchContext {
  /** Přesná výška vykresleného terénu – pata kostela. */
  decalHeight: HeightFn;
  addShadowCaster(mesh: Mesh): void;
}

interface ChurchView {
  key: string;
  meshes: Mesh[];
}

export class ChurchRenderer {
  private readonly views = new Map<number, ChurchView>();
  private material: Material | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: ChurchContext,
  ) {}

  /** Nastaví kostely vsi; vrátí true, když se něco změnilo (kreslit znovu). */
  setChurches(list: readonly SceneChurch[]): boolean {
    if (this.disposed) return false;
    let changed = false;
    const seen = new Set<number>();
    for (const church of list) {
      seen.add(church.id);
      const key = JSON.stringify(church);
      if (this.views.get(church.id)?.key === key) continue;
      this.drop(church.id);
      this.views.set(church.id, { key, meshes: this.build(church) });
      changed = true;
    }
    for (const id of [...this.views.keys()]) {
      if (seen.has(id)) continue;
      this.drop(id);
      changed = true;
    }
    return changed;
  }

  /** Počet vykreslených kostelů (e2e, měření). */
  count(): number {
    return this.views.size;
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.views.keys()]) this.drop(id);
    this.material?.dispose();
    this.material = null;
  }

  private drop(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    for (const mesh of view.meshes) mesh.dispose();
    this.views.delete(id);
  }

  private build(church: SceneChurch): Mesh[] {
    const parts = churchParts(church.type, church.dims);
    const progress: ChurchProgress = {
      ...church.progress,
      decor: church.decorated ? 1 : church.progress.decor,
    };
    const data = churchMeshData(parts, progress, wallThickness);
    const { x, z, rotation } = church.position;
    // pata kostela na nejvyšším místě půdorysu – na svahu zdi sahají pod terén
    let base = -Infinity;
    for (const outline of churchFootprintWorld(church.type, church.dims, church.position)) {
      for (const p of outline) base = Math.max(base, this.context.decalHeight(p.x, p.z));
    }
    if (!Number.isFinite(base)) base = this.context.decalHeight(x, z);
    const arrays: [string, ChurchMeshArrays][] = [
      ['walls', data.walls],
      ['roofs', data.roofs],
      ['openings', data.openings],
      ['scaffold', churchScaffoldData(parts, progress.walls, wallThickness)],
    ];
    const meshes: Mesh[] = [];
    for (const [name, a] of arrays) {
      const mesh = this.mesh(`church-${name}-${church.id}`, a);
      if (!mesh) continue;
      mesh.position.set(x, base, z);
      // místní x míří po ose kostela – natočení jako budovy (`churchLocalToWorld`)
      mesh.rotation.y = churchModelRotationY(rotation);
      meshes.push(mesh);
    }
    return meshes;
  }

  private mesh(name: string, a: ChurchMeshArrays): Mesh | null {
    if (a.indices.length === 0) return null;
    const data = new VertexData();
    data.positions = a.positions;
    data.normals = a.normals;
    data.colors = a.colors;
    data.uvs = a.uvs;
    data.indices = a.indices;
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.getMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    // tmavé otvory těsně před zdí stín nevrhají
    if (!name.startsWith('church-openings')) this.context.addShadowCaster(mesh);
    return mesh;
  }

  /** Jeden materiál pro vše – barvy omítky, kamene, šindele a otvorů jsou ve vrcholech. */
  private getMaterial(): Material {
    if (this.material) return this.material;
    const m = new PBRMaterial('church-material', this.scene);
    m.albedoColor = new Color3(1, 1, 1);
    m.metallic = 0;
    m.roughness = 0.92;
    // střechy a štíty vidět z obou stran, na pořadí vrcholů nezáleží
    m.backFaceCulling = false;
    applyGammaFog(m);
    this.material = m;
    return m;
  }
}
