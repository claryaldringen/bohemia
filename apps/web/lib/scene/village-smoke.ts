import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { OFFICIAL_WORLD, type WorldClock } from '@bohemia/game';
import type { Rgb } from './season-look';
import {
  PUFFS_PER_PLUME,
  clearingFireState,
  gameDayAt,
  gameDaySeconds,
  plumePuffs,
  plumeReach,
  plumeShape,
  ventSmokeStrength,
  type ClearingBurn,
  type Puff,
  type SmokeKind,
} from './smoke-schedule';

/**
 * Zdroj dýmu ve světě scény; `seed` = vlastní rozvrh ohně (dýmník obydlí – id obydlí). `kind`
 * = dýmník obydlí (bez údaje), pec nebo výheň dílny, milíř, nebo pálení paseky (`slash` – síla
 * podle pálení dílu `burn`, clearingFireState; smoke-schedule.ts).
 */
export interface SmokeSource {
  seed: number;
  x: number;
  y: number;
  z: number;
  kind?: SmokeKind;
  burn?: ClearingBurn;
}

/**
 * Kouř se kreslí až po krajině (skupina vykreslování bez mazání hloubky, jako ryby) – obtisky
 * na zemi, kreslené průhledně až po spritech, by jinak přes kouř přemalovaly.
 */
const SMOKE_RENDERING_GROUP = 1;
/** Velikost textury obláčku (smoke_128b z 0 A.D.). */
const CELL_PX = 128;
/** Nejvyšší krytí obláčku (textura je sama řídká). */
const MAX_ALPHA = 0.85;
/** Dál od kamery (m) se kouř nehýbe – jako zvířata. */
const ANIMATE_RANGE_M = 1500;

interface Plume {
  source: SmokeSource;
  bounds: BoundingInfo;
  sprites: Sprite[];
  puffs: Puff[];
  visible: boolean;
}

/**
 * Dým z obydlí v duchu 0 A.D. (smoke_light): sloupec obláčků (sprity), který stoupá z dýmníku,
 * vítr ho odnáší a rozplývá se. Kdy se topí, určuje rozvrh ohně podle herního dne
 * (smoke-schedule.ts) – deterministicky, ne náhodou za snímku. `animate` posune jen dým
 * v záběru; při omezeném pohybu se nevolá a dým zůstane stát.
 */
export class VillageSmoke {
  private manager: SpriteManager | null = null;
  private capacity = 0;
  private plumes: Plume[] = [];
  private always = false;
  private world: WorldClock = OFFICIAL_WORLD;
  /** Den a noc: dým je bez světla – v soumraku a v noci se přibarví (day-light.ts, tón). */
  private tone: Rgb = [1, 1, 1];

  constructor(
    private readonly scene: Scene,
    private readonly textureUrl: string,
  ) {}

  /** Dýmníky hotových obydlí; vrátí true, když se změnily. */
  setSources(sources: readonly SmokeSource[]): boolean {
    const key = (s: SmokeSource): string =>
      `${s.seed}|${s.x}|${s.y}|${s.z}|${s.kind ?? ''}|${s.burn ? (s.burn.burnedDay ?? 'b') : ''}`;
    if (
      sources.length === this.plumes.length &&
      sources.every((s, i) => key(s) === key(this.plumes[i]!.source))
    ) {
      return false;
    }
    for (const plume of this.plumes) for (const sprite of plume.sprites) sprite.dispose();
    this.plumes = [];
    if (sources.length === 0) return true;
    const shapes = sources.map((s) => plumeShape(s.kind ?? 'hearth'));
    const manager = this.ensureManager(shapes.reduce((sum, shape) => sum + shape.puffs, 0));
    this.plumes = sources.map((source, i) => {
      const shape = shapes[i]!;
      const sprites = Array.from({ length: shape.puffs }, () => {
        const sprite = new Sprite('village-smoke-puff', manager);
        sprite.isVisible = false;
        return sprite;
      });
      const { up, side } = plumeReach(shape);
      return {
        source,
        bounds: new BoundingInfo(
          new Vector3(source.x - side, source.y - 0.5, source.z - side),
          new Vector3(source.x + side, source.y + up, source.z + side),
        ),
        sprites,
        puffs: [],
        visible: false,
      };
    });
    return true;
  }

