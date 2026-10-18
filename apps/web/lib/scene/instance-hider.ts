import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { staticInstancesOf, type StaticInstances } from './instanced-model';
import { hiddenMask, type HideShape } from './village-layout';

interface Tracked extends StaticInstances {
  mesh: Mesh;
  /** Pata instance x, z po dvojicích. */
  positions: Float32Array;
  /** Podpis právě skrytých instancí – při beze změny se buffer neposílá znovu. */
  hidden: string;
}

/**
 * Skrývá instance stromů, keřů a kamenů (thin instances). Překážky z vrstvy překážek (instance
 * s id) zmizí, když je ves odstranila nebo vykácela – podle id ze stavu vsi, stejně jako je
 * počítá server. Ozdoby bez id (rákos u pole) zmizí pod stavbami a poli podle tvaru. Vybrané
 * překážky jde i zvětšit (posvátné duby postupně rostou – `scales`). Pamatuje si původní
 * instance, takže jde skrytí i zvětšení kdykoli vrátit.
 */
export class InstanceHider {
  private readonly tracked: Tracked[] = [];

  /** Zaznamená meshe s nehybnými instancemi (`setStaticInstances`) po načtení krajiny. */
  track(meshes: readonly Mesh[]): void {
    for (const mesh of meshes) {
      const instances = staticInstancesOf(mesh);
      if (!instances || this.tracked.some((t) => t.mesh === mesh)) continue;
      const count = instances.matrices.length / 16;
      const positions = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        positions[i * 2] = instances.matrices[i * 16 + 12]!;
        positions[i * 2 + 1] = instances.matrices[i * 16 + 14]!;
      }
      this.tracked.push({ mesh, ...instances, positions, hidden: '' });
    }
  }

  /**
   * Skryje překážky s id v `hiddenIds` a ozdoby bez id v oblastech `shapes`, ostatní vrátí;
   * překážky s id v `scales` zvětší kolem paty (násobek velikosti). Vrátí true, když se něco
   * změnilo.
   */
  apply(
    shapes: readonly HideShape[],
    hiddenIds: ReadonlySet<number>,
    scales: ReadonlyMap<number, number> = NO_SCALES,
  ): boolean {
    let changed = false;
    for (const t of this.tracked) {
      if (t.mesh.isDisposed()) continue;
      const mask = t.ids ? idMask(t.ids, hiddenIds) : hiddenMask(t.positions, shapes);
      const hiddenIndices: number[] = [];
      mask.forEach((hide, i) => {
        if (hide) hiddenIndices.push(i);
      });
      const scaled = t.ids ? scaledInstances(t.ids, scales) : [];
      const signature = `${hiddenIndices.join(',')}|${scaled.map(([i, s]) => `${i}:${s}`).join(',')}`;
      if (signature === t.hidden) continue;
      t.hidden = signature;
      changed = true;
      const visible = mask.length - hiddenIndices.length;
      if (visible === 0) {
        // Bez instancí by Babylon vykreslil samotný model v počátku – mesh se jen vypne.
        t.mesh.setEnabled(false);
        continue;
      }
      const matrices = scaled.length > 0 ? scaledMatrices(t.matrices, scaled) : t.matrices;
      t.mesh.thinInstanceSetBuffer('matrix', keepVisible(matrices, mask, 16), 16, true);
      if (t.colors) t.mesh.thinInstanceSetBuffer('color', keepVisible(t.colors, mask, 4), 4, true);
      t.mesh.setEnabled(true);
    }
    return changed;
  }
}

const NO_SCALES: ReadonlyMap<number, number> = new Map();

/** Instance se zvětšením: [index, násobek] (jen násobky různé od 1). */
function scaledInstances(
  ids: Uint32Array,
  scales: ReadonlyMap<number, number>,
): [number, number][] {
  if (scales.size === 0) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < ids.length; i++) {
    const scale = scales.get(ids[i]!);
    if (scale !== undefined && scale !== 1) out.push([i, scale]);
  }
  return out;
}

/**
 * Kopie matic instancí se zvětšenými instancemi – násobí se jen otočení a měřítko (prvních 3 × 3),
 * posun zůstane, takže instance roste kolem své paty (počátek modelu stromu je u paty kmene).
 */
export function scaledMatrices(
  matrices: Float32Array,
  scaled: readonly [number, number][],
): Float32Array {
  const out = matrices.slice();
  for (const [i, scale] of scaled) {
    for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) out[i * 16 + k]! *= scale;
  }
  return out;
}

/** 1 = instance s id ze skrytých. */
function idMask(ids: Uint32Array, hiddenIds: ReadonlySet<number>): Uint8Array {
  const mask = new Uint8Array(ids.length);
  if (hiddenIds.size === 0) return mask;
  for (let i = 0; i < ids.length; i++) if (hiddenIds.has(ids[i]!)) mask[i] = 1;
  return mask;
}

/** Hodnoty instancí (`stride` čísel na instanci) bez skrytých; beze skrytých původní pole. */
function keepVisible(values: Float32Array, mask: Uint8Array, stride: number): Float32Array {
  let visible = 0;
  for (const hide of mask) if (!hide) visible++;
  if (visible === mask.length) return values;
  const out = new Float32Array(visible * stride);
  let k = 0;
  mask.forEach((hide, i) => {
    if (hide) return;
    out.set(values.subarray(i * stride, i * stride + stride), k * stride);
    k++;
  });
  return out;
}
