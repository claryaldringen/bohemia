// Jáma obydlí bez Babylonu: tvar vyhloubení (obdélník a vstupní šíje se schody), data pro shader,
// který v jámě prořízne terén (pit-cut.ts), a síť stěn, dna a schodů jámy s barvami ve vrcholech
// (ornice nahoře, podloží níž, stín slunce a tma pod střechou). Souřadnice modelu jako
// v `localToWorld`: x napříč, z k vchodu; výšky ve scéně (terén s převýšením, model ve skutečné
// velikosti – jáma 1 m je metr vůči modelu).
import { signedDistance, smoothstep } from './village-layout';
import type { DwellingType, Position } from '@bohemia/game';

export interface PitShape {
  /** Polovina šířky (x) a délky (z) jámy. */
  halfX: number;
  halfZ: number;
  /** Vstupní šíje před vchodem (+z): polovina šířky a kde končí (z). */
  rampHalfX: number;
  rampEndZ: number;
  /** Hloubka jámy hotového obydlí (m). */
  depth: number;
  /** Počet schodů v šíji. */
  steps: number;
  /** Kam (z) sahá střecha předsazená před přední štít – šíje pod ní je ve stínu. */
  roofEndZ: number;
}

/**
 * Jámy podle modelů (tools/blender/dwellings.py): zemnice 1 m s jámou pod celou střechou,
 * polozemnice 0,5 m uvnitř srubu (řez končí kousek uvnitř trámů, ať terén dosedá na stěnu).
 * Šíje je široká jako dveře (0,84 m) – její stěny navazují na tmavé ostění dveří.
 */
export const PIT_SHAPES: Record<DwellingType, PitShape> = {
  // halfZ kousek před štíty – stěna jámy se s omítkou štítu nepere o hloubku
  zemnice: {
    halfX: 1.85,
    halfZ: 1.98,
    rampHalfX: 0.42,
    rampEndZ: 3.7,
    depth: 1.0,
    steps: 4,
    roofEndZ: 3.05,
  },
  polozemnice: {
    halfX: 2.04,
    halfZ: 2.04,
    rampHalfX: 0.42,
    rampEndZ: 3.1,
    depth: 0.5,
    steps: 2,
    roofEndZ: 3.15,
  },
  // dvorec vojvody (trade.md) – srub 4,6 × 8,4 m (DVOREC_O v dwellings.py), šíje 1 m
  dvorec: {
    halfX: 2.24,
    halfZ: 4.14,
    rampHalfX: 0.42,
    rampEndZ: 5.2,
    depth: 0.5,
    steps: 2,
    roofEndZ: 5.25,
  },
};

/** Bod v jámě nebo šíji (souřadnice modelu). */
export function insidePit(shape: PitShape, lx: number, lz: number): boolean {
  const ax = Math.abs(lx);
  return (
    (ax < shape.halfX && Math.abs(lz) < shape.halfZ) ||
    (ax < shape.rampHalfX && lz > 0 && lz < shape.rampEndZ)
  );
}

/** Obvod jámy se šíjí v souřadnicích modelu (po obvodu), volitelně rozšířený o `margin`. */
export function pitOutline(shape: PitShape, margin = 0): [number, number][] {
  const hx = shape.halfX + margin;
  const hz = shape.halfZ + margin;
  const rx = shape.rampHalfX + margin;
  const re = shape.rampEndZ + margin;
  return [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [rx, hz],
    [rx, re],
    [-rx, re],
    [-rx, hz],
    [-hx, hz],
  ];
}

