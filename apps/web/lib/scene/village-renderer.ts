import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DWELLING_FOOTPRINT_M, type DwellingType } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { EARTH_LAYERS, earthPatch, eaveTufts, type TuftModel } from './dwelling-decor';
import { cellsBoundary, cellsCoverage, rowDirection } from './field-cells';
import { applyGammaFog } from './gamma-fog';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import {
  CONSTRUCTION_POST_M,
  constructionLook,
  decalGrid,
  dwellingHideShape,
  fieldHideShape,
  footprintCorners,
  localToWorld,
  partLook,
  polygonBounds,
  softCoverage,
  stripSegments,
  type DecalGrid,
  type FieldTexture,
  type HideShape,
} from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';
import type { SceneDwelling, SceneField } from './village-types';

const MODEL_BASE_URL = '/models/dwellings/';
const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
const TUFT_MODELS: readonly TuftModel[] = ['grass-tuft-1', 'grass-tuft-2'];
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Rostliny jako dekorace krajiny (decorations.ts) – trsy u okapu jsou sytější a zelenější. */
const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
const TUFT_TINT = new Color3(0.56, 0.86, 0.4);
/** Obydlí je o kousek zapuštěné – na mírném svahu tak žádný roh nevisí nad terénem (m). */
const DWELLING_SINK_M = 0.05;
/**
 * Kolik bodů sítě obtisku pole připadá na stranu čtverce – 8 na 15 m sedí na síť terénu
 * (4 body na políčko), obtisk pak leží přesně na něm. Šířka měkkého okraje pole (m).
 */
const FIELD_GRID_PER_CELL = 8;
const FIELD_EDGE_SOFT_M = 1.2;
/** Mez kolem pole – tenký pás podél hranice čtverců (m). */
const OUTLINE_WIDTH_M = 0.3;
/** Rozteč řádků obilí / brázd (m) a délka opakování textury podél nich. */
const ROW_SPACING_M = 0.75;
const ROW_REPEAT_M = 4;
/** Výška obtisků nad terénem (m) – navzájem v pořadí, aby se nepraly o hloubku. */
const LIFT = { field: 0.03, rows: 0.045, outline: 0.06, worn: 0.03, earth: 0.04, pit: 0.035 };
const WOOD = new Color3(0.42, 0.31, 0.21);
const POST_THICKNESS_M = 0.16;

interface DwellingView {
  key: string;
  dwelling: SceneDwelling;
  meshes: Mesh[];
  shape: HideShape;
}

interface FieldView {
  key: string;
  meshes: Mesh[];
  shape: HideShape | null;
}

interface VillageContext {
  /** Hladký terén (bilineárně, s převýšením) – paty modelů, trsů a sloupů. */
  groundHeight: HeightFn;
  /** Přesná výška vykresleného terénu – obtisky. */
  decalHeight: HeightFn;
  /** Nový mesh, který má vrhat stín od slunce. */
  addShadowCaster(mesh: Mesh): void;
  /** Ve vsi se něco změnilo až později (dočtený model) – překreslit a obnovit stíny. */
  onAsyncChange(): void;
  /** Dočetla se textura obtisku – překreslit. */
  requestRender(): void;
}

/**
 * Ves ve scéně: hotová obydlí jako modely (thin instances, jeden mesh na typ), kolem nich
 * vyšlapaná hlína a trsy trávy u okapu, staveniště (jáma a rostoucí sloupy), pole jako obtisky
 * na terénu podle stavu dílů s mezí podél obrysu. `update` mění jen to, co se změnilo.
 */
