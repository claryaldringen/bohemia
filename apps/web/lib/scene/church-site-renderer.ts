// Staveniště kostela a hřbitůvek ve scéně (churches.md – Scéna; plán M8): jámy pece, vápna a písníku,
// hromady kamene a písku, bílá hladina vápna, žhavý oheň pece a hroby s kříži (church-site-layout.ts).
// Vzor `ore-sites.ts`: jedna síť na druh, přestaví se jen při změně (`churchSiteKey`). Kouř pece
// přidává `VillageRenderer` jako zdroj dýmu (`churchKilnSmoke`).
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneChurch } from '../church-view';
import {
  churchGraveGeometry,
  churchGravePlaces,
  churchSiteGlow,
  churchSiteHeaps,
  churchSiteKey,
  churchSitePits,
} from './church-site-layout';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';
import { applySeasonRelief } from './season-materials';

export class ChurchSiteRenderer {
  private key = '';
  private readonly meshes: Mesh[] = [];
  private earth: StandardMaterial | null = null;
  private glow: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly context: { decalHeight: HeightFn; addShadowCaster(mesh: Mesh): void },
  ) {}

  /** Překreslí staveniště a hroby, když se změnily; vrátí true při změně. */
  update(churches: readonly SceneChurch[]): boolean {
    const key = churchSiteKey(churches);
    if (key === this.key) return false;
    this.key = key;
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    const height = this.context.decalHeight;
    const glow = churchSiteGlow(churches, height);
    this.add('church-site-pits', churchSitePits(churches, height), this.earthMaterial(), false);
    this.add('church-site-heaps', churchSiteHeaps(churches, height), this.earthMaterial(), true);
    this.add('church-site-lime', glow.lime, this.glowMaterial(), false);
    this.add('church-site-fire', glow.fire, this.glowMaterial(), false);
    const graves: ColoredGeometry = { positions: [], colors: [], indices: [] };
    for (const c of churches) {
      if (c.graves <= 0) continue;
      const g = churchGraveGeometry(
        churchGravePlaces(c.type, c.dims, c.position, c.graves),
        height,
      );
      const offset = graves.positions.length / 3;
      graves.positions.push(...g.positions);
      graves.colors.push(...g.colors);
      graves.indices.push(...g.indices.map((i) => i + offset));
    }
    this.add('church-graves', graves, this.earthMaterial(), true);
    return true;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    this.earth?.dispose();
    this.glow?.dispose();
  }

  private add(name: string, g: ColoredGeometry, material: StandardMaterial, caster: boolean): void {
    if (g.indices.length === 0) return;
    const data = new VertexData();
    data.positions = g.positions;
    data.indices = g.indices;
    const colors: number[] = [];
    for (let i = 0; i < g.colors.length; i += 3) {
      colors.push(g.colors[i]!, g.colors[i + 1]!, g.colors[i + 2]!, 1);
    }
    data.colors = colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(g.positions, g.indices, normals);
    data.normals = normals;
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (caster) this.context.addShadowCaster(mesh);
    this.meshes.push(mesh);
  }

  /** Hlína, kámen, písek a dřevo – barvy vrcholů, matné. */
  private earthMaterial(): StandardMaterial {
    if (this.earth) return this.earth;
    const m = new StandardMaterial('church-site-earth', this.scene);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    applySeasonRelief(m);
    this.earth = m;
    return m;
  }

  /** Bez osvětlení: oheň v peci a bílé vápno v jámě svítí barvami vrcholů. */
  private glowMaterial(): StandardMaterial {
    if (this.glow) return this.glow;
    const m = new StandardMaterial('church-site-glow', this.scene);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.disableLighting = true;
    this.glow = m;
    return m;
  }
}
