import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { OFFICIAL_WORLD, type WorldClock } from '@bohemia/game';
import { HEAP_FIRE_SPRITES, MAX_FIRE_SQUARES, heapFireShape, type HeapFire } from './clearing-fire';
import { SLASH_HEAPS_MAX } from './clearing-slash-layout';
import { fireSprites, type FireShape, type FireSprite } from './pyre-fire';
import { clearingFireState, gameDayAt } from './smoke-schedule';

const FIRE_URL = '/textures/particles/fire.png';
const FIRE_CELL_PX = 128;
/** Sprity se kreslí po krajině jako dým (village-smoke.ts – skupina 1). */
const SPRITE_RENDERING_GROUP = 1;
/** Dál od kamery (m) oheň nehoří – jako dým a lidé. */
const ANIMATE_RANGE_M = 1500;
/** Dosah ohně hromady nad zemí a do stran (m) – je čtverec s ohněm v záběru? */
const FIRE_UP_M = 9;
const FIRE_SIDE_M = 3;
/** Síla plamínků v žhavých uhlících (násobek záře) – pod prahem jisker (pyre-fire.ts). */
const EMBER_FLAMES = 0.09;
/** Sprity všech ohňů – MAX_FIRE_SQUARES čtverců po nejvýš SLASH_HEAPS_MAX hromadách. */
const CAPACITY = MAX_FIRE_SQUARES * SLASH_HEAPS_MAX * HEAP_FIRE_SPRITES;

interface HeapView {
  fire: HeapFire;
  ground: number;
  shape: FireShape;
  heading: { x: number; z: number };
  flames: FireSprite[];
  /** Stav ohně v posledním taktu (počítá se jednou na takt). */
  state: ReturnType<typeof clearingFireState> | null;
}

interface SquareView {
  heaps: HeapView[];
  bounds: BoundingInfo;
  /** Vzdálenost od kamery v posledním taktu (m). */
  distance: number;
}

const byDistance = (a: SquareView, b: SquareView): number => a.distance - b.distance;

/**
 * Ohně pálení paseky (forest.md – Klučení lesa pro pole – postup; scene.md – Paseka klučení –
 * ohně a kouř): na hromadách větví čtverců, které se dnes pálí, plameny, jiskry a záře jako
 * u pohřební hranice (pyre-fire.ts – `fireSprites` s tvarem hromady, sprity fire.png). Kdy
 * hromada hoří a kdy žhnou uhlíky, určuje `clearingFireState` podle herního času. Plameny jen
 * na MAX_FIRE_SQUARES čtvercích v záběru nejblíž kameře – sprity jsou předem v jednom správci
 * a čtverce si je půjčují. `animate` se při omezeném pohybu volá jen po změně vsi (oheň stojí).
 */
export class ClearingFireRenderer {
  private manager: SpriteManager | null = null;
  private sprites: Sprite[] = [];
  private squares: SquareView[] = [];
  private key = '';
  private used = 0;
  /** Čtverce s ohněm v tomto taktu – pole se znovu používá, aby takt nealokoval. */
  private readonly lit: SquareView[] = [];
  private world: WorldClock = OFFICIAL_WORLD;

  constructor(
    private readonly scene: Scene,
    private readonly options: { groundHeight: (x: number, z: number) => number },
  ) {}

  setWorldClock(world: WorldClock): void {
    this.world = world;
  }

  /** Klíč posledních hromad (clearing-fire.ts – `burningKey`). */
  currentKey(): string {
    return this.key;
  }

  /** Hořící hromady (clearing-fire.ts – `heapFires`) s klíčem; vrátí true, když se změnily. */
  set(fires: readonly HeapFire[], key: string): boolean {
    if (key === this.key) return false;
    this.key = key;
    const bySquare = new Map<string, HeapView[]>();
    for (const fire of fires) {
      const list = bySquare.get(fire.square) ?? [];
      list.push({
        fire,
        ground: this.options.groundHeight(fire.x, fire.z),
        shape: heapFireShape(fire.scale),
        heading: { x: Math.cos(fire.yaw), z: Math.sin(fire.yaw) },
        flames: [],
        state: null,
      });
      bySquare.set(fire.square, list);
    }
    this.squares = [...bySquare.values()].map((heaps) => {
      const xs = heaps.map((h) => h.fire.x);
      const zs = heaps.map((h) => h.fire.z);
      const ys = heaps.map((h) => h.ground);
      return {
        heaps: heaps.slice(0, SLASH_HEAPS_MAX),
        bounds: new BoundingInfo(
          new Vector3(
            Math.min(...xs) - FIRE_SIDE_M,
            Math.min(...ys) - 0.5,
            Math.min(...zs) - FIRE_SIDE_M,
          ),
          new Vector3(
            Math.max(...xs) + FIRE_SIDE_M,
            Math.max(...ys) + FIRE_UP_M,
            Math.max(...zs) + FIRE_SIDE_M,
          ),
        ),
        distance: 0,
      };
    });
    if (this.squares.length > 0) this.ensureSprites();
    return true;
  }

