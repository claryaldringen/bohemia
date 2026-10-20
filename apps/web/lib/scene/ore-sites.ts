import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneOrePit, SceneOreSite } from '../village-view';
import {
  orePitGeometry,
  orePitWater,
  oreHeapGeometry,
  oreSitesKey,
  type ColoredGeometry,
  type HeightFn,
} from './ore-site-layout';
import { applySeasonRelief } from './season-materials';

// Rudiště kovářů ve scéně (crafts.md – Uhlí a ruda kováře): jámy s valem a vodou na dně a hromádka
// rudy u místa (ore-site-layout.ts). Jedna síť pro všechny jámy, jedna pro vodu a jedna pro
// hromady – přestaví se jen při změně rudišť nebo jam (`oreSitesKey`). V zimě zapadají sněhem jako
// terén (`applySeasonRelief`), voda zamrzne pod sněhem stejně.

export class OreSiteRenderer {
  private key = '';
  private readonly meshes: Mesh[] = [];
  private earth: StandardMaterial | null = null;
  private water: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      /** Přesná výška vykresleného terénu (s převýšením). */
      decalHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
    },
  ) {}

  /** Překreslí rudiště a jámy, když se změnily; vrátí true, když se něco změnilo. */
  update(
    sites: readonly SceneOreSite[] | undefined,
    pits: readonly SceneOrePit[] | undefined,
  ): boolean {
    const key = oreSitesKey(sites, pits);
    if (key === this.key) return false;
    this.key = key;
    this.clear();
    const height = this.context.decalHeight;
    this.add('village-ore-pits', orePitGeometry(pits ?? [], height), this.earthMaterial(), false);
    this.add('village-ore-water', orePitWater(pits ?? [], height), this.waterMaterial(), false);
    this.add('village-ore-heaps', oreHeapGeometry(sites ?? [], height), this.earthMaterial(), true);
    return true;
  }

  dispose(): void {
    this.clear();
    this.earth?.dispose();
    this.water?.dispose();
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
  }

  private add(
    name: string,
    geometry: ColoredGeometry,
    material: StandardMaterial,
    caster: boolean,
  ): void {
    if (geometry.indices.length === 0) return;
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
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (caster) this.context.addShadowCaster(mesh);
    this.meshes.push(mesh);
  }

  /** Hlína, drn a ruda – barvy vrcholů, matné. */
  private earthMaterial(): StandardMaterial {
    if (this.earth) return this.earth;
    const m = new StandardMaterial('village-ore-earth', this.scene);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    applySeasonRelief(m);
    this.earth = m;
    return m;
  }

  /** Voda na dně jam – kalná hnědozelená s odleskem oblohy. */
  private waterMaterial(): StandardMaterial {
    if (this.water) return this.water;
    const m = new StandardMaterial('village-ore-water', this.scene);
    m.specularColor = new Color3(0.18, 0.17, 0.12);
    m.specularPower = 40;
    m.backFaceCulling = false;
    // Obě strany osvětlené (jinak by plocha s normálou dolů zčernala) a vlastní světlo kalné vody,
    // ať není tmavší než potok u břehu.
    m.twoSidedLighting = true;
    m.emissiveColor = new Color3(0.09, 0.075, 0.03);
    applySeasonRelief(m);
    this.water = m;
    return m;
  }
}
