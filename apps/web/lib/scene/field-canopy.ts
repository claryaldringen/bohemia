// Porost zrajícího a zralého obilí jako vyvýšená hmota (fields.md – Co hráč vidí; Martin,
// 19. 10. 2026: „Zrající a dozrálé obilí by mělo být také mírně vystouplé – pšenice dvouzrnka má
// nějakou výšku.“) – čisté funkce bez Babylonu. Nad zeleným a zralým dílem leží „koruna“ porostu:
// plocha ve výšce porostu (textura porostu shora jako obtisk), k okraji pole se svažuje a zanoří
// pod zem (jako plocha korun lesa – forest-canopy.ts). Kde porost končí uvnitř pole – čára žně
// na rozpracovaném dílu, sousední zoraný nebo sklizený díl –, spadne svislou stěnou (schod). 3D
// trsy (field-crops.ts) stojí dál a klasy z koruny vyčnívají; z dálky, kde trsy řídnou, nese
// výšku pole koruna.
import {
  FIELD_LOOKS,
  workAt,
  workFrame,
  workSteps,
  type FieldLook,
  type PartView,
} from './field-look';
import { decalPieces, lookStyle, type FieldCrop, type Rgb } from './field-crops';
import { smoothstep, type Bounds } from './village-layout';

/**
 * Výška koruny nad zemí (m) podle vzhledu: dvouzrnka (emmer) dorůstá ≈ 0,9–1,3 m – koruna je
 * hmota stébel a listů pod klasy (klasy 3D trsů – zralé ≈ 1,15 m – nad ni vyčnívají), zelené
 * obilí ještě roste; luštěniny (hrách a čočka – polehlé, ≈ 0,3–0,5 m) jen nízko. Ostatní vzhledy
 * korunu nemají (vzcházející osení, strniště, úhor zůstanou nízké).
 */
export const CANOPY_M: Partial<Record<FieldLook, { grain: number; legume: number; flax: number }>> =
  {
    // len (≈ 0,8–1 m, útlé stonky) – koruna jen nízko (listy u země), stonky trsů z ní vyčnívají
    green: { grain: 0.62, legume: 0.32, flax: 0.32 },
    ripe: { grain: 0.88, legume: 0.28, flax: 0.36 },
  };
/** Pod okrajem pole se koruna zanoří pod zem (m) – průsečík se zemí je hladký. */
const SINK_M = 0.15;
/** Krytí okraje pole (raggedCoverage), mezi kterým koruna vystoupá ze země na plnou výšku. */
const EDGE = { from: 0.2, to: 0.85 } as const;
/** Menší rozdíl výšky (m) stěnu nemá. */
const MIN_STEP_M = 0.03;
/** Stěna je ve stínu – tmavší než koruna shora. */
const WALL_SHADE = 0.72;

