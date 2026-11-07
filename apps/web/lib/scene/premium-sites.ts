import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape, PremiumFeatures } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';
import {
  premiumDecals,
  premiumProps,
  type PremiumDecal,
  type PremiumDecalTexture,
} from './premium-sites-layout';
import { applySeasonGround, applySeasonRelief } from './season-materials';
import type { StreamCenterline } from './stream-geometry';
import { createDecalMaterial, createDecalMesh } from './village-meshes';

// Prvky prémiové krajiny ve scéně (premium-landscapes.md – Vzhled): obtisky na terénu, dřevo
// (přístaviště, kůly, úly) a tůňky z premium-sites-layout.ts. Vznikají jednou se scénou krajiny
// – krajina se nemění, nic se nepřekresluje. Průměrná krajina žádné nemá.

/**
 * Obtisky prvků: nad terénem, pod obtisky polí a vsi (alphaIndex 1–2) – na náplav či rudiště
 * jde ves položit pole a pěšiny; stezka prvku jako pevná cesta vsi (path-renderer.ts).
 */
const DECAL_LAYER: Record<
  'patch' | 'route-worn' | 'route-earth',
  { lift: number; alphaIndex: number; zOffset: number }
> = {
  patch: { lift: 0.035, alphaIndex: 0.5, zOffset: -1.5 },
  'route-worn': { lift: 0.05, alphaIndex: 3, zOffset: -3.5 },
  'route-earth': { lift: 0.055, alphaIndex: 3.5, zOffset: -4 },
};
/** Sníh na obtiscích – stezka pod sněhem prosvítá jako pevná cesta, plochy zapadnou. */
const DECAL_SNOW = { patch: 0.85, route: 0.55 } as const;

export interface PremiumSitesEnvironment {
  /** Přesná výška vykresleného terénu (s převýšením). */
  decalHeight: HeightFn;
  /** Hladký terén pro normály obtisků. */
  groundHeight: HeightFn;
  /** Voda krajiny (potok i řeka) – břehy, hladina u přístaviště a brodu. */
  waters: StreamCenterline;
  addShadowCaster(mesh: Mesh): void;
  requestRender(): void;
}

/** Prvky prémiové krajiny ve scéně (obtisky, dřevo, tůňky). */
export class PremiumSites {
  private readonly meshes: Mesh[] = [];
  private readonly materials: Material[] = [];

  constructor(
    private readonly scene: Scene,
    landscape: Landscape,
    features: PremiumFeatures | null,
    private readonly env: PremiumSitesEnvironment,
  ) {
    if (!features) return;
    const decalMaterials = new Map<string, StandardMaterial>();
    for (const decal of premiumDecals(landscape, features, env.decalHeight, env.waters)) {
      const kind = layerOf(decal);
      const layer = DECAL_LAYER[kind];
      const key = `${decal.texture}:${kind}`;
      let material = decalMaterials.get(key);
      if (!material) {
        material = this.decalMaterial(decal.texture, kind, layer.zOffset);
        decalMaterials.set(key, material);
      }
      const mesh = createDecalMesh(this.scene, decal.name, decal.grid, {
        height: env.decalHeight,
        smoothHeight: env.groundHeight,
        lift: layer.lift,
        color: decal.color,
        uv: decal.texture === 'gravel' ? 6 : 12,
      });
      mesh.material = material;
      mesh.alphaIndex = layer.alphaIndex;
      mesh.freezeWorldMatrix();
      this.meshes.push(mesh);
    }
    const props = premiumProps(landscape, features, env.decalHeight, env.waters, HEIGHT_SCALE);
    this.addColored('premium-wood', props.wood, this.woodMaterial(), true);
    this.addColored('premium-pools', props.pools, this.poolMaterial(), false);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const material of this.materials) material.dispose(false, true);
    this.meshes.length = 0;
    this.materials.length = 0;
  }

  private decalMaterial(
    texture: PremiumDecalTexture,
    kind: keyof typeof DECAL_LAYER,
    zOffset: number,
  ): StandardMaterial {
    const material = createDecalMaterial(this.scene, `premium-${texture}-${kind}`, {
      texture,
      zOffset,
    });
    applySeasonGround(material, kind === 'patch' ? DECAL_SNOW.patch : DECAL_SNOW.route);
    const diffuse = material.diffuseTexture;
    if (diffuse instanceof Texture && !diffuse.isReady()) {
      diffuse.onLoadObservable.addOnce(() => this.env.requestRender());
    }
    this.materials.push(material);
    return material;
  }

  /** Dřevo – barvy vrcholů, matné; v zimě sníh navrchu jako na zemi. */
  private woodMaterial(): StandardMaterial {
    const m = new StandardMaterial('premium-wood', this.scene);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    applySeasonRelief(m, 0.7);
    this.materials.push(m);
    return m;
  }

  /** Voda tůněk – barvy vrcholů, odlesk oblohy, vlastní slabé světlo (jako jámy rudišť). */
  private poolMaterial(): StandardMaterial {
    const m = new StandardMaterial('premium-pools', this.scene);
    m.specularColor = new Color3(0.35, 0.36, 0.34);
    m.specularPower = 60;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    m.emissiveColor = new Color3(0.1, 0.12, 0.12);
    applySeasonRelief(m);
    this.materials.push(m);
    return m;
  }

  private addColored(
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
    mesh.freezeWorldMatrix();
    if (caster) this.env.addShadowCaster(mesh);
    this.meshes.push(mesh);
  }
}

/** Vrstva obtisku – stezka prvku jako pevná cesta, ostatní plochy pod poli. */
function layerOf(decal: PremiumDecal): keyof typeof DECAL_LAYER {
  if (decal.name === 'premium-route-worn') return 'route-worn';
  if (decal.name === 'premium-route-earth') return 'route-earth';
  return 'patch';
}
