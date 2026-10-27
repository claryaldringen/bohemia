import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import { RAIN_DROPS, RAIN_WIND, dropPosition, dropSeeds, rainBox } from './rain';

/** Déšť se kreslí po krajině (jako kouř) – průhledné čárky přes obtisky na zemi. */
const RAIN_RENDERING_GROUP = 1;
/** Barva a krytí čárek (šedobílé, skoro průhledné). */
const STREAK_COLOR = new Color3(0.78, 0.81, 0.85);
const STREAK_ALPHA = 0.26;

/**
 * Částice deště (disasters.md – Ve scéně, Deštivé léto): jeden mesh čárky s instancemi (jeden
 * draw call) v kvádru kolem cíle kamery – velikost kvádru roste se vzdáleností kamery, ať je
 * déšť vidět z blízka i z dálky. Bez deště je mesh vypnutý (žádný draw call navíc). Kapky padají
 * jen v taktu animací (`animate` z `LandscapeScene.animate`) – při omezeném pohybu stojí.
 */
export class RainRenderer {
  private readonly mesh: Mesh;
  private readonly matrices = new Float32Array(RAIN_DROPS * 16);
  private readonly seeds = dropSeeds(RAIN_DROPS);
  private readonly drop: [number, number, number] = [0, 0, 0];
  private amount = 0;

  constructor(scene: Scene) {
    const mesh = new Mesh('rain', scene);
    const quad = new VertexData();
    // čárka: šířka podél x (−0,5…0,5), délka podél y (0…1) – pata je kapka, nad ní stopa
    quad.positions = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
    quad.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    quad.indices = [0, 1, 2, 0, 2, 3];
    quad.applyToMesh(mesh);
    const material = new StandardMaterial('rain', scene);
    material.disableLighting = true;
    material.emissiveColor = STREAK_COLOR;
    material.alpha = STREAK_ALPHA;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.renderingGroupId = RAIN_RENDERING_GROUP;
    // kvádr je vždy kolem cíle kamery – obal by se jen přepočítával
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    mesh.thinInstanceCount = 0;
    mesh.setEnabled(false);
    this.mesh = mesh;
  }

  /** Síla deště 0–1 – kolik kapek padá; 0 mesh vypne. Vrátí true, když se něco změnilo. */
  setAmount(amount: number): boolean {
    if (amount === this.amount) return false;
    this.amount = amount;
    this.mesh.thinInstanceCount = Math.round(RAIN_DROPS * amount);
    this.mesh.setEnabled(amount > 0);
    return true;
  }

  get raining(): boolean {
    return this.amount > 0;
  }

  /**
   * Posune kapky na čas `seconds` kolem cíle kamery (země pod cílem `target.y`); čárky natočí
   * ke kameře. Vrátí true, když prší (scénu je třeba překreslit).
   */
  animate(seconds: number, target: Vector3, eye: Vector3, radius: number): boolean {
    if (this.amount <= 0) return false;
    const box = rainBox(radius);
    let dx = eye.x - target.x;
    let dz = eye.z - target.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const m = this.matrices;
    const count = this.mesh.thinInstanceCount;
    const length = box.streak;
    for (let i = 0; i < count; i++) {
      dropPosition(this.seeds, i, seconds, target, box, this.drop);
      const o = i * 16;
      // osa x – šířka čárky napříč pohledem, osa y – stopa proti směru pádu (šikmo po větru)
      m[o] = -dz * box.width;
      m[o + 1] = 0;
      m[o + 2] = dx * box.width;
      m[o + 4] = -RAIN_WIND[0] * length;
      m[o + 5] = length;
      m[o + 6] = -RAIN_WIND[1] * length;
      m[o + 8] = dx;
      m[o + 9] = 0;
      m[o + 10] = dz;
      m[o + 12] = this.drop[0];
      m[o + 13] = target.y + this.drop[1];
      m[o + 14] = this.drop[2];
      m[o + 15] = 1;
    }
    this.mesh.thinInstanceBufferUpdated('matrix');
    return true;
  }

  dispose(): void {
    this.mesh.material?.dispose();
    this.mesh.dispose();
  }
}
