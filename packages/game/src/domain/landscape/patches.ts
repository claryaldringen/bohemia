import { SURFACE_CODES } from './types';

// Souvislé celky políček (4-sousedství) a úklid drobných skvrn povrchu – sdílí vegetace a prémiový
// průchod (premium-landscapes.md). Vlastní modul bez závislosti na pásmu (`band.ts`), ať ho
// prémiový průchod může použít bez cyklu importů.

const { forest: FOREST, meadow: MEADOW } = SURFACE_CODES;

export const MIN_FOREST_PATCH = 4;
export const MIN_MEADOW_PATCH = 4;

/** Osamělé skvrny louky v lese menší než MIN_MEADOW_PATCH políček zarostou lesem (verze 2). */
export function removeSmallMeadowPatches(surface: Uint8Array, size: number): void {
  for (const patch of patches(surface, size, MEADOW)) {
    if (patch.length < MIN_MEADOW_PATCH) for (const i of patch) surface[i] = FOREST;
  }
}

/** 4-souvislé celky políček s daným povrchem (nebo s hodnotou masky). */
export function patches(surface: Uint8Array, size: number, code: number): number[][] {
  const seen = new Uint8Array(surface.length);
  const result: number[][] = [];
  for (let start = 0; start < surface.length; start++) {
    if (surface[start] !== code || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (surface[n] === code && !seen[n]) {
          seen[n] = 1;
          patch.push(n);
        }
      }
    }
    result.push(patch);
  }
  return result;
}

/** Lesní ostrůvky menší než MIN_FOREST_PATCH políček se stanou loukou. */
export function removeSmallForestPatches(surface: Uint8Array, size: number): void {
  const seen = new Uint8Array(surface.length);
  for (let start = 0; start < surface.length; start++) {
    if (surface[start] !== FOREST || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (surface[n] === FOREST && !seen[n]) {
          seen[n] = 1;
          patch.push(n);
        }
      }
    }
    if (patch.length < MIN_FOREST_PATCH) for (const i of patch) surface[i] = MEADOW;
  }
}
