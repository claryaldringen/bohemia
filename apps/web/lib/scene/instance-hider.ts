import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { hiddenMask, type HideShape } from './village-layout';

interface Tracked {
  mesh: Mesh;
  /** Původní matice všech instancí (16 čísel na instanci). */
  matrices: Float32Array;
  /** Pata instance x, z po dvojicích. */
  positions: Float32Array;
  /** Podpis právě skrytých instancí – při beze změny se buffer neposílá znovu. */
  hidden: string;
}

/**
 * Skrývá instance stromů a dekorací (thin instances) pod stavbami a poli vsi – prototyp:
 * překážky zmizí bez ceny navíc. Pamatuje si původní matice, takže jde skrytí kdykoli vrátit.
 */
export class InstanceHider {
  private readonly tracked: Tracked[] = [];

  /** Zaznamená meshe s thin instancemi (volat po načtení modelů krajiny). */
  track(meshes: readonly Mesh[]): void {
    for (const mesh of meshes) {
      const count = mesh.thinInstanceCount;
      if (count <= 0 || this.tracked.some((t) => t.mesh === mesh)) continue;
      const matrices = new Float32Array(count * 16);
      const positions = new Float32Array(count * 2);
      mesh.thinInstanceGetWorldMatrices().forEach((matrix, i) => {
        matrix.copyToArray(matrices, i * 16);
        positions[i * 2] = matrices[i * 16 + 12]!;
        positions[i * 2 + 1] = matrices[i * 16 + 14]!;
      });
      this.tracked.push({ mesh, matrices, positions, hidden: '' });
    }
  }

  /** Skryje instance v oblastech, ostatní vrátí. Vrátí true, když se něco změnilo. */
  apply(shapes: readonly HideShape[]): boolean {
    let changed = false;
    for (const t of this.tracked) {
      if (t.mesh.isDisposed()) continue;
      const mask = hiddenMask(t.positions, shapes);
      const hiddenIndices: number[] = [];
      mask.forEach((hide, i) => {
        if (hide) hiddenIndices.push(i);
      });
      const signature = hiddenIndices.join(',');
      if (signature === t.hidden) continue;
      t.hidden = signature;
      changed = true;
      const visible = mask.length - hiddenIndices.length;
      if (visible === 0) {
        // Bez instancí by Babylon vykreslil samotný model v počátku – mesh se jen vypne.
        t.mesh.setEnabled(false);
        continue;
      }
      const matrices =
        hiddenIndices.length === 0 ? t.matrices.slice() : new Float32Array(visible * 16);
      if (hiddenIndices.length > 0) {
        let k = 0;
        mask.forEach((hide, i) => {
          if (hide) return;
          matrices.set(t.matrices.subarray(i * 16, i * 16 + 16), k * 16);
          k++;
        });
      }
      t.mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
      t.mesh.setEnabled(true);
    }
    return changed;
  }
}