export class VillageRenderer {
  private readonly dwellings = new Map<number, DwellingView>();
  private readonly fields = new Map<number, FieldView>();
  private readonly models = new Map<DwellingType, Mesh | null>();
  private readonly ghosts = new Map<DwellingType, Mesh>();
  private readonly tufts = new Map<TuftModel, Mesh | null>();
  private readonly materials = new Map<string, Material>();
  private loading: Promise<void> | null = null;
  private builtKey = '';
  private village: SceneVillage = { dwellings: [], fields: [] };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: VillageContext,
  ) {}

  /** Vrátí true, když se ve scéně něco změnilo (je co překreslit). */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    this.village = village;
    const dwellings = this.updateDwellings(village.dwellings);
    const fields = this.updateFields(village.fields);
    const models = this.updateModels();
    return dwellings || fields || models;
  }

  /** Oblasti, kde se mají skrýt stromy a kameny krajiny. */
  hideShapes(): HideShape[] {
    const shapes: HideShape[] = [];
    for (const view of this.dwellings.values()) shapes.push(view.shape);
    for (const view of this.fields.values()) if (view.shape) shapes.push(view.shape);
    return shapes;
  }

  /** Průhledný model obydlí pro ducha při umisťování (null, dokud se model nenačte). */
  ghostModel(type: DwellingType): Mesh | null {
    void this.loadModels();
    return this.ghosts.get(type) ?? null;
  }

  /** Načte modely obydlí a trsů (jednou); po načtení se ves překreslí. */
  loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.dwellings.values()) for (const mesh of view.meshes) mesh.dispose();
    for (const view of this.fields.values()) for (const mesh of view.meshes) mesh.dispose();
    this.dwellings.clear();
    this.fields.clear();
  }

  private async load(): Promise<void> {
    await Promise.all([
      ...DWELLING_TYPES.map(async (type) => {
        try {
          const model = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${type}.glb`,
            `village-${type}`,
            prepareDwellingMaterial,
          );
          if (!model) return;
          // Víc materiálů v GLB → po spojení meshů je ořez stěn opačně než u jednomateriálových
          // modelů (instanced-model.ts nastavuje CCW) – otočit zpět. Atlas = jeden materiál.
          const material = model.material;
          if (material instanceof MultiMaterial && material.subMaterials.length > 1) {
            for (const m of material.subMaterials)
              if (m) m.sideOrientation = Material.ClockWiseSideOrientation;
          }
          // Duch dřív, než mesh dostane instance – klon by je jinak nesl s sebou.
          const ghost = model.clone(`village-ghost-${type}`);
          ghost.setEnabled(false);
          ghost.isPickable = false;
          this.ghosts.set(type, ghost);
          model.setEnabled(false);
          this.models.set(type, model);
          this.context.addShadowCaster(model);
        } catch (error) {
          console.warn(`Model obydlí ${type} se nepodařilo načíst.`, error);
          this.models.set(type, null);
        }
      }),
      ...TUFT_MODELS.map(async (name) => {
        try {
          const tuft = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${name}.glb`,
            `village-${name}`,
            prepareTuftMaterial,
          );
          if (tuft) {
            tuft.setEnabled(false);
            this.context.addShadowCaster(tuft);
          }
          this.tufts.set(name, tuft);
        } catch (error) {
          console.warn('Trsy trávy u obydlí se nepodařilo načíst.', error);
          this.tufts.set(name, null);
        }
      }),
    ]);
    if (this.disposed) return;
    this.builtKey = '';
    this.updateModels();
    this.context.onAsyncChange();
  }

  private updateDwellings(dwellings: readonly SceneDwelling[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const dwelling of dwellings) {
      seen.add(dwelling.id);
      const key = dwellingKey(dwelling);
      const current = this.dwellings.get(dwelling.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.dwellings.set(dwelling.id, {
        key,
        dwelling,
        meshes: dwelling.built ? this.dwellingGround(dwelling) : this.constructionSite(dwelling),
        shape: dwellingHideShape(dwelling.type, dwelling.position),
      });
    }
    for (const [id, view] of this.dwellings) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.dwellings.delete(id);
      changed = true;
    }
    return changed;
  }

  /** Modely hotových obydlí a trsy u okapu – přepočítají se, jen když se změnila hotová obydlí. */
  private updateModels(): boolean {
    const built = this.village.dwellings.filter((d) => d.built);
    const key = built.map(dwellingKey).join(';');
    if (key === this.builtKey) return false;
    if (built.length > 0) void this.loadModels();
    if (!this.loading) return false;
    this.builtKey = key;
    for (const type of DWELLING_TYPES) {
      const model = this.models.get(type);
      if (!model) continue;
      const instances: ModelInstance[] = built
        .filter((d) => d.type === type)
        .map((d) => ({
          x: d.position.x,
          y: this.baseHeight(d),
          z: d.position.z,
          rotationY: d.position.rotation,
          scale: 1,
        }));
      setInstances(model, instances);
    }
    const tufts = built.flatMap((d) => eaveTufts(d.type, d.position, d.id));
    for (const name of TUFT_MODELS) {
      const mesh = this.tufts.get(name);
      if (!mesh) continue;
      setInstances(
        mesh,
        tufts
          .filter((t) => t.model === name)
          .map((t) => ({
            x: t.x,
            y: this.context.groundHeight(t.x, t.z) - 0.04,
            z: t.z,
            rotationY: t.rotationY,
            scale: t.scale,
          })),
      );
    }
    return true;
  }

  /** Výška vykresleného terénu (obtisky ducha při umisťování). */
  decalHeight(x: number, z: number): number {
    return this.context.decalHeight(x, z);
  }

  /** Pata modelu: střed, nebo průměr rohů půdorysu, když je níž (svah), o kousek zapuštěná. */
  baseHeight(d: Pick<SceneDwelling, 'type' | 'position'>): number {
    const { width, depth } = DWELLING_FOOTPRINT_M[d.type];
    const h = this.context.groundHeight;
    const corners = footprintCorners(d.position, width, depth);
    const mean = corners.reduce((sum, [x, z]) => sum + h(x, z), 0) / corners.length;
    return Math.min(h(d.position.x, d.position.z), mean) - DWELLING_SINK_M;
  }

  /** Vyšlapaná hlína před vchodem: širší prošlapaná tráva, uvnitř holá udusaná hlína. */
  private dwellingGround(d: SceneDwelling): Mesh[] {
    const worn = createDecalMesh(
      this.scene,
      `village-worn-${d.id}`,
      earthPatch(d.type, d.position, d.id, EARTH_LAYERS.worn),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.worn,
        color: [1, 0.96, 0.88],
        uv: 20,
      },
    );
    worn.material = this.decalMaterial('grass-dirt');
    worn.alphaIndex = 1;
    const earth = createDecalMesh(
      this.scene,
      `village-earth-${d.id}`,
      earthPatch(d.type, d.position, d.id, EARTH_LAYERS.earth),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.earth,
        // šedavá hlína z terénu do teplejší hnědé (udusaná hlína u dveří)
        color: [1.05, 0.9, 0.74],
        uv: 14,
      },
    );
    earth.material = this.decalMaterial('mud', -3);
    earth.alphaIndex = 2;
    return [worn, earth];
  }

  /**
   * Staveniště: vykopaná jáma (obtisk hlíny v půdorysu, sytější s průběhem) a dřevěná
   * konstrukce – rohové a štítové sloupy rostou, od 60 % hřebenová vaznice, od 80 % krokve.
   */
  private constructionSite(d: SceneDwelling): Mesh[] {
    const look = constructionLook(d.type, d.progress);
    const { width, depth } = DWELLING_FOOTPRINT_M[d.type];
    const outline = footprintCorners(d.position, width + 0.8, depth + 0.8);
    const b = polygonBounds(outline);
    const pit = createDecalMesh(
      this.scene,
      `village-pit-${d.id}`,
      decalGrid(
        { minX: b.minX - 1, maxX: b.maxX + 1, minZ: b.minZ - 1, maxZ: b.maxZ + 1 },
        0.5,
        softCoverage(outline, 0.8),
      ),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.pit,
        color: [0.78, 0.64, 0.5],
        alpha: look.pit,
        uv: 12,
      },
    );
    pit.material = this.decalMaterial('mud', -3);
    pit.alphaIndex = 2;
    const meshes: Mesh[] = [pit];

    const base = this.baseHeight(d);
    const parts: Mesh[] = [];
    const world = (lx: number, lz: number, y: number): Vector3 => {
      const [x, z] = localToWorld(d.position, lx, lz);
      return new Vector3(x, y, z);
    };
    for (const post of look.posts) {
      const box = CreateBox(
        `village-post-${d.id}`,
        { width: POST_THICKNESS_M, depth: POST_THICKNESS_M, height: post.height + 0.3 },
        this.scene,
      );
      // 0,3 m zapuštěné do země
      box.position = world(post.x, post.z, base + post.height / 2 - 0.15);
      box.rotation.y = d.position.rotation;
      parts.push(box);
    }
    const beam = (from: Vector3, to: Vector3): void => {
      const length = Vector3.Distance(from, to);
      const box = CreateBox(
        `village-beam-${d.id}`,
        { width: POST_THICKNESS_M * 0.8, height: POST_THICKNESS_M * 0.8, depth: length },
        this.scene,
      );
      box.position = Vector3.Center(from, to);
      box.lookAt(to);
      parts.push(box);
    };
    const posts = look.posts;
    if (look.ridge && posts.length === 6) {
      const top = (i: number): Vector3 =>
        world(posts[i]!.x, posts[i]!.z, base + CONSTRUCTION_POST_M.ridge);
      beam(top(4), top(5));
      if (look.rafters) {
        for (const [ridge, corner] of [
          [4, 0],
          [4, 1],
          [5, 2],
          [5, 3],
        ] as const) {
          beam(
            top(ridge),
            world(posts[corner]!.x, posts[corner]!.z, base + CONSTRUCTION_POST_M.wall),
          );
        }
      }
    }
    if (parts.length > 0) {
      const frame = Mesh.MergeMeshes(parts, true, true);
      if (frame) {
        frame.name = `village-frame-${d.id}`;
        frame.material = this.woodMaterial();
        frame.isPickable = false;
        frame.receiveShadows = true;
        this.context.addShadowCaster(frame);
        meshes.push(frame);
      }
    }
    return meshes;
  }

  private updateFields(fields: readonly SceneField[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const field of fields) {
      seen.add(field.id);
      const key = JSON.stringify(field.parts);
      const current = this.fields.get(field.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.fields.set(field.id, {
        key,
        meshes: this.fieldMeshes(field),
        shape: fieldHideShape(field),
      });
    }
    for (const [id, view] of this.fields) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.fields.delete(id);
      changed = true;
    }
    return changed;
  }

  /**
   * Pole: díly (čtverce políček) s měkkým okrajem na hranici pole, obarvené podle stavu –
   * jeden mesh na texturu, řádky obilí / brázdy navrch a tenká mez kolem čtverců.
   */
  private fieldMeshes(field: SceneField): Mesh[] {
    if (field.parts.length === 0) return [];
    const coverage = cellsCoverage(field.parts, FIELD_EDGE_SOFT_M);
    const groups = new Map<
      FieldTexture,
      { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] }
    >();
    const rows: { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] } = {
      grids: [],
      colors: [],
      alphas: [],
    };
    for (const part of field.parts) {
      const half = part.size / 2;
      const grid = decalGrid(
        { minX: part.x - half, maxX: part.x + half, minZ: part.z - half, maxZ: part.z + half },
        part.size / FIELD_GRID_PER_CELL,
        coverage,
      );
      if (grid.indices.length === 0) continue;
      const look = partLook(part.stage);
      const group = groups.get(look.texture) ?? { grids: [], colors: [], alphas: [] };
      group.grids.push(grid);
      group.colors.push(look.tint);
      group.alphas.push(look.alpha);
      groups.set(look.texture, group);
      if (look.rows) {
        rows.grids.push(grid);
        rows.colors.push(look.rows.color);
        rows.alphas.push(look.rows.alpha);
      }
    }
    const meshes: Mesh[] = [];
    const [dx, dz] = rowDirection(field.parts);
    for (const [texture, group] of groups) {
      const mesh = this.mergedDecal(`village-field-${field.id}-${texture}`, group, LIFT.field, 18);
      mesh.material = this.decalMaterial(texture);
      mesh.alphaIndex = 1;
      meshes.push(mesh);
    }
    if (rows.grids.length > 0) {
      const mesh = this.mergedDecal(`village-rows-${field.id}`, rows, LIFT.rows, (x, z) => [
        (x * dx + z * dz) / ROW_REPEAT_M,
        (-x * dz + z * dx) / ROW_SPACING_M,
      ]);
      mesh.material = this.rowsMaterial();
      mesh.alphaIndex = 2;
      meshes.push(mesh);
    }
    const outline = createStripMesh(
      this.scene,
      `village-outline-${field.id}`,
      cellsBoundary(field.parts).flatMap((line) =>
        stripSegments(line, false, OUTLINE_WIDTH_M, 1.5),
      ),
      this.context.decalHeight,
      LIFT.outline,
    );
    outline.material = this.outlineMaterial();
    meshes.push(outline);
    return meshes;
  }

  /** Spojí sítě dílů do jednoho obtisku – každý díl s vlastní barvou a krytím. */
  private mergedDecal(
    name: string,
    group: { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] },
    lift: number,
    uv: number | ((x: number, z: number) => [number, number]),
  ): Mesh {
    const total = group.grids.reduce((sum, g) => sum + g.alphas.length, 0);
    const totalIndices = group.grids.reduce((sum, g) => sum + g.indices.length, 0);
    const positions = new Float32Array(total * 2);
    const alphas = new Float32Array(total);
    const indices = new Uint32Array(totalIndices);
    const colorOf: [number, number, number][] = new Array<[number, number, number]>(total);
    let v = 0;
    let k = 0;
    group.grids.forEach((grid, g) => {
      const count = grid.alphas.length;
      positions.set(grid.positions, v * 2);
      for (let i = 0; i < count; i++) {
        alphas[v + i] = grid.alphas[i]! * group.alphas[g]!;
        colorOf[v + i] = group.colors[g]!;
      }
      for (let i = 0; i < grid.indices.length; i++) indices[k + i] = grid.indices[i]! + v;
      v += count;
      k += grid.indices.length;
    });
    return createDecalMesh(
      this.scene,
      name,
      { positions, alphas, indices },
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift,
        // Drobné kolísání barvy – díl nevypadá jako natřený jednou barvou.
        color: (x, z, i) => {
          const [r, g, b] = colorOf[i]!;
          const n = 0.94 + 0.06 * Math.sin(x * 0.37 + z * 0.21) * Math.sin(z * 0.43 - x * 0.17);
          return [r * n, g * n, b * n];
        },
        uv,
      },
    );
  }

  private decalMaterial(texture: FieldTexture, zOffset = -2): Material {
    const key = `decal-${texture}-${zOffset}`;
    let material = this.materials.get(key);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `village-${key}`, { texture, zOffset });
      const loaded = decal.diffuseTexture;
      if (loaded instanceof Texture && !loaded.isReady()) {
        loaded.onLoadObservable.addOnce(() => this.context.requestRender());
      }
      material = decal;
      this.materials.set(key, material);
    }
    return material;
  }

  /** Řádky přes pole – pruhy v textuře (krytí), barvu dodají vrcholy. */
  private rowsMaterial(): Material {
    let material = this.materials.get('rows');
    if (!material) {
      const standard = createDecalMaterial(this.scene, 'village-rows', { zOffset: -3 });
      const height = 32;
      const data = new Uint8Array(4 * height * 4);
      for (let y = 0; y < height; y++) {
        // úzký hřbet řádku s měkkými kraji
        const t = Math.abs(y / height - 0.5) * 2;
        const alpha = Math.round(255 * (1 - Math.min(1, Math.max(0, (t - 0.15) / 0.3))));
        for (let x = 0; x < 4; x++) data.set([255, 255, 255, alpha], (y * 4 + x) * 4);
      }
      const texture = RawTexture.CreateRGBATexture(
        data,
        4,
        height,
        this.scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.name = 'village-rows-texture';
      // RawTexture se jinak neopakuje (CLAMP) – řádky jdou přes celé pole.
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.hasAlpha = true;
      standard.diffuseTexture = texture;
      standard.useAlphaFromDiffuseTexture = true;
      material = standard;
      this.materials.set('rows', material);
    }
    return material;
  }

  private outlineMaterial(): Material {
    let material = this.materials.get('outline');
    if (!material) {
      const standard = new StandardMaterial('village-outline', this.scene);
      standard.diffuseColor = new Color3(0.5, 0.42, 0.28);
      standard.specularColor = Color3.Black();
      standard.zOffset = -4;
      standard.backFaceCulling = false;
      material = standard;
      this.materials.set('outline', material);
    }
    return material;
  }

  private woodMaterial(): Material {
    let material = this.materials.get('wood');
    if (!material) {
      const standard = new StandardMaterial('village-wood', this.scene);
      standard.diffuseColor = WOOD;
      standard.specularColor = Color3.Black();
      material = standard;
      this.materials.set('wood', material);
    }
    return material;
  }
}

function dwellingKey(d: SceneDwelling): string {
  const p = d.position;
  // Průběh stavby po 2 % – sloupy nerostou plynule, ale ani se nepřestavují při každém dotazu.
  return [d.type, p.x, p.z, p.rotation, d.built, d.built ? '' : Math.round(d.progress * 50)].join(
    '|',
  );
}

/** Nastaví instance meshe; bez instancí ho vypne (jinak by se vykreslil samotný model v počátku). */
function setInstances(mesh: Mesh, instances: readonly ModelInstance[]): void {
  if (instances.length === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
  mesh.setEnabled(true);
}

function prepareDwellingMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
}

function prepareTuftMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.alphaCutOff = 0.3;
  material.ambientColor = PLANT_AMBIENT;
  material.directIntensity = 0.75;
  material.albedoColor = TUFT_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
}
