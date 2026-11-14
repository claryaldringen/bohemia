import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  RAIN_DROPS,
  RAIN_LOOK,
  dropPosition,
  dropSeeds,
  rainBox,
  streakLength,
  type DropLook,
} from './rain';

/** Déšť se kreslí po krajině (jako kouř) – průhledné čárky přes obtisky na zemi. */
const RAIN_RENDERING_GROUP = 1;
/** Barva a krytí čárek (šedobílé, skoro průhledné). */
const STREAK_COLOR = new Color3(0.78, 0.81, 0.85);
const STREAK_ALPHA = 0.26;

/**
 * Druh částic: déšť (výchozí), nebo kroupy (storm-renderer.ts) – jméno meshe, barva, krytí,
 * počet při plné síle, pád a tvar čárky; `area` – částice jen tam, kde vrátí true (pruh krup).
 */
export interface DropKind {
  name: string;
  color: Color3;
  alpha: number;
  count: number;
  look: DropLook;
}

const RAIN_KIND: DropKind = {
  name: 'rain',
  color: STREAK_COLOR,
  alpha: STREAK_ALPHA,
  count: RAIN_DROPS,
  look: RAIN_LOOK,
};

/**
 * Částice deště (disasters.md – Ve scéně, Deštivé léto): jeden mesh čárky s instancemi (jeden
 * draw call) v kvádru kolem cíle kamery – velikost kvádru roste se vzdáleností kamery, ať je
 * déšť vidět z blízka i z dálky. Bez deště je mesh vypnutý (žádný draw call navíc). Kapky padají
 * jen v taktu animací (`animate` z `LandscapeScene.animate`) – při omezeném pohybu stojí.
 */
export class RainRenderer {
  private readonly mesh: Mesh;
  private readonly matrices: Float32Array;
  private readonly seeds: Float32Array;
  private readonly drop: [number, number, number] = [0, 0, 0];
  private amount = 0;
  /** Čas minulého posunu (s); null = první posun po zapnutí deště (základní délka čárky). */
  private lastSeconds: number | null = null;
  private area: ((x: number, z: number) => boolean) | null = null;

  constructor(
    scene: Scene,
    private readonly kind: DropKind = RAIN_KIND,
  ) {
    this.matrices = new Float32Array(kind.count * 16);
    this.seeds = dropSeeds(kind.count);
    const mesh = new Mesh(kind.name, scene);
    const quad = new VertexData();
    // čárka: šířka podél x (−0,5…0,5), délka podél y (0…1) – pata je kapka, nad ní stopa
    quad.positions = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
    quad.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    quad.indices = [0, 1, 2, 0, 2, 3];
    quad.applyToMesh(mesh);
    const material = new StandardMaterial(kind.name, scene);
    material.disableLighting = true;
    material.emissiveColor = kind.color;
    material.alpha = kind.alpha;
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
    if (amount <= 0) this.lastSeconds = null;
    this.amount = amount;
    this.mesh.thinInstanceCount = Math.round(this.kind.count * amount);
    this.mesh.setEnabled(amount > 0);
    return true;
  }

  get raining(): boolean {
    return this.amount > 0;
  }

  /** Částice jen tam, kde `area` vrátí true (null = všude); platí od dalšího `animate`. */
  setArea(area: ((x: number, z: number) => boolean) | null): void {
    this.area = area;
  }

  /**
   * Posune kapky na čas `seconds` kolem cíle kamery (země pod cílem `target.y`); čárky natočí
   * ke kameře. Vrátí true, když prší (scénu je třeba překreslit).
   */
  animate(seconds: number, target: Vector3, eye: Vector3, radius: number): boolean {
    if (this.amount <= 0) return false;
    const { look } = this.kind;
    const box = rainBox(radius, look);
    let dx = eye.x - target.x;
    let dz = eye.z - target.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const m = this.matrices;
    const count = this.mesh.thinInstanceCount;
    const length = streakLength(
      box,
      look,
      this.lastSeconds === null ? 0 : seconds - this.lastSeconds,
    );
    this.lastSeconds = seconds;
    for (let i = 0; i < count; i++) {
      dropPosition(this.seeds, i, seconds, target, box, this.drop, look);
      const o = i * 16;
      if (this.area && !this.area(this.drop[0], this.drop[2])) {
        // mimo oblast (pruh krup) – nulová matice, částice se nevykreslí
        m.fill(0, o, o + 16);
        continue;
      }
      // osa x – šířka čárky napříč pohledem, osa y – stopa proti směru pádu (šikmo po větru)
      m[o] = -dz * box.width;
      m[o + 1] = 0;
      m[o + 2] = dx * box.width;
      m[o + 4] = -look.wind[0] * length;
      m[o + 5] = length;
      m[o + 6] = -look.wind[1] * length;
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
