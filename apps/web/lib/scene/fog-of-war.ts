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

/**
 * Odkrytí ze stopy výjezdu (journey.md – Scéna cizí mapy; `SeenCell.trail`): body, odkud muži rodu
 * na mapě viděli, odkryjí mlhu stejným dohledem jako muže (`revealFog`) – buňky přibudou do
 * objeveného (šeré), v dohledu nejsou. `done` – klíče bodů už odkrytých, doplní se o nové; další
 * volání s delší stopou tak počítá jen nové body. Vrátí, kolik bodů přibylo.
 */
export function exploreTrail(
  fog: FogGrid,
  trail: readonly (readonly [number, number])[],
  done: Set<string>,
  forestAt: (x: number, z: number) => boolean = () => false,
): number {
  const fresh: FogViewer[] = [];
  for (const [x, z] of trail) {
    const key = `${x},${z}`;
    if (done.has(key)) continue;
    done.add(key);
    fresh.push({ x, z, forest: forestAt(x, z) });
  }
  if (fresh.length > 0) revealFog(fog, fresh, forestAt);
  return fresh.length;
}

/** Je bod v dohledu (maska z `revealFog`)? Mimo mapu ne. */
export function fogSees(fog: FogGrid, seen: Uint8Array, x: number, z: number): boolean {
  const c = fogCell(fog, x, z);
  return c >= 0 && seen[c] === 1;
}

/** Pás podél osy cesty, který závoj nekryje (`SwathBand` bez rozměrů). */
export interface LitBand {
  points: readonly { x: number; z: number }[];
  halfM: number;
}

/**
 * Buňky závoje, které pás cesty zasahuje (1): buňka, jejíž střed je od osy nejvýš `halfM` + půl
 * úhlopříčky buňky – závoj je po buňkách, pás užší než buňka by jinak mezi středy proklouzl.
 * Mimo ně 0.
 */
export function litCells(fog: FogGrid, bands: readonly LitBand[]): Uint8Array {
  const lit = new Uint8Array(fog.size * fog.size);
  for (const band of bands) {
    const reach = band.halfM + fog.cellM * 0.71;
    for (let k = 0; k + 1 < band.points.length; k++) {
      const a = band.points[k]!;
      const b = band.points[k + 1]!;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - fog.minX) / fog.cellM));
      const i1 = Math.min(
        fog.size - 1,
        Math.floor((Math.max(a.x, b.x) + reach - fog.minX) / fog.cellM),
      );
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - fog.minZ) / fog.cellM));
      const j1 = Math.min(
        fog.size - 1,
        Math.floor((Math.max(a.z, b.z) + reach - fog.minZ) / fog.cellM),
      );
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      for (let j = j0; j <= j1; j++) {
        const cz = fog.minZ + (j + 0.5) * fog.cellM;
        for (let i = i0; i <= i1; i++) {
          const cx = fog.minX + (i + 0.5) * fog.cellM;
          const t =
            len2 === 0 ? 0 : Math.min(1, Math.max(0, ((cx - a.x) * dx + (cz - a.z) * dz) / len2));
          const ex = cx - (a.x + dx * t);
          const ez = cz - (a.z + dz * t);
          if (ex * ex + ez * ez <= reach * reach) lit[j * fog.size + i] = 1;
        }
      }
    }
  }
  return lit;
}

/**
 * Průhlednost závoje po buňkách (RGBA, barva šedé mlhy) – textura `size × size`. Buňky `lit`
 * (pokračování stezky na mapě rodu nebo vazala) závoj nekryje.
 */
export function fogPixels(
  fog: FogGrid,
  seen: Uint8Array,
  out?: Uint8Array,
  lit?: Uint8Array | null,
): Uint8Array {
  const n = fog.size * fog.size;
  const px = out ?? new Uint8Array(n * 4);
  for (let c = 0; c < n; c++) {
    const a =
      seen[c] || lit?.[c]
        ? FOG_ALPHA.seen
        : fog.explored[c]
          ? FOG_ALPHA.explored
          : FOG_ALPHA.hidden;
    px[c * 4] = 46;
    px[c * 4 + 1] = 48;
    px[c * 4 + 2] = 54;
    px[c * 4 + 3] = a;
  }
  return px;
}
