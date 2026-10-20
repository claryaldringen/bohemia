import { length2, type Landscape } from '../../landscape';
import { WAGON_ROAD } from '../rules';
import type { Construction, RoadEarthwork, RoadProfilePoint, VillageRoads } from '../types';
import {
  PATH_FOREST,
  PATH_FOREST_COST,
  PATH_SLOPE_MAX,
  PATH_SLOPE_REF,
  PATH_WATER,
  type PathTerrain,
} from './terrain';

// Úpravy terénu jako herní data (roads.md – Vozová cesta, landscape.md – Úpravy terénu; Martin,
// 20. 10. 2026: „Pokud budou překážet svahy, vyhloubí se úvoz nebo udělá násep.“). Vozová cesta
// nese profil osy – body a navržené výšky pláně (`RoadEarthwork.profile`); terén kolem ní je čistá
// funkce profilu: pláň 2 × WAGON_ROAD.flatHalfM v navržené výšce, za ní svah výkopu a náspu
// 1 : 1 (`sideSlope`), dokud nepotká původní terén. Ukládá se jen profil, ne mřížka. Stejná funkce
// upravuje výšky terénu pěšin a vozů (sklon – `withTerrainEdits`) i scény (render-surface) – každý
// se svým „původním“ terénem, pláň vyjde všude přesně v navržené výšce. Jen přesná aritmetika
// (det-math, soubor hlídá ESLint jako síť pěšin), stejně na serveru i v prohlížeči.

/** Kus osy, který upravuje terén – profil a kolik ho je hotové (m od začátku osy). */
export interface EarthworkSpan {
  profile: readonly RoadProfilePoint[];
  /** Indexy bodů profilu v brodu – úsečky u nich terén neupravují (brod zůstává brodem). */
  fords?: readonly number[];
  /** Hotová délka osy od začátku (m) – dál terén zůstane původní. */
  reachedM: number;
}

/**
 * Jak daleko od osy (m) úprava sahá nejvýš: pláň a svah 1 : 1 až k původnímu terénu – do svahu
 * 45 % i s úvozem 3 m se potkají do ≈ 10,5 m (prudší terén pěšiny neprojdou, cesta tam nevede).
 */
export const EARTHWORK_REACH_M = WAGON_ROAD.flatHalfM + 8;
/** Strana přihrádky rejstříku úseček (m). */
const BUCKET_M = 16;
/** Výška se změnila, když se liší víc než tolik (m) – jinak terén zůstane bit po bitu. */
const CHANGED_M = 1e-4;

/** Úpravy terénu – úsečky profilů v přihrádkách. Prázdné = terén beze změny. */
export interface TerrainEdits {
  /** Počet úseček. */
  count: number;
  /** Na úsečku: ax, az, ay, bx, bz, by (m). */
  segments: Float64Array;
  /** Na úsečku: poloha jejího začátku na ose svého profilu (m od začátku osy). */
  arcs: Float64Array;
  /** Úsečky po přihrádkách (klíč `bucketKey`) – úsečka je ve všech, kam sahá. */
  buckets: ReadonlyMap<number, readonly number[]>;
  /** Obdélník, kde se terén může změnit (m) – bez úseček prázdný. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Otisk úprav (profily a hotové délky) – mezipaměti scény a sítí podle něj. */
  key: string;
}

