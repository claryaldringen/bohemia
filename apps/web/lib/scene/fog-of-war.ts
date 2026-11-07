// Mlha války (war.md – Mlha války, Ve scéně): útočník na cizí mapě vidí, kam dohlédnou jeho muži
// (≈ 150 m, z lesa a do lesa 50 m – `WAR.sight`), objevené zůstane šeré a dění v něm nevidí.
// Bez Babylonu: mřížka mapy po čtvercích (výchozí 10 m jako mřížka pochodu), objevené jako bajty,
// dohled taktu a průhlednost závoje pro texturu (fog-veil.ts – jeden mesh, žádný vertex buffer
// navíc; postava jich má právě 8).
import { WAR } from '@bohemia/game';

/** Mlha jedné mapy: čtverec `size × size` buněk po `cellM` od rohu (`minX`, `minZ`). */
export interface FogGrid {
  minX: number;
  minZ: number;
  cellM: number;
  size: number;
  /** Objevené buňky (1) – zůstávají. */
  explored: Uint8Array;
}

/** Kdo se dívá: poloha a jestli stojí v lese. */
export interface FogViewer {
  x: number;
  z: number;
  forest: boolean;
}

/** Průhlednost závoje: neobjevené, objevené mimo dohled, v dohledu (0–255). */
export const FOG_ALPHA = { hidden: 205, explored: 110, seen: 0 } as const;

/** Prázdná mlha mapy o hraně `extentM` se středem v počátku. */
export function createFog(extentM: number, cellM = 10): FogGrid {
  const size = Math.max(1, Math.ceil(extentM / cellM));
  return {
    minX: -(size * cellM) / 2,
    minZ: -(size * cellM) / 2,
    cellM,
    size,
    explored: new Uint8Array(size * size),
  };
}

/** Dohled muže (m) – v lese kratší (`WAR.sight`). */
export function sightRadius(forest: boolean): number {
  return forest ? WAR.sight.forestM : WAR.sight.openM;
}

/** Buňka bodu světa (mimo mapu −1). */
export function fogCell(fog: FogGrid, x: number, z: number): number {
  const i = Math.floor((x - fog.minX) / fog.cellM);
  const j = Math.floor((z - fog.minZ) / fog.cellM);
  if (i < 0 || j < 0 || i >= fog.size || j >= fog.size) return -1;
  return j * fog.size + i;
}

/**
 * Dohled taktu: buňky do dohledu kteréhokoli muže (střed buňky v kruhu); `forestAt` zkrátí dohled
 * do lesa. Objevené buňky přibudou do `fog.explored`. Vrátí masku buněk v dohledu (1).
 */
export function revealFog(
  fog: FogGrid,
  viewers: readonly FogViewer[],
  forestAt: (x: number, z: number) => boolean = () => false,
): Uint8Array {
  const seen = new Uint8Array(fog.size * fog.size);
  for (const v of viewers) {
    const r = sightRadius(v.forest);
    const i0 = Math.max(0, Math.floor((v.x - r - fog.minX) / fog.cellM));
    const i1 = Math.min(fog.size - 1, Math.floor((v.x + r - fog.minX) / fog.cellM));
    const j0 = Math.max(0, Math.floor((v.z - r - fog.minZ) / fog.cellM));
    const j1 = Math.min(fog.size - 1, Math.floor((v.z + r - fog.minZ) / fog.cellM));
    for (let j = j0; j <= j1; j++) {
      const cz = fog.minZ + (j + 0.5) * fog.cellM;
      for (let i = i0; i <= i1; i++) {
        const c = j * fog.size + i;
        if (seen[c]) continue;
        const cx = fog.minX + (i + 0.5) * fog.cellM;
        const d2 = (cx - v.x) * (cx - v.x) + (cz - v.z) * (cz - v.z);
        // do lesa jen na dohled z lesa (jádro – `sees`: les u kteréhokoli z obou bodů)
        const reach = v.forest || !forestAt(cx, cz) ? r : WAR.sight.forestM;
        if (d2 > reach * reach) continue;
        seen[c] = 1;
        fog.explored[c] = 1;
      }
    }
  }
  return seen;
}

/** Je bod v dohledu (maska z `revealFog`)? Mimo mapu ne. */
export function fogSees(fog: FogGrid, seen: Uint8Array, x: number, z: number): boolean {
  const c = fogCell(fog, x, z);
  return c >= 0 && seen[c] === 1;
}

/** Průhlednost závoje po buňkách (RGBA, barva šedé mlhy) – textura `size × size`. */
export function fogPixels(fog: FogGrid, seen: Uint8Array, out?: Uint8Array): Uint8Array {
  const n = fog.size * fog.size;
  const px = out ?? new Uint8Array(n * 4);
  for (let c = 0; c < n; c++) {
    const a = seen[c] ? FOG_ALPHA.seen : fog.explored[c] ? FOG_ALPHA.explored : FOG_ALPHA.hidden;
    px[c * 4] = 46;
    px[c * 4 + 1] = 48;
    px[c * 4 + 2] = 54;
    px[c * 4 + 3] = a;
  }
  return px;
}