/** Bod světa → souřadnice modelu (obrácené `localToWorld`). */
export function worldToLocal(position: Position, x: number, z: number): [number, number] {
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  const dx = x - position.x;
  const dz = z - position.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Směr v souřadnicích modelu → svět (bez posunu). */
function directionToWorld(position: Position, lx: number, lz: number): [number, number] {
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  return [lx * c + lz * s, -lx * s + lz * c];
}

export interface PitCut {
  position: Position;
  shape: PitShape;
}

/** Kolik jam umí shader terénu prořezat najednou (pole uniform – dvě vec4 na jámu). */
export const MAX_PIT_CUTS = 64;
/** Čísel na jámu v `packPitCuts` (dvě vec4). */
export const PIT_CUT_FLOATS = 8;

export interface PackedPitCuts {
  /** Na jámu: x, z, cos r, sin r, halfX, halfZ, rampHalfX, rampEndZ. */
  data: Float32Array;
  count: number;
  /** Obdélník všech jam (minX, minZ, maxX, maxZ) – shader mimo něj nic nepočítá. */
  bounds: [number, number, number, number];
}

/** Data pro shader (pit-cut.ts): jámy navíc nad MAX_PIT_CUTS se vynechají. */
export function packPitCuts(cuts: readonly PitCut[]): PackedPitCuts {
  const data = new Float32Array(MAX_PIT_CUTS * PIT_CUT_FLOATS);
  const count = Math.min(cuts.length, MAX_PIT_CUTS);
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const { position, shape } = cuts[i]!;
    data.set(
      [
        position.x,
        position.z,
        Math.cos(position.rotation),
        Math.sin(position.rotation),
        shape.halfX,
        shape.halfZ,
        shape.rampHalfX,
        shape.rampEndZ,
      ],
      i * PIT_CUT_FLOATS,
    );
    const reach = Math.hypot(Math.max(shape.halfX, shape.rampHalfX), shape.rampEndZ);
    bounds[0] = Math.min(bounds[0], position.x - reach);
    bounds[1] = Math.min(bounds[1], position.z - reach);
    bounds[2] = Math.max(bounds[2], position.x + reach);
    bounds[3] = Math.max(bounds[3], position.z + reach);
  }
  if (count === 0) bounds.splice(0, 4, 0, 0, 0, 0);
  return { data, count, bounds };
}

/** Stejný test jako shader (pit-cut.ts) – bod světa v některé jámě. */
export function insidePackedCut(packed: PackedPitCuts, x: number, z: number): boolean {
  for (let i = 0; i < packed.count; i++) {
    const d = packed.data.subarray(i * PIT_CUT_FLOATS, (i + 1) * PIT_CUT_FLOATS);
    const dx = x - d[0]!;
    const dz = z - d[1]!;
    const lx = dx * d[2]! - dz * d[3]!;
    const lz = dx * d[3]! + dz * d[2]!;
    const ax = Math.abs(lx);
    if ((ax < d[4]! && Math.abs(lz) < d[5]!) || (ax < d[6]! && lz > 0 && lz < d[7]!)) return true;
  }
  return false;
}

// --- Síť jámy ---

export type HeightFn = (x: number, z: number) => number;

export interface PitMeshOptions {
  /** Současná hloubka jámy (m) – roste během kopání. */
  depth: number;
  /** Pata modelu obydlí (výška scény) – dno jámy je o `depth` níž. */
  base: number;
  /** Výška vykresleného terénu – horní hrana stěn na ní přesně dosedá. */
  rim: HeightFn;
  /** Jak moc jámu kryje střecha 0–1 – vnitřek pod ní tmavne. */
  roofCover: number;
  /** Čerstvě vykopaná (staveniště): světlé podloží; jinak udusaná tmavší hlína. */
  fresh: boolean;
  /** Směr slunečních paprsků (SUN_DIRECTION) – stín okraje jámy na dně a stěnách. */
  sun: { x: number; y: number; z: number };
}

export interface PitMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** Výška dna jámy. */
  floorY: number;
}

