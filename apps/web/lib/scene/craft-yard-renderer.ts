// Dvory kovárny a hrnčíře ve scéně (production-chains.md – Kovář; crafts.md – Hlína hrnčíře):
// redukční pec s měchem, houba a hřivny u kovárny, jáma s hlínou u hrnčíře – jedna síť s barvami
// vrcholů (craft-yard-layout.ts), přestaví se jen při změně, kterou je vidět (`craftYardsKey`).
// Při tavbě šlehá z hrdla pece žár a jiskry – sprity ohně jako u pohřební hranice a svatby
// (pyre-fire.ts, textures/particles/fire.png), posouvá je `animate` jen v záběru; při omezeném
// pohybu se nevolá a zůstane poslední stav.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import {
  bloomeryTop,
  craftYardGeometry,
  craftYardsKey,
  type CraftYardView,
} from './craft-yard-layout';
import type { HeightFn } from './ore-site-layout';
import { fireSprites, type FireSprite } from './pyre-fire';
import { applySeasonRelief } from './season-materials';

const FIRE_URL = '/textures/particles/fire.png';
const FIRE_CELL_PX = 128;
/** Sprity se kreslí po krajině jako dým z obydlí a oheň hranice (skupina 1). */
const SPRITE_RENDERING_GROUP = 1;
/** Dál od kamery (m) se žár nehýbe – jako dým a lidé. */
const ANIMATE_RANGE_M = 1500;
/** Žár v hrdle pece je mnohem menší než pohřební hranice (násobek – pyre-fire.ts). */
const FIRE_SCALE = 0.2;
/** Síla žáru: plameny nízko nad uhlím, jiskry z dmýchání, žhavá záře. */
const SMELT_FIRE = { fire: 0.45, stack: 0.15, glow: 0.9 } as const;
const NORTH = { x: 0, z: 1 };

interface Furnace {
  seed: number;
  x: number;
  y: number;
  z: number;
  sprites: Sprite[];
}

export class CraftYardRenderer {
  private key = '';
  private mesh: Mesh | null = null;
  private material: StandardMaterial | null = null;
  private fireManager: SpriteManager | null = null;
  private capacity = 0;
  private furnaces: Furnace[] = [];
  private readonly flames: FireSprite[] = [];
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: { groundHeight: HeightFn; decalHeight: HeightFn },
  ) {}

  /** Překreslí dvory dílen, když se změnilo, co je vidět; vrátí true při změně. */
  update(views: readonly CraftYardView[]): boolean {
    if (this.disposed) return false;
    const key = craftYardsKey(views);
    if (key === this.key) return false;
    this.key = key;
    this.mesh?.dispose();
    this.mesh = null;
    const geometry = craftYardGeometry(views, this.context.decalHeight);
    if (geometry.indices.length > 0) this.mesh = this.meshOf(geometry);
    this.setFurnaces(views.filter((v) => v.craft === 'smith' && v.yard?.task === 'smelt'));
    return true;
  }

  /** Posune žár pecí na okamžik `nowMs`; vrátí true, když se v záběru něco změnilo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.furnaces.length === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(nowMs);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.mesh?.dispose();
    this.material?.dispose();
    this.clearFurnaces();
    this.fireManager?.dispose();
    this.fireManager = null;
  }

  private meshOf(geometry: ReturnType<typeof craftYardGeometry>): Mesh {
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
    const mesh = new Mesh('village-craft-yards', this.scene);
    data.applyToMesh(mesh);
    if (!this.material) {
      const m = new StandardMaterial('village-craft-yards', this.scene);
      m.specularColor = Color3.Black();
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      applySeasonRelief(m);
      this.material = m;
    }
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  private clearFurnaces(): void {
    for (const f of this.furnaces) for (const s of f.sprites) s.dispose();
    this.furnaces = [];
  }

  /** Pece, které dnes taví – sprity žáru nad hrdlem a obal pro ořez kamerou. */
  private setFurnaces(views: readonly CraftYardView[]): void {
    this.clearFurnaces();
    if (views.length === 0) return;
    const perFire = fireSprites(0, 0, SMELT_FIRE, NORTH).length;
    this.ensureManager(views.length * perFire);
    const manager = this.fireManager;
    if (!manager) return;
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const view of views) {
      const top = bloomeryTop(view);
      const y = this.context.groundHeight(top.x, top.z) + top.y;
      const sprites = Array.from({ length: perFire }, () => {
        const sprite = new Sprite('craft-yard-fire', manager);
        sprite.isVisible = false;
        return sprite;
      });
      this.furnaces.push({ seed: view.id * 7919 + 17, x: top.x, y, z: top.z, sprites });
      min.minimizeInPlaceFromFloats(top.x - 1, y - 1.2, top.z - 1);
      max.maximizeInPlaceFromFloats(top.x + 1, y + 3, top.z + 1);
    }
    this.bounds.reConstruct(min, max);
    this.write(Date.now());
  }

  private write(nowMs: number): void {
    for (const f of this.furnaces) {
      fireSprites(f.seed, nowMs / 1000, SMELT_FIRE, NORTH, this.flames);
      f.sprites.forEach((sprite, i) => {
        const flame = this.flames[i];
        sprite.isVisible = !!flame && flame.intensity > 0.004;
        if (!flame || !sprite.isVisible) return;
        sprite.position.set(
          f.x + flame.dx * FIRE_SCALE,
          f.y + flame.dy * FIRE_SCALE,
          f.z + flame.dz * FIRE_SCALE,
        );
        sprite.width = flame.width * FIRE_SCALE;
        sprite.height = flame.height * FIRE_SCALE;
        sprite.angle = flame.angle;
        sprite.cellIndex = flame.cell;
        sprite.color.set(1, 1, 1, Math.min(1, flame.intensity));
      });
    }
  }

  /** Správce spritů žáru s místem pro `count` spritů (znovu, jen když nestačí). */
  private ensureManager(count: number): void {
    if (count === 0 || (this.fireManager && count <= this.capacity)) return;
    this.fireManager?.dispose();
    this.capacity = Math.max(count, 2 * fireSprites(0, 0, SMELT_FIRE, NORTH).length);
    const fire = new SpriteManager(
      'craft-yard-fire',
      FIRE_URL,
      this.capacity,
      FIRE_CELL_PX,
      this.scene,
    );
    // žár svítí – sčítá se s tím, co je za ním (barva × krytí)
    fire.blendMode = Constants.ALPHA_ADD;
    fire.disableDepthWrite = true;
    fire.isPickable = false;
    fire.renderingGroupId = SPRITE_RENDERING_GROUP;
    fire.fogEnabled = false;
    this.scene.setRenderingAutoClearDepthStencil(SPRITE_RENDERING_GROUP, false, false, false);
    this.fireManager = fire;
  }
}