  /**
   * Ohně na okamžik `nowMs` (skutečný čas – pálení jde podle herního dne): čtverce s ohněm nebo
   * žárem v záběru `camera`, nejbližší napřed, nejvýš MAX_FIRE_SQUARES. Bez kamery prvních
   * MAX_FIRE_SQUARES čtverců. Vrátí true, když je co překreslit.
   */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.squares.length === 0 && this.used === 0) return false;
    const gameDay = gameDayAt(nowMs, this.world);
    const timeS = nowMs / 1000;
    const lit = this.lit;
    lit.length = 0;
    for (const square of this.squares) {
      square.distance = 0;
      if (camera) {
        if (!camera.isInFrustum(square.bounds)) continue;
        const center = square.bounds.boundingSphere.centerWorld;
        square.distance = Vector3.Distance(camera.globalPosition, center);
        if (square.distance > ANIMATE_RANGE_M) continue;
      }
      let burning = false;
      for (const heap of square.heaps) {
        const state = clearingFireState(heap.fire.burn, gameDay, heap.fire.order);
        heap.state = state;
        if (state.fire > 0 || state.glow > 0) burning = true;
      }
      if (burning) lit.push(square);
    }
    lit.sort(byDistance);
    let slot = 0;
    const shown = Math.min(lit.length, MAX_FIRE_SQUARES);
    for (let n = 0; n < shown; n++) {
      for (const heap of lit[n]!.heaps) {
        const state = heap.state!;
        // hromada sesedá, jak dohořívá – plameny šlehají níž; večer v uhlících ještě problikne
        // pár nízkých plamínků (EMBER_FLAMES × záře)
        const fire = {
          fire: Math.max(state.fire, EMBER_FLAMES * state.glow),
          stack: 0.35 + 0.65 * state.fire,
          glow: state.glow,
        };
        fireSprites(heap.fire.seed, timeS, fire, heap.heading, heap.flames, heap.shape);
        for (const f of heap.flames) {
          const sprite = this.sprites[slot++];
          if (!sprite) break;
          sprite.isVisible = f.intensity > 0.004;
          if (!sprite.isVisible) continue;
          sprite.position.set(heap.fire.x + f.dx, heap.ground + f.dy, heap.fire.z + f.dz);
          sprite.width = f.width;
          sprite.height = f.height;
          sprite.angle = f.angle;
          sprite.cellIndex = f.cell;
          sprite.color.set(1, 1, 1, Math.min(1, f.intensity));
        }
      }
    }
    for (let i = slot; i < this.used; i++) this.sprites[i]!.isVisible = false;
    const changed = slot > 0 || this.used > 0;
    this.used = slot;
    return changed;
  }

  dispose(): void {
    for (const sprite of this.sprites) sprite.dispose();
    this.sprites = [];
    this.manager?.dispose();
    this.manager = null;
    this.squares = [];
    this.used = 0;
    this.key = '';
  }

  /** Správce a zásoba spritů pro všechny ohně (jednou – kapacita je pevná). */
  private ensureSprites(): void {
    if (this.manager) return;
    const manager = new SpriteManager(
      'clearing-fire',
      FIRE_URL,
      CAPACITY,
      FIRE_CELL_PX,
      this.scene,
    );
    // oheň svítí – sčítá se s tím, co je za ním (barva × krytí)
    manager.blendMode = Constants.ALPHA_ADD;
    manager.disableDepthWrite = true;
    manager.isPickable = false;
    manager.renderingGroupId = SPRITE_RENDERING_GROUP;
    manager.fogEnabled = false;
    this.scene.setRenderingAutoClearDepthStencil(SPRITE_RENDERING_GROUP, false, false, false);
    this.manager = manager;
    this.sprites = Array.from({ length: CAPACITY }, () => {
      const sprite = new Sprite('clearing-fire', manager);
      sprite.isVisible = false;
      return sprite;
    });
  }
}
