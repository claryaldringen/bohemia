import type { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * Sběrač obalu pohybujících se postav (vozy, spřežení): bere body trasy na zemi a z nich s výškou
 * terénu pod nimi složí kvádr pro ořez podle záběru kamery. Čistá pomůcka scény.
 */
export class GroundBox {
  private minX = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxZ = -Infinity;
  private low = Infinity;
  private high = -Infinity;

  constructor(private readonly groundHeight: (x: number, z: number) => number) {}

  extend(x: number, z: number): void {
    this.minX = Math.min(this.minX, x);
    this.maxX = Math.max(this.maxX, x);
    this.minZ = Math.min(this.minZ, z);
    this.maxZ = Math.max(this.maxZ, z);
    const y = this.groundHeight(x, z);
    this.low = Math.min(this.low, y);
    this.high = Math.max(this.high, y);
  }

  /** Nastaví `bounds` na sebraný kvádr s okrajem `pad` do stran a `headRoom` nad nejvyšším bodem; bez bodů nic. */
  applyTo(bounds: BoundingInfo, pad: number, headRoom: number): void {
    if (this.minX > this.maxX) return;
    bounds.reConstruct(
      new Vector3(this.minX - pad, this.low - 1, this.minZ - pad),
      new Vector3(this.maxX + pad, this.high + headRoom, this.maxZ + pad),
    );
  }
}