  /** Vývojová volba: kouří ze všech hotových obydlí pořád. */
  setAlways(enabled: boolean): void {
    this.always = enabled;
  }

  setWorldClock(world: WorldClock): void {
    this.world = world;
  }

  /** Tón denní doby (bílá = přes den) – obláčky se přebarví při dalším posunu dýmu. */
  setTone(tone: Rgb): void {
    this.tone = tone;
  }

  /**
   * Posune dým v záběru `camera` na okamžik `nowMs` (skutečný čas – rozvrh ohně jde podle
   * herního dne). Vrátí true, když se v záběru něco změnilo (je co překreslit). Bez kamery
   * přepočítá všechen dým (po změně vsi – při omezeném pohybu pak dým stojí, ale je vidět).
   */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.plumes.length === 0) return false;
    const day = gameDayAt(nowMs, this.world);
    const daySeconds = gameDaySeconds(this.world);
    const timeS = nowMs / 1000;
    let changed = false;
    for (const plume of this.plumes) {
      if (camera) {
        if (!camera.isInFrustum(plume.bounds)) continue;
        const center = plume.bounds.boundingSphere.centerWorld;
        if (Vector3.Distance(camera.globalPosition, center) > ANIMATE_RANGE_M) continue;
      }
      const { seed, x, y, z, burn } = plume.source;
      const kind = plume.source.kind ?? 'hearth';
      const strengthAt = this.always
        ? (): number => 1
        : burn
          ? (ageS: number): number => clearingFireState(burn, day - ageS / daySeconds).smoke
          : (ageS: number): number => ventSmokeStrength(kind, seed, day - ageS / daySeconds);
      plumePuffs(seed, timeS, strengthAt, plume.puffs, plumeShape(kind));
      let visible = false;
      plume.puffs.forEach((puff, i) => {
        const sprite = plume.sprites[i]!;
        const alpha = puff.alpha * MAX_ALPHA;
        sprite.isVisible = alpha > 0.004;
        if (!sprite.isVisible) return;
        visible = true;
        sprite.position.set(x + puff.dx, y + puff.dy, z + puff.dz);
        sprite.width = puff.size;
        sprite.height = puff.size;
        sprite.angle = puff.angle;
        // šedomodrý dým ze dřeva, výš světlejší
        const shade = puff.shade + 0.08 * Math.min(1, puff.dy / 8);
        const [r, g, b] = this.tone;
        sprite.color.set(shade * 0.96 * r, shade * 0.97 * g, shade * b, alpha);
      });
      if (visible || plume.visible) changed = true;
      plume.visible = visible;
    }
    return changed;
  }

  dispose(): void {
    for (const plume of this.plumes) for (const sprite of plume.sprites) sprite.dispose();
    this.plumes = [];
    this.manager?.dispose();
    this.manager = null;
  }

  private ensureManager(needed: number): SpriteManager {
    if (this.manager && needed <= this.capacity) return this.manager;
    this.manager?.dispose();
    this.capacity = Math.max(needed, 16 * PUFFS_PER_PLUME);
    const manager = new SpriteManager(
      'village-smoke',
      this.textureUrl,
      this.capacity,
      CELL_PX,
      this.scene,
    );
    manager.renderingGroupId = SMOKE_RENDERING_GROUP;
    manager.disableDepthWrite = true;
    manager.isPickable = false;
    this.scene.setRenderingAutoClearDepthStencil(SMOKE_RENDERING_GROUP, false, false, false);
    this.manager = manager;
    return manager;
  }
}