/** Hrana stěn nad terénem (m) – zakryje škvíry mezi řezem terénu a stěnou. */
const RIM_LIFT_M = 0.03;
/** Délka opakování textury hlíny na stěnách a dně (m). */
const UV_REPEAT_M = 2.5;
/** Nejdelší úsek stěny (m) – horní hrana sleduje terén. */
const WALL_STEP_M = 0.35;
const FLOOR_STEP_M = 0.3;
/** Ornice (tmavá) nahoře, pod ní podloží. */
const TOPSOIL_M = 0.22;
const COLORS = {
  topsoil: [0.5, 0.38, 0.28],
  subsoilFresh: [1.0, 0.8, 0.56],
  subsoilOld: [0.9, 0.74, 0.56],
  floorFresh: [0.92, 0.74, 0.52],
  floorOld: [0.84, 0.68, 0.52],
} as const satisfies Record<string, readonly [number, number, number]>;

type Vec3 = [number, number, number];

/**
 * Síť jámy: dno (rovné), stěny po obvodu jámy a šíje (horní hrana na terénu), schody šíje
 * (stupně od dna k ústí). Barvy ve vrcholech: ornice a podloží podle hloubky pod okrajem,
 * stín okraje od slunce (paprsek k slunci musí vyjít z jámy nad terénem), méně oblohy u dna
 * a tma pod střechou.
 */