/** Síť koruny: body x, z po dvojicích, výška nad zemí, barva (r, g, b) a trojúhelníky. */
export interface CanopyMesh {
  positions: Float32Array;
  offsets: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/** Prázdná koruna. */
export function emptyCanopy(): CanopyMesh {
  return {
    positions: new Float32Array(0),
    offsets: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
  };
}

/** Výška koruny (m) pro vzhled a plodinu; 0 = bez koruny. */
export function canopyHeight(look: FieldLook | null, crop?: FieldCrop): number {
  const h = look ? CANOPY_M[look] : undefined;
  if (!h) return 0;
  if (crop === 'legume') return h.legume;
  return crop === 'flax' ? h.flax : h.grain;
}

/** Vzhledy s korunou (pro klíče a testy). */
export const CANOPY_LOOKS: readonly FieldLook[] = FIELD_LOOKS.filter((l) => canopyHeight(l) > 0);

/** Výška koruny nad zemí v bodě s krytím okraje `c` (u okraje pole zanořená pod zem). */
function profile(height: number, c: number): number {
  return (height + SINK_M) * smoothstep(EDGE.from, EDGE.to, c) - SINK_M;
}

/** Normála trojúhelníku jako v Babylonu (p1 − p2) × (p3 − p2) – jen svislá složka a xz. */
function faceNormal(
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
): [number, number, number] {
  const a = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const b = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

/**
 * Koruna porostu dílů `views` (celé pole nebo jeho blok): nad každým kusem obtisku se zeleným
 * nebo zralým vzhledem (i hotová či nehotová část rozpracovaného dílu) síť po `step` m ve výšce
 * porostu, k okraji pole (krytí `coverage`) zanořená pod zem; po stranách kusu svislá stěna, kde
 * vedle nestojí stejně vysoký porost (čára žně, sousední díl bez porostu). Díly mimo `views` se
 * berou jako bez porostu – na hranici bloku je stěna skrytá uvnitř hmoty sousedního bloku.
 */
export function fieldCanopy(
  views: readonly PartView[],
  rows: readonly [number, number],
  center: { x: number; z: number },
  coverage: (x: number, z: number) => number,
  step: number,
  detail: (bounds: Bounds) => number = () => 1,
): CanopyMesh {
  const positions: number[] = [];
  const offsets: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pieces = decalPieces(views, rows, center).filter(
    (p) => canopyHeight(p.look, p.part.crop) > 0,
  );
  if (pieces.length === 0) return emptyCanopy();
  // výška porostu v bodě – podle dílu (a části rozpracovaného dílu), ve kterém bod leží
  const heightAt = (x: number, z: number): number => {
    for (const view of views) {
      const part = view.part;
      const half = part.size / 2;
      if (Math.abs(x - part.x) > half || Math.abs(z - part.z) > half) continue;
      let look = view.look;
      if (view.work !== null) {
        const w = workAt(workFrame(part, rows, center), part, x, z);
        look = w < workSteps(view.work) ? view.look : view.before;
      }
      const h = canopyHeight(look, part.crop);
      return h > 0 ? profile(h, coverage(x, z)) : 0;
    }
    return 0;
  };
  const vertex = (x: number, z: number, offset: number, tint: Rgb, shade = 1): number => {
    positions.push(x, z);
    offsets.push(offset);
    colors.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
    return offsets.length - 1;
  };
  /** Trojúhelník s normálou ve směru `want` (x, y, z) – pořadí bodů se případně otočí. */
  const triangle = (
    a: number,
    b: number,
    c: number,
    want: readonly [number, number, number],
  ): void => {
    const p = (i: number): [number, number, number] => [
      positions[i * 2]!,
      offsets[i]!,
      positions[i * 2 + 1]!,
    ];
    const n = faceNormal(p(a), p(b), p(c));
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  /**
   * Trojúhelník plochy s normálou nahoru – jako `triangle(…, [0, 1, 0])`, jen bez polí navíc:
   * svislá složka normály závisí jen na x a z (jemná síť u cest má bodů mnohem víc).
   */
  const upward = (a: number, b: number, c: number): void => {
    const ax = positions[a * 2]! - positions[b * 2]!;
    const az = positions[a * 2 + 1]! - positions[b * 2 + 1]!;
    const cx = positions[c * 2]! - positions[b * 2]!;
    const cz = positions[c * 2 + 1]! - positions[b * 2 + 1]!;
    if (az * cx - ax * cz >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  for (const piece of pieces) {
    const h = canopyHeight(piece.look, piece.part.crop);
    const tint = lookStyle(piece.look, piece.part.crop, piece.part.bloom).tint;
    const b: Bounds = piece.bounds;
    // kus, přes který vede cesta, jemněji (`detail` – pás bez obilí užší než krok sítě)
    const pieceStep = step * detail(b);
    const nx = Math.max(1, Math.round((b.maxX - b.minX) / pieceStep));
    const nz = Math.max(1, Math.round((b.maxZ - b.minZ) / pieceStep));
    const sx = (b.maxX - b.minX) / nx;
    const sz = (b.maxZ - b.minZ) / nz;
    const columns = nx + 1;
    const top = new Array<number>((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = b.minX + i * sx;
        const z = b.minZ + j * sz;
        top[j * columns + i] = vertex(x, z, profile(h, coverage(x, z)), tint);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = top[j * columns + i]!;
        const bb = top[j * columns + i + 1]!;
        const c = top[(j + 1) * columns + i]!;
        const d = top[(j + 1) * columns + i + 1]!;
        // celý čtverec sítě pod zemí (za okrajem pole) se nekreslí
        if (Math.max(offsets[a]!, offsets[bb]!, offsets[c]!, offsets[d]!) <= 0) continue;
        upward(a, bb, c);
        upward(bb, d, c);
      }
    }
    // stěny po stranách kusu: dolů k výšce porostu za stranou (bez porostu k zemi)
    const sides: {
      i0: number;
      j0: number;
      di: number;
      dj: number;
      n: number;
      out: [number, number];
    }[] = [
      { i0: 0, j0: 0, di: 1, dj: 0, n: nx, out: [0, -1] },
      { i0: 0, j0: nz, di: 1, dj: 0, n: nx, out: [0, 1] },
      { i0: 0, j0: 0, di: 0, dj: 1, n: nz, out: [-1, 0] },
      { i0: nx, j0: 0, di: 0, dj: 1, n: nz, out: [1, 0] },
    ];
    const probe = Math.min(sx, sz) * 0.25;
    for (const side of sides) {
      const tops: number[] = [];
      const lows: number[] = [];
      for (let k = 0; k <= side.n; k++) {
        const t = top[(side.j0 + side.dj * k) * columns + side.i0 + side.di * k]!;
        const x = positions[t * 2]!;
        const z = positions[t * 2 + 1]!;
        const beyond = heightAt(x + side.out[0] * probe, z + side.out[1] * probe);
        tops.push(t);
        // stěna končí pod obtiskem na zemi (zem bez porostu), nebo na porostu za stranou
        lows.push(Math.min(offsets[t]!, beyond > 0 ? beyond : -0.05));
      }
      for (let k = 0; k < side.n; k++) {
        const t0 = tops[k]!;
        const t1 = tops[k + 1]!;
        if (offsets[t0]! - lows[k]! < MIN_STEP_M && offsets[t1]! - lows[k + 1]! < MIN_STEP_M) {
          continue;
        }
        if (offsets[t0]! <= 0 && offsets[t1]! <= 0) continue;
        const want: [number, number, number] = [side.out[0], 0, side.out[1]];
        const wt0 = vertex(
          positions[t0 * 2]!,
          positions[t0 * 2 + 1]!,
          offsets[t0]!,
          tint,
          WALL_SHADE,
        );
        const wt1 = vertex(
          positions[t1 * 2]!,
          positions[t1 * 2 + 1]!,
          offsets[t1]!,
          tint,
          WALL_SHADE,
        );
        const wb0 = vertex(positions[t0 * 2]!, positions[t0 * 2 + 1]!, lows[k]!, tint, WALL_SHADE);
        const wb1 = vertex(
          positions[t1 * 2]!,
          positions[t1 * 2 + 1]!,
          lows[k + 1]!,
          tint,
          WALL_SHADE,
        );
        triangle(wt0, wb0, wt1, want);
        triangle(wt1, wb0, wb1, want);
      }
    }
  }
  return {
    positions: Float32Array.from(positions),
    offsets: Float32Array.from(offsets),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}

/** Spojí koruny (bloky pole) do jedné sítě. */
export function mergeCanopies(parts: readonly CanopyMesh[]): CanopyMesh {
  const vertices = parts.reduce((sum, p) => sum + p.offsets.length, 0);
  const triangles = parts.reduce((sum, p) => sum + p.indices.length, 0);
  const out: CanopyMesh = {
    positions: new Float32Array(vertices * 2),
    offsets: new Float32Array(vertices),
    colors: new Float32Array(vertices * 3),
    indices: new Uint32Array(triangles),
  };
  let v = 0;
  let k = 0;
  for (const p of parts) {
    out.positions.set(p.positions, v * 2);
    out.offsets.set(p.offsets, v);
    out.colors.set(p.colors, v * 3);
    for (let i = 0; i < p.indices.length; i++) out.indices[k + i] = p.indices[i]! + v;
    v += p.offsets.length;
    k += p.indices.length;
  }
  return out;
}
