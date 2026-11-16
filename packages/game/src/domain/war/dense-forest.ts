import { buildForestField, SURFACE_CODES, type Landscape } from '../landscape';
import type { ClearedForest } from '../village/core/cleared-forest';
import { pointInPolygon } from '../village/placement/polygon';
import type { MarchGeometry } from './march-grid';
import { WAR } from './rules-war';

// Hustý les pro pochod (forest.md – Hustý les): les dál než `WAR.march.denseForestM` od svého
// okraje je neprůchodný, paseky (vymýcená políčka a plochy pod stavbami) ho od sebe odříznou –
// do `denseForestM` od paseky les hustý není. Vnitřek lesa je vrstva po buňkách mřížky pochodu
// (1 = vnitřek), počítá se jednou na krajinu a velikost buňky; paseky ji jen ubírají. Počítá
// server i prohlížeč – jen celočíselná matematika (bez Math.sin/cos/hypot).

/** Vnitřky lesa po krajinách a velikostech buňky (krajina se nemění – vrstva platí stále). */
const interiorCache = new WeakMap<Landscape, Map<number, Uint8Array>>();

/**
 * Vnitřek lesa v buňkách mřížky: 1 = vzdálenost středu buňky od okraje lesa je větší než
 * `WAR.march.denseForestM`. Pole lesa je bilineární mezi body sítě, takže čtverec sítě se všemi
 * rohy nad mezí je vnitřek celý a se všemi pod mezí není vnitřkem nikde – přesný dotaz se
 * ptá jen u čtverců s rohy na obou stranách (výsledek se neliší od dotazu u každé buňky).
 */
export function forestInterior(l: Landscape, geo: MarchGeometry): Uint8Array {
  let bySize = interiorCache.get(l);
  if (!bySize) {
    bySize = new Map();
    interiorCache.set(l, bySize);
  }
  const known = bySize.get(geo.cellM);
  if (known) return known;
  const result = computeInterior(l, geo);
  bySize.set(geo.cellM, result);
  return result;
}

function computeInterior(l: Landscape, geo: MarchGeometry): Uint8Array {
  // krajina bez lesního políčka les nemá (maska 0, šum ji nad hranici 0,5 nezvedne) – pole lesa
  // se nestaví
  if (!l.surface.includes(SURFACE_CODES.forest)) return new Uint8Array(geo.width * geo.height);
  const limit = WAR.march.denseForestM;
  const field = buildForestField(l, { remember: false });
  const n = field.resolution;
  const extent = l.size * l.cellSizeM;
  const step = extent / n;
  const dist = field.distance;
  const quads = n - 1;
  const hi = limit + 1e-4;
  const lo = limit - 1e-4;
  // 1 = čtverec sítě celý nad mezí, 0 = celý pod ní, 2 = rozhodne přesný dotaz
  const quadClass = new Uint8Array(quads * quads);
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      const a = dist[j * n + i]!;
      const b = dist[j * n + i + 1]!;
      const c = dist[(j + 1) * n + i]!;
      const d = dist[(j + 1) * n + i + 1]!;
      quadClass[j * quads + i] =
        a > hi && b > hi && c > hi && d > hi ? 1 : a < lo && b < lo && c < lo && d < lo ? 0 : 2;
    }
  }
  const quadOf = (v: number): number =>
    Math.min(n - 2, Math.floor(Math.min(n - 1, Math.max(0, (v + extent / 2) / step - 0.5))));
  const interior = new Uint8Array(geo.width * geo.height);
  for (let j = 0; j < geo.height; j++) {
    const z = geo.originZ + j * geo.cellM;
    const row = quadOf(z) * quads;
    for (let i = 0; i < geo.width; i++) {
      const x = geo.originX + i * geo.cellM;
      const cls = quadClass[row + quadOf(x)]!;
      if (cls === 1 || (cls === 2 && field.distanceAt(x, z) > limit)) {
        interior[j * geo.width + i] = 1;
      }
    }
  }
  return interior;
}

/**
 * Vnitřek lesa bez pasek: buňka se středem do `WAR.march.denseForestM` od vymýceného políčka
 * (čtverec) nebo plochy pod stavbou (mnohoúhelník) hustým lesem není. Bez pasek vrátí týž objekt,
 * jinak kopii. Paseky se nejdřív převedou na buňky (střed buňky uvnitř) a pak se každá
 * obtiskne kruhem o poloměru meze v buňkách (`dx² + dy² ≤ r²`, celá čísla).
 */
export function withoutClearings(
  interior: Uint8Array,
  geo: MarchGeometry,
  cleared: ClearedForest,
): Uint8Array {
  if (cleared.tiles.length === 0 && cleared.areas.length === 0) return interior;
  const { width, height, cellM } = geo;
  const marked = new Uint8Array(width * height);
  const markBox = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    inside: (x: number, z: number) => boolean,
  ): void => {
    const i0 = Math.max(0, Math.ceil((minX - geo.originX) / cellM));
    const i1 = Math.min(width - 1, Math.floor((maxX - geo.originX) / cellM));
    const j0 = Math.max(0, Math.ceil((minZ - geo.originZ) / cellM));
    const j1 = Math.min(height - 1, Math.floor((maxZ - geo.originZ) / cellM));
    for (let j = j0; j <= j1; j++) {
      const z = geo.originZ + j * cellM;
      for (let i = i0; i <= i1; i++) {
        if (inside(geo.originX + i * cellM, z)) marked[j * width + i] = 1;
      }
    }
  };
  const half = (cleared.size * cleared.cellSizeM) / 2;
  for (const tile of cleared.tiles) {
    const minX = -half + (tile % cleared.size) * cleared.cellSizeM;
    const minZ = -half + Math.floor(tile / cleared.size) * cleared.cellSizeM;
    markBox(minX, minX + cleared.cellSizeM, minZ, minZ + cleared.cellSizeM, () => true);
  }
  for (const area of cleared.areas) {
    const xs = area.map((p) => p[0]);
    const zs = area.map((p) => p[1]);
    markBox(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), (x, z) =>
      pointInPolygon([x, z], area),
    );
  }
  // kruh meze v buňkách: posuny (dx, dy) s dx² + dy² ≤ r²
  const reach = WAR.march.denseForestM / cellM;
  const r2 = Math.floor(reach * reach + 1e-9);
  const span = Math.floor(reach + 1e-9);
  const offsets: number[] = [];
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      if (dx * dx + dy * dy <= r2) offsets.push(dx, dy);
    }
  }
  const result = interior.slice();
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (!marked[j * width + i]) continue;
      for (let k = 0; k < offsets.length; k += 2) {
        const x = i + offsets[k]!;
        const y = j + offsets[k + 1]!;
        if (x >= 0 && y >= 0 && x < width && y < height) result[y * width + x] = 0;
      }
    }
  }
  return result;
}