export function pitMeshData(
  shape: PitShape,
  position: Position,
  options: PitMeshOptions,
): PitMeshData {
  const { rim } = options;
  const world = (lx: number, lz: number): [number, number] => {
    const c = Math.cos(position.rotation);
    const s = Math.sin(position.rotation);
    return [position.x + lx * c + lz * s, position.z - lx * s + lz * c];
  };
  const { halfX: hx, halfZ: hz, rampHalfX: rx, rampEndZ: re } = shape;
  const outline = pitOutline(shape);
  let minRim = Infinity;
  let maxRim = -Infinity;
  for (let k = 0; k < outline.length; k++) {
    const [ax, az] = outline[k]!;
    const [bx, bz] = outline[(k + 1) % outline.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / WALL_STEP_M));
    for (let i = 0; i < n; i++) {
      const [x, z] = world(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
      const h = rim(x, z);
      minRim = Math.min(minRim, h);
      maxRim = Math.max(maxRim, h);
    }
  }
  // Dno je vodorovné: o hloubku pod patou modelu, na svahu nejvýš těsně pod nejnižším okrajem
  // (jinak by na spodní straně vyčnívalo nad terén).
  const floorY = Math.min(options.base - options.depth, minRim - 0.03);
  const [mx, mz] = world(0, re);
  const mouthY = Math.max(floorY, rim(mx, mz));
  const steps = Math.max(1, shape.steps);
  const tread = (re - hz) / steps;
  const treadY = (i: number): number => floorY + ((mouthY - floorY) * i) / steps;

  const sunLength = Math.hypot(options.sun.x, options.sun.y, options.sun.z);
  const toSun: Vec3 = [
    -options.sun.x / sunLength,
    -options.sun.y / sunLength,
    -options.sun.z / sunLength,
  ];
  const sunHorizontal = Math.hypot(toSun[0], toSun[2]);
  const sunRise = toSun[1] / Math.max(sunHorizontal, 1e-6);

  /** 0 = ve stínu okraje jámy, 1 = na slunci. */
  const sunlit = (x: number, y: number, z: number): number => {
    const ux = toSun[0] / Math.max(sunHorizontal, 1e-6);
    const uz = toSun[2] / Math.max(sunHorizontal, 1e-6);
    for (let t = 0.05; t < 8; t += 0.08) {
      const px = x + ux * t;
      const pz = z + uz * t;
      const height = y + sunRise * t;
      if (height > maxRim + 0.1) return 1;
      const [lx, lz] = worldToLocal(position, px, pz);
      if (!insidePit(shape, lx, lz)) return smoothstep(-0.08, 0.08, height - rim(px, pz));
    }
    return 1;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (
    x: number,
    y: number,
    z: number,
    n: Vec3,
    uv: [number, number],
    color: Vec3,
  ): number => {
    positions.push(x, y, z);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[0], uv[1]);
    colors.push(color[0], color[1], color[2], 1);
    return positions.length / 3 - 1;
  };

  /** Trojúhelník přední stranou ke směru `n` (Babylon: (b−a)×(c−a) míří od pozorovatele). */
  const triangle = (a: number, b: number, c: number, n: Vec3): void => {
    const p = (i: number): Vec3 => [
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!,
    ];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cross: Vec3 = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    if (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };

  // pod střechou tma (jámu kryje celou); šíji pod přesahem přistíní stínová mapa střechy
  const roofFactor = (lz: number): number =>
    1 - options.roofCover * (lz <= hz ? 0.82 : lz < shape.roofEndZ ? 0.1 : 0);

  /**
   * Barva bodu: hlína podle hloubky pod okrajem, stín okraje, méně oblohy u dna, tma pod
   * střechou. Osvětlení materiálu (slunce · normála) se přidá až ve scéně – tady jen ubere
   * podíl slunce ve stínu.
   */
  const shade = (x: number, y: number, z: number, n: Vec3): Vec3 => {
    const below = Math.max(0, rim(x, z) - y);
    const [, lz] = worldToLocal(position, x, z);
    const deep = smoothstep(TOPSOIL_M * 0.6, TOPSOIL_M * 1.4, below);
    const floor = n[1] > 0.5;
    const sub = floor
      ? options.fresh
        ? COLORS.floorFresh
        : COLORS.floorOld
      : options.fresh
        ? COLORS.subsoilFresh
        : COLORS.subsoilOld;
    const top = COLORS.topsoil;
    const lit = sunlit(x + n[0] * 0.03, y + 0.02, z + n[2] * 0.03);
    const facing = Math.max(0, n[0] * toSun[0] + n[1] * toSun[1] + n[2] * toSun[2]);
    const sunShare = (0.55 + 1.05 * facing * (0.15 + 0.85 * lit)) / (0.55 + 1.05 * facing);
    // u dna méně oblohy, v koutech u stěn ještě méně
    const sky = 1 - 0.3 * smoothstep(0, 1.1, below);
    const [lx] = worldToLocal(position, x, z);
    const corner =
      floor && lz <= hz
        ? 1 -
          0.3 *
            (1 - smoothstep(0, 0.7, signedDistance(outline, lx, lz))) *
            smoothstep(0.05, 0.5, below)
        : 1;
    const k = sunShare * sky * corner * roofFactor(lz);
    return [
      (top[0] + (sub[0] - top[0]) * deep) * k,
      (top[1] + (sub[1] - top[1]) * deep) * k,
      (top[2] + (sub[2] - top[2]) * deep) * k,
    ];
  };

  const up: Vec3 = [0, 1, 0];
  /** Vodorovná plocha v souřadnicích modelu (dno, stupeň) jako síť po `FLOOR_STEP_M`. */
  const horizontal = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    tread = false,
  ): void => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / FLOOR_STEP_M));
    const nz = Math.max(1, Math.max(tread ? 2 : 1, Math.ceil((z1 - z0) / FLOOR_STEP_M)));
    const first = positions.length / 3;
    for (let j = 0; j <= nz; j++) {
      // stupeň: světlejší hrana nad nižším stupněm, u paty vyššího stupně tmavší
      const edge = tread ? 1.14 - 0.36 * (j / nz) : 1;
      for (let i = 0; i <= nx; i++) {
        const [x, z] = world(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
        const [r, g, b] = shade(x, y, z, up);
        vertex(x, y, z, up, [x / UV_REPEAT_M, z / UV_REPEAT_M], [r * edge, g * edge, b * edge]);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = first + j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        triangle(a, b, c, up);
        triangle(b, d, c, up);
      }
    }
  };

  /**
   * Svislá stěna z bodu a do b (souřadnice modelu) od `bottom` po terén (nebo po `top`), normála
   * dovnitř jámy (u čela schodu `facing` – k nižšímu stupni). Řady vrcholů i na rozhraní ornice
   * a podloží.
   */
  const wall = (
    a: [number, number],
    b: [number, number],
    bottom: number,
    alongStart: number,
    fixed?: { top: number; facing: [number, number] },
  ): void => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) return;
    let nl: [number, number];
    if (fixed) nl = fixed.facing;
    else {
      // kolmice k hraně, která míří k bodu uvnitř jámy
      const tx = (b[0] - a[0]) / length;
      const tz = (b[1] - a[1]) / length;
      nl = [-tz, tx];
      const mid: [number, number] = [
        (a[0] + b[0]) / 2 + nl[0] * 0.05,
        (a[1] + b[1]) / 2 + nl[1] * 0.05,
      ];
      if (!insidePit(shape, mid[0], mid[1])) nl = [tz, -tx];
    }
    const [nwx, nwz] = directionToWorld(position, nl[0], nl[1]);
    const n: Vec3 = [nwx, 0, nwz];
    const segments = Math.max(1, Math.ceil(length / WALL_STEP_M));
    const columns: number[][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const [x, z] = world(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      const top = fixed ? fixed.top : rim(x, z) + RIM_LIFT_M;
      // horní řady po ornici a pod ní, zbytek až ke dnu
      const heights = [top, top - TOPSOIL_M, top - 2 * TOPSOIL_M, bottom].map((y) =>
        Math.max(Math.min(y, top), Math.min(bottom, top)),
      );
      const u = (alongStart + length * t) / UV_REPEAT_M;
      columns.push(
        heights.map((y) => vertex(x, y, z, n, [u, (y - floorY) / UV_REPEAT_M], shade(x, y, z, n))),
      );
    }
    for (let i = 0; i < segments; i++) {
      for (let r = 0; r < 3; r++) {
        const a0 = columns[i]![r]!;
        const a1 = columns[i]![r + 1]!;
        const b0 = columns[i + 1]![r]!;
        const b1 = columns[i + 1]![r + 1]!;
        triangle(a0, b0, a1, n);
        triangle(b0, b1, a1, n);
      }
    }
  };

  // dno a stěny jámy (přední stěna má mezeru na šíji)
  horizontal(-hx, hx, -hz, hz, floorY);
  let along = 0;
  const bodyWalls: [[number, number], [number, number]][] = [
    [
      [-hx, -hz],
      [hx, -hz],
    ],
    [
      [hx, -hz],
      [hx, hz],
    ],
    [
      [hx, hz],
      [rx, hz],
    ],
    [
      [-rx, hz],
      [-hx, hz],
    ],
    [
      [-hx, hz],
      [-hx, -hz],
    ],
  ];
  for (const [a, b] of bodyWalls) {
    wall(a, b, floorY, along);
    along += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  // šíje: stupně od dna k ústí, čela stupňů a boční stěny po stupních
  for (let i = 0; i < steps; i++) {
    const z0 = hz + i * tread;
    const z1 = hz + (i + 1) * tread;
    const y = treadY(i);
    horizontal(-rx, rx, z0, z1, y, true);
    if (i > 0) wall([rx, z0], [-rx, z0], treadY(i - 1), along, { top: y, facing: [0, -1] });
    wall([rx, z0], [rx, z1], y, along + z0);
    wall([-rx, z1], [-rx, z0], y, along + z0 + 7);
  }
  // čelo nejvyššího stupně v ústí šíje
  wall([-rx, re], [rx, re], treadY(steps - 1), along + 13);

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    floorY,
  };
}