export const NO_TERRAIN_EDITS: TerrainEdits = {
  count: 0,
  segments: new Float64Array(0),
  arcs: new Float64Array(0),
  buckets: new Map(),
  bounds: { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
  key: '',
};

function bucketKey(bi: number, bj: number): number {
  return (bi + 32768) * 65536 + (bj + 32768);
}

/** Otisk kusů osy – počty bodů, konce a hotové délky na cm. */
function spansKey(spans: readonly EarthworkSpan[]): string {
  return spans
    .map((s) => {
      const a = s.profile[0];
      const b = s.profile[s.profile.length - 1];
      return a && b
        ? `${s.profile.length}:${a.x},${a.z},${a.y}:${b.x},${b.z},${b.y}:${Math.round(s.reachedM * 100)}`
        : '';
    })
    .join(';');
}

const editsCache = new Map<string, TerrainEdits>();
const EDITS_CACHE_SIZE = 8;

/** Bod úsečky a–b v podílu `u` (0–1). */
function lerpPoint(a: RoadProfilePoint, b: RoadProfilePoint, u: number): RoadProfilePoint {
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * Úpravy terénu z kusů osy (`spans` – profily vozových cest a kolik je hotové): úsečky profilu
 * do hotové délky (poslední zkrácená), bez úseček u brodu. V mezipaměti podle otisku.
 */
export function terrainEditsFrom(spans: readonly EarthworkSpan[]): TerrainEdits {
  const live = spans.filter((s) => s.profile.length >= 2 && s.reachedM > 0);
  if (live.length === 0) return NO_TERRAIN_EDITS;
  const key = spansKey(live);
  const cached = editsCache.get(key);
  if (cached) return cached;
  const list: number[] = [];
  const arcList: number[] = [];
  for (const span of live) {
    const fords = new Set(span.fords ?? []);
    let along = 0;
    for (let k = 1; k < span.profile.length; k++) {
      const a = span.profile[k - 1]!;
      const b0 = span.profile[k]!;
      const length = length2(b0.x - a.x, b0.z - a.z);
      if (along >= span.reachedM) break;
      const b =
        along + length > span.reachedM && length > 0
          ? lerpPoint(a, b0, (span.reachedM - along) / length)
          : b0;
      along += length;
      if (fords.has(k - 1) || fords.has(k)) continue;
      list.push(a.x, a.z, a.y, b.x, b.z, b.y);
      arcList.push(along - length);
    }
  }
  const count = list.length / 6;
  const segments = new Float64Array(list);
  const buckets = new Map<number, number[]>();
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let s = 0; s < count; s++) {
    const o = s * 6;
    const x0 = Math.min(segments[o]!, segments[o + 3]!) - EARTHWORK_REACH_M;
    const z0 = Math.min(segments[o + 1]!, segments[o + 4]!) - EARTHWORK_REACH_M;
    const x1 = Math.max(segments[o]!, segments[o + 3]!) + EARTHWORK_REACH_M;
    const z1 = Math.max(segments[o + 1]!, segments[o + 4]!) + EARTHWORK_REACH_M;
    minX = Math.min(minX, x0);
    minZ = Math.min(minZ, z0);
    maxX = Math.max(maxX, x1);
    maxZ = Math.max(maxZ, z1);
    for (let bj = Math.floor(z0 / BUCKET_M); bj <= Math.floor(z1 / BUCKET_M); bj++) {
      for (let bi = Math.floor(x0 / BUCKET_M); bi <= Math.floor(x1 / BUCKET_M); bi++) {
        const k = bucketKey(bi, bj);
        const at = buckets.get(k);
        if (at) at.push(s);
        else buckets.set(k, [s]);
      }
    }
  }
  const edits: TerrainEdits =
    count === 0
      ? NO_TERRAIN_EDITS
      : {
          count,
          segments,
          arcs: new Float64Array(arcList),
          buckets,
          bounds: { minX, minZ, maxX, maxZ },
          key,
        };
  if (editsCache.size >= EDITS_CACHE_SIZE) editsCache.delete(editsCache.keys().next().value!);
  editsCache.set(key, edits);
  return edits;
}

/**
 * Hotová délka osy zemních prací (m): hotové úseky a rozestavěný úsek podle průběhu stavby
 * (`construction` – práce stavby jde po úsecích od vsi ven). Bez stavby celá osa.
 */
export function earthworkReachedM(
  earthwork: Pick<RoadEarthwork, 'profile' | 'pieces'>,
  construction?: Pick<Construction, 'done' | 'cost'> | null,
): number {
  const total = profileLength(earthwork.profile);
  if (!construction) return total;
  let left = Math.min(construction.done, construction.cost);
  let from = 0;
  for (const piece of earthwork.pieces) {
    if (piece.builtDay !== null) {
      from = piece.toM;
      left -= piece.manDays;
      continue;
    }
    if (left + 1e-9 >= piece.manDays) {
      left -= piece.manDays;
      from = piece.toM;
      continue;
    }
    const share = piece.manDays > 0 ? Math.max(0, left) / piece.manDays : 0;
    return Math.min(total, from + (piece.toM - from) * share);
  }
  return Math.min(total, from);
}

/** Délka osy profilu (m). */
export function profileLength(profile: readonly { x: number; z: number }[]): number {
  let length = 0;
  for (let k = 1; k < profile.length; k++) {
    length += length2(profile[k]!.x - profile[k - 1]!.x, profile[k]!.z - profile[k - 1]!.z);
  }
  return length;
}

/**
 * Hotová délka osy po celých úsecích (m) – terén sítí pěšin a vozů se mění, až je úsek hotový
 * (je pak cestou); bez stavby celá osa.
 */
export function earthworkBuiltM(
  earthwork: Pick<RoadEarthwork, 'profile' | 'pieces' | 'constructionId'>,
): number {
  if (earthwork.constructionId === undefined) return profileLength(earthwork.profile);
  let built = 0;
  for (const piece of earthwork.pieces) {
    if (piece.builtDay === null) break;
    built = piece.toM;
  }
  return built;
}

/**
 * Kusy osy vsi – zemní práce vozových cest po hotových úsecích (`earthworkBuiltM`): terén sítí
 * pěšin a vozů (úsek je sjízdný, až je hotový – síť se tak nepřepočítává každý den stavby).
 * Rozestavěný úsek podle průběhu ukazuje scéna (`earthworkReachedM`). Bez zemních prací prázdné.
 */
export function earthworkSpansOf(state: {
  roads?: Pick<VillageRoads, 'earthworks'>;
}): EarthworkSpan[] {
  return (state.roads?.earthworks ?? []).map((e) => ({
    profile: e.profile,
    ...(e.fords ? { fords: e.fords } : {}),
    reachedM: earthworkBuiltM(e),
  }));
}

/**
 * Kusy osy vsi i s rozestavěným úsekem podle průběhu stavby (`earthworkReachedM`) – terén scény
 * a čelo práce. Bez zemních prací prázdné.
 */
export function earthworkProgressOf(state: {
  roads?: Pick<VillageRoads, 'earthworks'>;
  constructions: readonly Construction[];
}): EarthworkSpan[] {
  return (state.roads?.earthworks ?? []).map((e) => {
    const c =
      e.constructionId !== undefined
        ? (state.constructions.find((x) => x.id === e.constructionId) ?? null)
        : null;
    return {
      profile: e.profile,
      ...(e.fords ? { fords: e.fords } : {}),
      reachedM: earthworkReachedM(e, c),
    };
  });
}

/** Úpravy terénu vsi (roads.md – Vozová cesta) – čistá funkce stavu (po hotových úsecích). */
export function terrainEditsOf(state: { roads?: Pick<VillageRoads, 'earthworks'> }): TerrainEdits {
  if (!state.roads?.earthworks || state.roads.earthworks.length === 0) return NO_TERRAIN_EDITS;
  return terrainEditsFrom(earthworkSpansOf(state));
}

// pracovní pole pro `editedHeight` (bez alokace na bod)
const candD = new Float64Array(64);
const candY = new Float64Array(64);
const candS = new Int32Array(64);
const candT = new Float64Array(64);

/**
 * Výška terénu po úpravách v bodě (m): `natural` – původní terén v bodě (každý svůj: jádro
 * bilineárně z políček, scéna vyhlazený). Úsečky profilů do EARTHWORK_REACH_M od bodu se
 * uplatní od nejvzdálenější po nejbližší (při shodě v pořadí úseček): na pláni (do flatHalfM
 * od osy) navržená výška, dál svah 1 : 1 – terén nad ním se odkope, pod ním nasype. Nejbližší osa
 * platí poslední, takže pláň každé cesty je přesně v její navržené výšce.
 */
export function editedHeight(
  edits: TerrainEdits,
  x: number,
  z: number,
  natural: number,
  /**
   * Kam zapsat nejbližší bod osy: poloha na ose jeho profilu (m od začátku; bez úseček do
   * EARTHWORK_REACH_M −1) a vzdálenost od osy (m).
   */
  nearest?: { arc: number; d: number },
): number {
  if (nearest) {
    nearest.arc = -1;
    nearest.d = Infinity;
  }
  if (edits.count === 0) return natural;
  const list = edits.buckets.get(bucketKey(Math.floor(x / BUCKET_M), Math.floor(z / BUCKET_M)));
  if (!list) return natural;
  const seg = edits.segments;
  let n = 0;
  for (const s of list) {
    const o = s * 6;
    const ax = seg[o]!;
    const az = seg[o + 1]!;
    const dx = seg[o + 3]! - ax;
    const dz = seg[o + 4]! - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = length2(x - (ax + dx * t), z - (az + dz * t));
    if (d > EARTHWORK_REACH_M || n >= candD.length) continue;
    // vložit podle vzdálenosti sestupně (při shodě podle pořadí úsečky)
    let i = n++;
    while (i > 0 && (candD[i - 1]! < d || (candD[i - 1] === d && candS[i - 1]! > s))) {
      candD[i] = candD[i - 1]!;
      candY[i] = candY[i - 1]!;
      candS[i] = candS[i - 1]!;
      candT[i] = candT[i - 1]!;
      i--;
    }
    candD[i] = d;
    candY[i] = seg[o + 2]! + (seg[o + 5]! - seg[o + 2]!) * t;
    candS[i] = s;
    candT[i] = t;
  }
  if (nearest && n > 0) {
    const s = candS[n - 1]!;
    const o = s * 6;
    const length = length2(seg[o + 3]! - seg[o]!, seg[o + 4]! - seg[o + 1]!);
    nearest.arc = edits.arcs[s]! + length * candT[n - 1]!;
    nearest.d = candD[n - 1]!;
  }
  let h = natural;
  for (let i = 0; i < n; i++) {
    const y = candY[i]!;
    const w = Math.max(0, candD[i]! - WAGON_ROAD.flatHalfM) * WAGON_ROAD.sideSlope;
    if (h > y + w) h = y + w;
    else if (h < y - w) h = y - w;
  }
  return h;
}

/** Původní výška krajiny v bodě (m) – bilineárně mezi středy políček jako terén pěšin. */
export function naturalHeightAt(l: Landscape, x: number, z: number): number {
  const half = (l.size * l.cellSizeM) / 2;
  const u = Math.min(l.size - 1, Math.max(0, (x + half) / l.cellSizeM - 0.5));
  const v = Math.min(l.size - 1, Math.max(0, (z + half) / l.cellSizeM - 0.5));
  const tx = Math.min(l.size - 2, Math.floor(u));
  const ty = Math.min(l.size - 2, Math.floor(v));
  const fx = u - tx;
  const fy = v - ty;
  const h = (i: number, j: number): number => l.heights[j * l.size + i]!;
  const top = h(tx, ty) + (h(tx + 1, ty) - h(tx, ty)) * fx;
  const bottom = h(tx, ty + 1) + (h(tx + 1, ty + 1) - h(tx, ty + 1)) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Výška terénu jádra po úpravách (m) – původní krajina bilineárně (`naturalHeightAt`) a úpravy
 * vozových cest (`editedHeight`). Scéna používá tytéž úpravy na svůj vyhlazený terén.
 */
export function groundHeightAt(edits: TerrainEdits, l: Landscape, x: number, z: number): number {
  return editedHeight(edits, x, z, naturalHeightAt(l, x, z));
}

/** Sklon bodu mřížky (m/m) z výšek okna – středové rozdíly, na okraji okna null. */
function slopeAt(
  heights: Float32Array,
  w: number,
  h: number,
  i: number,
  j: number,
  step: number,
): number | null {
  if (i <= 0 || j <= 0 || i >= w - 1 || j >= h - 1) return null;
  const c = j * w + i;
  const gx = (heights[c + 1]! - heights[c - 1]!) / (2 * step);
  const gz = (heights[c + w]! - heights[c - w]!) / (2 * step);
  return length2(gx, gz);
}

/**
 * Terén pěšin s úpravami terénu (roads.md – Vozová cesta): výšky buněk po úpravách (sklon vozu
 * ve směru jízdy) a cena chůze podle nového sklonu (svah úvozu i náspu 1 : 1 je pro pěší sráz –
 * přes úvoz se chodí po cestě). Bez úprav týž objekt – ves bez vozové cesty bit po bitu beze změny.
 */
export function withTerrainEdits(terrain: PathTerrain, edits: TerrainEdits): PathTerrain {
  if (edits.count === 0 || !terrain.heights) return terrain;
  const { width, height, originX, originZ, cellM } = terrain;
  const b = edits.bounds;
  const i0 = Math.max(0, Math.floor((b.minX - originX) / cellM));
  const j0 = Math.max(0, Math.floor((b.minZ - originZ) / cellM));
  const i1 = Math.min(width - 1, Math.ceil((b.maxX - originX) / cellM));
  const j1 = Math.min(height - 1, Math.ceil((b.maxZ - originZ) / cellM));
  if (i0 > i1 || j0 > j1) return terrain;
  const base = terrain.heights;
  const heights = new Float32Array(base);
  const changed = new Uint8Array(width * height);
  let any = false;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = j * width + i;
      const h = editedHeight(edits, originX + i * cellM, originZ + j * cellM, base[c]!);
      if (Math.abs(h - base[c]!) > CHANGED_M) {
        heights[c] = h;
        changed[c] = 1;
        any = true;
      }
    }
  }
  if (!any) return terrain;
  const cost = new Float32Array(terrain.cost);
  const ref = PATH_SLOPE_REF;
  for (let j = Math.max(1, j0 - 1); j <= Math.min(height - 2, j1 + 1); j++) {
    for (let i = Math.max(1, i0 - 1); i <= Math.min(width - 2, i1 + 1); i++) {
      const c = j * width + i;
      const near =
        changed[c] || changed[c - 1] || changed[c + 1] || changed[c - width] || changed[c + width];
      if (!near) continue;
      const old = cost[c]!;
      if (!Number.isFinite(old) || terrain.flags[c]! & PATH_WATER) continue;
      const before = slopeAt(base, width, height, i, j, cellM);
      const after = slopeAt(heights, width, height, i, j, cellM);
      if (before === null || after === null) continue;
      if (after > PATH_SLOPE_MAX) {
        cost[c] = Infinity;
        continue;
      }
      const forest = terrain.flags[c]! & PATH_FOREST ? PATH_FOREST_COST : 1;
      const sb = before / ref;
      const sa = after / ref;
      cost[c] = old + (sa * sa - sb * sb) * forest;
    }
  }
  return { ...terrain, cost, heights };
}