// --- Hromada vykopané hlíny ---

export interface SpoilHeapOptions {
  seed: number;
  /** Střed paty ve světě a natočení (rx podél natočené osy x). */
  x: number;
  z: number;
  rotation: number;
  rx: number;
  rz: number;
  height: number;
  /** Výška terénu – pata hromady na něm leží i na svahu. */
  ground: HeightFn;
}

export interface SpoilHeapData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/** Hroudy a kamínky textury bahna jsou na hromadě menší než na stěnách jámy. */
const HEAP_UV_REPEAT_M = 1.3;
const HEAP_RINGS = 9;
const HEAP_SEGMENTS = 28;

/**
 * Hromada hlíny z jámy: nepravidelná kupa položená na terén. Dole tmavší ornice (kopala se
 * první), nahoře světlé podloží jako na stěnách jámy; normály dopočítá scéna.
 */
export function spoilHeapData(o: SpoilHeapOptions): SpoilHeapData {
  const phase = [o.seed * 1.7, o.seed * 2.9, o.seed * 4.3, o.seed * 0.7];
  const c = Math.cos(o.rotation);
  const s = Math.sin(o.rotation);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i <= HEAP_RINGS; i++) {
    const rho = 1 - i / HEAP_RINGS; // 1 = pata, 0 = vrchol
    const count = i === HEAP_RINGS ? 1 : HEAP_SEGMENTS;
    for (let j = 0; j < count; j++) {
      const theta = (2 * Math.PI * j) / HEAP_SEGMENTS;
      const wobble =
        1 + 0.12 * Math.sin(3 * theta + phase[0]!) + 0.07 * Math.sin(5 * theta + phase[1]!);
      const lx = o.rx * wobble * rho * Math.cos(theta);
      const lz = o.rz * wobble * rho * Math.sin(theta);
      const x = o.x + lx * c + lz * s;
      const z = o.z - lx * s + lz * c;
      // hroudy a nerovný hřbet – kupa z rýčů hlíny, ne hladký kopeček
      const lumps =
        0.16 * Math.sin(5 * theta + phase[2]! + 6 * rho) * Math.sin(9 * rho + phase[3]!) +
        0.1 * Math.sin(11 * theta + phase[0]! * 2 + 13 * rho) * Math.sin(7 * theta - 5 * rho);
      const lift =
        o.height *
        Math.pow(1 - rho * rho, 0.6) *
        (1 + 0.15 * Math.sin(2 * theta + phase[2]!) * rho + lumps * (1 - rho * 0.4));
      positions.push(x, o.ground(x, z) + (i === 0 ? -0.04 : lift), z);
      uvs.push(x / HEAP_UV_REPEAT_M, (z + lift) / HEAP_UV_REPEAT_M);
      const t = smoothstep(0.05, 0.45, lift / Math.max(o.height, 1e-6));
      const grain =
        0.9 + 0.14 * Math.sin(7 * theta + phase[3]! + 9 * rho) * Math.sin(3 * theta + 5 * rho);
      // nahoře vyschlé podloží (světlejší, méně syté), dole ornice
      const top = [0.92, 0.84, 0.72] as const;
      const bottom = [0.62, 0.54, 0.46] as const;
      colors.push(
        (bottom[0] + (top[0] - bottom[0]) * t) * grain,
        (bottom[1] + (top[1] - bottom[1]) * t) * grain,
        (bottom[2] + (top[2] - bottom[2]) * t) * grain,
        1,
      );
    }
  }
  const indices: number[] = [];
  const ring = (i: number, j: number): number => i * HEAP_SEGMENTS + (j % HEAP_SEGMENTS);
  for (let i = 0; i < HEAP_RINGS - 1; i++) {
    for (let j = 0; j < HEAP_SEGMENTS; j++) {
      // přední strana ven (Babylon: (b−a)×(c−a) míří od pozorovatele, jako terén)
      indices.push(ring(i, j), ring(i, j + 1), ring(i + 1, j));
      indices.push(ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j));
    }
  }
  const apex = HEAP_RINGS * HEAP_SEGMENTS;
  for (let j = 0; j < HEAP_SEGMENTS; j++) {
    indices.push(ring(HEAP_RINGS - 1, j), ring(HEAP_RINGS - 1, j + 1), apex);
  }
  return {
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}
